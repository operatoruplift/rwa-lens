import type { Metadata, Viewport } from 'next';
import { MobileSupport } from '@/components/app/mobile-support';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted (SIL OFL) so the app has no third-party font request, builds offline, and stays installable.
const inter = localFont({ src: './fonts/Inter-latin.woff2', variable: '--font-inter', weight: '100 900', display: 'swap', fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://rwalensonsolana.vercel.app'),
  alternates: { canonical: '/' },
  title: 'RWA Lens — real assets, clearer vision',
  description: 'Inspect Solana tokens, reconcile raw and displayed balances, and understand on-chain controls. Public, read-only inspection for real-world assets.',
  openGraph: { title: 'RWA Lens — real assets, clearer vision', description: 'Identity. Balance. Controls. One clear view of a Solana token.', type: 'website', siteName: 'RWA Lens', images: [{ url: '/brand/social-card.png', width: 1200, height: 630, alt: 'RWA Lens — Real assets. Clearer vision.' }] },
  twitter: { card: 'summary_large_image', title: 'RWA Lens — real assets, clearer vision', images: ['/brand/social-card.png'] },
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  appleWebApp: { capable: true, title: 'RWA Lens', statusBarStyle: 'default' },
  applicationName: 'RWA Lens',
};

export const viewport: Viewport = { themeColor: '#101a3a', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return <html lang="en" className={`${inter.variable} h-full antialiased`}><body>{children}<MobileSupport /></body></html>;
}
