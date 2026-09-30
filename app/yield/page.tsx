import { WorkspaceShell } from '@/components/app/workspace-shell';
import { YieldScreener } from '@/components/rwa/yield-screener';
import { deployEnabled } from '@/lib/server/rwa/config';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Yield opportunities — RWA Lens',
  description: 'Meteora DLMM pools that hold tokenized assets such as Ondo USDY and xStocks, with TVL, volume, fees and the issuer’s market status. Third-party market data, not advice.',
  alternates: { canonical: '/yield' },
};

export default function YieldPage() {
  return (
    <WorkspaceShell active="yield" title="Yield opportunities" description="Explore tokenized-asset liquidity on Meteora. Compare pool activity, inspect the underlying token, and follow the source.">
      <YieldScreener deployEnabled={deployEnabled()} />
    </WorkspaceShell>
  );
}
