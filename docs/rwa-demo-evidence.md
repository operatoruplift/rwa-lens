# RWA Lens — demo evidence

Everything below was produced by running this repository. Values that come from
a live chain read are marked as such and will change; the method for reproducing
them does not.

## Build identity

| Item | Value |
| --- | --- |
| Runtime | Next.js 16.3.5, React 19.2.8, TypeScript 5.9, Node 22/24 |
| Solana client | `@solana/kit` 8.3.0 |
| Token decoder | `@solana-program/token-2022` 0.17.0 |
| Decoder version string | `@solana-program/token-2022@0.17.0+rwa-lens.1` |
| Capture date | 16 September 2026 |

## Verified: live mainnet read

Reproduce with:

```sh
RWA_CLUSTER=mainnet-beta RWA_RPC_URL=https://api.mainnet-beta.solana.com npm run start
curl -s -X POST http://127.0.0.1:3000/api/rwa/inspect \
  -H 'content-type: application/json' \
  -d '{"cluster":"mainnet-beta","mint":"XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp"}'
```

Observed result (`status: verified`):

| Field | Observed value |
| --- | --- |
| Token program | `token-2022` — `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| Decimals / supply | 8 / `15376345325750` base units |
| Mint authority | `7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj` |
| Freeze authority | `JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs` |
| Slot / block time | `447482034` / `2026-09-16T08:54:31.000Z` |
| Time source | `chain` (not a local estimate) |
| Commitment | `confirmed` |

Extensions decoded, with severity:

| Extension | Severity | Decoded detail |
| --- | --- | --- |
| `MetadataPointer` | info | metadata authority and account |
| `PermanentDelegate` | **attention** | delegate `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq` |
| `DefaultAccountState` | attention | `Initialized` |
| `ScaledUiAmountConfig` | **attention** | multiplier `1.0026642075893797`, pending `1.0032690125398187`, effective `2026-08-08T00:30:00.000Z` |
| `PausableConfig` | attention | `Paused: no` |
| `ConfidentialTransferMint` | **opaque** | confidential portion unknown |
| `TransferHook` | info | **inactive** — hook program unset |
| `TokenMetadata` | info | Apple xStock / AAPLx |

Transfer readiness: **`unknown`**, driven by `ConfidentialTransferMint`. The
per-reason breakdown was:

- `attention` — Pausable — an authority can pause all transfers
- `ready` — Default account state — `Initialized`
- `ready` — Transfer hook — hook program `11111111111111111111111111111111` (unset)
- `attention` — Permanent delegate — issuer can move or burn without the holder's signature
- `unknown` — Opaque state — `ConfidentialTransferMint`

This single read is the product thesis on real data: a real tokenized asset with
a **real permanent delegate**, a **real scheduled multiplier**, and a
**confidential portion that is unknown rather than zero** — none of which a
wallet balance tells the holder.

### Two defects this live read exposed, and fixed

1. **`DefaultAccountState` rendered as `1`.** The Token-2022 `AccountState` is a
   C-style enum; the decoder returns the index. It was reaching the UI as a bare
   number, and the frozen-by-default readiness rule matched on the *name*, so a
   genuinely frozen-by-default mint would not have been flagged. Now mapped to
   `Uninitialized` / `Initialized` / `Frozen`, with regression tests on both the
   rendering and the readiness rule.
2. **An unset `TransferHook` was reported as an active gate.** When the hook
   program is the all-ones default address, no hook runs. The extension was still
   being treated as `attention` and pushing readiness to `unknown`. It is now
   downgraded to `info`/`inactive` with distinct copy, and a test asserts a *real*
   hook program still yields `unknown`.

## Verified: fixture mode, no configuration

```sh
npm run build && npm run start
curl -s -X POST http://127.0.0.1:3000/api/rwa/inspect -H 'content-type: application/json' \
  -d '{"cluster":"devnet","mint":"RWALensFixtureTreasury1111111111111111111","fixtureId":"treasury-scaled"}'
