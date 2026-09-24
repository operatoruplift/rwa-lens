import 'server-only';

/** Offline fixtures require an explicit devnet setup and are never served in Vercel production. */
export function fixturesEnabled(): boolean {
  return process.env.RWA_FIXTURES_ENABLED === 'true'
    && process.env.RWA_CLUSTER === 'devnet'
    && process.env.VERCEL_ENV !== 'production';
}
