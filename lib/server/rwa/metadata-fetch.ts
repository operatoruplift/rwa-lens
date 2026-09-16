import 'server-only';
import { isHostAllowed, metadataBodySchema, metadataUriSchema, parseAllowedHosts } from '@/lib/rwa/schema';

/**
 * Token metadata URIs come from the mint, which means they come from whoever
 * controls the mint. They are untrusted input pointed at our server, so this
 * fetcher is deny-by-default: with no configured allowlist, nothing is ever
 * fetched. The core inspection never depends on it.
 */

export type MetadataOutcome =
  | { state: 'ok'; body: Record<string, unknown>; fetchedAt: string; bytes: number }
  | { state: 'skipped'; reason: string }
  | { state: 'blocked'; reason: string }
  | { state: 'failed'; reason: string }
  | { state: 'not-configured'; reason: string };

const TIMEOUT_MS = 5000;
const MAX_BYTES = 128 * 1024;
const ALLOWED_TYPES = ['application/json', 'text/json', 'text/plain'];

type CacheEntry = { at: number; outcome: MetadataOutcome };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

export function allowedMetadataHosts(): string[] {
  return parseAllowedHosts(process.env.RWA_METADATA_ALLOWED_HOSTS);
}

export async function fetchMetadata(uri: string): Promise<MetadataOutcome> {
  const allowed = allowedMetadataHosts();
  if (allowed.length === 0) {
    return {
      state: 'not-configured',
      reason: 'No metadata host is allowlisted, so no URI is fetched. Inspection does not depend on it.',
    };
  }

  const parsed = metadataUriSchema.safeParse(uri);
  if (!parsed.success) {
    return { state: 'blocked', reason: parsed.error.issues[0]?.message ?? 'The metadata URI was rejected.' };
  }
  if (!isHostAllowed(parsed.data, allowed)) {
    return { state: 'blocked', reason: 'That metadata host is not on the configured allowlist.' };
  }

  const cached = cache.get(parsed.data);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.outcome;

  const outcome = await load(parsed.data);
  if (cache.size > MAX_CACHE_ENTRIES) cache.clear();
  cache.set(parsed.data, { at: Date.now(), outcome });
  return outcome;
}

async function load(uri: string): Promise<MetadataOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(uri, {
      signal: controller.signal,
      // A redirect can leave the allowlist, so follow none and say so.
      redirect: 'error',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return { state: 'failed', reason: `The metadata host returned ${response.status}.` };

    const type = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(type)) {
      return { state: 'blocked', reason: `Unexpected content type "${type || 'unknown'}". Only JSON is accepted.` };
    }

    const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isInteger(declared) && declared > MAX_BYTES) {
      return { state: 'blocked', reason: 'The metadata document is larger than the 128 KB limit.' };
    }

    const text = await readBounded(response);
    if (text === null) return { state: 'blocked', reason: 'The metadata document exceeded the 128 KB limit while reading.' };

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { state: 'failed', reason: 'The metadata document was not valid JSON.' };
    }

    const body = metadataBodySchema.safeParse(json);
    if (!body.success) return { state: 'failed', reason: 'The metadata document did not match the expected shape.' };

    return { state: 'ok', body: body.data as Record<string, unknown>, fetchedAt: new Date().toISOString(), bytes: text.length };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    // Never surface the URI, host or underlying error text to the client.
    return { state: 'failed', reason: aborted ? 'The metadata host did not respond in time.' : 'The metadata host could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Reads at most MAX_BYTES so a host cannot stream an unbounded body at us. */
async function readBounded(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
