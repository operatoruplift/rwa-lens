import Link from 'next/link';
import { LEGAL_LINKS } from '@/lib/legal';

/** Privacy and Terms, for every footer. Each footer styles links through its own selectors. */
export function LegalLinks() {
  return <>{LEGAL_LINKS.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</>;
}