```

Returns `status: verified`, raw `1000000000`, standard `1000`, scaled `1042.35`
at multiplier `1.04235`, `rounding: official-helper`, readiness `attention`.
Fixture and live responses share one typed contract.

## Verified: structured failure states

| Case | Result |
| --- | --- |
| Invalid mint (`not-a-mint`) | `422` `{"status":"invalid","kind":"not-a-mint"}` |
| Unknown cluster (`testnet`) | `400` — only `devnet` / `mainnet-beta` accepted |
| Live read with no `RWA_RPC_URL` | `503` `{"kind":"not-configured"}`, fixtures still usable |

No provider URL, key or stack trace appears in any error body.

## Checks run

| Check | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **88 passed** |
| `npm run build` | succeeds |
| `npm run test:e2e` | **13 passed** (fixture-only, no RPC) |

Browser coverage includes: populated first paint, raw amount fixed while the
displayed amount changes, permanent-delegate and default-state explanation,
opaque state never shown as safe, plain SPL stated plainly, invalid mint
rejected before a request, JSON export with no authentication, no wallet or
signing affordance anywhere, 360px with no horizontal overflow, keyboard
navigation, and fixtures still usable when the live provider is unavailable.

## Deferred, and honestly so

| Capability | State |
| --- | --- |
| Saved cloud reports | **Implemented**, owner-scoped, tested. Supabase table migrated. Ships off behind `RWA_REPORTS_ENABLED=false`; local JSON/CSV export works without it. |
| Wallet sign-in for reports | **Implemented** and verified end to end with a real ed25519 keypair: challenge → signature → HttpOnly session; replayed nonce rejected (400), wrong key rejected (401). Ships off unless `RWA_SESSION_SECRET` is set. Message signature only — no transaction path exists. |
| Issuer registry adapter | Implemented, disabled, **no issuer endpoint hard-coded**. |
| NAV / price adapter | Interface defined, returns `null`. No USD value is ever fabricated. |
| Metadata URI fetching | **Implemented** deny-by-default with SSRF protections; no host allowlisted by default, so nothing is fetched. |
| `InterestBearingConfig` | Detected and reported as "calculation unavailable"; not computed. |

## Verified: optional surfaces refuse safely

With nothing configured, each optional endpoint states its own status rather
than erroring vaguely:

| Request | Result |
| --- | --- |
| `POST /api/rwa/auth` | `503 feature-disabled` — "Wallet sign-in is not enabled on this deployment." |
| `POST /api/rwa/metadata` | `200 not-configured` — "No metadata host is allowlisted, so no URI is fetched." |
| `GET /api/rwa/reports` | `503 feature-disabled` — "JSON and CSV export work without an account." |

With `RWA_METADATA_ALLOWED_HOSTS=metadata.example.com` configured, SSRF targets
are still refused **before any request is made**:

| URI | Result |
| --- | --- |
| `https://169.254.169.254/latest/meta-data/` | `400 blocked` |
| `https://127.0.0.1/a.json` | `400 blocked` |
| `http://metadata.example.com/a.json` (plain http) | `400 blocked` |

With `RWA_METADATA_ALLOWED_HOSTS` set to a real issuer host, the metadata panel
fetches only on request and only from that host:

| Request | Result |
| --- | --- |
| Allowlisted issuer URI for a live mint | `200 ok` — name, symbol, description and image returned, 195 bytes, labelled issuer-supplied |
| Any other host | `400 blocked` — "not on the configured allowlist" |
| Page load | **Zero** metadata requests; a browser test asserts none is made unasked |

With `RWA_SESSION_SECRET` set, a real keypair completes sign-in:

| Step | Result |
| --- | --- |
| Challenge | Message contains "not a transaction" and "moves no funds" |
| Verify with the correct key | `200 signed-in`, `HttpOnly` cookie set |
| Replay the same nonce | `400 invalid` |
| Verify with a different keypair | `401 invalid` |

## Two-minute demo script

| Time | Action |
| --- | --- |
| 0:00–0:20 | Open `/rwa`. It is already showing a populated inspection — a tokenized treasury. Point at **raw base units** and the **scaled amount** side by side. |
| 0:20–0:45 | "The raw number never moves. Yield arrives by changing a multiplier the issuer controls, so the displayed balance changes with no transaction in your history." Show the multiplier and the scheduled change. |
| 0:45–1:05 | Scroll to Extensions. Open `PermanentDelegate`: "this address can move or burn your tokens without your signature, and you cannot revoke it." |
| 1:05–1:25 | Switch to the private-credit fixture. Readiness is **unknown**, and the confidential portion is unknown — *not zero*. |
| 1:25–1:50 | Paste a real mainnet mint with a live RPC configured. Show the Evidence panel: slot, block time, commitment, decoder version, per-call status. |
| 1:50–2:00 | Export JSON. "No wallet, no signature, nothing is ever sent." |
