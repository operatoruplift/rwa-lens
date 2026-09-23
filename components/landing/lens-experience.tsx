import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, Crosshair, ScanLine, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/rwa/brand';
import { RwaLensShell } from '@/components/rwa/rwa-lens-shell';
import { repositoryState } from '@/lib/server/rwa/repository';
import { sessionsConfigured } from '@/lib/server/rwa/session';
import { ScrollExperience } from './scroll-experience';
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
    <section className={styles.hero} aria-labelledby="page-title" data-motion-hero>
      <div className={styles.heroArt} aria-hidden="true">
        <div className={styles.heroDepth} data-hero-depth><Image src="/brand/lens-hero.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.heroImage} /></div>
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

function OpticalScene() {
  return (
    <div className={styles.methodScene} data-motion-scene aria-hidden="true">
      <div className={styles.sceneTopline}><span>RWA / FIELD OF VIEW</span><span>03 LAYERS</span></div>
      <div className={styles.opticalDiagram}>
        <svg viewBox="0 0 360 360" fill="none">
          <circle cx="180" cy="180" r="150" stroke="currentColor" strokeOpacity=".15" strokeDasharray="1 7" />
          <path d="M180 16v24M180 320v24M16 180h24M320 180h24" stroke="currentColor" strokeOpacity=".4" />
          <circle cx="180" cy="180" r="116" stroke="currentColor" strokeOpacity=".4" />
          <g className={styles.orbit}>
            <ellipse cx="180" cy="180" rx="116" ry="54" stroke="currentColor" />
            <ellipse cx="180" cy="180" rx="54" ry="116" stroke="currentColor" strokeOpacity=".5" />
            <circle cx="296" cy="180" r="4" fill="currentColor" />
          </g>
          <g className={styles.scanBeam}><path d="M78 180h204" stroke="currentColor" strokeOpacity=".7" /><circle cx="180" cy="180" r="4" fill="currentColor" /></g>
          <circle cx="180" cy="180" r="9" stroke="currentColor" />
          <path d="M180 159v10m0 22v10m-21-21h10m22 0h10" stroke="currentColor" />
        </svg>
      </div>
      <div className={styles.sceneLegend}><span data-lens-step="1">01 / IDENTITY</span><span data-lens-step="2">02 / BALANCE</span><span data-lens-step="3">03 / CONTROL</span></div>
      <p>Look closer.<br /><span>Each layer brings more into focus.</span></p>
    </div>
  );
}

function Method({ immersive }: { immersive: boolean }) {
  return (
    <section id="how-it-works" tabIndex={-1} className={styles.method} aria-labelledby="method-title">
      <div className={styles.methodHeading} data-reveal>
        <p className={styles.sectionLabel}>02 / BEYOND THE SURFACE</p>
        <h2 id="method-title">A number is only<br /><span>part of the picture.</span></h2>
        <p>The useful questions live underneath. What is this token? How is its balance calculated? Who can change the rules?</p>
      </div>
      <div className={immersive ? styles.methodBody : undefined} data-motion-story>
      {immersive ? <OpticalScene /> : null}
      <div className={styles.methodRows}>
        <article className={styles.methodRow} data-reveal data-motion-chapter>
          <span className={styles.rowNumber}>01</span>
          <div className={styles.rowTitle}><p>IDENTITY</p><h3>Start with<br /> what&rsquo;s there.</h3></div>
          <div className={styles.rowCopy}><p>Read the mint, token program, decimals and authorities directly from public Solana data. Keep issuer attribution separate from what the chain actually says.</p><span>SPL TOKEN <span aria-hidden="true">/</span> TOKEN-2022</span></div>
          <ScanLine className={styles.rowIcon} size={35} strokeWidth={1} aria-hidden="true" />
        </article>
        <article className={styles.methodRow} data-reveal data-motion-chapter>
          <span className={styles.rowNumber}>02</span>
          <div className={styles.rowTitle}><p>BALANCE</p><h3>Make the<br /> numbers meet.</h3></div>
          <div className={styles.rowCopy}><p>Reconcile exact raw units with the amount you see. Explore how a scheduled multiplier can change a displayed balance while the underlying units stay fixed.</p><span>RAW UNITS <ArrowRight size={13} /> DISPLAYED AMOUNT</span></div>
          <span className={styles.balanceGlyph} aria-hidden="true">≈</span>
        </article>
        <article className={styles.methodRow} data-reveal data-motion-chapter>
          <span className={styles.rowNumber}>03</span>
          <div className={styles.rowTitle}><p>CONTROL & EVIDENCE</p><h3>Know what<br /> can change.</h3></div>
          <div className={styles.rowCopy}><p>Understand token controls, inspect the source observations, and take an evidence receipt with you. Export JSON or CSV with no account required.</p><span>AUTHORITIES <span aria-hidden="true">/</span> EXTENSIONS <span aria-hidden="true">/</span> RECEIPTS</span></div>
          <Crosshair className={styles.rowIcon} size={35} strokeWidth={1} aria-hidden="true" />
        </article>
      </div>
      </div>
      <div className={styles.methodNote} data-reveal><span className={styles.statusDot} /><p>Built for the curious holder, the careful integrator, and the team that needs the numbers to add up.</p></div>
    </section>
  );
}

function Footer() {
  return (
    <>
      <section className={styles.closing} aria-labelledby="closing-title">
        <p className={styles.sectionLabel} data-reveal>LESS GUESSWORK. MORE CONTEXT.</p>
        <div data-reveal><h2 id="closing-title">See what&rsquo;s<br />really there.</h2><a href="#inspect" aria-label="Start a token inspection"><ArrowUpRight size={58} strokeWidth={1.25} /></a></div>
        <p data-reveal>One token. A clearer perspective.<br />Start with a public mint address.</p>
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
    <ScrollExperience className={styles.experience} enabled={!compact}>
      <a className="skip-link" href="#inspect">Skip to inspection</a>
      <div className={styles.darkOpening}>
        <Header reportsEnabled={reportsEnabled} />
      </div>
      <main>
        {compact ? null : <div className={styles.darkOpening}><Hero cluster={cluster} /></div>}
        <section className={`${styles.inspector} ${compact ? styles.compactInspector : ''}`} aria-labelledby={compact ? 'page-title' : 'inspection-title'}>
          <div className={styles.inspectorIntro} data-reveal>
            <div><p className={styles.sectionLabel}>01 / THE INSPECTOR</p>{compact ? <h1 id="page-title">The evidence,<br /><span>in focus.</span></h1> : <h2 id="inspection-title">The evidence,<br /><span>in focus.</span></h2>}</div>
            <div><p>Paste a mint address to inspect a token, or explore a synthetic example below. Add a public wallet to reconcile a holder&rsquo;s balance.</p><span><span className={styles.statusDot} />SOLANA {cluster === 'mainnet-beta' ? 'MAINNET' : 'DEVNET'} <span aria-hidden="true">/</span> NO WALLET CONNECTION</span></div>
          </div>
          <RwaLensShell cluster={cluster} reportsEnabled={reportsEnabled} />
        </section>
        <Method immersive={!compact} />
      </main>
      <Footer />
    </ScrollExperience>
  );
}
