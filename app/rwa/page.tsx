import { LensExperience } from '@/components/landing/lens-experience';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Token inspector — RWA Lens',
  description: 'Inspect Solana mint identity, raw and displayed balances, Token-2022 extensions, authorities and evidence. Public inspection needs no wallet.',
  alternates: { canonical: '/rwa' },
};

export default function RwaPage() {
  return <LensExperience compact />;
}
