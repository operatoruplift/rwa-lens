/** Rebuilds the optical identity, editable SVG compositions, PNG exports and archive.
 * Original generated artwork is embedded in each SVG; typography remains editable.
 * Chromium renders the embedded Inter font so exports do not depend on system fonts.
 */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/brand-kit');
mkdirSync(out, { recursive: true });
const INK = '#101211', IVORY = '#f2f2e9', ACID = '#d9ff65', GRAY = '#a4aaa2';
const font = readFileSync(join(out, 'source/Inter-latin.woff2')).toString('base64');
const art = `data:image/webp;base64,${(await sharp(join(root, 'public/brand/lens-master.png')).webp({ quality: 96 }).toBuffer()).toString('base64')}`;
const portrait = `data:image/webp;base64,${(await sharp(join(root, 'public/brand/lens-portrait.png')).webp({ quality: 96 }).toBuffer()).toString('base64')}`;
const assets = [];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const text = (x, y, value, size = 24, color = IVORY, weight = 500, tracking = 0) => `<text x="${x}" y="${y}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}" fill="${color}">${esc(value)}</text>`;
const mark = (ink = IVORY, dot = ACID, ground = INK) => `<circle cx="20" cy="20" r="16" stroke="${ink}" stroke-width="2.5" fill="none"/><ellipse cx="20" cy="20" rx="9" ry="16" transform="rotate(38 20 20)" stroke="${ink}" stroke-width="2.5" fill="none"/><circle cx="31.3" cy="8.7" r="3.6" fill="${dot}" stroke="${ground}" stroke-width="1.5"/>`;
const lockup = (x, y, scale = 1, ink = IVORY, dot = ACID, ground = INK) => `<g transform="translate(${x} ${y}) scale(${scale})">${mark(ink, dot, ground)}${text(51, 29, 'RWA Lens', 28, ink, 550, -1.5)}</g>`;
const image = (x, y, w, h, src = art) => `<image href="${src}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
const rule = (x, y, w, ink = '#454a43') => `<path d="M${x} ${y}h${w}" stroke="${ink}" stroke-width="1"/>`;
const arrow = (x, y, size = 40, ink = ACID) => `<path d="M${x} ${y + size}l${size} -${size}m-${size} 0h${size}v${size}" stroke="${ink}" stroke-width="${size / 14}" fill="none"/>`;
const label = (x, y, value, color = ACID) => text(x, y, value, 17, color, 550, 2.2);
const svg = (w, h, body, bg = INK) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${body.includes('<text') ? `<style>@font-face{font-family:Inter;font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format('woff2')}</style>` : ''}<linearGradient id="shade"><stop stop-color="${INK}"/><stop offset=".65" stop-color="${INK}" stop-opacity=".87"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>\n`;
const add = (name, w, h, body, bg = INK, raster = true) => {
  writeFileSync(join(out, `${name}.svg`), svg(w, h, body, bg));
  assets.push({ name, width: w, height: h, raster });
};

// Logo sources stay simple enough to read at favicon sizes.
add('rwa-lens-mark', 40, 40, mark(INK, INK, IVORY), null, false);
add('rwa-lens-mark-light', 40, 40, mark(), null, false);
add('rwa-lens-mark-monochrome', 40, 40, mark(INK, INK, IVORY), null, false);
add('rwa-lens-wordmark', 252, 48, lockup(4, 4, 1, INK, INK, IVORY), null, false);
add('rwa-lens-wordmark-light', 252, 48, lockup(4, 4), null, false);
add('profile-dark', 1024, 1024, `<circle cx="512" cy="512" r="450" fill="none" stroke="#262b25" stroke-width="1"/><g transform="translate(232 232) scale(14)">${mark()}</g>`);
add('profile-light', 1024, 1024, `<circle cx="512" cy="512" r="450" fill="none" stroke="#d6d9cd" stroke-width="1"/><g transform="translate(232 232) scale(14)">${mark(INK, INK, IVORY)}</g>`, IVORY);

