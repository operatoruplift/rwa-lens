'use client';

import { useEffect } from 'react';

// Installs the service worker for offline-safe static assets and registers the
// Solana Mobile Wallet Adapter as a Wallet Standard wallet. The existing wallet
// dialog in report-actions.tsx discovers it through the standard app-ready /
// register-wallet exchange, so Seed Vault Wallet, Phantom and Solflare appear
// as sign-in choices on Android and Seeker without any change to that flow.
//
// Nothing here runs on iOS, desktop or inside in-wallet browsers: the adapter
// only registers itself in a secure context on a device with local association.
let registered = false;

export function MobileSupport() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }
    if (registered) return;
    registered = true;
    import('@solana-mobile/wallet-standard-mobile')
      .then((mwa) => {
        mwa.registerMwa({
          appIdentity: { name: 'RWA Lens', uri: window.location.origin, icon: 'icons/icon-192.png' },
          authorizationCache: mwa.createDefaultAuthorizationCache(),
          chains: ['solana:mainnet'],
          chainSelector: mwa.createDefaultChainSelector(),
          onWalletNotFound: mwa.createDefaultWalletNotFoundHandler(),
        });
      })
      .catch(() => { registered = false; });
  }, []);
  return null;
}
