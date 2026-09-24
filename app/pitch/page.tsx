import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Download, Play } from 'lucide-react';
import { ResourceShell } from '@/components/resources/resource-shell';
import styles from '@/components/resources/resources.module.css';

export const metadata: Metadata = { title: 'Pitch & presentation — RWA Lens', description: 'The RWA Lens pitch: the problem, product, technical edge and path to adoption. Download the editable deck, PDF and presenter notes.', alternates: { canonical: '/pitch' } };

export default function PitchPage() {
  return (
    <ResourceShell active="pitch" eyebrow="THE BIG PICTURE / PRESENTATION" title="Clarity deserves a bigger stage." description="The product, the engineering, and the opportunity—in a complete presentation built to share. Present in your browser or take the editable deck with you.">
      <div className={styles.content}>
        <section className={styles.pitchCover} aria-labelledby="cover-title"><p>RWA LENS / SOLANA</p><h2 id="cover-title">Real assets.<br /><span>Clearer vision.</span></h2><a className={styles.button} href="/presentation/rwa-lens-pitch.html"><Play size={16} />Open presentation <ArrowUpRight size={17} /></a></section>
        <section className={styles.section}><p className={styles.label}>THE PRESENTATION KIT</p><h2>Ready to present. Easy to share.</h2><div className={styles.grid}><article><span>01 / EDITABLE</span><h3>PowerPoint deck</h3><p>Edit the narrative, adjust the ask, or tailor the slides to your audience. Text and diagrams remain editable.</p><a className={styles.button} href="/presentation/rwa-lens-pitch.pptx" download><Download size={16} />Download PPTX</a></article><article><span>02 / SHAREABLE</span><h3>PDF deck</h3><p>A polished document for review and follow-up, preserving the presentation layout on every screen.</p><a className={styles.button} href="/presentation/rwa-lens-pitch.pdf" download><Download size={16} />Download PDF</a></article><article><span>03 / PRESENTER</span><h3>Notes & Q&A</h3><p>The slide-by-slide talk track, product walkthrough and answers to the questions that matter.</p><a className={styles.button} href="/presentation/rwa-lens-presenter-notes.md" download><Download size={16} />Download notes</a></article></div><div className={styles.actions}><a className={styles.button} href="/presentation/rwa-lens-pitch.html" download><Download size={16} />Offline HTML deck</a><Link className={styles.button} href="/demo">Run the live demo <ArrowUpRight size={16} /></Link><Link className={styles.button} href="/technical">Read the technical breakdown <ArrowUpRight size={16} /></Link></div></section>
      </div>
    </ResourceShell>
  );
}