// Landscape campaign — generous quiet left, material close-up to the right.
add('og-image', 1200, 630, `${image(0, -22, 1200, 675)}<rect width="760" height="630" fill="url(#shade)"/>${lockup(62, 52, .95)}${label(66, 218, 'A CLEARER VIEW OF REAL-WORLD TOKENS')}${text(59, 318, 'Real assets.', 82, IVORY, 500, -5)}${text(59, 406, 'Clearer vision.', 82, ACID, 500, -5)}${rule(65, 520, 430)}${text(65, 558, 'Inspect public Solana token data.', 21, IVORY)}${arrow(1100, 520, 33)}`);
add('ad-landscape', 1200, 628, `${image(0, 0, 1200, 675)}<rect width="810" height="628" fill="url(#shade)"/>${lockup(64, 52)}${label(67, 231, 'READ THE TOKEN. SEE THE DETAILS.')}${text(59, 327, 'Follow the', 87, IVORY, 500, -5.5)}${text(59, 420, 'evidence.', 87, ACID, 500, -5.5)}${text(66, 552, 'Identity. Balances. Issuer controls.', 23, IVORY)}${arrow(1110, 515, 31)}`);

// Three distinct square compositions; these are a campaign, not resized clones.
add('social-square', 1080, 1080, `${image(-465, 281, 1640, 923)}${lockup(62, 57, 1.13)}${label(65, 191, '01 / SEE THE WHOLE PICTURE')}${text(58, 309, 'Real assets.', 110, IVORY, 500, -7)}${text(58, 425, 'Clearer vision.', 110, ACID, 500, -7)}<rect x="0" y="957" width="1080" height="123" fill="${INK}" fill-opacity=".88"/>${rule(65, 976, 950)}${text(65, 1020, 'RWA INTELLIGENCE, ON SOLANA.', 18, IVORY, 500, 2)}${arrow(977, 1000, 23)}`);
add('social-balance', 1080, 1080, `${lockup(62, 55, 1.12, INK, INK, ACID)}${label(65, 190, '02 / LOOK BEYOND THE NUMBER', INK)}${text(58, 308, 'A balance', 113, INK, 550, -7)}${text(58, 423, 'is only the', 113, INK, 550, -7)}${text(58, 538, 'beginning.', 113, INK, 550, -7)}${image(60, 604, 960, 401)}${text(91, 672, 'RAW UNITS', 17, IVORY, 500, 2)}${text(91, 711, 'DISPLAYED BALANCE', 17, IVORY, 500, 2)}${text(91, 750, 'ISSUER CONTROLS', 17, IVORY, 500, 2)}${arrow(89, 915, 32)}`, ACID);
add('social-evidence', 1080, 1080, `${lockup(62, 53, 1.12, INK, INK, IVORY)}${label(65, 190, '03 / CLARITY STARTS WITH A QUESTION', INK)}${text(58, 310, 'Follow the', 117, INK, 500, -7)}${text(58, 430, 'evidence.', 117, INK, 500, -7)}${image(60, 495, 960, 461)}<rect x="60" y="900" width="960" height="56" fill="${ACID}"/>${text(82, 936, 'PUBLIC DATA. READ-ONLY. YOUR OWN CONCLUSIONS.', 18, INK, 550, 1.1)}${text(65, 1020, 'rwalensonsolana.vercel.app', 22, INK)}${arrow(979, 999, 23, INK)}`, IVORY);

// Tall compositions use a separately art-directed portrait, preserving the full lens.
add('social-portrait', 1080, 1350, `${image(320, 0, 760, 1350, portrait)}<rect width="530" height="1350" fill="url(#shade)"/>${lockup(65, 59, 1.13)}${label(68, 224, 'LOOK CLOSER')}${text(61, 348, 'Real assets.', 113, IVORY, 500, -7)}${text(61, 468, 'Clearer vision.', 113, ACID, 500, -7)}${text(68, 555, 'One clear view of a Solana token.', 27, IVORY)}${rule(65, 1251, 950)}${text(65, 1296, 'RWA Lens / Clarity starts on chain.', 22, IVORY)}${arrow(979, 1271, 24)}`);
add('social-story', 1080, 1920, `${image(0, 0, 1080, 1920, portrait)}${lockup(70, 250, 1.3)}${label(75, 424, 'THE TOKEN BEHIND THE ASSET')}${text(63, 554, 'Look closer.', 127, IVORY, 500, -8)}${text(71, 640, 'Identity. Balance. Controls.', 32, ACID)}${rule(73, 1630, 931)}${text(73, 1691, 'Explore the public data.', 28, IVORY)}${text(73, 1733, 'Make your own assessment.', 28, IVORY)}${arrow(942, 1670, 39)}`);

