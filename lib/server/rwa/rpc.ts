import 'server-only';
import { createSolanaRpc, address as toAddress } from '@solana/kit';
import type { Cluster, Commitment } from '@/lib/rwa/types';

/**
 * Server-only Solana read plane.
 *
 * The RPC URL is operator configuration and is never accepted from a browser.
 * Every read is bounded: one timeout, one retry budget, one account cap, and a
 * structured failure kind so the UI can stay honest instead of guessing.
 */

export type RpcFailureKind =
  | 'invalid-address'
  | 'not-found'
  | 'rate-limited'
  | 'provider-failure'
  | 'decoder-failure'
  | 'not-configured'
  | 'timeout';

export class RpcError extends Error {
  constructor(
    readonly kind: RpcFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_ACCOUNTS = 100;

export type RpcConfig = {
  cluster: Cluster;
  url: string;
  timeoutMs: number;
  maxAccounts: number;
  commitment: Commitment;
  provider: string;
};

function positiveInt(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * Resolves configuration for the requested cluster. A cluster the operator has
 * not configured is `not-configured`, never a silent fallback to another one —
 * quietly answering about devnet when the user asked about mainnet would be a
 * correctness bug disguised as resilience.
 */
export function resolveRpcConfig(cluster: Cluster): RpcConfig {
  const configured = (process.env.RWA_CLUSTER ?? 'devnet').trim();
  const url = (process.env.RWA_RPC_URL ?? '').trim();

  if (!url) {
    throw new RpcError('not-configured', 'No RPC URL is configured. Fixture mode remains available.');
  }
  if (configured !== cluster) {
    throw new RpcError(
      'not-configured',
      `This deployment is configured for ${configured}. It will not read ${cluster} without an explicit configuration change.`,
    );
  }

  let provider = 'configured-rpc';
  try {
    provider = new URL(url).hostname;
  } catch {
    throw new RpcError('not-configured', 'The configured RPC URL is not a valid URL.');
  }

  return {
    cluster,
    url,
    timeoutMs: positiveInt(process.env.RWA_RPC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30_000),
    maxAccounts: positiveInt(process.env.RWA_RPC_MAX_ACCOUNTS, DEFAULT_MAX_ACCOUNTS, 1000),
    commitment: 'confirmed',
    provider,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new RpcError('timeout', `${label} did not respond within ${timeoutMs}ms.`)),
      timeoutMs,
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(translate(error, label));
      },
    );
  });
}

function translate(error: unknown, label: string): RpcError {
  if (error instanceof RpcError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate.?limit|too many requests/i.test(message)) {
    return new RpcError('rate-limited', `${label} was rate limited by the provider.`);
  }
  // Never leak a provider URL, key or stack into a client-visible message.
  return new RpcError('provider-failure', `${label} failed at the RPC provider.`);
}

export type RpcClient = ReturnType<typeof createSolanaRpc>;

export function createClient(config: RpcConfig): RpcClient {
  return createSolanaRpc(config.url);
}

export type ChainTime = { slot: bigint; blockTime: bigint | null };

/** Observed chain time. Time-sensitive extensions are evaluated against this. */
export async function readChainTime(client: RpcClient, config: RpcConfig): Promise<ChainTime> {
  const slot = await withTimeout(
    client.getSlot({ commitment: config.commitment }).send(),
    config.timeoutMs,
    'getSlot',
  );
  try {
    const blockTime = await withTimeout(client.getBlockTime(slot).send(), config.timeoutMs, 'getBlockTime');
    return { slot, blockTime: blockTime === null ? null : BigInt(blockTime) };
  } catch {
    // A missing block time degrades to a local estimate with a visible warning;
    // it must not fail the whole inspection.
    return { slot, blockTime: null };
  }
}

export async function readAccount(client: RpcClient, config: RpcConfig, addressValue: string) {
  let parsed;
  try {
    parsed = toAddress(addressValue);
  } catch {
    throw new RpcError('invalid-address', 'That is not a valid Solana address.');
  }
  const response = await withTimeout(
    client.getAccountInfo(parsed, { commitment: config.commitment, encoding: 'base64' }).send(),
    config.timeoutMs,
    'getAccountInfo',
  );
  if (!response.value) throw new RpcError('not-found', 'No account exists at that address on this cluster.');
  return response.value;
}

export type OwnerAccountsResult = {
  accounts: Array<{ pubkey: string; data: string; owner: string }>;
  complete: boolean;
  limit: number;
};

/**
 * Token accounts for one owner and mint. Bounded by `maxAccounts`; when the cap
 * is reached the result is explicitly incomplete rather than a total presented
 * as if it were whole.
 */
export async function readOwnerTokenAccounts(
  client: RpcClient,
  config: RpcConfig,
  owner: string,
  mint: string,
  programAddress: string,
): Promise<OwnerAccountsResult> {
  let ownerAddress, mintAddress, program;
  try {
    ownerAddress = toAddress(owner);
    mintAddress = toAddress(mint);
    program = toAddress(programAddress);
  } catch {
    throw new RpcError('invalid-address', 'That is not a valid Solana address.');
  }

  const response = await withTimeout(
    client
      .getTokenAccountsByOwner(
        ownerAddress,
        { mint: mintAddress, programId: program },
        { commitment: config.commitment, encoding: 'base64' },
      )
      .send(),
    config.timeoutMs,
    'getTokenAccountsByOwner',
  );

  const all = response.value ?? [];
  const limited = all.slice(0, config.maxAccounts);
  return {
    accounts: limited.map(entry => ({
      pubkey: String(entry.pubkey),
      data: entry.account.data[0],
      owner: String(entry.account.owner),
    })),
    complete: all.length <= config.maxAccounts,
    limit: config.maxAccounts,
  };
}
