import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/rwa/brand';
import styles from './resources.module.css';

export function ResourceShell({ active, eyebrow, title, description, children }: {
  active: 'demo' | 'technical' | 'pitch';
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#resource-content">Skip to content</a>
      <header className={styles.header}>
        <Link href="/" aria-label="RWA Lens home"><Brand light /></Link>
        <nav aria-label="Resource navigation">
          <Link href="/demo" aria-current={active === 'demo' ? 'page' : undefined}>Demo</Link>
          <Link href="/technical" aria-current={active === 'technical' ? 'page' : undefined}>Technical</Link>
          <Link href="/pitch" aria-current={active === 'pitch' ? 'page' : undefined}>Pitch</Link>
          <Link href="/rwa" className={styles.navCta}>Open app <ArrowUpRight size={15} /></Link>
        </nav>
      </header>
      <main id="resource-content" tabIndex={-1}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.lede}>{description}</p>
          <div className={styles.introRule}><span>RWA LENS</span><span>IDENTITY / BALANCE / CONTROLS</span></div>
        </section>
        {children}
      </main>
      <footer className={styles.footer}>
        <Brand />
        <p>Read the token. Understand the asset.</p>
        <div><Link href="/brand-kit">Brand kit</Link><a href="https://github.com/operatoruplift/rwa-lens" target="_blank" rel="noreferrer noopener">Source <ArrowUpRight size={14} /></a></div>
      </footer>
    </div>
  );
}