// Social headers leave the lower-left avatar overlap empty; the brand sits above it.
add('header-x', 1500, 500, `${image(657, -16, 926, 521)}<rect width="1010" height="500" fill="url(#shade)"/>${lockup(59, 58, .95)}${label(385, 137, 'REAL-WORLD TOKENS. IN FOCUS.')}${text(379, 224, 'Real assets.', 77, IVORY, 500, -4.5)}${text(379, 307, 'Clearer vision.', 77, ACID, 500, -4.5)}${text(386, 392, 'Public Solana data, made legible.', 22, IVORY)}`);
add('header-linkedin', 1584, 396, `${image(830, -38, 867, 488)}<rect width="1150" height="396" fill="url(#shade)"/>${lockup(59, 55, .86)}${label(359, 99, 'THE TOKEN BEHIND THE ASSET')}${text(353, 183, 'Real assets.', 74, IVORY, 500, -4.8)}${text(353, 261, 'Clearer vision.', 74, ACID, 500, -4.8)}${text(359, 325, 'A clearer view of public Solana token data.', 20, IVORY)}`);

// Wallpapers are quiet; export resolution is distinct from the original artwork resolution.
add('wallpaper-desktop', 3840, 2160, `${image(0, 0, 3840, 2160)}${lockup(146, 1900, 2.1)}${text(148, 2051, 'A CLEARER VIEW.', 28, GRAY, 500, 5)}`);
add('wallpaper-mobile', 1440, 2560, `${image(0, 0, 1440, 2560, portrait)}${lockup(100, 2300, 1.7)}${text(105, 2430, 'A CLEARER VIEW.', 24, IVORY, 500, 4.5)}`);

