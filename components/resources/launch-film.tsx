import Link from 'next/link';
import { ArrowUpRight, Download, Film } from 'lucide-react';
import styles from './launch-film.module.css';

export function LaunchFilm({ landing = false }: { landing?: boolean }) {
  return (
    <section id="launch-film" tabIndex={-1} className={`${styles.film} ${landing ? styles.landing : ''}`} aria-labelledby="launch-film-title">
      <div className={styles.inner}>
        <div className={styles.heading} data-reveal>
          <div>
            <p className={styles.eyebrow}><Film size={13} aria-hidden="true" /> THE LAUNCH FILM</p>
            <h2 id="launch-film-title">A clearer perspective.<br /><span>In thirty seconds.</span></h2>
          </div>
          <p className={styles.intro}>From the first look to the source behind the number. A film about seeing more in every token.</p>
        </div>
        <div className={styles.frame}>
          <video controls playsInline preload="none" width="1920" height="1080" poster="/demo/rwa-lens-showreel-poster.jpg" aria-label="RWA Lens launch film" aria-describedby="launch-film-description">
            <source src="/demo/rwa-lens-showreel-master.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/rwa-lens-showreel.vtt" srcLang="en" label="English sound captions" />
            Your browser does not support this video. <a href="/demo/rwa-lens-showreel-master.mp4">Download the launch film</a>.
          </video>
        </div>
        <div className={styles.footer}>
          <p id="launch-film-description">30 seconds · 1080p · Music & motion, no narration</p>
          <div className={styles.links}>
            <Link href={landing ? '/demo#demo-video-title' : '/rwa'}>{landing ? 'Take the narrated tour' : 'Explore the app'} <ArrowUpRight size={15} aria-hidden="true" /></Link>
            <a href="/demo/rwa-lens-showreel-master.mp4" download><Download size={15} aria-hidden="true" /> Download film <span className={styles.fileSize}>(28 MB)</span></a>
          </div>
        </div>
        <details className={styles.description}>
          <summary>Read the film&rsquo;s visual description</summary>
          <div>
            <p>A glass lens comes into focus against a dark background. Lime light traces its edge as the words &ldquo;Real assets. Clearer vision.&rdquo; appear. The view passes through the RWA Lens mark into the inspection workspace.</p>
            <p>Five chapters move through token identity, balances, controls, liquidity, and evidence. A USDY inspection shows its mint and authorities. The balance chapter uses a labeled synthetic Treasury fixture to explain a changing display multiplier. Token-2022 fixture controls are labeled separately from the USDY observation.</p>
            <p>Source reads come together in an evidence receipt, followed by &ldquo;Observations, not attestations.&rdquo; The film closes with &ldquo;See what&rsquo;s really there,&rdquo; the RWA Lens mark, and an invitation to open the app.</p>
            <p>The soundtrack contains electronic music and interface effects, with no speech. Mainnet figures were observed on September 30, 2026. The film focuses on read-only inspection.</p>
          </div>
        </details>
      </div>
    </section>
  );
}
