# Launch film integration — October 1, 2026

The user-supplied 30-second launch master and its poster are published without
re-encoding or image changes. SHA-256 hashes and exact sizes are recorded in
`launch-media-manifest.json`. Both copied files compare byte-for-byte with the
supplied originals.

## Placement and accessibility

- The landing hero's launch-film link focuses a dedicated film section after the
  inspection method. The original Explore the lens anchor remains available.
- The film leads the demo page; the 90-second narrated walkthrough and short
  narrated overview remain intact below it.
- Both film players use native controls, inline playback, a reserved 16:9 frame,
  the supplied poster, and `preload="none"`. Playback never starts automatically.
- An optional English track identifies the music and interface effects. The
  soundtrack has no narration track; no dialogue transcript was invented.
- An adjacent disclosure describes the visuals and explains the labeled fixture
  chapters, the observation date, and the film's inspection focus.

## Media and browser checks

- FFmpeg decoded the complete original video and audio without errors.
- Master: 30.000 seconds, 1920×1080, 60 fps, H.264 High / yuv420p / BT.709;
  AAC LC stereo at 48 kHz. The `moov` atom precedes `mdat` for fast startup.
- Native Chromium playback reports 30 seconds and 1920×1080, successfully seeks
  to the balance chapter, displays the sound-caption cue, and reaches the end.
- Before playback, only the film poster was requested; no film bytes or caption
  bytes were fetched. Playback exposes the entire 30-second seekable range.
- MP4 requests return `video/mp4` with HTTP 206 for a 1,024-byte range and the
  correct total length of 29,524,814 bytes. Poster and caption responses have the
  correct `image/jpeg` and `text/vtt` MIME types.
- Desktop and mobile frames were visually reviewed. The demo page has no
  horizontal overflow at widths 375, 390, 768, 1024, and 1440 pixels. The landing
  film also fits a 390-pixel viewport.
- The hero watch link updates the URL to `#launch-film` and places keyboard
  focus on the film section. The visual description and native controls remain
  keyboard accessible.
- Targeted ESLint and whitespace checks pass. Two independent code reviews
  found no actionable issue.

Local checks ran against the development server. Production build and hosted
verification belong to the release checks. The local environment's unavailable
RPC and development-only CSP diagnostics do not establish live API health.

## Content provenance

The supplied film is a motion showreel. Its creator's source documents the
September 30, 2026 mainnet observations and explicitly labeled Treasury and
Token-2022 fixtures. Those labels are preserved. The film demonstrates inspection
concepts and is not evidence of a completed wallet transaction or settlement.
