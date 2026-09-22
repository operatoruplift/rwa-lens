/**
 * Generates every downloadable brand asset from one source of truth.
 *
 * The mark, palette and wordmark here must stay identical to components/rwa/brand.tsx
 * and app/icon.svg. Re-run with `node scripts/build-brand-kit.mjs` after any change,
 * then commit the output in public/brand-kit/.
 *
 * PNGs are rendered from the SVGs through the installed Chromium so the shipped
 * raster matches the vector exactly rather than being drawn a second time.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/brand-kit');
mkdirSync(out, { recursive: true });

const NAVY = '#101a3a';
const NAVY_SOFT = '#46516e';
const INDIGO = '#5b5ce2';
const FACET = '#9e9ff8';
const CANVAS = '#f6f7fb';
const PAPER = '#ffffff';
const RULE = '#e3e6ef';
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Inter,'Helvetica Neue',Arial,sans-serif";

/** The faceted prism, drawn at a 40x40 origin and scaled by the caller. */
const prism = ({ body = NAVY, facet = FACET, line = PAPER } = {}) => `
  <path d="M20 3 36 12.2v15.6L20 37 4 27.8V12.2L20 3Z" fill="${body}"/>
  <path d="m20 8 11.8 6.8-11.8 7-11.8-7L20 8Z" fill="${facet}"/>
  <path d="M8.2 19.6 20 26.5l11.8-6.9M8.2 24.7 20 31.6l11.8-6.9M20 21.8v9.8" stroke="${line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

/** Ruled field from the social card: a quiet ledger reference, never decoration for its own sake. */
const ledger = (x, y, w, h, stroke = RULE, step = 40) => {
  const parts = [];
  for (let v = x; v <= x + w; v += step) parts.push(`M${v} ${y}v${h}`);
  for (let u = y; u <= y + h; u += step) parts.push(`M${x} ${u}h${w}`);
  return `<path d="${parts.join('')}" stroke="${stroke}" fill="none"/>`;
};

const wordmark = (x, y, size, ink, dot = INDIGO) =>
  `<text x="${x}" y="${y}" fill="${ink}" font-family="${SERIF}" font-size="${size}">RWA <tspan font-style="italic">Lens</tspan><tspan fill="${dot}">.</tspan></text>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

const files = {};

