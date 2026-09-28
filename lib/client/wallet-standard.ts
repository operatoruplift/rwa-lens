/**
 * Wallet Standard discovery without an adapter library: the app-ready /
 * register-wallet exchange, then a filter by the features a caller needs.
 * Browser only; call from event handlers or effects.
 */
export type WalletAccount = { address: string; features?: readonly string[]; chains?: readonly string[] };
export type Wallet = { name: string; icon?: string; accounts: readonly WalletAccount[]; features: Record<string, unknown> };

const registered = new Set<Wallet>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  const api = Object.freeze({ register: (...wallets: Wallet[]) => { wallets.forEach(wallet => registered.add(wallet)); return () => wallets.forEach(wallet => registered.delete(wallet)); } });
  window.addEventListener('wallet-standard:register-wallet', event => { const callback = (event as CustomEvent<(value: typeof api) => void>).detail; if (typeof callback === 'function') callback(api); });
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
}

export function discoverWallets(requiredFeatures: readonly string[]): Wallet[] {
  listen();
  return [...registered].filter(wallet => requiredFeatures.every(feature => feature in wallet.features));
}

type ConnectFeature = { connect: () => Promise<{ accounts: readonly WalletAccount[] }> };
/** Connects and returns the first account on a Solana chain that offers the needed feature. */
export async function connectAccount(wallet: Wallet, feature: string, chain = 'solana:'): Promise<WalletAccount | null> {
  const connected = await (wallet.features['standard:connect'] as ConnectFeature).connect();
  return connected.accounts.find(account => account.features?.includes(feature) && account.chains?.some(candidate => candidate.startsWith(chain))) ?? null;
}
