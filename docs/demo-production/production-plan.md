# RWA Lens — narrated product demo

Status: complete. The 90-second walkthrough and 33.8-second overview have generated narration, native captions, a transcript, and verified release assets. See `media-manifest.json`.

## Deliverables

- A 90–95 second, 1920×1080 product walkthrough with natural English narration.
- A clean narrated MP4 master, encoded H.264/AAC with fast-start playback.
- A matching WebVTT caption track and accessible transcript for the demo page.
- A 30–40 second overview cut with its own WebVTT, assembled from complete sentences in the same verified footage and voice.
- Source script, shot ledger, capture URLs and timestamps, narration job receipt, actual media durations, and output hashes.

## Creative direction

Use the existing optical black, ivory and lime identity. Start with a brief hero-to-workspace transition, then let the real product fill the frame. Hold each state long enough to read it. Use restrained transitions and the application’s own navigation labels; keep the interface unobstructed. Keep numeric results, addresses and source times legible. No generated interface, fake activity, manufactured balances, or staged success responses.

Voice: James (Runway built-in preset), locked in `voice.lock.json`. Direction: warm, calm, conversational English; neutral accent; natural breaths and short pauses. Preset voice only. No identity imitation. Keep the initial delivery rate unchanged and edit the picture to the narration. Pronounce RWA as “R W A”, USDY as “U S D Y”, and CSV as “C S V”. Avoid shouting, hype, over-enunciation and background music competing with the voice.

Caption look: native selectable captions in sentence case, respecting the viewer’s caption preferences. Limit each cue to a short phrase. Transcribe the actual voice track for timing, then reconcile wording with the approved script. Do not estimate final cue times from word counts.

## Editorial targets

The following edit points follow the completed narration. Precise cue timings are in `captions/captions.json`; display cues normalize spelled acronyms to RWA, USDY and CSV without changing their spoken intervals.

| Target | Actual product shot | Viewer takeaway |
| --- | --- | --- |
| 00–13 s | Animated landing hero | What RWA Lens is for |
| 13–23 s | Inspector opens with the real USDY mint; successful mainnet response | Inspection works without a wallet |
| 23–39 s | Overview address/program, then Balances, Controls, Liquidity, Evidence | Navigation and token controls |
| 39–44 s | Evidence view; read method, time and context slots | Observations have a traceable source |
| 44–53 s | Click actual JSON and CSV exports | The receipt can leave the app |
| 53–63 s | Yield filters and an exact-mint inspector link | Discovery connects to inspection |
| 63–68 s | Save the inspected token and open the device Watchlist | Return to a token later |
| 68–79 s | Market-data labels, fee context and issuer reserve link | Market figures and issuer reports are separate sources |
| 79–90 s | Inspector-to-hero closing shot | Where to continue |

Do not force an unavailable live provider result into a success shot. Retain the failed take and capture a fresh successful read later if the provider recovers. Show only controls available in the public build. No wallet signature, asset transfer or pool deposit is part of this recording.

## Production route

The continuous narration uses Runway’s built-in James preset at normal speed. Generated voice provenance and technical checks are recorded in `audio-generation.json`.

Capture the new build using real Chromium interactions with deterministic viewport geometry. The local environment has ffmpeg and ffprobe. The Higgsfield sandbox has ffmpeg, Playwright, faster-whisper and the preinstalled caption pipeline. The refreshed UI is captured locally at 1440×900, contained within 1920×1080. If local RPC configuration is unavailable, only inspection, screener and venue requests are forwarded to the actual public production API. The ledger records the UI origin and API origin separately. No stored or manufactured response is used.

Caption timings came from faster-whisper on the clean continuous narration, reconciled to the authored script. All 215 words passed the transcript gate. Delivery uses separate native WebVTT tracks, preserving the clean masters and viewer caption preferences. No burned caption variant is included in this release. Keep final release media local in `public/demo/`; publish no account posts.

## Capture gates

Before recording, the parent supplies the actual new navigation labels, a reachable release URL and confirmation that the build is stable. Use semantic locators observed from that build. Disable browser extensions and unrelated browser chrome. Preserve native app styling; temporary cursor graphics belong in video composition only.

Required evidence:

- Actual mainnet inspection response and matching visible mint.
- Actual JSON and CSV download names and SHA-256 hashes.
- Working tab/navigation changes and an exact-mint link from the yield view.
- No console page errors during the recorded journey.
- No private wallet data, sessions, keys, API headers or unrelated tabs in frame.
- Full output decodes; audio is present, intelligible and reaches the final spoken word.
- Captions match the transcript, with start/middle/end sync checked against audio.
- Frame checks across every chapter and both ends; no cropped controls or caption overlap.

## Production handoff

The completed normal-speed James preset voice is recorded in `voice.lock.json`. Application implementation and deployment remain with the parent; this work owns media and demo-production files only.
