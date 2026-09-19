'use client';

import { useRef, useState } from 'react';
import bs58 from 'bs58';
import { ArrowDownToLine, LockKeyhole, X } from 'lucide-react';
import { z } from 'zod';
import { inspectResultSchema, addressSchema, reportIdSchema } from '@/lib/rwa/schema';
import type { InspectRequest } from '@/lib/rwa/types';
import { Callout } from './primitives';

type WalletAccount = { address: string; features?: readonly string[]; chains?: readonly string[] };
type Wallet = { name: string; accounts: readonly WalletAccount[]; features: Record<string, unknown> };
type Phase = 'idle' | 'connecting' | 'signing' | 'saving' | 'listing';
const registeredWallets = new Set<Wallet>();
let discoveryReady = false;
// Wallet Standard's app-ready / register-wallet exchange. Only message signing is requested.
function wallets(): Wallet[] {
  if (!discoveryReady) {
    discoveryReady = true;
    const api = Object.freeze({ register: (...newWallets: Wallet[]) => { newWallets.forEach(wallet => registeredWallets.add(wallet)); return () => newWallets.forEach(wallet => registeredWallets.delete(wallet)); } });
    window.addEventListener('wallet-standard:register-wallet', event => { const callback = (event as CustomEvent<(value: typeof api) => void>).detail; if (typeof callback === 'function') callback(api); });
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  }
  return [...registeredWallets].filter(wallet => 'solana:signMessage' in wallet.features && 'standard:connect' in wallet.features);
}
const reportSchema = z.object({ id: reportIdSchema, mint: z.string(), createdAt: z.string(), mode: z.string(), contentHash: z.string() }).passthrough();
type SavedReport = z.infer<typeof reportSchema>;
async function responseBody(response: Response) { return await response.json().catch(() => ({})) as Record<string, unknown>; }
function messageFrom(body: Record<string, unknown>, fallback: string) { return typeof body.message === 'string' ? body.message : fallback; }

