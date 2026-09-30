import { WorkspaceShell } from '@/components/app/workspace-shell';
import { RwaLensShell } from '@/components/rwa/rwa-lens-shell';
import { addressSchema } from '@/lib/rwa/schema';
import { repositoryState } from '@/lib/server/rwa/repository';
import { sessionsConfigured } from '@/lib/server/rwa/session';
import { deployEnabled, fixturesEnabled } from '@/lib/server/rwa/config';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Token inspector — RWA Lens',
  description: 'Inspect Solana mint identity, raw and displayed balances, Token-2022 extensions, authorities and evidence. Public inspection needs no wallet.',
  alternates: { canonical: '/rwa' },
};

/** A validated mint deep link also resets form state when navigating between assets. */
export default async function RwaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { mint } = await searchParams;
  const requested = addressSchema.safeParse(typeof mint === 'string' ? mint : '');
  const initialMint = requested.success ? requested.data : undefined;
  const cluster = process.env.RWA_CLUSTER === 'devnet' ? 'devnet' : 'mainnet-beta';
  return <WorkspaceShell active="inspector" title="Token inspector" description="Look beyond the ticker. Explore a token’s identity, balances, controls, and the evidence behind them." cluster={cluster}>
    <RwaLensShell key={`${cluster}:${initialMint ?? 'default'}`} workspace cluster={cluster} initialMint={initialMint} reportsEnabled={repositoryState() === 'ready' && sessionsConfigured()} fixturesEnabled={fixturesEnabled()} deployEnabled={deployEnabled()} />
  </WorkspaceShell>;
}
