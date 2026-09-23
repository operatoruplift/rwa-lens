import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, Crosshair, ScanLine, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/rwa/brand';
import { RwaLensShell } from '@/components/rwa/rwa-lens-shell';
import { repositoryState } from '@/lib/server/rwa/repository';
import { sessionsConfigured } from '@/lib/server/rwa/session';
import styles from './lens-experience.module.css';

const sourceUrl = 'https://github.com/operatoruplift/rwa-lens';

function Header({ reportsEnabled }: { reportsEnabled: boolean }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.homeLink} aria-label="RWA Lens home"><Brand light /></Link>
      <nav className={styles.navigation} aria-label="Main navigation">
        <a href="#how-it-works" className={styles.desktopLink}>The lens</a>
        {reportsEnabled ? <a href="#reports" className={styles.desktopLink}>Reports</a> : null}
        <Link href="/brand-kit">Brand kit</Link>
        <a href={sourceUrl} className={styles.sourceLink} target="_blank" rel="noreferrer noopener">Source <ArrowUpRight size={13} /></a>
        <a href="#inspect" className={styles.headerCta}>Inspect <ArrowUpRight size={16} /></a>
      </nav>
    </header>
  );
}

function Hero({ cluster }: { cluster: 'mainnet-beta' | 'devnet' }) {
  return (
    <section className={styles.hero} aria-labelledby="page-title">
      <div className={styles.heroArt} aria-hidden="true">
        <Image src="/brand/lens-hero.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.heroImage} />
      </div>
      <div className={styles.heroShade} aria-hidden="true" />
      <div className={styles.heroTopline}><span><span className={styles.statusDot} />SOLANA {cluster === 'mainnet-beta' ? 'MAINNET' : 'DEVNET'}</span><span>THE TOKEN BEHIND THE ASSET</span></div>
      <div className={styles.heroContent}>
        <p className={styles.kicker}>A clearer view starts here.</p>
        <h1 id="page-title" className={styles.heroTitle}>Real assets.<br /><span>Clearer vision.</span></h1>
        <p className={styles.heroDescription}>Look beyond the ticker. Understand your token&rsquo;s identity, the balance behind the number, and who holds the controls.</p>
        <div className={styles.heroActions}>
          <a href="#inspect" className={styles.primaryCta}>Inspect a token <ArrowUpRight size={19} /></a>
          <a href="#how-it-works" className={styles.secondaryCta}>Explore the lens <ArrowDown size={16} /></a>
        </div>
      </div>
      <div className={styles.opticalLabel} aria-hidden="true"><Crosshair size={19} strokeWidth={1} /><div><span>FOCUS / ON-CHAIN REALITY</span><strong>Observation over assumption.</strong></div></div>
      <div className={styles.heroBottom}>
        <div className={styles.assurances}><span><ScanLine size={14} />Public data</span><span><ShieldCheck size={14} />Read-only by design</span></div>
        <a href="#inspect">BRING THE DETAILS INTO FOCUS <ArrowDown size={15} /></a>
      </div>
    </section>
  );
}

