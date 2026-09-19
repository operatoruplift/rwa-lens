import 'server-only';
import { createSolanaRpcFromTransport, address as toAddress, type RpcTransport, type RpcResponse, type Rpc, type SolanaRpcApi } from '@solana/kit';
import { parseJsonWithBigInts, stringifyJsonWithBigInts } from '@solana/rpc-spec-types';
import { getSysvarClockDecoder, SYSVAR_CLOCK_ADDRESS } from '@solana/sysvars';
import type { Cluster, Commitment, ProvenanceSource } from '@/lib/rwa/types';

export type RpcFailureKind = 'invalid-address' | 'not-found' | 'not-a-mint' | 'rate-limited' | 'provider-failure' | 'decoder-failure' | 'not-configured' | 'timeout' | 'response-too-large';
export class RpcError extends Error {
  constructor(readonly kind: RpcFailureKind, message: string) { super(message); this.name = 'RpcError'; }
}
export type RpcConfig = { cluster: Cluster; url: string; timeoutMs: number; maxAccounts: number; commitment: Commitment; provider: string; maxResponseBytes?: number };
function positiveInt(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}
export function resolveRpcConfig(cluster: Cluster): RpcConfig {
  const configured = (process.env.RWA_CLUSTER ?? 'devnet').trim();
  const url = (process.env.RWA_RPC_URL ?? '').trim();
  if (!url) throw new RpcError('not-configured', 'No RPC URL is configured. Fixture mode remains available.');
  if (!['devnet', 'mainnet-beta'].includes(configured) || configured !== cluster) throw new RpcError('not-configured', 'The requested network is not configured on this deployment. Fixture mode remains available.');
  let provider: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error();
    provider = parsed.hostname;
  } catch { throw new RpcError('not-configured', 'The configured RPC URL is not valid.'); }
  return { cluster, url, provider, commitment: 'confirmed', timeoutMs: positiveInt(process.env.RWA_RPC_TIMEOUT_MS, 8000, 30000), maxAccounts: positiveInt(process.env.RWA_RPC_MAX_ACCOUNTS, 100, 1000), maxResponseBytes: 2 * 1024 * 1024 };
}

export function translate(error: unknown, label: string): RpcError {
  if (error instanceof RpcError) return error;
  if (/429|rate.?limit|too many requests/i.test(error instanceof Error ? error.message : '')) return new RpcError('rate-limited', `${label} was rate limited by the provider.`);
  return new RpcError('provider-failure', `${label} failed at the RPC provider.`);
}

