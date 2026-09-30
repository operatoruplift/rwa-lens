import Link from 'next/link';
import { ArrowUpRight, Download, FileText } from 'lucide-react';
import styles from './demo-video.module.css';

export function DemoVideo() {
  return <section className={styles.demo} aria-labelledby="demo-video-title">
    <div className={styles.heading}><div><p>THE WORKSPACE / IN MOTION</p><h2 id="demo-video-title">A closer look, in 90 seconds.</h2></div><span>1080p · Narrated · Captioned</span></div>
    <div className={styles.frame}>
      <video controls playsInline preload="metadata" poster="/demo/rwa-lens-walkthrough-poster.jpg" aria-label="RWA Lens product walkthrough" aria-describedby="demo-video-description">
        <source src="/demo/rwa-lens-walkthrough.mp4" type="video/mp4" />
        <track default kind="captions" src="/demo/rwa-lens-walkthrough.vtt" srcLang="en" label="English" />
        Your browser does not support this video. <a href="/demo/rwa-lens-walkthrough.mp4">Download the walkthrough</a>.
      </video>
    </div>
    <div className={styles.detail}><p id="demo-video-description">Move from a mainnet token inspection to its controls, source evidence, liquidity, and your personal watchlist. Captured from the app with public mainnet reads; market figures reflect the recording time.</p><div className={styles.links}><Link href="/rwa" className={styles.launch}>Open the app <ArrowUpRight size={15} /></Link><a href="/demo/rwa-lens-walkthrough.mp4" download><Download size={15} />Download video</a><a href="/demo/rwa-lens-transcript.txt"><FileText size={15} />Read transcript</a></div></div>
    <details className={styles.overview}><summary>Watch the short overview <span>THE QUICK TOUR</span></summary><div className={styles.frame}><video controls playsInline preload="none" poster="/demo/rwa-lens-walkthrough-poster.jpg" aria-label="RWA Lens short overview"><source src="/demo/rwa-lens-overview.mp4" type="video/mp4" /><track default kind="captions" src="/demo/rwa-lens-overview.vtt" srcLang="en" label="English" />Your browser does not support this video. <a href="/demo/rwa-lens-overview.mp4">Download the overview</a>.</video></div><div className={styles.links}><a href="/demo/rwa-lens-overview.mp4" download><Download size={15} />Download short overview</a></div></details>
  </section>;
}
