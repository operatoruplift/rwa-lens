import { LensExperience } from '@/components/landing/lens-experience';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'RWA Lens — Real assets. Clearer vision.',
  description: 'See the token behind the asset. Inspect Solana token identity, balances, authorities and evidence. Public inspection, no wallet connection required.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <LensExperience />;
}
