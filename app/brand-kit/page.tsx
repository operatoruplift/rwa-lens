import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowDownToLine, ArrowUpRight, FileText } from 'lucide-react';
import { Brand } from '@/components/rwa/brand';

export const metadata: Metadata = {
  title: 'Brand kit',
  description: 'Download the RWA Lens mark, wordmark, profile artwork, social graphics, headers and the written brand guide.',
  alternates: { canonical: '/brand-kit' },
  openGraph: {
    title: 'RWA Lens brand kit',
    description: 'Marks, wordmarks, profiles, social artwork and the written guide.',
    images: [{ url: '/brand-kit/og-image.png', width: 1200, height: 630, alt: 'RWA Lens brand kit' }],
  },
};

type Asset = {
  file: string;
  label: string;
  description: string;
  format: string;
  width: number;
  height: number;
  /** Preview sits on navy when the artwork is drawn for a dark ground. */
  tone?: 'dark';
};

const groups: { title: string; note: string; assets: Asset[] }[] = [
  {
    title: 'Marks and wordmarks',
    note: 'The prism reads as a lens and as a stack of records. Keep clear space of at least the height of the top facet.',
    assets: [
      { file: 'rwa-lens-mark.svg', label: 'Mark', description: 'Primary prism on a transparent ground.', format: 'SVG · 40 × 40', width: 148, height: 148 },
      { file: 'rwa-lens-mark-light.svg', label: 'Mark · reverse', description: 'For navy grounds and photography.', format: 'SVG · 40 × 40', width: 148, height: 148, tone: 'dark' },
      { file: 'rwa-lens-mark-monochrome.svg', label: 'Mark · one ink', description: 'Print and low-fidelity reproduction.', format: 'SVG · 40 × 40', width: 148, height: 148 },
      { file: 'rwa-lens-wordmark.svg', label: 'Wordmark', description: 'Horizontal lockup with the indigo period.', format: 'SVG · 260 × 56', width: 260, height: 56 },
      { file: 'rwa-lens-wordmark-light.svg', label: 'Wordmark · reverse', description: 'Lockup for dark surfaces.', format: 'SVG · 260 × 56', width: 260, height: 56, tone: 'dark' },
    ],
  },
  {
    title: 'Profiles and app icons',
    note: 'Square artwork for avatars, directories and app listings. The ledger field is clipped to the rounded corner.',
    assets: [
      { file: 'profile-light.svg', label: 'Profile · canvas (vector)', description: 'Scales to any avatar size without resampling.', format: 'SVG · 1024 × 1024', width: 240, height: 240 },
      { file: 'profile-dark.svg', label: 'Profile · navy (vector)', description: 'Reverse avatar for dark directories.', format: 'SVG · 1024 × 1024', width: 240, height: 240, tone: 'dark' },
      { file: 'profile-light.png', label: 'Profile · canvas', description: 'Raster avatar where SVG is not accepted.', format: 'PNG · 1024 × 1024', width: 240, height: 240 },
      { file: 'profile-dark.png', label: 'Profile · navy', description: 'Raster reverse avatar.', format: 'PNG · 1024 × 1024', width: 240, height: 240, tone: 'dark' },
    ],
  },
  {
    title: 'Social and ads',
    note: 'One editorial composition, re-proportioned per surface rather than stretched to fit.',
    assets: [
      { file: 'og-image.png', label: 'Link preview', description: 'Open Graph card for shared links.', format: 'PNG · 1200 × 630', width: 480, height: 252 },
      { file: 'social-square.png', label: 'Social post', description: 'Square post for feeds and profile grids.', format: 'PNG · 1080 × 1080', width: 300, height: 300 },
      { file: 'social-story.png', label: 'Story', description: 'Vertical artwork for mobile channels.', format: 'PNG · 1080 × 1920', width: 200, height: 356, tone: 'dark' },
      { file: 'ad-landscape.png', label: 'Ad · landscape', description: 'Link ad with a single product claim.', format: 'PNG · 1200 × 628', width: 480, height: 251 },
    ],
  },
  {
    title: 'Headers and wallpaper',
    note: 'Wide crops keep the lockup clear of avatar overlays and platform chrome.',
    assets: [
      { file: 'header-x.png', label: 'Header · X', description: 'Banner sized for X profiles.', format: 'PNG · 1500 × 500', width: 480, height: 160, tone: 'dark' },
      { file: 'header-linkedin.png', label: 'Header · LinkedIn', description: 'Banner sized for LinkedIn pages.', format: 'PNG · 1584 × 396', width: 480, height: 120 },
      { file: 'wallpaper-desktop.png', label: 'Wallpaper', description: 'Desktop background at 16:9.', format: 'PNG · 2560 × 1440', width: 480, height: 270, tone: 'dark' },
    ],
  },
];

