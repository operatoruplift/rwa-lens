import type { ExtensionSeverity, ObservationStatus, ReadinessVerdict } from '@/lib/rwa/types';

/** Shared chrome. Severity colour is semantic here, never decorative. */

export function Card({
  title,
  step,
  children,
  aside,
}: {
  title: string;
  step?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,26,58,.04),0_12px_28px_-24px_rgba(16,26,58,.35)]">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="flex items-baseline gap-2.5 text-[15px] font-semibold tracking-tight">
          {step ? <span className="tabular text-[11px] font-medium text-navy-faint">{step}</span> : null}
          {title}
        </h2>
        {aside}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Field({ label, value, mono = true }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[.08em] text-navy-faint">{label}</dt>
      <dd className={`mt-1 break-all text-[13px] text-navy ${mono ? 'tabular' : ''}`}>
        {value ?? <span className="text-navy-faint italic">unavailable</span>}
      </dd>
    </div>
  );
}

const STATUS_STYLE: Record<ObservationStatus, string> = {
  verified: 'bg-green-wash text-green',
  partial: 'bg-amber-wash text-amber-ink',
  unavailable: 'bg-slate-200 text-navy-soft',
  invalid: 'bg-red-wash text-red',
};

export function StatusPill({ status }: { status: ObservationStatus }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-[.07em] ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

const VERDICT_STYLE: Record<ReadinessVerdict, string> = {
  ready: 'bg-green-wash text-green',
  attention: 'bg-amber-wash text-amber-ink',
  blocked: 'bg-red-wash text-red',
  unknown: 'bg-slate-200 text-navy-soft',
};

export function VerdictPill({ verdict, large = false }: { verdict: ReadinessVerdict; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded font-semibold uppercase tracking-[.07em] ${VERDICT_STYLE[verdict]} ${
        large ? 'px-3 py-1.5 text-[13px]' : 'px-2 py-1 text-[11px]'
      }`}
    >
      {verdict}
    </span>
  );
}

const SEVERITY_STYLE: Record<ExtensionSeverity, { chip: string; rail: string }> = {
  info: { chip: 'bg-slate-200 text-navy-soft', rail: 'bg-slate-300' },
  attention: { chip: 'bg-amber-wash text-amber-ink', rail: 'bg-amber' },
  blocking: { chip: 'bg-red-wash text-red', rail: 'bg-red' },
  opaque: { chip: 'bg-indigo-wash text-indigo-dark', rail: 'bg-indigo' },
};

export function severityStyle(severity: ExtensionSeverity) {
  return SEVERITY_STYLE[severity];
}

export function Callout({
  tone,
  children,
}: {
  tone: 'amber' | 'indigo' | 'slate';
  children: React.ReactNode;
}) {
  const style =
    tone === 'amber'
      ? 'border-amber bg-amber-wash text-amber-ink'
      : tone === 'indigo'
        ? 'border-indigo bg-indigo-wash text-indigo-dark'
        : 'border-line bg-sunken text-navy-soft';
  return <p className={`rounded-lg border-l-[3px] px-3.5 py-2.5 text-[13px] leading-relaxed ${style}`}>{children}</p>;
}
