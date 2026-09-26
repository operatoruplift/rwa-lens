import 'server-only';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import { isHostAllowed, metadataBodySchema, metadataUriSchema, parseAllowedHosts } from '@/lib/rwa/schema';

export type MetadataOutcome =
  | { state: 'ok'; body: Record<string, unknown>; fetchedAt: string; bytes: number; cacheAgeMs?: number }
  | { state: 'skipped' | 'blocked' | 'failed' | 'not-configured'; reason: string };
/** The host decision for a declared URI, reached without any network read. */
export type MetadataUriPolicy =
  | { state: 'skipped'; uri: string; reason: string }
  | { state: 'blocked' | 'not-configured'; reason: string };
const TIMEOUT_MS = 5000;
const MAX_BYTES = 128 * 1024;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blocked.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');

/** Conservative global-address check, including mapped IPv4 and special-use IPv6. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}
export function allowedMetadataHosts(): string[] { return parseAllowedHosts(process.env.RWA_METADATA_ALLOWED_HOSTS); }

/**
 * Single source of truth for the fetch policy. It depends only on the declared URI
 * and the deployment allowlist, so an inspection can state the outcome up front and
 * a fetch request reaches the network only when the host is already permitted.
 */
export function metadataUriPolicy(uri: string, allowed: string[] = allowedMetadataHosts()): MetadataUriPolicy {
  if (!allowed.length) return { state: 'not-configured', reason: 'No metadata host is allowlisted. Inspection does not depend on metadata retrieval.' };
  const parsed = metadataUriSchema.safeParse(uri);
  if (!parsed.success || !isHostAllowed(parsed.data, allowed)) return { state: 'blocked', reason: 'The metadata URI is not permitted by the HTTPS host policy.' };
  return { state: 'skipped', uri: parsed.data, reason: 'This host is allowlisted. The document is requested only when it is asked for.' };
}

type Address = { address: string; family: number };
type Dependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  request: typeof httpsRequest;
};
const defaults: Dependencies = { resolve: hostname => lookup(hostname, { all: true, verbatim: true }), request: httpsRequest };

/** The HTTPS connection uses the approved DNS result, preserving TLS hostname verification.
 * A second resolver call cannot rebind the host to a private address. No redirect is followed. */
async function load(uri: string, deps: Dependencies, schema: z.ZodType<Record<string, unknown>> = metadataBodySchema): Promise<MetadataOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = new URL(uri);
    const addresses = await Promise.race([
      deps.resolve(url.hostname),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })),
    ]);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return { state: 'blocked', reason: 'The metadata host resolved to a non-public network address.' };
    const pinned = addresses[0];
    return await new Promise<MetadataOutcome>(resolve => {
      let settled = false;
      const finish = (outcome: MetadataOutcome) => { if (!settled) { settled = true; resolve(outcome); } };
      const req = deps.request(url, {
        method: 'GET', signal: controller.signal, headers: { accept: 'application/json' },
        // Disabling pooling also prevents reuse of a connection made under an older policy.
        agent: false, servername: url.hostname,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
          else callback(null, pinned.address, pinned.family);
        },
      }, response => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          response.destroy(); finish({ state: 'failed', reason: 'The metadata host returned an error or redirect.' }); return;
        }
        const type = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
        if (type !== 'application/json' && type !== 'text/json') {
          response.destroy(); finish({ state: 'blocked', reason: 'Only a JSON content type is accepted.' }); return;
        }
        const length = Number(response.headers['content-length']);
        if (Number.isFinite(length) && length > MAX_BYTES) {
          response.destroy(); finish({ state: 'blocked', reason: 'The metadata document exceeds 128 KB.' }); return;
        }
        let total = 0; const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BYTES) { response.destroy(); finish({ state: 'blocked', reason: 'The metadata document exceeds 128 KB.' }); }
          else chunks.push(Buffer.from(chunk));
        });
        response.on('error', () => finish({ state: 'failed', reason: 'The metadata document could not be read.' }));
        response.on('aborted', () => finish({ state: 'failed', reason: 'The metadata document was interrupted.' }));
        response.on('end', () => {
          try {
            const body = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            finish(body.success ? { state: 'ok', body: body.data, fetchedAt: new Date().toISOString(), bytes: total } : { state: 'failed', reason: 'The metadata document did not match the expected shape.' });
          } catch { finish({ state: 'failed', reason: 'The metadata document was not valid JSON.' }); }
        });
      });
      req.on('error', () => finish({ state: 'failed', reason: controller.signal.aborted ? 'The metadata host did not respond in time.' : 'The metadata host could not be reached.' }));
      req.end();
    });
  } catch { return { state: 'failed', reason: controller.signal.aborted ? 'The metadata host did not respond in time.' : 'The metadata host could not be reached.' }; }
  finally { clearTimeout(timer); }
}

/** Injectable transport is only an internal test seam, never browser input. */
export function createMetadataFetcher(deps: Dependencies = defaults) {
  const cache = new Map<string, { at: number; outcome: MetadataOutcome }>();
  return async (uri: string): Promise<MetadataOutcome> => {
    const policy = metadataUriPolicy(uri);
    if (policy.state !== 'skipped') return { state: policy.state, reason: policy.reason };
    const cached = cache.get(policy.uri);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.outcome.state === 'ok' ? { ...cached.outcome, cacheAgeMs: Date.now() - cached.at } : cached.outcome;
    const outcome = await load(policy.uri, deps);
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(policy.uri, { at: Date.now(), outcome });
    return outcome;
  };
}
export const fetchMetadata = createMetadataFetcher();

/** Optional registry adapters use the same DNS-pinned, bounded HTTPS policy. */
export async function fetchAllowedJson(uri: string, allowed: string[], schema: z.ZodType<Record<string, unknown>>): Promise<MetadataOutcome> {
  const parsed = metadataUriSchema.safeParse(uri);
  if (!parsed.success || !isHostAllowed(parsed.data, allowed)) return { state: 'blocked', reason: 'The HTTPS host policy rejected this URI.' };
  return load(parsed.data, defaults, schema);
}
