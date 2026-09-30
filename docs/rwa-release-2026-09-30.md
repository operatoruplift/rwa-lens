# RWA Lens — 30 September 2026 release verification

This release continues from `b74e0ed6cac8a4999688af7d8d65632eda9d027b`
and preserves the merged presentation, PWA/Seeker, venues, reserve-link, optional
USDC-deploy and yield-discovery work. The existing repository, Vercel project
and production aliases are retained.

## Corrections

- The yield screener keeps qualifying pools beyond the inspector's five-pool
  display limit and follows upstream pool pages. Bounded scans fail explicitly
  when completeness cannot be established. The inspector retains its compact
  five-pool panel.
- Optional deposit previews validate the exact selected pool through a bounded
  pool-address lookup, independently of the inspector's display cap. Existing
  on-chain, account, instruction and spend checks remain in place.
- Issuer market-session observations refresh with pool data and become unknown
  after ten minutes. An issuer outage can retain known asset identities, but
  cannot refresh an old open/closed/halted flag. HTTP responses use `no-store`;
  the server still caches and coalesces upstream reads.
- Failed issuer-catalog pages receive one retry with the existing five-second
  deadline per attempt. Blocked requests are not retried. Two cold live reads
  exposed upstream timeouts before this correction; the explicit live screener
  test subsequently passed.
- Installed apps refresh mutable brand images and icons online. The service
  worker migrates its prior cache, keeps build-addressed Next assets cached,
  and serves the offline notice when navigation has no connection. RPC,
  authentication and report responses stay outside Cache Storage.
- The manifest describes the mainnet walkthrough. Public deploy messaging uses
  preflight terminology while preserving the distinction between checking a
  transaction and signing or submitting it.
- Technical materials and the presenter guide cover the current feature set.
  Freeze authority is distinguished from a currently frozen account. The pitch
  PDF has exactly 13 nonblank pages; HTML and editable PPTX retain 13 slides.

## Hosted baseline evidence

The audit before these corrections exercised production deployment
`dpl_7E9Krj4o1qbKG2RqLH6Q7bJAihfb`
(`rwa-lens-b4xcc9590-operatoruplift.vercel.app`) on 30 September 2026.
Its source CI run was
[36465927598](https://github.com/operatoruplift/rwa-lens/actions/runs/36465927598).

- Sixty primary browser checks passed across `/`, `/rwa`, `/yield`, `/demo`,
  `/technical`, `/pitch` and `/brand-kit` at desktop and mobile sizes.
- The live USDY inspection, exact JSON/hash and CSV export, yield filters,
  keyboard controls, scrolling, motion pause and reduced motion worked.
- Thirty-nine linked downloads returned valid files; no client or console
  errors were observed. Offline HTML deck navigation and notes worked.
- The independent live API receipt at 09:37 UTC recorded USDY at slot
  `451926209` and a complete reconciled public-owner read. A later browser
  owner read correctly disclosed a partial result. These are distinct reads,
  not an atomic snapshot or a claim about a wallet's actual holdings.
- Production rejected offline fixture requests with HTTP 403. The audit did
  not connect a wallet, sign or submit a transaction.

## Presentation verification

All 13 slides fit at 1920×1080, 1280×720, 768×1024, 375×667 and 667×375.
All PDF pages were checked for content and pagination. The PPTX contains 13
editable slides. All eight entries in `public/presentation/manifest.json`
match the generated files' byte sizes and SHA-256 hashes.

## Release checks

Lint, TypeScript checks and the production build passed. After the selected-pool
and catalog-retry corrections, the full unit suite passed **402 tests**, with
five explicit live tests skipped by default. The opt-in live screener read
passed separately. The standard production browser suite passed **38 cases**,
including scrolling, reduced motion, responsive layouts, exports, source
evidence, provider failures, venue data separation and yield navigation.
The separate optional-deploy suite passed **7 cases** with a mocked wallet and
mocked transaction responses, for **45 production-browser cases** in total.
No transaction was signed or submitted by these checks.

Independent reviews covered the changed service worker, pool normalization,
pagination and freshness boundaries, selected-pool lookup, deploy wording and
presentation generation. The release commit also runs the repository's full
[Verify RWA Lens workflow](https://github.com/operatoruplift/rwa-lens/actions/workflows/ci.yml),
including a fresh build and the separate mocked-wallet browser suite.

## Exposure and remaining activation steps

Mainnet inspection, guest exports, market discovery, the guided demo, brand kit
and presentation downloads are public. Cloud reports and wallet-signed pool
deployment remain operator-enabled capabilities; the public deployment keeps
them off. Automated wallet tests do not establish a funded on-chain deposit.

The PWA and Android Web Shell source are present. A signed release APK,
on-device wallet validation and a dApp Store submission remain separate mobile
release steps. No mobile-store publication or completed phone validation is
claimed by this web release.

The older capability matrix and deployment receipts retain their original dates
and scopes. They are historical evidence, not the current test counts or
production deployment identity.
