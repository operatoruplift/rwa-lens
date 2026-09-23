# RWA Lens / Optical identity

## Idea
Real assets. Clearer vision. An optical instrument is the central motif: glass reveals rather than promises. The lens sculpture is original AI-generated artwork created for RWA Lens.

## Mark and type
The optical mark uses a circle, a rotated ellipse and a focus indicator. Keep at least 8 units of clear space around the 40-unit mark. Minimum mark size: 16px. Use the reverse mark on dark surfaces. The wordmark uses Inter at weight 550 with tight tracking. Inter is embedded in the editable SVG files; its font and OFL license are included in source/. Preserve aspect ratio.

## Palette
| Colour | Hex | Role |
|---|---|---|
| Ink | #101211 | Ground and primary text |
| Ivory | #f2f2e9 | Reading surfaces and reversed text |
| Citron | #d9ff65 | Focus, direction and campaign emphasis |
| Gray | #a4aaa2 | Secondary text on dark surfaces |

Citron is an accent, never a claim about an asset's safety or performance. Product warning and error colours retain their own meanings.

## Campaign
The three square posts form a sequence: Real assets. Clearer vision. / A balance is only the beginning. / Follow the evidence. Their compositions deliberately vary: dark material study, citron editorial poster, ivory evidence panel. Tall posts use separately generated portrait art, so the entire lens remains visible.

## Formats and safe areas
- profile-dark.png / editable .svg: 1024 × 1024px
- profile-light.png / editable .svg: 1024 × 1024px
- og-image.png / editable .svg: 1200 × 630px
- ad-landscape.png / editable .svg: 1200 × 628px
- social-square.png / editable .svg: 1080 × 1080px
- social-balance.png / editable .svg: 1080 × 1080px
- social-evidence.png / editable .svg: 1080 × 1080px
- social-portrait.png / editable .svg: 1080 × 1350px
- social-story.png / editable .svg: 1080 × 1920px
- header-x.png / editable .svg: 1500 × 500px
- header-linkedin.png / editable .svg: 1584 × 396px
- wallpaper-desktop.png / editable .svg: 3840 × 2160px
- wallpaper-mobile.png / editable .svg: 1440 × 2560px

X and LinkedIn headers reserve the lower-left for profile avatars. Story text stays away from the top and bottom interface areas. The mobile wallpaper leaves its upper third clear for a clock. Actual platform cropping varies; preview on the intended account before posting.

The desktop wallpaper exports at 3840 × 2160; the source artwork is 1672 × 941. The mobile wallpaper exports at 1440 × 2560; the source artwork is 941 × 1672. Typography and logo vectors render sharply at export dimensions, while the raster artwork is upscaled. These are not native 4K renders. PNGs are final exports; SVGs contain editable live text and embedded raster art. Small WebP files are gallery previews.

## Voice
Describe observations, sources and limitations. RWA Lens reads public Solana token state; it does not establish legal compliance, asset backing, investment performance or issuer trust. Do not imply endorsements or partnerships.

## Design references
MotionSites RIVR DeFi and Digital Reality informed the cinematic contrast, bold editorial scale, restrained accent and material imagery. References: [RIVR DeFi](https://motionsites.ai/?prompt=rivr-defi-landing) and [Digital Reality](https://motionsites.ai/?prompt=digital-reality-hero). No template images, logos, customer claims or proprietary prompt text are redistributed.

## Rebuild
Prerequisites: Node 22.19+, npm ci, and npx playwright install chromium. On macOS/Linux, /usr/bin/zip must be installed. Set PW_EXE to use another installed Chromium executable. Run node scripts/build-brand-kit.mjs in the repository. Required original artwork: public/brand/lens-master.png and public/brand/lens-portrait.png. The generator rebuilds PNGs, editable SVGs, previews, application icons, the asset manifest and the ZIP.
