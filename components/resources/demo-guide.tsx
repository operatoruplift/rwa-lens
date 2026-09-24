'use client';

import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import styles from './demo-guide.module.css';

const chapters = [
  { label: 'Identity', title: 'Start at the source.', copy: 'USDY opens with a fresh Solana observation. Compare the mint address, token program, decimals and mint authorities. Open the issuer reference to see where the asset attribution comes from.', detail: 'USDY uses SPL Token. Its issuer attribution and the decoded account are shown separately.', target: '#inspect', action: 'Inspect the mint' },
  { label: 'Balance', title: 'Make every unit count.', copy: 'Enter a public wallet address and inspect again. Read the exact raw units alongside the decimal amount, then expand the token accounts to reconcile the total.', detail: 'No wallet connection is needed. An empty account list means zero observed holdings; a failed read stays unavailable.', target: '#inspect', action: 'Inspect a wallet balance' },
  { label: 'Controls', title: 'Read the rules.', copy: 'Review mint and freeze authorities, then inspect the extension inventory and transfer checks. Token-2022 mints expose additional controls where those extensions are present.', detail: 'A configured authority is observable. Holder eligibility and the outcome of a future transfer require additional checks.', target: '#inspect', action: 'Review token controls' },
  { label: 'Evidence', title: 'Take the evidence with you.', copy: 'Expand source evidence for RPC methods, slots, observation time and decoder version. Export JSON for the complete receipt or CSV for a reconciliation workflow.', detail: 'Each JSON receipt includes a SHA-256 content hash. It identifies the exported payload, not an issuer endorsement.', target: '#inspect', action: 'Open evidence and export' },
] as const;

export function DemoGuide() {
  const [index, setIndex] = useState(0);
  const chapter = chapters[index];
  return (
    <section className={styles.guide} aria-label="Guided product walkthrough">
      <div className={styles.tabs} role="group" aria-label="Walkthrough chapters">
        {chapters.map((item, number) => <button key={item.label} type="button" aria-pressed={index === number} onClick={() => setIndex(number)}><span>0{number + 1}</span>{item.label}</button>)}
      </div>
      <div className={styles.chapter} aria-live="polite" aria-atomic="true">
        <div><p className={styles.counter}>STEP {index + 1} / {chapters.length}</p><h2>{chapter.title}</h2><p className={styles.copy}>{chapter.copy}</p></div>
        <aside><span>WHAT TO LOOK FOR</span><p>{chapter.detail}</p><a href={chapter.target}>{chapter.action}<ArrowDown size={16} /></a></aside>
      </div>
      <div className={styles.controls}>
        <span>Use the live inspector below.</span>
        <div><button type="button" aria-label="Previous chapter" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}><ArrowLeft size={17} /></button><button type="button" aria-label={index === chapters.length - 1 ? 'Restart walkthrough' : 'Next chapter'} onClick={() => setIndex(current => (current + 1) % chapters.length)}>{index === chapters.length - 1 ? 'Start again' : 'Next chapter'}<ArrowRight size={17} /></button></div>
      </div>
    </section>
  );
}
