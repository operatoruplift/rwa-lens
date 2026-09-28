import 'server-only';

/** Offline fixtures require an explicit devnet setup and are never served in Vercel production. */
export function fixturesEnabled(): boolean {
  return process.env.RWA_FIXTURES_ENABLED === 'true'
    && process.env.RWA_CLUSTER === 'devnet'
    && process.env.VERCEL_ENV !== 'production';
}

/** The optional wallet-signed deploy action. Mainnet only, and off unless the operator opts in. */
export function deployEnabled(): boolean {
  return process.env.RWA_DEPLOY_ENABLED === 'true' && (process.env.RWA_CLUSTER ?? 'mainnet-beta').trim() === 'mainnet-beta';
}

const DEFAULT_PRIORITY_MICROLAMPORTS = 100_000n;
const MAX_PRIORITY_MICROLAMPORTS = 5_000_000n;
/** Compute-unit price for deploy transactions, in micro-lamports. */
export function deployPriorityMicroLamports(): bigint {
  const raw = (process.env.RWA_DEPLOY_PRIORITY_MICROLAMPORTS ?? '').trim();
  if (!/^\d{1,9}$/.test(raw)) return DEFAULT_PRIORITY_MICROLAMPORTS;
  const value = BigInt(raw);
  return value > MAX_PRIORITY_MICROLAMPORTS ? MAX_PRIORITY_MICROLAMPORTS : value;
}
