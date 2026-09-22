import Link from 'next/link';
import { ArrowUpRight, BookOpen, Layers3, ScanLine, ShieldCheck } from 'lucide-react';
import { RwaLensShell } from '@/components/rwa/rwa-lens-shell';
import { Brand } from '@/components/rwa/brand';
import { repositoryState } from '@/lib/server/rwa/repository';
import { sessionsConfigured } from '@/lib/server/rwa/session';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'RWA Lens — know what your real-world token means',
  description: 'Read the token behind the asset. Inspect Solana mint identity, raw and displayed balances, Token-2022 extensions, authorities and evidence. Public inspection needs no wallet.',
};

export default function RwaPage() {
  const cluster = process.env.RWA_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  const reportsEnabled = repositoryState() === 'ready' && sessionsConfigured();
  return (
    <>
      <a className="skip-link" href="#inspect">Skip to inspection</a>
      <header className="site-header">
        <div className="site-width header-inner">
          <Link href="/" aria-label="RWA Lens home"><Brand /></Link>
          <nav aria-label="Main navigation" className="main-nav">
            <a href="#inspect" className="nav-active">Inspect</a>
            <a href="#how-it-works">How it works</a>
            {reportsEnabled ? <a href="#reports">Reports</a> : null}
            <Link href="/brand-kit">Brand kit</Link>
            <a href="https://github.com/operatoruplift/rwa-lens" target="_blank" rel="noreferrer noopener" className="source-link">Source <ArrowUpRight size={13} /></a>
          </nav>
          <span className="network-badge"><span />Solana {cluster === 'mainnet-beta' ? 'mainnet' : 'devnet'}</span>
        </div>
      </header>
      <main>
        <section className="site-width hero" aria-labelledby="page-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" />THE TOKEN BEHIND THE ASSET</p>
            <h1 id="page-title">Know what your<br />real-world token <span>means.</span></h1>
          </div>
          <div className="hero-description">
            <p>One clear view of your token&rsquo;s identity, the balance behind the number, and the controls that affect its movement.</p>
            <div className="hero-assurances"><span><ScanLine size={15} /> Public Solana data</span><span><ShieldCheck size={15} /> Read-only by design</span></div>
          </div>
        </section>
        <RwaLensShell cluster={cluster} reportsEnabled={reportsEnabled} />
        <section id="how-it-works" className="how-section site-width">
          <div className="how-intro"><p className="eyebrow">FROM A MINT TO AN ANSWER</p><h2>A balance is a number.<br />Understanding it takes context.</h2><p>For treasury teams reconciling holdings, integrators evaluating a token, and holders checking who can change it.</p><a href="#inspect" className="text-link">Inspect a token <ArrowUpRight size={16} /></a></div>
          <div className="how-steps">
            <article><span className="how-icon"><ScanLine size={21} /></span><div><span className="section-index">01 / IDENTIFY</span><h3>Start with what is on chain.</h3><p>Decode the mint&rsquo;s program, decimals and authorities. SPL Token and Token-2022 are shown as observed; issuer attribution stays separate.</p></div></article>
            <article><span className="how-icon"><Layers3 size={21} /></span><div><span className="section-index">02 / RECONCILE</span><h3>See the units behind the display.</h3><p>Sum exact raw balances, then explain the conversion. A scheduled multiplier can change the displayed amount without a transfer.</p></div></article>
            <article><span className="how-icon"><BookOpen size={21} /></span><div><span className="section-index">03 / UNDERSTAND</span><h3>Take the evidence with you.</h3><p>Read each control and its limits, inspect the source observations, and export a JSON or CSV receipt. No account required.</p></div></article>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="site-width footer-inner"><div><Link href="/" aria-label="RWA Lens home"><Brand /></Link><p>Clarity for real-world tokens.</p></div><p>Observations, not attestations. RWA Lens does not establish asset backing, legal compliance or investment performance. No transaction signing or asset movement. Optional report sign-in uses a message, never a transaction.</p><div className="footer-links"><Link className="text-link" href="/brand-kit">Brand kit</Link><a className="text-link" href="https://github.com/operatoruplift/rwa-lens" target="_blank" rel="noreferrer noopener">Built in the open <ArrowUpRight size={14} /></a></div></div></footer>
    </>
  );
}
