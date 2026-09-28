import { ResourceShell } from '@/components/resources/resource-shell';
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
    <ResourceShell active="yield" eyebrow="YIELD / THIRD-PARTY MARKET DATA" title="Where tokenized assets earn fees." description="Every Meteora DLMM pool with at least $100 in liquidity that holds Ondo USDY or an xStock. Inspect a token before you use it; the figures below describe pools, not the assets’ backing.">
      <YieldScreener deployEnabled={deployEnabled()} />
    </ResourceShell>
  );
}
