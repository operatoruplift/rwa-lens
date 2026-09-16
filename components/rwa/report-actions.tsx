'use client';

import { useCallback, useState } from 'react';
import { Callout } from './primitives';
import type { InspectResult } from '@/lib/rwa/types';

/**
 * Saving a report is the only thing in this product that needs an account, and
 * the only thing that touches a wallet. The wallet is asked for a **message
 * signature**, never a transaction. Everything else — inspecting, exporting —
 * works as a guest, so every failure path here degrades to "export instead"
 * rather than blocking the user.
 */

type Phase = 'idle' | 'checking' | 'connecting' | 'signing' | 'saving' | 'saved' | 'unavailable' | 'error';

type WalletAccount = { address: string; features?: readonly string[] };
type WalletLike = {
  name: string;
  accounts: readonly WalletAccount[];
  features: Record<string, unknown>;
};

/** Wallet Standard discovery, without pulling in an adapter library. */
function detectWallets(): WalletLike[] {
  if (typeof window === 'undefined') return [];
  const found: WalletLike[] = [];
  try {
    window.dispatchEvent(
      new CustomEvent('wallet-standard:app-ready', {
        detail: { register: (wallet: WalletLike) => found.push(wallet) },
      }),
    );
  } catch {
    return [];
  }
  return found;
}

function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = '';
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) out = `1${out}`;
    else break;
  }
  return out || '1';
}

export function ReportActions({ result }: { result: InspectResult }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const save = useCallback(async () => {
    setMessage(null);
    setPhase('checking');

    const payload = {
      cluster: result.provenance.cluster,
      mint: result.identity?.mint,
      owner: result.balances?.owner,
      observation: result,
    };

    const attempt = async () =>
      fetch('/api/rwa/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

    let response = await attempt();

    if (response.status === 503) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setPhase('unavailable');
      setMessage(body.message ?? 'Saved reports are not enabled on this deployment.');
      return;
    }

    if (response.status === 401) {
      // Not signed in: ask a wallet to sign the challenge, then retry once.
      const signedIn = await signIn(setPhase, setMessage);
      if (!signedIn) return;
      setPhase('saving');
      response = await attempt();
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setPhase('error');
      setMessage(body.message ?? 'The report could not be saved. Export the JSON instead.');
      return;
    }

    setPhase('saved');
    setMessage('Saved to your account. The JSON export is identical and needs no account.');
  }, [result]);

  const busy = phase === 'checking' || phase === 'connecting' || phase === 'signing' || phase === 'saving';

  return (
    <div className="mt-4 rounded-lg border border-line bg-sunken px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !result.identity}
          className="min-h-[40px] rounded-lg border border-indigo bg-indigo-wash px-3.5 text-[12.5px] font-semibold text-indigo-dark transition-colors hover:bg-indigo hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? labelFor(phase) : 'Save this report'}
        </button>
        <span className="text-[12.5px] text-navy-soft">
          Optional. Signing proves you own an address — it is never a transaction.
        </span>
      </div>
      {message ? (
        <div className="mt-3">
          <Callout tone={phase === 'saved' ? 'slate' : phase === 'unavailable' ? 'slate' : 'amber'}>{message}</Callout>
        </div>
      ) : null}
    </div>
  );
}

function labelFor(phase: Phase): string {
  if (phase === 'connecting') return 'Waiting for wallet…';
  if (phase === 'signing') return 'Waiting for signature…';
  if (phase === 'saving') return 'Saving…';
  return 'Checking…';
}

async function signIn(
  setPhase: (phase: Phase) => void,
  setMessage: (message: string) => void,
): Promise<boolean> {
  setPhase('connecting');

  const wallets = detectWallets();
  const wallet = wallets.find(candidate => candidate.accounts.length > 0 && 'solana:signMessage' in candidate.features);
  if (!wallet) {
    setPhase('unavailable');
    setMessage(
      'No Wallet Standard wallet with message signing was found in this browser. Inspection and the JSON export need no wallet.',
    );
    return false;
  }

  const account = wallet.accounts[0];

  try {
    const challengeResponse = await fetch('/api/rwa/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'challenge', address: account.address }),
    });
    if (challengeResponse.status === 503) {
      const body = (await challengeResponse.json().catch(() => ({}))) as { message?: string };
      setPhase('unavailable');
      setMessage(body.message ?? 'Wallet sign-in is not enabled on this deployment.');
      return false;
    }
    const challenge = (await challengeResponse.json()) as { nonce: string; message: string };

    setPhase('signing');
    const signMessage = wallet.features['solana:signMessage'] as {
      signMessage: (input: { account: WalletAccount; message: Uint8Array }) => Promise<Array<{ signature: Uint8Array }>>;
    };
    const [signed] = await signMessage.signMessage({
      account,
      message: new TextEncoder().encode(challenge.message),
    });

    const verify = await fetch('/api/rwa/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'verify',
        address: account.address,
        nonce: challenge.nonce,
        signature: base58Encode(signed.signature),
      }),
    });

    if (!verify.ok) {
      const body = (await verify.json().catch(() => ({}))) as { message?: string };
      setPhase('error');
      setMessage(body.message ?? 'That signature could not be verified.');
      return false;
    }
    return true;
  } catch {
    // A rejected signature is a normal outcome, not a failure to apologise for.
    setPhase('idle');
    setMessage('Sign-in was cancelled. Inspection and the JSON export need no account.');
    return false;
  }
}
