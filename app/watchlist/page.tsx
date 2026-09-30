import { WorkspaceShell } from '@/components/app/workspace-shell';
import { WatchlistView } from '@/components/app/watchlist';

export const metadata = {
  title: 'Watchlist — RWA Lens',
  description: 'Keep public Solana mint addresses close at hand. Your watchlist is saved on this device.',
  alternates: { canonical: '/watchlist' },
};

export default function WatchlistPage() {
  return <WorkspaceShell active="watchlist" title="Your watchlist" description="A small collection. A closer view. Save the tokens you want to return to and open a fresh inspection whenever you need it."><WatchlistView /></WorkspaceShell>;
}
