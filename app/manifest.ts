import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'RWA Lens — real assets, clearer vision',
    short_name: 'RWA Lens',
    description: 'Inspect Solana tokens, reconcile raw and displayed balances, understand on-chain controls, and explore liquidity pools.',
    start_url: '/rwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f7fb',
    theme_color: '#101a3a',
    lang: 'en',
    categories: ['finance', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Inspect a token', url: '/rwa', description: 'Open the mint inspector.' },
      { name: 'See the demo', url: '/demo', description: 'Walk through a live mainnet inspection.' },
    ],
  };
}
