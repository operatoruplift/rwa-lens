'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import bs58 from 'bs58';
import { connectAccount, discoverWallets, type Wallet, type WalletAccount } from '@/lib/client/wallet-standard';
import { deployResponseSchema, deployStatusSchema, preparedFeePayer, QUOTE_TTL_MS, type DeployResponse, type SlippageBps } from '@/lib/rwa/deploy';

export type ReadyDeploy = Extract<DeployResponse, { state: 'ready' }>;
export type DeployPhase =
  | { kind: 'wallet' }
  | { kind: 'connecting'; walletName: string }
  | { kind: 'form' }
  | { kind: 'quoting' }
  | { kind: 'review'; ready: ReadyDeploy; receivedAt: number }
  | { kind: 'signing'; ready: ReadyDeploy }
  | { kind: 'confirming'; ready: ReadyDeploy; signature: string }
  | { kind: 'confirmed'; ready: ReadyDeploy; signature: string }
  | { kind: 'finalized'; ready: ReadyDeploy; signature: string }
  | { kind: 'unconfirmed'; ready: ReadyDeploy; signature: string; confirmed: boolean; message: string }
  | { kind: 'failed'; message: string; back: 'wallet' | 'form'; signature?: string };

const SEND_FEATURE = 'solana:signAndSendTransaction';
const CHAIN = 'solana:mainnet';
const POLL_MS = 2000;
const CONFIRMATION_TIMEOUT_MS = 3 * 60_000;
const STATUS_REQUEST_TIMEOUT_MS = 10_000;
type SendFeature = {
  supportedTransactionVersions?: readonly (string | number)[];
  signAndSendTransaction: (...inputs: { account: WalletAccount; chain: string; transaction: Uint8Array; options?: { preflightCommitment?: string } }[]) => Promise<readonly { signature: Uint8Array }[]>;
};
const sendFeature = (wallet: Wallet) => wallet.features[SEND_FEATURE] as SendFeature | undefined;
/** Wallets that can sign and send a v0 transaction themselves. */
export const deployWallets = () => discoverWallets(['standard:connect', SEND_FEATURE]).filter(wallet => sendFeature(wallet)?.supportedTransactionVersions?.includes(0));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const decode64 = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));

/**
 * The deploy state machine: connect a wallet, quote and simulate on the
 * server, review, sign in the wallet, then confirm on chain. Every failure
 * lands in one state that says what happened and where to go back to.
 */