function Method() {
  return (
    <section id="how-it-works" className={styles.method} aria-labelledby="method-title">
      <div className={styles.methodHeading}>
        <p className={styles.sectionLabel}>02 / BEYOND THE SURFACE</p>
        <h2 id="method-title">A number is only<br /><span>part of the picture.</span></h2>
        <p>The useful questions live underneath. What is this token? How is its balance calculated? Who can change the rules?</p>
      </div>
      <div className={styles.methodRows}>
        <article className={styles.methodRow}>
          <span className={styles.rowNumber}>01</span>
          <div className={styles.rowTitle}><p>IDENTITY</p><h3>Start with<br /> what&rsquo;s there.</h3></div>
          <div className={styles.rowCopy}><p>Read the mint, token program, decimals and authorities directly from public Solana data. Keep issuer attribution separate from what the chain actually says.</p><span>SPL TOKEN <span aria-hidden="true">/</span> TOKEN-2022</span></div>
          <ScanLine className={styles.rowIcon} size={35} strokeWidth={1} aria-hidden="true" />
        </article>
        <article className={styles.methodRow}>
          <span className={styles.rowNumber}>02</span>
          <div className={styles.rowTitle}><p>BALANCE</p><h3>Make the<br /> numbers meet.</h3></div>
          <div className={styles.rowCopy}><p>Reconcile exact raw units with the amount you see. Explore how a scheduled multiplier can change a displayed balance while the underlying units stay fixed.</p><span>RAW UNITS <ArrowRight size={13} /> DISPLAYED AMOUNT</span></div>
          <span className={styles.balanceGlyph} aria-hidden="true">≈</span>
        </article>
        <article className={styles.methodRow}>
          <span className={styles.rowNumber}>03</span>
          <div className={styles.rowTitle}><p>CONTROL & EVIDENCE</p><h3>Know what<br /> can change.</h3></div>
          <div className={styles.rowCopy}><p>Understand token controls, inspect the source observations, and take an evidence receipt with you. Export JSON or CSV with no account required.</p><span>AUTHORITIES <span aria-hidden="true">/</span> EXTENSIONS <span aria-hidden="true">/</span> RECEIPTS</span></div>
          <Crosshair className={styles.rowIcon} size={35} strokeWidth={1} aria-hidden="true" />
        </article>
      </div>
      <div className={styles.methodNote}><span className={styles.statusDot} /><p>Built for the curious holder, the careful integrator, and the team that needs the numbers to add up.</p></div>
    </section>
  );
}

function Footer() {
  return (
    <>
      <section className={styles.closing} aria-labelledby="closing-title">
        <p className={styles.sectionLabel}>LESS GUESSWORK. MORE CONTEXT.</p>
        <div><h2 id="closing-title">See what&rsquo;s<br />really there.</h2><a href="#inspect" aria-label="Start a token inspection"><ArrowUpRight size={58} strokeWidth={1.25} /></a></div>
        <p>One token. A clearer perspective.<br />Start with a public mint address.</p>
      </section>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Link href="/" aria-label="RWA Lens home"><Brand light /></Link>
          <p>Clarity for real-world tokens.</p>
          <div><Link href="/brand-kit">Brand kit <ArrowUpRight size={14} /></Link><a href={sourceUrl} target="_blank" rel="noreferrer noopener">Built in the open <ArrowUpRight size={14} /></a></div>
        </div>
        <div className={styles.footerBottom}><span>OBSERVATIONS, NOT ATTESTATIONS.</span><p>RWA Lens does not establish asset backing, legal compliance or investment performance. No transaction signing or asset movement. Optional report sign-in uses a message, never a transaction.</p><span>RWA LENS / SOLANA</span></div>
      </footer>
    </>
  );
}

export function LensExperience({ compact = false }: { compact?: boolean }) {
  const cluster = process.env.RWA_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  const reportsEnabled = repositoryState() === 'ready' && sessionsConfigured();
  return (
    <div className={styles.experience}>
      <a className="skip-link" href="#inspect">Skip to inspection</a>
      <div className={styles.darkOpening}>
        <Header reportsEnabled={reportsEnabled} />
      </div>
      <main>
        {compact ? null : <div className={styles.darkOpening}><Hero cluster={cluster} /></div>}
        <section className={`${styles.inspector} ${compact ? styles.compactInspector : ''}`} aria-labelledby={compact ? 'page-title' : 'inspection-title'}>
          <div className={styles.inspectorIntro}>
            <div><p className={styles.sectionLabel}>01 / THE INSPECTOR</p>{compact ? <h1 id="page-title">The evidence,<br /><span>in focus.</span></h1> : <h2 id="inspection-title">The evidence,<br /><span>in focus.</span></h2>}</div>
            <div><p>Paste a mint address to inspect a token, or explore a synthetic example below. Add a public wallet to reconcile a holder&rsquo;s balance.</p><span><span className={styles.statusDot} />SOLANA {cluster === 'mainnet-beta' ? 'MAINNET' : 'DEVNET'} <span aria-hidden="true">/</span> NO WALLET CONNECTION</span></div>
          </div>
          <RwaLensShell cluster={cluster} reportsEnabled={reportsEnabled} />
        </section>
        <Method />
      </main>
      <Footer />
    </div>
  );
}
