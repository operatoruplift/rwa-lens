import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bookmark, ChartNoAxesCombined, ChevronRight, CircleHelp, ScanLine, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/rwa/brand';
import styles from './workspace-shell.module.css';

type WorkspacePage = 'inspector' | 'yield' | 'watchlist';
const navigation = [
  { id: 'inspector', label: 'Inspector', href: '/rwa', icon: ScanLine },
  { id: 'yield', label: 'Yield', href: '/yield', icon: ChartNoAxesCombined },
  { id: 'watchlist', label: 'Watchlist', href: '/watchlist', icon: Bookmark },
] as const;

export function WorkspaceShell({ active, title, description, children, cluster = 'mainnet-beta' }: {
  active: WorkspacePage; title: string; description: string; children: ReactNode; cluster?: 'mainnet-beta' | 'devnet';
}) {
  return <div className={styles.workspace}>
    <a href={active === 'inspector' ? '#inspect' : '#workspace-content'} className="skip-link">Skip to {active === 'inspector' ? 'inspector' : 'content'}</a>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand} aria-label="RWA Lens home"><Brand light /></Link>
      <span className={styles.navLabel}>YOUR WORKSPACE</span>
      <nav aria-label="Workspace navigation" className={styles.navigation}>
        {navigation.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} aria-current={active === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{label}</span>{active === id ? <ChevronRight size={14} className={styles.currentArrow} /> : null}</Link>)}
      </nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.tour}><CircleHelp size={21} /><strong>A clearer starting point.</strong><p>Meet the token behind the ticker.</p><Link href="/demo">Take the product tour <ArrowUpRight size={15} /></Link></div>
        <nav aria-label="Resources" className={styles.resources}><Link href="/demo">Demo</Link><Link href="/technical">Technical</Link><Link href="/pitch">Pitch</Link><Link href="/brand-kit">Brand kit</Link></nav>
        <p className={styles.signature}>A closer look. A clearer view.</p>
      </div>
    </aside>
    <div className={styles.body}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.mobileBrand} aria-label="RWA Lens home"><Brand /></Link>
        <div className={styles.breadcrumb}><span>Workspace</span><ChevronRight size={14} /><strong>{navigation.find(item => item.id === active)?.label}</strong></div>
        <span className={styles.network}><span />Solana {cluster === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}</span>
        <Link href="/demo" className={styles.topTour}>Product tour <ArrowUpRight size={15} /></Link>
      </header>
      <main id="workspace-content" tabIndex={-1} className={styles.content}>
        <div className={styles.intro}><div><p className={styles.eyebrow}>REAL ASSETS. CLEARER VISION.</p><h1>{title}</h1><p className={styles.description}>{description}</p></div><span className={styles.publicData}><ShieldCheck size={16} />Public data. Your perspective.</span></div>
        {children}
      </main>
      <footer className={styles.footer}><span>RWA Lens / Independent token intelligence</span><div className={styles.footerLinks}><Link href="/demo">Watch the demo <ArrowUpRight size={13} /></Link><Link href="/brand-kit">Brand kit <ArrowUpRight size={13} /></Link><Link href="/technical">How observations work <ArrowUpRight size={13} /></Link></div></footer>
    </div>
  </div>;
}
