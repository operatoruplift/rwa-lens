# Demo release verification

The release includes a 90-second product walkthrough and a 33.8-second overview at 1920×1080, H.264/AAC, with fast-start playback. Both use the same normal-speed generated James preset voice and selectable English captions. The overview cuts at complete-sentence pauses and preserves the closing line.

The footage uses the refreshed local production build with real public production API reads. The primary capture completed all 13 scenes with no browser errors and produced actual JSON and CSV downloads. USDY identity, exact-mint yield navigation, device Watchlist storage, issuer links and evidence/export are visible. Capture timestamps, response status, hashes and asset measurements are in `media-manifest.json`. Full response ledgers, frame galleries and account-specific generation receipts remain outside the public repository.

The edit uses verified ranges from two actual takes after the recorder left output queued at shutdown; every used range is within a decoded recording. The hero is reused at the end. The final videos fully decode, all 13 chapter frames were reviewed, and native caption playback was checked at the opening, export segment and final line. No authored caption words are missing; written acronyms are normalized to RWA, USDY and CSV.

Measured narration is −16.15 LUFS / −1.48 dBTP in the full video and −16.45 LUFS / −1.49 dBTP in the overview. The last spoken words end at 88.84 and 32.64 seconds respectively, with the closing picture and audio tail preserved. Waveform, transcription and timing checks are recorded; human listening is not claimed.

Reproduction uses `scripts/demo-capture.mjs`, `scripts/demo-render.mjs` and `scripts/demo-cut.mjs` with the shot plan and edit JSON files in this directory. Place the source recordings and narration beside the edit JSON or update its relative input paths. Native captions are provided as VTT; no burned-caption variant is included.
