import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowDownToLine, ArrowUpRight, ArrowRight, FileText } from 'lucide-react';
import { Brand } from '@/components/rwa/brand';
import styles from './brand-kit.module.css';

export const metadata: Metadata = {
  title: 'Brand kit',
  description: 'The RWA Lens optical identity. Download campaign artwork, headers, wallpapers, logos and editable sources.',
  alternates: { canonical: '/brand-kit' },
  openGraph: {
    title: 'RWA Lens — Clarity, by design.',
    description: 'Original artwork, optical identity and a complete campaign kit.',
    images: [{ url: '/brand-kit/og-image.png', width: 1200, height: 630, alt: 'RWA Lens — Real assets. Clearer vision.' }],
  },
};

type Artwork = { name: string; label: string; width: number; height: number; description: string };
const campaign: Artwork[] = [
  { name: 'social-square', label: '01 / Clearer vision', width: 1080, height: 1080, description: 'The opening statement. A study in glass, light and focus.' },
  { name: 'social-balance', label: '02 / Beyond the balance', width: 1080, height: 1080, description: 'An editorial interruption in our signature citron.' },
  { name: 'social-evidence', label: '03 / Follow the evidence', width: 1080, height: 1080, description: 'A quieter frame for a sharper question.' },
];
const wide: Artwork[] = [
  { name: 'header-x', label: 'X profile header', width: 1500, height: 500, description: 'A panoramic composition with room for your profile photo.' },
  { name: 'header-linkedin', label: 'LinkedIn profile header', width: 1584, height: 396, description: 'A tailored crop with the message above the avatar area.' },
  { name: 'og-image', label: 'Link preview', width: 1200, height: 630, description: 'Our default Open Graph image for shared links.' },
  { name: 'ad-landscape', label: 'Landscape campaign', width: 1200, height: 628, description: 'A direct invitation to explore the evidence.' },
];
const portrait: Artwork[] = [
  { name: 'social-portrait', label: 'Portrait feed post', width: 1080, height: 1350, description: 'An extended composition for the feed.' },
  { name: 'social-story', label: 'Story', width: 1080, height: 1920, description: 'A full-height material study with interface-safe type.' },
];

function Download({ name, ext = 'png', children }: { name: string; ext?: string; children?: React.ReactNode }) {
  return <a href={`/brand-kit/${name}.${ext}`} download className={styles.download}><ArrowDownToLine size={15} aria-hidden="true" />{children ?? ext.toUpperCase()}<span className="visually-hidden"> — {name.replaceAll('-', ' ')}</span></a>;
}

function ArtworkCard({ asset, className = '' }: { asset: Artwork; className?: string }) {
  return <article className={`${styles.artwork} ${className}`}>
    <a className={styles.artImage} href={`/brand-kit/${asset.name}.png`} target="_blank" rel="noreferrer" aria-label={`View ${asset.label} at full resolution`}>
      <Image src={`/brand-kit/${asset.name}-preview.webp`} alt={asset.description} width={asset.width} height={asset.height} sizes="(max-width: 700px) 94vw, 50vw" />
      <span className={styles.expand}><ArrowUpRight size={20} aria-hidden="true" /></span>
    </a>
    <div className={styles.caption}><div><h3>{asset.label}</h3><p>{asset.width} × {asset.height} px</p></div><div className={styles.formats}><Download name={asset.name} /><Download name={asset.name} ext="svg" /></div></div>
  </article>;
}

