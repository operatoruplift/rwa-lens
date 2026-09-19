import type { ExtensionSeverity, ObservationStatus, ReadinessVerdict } from '@/lib/rwa/types';

export function Card({ title, step, children, aside, className = '' }: { title: string; step?: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return <section className={`data-card ${className}`}><header className="card-heading"><h2>{step ? <span>{step}</span> : null}{title}</h2>{aside}</header><div className="card-body">{children}</div></section>;
}

export function Field({ label, value, mono = true }: { label: string; value?: string; mono?: boolean }) {
  return <div className="data-field"><dt>{label}</dt><dd className={mono ? 'tabular' : ''}>{value ?? <span className="unavailable-value">Unavailable</span>}</dd></div>;
}

const STATUS_STYLE: Record<ObservationStatus, string> = { verified: 'bg-green-wash text-green', partial: 'bg-amber-wash text-amber-ink', unavailable: 'bg-slate-200 text-navy-soft', invalid: 'bg-red-wash text-red' };
export function StatusPill({ status }: { status: ObservationStatus }) {
  return <span className={`status-pill ${STATUS_STYLE[status]}`}>{status === 'verified' ? 'Decoded' : status}</span>;
}
const VERDICT_STYLE: Record<ReadinessVerdict, string> = { ready: 'bg-green-wash text-green', attention: 'bg-amber-wash text-amber-ink', blocked: 'bg-red-wash text-red', unknown: 'bg-slate-200 text-navy-soft' };
export function VerdictPill({ verdict, large = false }: { verdict: ReadinessVerdict; large?: boolean }) {
  return <span className={`status-pill ${large ? 'large-pill' : ''} ${VERDICT_STYLE[verdict]}`}>{verdict}</span>;
}
const SEVERITY_STYLE: Record<ExtensionSeverity, { chip: string; rail: string }> = { info: { chip: 'bg-slate-200 text-navy-soft', rail: 'bg-slate-300' }, attention: { chip: 'bg-amber-wash text-amber-ink', rail: 'bg-amber' }, blocking: { chip: 'bg-red-wash text-red', rail: 'bg-red' }, opaque: { chip: 'bg-indigo-wash text-indigo-dark', rail: 'bg-indigo' } };
export function severityStyle(severity: ExtensionSeverity) { return SEVERITY_STYLE[severity]; }
export function Callout({ tone, children }: { tone: 'amber' | 'indigo' | 'slate'; children: React.ReactNode }) {
  return <p className={`callout callout-${tone}`}>{children}</p>;
}
