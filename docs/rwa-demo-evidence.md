# RWA Lens — verification evidence

This record separates real Solana reads, deterministic examples, local production
browser checks, and optional integrations. Capture dates are **19 September 2026
UTC / 20 September 2026 Asia/Ho_Chi_Minh**. These are point-in-time observations,
not current balances, issuer attestations, or investment verification.

Read [setup and API contracts](../README.md), the
[capability matrix](rwa-capability-matrix.md),
[limitations](rwa-limitations.md), the [two-minute demo script](rwa-demo-script.md),
and [deployment/rollback instructions](rwa-deployment.md) alongside this evidence.

## Verified production release

The application release is commit [`a3e1b386fa762bb87ae894dab47cae7ca6c64b94`](https://github.com/operatoruplift/rwa-lens/commit/a3e1b386fa762bb87ae894dab47cae7ca6c64b94).
Vercel built it in the existing `rwa-lens` project and reported **Ready** as
`dpl_5dhCMrvc3RRWR83vDPYT6QP1FrCV`, at
https://rwa-lens-79mz5m9zi-operatoruplift.vercel.app. Both production aliases,
https://rwalensonsolana.vercel.app and https://rwa-lens-omega.vercel.app, were preserved.
Subsequent evidence-only commits do not change application code.

| Release check | Actual completed result |
| --- | --- |
| Local full suite | Lint, TypeScript, **220 unit/integration tests**, production build passed |
| Local production browser | **20 passed** in 52.2 seconds, including 360/390/768/1440px, keyboard, reduced motion, real fixture API, exports and error recovery |
| [GitHub deterministic CI](https://github.com/operatoruplift/rwa-lens/actions/runs/35460995007) | **Success** on the application commit; clean install, lint, typecheck, 220 tests, build and 20 production browser cases |
| [Explicit hosted read workflow](https://github.com/operatoruplift/rwa-lens/actions/runs/35461071585) | **Success** on the application commit; public USDY/owner reads and strict fixture-accounting assertions; hosted-read artifact retained |
| Hosted browser suite | **20 passed** in 43.6 seconds against the canonical production URL |
| Additional unmocked browser journey | Both routes HTTP 200; actual USDY button and public-owner inspection; guest JSON download and SHA-256 verified; no JavaScript errors |
| Hosted API and headers | Landing, inspector and logo 200; invalid input 400; foreign Origin 403; private metadata URL blocked 400; CSP/frame/content-type protections present |
| Optional auth/reports | Both endpoints 503 `feature-disabled`; guest export works |
| External metadata URI | Existing HTTPS host policy blocks the tested xStocks issuer URI (400). No successful remote fetch is claimed; operator configuration was preserved |

Machine-readable receipts: [hosted live observations](evidence/live-observations.json),
[API/header/metadata checks](evidence/hosted-surface-checks.json),
[unmocked browser journey](evidence/hosted-browser-verification.json),
and the [actual downloaded live receipt](evidence/hosted-browser-export.json).
Hosted screenshots: [landing](screenshots/hosted-landing-1440.png),
[desktop live USDY](screenshots/hosted-desktop-usdy-1440.png),
[mobile live USDY](screenshots/hosted-mobile-usdy-390.png).

At `2026-09-19T18:24:03.289Z`, the hosted API verified USDY at mint/Clock slot
`448487557`, with Clock time `2026-09-19T18:24:03.000Z`. Its declared public-owner
read returned a validated empty list, raw/standard `0`, `balanceStatus=observed`
and `complete=true` with matching contexts at `448487559`. Matching context slots
do not make separate RPC calls an atomic snapshot. The browser independently
read the mint at `448487879` and the owner at `448487881`. A secondary hosted
Apple xStock read at `448487656` confirmed Token-2022 and its eight extensions.
The earlier local receipts below remain historical, separately dated evidence.

## Source and build identity

| Item | Measured value / scope |
| --- | --- |
| Repository | [operatoruplift/rwa-lens](https://github.com/operatoruplift/rwa-lens) |
| Checkout base during local capture | `c5fa4dda96d890025815d6a6ef8f3d4c402b9cb5` plus the working-tree implementation changes; this base hash alone does **not** identify the new release |
| Local production capture | `http://127.0.0.1:3300`; live receipts captured at `2026-09-19T18:04:49.163Z` and `2026-09-19T18:05:22.972Z` |
| Runtime inspected | Next.js `16.3.5`, React `19.2.8`, TypeScript `5.9.3`, Node `22.19.0` |
| Solana packages | `@solana/kit`, `@solana/rpc-spec-types`, `@solana/sysvars` `8.3.0`; `@solana-program/token-2022` `0.17.0` |
| Decoder identifier | `@solana-program/token-2022@0.17.0+rwa-lens.2` |
| RPC | `mainnet-beta`, `api.mainnet-beta.solana.com`, `confirmed` commitment |
| Release provenance boundary | Local captures preceded the final review corrections. The verified production release above supplies the final application commit, deployment identity, hosted receipts and successful GitHub runs; these earlier local captures do not substitute for them. |

## Official non-stock example: Ondo USDY

The checked-in [source manifest](../lib/rwa/live-assets.json) records the exact
Solana address from [Ondo's official address list](https://docs.ondo.finance/addresses)
and the asset category from [Ondo's USDY documentation](https://docs.ondo.finance/general-access-products/usdy/basics).
The source was retrieved at `2026-09-19T17:56:59.352Z`. It identifies USDY as a
Treasury-linked tokenized note; the app treats that description as attribution,
separate from the RPC evidence. This read establishes the required non-stock
example. USDY uses legacy SPL Token here; it does not demonstrate Token-2022
extension behavior.

The full request and response are in
[local-live-observations.json](evidence/local-live-observations.json).

| Observation | Actual result |
| --- | --- |
| Mint | `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` |
| HTTP / observation status | `200` / `verified`, mode `live` |
| Program | `spl-token`, `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Decimals / raw supply | `6` / `157215235713925` |
| Mint authority | `8n2uiRUd1A9NN78PKESkJe6k6zMqtKCZh3MrK1j9qkB1` |
| Freeze authority | `51QVCuHfL1FeNjd8BDeffCKhCcAYoULnVB3yjNhShiuK` |
| Mint account / decoder context | `448483260` |
| Clock account context / Unix timestamp | `448483261` / `1789841089` |
| Observed Clock UTC time | `2026-09-19T18:04:49.000Z` |
| Slot spread | `1`; these are separate reads, not an atomic snapshot |
| Block time | Not fetched; observed Clock sysvar time is available instead |
| Cache | Fresh observation; no `cacheAgeMs` in the receipt |
| Balance | `not-requested`; mint-only inspection does not fabricate a holder balance |
| Extensions / multiplier | None / not applicable to this SPL mint |
| Readiness | `ready`: no block in the inspected data; no recipient, amount, hook evaluation or transfer simulation was performed |
| Registry / NAV | Checked-in official-source attribution / NAV not configured |

### Public owner read

The owner is the **observed public mint-authority address** above. It is a declared
read-only example, not a claim about the operator's wallet or who controls it.
The owner RPC returned an empty list. The response distinguished that result from
a failed lookup, while retaining `complete=false` because its slot differed from
the mint slot.

| Evidence | Actual result |
| --- | --- |
| Mint context | `448483262` |
| Clock context / timestamp | `448483263` / `2026-09-19T18:04:49.000Z` |
| `getTokenAccountsByOwner` context | `448483266` |
| Slot spread | `4` |
| Returned accounts | `[]` |
| Observed public raw / standard units | `0` / `0`, decimals `6` |
| Completeness / status | `false` / `partial`; balance status `partial` |
| Readiness | `unknown` because the owner observation is not an atomic complete result |

This is live verification of a successful **empty** owner lookup. Nonzero and
multi-account reconciliation are covered by official-encoder integration tests
and synthetic browser examples; this receipt does not prove a live nonzero
holding.

## Secondary Token-2022 read

[Token-2022 receipt](evidence/token-2022-live-observation.json) records Apple xStock
as additional decoder evidence. It is not the non-stock example and is not
presented as backing or issuer verification.

| Observation | Actual result |
| --- | --- |
| Mint | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` |
| Declared public owner | `7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj`, its observed mint authority |
| Program | `token-2022`, `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| Decimals / raw supply | `8` / `15376337527821` |
| Mint context / Clock context / owner context | `448483390` / `448483390` / `448483391` |
| Clock Unix timestamp / UTC | `1789841124` / `2026-09-19T18:05:24.000Z` |
| Public owner accounts / raw amount | Empty / `0`; `complete=false` because owner and mint contexts differ |
| Active multiplier | `1.0032690125398187`; observed after `2026-08-08T00:30:00.000Z` |
| Standard / extension display | `0` / `0`, rounding `official-helper` |
| Extensions | MetadataPointer, PermanentDelegate, DefaultAccountState, ScaledUiAmountConfig, PausableConfig, ConfidentialTransferMint, TransferHook, TokenMetadata |
| Hook / pause | Hook program unset; mint unpaused with an observed pause authority |
| Readiness / observation status | `unknown` / `partial` |
| Metadata URI / registry / NAV | URI exposed, remote fetch skipped / no attribution configured / not configured |

ConfidentialTransferMint establishes capability only. It does not prove a nonzero
encrypted holding. The permanent delegate address is
`5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`; the freeze/pause authority is
`JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs`.

The saved receipt preserves its original field labels. Subsequent reviewed code
labels stored and scheduled multipliers separately, hides unset optional
authorities, rejects reserved multisig layouts, and withholds extension display
when an extension cannot be interpreted. These fixes have deterministic tests;
the earlier receipt is not silently rewritten as newer evidence.

## Deterministic treasury accounting

The `treasury-scaled` fixture uses the same server response schema and accounting
engine as live inspections. Its identities, slots, and dates are synthetic.
Only its fixed server-known ID and a scenario can be supplied; balances,
provenance and identity cannot be overridden by the browser.

| Scenario | Synthetic observed time (UTC) | Raw units | Decimals | Standard units | Active multiplier | Extension display |
| --- | --- | --- | --- | --- | --- | --- |
| Before | `2026-09-16T00:00:00Z` | `1000000000` | `6` | `1000` | `1.04235` | `1042.35` |
| At | `2026-10-01T00:00:00Z` | `1000000000` | `6` | `1000` | `1.05114` | `1051.14` |
| After | `2026-10-01T00:00:01Z` | `1000000000` | `6` | `1000` | `1.05114` | `1051.14` |

Each scaled value is labelled `official-helper`. Even multiplier `1` uses the
helper: with raw `18446744073709551615`, decimals `9`, exact standard units are
`18446744073.709551615`, while the official scaled display is
`18446744073.709552765`. The display value is never fed back into raw accounting.
A multiplier change alone is not evidence of yield or investment performance.

## Checks and browser evidence

| Command / check | Completed result and scope |
| --- | --- |
| `npm test` | **220 passed** in the latest full deterministic run reported during this implementation |
| Focused post-review accounting/decoder/readiness run | **98 passed** before the later full run; includes unknown TLV, multiplier-1 rounding, multisig rejection and unset-authority regressions |
| Targeted ESLint on changed core files | Passed |
| `npm run lint`, `npm run typecheck` | Passed in the final full release checks |
| `npm run build` | Passed after all source and SDK test-type corrections; production routes emitted successfully |
| `npm run test:e2e` with a local production server | **20 passed in 52.2 seconds** against the production `next start` server at `http://127.0.0.1:3300`; includes registry attribution |
| Production dependency review | `npm audit --omit=dev` reported zero vulnerabilities during implementation; installed manifest and lockfile remain aligned |
| GitHub Actions | Both actual successful release runs are linked in the production release table above |

Playwright launches `npm run start -- --port 3300`, so its managed server serves
an existing **production build**, not `next dev`. `E2E_BASE_URL` uses an explicitly
supplied running server instead. Browser tests exercise real fixture API calls,
invalid input, account/evidence disclosure, before/at/after controls, readiness,
JSON/CSV downloads and hashes, keyboard focus, reduced motion and fixture recovery.
The live-badge/form and provider-down browser cases intercept RPC API responses;
they are UI contract tests, not additional live-chain evidence.

The checked-in local browser captures are:

- [360px mobile](screenshots/rwa-mobile-360.png), [390px mobile](screenshots/rwa-mobile-390.png)
- [768px tablet](screenshots/rwa-tablet-768.png), [1440px desktop](screenshots/rwa-desktop-1440.png)
- [Keyboard focus](screenshots/rwa-keyboard.png), [Reduced motion](screenshots/rwa-reduced-motion.png)

These six capture cases were run locally and again on production. The separately
labelled hosted live screenshots and unmocked receipt are linked above. Follow the
[demo script](rwa-demo-script.md) and [deployment guide](rwa-deployment.md) to reproduce.

## Independent database and disabled optional surfaces

The [database verification receipt](evidence/database-verification.json) identifies
the independent `rwa-lens` Supabase project `skpzggvbnuipdqhtwmbw`. The additive
`rwa_wallet_reports_durable_auth` migration was applied while preserving existing
`public.rwa_reports` and `public.consume_rate_limit` resources.

Actual database checks established:

- Atomic challenge consumption: two independent concurrent consume queries
  returned `[true, false]`; one-time consumption also passed rollback-scoped tests.
- Shared rate limiting: first two requests allowed, third denied in the isolated
  SQL check; its test writes were rolled back.
- Anonymous and generic authenticated roles have no private report-select
  privilege; anonymous callers cannot execute the challenge function.
- A direct anonymous REST request to `rwa_wallet_reports` returned HTTP `401`,
  PostgreSQL code `42501`.
- The service role has no report-update privilege.

**Wallet sign-in and cloud reports remain disabled optional.** There is no claim
of a real production wallet session or service-role HTTP report-save journey.
Two-owner repository tests use mocked PostgREST. Ownership comes from the verified
server session and explicit owner-filtered queries; a custom HMAC cookie is not a
Supabase JWT, and service-role access bypasses RLS. No automatic second RLS
ownership enforcement is claimed.

| Configuration surface | Verified presence / exposure |
| --- | --- |
| Mainnet RPC | Configured for the local live capture above; URL remains server-only |
| Existing RWA database | Independent project and durable migration verified directly |
| Shared public-read limiter | Existing independent RWA limiter preserved; a bounded per-instance fallback is not a cross-instance security guarantee |
| Report/auth prerequisites | `RWA_REPORTS_ENABLED`, `RWA_APP_ORIGIN`, `RWA_SESSION_SECRET`, `RWA_SUPABASE_URL`, `RWA_SUPABASE_SERVICE_ROLE_KEY`; disabled until the complete configuration and wallet journey are verified |
| Metadata URI retrieval | Deny-by-default unless `RWA_METADATA_ALLOWED_HOSTS` explicitly permits the host; DNS pinning/private-address/type/size/redirect checks tested locally |
| Remote issuer registry | Optional `RWA_REGISTRY_URL` / `RWA_REGISTRY_ALLOWED_HOSTS`; no remote issuer endpoint claimed as integrated |
| NAV / fiat price | Disabled; no value fabricated |

No secret values, signatures, cookies or authorization headers are included in
these receipts. Optional message signing authenticates report ownership only;
public inspection and local export never request a transaction.

## Reproduction

After `npm ci`, run the deterministic checks, build once, then start the production
server. Supply your provider only in the server environment; the browser never
accepts an RPC URL.

```sh
npm run lint
npm run typecheck
npm test
npm run build
RWA_CLUSTER=mainnet-beta RWA_RPC_URL=https://api.mainnet-beta.solana.com npm run start -- --port 3300
```

From a second shell:

```sh
RWA_VERIFY_BASE_URL=http://127.0.0.1:3300 \
RWA_VERIFY_OUTPUT=docs/evidence/local-live-observations.json \
node scripts/verify-live.mjs

E2E_BASE_URL=http://127.0.0.1:3300 npm run test:e2e

curl -sS http://127.0.0.1:3300/api/rwa/inspect \
  -H 'content-type: application/json' \
  -d '{"mode":"fixture","fixtureId":"treasury-scaled","scenario":"at"}'
```

For an explicit hosted read, run `node scripts/verify-live.mjs`; its default target
is the existing production alias and its output is
`docs/evidence/live-observations.json`. External reads are deliberately separate
from deterministic CI. Public RPC availability may change; retain the real error
and use the visibly synthetic fixture if it does.

## Known limits and remaining verification

- The live owner samples were empty. Earlier local reads were mixed-slot; hosted reads include matching contexts. No nonzero live holding or executed transfer is claimed.
- MetadataPointer and embedded TokenMetadata are decoded. A valid external
  pointer triggers at most one bounded account read with owner, byte length and
  context slot recorded. The official Token-2022 mint layout is decoded only
  when initialized, non-executable and bound to the inspected mint. Arbitrary
  interface-program layouts remain unsupported, with explicit partial/opaque
  evidence. Supported, unsupported, wrong-mint, malformed, missing and self/unset
  cases have deterministic tests; no real external pointed-account receipt is
  claimed. No pointer recursion or automatic URI fetch occurs.
- Interest-bearing conversion is detected but unavailable. Unknown or malformed
  extension display remains unavailable; standard public units remain separate.
- Confidential amounts, recipient eligibility and hook outcomes are unknown.
- No real wallet authentication/report-save or remote NAV/registry journey was
  exercised. Optional reports/auth are disabled pending that verification.
- All RPC reads are non-atomic; provider list completeness cannot be independently
  proven. Transport and account caps preserve partial/unavailable states.

## Primary references checked

Accessed **19 September 2026 UTC / 20 September 2026 Asia/Ho_Chi_Minh**. These
references guided implementation; reading documentation is not integration proof.

| Reference | Implementation use |
| --- | --- |
| [Token-2022 extensions](https://solana.com/docs/tokens/extensions) | Extension taxonomy and TLV framing |
| [Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount) | Clock boundary, immediate timestamp, floating-point display, incompatible interest configuration |
| [Metadata Pointer and TokenMetadata](https://solana.com/docs/tokens/extensions/metadata) | One bounded pointer observation; storage owned by an arbitrary interface program cannot be guessed from Token-2022 layout |
| [Default account state](https://solana.com/docs/tokens/extensions/default-state) | New-account defaults distinguished from existing account state |
| [Transfer hooks](https://solana.com/docs/tokens/extensions/transfer-hook) | Configured hook requires evaluation; no KYC inference |
| [Confidential balances](https://solana.com/docs/tokens/extensions/confidential-transfer) | Capability distinguished from unobservable account holdings |
| [Permanent delegate](https://solana.com/docs/tokens/extensions/permanent-delegate) | Mint-level delegate control and optional authority |
| [Token accounts by owner RPC](https://solana.com/docs/rpc/http/gettokenaccountsbyowner) | Mint filter, returned account program/owner validation, context slots |
| [Token-2022 extension interface](https://github.com/solana-program/token-2022/blob/main/interface/src/extension/mod.rs) | Reserved multisig length must not decode as mint/token state |
| Installed SDK `src/generated/accounts`, `src/generated/types/extension.ts`, `src/hooked/extensions.ts`, `src/amountToUiAmount.ts` | Official mint/token/extension codecs and display helper; unknown framing retains numeric identifier and length |
| Installed Next.js `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` | Current route-handler behavior required by this repository's `AGENTS.md` |