export default function BrandKitPage() {
  return <div className={styles.page}>
    <a className="skip-link" href="#assets">Skip to assets</a>
    <header className={styles.header}>
      <Link href="/" aria-label="RWA Lens home"><Brand light /></Link>
      <nav aria-label="Main navigation"><Link href="/rwa">Inspector</Link><Link href="/brand-kit" aria-current="page">Brand kit</Link><a className={styles.navCta} href="/brand-kit/rwa-lens-brand-kit.zip" download>Get the kit <ArrowDownToLine size={15} aria-hidden="true" /></a></nav>
    </header>
    <main>
      <section className={styles.hero} aria-labelledby="page-title">
        <Image src="/brand/lens-hero.webp" alt="" fill sizes="100vw" preload className={styles.heroArt} />
        <div className={styles.heroContent}><p className={styles.eyebrow}><span /> THE OPTICAL IDENTITY / 2026</p><h1 id="page-title">Clarity,<br />by <em>design.</em></h1><p className={styles.heroCopy}>A new perspective on real-world tokens.<br />An identity built around the art of looking closer.</p><a className={styles.primary} href="/brand-kit/rwa-lens-brand-kit.zip" download>Download the complete kit <ArrowDownToLine size={18} aria-hidden="true" /></a><p className={styles.fileNote}>Logos, campaign artwork, wallpapers &amp; editable sources</p></div>
        <div className={styles.heroBottom}><span>RWA LENS / BRAND RESOURCES</span><a href="#assets">Explore the collection <ArrowRight size={17} aria-hidden="true" /></a></div>
      </section>

      <section id="assets" className={styles.section} aria-labelledby="campaign-title">
        <div className={styles.sectionHead}><div><p className={styles.kicker}>01 / CAMPAIGN</p><h2 id="campaign-title">One idea.<br />Three perspectives.</h2></div><p>Glass reveals. Light brings focus. Our campaign pairs original optical artwork with a simple invitation: look closer.</p></div>
        <div className={styles.campaignGrid}>{campaign.map(asset => <ArtworkCard key={asset.name} asset={asset} />)}</div>
      </section>

      <section className={`${styles.section} ${styles.darkSection}`} aria-labelledby="wallpaper-title">
        <div className={styles.sectionHead}><div><p className={styles.kicker}>02 / A DIFFERENT VIEW</p><h2 id="wallpaper-title">Space to focus.</h2></div><p>Quiet wallpapers for the screens you spend time with. Original glass studies, subtle light and room to breathe.</p></div>
        <div className={styles.wallpapers}>
          <ArtworkCard className={styles.desktopWallpaper} asset={{ name: 'wallpaper-desktop', label: 'Desktop wallpaper', width: 3840, height: 2160, description: 'A glass lens on a charcoal ground with understated RWA Lens branding.' }} />
          <ArtworkCard className={styles.mobileWallpaper} asset={{ name: 'wallpaper-mobile', label: 'Mobile wallpaper', width: 1440, height: 2560, description: 'A portrait glass study with open space for your clock.' }} />
        </div>
        <p className={styles.resolutionNote}>Export sizes shown. Original generated artwork: 1672 × 941 landscape and 941 × 1672 portrait, upscaled for wallpaper exports.</p>
      </section>

      <section className={styles.section} aria-labelledby="headers-title">
        <div className={styles.sectionHead}><div><p className={styles.kicker}>03 / IN EVERY FORMAT</p><h2 id="headers-title">A consistent point of view.</h2></div><p>Purpose-built crops for profiles, shared links and campaigns. Every format has its own composition and editable source.</p></div>
        <div className={styles.wideGrid}>{wide.map(asset => <ArtworkCard key={asset.name} asset={asset} />)}</div>
        <div className={styles.portraitGrid}><div className={styles.portraitNote}><p className={styles.kicker}>MADE FOR THE FEED</p><h3>A taller<br />perspective.</h3><p>Portrait and story formats preserve the whole lens, with generous space around the message.</p><ArrowUpRight size={54} strokeWidth={1} aria-hidden="true" /></div>{portrait.map(asset => <ArtworkCard key={asset.name} asset={asset} />)}</div>
      </section>

      <section className={`${styles.section} ${styles.identitySection}`} aria-labelledby="identity-title">
        <div className={styles.sectionHead}><div><p className={styles.kicker}>04 / THE ESSENTIALS</p><h2 id="identity-title">An identity in focus.</h2></div><p>An optical mark. A tightly set wordmark. A disciplined palette of ink, ivory and citron.</p></div>
        <div className={styles.logoGrid}>
          {[{ name: 'rwa-lens-wordmark', label: 'Primary wordmark', dark: false }, { name: 'rwa-lens-wordmark-light', label: 'Reverse wordmark', dark: true }].map(logo => <article key={logo.name} className={styles.logoCard}><div className={`${styles.logoPreview} ${logo.dark ? styles.darkLogo : ''}`}><Image src={`/brand-kit/${logo.name}.svg`} alt={logo.label} width={252} height={48} unoptimized /></div><div className={styles.caption}><h3>{logo.label}</h3><Download name={logo.name} ext="svg" /></div></article>)}
        </div>
        <div className={styles.markDownloads}><p>Optical mark / transparent SVG</p><Download name="rwa-lens-mark" ext="svg">Primary</Download><Download name="rwa-lens-mark-light" ext="svg">Reverse</Download><Download name="rwa-lens-mark-monochrome" ext="svg">One ink</Download></div>
        <div className={styles.profileRow}>{['light', 'dark'].map(tone => <article key={tone} className={styles.profile}><Image src={`/brand-kit/profile-${tone}-preview.webp`} alt={`${tone === 'light' ? 'Ivory' : 'Ink'} optical profile icon`} width={128} height={128} /><div><h3>{tone === 'light' ? 'Ivory' : 'Ink'} profile icon</h3><p>1024 × 1024 px</p><div className={styles.formats}><Download name={`profile-${tone}`} /><Download name={`profile-${tone}`} ext="svg" /></div></div></article>)}</div>
        <div className={styles.palette}>{[{ name: 'Ink', value: '#101211' }, { name: 'Ivory', value: '#f2f2e9' }, { name: 'Citron', value: '#d9ff65' }].map(color => <div key={color.name} style={{ background: color.value, color: color.name === 'Ink' ? '#f2f2e9' : '#101211' }}><span>{color.name}</span><code>{color.value}</code></div>)}</div>
        <div className={styles.guide}><div><h3>The details make the difference.</h3><p>Clear space, typography, source resolutions and guidance for using the identity.</p></div><a className={styles.guideLink} href="/brand-kit/brand-guide.md" download><FileText size={18} aria-hidden="true" /> Download the brand guide <ArrowDownToLine size={17} aria-hidden="true" /></a></div>
      </section>
    </main>
    <footer className={styles.footer}><div><Link href="/" aria-label="RWA Lens home"><Brand light /></Link><p>Real assets. Clearer vision.</p></div><p>Use these assets to identify RWA Lens.<br />They do not imply an endorsement or partnership.</p><Link href="/rwa">Open the inspector <ArrowUpRight size={18} aria-hidden="true" /></Link></footer>
  </div>;
}