// ---- Marks -----------------------------------------------------------------
files['rwa-lens-mark.svg'] = svg(40, 40, prism());
files['rwa-lens-mark-light.svg'] = svg(40, 40, prism({ body: PAPER, facet: INDIGO, line: NAVY }));
files['rwa-lens-mark-monochrome.svg'] = svg(40, 40, `
  <path d="M20 3 36 12.2v15.6L20 37 4 27.8V12.2L20 3Z" fill="${NAVY}"/>
  <path d="m20 8 11.8 6.8-11.8 7-11.8-7L20 8Z" fill="${PAPER}" fill-opacity=".28"/>
  <path d="M8.2 19.6 20 26.5l11.8-6.9M8.2 24.7 20 31.6l11.8-6.9M20 21.8v9.8" stroke="${PAPER}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);

// ---- Wordmarks -------------------------------------------------------------
const lockup = (ink, line) => `<g transform="translate(4,8)">${prism({ line })}</g>${wordmark(57, 39, 34, ink)}`;
files['rwa-lens-wordmark.svg'] = svg(260, 56, lockup(NAVY, PAPER));
files['rwa-lens-wordmark-light.svg'] = svg(260, 56, `${lockup(PAPER, NAVY).replace('fill="#101a3a"/>', `fill="${PAPER}"/>`)}`);

// ---- Profile / app icon ----------------------------------------------------
const profile = (bg, ink, line, facet) => svg(1024, 1024, `
  <defs><clipPath id="squircle"><rect width="1024" height="1024" rx="232"/></clipPath></defs>
  <rect width="1024" height="1024" rx="232" fill="${bg}"/>
  <g clip-path="url(#squircle)">${ledger(0, 0, 1024, 1024, bg === NAVY ? '#1b2650' : RULE, 128)}</g>
  <g transform="translate(272 232) scale(12)">${prism({ body: ink, facet, line })}</g>
  <text x="512" y="880" text-anchor="middle" fill="${ink}" font-family="${SERIF}" font-size="96">RWA <tspan font-style="italic">Lens</tspan><tspan fill="${INDIGO}">.</tspan></text>`);
files['profile-light.svg'] = profile(CANVAS, NAVY, PAPER, FACET);
files['profile-dark.svg'] = profile(NAVY, PAPER, NAVY, INDIGO);

// ---- Social, ads, headers --------------------------------------------------
/** One editorial composition, re-proportioned per surface rather than stretched. */
const card = ({ w, h, bg, ink, soft, facet, line, eyebrow, headline, support, markScale, markX, markY, pad = 70, headSize, titleY }) => svg(w, h, `
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${ledger(w * 0.65, 0, w * 0.4, h, bg === NAVY ? '#1b2650' : RULE)}
  <g transform="translate(${markX} ${markY}) scale(${markScale})">${prism({ body: ink, facet, line })}</g>
  ${wordmark(pad, titleY, headSize * 0.62, ink)}
  <text x="${pad}" y="${titleY + headSize * 1.45}" font-family="${SANS}" font-size="${Math.round(headSize * 0.21)}" letter-spacing="3" fill="${INDIGO}">${eyebrow}</text>
  ${headline.map((row, index) => `<text x="${pad - 5}" y="${titleY + headSize * 2.6 + index * headSize * 1.12}" font-family="${SANS}" font-size="${headSize}" font-weight="600" letter-spacing="-3" fill="${ink}">${row}</text>`).join('')}
  <text x="${pad}" y="${h - 62}" font-family="${SANS}" font-size="${Math.round(headSize * 0.29)}" fill="${soft}">${support}</text>`);

const copy = {
  eyebrow: 'THE TOKEN BEHIND THE ASSET',
  support: 'Identity. Balance. Controls. Read-only on Solana.',
};
const lightTones = { bg: CANVAS, ink: NAVY, soft: NAVY_SOFT, facet: FACET, line: PAPER };
const darkTones = { bg: NAVY, ink: PAPER, soft: '#aab3cd', facet: INDIGO, line: NAVY };

files['og-image.svg'] = card({ w: 1200, h: 630, ...lightTones, ...copy, headline: ['Know what your', 'real-world token means.'], markScale: 5.4, markX: 855, markY: 185, headSize: 67, titleY: 112 });
files['social-square.svg'] = card({ w: 1080, h: 1080, ...lightTones, ...copy, headline: ['Know what', 'your token', 'actually means.'], markScale: 6.2, markX: 700, markY: 120, headSize: 74, titleY: 150 });
/** A story is twice as tall as it is wide, so the block is optically centred rather than stacked at the top. */
files['social-story.svg'] = svg(1080, 1920, `
  <rect width="1080" height="1920" fill="${NAVY}"/>
  ${ledger(0, 1180, 1080, 740, '#1b2650')}
  ${wordmark(80, 250, 58, PAPER)}
  <g transform="translate(340 420) scale(10)">${prism({ body: PAPER, facet: INDIGO, line: NAVY })}</g>
  <text x="80" y="960" font-family="${SANS}" font-size="22" letter-spacing="4" fill="${INDIGO}">${copy.eyebrow}</text>
  ${['Identity.', 'Balance.', 'Controls.'].map((row, index) => `<text x="75" y="${1080 + index * 118}" font-family="${SANS}" font-size="104" font-weight="600" letter-spacing="-3" fill="${PAPER}">${row}</text>`).join('')}
  <text x="80" y="1500" font-family="${SANS}" font-size="30" fill="#aab3cd">One clear view of a Solana token.</text>
  <text x="80" y="1560" font-family="${SANS}" font-size="30" fill="#aab3cd">Public, read-only, no signing.</text>
  <text x="80" y="1810" font-family="${SANS}" font-size="26" fill="${INDIGO}">rwalensonsolana.vercel.app</text>`);
files['ad-landscape.svg'] = card({ w: 1200, h: 628, ...lightTones, ...copy, headline: ['Inspect the token', 'before you trust it.'], markScale: 5.4, markX: 855, markY: 185, headSize: 63, titleY: 112 });

/** Headers are wide and short, so the lockup sits on one line with room to breathe. */
const header = (w, h, tones) => svg(w, h, `
  <rect width="${w}" height="${h}" fill="${tones.bg}"/>
  ${ledger(w * 0.6, 0, w * 0.45, h, tones.bg === NAVY ? '#1b2650' : RULE)}
  <g transform="translate(${Math.round(w * 0.06)} ${Math.round(h / 2 - 48)}) scale(2.4)">${prism({ body: tones.ink, facet: tones.facet, line: tones.line })}</g>
  ${wordmark(Math.round(w * 0.06) + 124, Math.round(h / 2 + 6), 52, tones.ink)}
  <text x="${Math.round(w * 0.06) + 127}" y="${Math.round(h / 2 + 48)}" font-family="${SANS}" font-size="18" letter-spacing="2.6" fill="${INDIGO}">${copy.eyebrow}</text>`);
files['header-x.svg'] = header(1500, 500, darkTones);
files['header-linkedin.svg'] = header(1584, 396, lightTones);

// ---- Wallpaper -------------------------------------------------------------
files['wallpaper-desktop.svg'] = svg(2560, 1440, `
  <rect width="2560" height="1440" fill="${NAVY}"/>
  ${ledger(0, 0, 2560, 1440, '#18234a', 80)}
  <g transform="translate(1120 560) scale(8)">${prism({ body: PAPER, facet: INDIGO, line: NAVY })}</g>
  <text x="1280" y="1020" text-anchor="middle" fill="${PAPER}" font-family="${SERIF}" font-size="72">RWA <tspan font-style="italic">Lens</tspan><tspan fill="${INDIGO}">.</tspan></text>`);

for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);
console.log(`wrote ${Object.keys(files).length} svg assets`);

// ---- Raster ----------------------------------------------------------------
const raster = [
  ['profile-light.svg', 'profile-light.png', 1024, 1024],
  ['profile-dark.svg', 'profile-dark.png', 1024, 1024],
  ['og-image.svg', 'og-image.png', 1200, 630],
  ['social-square.svg', 'social-square.png', 1080, 1080],
  ['social-story.svg', 'social-story.png', 1080, 1920],
  ['ad-landscape.svg', 'ad-landscape.png', 1200, 628],
  ['header-x.svg', 'header-x.png', 1500, 500],
  ['header-linkedin.svg', 'header-linkedin.png', 1584, 396],
  ['wallpaper-desktop.svg', 'wallpaper-desktop.png', 2560, 1440],
];
const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
for (const [source, target, w, h] of raster) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const markup = readFileSync(join(out, source), 'utf8');
  await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block}</style>${markup}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, target), omitBackground: false });
  await page.close();
  console.log(`  rendered ${target}`);
}
await browser.close();

const listing = readdirSync(out).sort();
console.log(`brand kit contains ${listing.length} files`);
