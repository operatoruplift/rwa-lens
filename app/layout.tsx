import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://rwalensonsolana.vercel.app'),
  alternates: { canonical: '/' },
  title: 'RWA Lens — know what your real-world token means',
  description: 'Inspect Solana tokens, reconcile raw and displayed balances, and understand on-chain controls. Public, read-only inspection for real-world assets.',
  openGraph: { title: 'RWA Lens — the token behind the asset', description: 'Identity. Balance. Controls. One clear view of a Solana token.', type: 'website', siteName: 'RWA Lens', images: [{ url: '/brand/social-card.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: 'RWA Lens — the token behind the asset', images: ['/brand/social-card.png'] },
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return <html lang="en" className={`${inter.variable} h-full antialiased`}><body>{children}</body></html>;
}
