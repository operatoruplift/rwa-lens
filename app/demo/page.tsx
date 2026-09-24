import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Download } from 'lucide-react';
import { RwaLensShell } from '@/components/rwa/rwa-lens-shell';
import { ResourceShell } from '@/components/resources/resource-shell';
import { DemoGuide } from '@/components/resources/demo-guide';
import styles from '@/components/resources/resources.module.css';

export const metadata: Metadata = { title: 'Product demo — RWA Lens', description: 'Follow a complete live Solana token inspection, from mint identity and public balances to controls and downloadable evidence.', alternates: { canonical: '/demo' } };

export default function DemoPage() {
  return (
    <ResourceShell active="demo" eyebrow="THE PRODUCT / IN ACTION" title="From address to insight." description="A complete walkthrough of the lens. Follow four chapters, inspect a real Solana mint, and leave with a receipt you can independently review.">
      <div className={styles.content}>
        <DemoGuide />
        <div className={styles.section}><p className={styles.label}>THE LIVE WORKSPACE</p><h2>Your evidence starts here.</h2><p>The inspector below makes actual mainnet reads. Start with USDY, select another listed asset, or enter a mint of your own. Every observation keeps its source and time.</p></div>
      </div>
      <RwaLensShell cluster="mainnet-beta" reportsEnabled={false} />
      <div className={styles.content}>
        <section className={styles.section}><p className={styles.label}>TAKE A CLOSER LOOK</p><h2>The full story, in your format.</h2><div className={styles.actions}><Link className={`${styles.button} ${styles.buttonPrimary}`} href="/technical">Technical breakdown <ArrowUpRight size={17} /></Link><Link className={styles.button} href="/pitch">Pitch & presentation <ArrowUpRight size={17} /></Link><a className={styles.button} href="/presentation/rwa-lens-demo-guide.md" download><Download size={16} />Presenter walkthrough</a></div></section>
      </div>
    </ResourceShell>
  );
}