export function useYieldDeployer({ mint, pool }: { mint: string; pool: string }) {
  const [phase, setPhase] = useState<DeployPhase>({ kind: 'wallet' });
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [connected, setConnected] = useState<{ wallet: Wallet; account: WalletAccount } | null>(null);
  const alive = useRef(true);
  // Set synchronously, so a second click in the same frame cannot open a second wallet prompt.
  const sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const update = useCallback((next: DeployPhase) => { if (alive.current) setPhase(next); }, []);

  const refreshWallets = useCallback(() => setWallets(deployWallets()), []);

  const connect = useCallback(async (wallet: Wallet) => {
    update({ kind: 'connecting', walletName: wallet.name });
    try {
      const account = await connectAccount(wallet, SEND_FEATURE, CHAIN);
      if (!account) return update({ kind: 'failed', message: `${wallet.name} did not offer a Solana mainnet account that can send transactions.`, back: 'wallet' });
      setConnected({ wallet, account });
      update({ kind: 'form' });
    } catch { update({ kind: 'failed', message: 'The wallet connection was cancelled or failed. Nothing was requested.', back: 'wallet' }); }
  }, [update]);

  const preview = useCallback(async (amount: string, slippageBps: SlippageBps) => {
    if (!connected) return update({ kind: 'wallet' });
    update({ kind: 'quoting' });
    let body: DeployResponse;
    try {
      const response = await fetch('/api/rwa/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint, pool, owner: connected.account.address, amount, slippageBps }) });
      const parsed = deployResponseSchema.safeParse(await response.json());
      body = parsed.success ? parsed.data : { state: 'unavailable', message: 'The deploy preview came back in an unexpected shape.' };
    } catch { body = { state: 'unavailable', message: 'The deploy preview could not be reached. Check your connection.' }; }
    if (body.state !== 'ready') return update({ kind: 'failed', message: body.message, back: 'form' });
    if (preparedFeePayer(body.transaction) !== connected.account.address || body.summary.owner !== connected.account.address) {
      return update({ kind: 'failed', message: 'The prepared transaction does not match the connected wallet. Nothing was signed.', back: 'form' });
    }
    update({ kind: 'review', ready: body, receivedAt: Date.now() });
  }, [connected, mint, pool, update]);

  const confirm = useCallback(async (ready: ReadyDeploy, signature: string, confirmed = false) => {
    const query = new URLSearchParams({ signature, lastValidBlockHeight: ready.lastValidBlockHeight });
    const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
    update({ kind: confirmed ? 'confirmed' : 'confirming', ready, signature });
    while (alive.current && Date.now() < deadline) {
      await wait(Math.min(POLL_MS, deadline - Date.now()));
      if (!alive.current || Date.now() >= deadline) break;
      try {
        const parsed = deployStatusSchema.safeParse(await (await fetch(`/api/rwa/deploy/status?${query}`, {
          cache: 'no-store', signal: AbortSignal.timeout(Math.min(STATUS_REQUEST_TIMEOUT_MS, deadline - Date.now())),
        })).json());
        if (!parsed.success) continue;
        const status = parsed.data;
        if (status.state === 'finalized') return update({ kind: 'finalized', ready, signature });
        if (status.state === 'confirmed') { confirmed = true; update({ kind: 'confirmed', ready, signature }); continue; }
        if (status.state === 'failed') return update({ kind: 'failed', message: status.message, back: 'form', signature });
        if (status.state === 'expired') return update({ kind: 'unconfirmed', ready, signature, confirmed, message: confirmed
          ? 'This transaction was confirmed, but finality is not currently available from the RPC provider. Recheck it or view the transaction before making another deposit.'
          : 'The transaction’s validity window ended, but this RPC has not found confirmation. Check the transaction on Solscan before building another preview.' });
      } catch { /* a missed poll retries; the deadline below still applies */ }
    }
    update({ kind: 'unconfirmed', ready, signature, confirmed, message: confirmed
      ? 'The transaction is confirmed; finality has not yet been observed. Recheck this transaction or view it on Solscan before making another deposit.'
      : 'Finality was not observed within three minutes. Recheck this transaction or view it on Solscan before making another deposit.' });
  }, [update]);

  const sign = useCallback(async () => {
    if (phase.kind !== 'review' || !connected || sending.current) return;
    if (Date.now() - phase.receivedAt > QUOTE_TTL_MS) return update({ kind: 'failed', message: 'The preview expired. Build a new one so the prices are current.', back: 'form' });
    const feature = sendFeature(connected.wallet);
    if (!feature) return update({ kind: 'failed', message: 'This wallet can no longer send transactions. Reconnect and try again.', back: 'wallet' });
    const { ready } = phase;
    sending.current = true;
    try {
      update({ kind: 'signing', ready });
      let signature: string;
      try {
        const [sent] = await feature.signAndSendTransaction({ account: connected.account, chain: CHAIN, transaction: decode64(ready.transaction), options: { preflightCommitment: 'confirmed' } });
        if (!sent || sent.signature.length !== 64) throw new Error('no signature');
        signature = bs58.encode(sent.signature);
      } catch {
        return update({ kind: 'failed', message: 'The wallet returned without sending. If you declined, nothing moved; otherwise check the wallet’s activity before trying again.', back: 'form' });
      }
      await confirm(ready, signature);
    } finally { sending.current = false; }
  }, [confirm, connected, phase, update]);

  const recheck = useCallback(async () => {
    if (phase.kind !== 'unconfirmed' || sending.current) return;
    sending.current = true;
    try { await confirm(phase.ready, phase.signature, phase.confirmed); }
    finally { sending.current = false; }
  }, [confirm, phase]);

  const back = useCallback(() => update(connected ? { kind: 'form' } : { kind: 'wallet' }), [connected, update]);
  const changeWallet = useCallback(() => { setConnected(null); refreshWallets(); update({ kind: 'wallet' }); }, [refreshWallets, update]);

  return { phase, wallets, connected, refreshWallets, connect, preview, sign, recheck, back, changeWallet };
}
