import { LensExperience } from '@/components/landing/lens-experience';
import { addressSchema } from '@/lib/rwa/schema';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Token inspector — RWA Lens',
  description: 'Inspect Solana mint identity, raw and displayed balances, Token-2022 extensions, authorities and evidence. Public inspection needs no wallet.',
  alternates: { canonical: '/rwa' },
};

/** `/rwa?mint=<address>` opens the inspector on that mint; anything else falls back to the default example. */
export default async function RwaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { mint } = await searchParams;
  const requested = addressSchema.safeParse(typeof mint === 'string' ? mint : '');
  return <LensExperience compact initialMint={requested.success ? requested.data : undefined} />;
}
