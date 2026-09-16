'use client';

import { Card, Callout, Field, VerdictPill, severityStyle } from './primitives';
import { MetadataPanel } from './metadata-panel';
import type { Balances, DecodedExtension, Identity, Provenance, TransferReadiness } from '@/lib/rwa/types';

export function IdentityCard({ identity, metadataUri }: { identity: Identity; metadataUri?: string }) {
  const isToken2022 = identity.tokenProgram === 'token-2022';
  return (
    <Card
      title="Identity"
      step="04"
      aside={
        <span
          className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-[.07em] ${
            isToken2022 ? 'bg-indigo-wash text-indigo-dark' : 'bg-slate-200 text-navy-soft'
          }`}
        >
          {identity.tokenProgram}
        </span>
      }
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Mint" value={identity.mint} />
        <Field label="Owning program" value={identity.tokenProgramAddress} />
        <Field label="Decimals" value={String(identity.decimals)} />
        <Field label="Supply (base units)" value={identity.supply} />
        <Field label="Mint authority" value={identity.mintAuthority ?? 'none'} />
        <Field label="Freeze authority" value={identity.freezeAuthority ?? 'none'} />
        {identity.metadata?.name ? <Field label="Name" value={identity.metadata.name} mono={false} /> : null}
        {identity.metadata?.symbol ? <Field label="Symbol" value={identity.metadata.symbol} /> : null}
      </dl>
      {!isToken2022 ? (
        <div className="mt-4">
          <Callout tone="slate">
            This is a legacy SPL mint. It cannot carry Token-2022 extensions, so there is no multiplier, hook,
            permanent delegate or default freeze state to report.
          </Callout>
        </div>
      ) : null}
      {metadataUri ? <MetadataPanel identity={identity} uri={metadataUri} /> : null}
    </Card>
  );
}

export function BalanceCard({ balances }: { balances: Balances }) {
  const { display } = balances;
  const scaled = display.extensionUiAmount !== undefined && display.multiplier !== undefined;

  return (
    <Card
      title="Balance"
      step="05"
      aside={
        balances.complete ? null : (
          <span className="rounded bg-amber-wash px-2 py-1 text-[11px] font-semibold uppercase tracking-[.07em] text-amber-ink">
            incomplete
          </span>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-sunken px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">Raw base units</p>
          <p className="tabular mt-1.5 break-all text-[22px] font-semibold leading-tight">{display.rawAmount}</p>
          <p className="mt-1.5 text-[12px] leading-snug text-navy-soft">
            Exact, and unchanged by any multiplier.
          </p>
        </div>
        <div className="rounded-lg border border-line px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">Standard decimal</p>
          <p className="tabular mt-1.5 break-all text-[22px] font-semibold leading-tight">
            {display.standardUiAmount ?? '—'}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-navy-soft">raw ÷ 10^{balances.accounts[0]?.decimals ?? 0}, computed exactly.</p>
        </div>
        <div className={`rounded-lg border px-4 py-3.5 ${scaled ? 'border-indigo bg-indigo-wash' : 'border-line'}`}>
          <p className="text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">
            {scaled ? 'Extension-aware amount' : 'No scaling applied'}
          </p>
          <p className="tabular mt-1.5 break-all text-[22px] font-semibold leading-tight">
            {display.extensionUiAmount ?? display.standardUiAmount ?? '—'}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-navy-soft">
            {scaled ? `× multiplier ${display.multiplier}` : 'Displayed amount equals the exact decimal amount.'}
          </p>
        </div>
      </div>

      {scaled ? (
        <div className="mt-4 rounded-lg border border-line bg-sunken px-4 py-3">
          <p className="tabular text-[13px]">
            raw units ÷ 10<sup>decimals</sup> × multiplier{' '}
            <span className="text-navy-faint">
              = {display.rawAmount} ÷ 10<sup>{balances.accounts[0]?.decimals ?? 0}</sup> × {display.multiplier} ={' '}
              {display.extensionUiAmount}
            </span>
          </p>
          {display.effectiveAt ? (
            <p className="mt-2 text-[12.5px] text-navy-soft">
              Observation is <strong className="font-semibold">{display.boundary}</strong> the scheduled change at{' '}
              <span className="tabular">{display.effectiveAt}</span>
              {display.pendingMultiplier ? <> → multiplier {display.pendingMultiplier}</> : null}.
            </p>
          ) : null}
        </div>
      ) : null}

      {display.rounding === 'official-helper' ? (
        <div className="mt-4">
          <Callout tone="amber">
            <strong className="font-semibold">Display value, not an accounting figure.</strong> {display.note}
          </Callout>
        </div>
      ) : display.note ? (
        <div className="mt-4">
          <Callout tone="slate">{display.note}</Callout>
        </div>
      ) : null}

      {!balances.complete ? (
        <div className="mt-3">
          <Callout tone="amber">
            More than {balances.accountLimit} token accounts exist for this owner. The total above covers the first{' '}
            {balances.accountLimit} and is <strong className="font-semibold">not</strong> a complete wallet balance.
          </Callout>
        </div>
      ) : null}

      {balances.accounts.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.07em] text-navy-faint">
                <th className="py-2 pr-3 font-medium">Token account</th>
                <th className="py-2 pr-3 font-medium">Raw amount</th>
                <th className="py-2 pr-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {balances.accounts.map(account => (
                <tr key={account.tokenAccount} className="border-b border-line/60">
                  <td className="tabular py-2 pr-3 break-all">{account.tokenAccount}</td>
                  <td className="tabular py-2 pr-3">{account.rawAmount}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        account.state === 'frozen'
                          ? 'bg-red-wash text-red'
                          : account.state === 'unknown'
                            ? 'bg-slate-200 text-navy-soft'
                            : 'bg-green-wash text-green'
                      }`}
                    >
                      {account.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

export function ExtensionInventory({ extensions }: { extensions: DecodedExtension[] }) {
  if (extensions.length === 0) {
    return (
      <Card title="Extensions" step="06">
        <Callout tone="slate">No Token-2022 extensions were found on this mint.</Callout>
      </Card>
    );
  }
  return (
    <Card
      title="Extensions"
      step="06"
      aside={<span className="tabular text-[12px] text-navy-faint">{extensions.length} detected</span>}
    >
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {extensions.map(extension => {
          const style = severityStyle(extension.severity);
          return (
            <li
              key={`${extension.kind}-${extension.scope}`}
              className="relative overflow-hidden rounded-lg border border-line bg-surface pl-4"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} aria-hidden="true" />
              <div className="px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13.5px] font-semibold">{extension.kind}</h3>
                  <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.06em] ${style.chip}`}>
                    {extension.severity}
                  </span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10.5px] text-navy-soft">{extension.scope}</span>
                  {extension.calculationUnavailable ? (
                    <span className="rounded bg-indigo-wash px-1.5 py-0.5 text-[10.5px] text-indigo-dark">
                      calculation unavailable
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-navy-soft">{extension.impact}</p>
                {extension.fields.length > 0 ? (
                  <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {extension.fields.map(field => (
                      <div key={field.label} className="flex flex-wrap items-baseline gap-1.5">
                        <dt className="text-[11px] uppercase tracking-[.06em] text-navy-faint">{field.label}</dt>
                        <dd className="tabular break-all text-[12.5px]">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {extension.authorities.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {extension.authorities.map(authority => (
                      <li key={authority.address + authority.role} className="text-[12px]">
                        <span className="text-navy-faint">{authority.role}: </span>
                        <span className="tabular break-all">{authority.address}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function TransferReadinessCard({ readiness }: { readiness: TransferReadiness }) {
  return (
    <Card title="Transfer readiness" step="07" aside={<VerdictPill verdict={readiness.verdict} large />}>
      <ul className="space-y-2.5">
        {readiness.reasons.map(reason => (
          <li key={reason.check} className="rounded-lg border border-line px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictPill verdict={reason.verdict} />
              <h3 className="text-[13.5px] font-semibold">{reason.check}</h3>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-navy-soft">{reason.detail}</p>
            {reason.evidence ? (
              <p className="tabular mt-1.5 break-all text-[11.5px] text-navy-faint">{reason.evidence}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3.5">
        <Callout tone="slate">{readiness.disclaimer}</Callout>
      </div>
    </Card>
  );
}

export function EvidenceDrawer({ provenance }: { provenance: Provenance }) {
  return (
    <Card title="Evidence" step="08">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Cluster" value={provenance.cluster} />
        <Field label="RPC provider" value={provenance.rpcProvider} />
        <Field label="Commitment" value={provenance.commitment} />
        <Field label="Slot" value={provenance.slot} />
        <Field label="Block time" value={provenance.blockTime} />
        <Field label="Fetched at" value={provenance.fetchedAt} />
        <Field label="Time source" value={provenance.timeSource} />
        <Field label="Decoder" value={provenance.decoderVersion} />
      </dl>
      {provenance.timeSource === 'local-estimate' ? (
        <div className="mt-4">
          <Callout tone="amber">
            Block time was unavailable, so any scheduled multiplier boundary was evaluated against local time. Treat the
            boundary as an estimate.
          </Callout>
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.07em] text-navy-faint">
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Method</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {provenance.sources.map(source => (
              <tr key={source.label + source.method} className="border-b border-line/60">
                <td className="py-2 pr-3">{source.label}</td>
                <td className="tabular py-2 pr-3">{source.method}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      source.status === 'ok'
                        ? 'bg-green-wash text-green'
                        : source.status === 'failed'
                          ? 'bg-red-wash text-red'
                          : 'bg-slate-200 text-navy-soft'
                    }`}
                  >
                    {source.status}
                  </span>
                </td>
                <td className="py-2 pr-3 break-all text-navy-soft">{source.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
