# Optical redesign — September 2026

The redesigned home page uses original landscape glass-lens artwork, large
editorial type, an ink/ivory/citron palette, and a finite entrance animation.
The compact `/rwa` route retains immediate access to the same public inspector.
The existing inspection state, API calls, fixture timeline and evidence exports
remain in `RwaLensShell`; the redesign adds no client-side animation dependency.

MotionSites Pro references accessed through the connected account:

- [RIVR DeFi](https://motionsites.ai/?prompt=rivr-defi-landing): framed visual
  composition, sparse navigation and contextual glass annotations.
- [Digital Reality](https://motionsites.ai/?prompt=digital-reality-hero): dark
  material photography, expressive type and restrained highlights.
- [Cinematic Landing Page](https://motionsites.ai/?prompt=cinematic-landing-page):
  editorial scale and motion pacing.

No premium prompt text or template media is redistributed. The two optical
sculptures were generated specifically for this project. The portrait composition
was generated separately to preserve the full lens and leave room for a clock or
story typography. All runtime visuals and fonts are served locally.

## Deliverables

`/brand-kit` is an image-led gallery with 18 editable SVG compositions and 13 PNG
exports: optical marks and wordmarks, profiles, three square campaign posts,
portrait/story, X and LinkedIn headers, OG/ad graphics, and desktop/mobile
wallpapers. The gallery uses 13 smaller WebP previews. The ZIP includes the guide,
manifest, editable sources, PNG exports and Inter font/license.

The desktop wallpaper export is 3840 × 2160, and the mobile export is 1440 × 2560.
Generated source art is 1672 × 941 and 941 × 1672 respectively; raster artwork is
upscaled in these exports. Text and marks render as vectors at export resolution.

## Release validation

Review covers both landing routes, inspector regression behavior, gallery
downloads, 360/390/768/1440 responsive layouts, keyboard focus, reduced motion,
and the production build. PNG dimensions and archive integrity are checked
against the manifest. Local release checks passed: ESLint, Next route type
generation/TypeScript, 222 unit tests, the optimized production build, and all 23
Playwright browser tests. The unit suite used `--maxWorkers=2` after the default
parallel run hit a 5-second SDK import timeout on the busy local machine; no test
timeout or assertion was weakened. Final hosted results are recorded in the
deployment handoff.

Previous Ready production deployment, before this visual release:
`dpl_7Ji7wU32t9Tqfh2EGZRTVAzw6bMJ`,
https://rwa-lens-b0lqcuuiu-operatoruplift.vercel.app (commit `32cc72c`).
The existing GitHub repository, Vercel project, domains and runtime configuration
are retained. Backend and Supabase schema are unchanged by the redesign.
