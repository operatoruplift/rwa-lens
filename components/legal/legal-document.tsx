import type { ReactNode } from 'react';
import { ResourceShell } from '@/components/resources/resource-shell';
import { LEGAL_UPDATED, LEGAL_UPDATED_ISO, OPERATOR, supportContact } from '@/lib/legal';
import styles from './legal.module.css';

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Where to reach the operator: the configured support email, otherwise the public issue tracker. */
export function ContactLine() {
  const contact = supportContact();
  return contact.kind === 'email'
    ? <p>Email <a href={contact.href}>{contact.label}</a>.</p>
    : <p>Open an issue at <a href={contact.href} target="_blank" rel="noreferrer noopener">{contact.label}</a>. Issues are public, so leave out anything private and ask us for a private channel instead.</p>;
}

/** A long-form legal page: facts and contents in a rail, the summary first, then numbered sections. */
export function LegalDocument({ eyebrow, title, description, summary, sections }: {
  eyebrow: string; title: string; description: string; summary: readonly ReactNode[]; sections: readonly LegalSection[];
}) {
  const contact = supportContact();
  return (
    <ResourceShell eyebrow={eyebrow} title={title} description={description}>
      <div className={styles.document}>
        <div className={styles.rail}>
          <p className={styles.updated}>Last updated: <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED}</time></p>
          <dl className={styles.facts}>
            <div><dt>Operator</dt><dd>{OPERATOR}</dd></div>
            <div><dt>Covers</dt><dd>The website, the Android app and their API</dd></div>
            <div><dt>Contact</dt><dd><a href={contact.href} {...(contact.kind === 'issues' ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>{contact.kind === 'email' ? contact.label : 'GitHub issues'}</a></dd></div>
          </dl>
          <nav aria-labelledby="legal-contents" className={styles.contents}>
            <p id="legal-contents" className={styles.railLabel}>On this page</p>
            <ol>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
          </nav>
        </div>
        <div className={styles.body}>
          <section className={styles.summary} aria-labelledby="legal-summary">
            <h2 id="legal-summary">In short</h2>
            <ul>{summary.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </section>
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
              <p className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </div>
    </ResourceShell>
  );
}

/** A clause that must read exactly as written, set apart from the running text. */
export function Clause({ children }: { children: ReactNode }) {
  return <div className={styles.clause}>{children}</div>;
}

/** Named items with what each one receives or does. */
export function Definitions({ items, label }: { items: ReadonlyArray<readonly [string, ReactNode]>; label: string }) {
  return <dl className={styles.definitions} aria-label={label}>{items.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>;
}