/** Abort includes body streaming. The entire read, including its one retry, has one deadline. */
export function createBoundedTransport(config: RpcConfig): RpcTransport {
  return async <TResponse>({ payload, signal }: Parameters<RpcTransport>[0]): Promise<RpcResponse<TResponse>> => {
    const method = (payload as { method?: string }).method ?? '';
    if (!['getAccountInfo', 'getTokenAccountsByOwner', 'getBlockTime'].includes(method)) throw new RpcError('provider-failure', 'Unsupported RPC method.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, config.timeoutMs);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(config.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: stringifyJsonWithBigInts(payload), signal: controller.signal, redirect: 'error', cache: 'no-store' });
          if (!response.ok) {
            await response.body?.cancel();
            throw new RpcError(response.status === 429 ? 'rate-limited' : 'provider-failure', `${method} could not be completed by the provider.`);
          }
          const maxBytes = config.maxResponseBytes ?? 2 * 1024 * 1024;
          if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
            await response.body?.cancel();
            throw new RpcError('response-too-large', 'The provider response exceeded the safe transport limit.');
          }
          if (!response.body) throw new RpcError('provider-failure', 'The provider returned an empty response.');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let body = ''; let bytes = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > maxBytes) { await reader.cancel(); throw new RpcError('response-too-large', 'The provider response exceeded the safe transport limit.'); }
              body += decoder.decode(chunk.value, { stream: true });
            }
            body += decoder.decode();
          } finally { reader.releaseLock(); }
          const decoded = parseJsonWithBigInts(body) as RpcResponse<TResponse>;
          const failure = (decoded as { error?: { code?: bigint; message?: string } }).error;
          if (failure) throw new RpcError(failure.code === 429n || /rate.?limit/i.test(failure.message ?? '') ? 'rate-limited' : 'provider-failure', `${method} was rejected by the provider.`);
          return decoded;
        } catch (error) {
          if (controller.signal.aborted) throw new RpcError('timeout', `${method} exceeded its read deadline.`);
          const translated = translate(error, method);
          if (attempt === 1 || !['provider-failure', 'rate-limited'].includes(translated.kind)) throw translated;
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => { clearTimeout(backoff); reject(new RpcError('timeout', `${method} exceeded its read deadline.`)); };
            const backoff = setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve(); }, 150);
            controller.signal.addEventListener('abort', onAbort, { once: true });
          });
        }
      }
      throw new RpcError('provider-failure', 'Read retry budget exhausted.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
export type RpcClient = Rpc<SolanaRpcApi>;
export function createClient(config: RpcConfig): RpcClient { return createSolanaRpcFromTransport(createBoundedTransport(config)); }
function validatedAddress(value: string) {
  try { return toAddress(value); } catch { throw new RpcError('invalid-address', 'That is not a valid Solana address.'); }
}
export async function readAccount(client: RpcClient, config: RpcConfig, addressValue: string, minContextSlot?: bigint) {
  try {
    const response = await client.getAccountInfo(validatedAddress(addressValue), { commitment: config.commitment, encoding: 'base64', minContextSlot }).send();
    if (!response.value) throw new RpcError('not-found', 'No account exists at that address on this cluster.');
    return { ...response.value, slot: response.context.slot };
  } catch (error) { throw translate(error, 'getAccountInfo'); }
}
export type ChainTime = { slot: bigint; clockSlot?: bigint; observedSeconds: bigint; blockTime: bigint | null; timeSource: 'chain' | 'block-time-estimate' | 'local-estimate'; sources: ProvenanceSource[] };
export async function readChainTime(client: RpcClient, config: RpcConfig, mintSlot: bigint): Promise<ChainTime> {
  const sources: ProvenanceSource[] = [];
  try {
    const account = await readAccount(client, config, SYSVAR_CLOCK_ADDRESS, mintSlot);
    const bytes = Buffer.from(account.data[0], 'base64');
    if (String(account.owner) !== 'Sysvar1111111111111111111111111111111111111' || account.executable || bytes.length !== getSysvarClockDecoder().fixedSize) throw new RpcError('decoder-failure', 'Invalid Clock sysvar account.');
    const clock = getSysvarClockDecoder().decode(bytes);
    sources.push({ label: 'Clock sysvar', method: 'getAccountInfo(Clock)', status: 'ok', slot: account.slot.toString(), commitment: config.commitment, detail: `unixTimestamp ${clock.unixTimestamp}; Clock.slot ${clock.slot}` });
    return { slot: mintSlot, clockSlot: account.slot, observedSeconds: clock.unixTimestamp, blockTime: null, timeSource: 'chain', sources };
  } catch (error) { sources.push({ label: 'Clock sysvar', method: 'getAccountInfo(Clock)', status: 'failed', detail: translate(error, 'Clock').kind }); }
  try {
    const blockTime = await client.getBlockTime(mintSlot).send();
    if (blockTime !== null) {
      sources.push({ label: 'Mint slot block time estimate', method: 'getBlockTime', status: 'ok', slot: mintSlot.toString(), blockTime: new Date(Number(blockTime) * 1000).toISOString() });
      return { slot: mintSlot, blockTime, observedSeconds: blockTime, timeSource: 'block-time-estimate', sources };
    }
  } catch { /* Missing block time remains explicit and never prevents mint inspection. */ }
  sources.push({ label: 'Mint slot block time', method: 'getBlockTime', status: 'failed', slot: mintSlot.toString(), detail: 'Time unavailable; local estimate used.' });
  return { slot: mintSlot, blockTime: null, observedSeconds: BigInt(Math.floor(Date.now() / 1000)), timeSource: 'local-estimate', sources };
}
export type OwnerAccountsResult = { accounts: Array<{ pubkey: string; data: string; owner: string; executable?: boolean }>; complete: boolean; limit: number; slot: bigint };
/** The RPC mint filter selects either token program. Each returned program is validated before aggregation. */
export async function readOwnerTokenAccounts(client: RpcClient, config: RpcConfig, owner: string, mint: string, _programAddress: string, minContextSlot?: bigint): Promise<OwnerAccountsResult> {
  try {
    const response = await client.getTokenAccountsByOwner(validatedAddress(owner), { mint: validatedAddress(mint) }, { commitment: config.commitment, encoding: 'base64', minContextSlot }).send();
    return { accounts: response.value.slice(0, config.maxAccounts).map(entry => ({ pubkey: String(entry.pubkey), data: entry.account.data[0], owner: String(entry.account.owner), executable: entry.account.executable })), complete: response.value.length <= config.maxAccounts, limit: config.maxAccounts, slot: response.context.slot };
  } catch (error) { throw translate(error, 'getTokenAccountsByOwner'); }
}