const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
try {
  for (const asset of assets.filter(asset => asset.raster)) {
    const page = await browser.newPage({ viewport: { width: asset.width, height: asset.height }, deviceScaleFactor: 1 });
    try {
      await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block}</style>${readFileSync(join(out, `${asset.name}.svg`), 'utf8')}`, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await document.fonts.load('500 32px Inter');
        if (!document.fonts.check('500 32px Inter')) throw new Error('Embedded Inter font did not load');
      });
      await page.screenshot({ path: join(out, `${asset.name}.png`), omitBackground: false });
      await sharp(join(out, `${asset.name}.png`)).resize({ width: Math.min(960, asset.width) }).webp({ quality: 84 }).toFile(join(out, `${asset.name}-preview.webp`));
      console.log(`Rendered ${asset.name}: ${asset.width} x ${asset.height}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }

copyFileSync(join(out, 'rwa-lens-wordmark.svg'), join(root, 'public/brand/rwa-lens.svg'));
copyFileSync(join(out, 'og-image.svg'), join(root, 'public/brand/social-card.svg'));
copyFileSync(join(out, 'og-image.png'), join(root, 'public/brand/social-card.png'));
const icon = svg(80, 80, `<g transform="translate(10 10) scale(1.5)">${mark()}</g>`);
writeFileSync(join(root, 'app/icon.svg'), icon);
await sharp(Buffer.from(icon)).resize(180, 180).png().toFile(join(root, 'app/apple-icon.png'));
const faviconPng = await sharp(Buffer.from(icon)).resize(32, 32).png().toBuffer();
const faviconHeader = Buffer.alloc(22);
faviconHeader.writeUInt16LE(1, 2); faviconHeader.writeUInt16LE(1, 4);
faviconHeader[6] = 32; faviconHeader[7] = 32;
faviconHeader.writeUInt16LE(1, 10); faviconHeader.writeUInt16LE(32, 12);
faviconHeader.writeUInt32LE(faviconPng.length, 14); faviconHeader.writeUInt32LE(22, 18);
writeFileSync(join(root, 'app/favicon.ico'), Buffer.concat([faviconHeader, faviconPng]));

const manifest = { edition: 'Optical / 2026', palette: { ink: INK, ivory: IVORY, citron: ACID, gray: GRAY }, assets };
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(out, 'brand-guide.md'), `# RWA Lens / Optical identity\n\n## Idea\nReal assets. Clearer vision. An optical instrument is the central motif: glass reveals rather than promises. The lens sculpture is original AI-generated artwork created for RWA Lens.\n\n## Mark and type\nThe optical mark uses a circle, a rotated ellipse and a focus indicator. Keep at least 8 units of clear space around the 40-unit mark. Minimum mark size: 16px. Use the reverse mark on dark surfaces. The wordmark uses Inter at weight 550 with tight tracking. Inter is embedded in the editable SVG files; its font and OFL license are included in source/. Preserve aspect ratio.\n\n## Palette\n| Colour | Hex | Role |\n|---|---|---|\n| Ink | ${INK} | Ground and primary text |\n| Ivory | ${IVORY} | Reading surfaces and reversed text |\n| Citron | ${ACID} | Focus, direction and campaign emphasis |\n| Gray | ${GRAY} | Secondary text on dark surfaces |\n\nCitron is an accent, never a claim about an asset's safety or performance. Product warning and error colours retain their own meanings.\n\n## Campaign\nThe three square posts form a sequence: Real assets. Clearer vision. / A balance is only the beginning. / Follow the evidence. Their compositions deliberately vary: dark material study, citron editorial poster, ivory evidence panel. Tall posts use separately generated portrait art, so the entire lens remains visible.\n\n## Formats and safe areas\n${assets.filter(asset => asset.raster).map(asset => `- ${asset.name}.png / editable .svg: ${asset.width} × ${asset.height}px`).join('\n')}\n\nX and LinkedIn headers reserve the lower-left for profile avatars. Story text stays away from the top and bottom interface areas. The mobile wallpaper leaves its upper third clear for a clock. Actual platform cropping varies; preview on the intended account before posting.\n\nThe desktop wallpaper exports at 3840 × 2160; the source artwork is 1672 × 941. The mobile wallpaper exports at 1440 × 2560; the source artwork is 941 × 1672. Typography and logo vectors render sharply at export dimensions, while the raster artwork is upscaled. These are not native 4K renders. PNGs are final exports; SVGs contain editable live text and embedded raster art. Small WebP files are gallery previews.\n\n## Voice\nDescribe observations, sources and limitations. RWA Lens reads public Solana token state; it does not establish legal compliance, asset backing, investment performance or issuer trust. Do not imply endorsements or partnerships.\n\n## Design references\nMotionSites RIVR DeFi and Digital Reality informed the cinematic contrast, bold editorial scale, restrained accent and material imagery. References: [RIVR DeFi](https://motionsites.ai/?prompt=rivr-defi-landing) and [Digital Reality](https://motionsites.ai/?prompt=digital-reality-hero). No template images, logos, customer claims or proprietary prompt text are redistributed.\n\n## Rebuild\nPrerequisites: Node 22.19+, npm ci, and npx playwright install chromium. On macOS/Linux, /usr/bin/zip must be installed. Set PW_EXE to use another installed Chromium executable. Run node scripts/build-brand-kit.mjs in the repository. Required original artwork: public/brand/lens-master.png and public/brand/lens-portrait.png. The generator rebuilds PNGs, editable SVGs, previews, application icons, the asset manifest and the ZIP.\n`);
const archive = join(out, 'rwa-lens-brand-kit.zip');
rmSync(archive, { force: true });
const archiveFiles = ['brand-guide.md', 'manifest.json', 'source', ...assets.flatMap(asset => [`${asset.name}.svg`, ...(asset.raster ? [`${asset.name}.png`] : [])])];
execFileSync('/usr/bin/zip', ['-q', '-r', '-9', archive, ...archiveFiles], { cwd: out });
console.log(`${assets.length} editable assets, ${assets.filter(asset => asset.raster).length} PNGs. Archive: ${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB`);
