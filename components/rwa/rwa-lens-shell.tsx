'use client';

import { useCallback, useMemo, useState } from 'react';
import { FIXTURES } from '@/lib/rwa/fixtures';
import type { Cluster, InspectResult } from '@/lib/rwa/types';
import { Callout, StatusPill } from './primitives';
import {
  BalanceCard,
  EvidenceDrawer,
  ExtensionInventory,
  IdentityCard,
  TransferReadinessCard,
} from './result-panels';

type Phase = 'idle' | 'loading' | 'done' | 'error';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function download(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toCsv(result: InspectResult): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows: string[][] = [
    ['field', 'value'],
    ['status', result.status],
    ['cluster', result.provenance.cluster],
    ['mint', result.identity?.mint ?? ''],
    ['token_program', result.identity?.tokenProgram ?? ''],
    ['decimals', String(result.identity?.decimals ?? '')],
    ['raw_amount', result.balances?.display.rawAmount ?? ''],
    ['standard_ui_amount', result.balances?.display.standardUiAmount ?? ''],
    ['extension_ui_amount', result.balances?.display.extensionUiAmount ?? ''],
    ['multiplier', result.balances?.display.multiplier ?? ''],
    ['rounding', result.balances?.display.rounding ?? ''],
    ['complete_account_list', String(result.balances?.complete ?? '')],
    ['transfer_readiness', result.transferReadiness?.verdict ?? ''],
    ['extensions', result.extensions.map(extension => extension.kind).join(' ')],
    ['slot', result.provenance.slot ?? ''],
    ['block_time', result.provenance.blockTime ?? ''],
    ['time_source', result.provenance.timeSource],
    ['decoder', result.provenance.decoderVersion],
  ];
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function RwaLensShell() {
  const [cluster, setCluster] = useState<Cluster>('devnet');
  const [mint, setMint] = useState('');
  const [owner, setOwner] = useState('');
  const [fixtureId, setFixtureId] = useState<string>(FIXTURES[0].id);
  // Seeded rather than fetched in an effect: the first paint is already a
  // working inspection, with no flash and no cascading render.
  const [phase, setPhase] = useState<Phase>('done');
  const [result, setResult] = useState<InspectResult | null>(FIXTURES[0].result);
  const [error, setError] = useState<string | null>(null);

  const mintValid = BASE58.test(mint.trim());
  const ownerValid = owner.trim() === '' || BASE58.test(owner.trim());

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setPhase('loading');
      setError(null);
      try {
        const response = await fetch('/api/rwa/inspect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as InspectResult & { message?: string };
        if (!response.ok) {
          setResult(null);
          setError(data.message ?? 'The inspection could not be completed.');
          setPhase('error');
          return;
        }
        setResult(data);
        setPhase('done');
      } catch {
        setResult(null);
        setError('The request could not be sent. Check your connection and try again.');
        setPhase('error');
      }
    },
    [],
  );

  const activeFixture = useMemo(() => FIXTURES.find(fixture => fixture.id === fixtureId), [fixtureId]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
      {/* 02 — search */}
      <section className="mt-6 rounded-xl border border-line bg-surface px-5 py-6 shadow-[0_1px_2px_rgba(16,26,58,.04),0_12px_28px_-24px_rgba(16,26,58,.35)] sm:px-7">
        <h1 className="max-w-[22ch] text-[28px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]">
          Know what your real-world token means.
        </h1>
        <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-navy-soft">
          Inspect any Solana mint: what it is, what a holder&rsquo;s balance really means right now, and which on-chain
          controls decide whether it can move. Read-only — no wallet, no signature, nothing is ever sent.
        </p>

        <form
          className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={event => {
            event.preventDefault();
            if (!mintValid || !ownerValid) return;
            void run({ cluster, mint: mint.trim(), owner: owner.trim() || undefined });
          }}
        >
          <div>
            <label htmlFor="rwa-mint" className="block text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">
              Mint address
            </label>
            <input
              id="rwa-mint"
              value={mint}
              onChange={event => setMint(event.target.value)}
              placeholder="Token mint, base58"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={mint.length > 0 && !mintValid}
              className="tabular mt-1.5 min-h-[44px] w-full rounded-lg border border-line bg-surface px-3 text-[13px] outline-none placeholder:text-navy-faint focus:border-indigo"
            />
          </div>
          <div>
            <label htmlFor="rwa-owner" className="block text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">
              Wallet address <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="rwa-owner"
              value={owner}
              onChange={event => setOwner(event.target.value)}
              placeholder="Public address to read balances"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={owner.length > 0 && !ownerValid}
              className="tabular mt-1.5 min-h-[44px] w-full rounded-lg border border-line bg-surface px-3 text-[13px] outline-none placeholder:text-navy-faint focus:border-indigo"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!mintValid || !ownerValid || phase === 'loading'}
              className="min-h-[44px] w-full rounded-lg bg-indigo px-5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-dark disabled:cursor-not-allowed disabled:opacity-45 md:w-auto"
            >
              {phase === 'loading' ? 'Inspecting…' : 'Inspect'}
            </button>
          </div>
        </form>

        {mint.length > 0 && !mintValid ? (
          <p className="mt-2 text-[12.5px] text-red">That is not a valid base58 Solana address.</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
          <span className="text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">Or explore a fixture</span>
          {FIXTURES.map(fixture => (
            <button
              key={fixture.id}
              type="button"
              onClick={() => {
                setFixtureId(fixture.id);
                void run({ cluster: 'devnet', mint: fixture.result.identity?.mint ?? '', fixtureId: fixture.id });
              }}
              className={`min-h-[36px] rounded-lg border px-3 text-[12.5px] transition-colors ${
                fixtureId === fixture.id
                  ? 'border-indigo bg-indigo-wash text-indigo-dark'
                  : 'border-line text-navy-soft hover:border-indigo'
              }`}
            >
              {fixture.label}
            </button>
          ))}
          <label htmlFor="rwa-cluster" className="sr-only">
            Cluster
          </label>
          <select
            id="rwa-cluster"
            value={cluster}
            onChange={event => setCluster(event.target.value as Cluster)}
            className="ml-auto min-h-[36px] rounded-lg border border-line bg-surface px-2.5 text-[12.5px]"
          >
            <option value="devnet">devnet</option>
            <option value="mainnet-beta">mainnet-beta</option>
          </select>
        </div>
        {activeFixture ? (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-navy-faint">{activeFixture.summary}</p>
        ) : null}
      </section>

      {/* 03 — observation banner */}
      {phase === 'error' && error ? (
        <div className="mt-5">
          <Callout tone="amber">
            <strong className="font-semibold">Inspection unavailable.</strong> {error} The fixtures above still work and
            use the same response format.
          </Callout>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-5 py-3.5">
            <StatusPill status={result.status} />
            <span className="text-[13px] text-navy-soft">
              {result.provenance.rpcProvider === 'fixture' ? 'Deterministic fixture' : `Read from ${result.provenance.rpcProvider}`}
              {result.provenance.slot ? <> · slot <span className="tabular">{result.provenance.slot}</span></> : null}
              {result.provenance.blockTime ? <> · <span className="tabular">{result.provenance.blockTime}</span></> : null}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => download(`rwa-lens-${result.identity?.mint ?? 'report'}.json`, JSON.stringify(result, null, 2), 'application/json')}
                className="min-h-[36px] rounded-lg border border-line px-3 text-[12.5px] text-navy-soft transition-colors hover:border-indigo hover:text-indigo-dark"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => download(`rwa-lens-${result.identity?.mint ?? 'report'}.csv`, toCsv(result), 'text/csv')}
                className="min-h-[36px] rounded-lg border border-line px-3 text-[12.5px] text-navy-soft transition-colors hover:border-indigo hover:text-indigo-dark"
              >
                Export CSV
              </button>
            </div>
          </div>

          {result.warnings.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {result.warnings.map(warning => (
                <li key={warning}>
                  <Callout tone="amber">{warning}</Callout>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 space-y-5">
            {result.identity ? <IdentityCard identity={result.identity} /> : null}
            {result.balances ? (
              <BalanceCard balances={result.balances} />
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-[13px] text-navy-soft">
                Add a wallet address above to read public token accounts for this mint and see what the balance really
                means.
              </div>
            )}
            <ExtensionInventory extensions={result.extensions} />
            {result.transferReadiness ? <TransferReadinessCard readiness={result.transferReadiness} /> : null}
            <EvidenceDrawer provenance={result.provenance} />
          </div>

          <section className="mt-5 rounded-xl border border-line bg-sunken px-5 py-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[.07em] text-navy-faint">Limitations</h2>
            <ul className="mt-2.5 space-y-1.5">
              {result.limitations.map(limitation => (
                <li key={limitation} className="text-[13px] leading-relaxed text-navy-soft">
                  · {limitation}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
