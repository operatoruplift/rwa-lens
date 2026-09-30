'use client';

import type { ReactNode, KeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Coins, Fingerprint, Layers, ShieldCheck } from 'lucide-react';
import styles from './inspection-tabs.module.css';

const sections = [
  { id: 'overview', label: 'Overview', icon: Fingerprint },
  { id: 'balances', label: 'Balances', icon: Coins },
  { id: 'controls', label: 'Controls', icon: ShieldCheck },
  { id: 'liquidity', label: 'Liquidity', icon: Layers },
  { id: 'evidence', label: 'Evidence', icon: BookOpen },
] as const;
type SectionId = typeof sections[number]['id'];

export function InspectionTabs({ panels }: { panels: Record<SectionId, ReactNode> }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const selected = sections.find(section => section.id === requested)?.id ?? 'overview';
  function activate(id: SectionId, focus = false) {
    if (id === selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
    if (focus) document.getElementById(`inspection-tab-${id}`)?.focus();
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index - 1 + sections.length) % sections.length : null;
    if (target === null) return;
    event.preventDefault();
    activate(sections[target].id, true);
  }
  return <div className={styles.sections}>
    <div role="tablist" aria-label="Inspection sections" className={styles.tabs}>{sections.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" role="tab" id={`inspection-tab-${id}`} aria-controls={`inspection-panel-${id}`} aria-selected={id === selected} tabIndex={id === selected ? 0 : -1} onClick={() => activate(id)} onKeyDown={event => navigate(event, index)}><Icon size={16} /><span>{label}</span></button>)}</div>
    {sections.map(({ id }) => <div key={id} id={`inspection-panel-${id}`} role="tabpanel" aria-labelledby={`inspection-tab-${id}`} tabIndex={0} hidden={selected !== id} className={styles.panel}>{panels[id]}</div>)}
  </div>;
}
