'use client';

import { useCallback, useState } from 'react';
import { Callout } from './primitives';
import type { Identity } from '@/lib/rwa/types';

/**
 * Issuer metadata is a separate, explicit act.
 *
 * The inspection never fetches a URI on its own: the URI comes from whoever
 * controls the mint, so retrieving it is a decision, taken here, and its result
 * is labelled issuer-supplied rather than folded into the on-chain facts above.
 */

type Outcome =
  | { state: 'ok'; body: Record<string, unknown>; fetchedAt: string; bytes: number }
  | { state: 'skipped' | 'blocked' | 'failed' | 'not-configured'; reason: string };

export function MetadataPanel({ identity, uri }: { identity: Identity; uri: string }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await fetch('/api/rwa/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: identity.mint, uri }),
      });
      setOutcome((await response.json()) as Outcome);
    } catch {
      setOutcome({ state: 'failed', reason: 'The request could not be sent.' });
    }
    setPhase('done');
  }, [identity.mint, uri]);

  return (
    <div className="mt-4 rounded-lg border border-line px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[.08em] text-navy-faint">Issuer metadata</h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={phase === 'loading'}
          className="min-h-[36px] rounded-lg border border-line px-3 text-[12.5px] text-navy-soft transition-colors hover:border-indigo hover:text-indigo-dark disabled:opacity-50"
        >
          {phase === 'loading' ? 'Fetching…' : 'Fetch metadata'}
        </button>
      </div>

      <p className="tabular mt-2 break-all text-[12.5px] text-navy-soft">{uri}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-faint">
        Declared by the mint. Nothing is fetched until you ask, and only from hosts this deployment allowlists.
      </p>

      {outcome ? (
        <div className="mt-3">
          {outcome.state === 'ok' ? (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(outcome.body).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-[.07em] text-navy-faint">{key}</dt>
                    <dd className="mt-0.5 break-all text-[13px]">{String(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 text-[12px] text-navy-faint">
                Fetched {outcome.fetchedAt} · {outcome.bytes} bytes. Issuer-supplied description, not on-chain proof and
                not a claim about reserves or compliance.
              </p>
            </>
          ) : (
            <Callout tone={outcome.state === 'not-configured' ? 'slate' : 'amber'}>
              <strong className="font-semibold">{outcome.state}. </strong>
              {outcome.reason}
            </Callout>
          )}
        </div>
      ) : null}
    </div>
  );
}
