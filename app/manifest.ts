import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'RWA Lens — real assets, clearer vision',
    short_name: 'RWA Lens',
    description: 'Inspect a Solana Token-2022 mint, reconcile raw and displayed balances, and understand on-chain controls. Public, read-only.',
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
      { name: 'See the demo', url: '/demo', description: 'Walk through a synthetic observation.' },
    ],
  };
}
