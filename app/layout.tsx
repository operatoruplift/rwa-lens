import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'RWA Lens — know what your real-world token means',
  description:
    'Inspect a Solana Token-2022 mint: what the token is, what a holder balance really means right now, and which on-chain controls affect whether it can move. Read-only.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-navy">{children}</body>
    </html>
  );
}
