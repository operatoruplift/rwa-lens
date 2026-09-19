# Two-minute demo / judge prep

Use the production app at https://rwalensonsolana.vercel.app. Keep JSON export
available and do not connect a wallet. Screenshots are in `docs/screenshots`;
read receipts are in `docs/evidence/live-observations.json`.

| Time | Action and narration |
| --- | --- |
| 0:00–0:20 | Open the landing page. “RWA Lens answers what a Solana token is, what the balance means, and which observed controls affect movement.” Point out the configured network and read-only label. |
| 0:20–0:45 | Select the Ondo USDY live example and inspect. Open its official issuer source. Show the mint address, SPL Token program, decimals, supply and mint/freeze authorities. “The issuer identifies the asset; the RPC independently identifies the on-chain mint. This is a non-stock example using legacy SPL.” |
| 0:45–1:00 | Enter the public mint-authority address shown on screen as an explicitly declared public owner and inspect. The recorded run returned an empty account list: show observed raw `0`, displayed `0`, and the exact RPC evidence. “An empty validated response differs from an unavailable lookup. This address is a public example, not my wallet.” If account state has changed, describe the current result instead. |
| 1:00–1:30 | Select the synthetic treasury example. “This next panel is synthetic and demonstrates Token-2022, not USDY's economics.” Click Before, At, then After. Point at unchanged raw `1000000000`, standard `1000`, and the changed extension display `1042.35` → `1051.14`. Show rounding note and the scheduled boundary. |
| 1:30–1:45 | Read permanent delegate and default-account-state explanations. Switch to private-credit example to show a configured hook and confidential/unknown data. Explain that an unknown check and a known block are separate evidence. |
| 1:45–2:00 | Expand evidence, show method/context slots/time source/decoder. Export JSON or CSV as a guest. “This is a point-in-time observation receipt. It does not move assets or certify backing, compliance or transfer success.” |

## Rehearsal and fallback

1. Run `node scripts/verify-live.mjs` shortly before the demo; it is an explicit
   public read, separate from deterministic CI.
2. If mainnet RPC returns unavailable/rate-limited, show the honest error and use
   the synthetic selector. Explain that this demonstrates UI/accounting behavior,
   not a successful live integration. A saved receipt is a **recorded observation**,
   not current chain state.
3. Show the saved source manifest and last recorded live receipt separately if
   needed. Never relabel it live or replace unavailable values with zeros.
4. Optional cloud report auth is disabled on production until dedicated durable
   credentials are configured; local exports remain available.

The prep deliverables are this script, the source manifest, screenshot set,
capability matrix, verification evidence and deployment/rollback instructions.
No hackathon submission is made by this release.