const palette = [
  { name: 'Navy', hex: '#101a3a', use: 'Primary ink and dark grounds' },
  { name: 'Navy soft', hex: '#46516e', use: 'Secondary text' },
  { name: 'Navy faint', hex: '#616b82', use: 'Labels and captions' },
  { name: 'Indigo', hex: '#5b5ce2', use: 'The period, eyebrows, links' },
  { name: 'Facet', hex: '#9e9ff8', use: 'The lit face of the mark' },
  { name: 'Canvas', hex: '#f6f7fb', use: 'Page ground' },
  { name: 'Paper', hex: '#ffffff', use: 'Cards and surfaces' },
  { name: 'Rule', hex: '#e3e6ef', use: 'Ledger grid and hairlines' },
];

export default function BrandKitPage() {
  return (
    <>
      <a className="skip-link" href="#assets">Skip to assets</a>
      <header className="site-header">
        <div className="site-width header-inner">
          <Link href="/rwa" aria-label="RWA Lens home"><Brand /></Link>
          <nav aria-label="Main navigation" className="main-nav">
            <Link href="/rwa">Inspect</Link>
            <Link href="/brand-kit" className="nav-active" aria-current="page">Brand kit</Link>
            <a href="https://github.com/operatoruplift/rwa-lens" target="_blank" rel="noreferrer noopener" className="source-link">Source <ArrowUpRight size={13} /></a>
          </nav>
        </div>
      </header>

      <main>
        <section className="site-width hero" aria-labelledby="page-title">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" />THE TOKEN BEHIND THE ASSET</p>
            <h1 id="page-title">A brand that states<br />what it <span>can prove.</span></h1>
          </div>
          <div className="hero-description">
            <p>RWA Lens reports exactly what it observes on chain. These assets carry the same discipline: name the thing, end the sentence, claim nothing further.</p>
            <div className="hero-assurances">
              <a className="text-link" href="/brand-kit/rwa-lens-brand-kit.zip" download><ArrowDownToLine size={15} /> Download everything (358 KB)</a>
              <a className="text-link" href="/brand-kit/brand-guide.md" download><FileText size={15} /> Read the brand guide</a>
            </div>
          </div>
        </section>

        <section id="assets" className="site-width kit-section" aria-labelledby="assets-title">
          <h2 id="assets-title" className="visually-hidden">Downloadable assets</h2>
          {groups.map(group => (
            <div key={group.title} className="kit-group">
              <div className="kit-group-head">
                <h3>{group.title}</h3>
                <p>{group.note}</p>
              </div>
              <ul className="kit-grid">
                {group.assets.map(asset => (
                  <li key={asset.file} className="kit-card">
                    <div className={`kit-preview${asset.tone === 'dark' ? ' is-dark' : ''}`}>
                      <Image src={`/brand-kit/${asset.file}`} alt={`${asset.label} preview`} width={asset.width} height={asset.height} unoptimized />
                    </div>
                    <div className="kit-meta">
                      <h4>{asset.label}</h4>
                      <p>{asset.description}</p>
                      <span className="kit-format">{asset.format}</span>
                    </div>
                    <a className="kit-download" href={`/brand-kit/${asset.file}`} download>
                      <ArrowDownToLine size={14} aria-hidden="true" />
                      Download {asset.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="site-width kit-section" aria-labelledby="palette-title">
          <div className="kit-group-head">
            <h3 id="palette-title">Colour</h3>
            <p>State colours in the product (amber, green, red) are never brand colours. Here, a colour that means attention keeps meaning only that.</p>
          </div>
          <ul className="palette-grid">
            {palette.map(entry => (
              <li key={entry.hex}>
                <span className="swatch" style={{ background: entry.hex }} aria-hidden="true" />
                <strong>{entry.name}</strong>
                <code>{entry.hex}</code>
                <span>{entry.use}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="site-width kit-section" aria-labelledby="type-title">
          <div className="kit-group-head">
            <h3 id="type-title">Typography</h3>
            <p>A serif wordmark against a sans interface, deliberately: the brand speaks, the data does not.</p>
          </div>
          <div className="type-specimens">
            <div className="type-card">
              <span className="kit-format">WORDMARK · GEORGIA</span>
              <p className="specimen-serif">RWA <em>Lens</em><span>.</span></p>
              <p>The period ends the sentence. Never drop it, never recolour it.</p>
            </div>
            <div className="type-card">
              <span className="kit-format">INTERFACE · INTER</span>
              <p className="specimen-sans">Identity. Balance. Controls.</p>
              <p>Every heading, label and paragraph in the product.</p>
            </div>
            <div className="type-card">
              <span className="kit-format">DATA · UI MONOSPACE</span>
              <p className="specimen-mono">EPjFWdd5…TDt1v</p>
              <p>Addresses and amounts, so a reader can compare character by character.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-width footer-inner">
          <div><Link href="/rwa" aria-label="RWA Lens home"><Brand /></Link><p>Clarity for real-world tokens.</p></div>
          <p>These assets identify RWA Lens. They do not imply an endorsement, a partnership, or any claim about an issuer or asset.</p>
          <a className="text-link" href="https://github.com/operatoruplift/rwa-lens" target="_blank" rel="noreferrer noopener">Built in the open <ArrowUpRight size={14} /></a>
        </div>
      </footer>
    </>
  );
}