export function ReportActions({ request }: { request: InspectRequest }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [choices, setChoices] = useState<Wallet[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const busy = phase !== 'idle';
  const openSignIn = () => { setChoices(wallets()); dialog.current?.showModal(); };

  async function save() {
    setMessage(null); setPhase('saving');
    try {
      const response = await fetch('/api/rwa/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request }) });
      if (response.status === 401) { openSignIn(); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(messageFrom(body, 'The report could not be saved. Export locally or try again.'));
      setSignedIn(true); setMessage('Saved to your account. The server reproduced this observation; a live read may have a newer timestamp.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Report storage is unavailable. Export locally or try again.'); }
    finally { setPhase('idle'); }
  }

  async function signIn(wallet: Wallet) {
    setMessage(null); setPhase('connecting');
    try {
      const connect = wallet.features['standard:connect'] as { connect: () => Promise<{ accounts: readonly WalletAccount[] }> };
      const connected = await connect.connect();
      const account = connected.accounts.find(candidate => candidate.features?.includes('solana:signMessage') && candidate.chains?.some(chain => chain.startsWith('solana:'))) ?? connected.accounts[0];
      if (!account || !addressSchema.safeParse(account.address).success) throw new Error('No supported Solana account was returned. Try another wallet.');
      const response = await fetch('/api/rwa/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'challenge', address: account.address }) });
      const challengeBody = await responseBody(response);
      if (!response.ok) throw new Error(messageFrom(challengeBody, 'Sign-in is unavailable. Try again later.'));
      const challenge = z.object({ nonce: z.string().min(1), message: z.string().min(1) }).parse(challengeBody);
      setPhase('signing');
      const feature = wallet.features['solana:signMessage'] as { signMessage: (input: { account: WalletAccount; message: Uint8Array }) => Promise<Array<{ signature: Uint8Array }>> };
      const [signed] = await feature.signMessage({ account, message: new TextEncoder().encode(challenge.message) });
      if (!signed || signed.signature.length !== 64) throw new Error('The wallet did not return a valid message signature.');
      const verified = await fetch('/api/rwa/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'verify', address: account.address, nonce: challenge.nonce, signature: bs58.encode(signed.signature) }) });
      const verifiedBody = await responseBody(verified);
      if (!verified.ok) throw new Error(messageFrom(verifiedBody, 'The message could not be verified. Try again.'));
      setSignedIn(true); dialog.current?.close();
      await save();
    } catch { setMessage('Sign-in was cancelled or could not be verified. No report was saved. Try again, or use local export.'); }
    finally { setPhase('idle'); }
  }

  async function list() {
    setMessage(null); setPhase('listing');
    try {
      const response = await fetch('/api/rwa/reports');
      if (response.status === 401) { setMessage('Save a report to sign in and access your saved observations.'); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(messageFrom(body, 'Reports could not be loaded. Try again.'));
      setReports(z.array(reportSchema).parse(body.reports)); setSignedIn(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Reports could not be loaded.'); }
    finally { setPhase('idle'); }
  }

  async function exportSaved(id: string) {
    try {
      const response = await fetch(`/api/rwa/reports/${id}`);
      if (!response.ok) throw new Error('That report is unavailable. Refresh your list and try again.');
      const body = await responseBody(response);
      const report = z.object({ report: reportSchema.extend({ observation: inspectResultSchema }) }).parse(body).report;
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `rwa-lens-saved-${id}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Export unavailable. Try again.'); }
  }

  async function signOut() {
    try { const response = await fetch('/api/rwa/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sign-out' }) }); if (!response.ok) throw new Error(); setSignedIn(false); setReports(null); setMessage('Signed out. Public inspection and export remain available.'); }
    catch { setMessage('Sign-out could not be completed. Check your connection and try again.'); }
  }

  return <section className="reports-panel" aria-label="Saved reports"><div className="report-toolbar"><button type="button" onClick={() => void save()} disabled={busy} className="primary-button">{phase === 'saving' ? 'Saving…' : 'Save this report'}</button><button type="button" className="text-link" onClick={() => void list()} disabled={busy}>My reports</button>{signedIn ? <button type="button" className="text-link" onClick={() => void signOut()} disabled={busy}>Sign out</button> : null}<p>Optional message sign-in. No transaction is requested.</p></div>{message ? <div role="status" className="mt-3"><Callout tone="slate">{message}</Callout></div> : null}{reports ? <div className="saved-reports">{reports.length ? reports.map(report => <div key={report.id}><p><strong>{report.mode} observation</strong><span>{report.createdAt}</span><span className="tabular">{report.mint}</span></p><button type="button" aria-label={`Export saved report ${report.id}`} onClick={() => void exportSaved(report.id)}><ArrowDownToLine size={15} />JSON</button></div>) : <p>No saved reports yet. Save the current observation to start your list.</p>}</div> : null}<dialog ref={dialog} className="wallet-dialog" aria-labelledby="wallet-title"><div className="dialog-top"><LockKeyhole size={23} /><button type="button" aria-label="Close wallet sign-in" onClick={() => dialog.current?.close()} disabled={busy}><X size={19} /></button></div><h2 id="wallet-title">Keep an observation in your account.</h2><p>Connect a wallet, then sign a message to prove ownership of your report account. This is never a transaction and moves no assets.</p>{choices.length ? <div className="wallet-choices">{choices.map((wallet, index) => <button type="button" key={`${wallet.name}-${index}`} disabled={busy} onClick={() => void signIn(wallet)}>{busy ? phase === 'signing' ? 'Waiting for message signature…' : 'Connecting…' : `Connect ${wallet.name}`}</button>)}</div> : <Callout tone="slate">No Wallet Standard wallet with message signing is available. Enable one and retry, or close this dialog and export JSON or CSV.</Callout>}{message ? <p className="dialog-message" role="status">{message}</p> : null}<button type="button" className="text-link" disabled={busy} onClick={() => setChoices(wallets())}>Refresh wallet list</button></dialog></section>;
}
