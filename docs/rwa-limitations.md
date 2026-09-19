# Limitations and boundaries

## Read-only product

RWA Lens inspects public Solana data. It has no transaction signer, asset-transfer,
settlement, custody, lending, minting or burning path. Optional wallet message
signing proves control of an address for report ownership; a saved report is a
database write. Guest inspection and local export require neither.

A successful decode is not verification of asset backing, compliance, KYC,
accreditation, sanctions status, redemption rights or investment performance.
The official issuer manifest is attribution, separate from the observed mint.
A content hash detects changes to a known JSON payload; it is not an attestation.

## Accounting

- Exact public raw units and supply use decimal strings / BigInt. Standard
  decimal conversion is exact; the Token-2022 Scaled UI Amount helper uses
  floating-point arithmetic and may not round-trip. Its labelled display output
  must never replace raw accounting quantities.
- Scaled UI Amount does not change raw holdings. A scheduled multiplier need
  not represent yield; its economic interpretation belongs to the issuer.
- InterestBearingConfig is detected but its conversion is unavailable in this
  release. The incompatible combination with Scaled UI Amount is rejected for
  display calculation.
- Confidential capability on a mint does not prove a holder has encrypted funds.
  Account-level confidential data is opaque. Observable public units are distinct
  from the unknown encrypted portion; no encrypted amount is guessed as zero.
- A mint-only query does not request balances. A valid empty owner response,
  failed owner request and partial decoded list are different states. Omitted or
  invalid accounts cannot support a complete-wallet total.

## Observation time and completeness

Mint, owner, Clock and metadata-pointer reads happen separately. Each available
context slot is recorded; `minContextSlot` is a lower bound, not an atomic snapshot.
Observed slot spread and omissions can make a result partial. Clock sysvar time
binds multiplier selection and helper conversion. Block time and local-clock
fallback are labelled estimates, especially near a scheduled boundary.

`getTokenAccountsByOwner` has no standard pagination. Transport byte limits stop
oversized responses; a configured decoded-account cap may still truncate the
returned list. Either case must remain unavailable/partial rather than complete.
No unbounded `getProgramAccounts` scan is used.

Unknown future Token-2022 TLV variants are surfaced by numeric ID and byte length
where the account envelope can safely be decoded. Malformed base account data
remains a decoder error. No unsupported extension is silently called safe.

Transfer readiness describes known blocks and unknown checks independently.
Without a recipient, amount, hook execution and transaction simulation it cannot
establish that a specific transfer will succeed. Default-frozen state applies to
new accounts; actual existing account states are inspected separately. CPI guard
has CPI-specific effects. Withheld fees are not subtracted twice.

## Network and metadata safety

The server controls network and provider. A browser cannot submit an arbitrary
RPC URL, and mainnet failures never silently switch to devnet. Read calls have
abortable timeouts, bounded retries, byte limits and structured redacted errors.
Public RPC services can still rate-limit or be unavailable; fixture mode remains
usable and is always labelled synthetic.

Token metadata is untrusted. Only explicit allowlisted HTTPS hosts may be fetched;
DNS resolution rejects private addresses and the connection is pinned to the
validated address. Redirects, unsupported content types and oversized responses
are refused. Metadata has a short cache lifetime and never renders arbitrary HTML.
Off-chain metadata fetch failure does not prevent the underlying mint inspection.
Remote registry/NAV sources are optional; no fiat value is invented.

## Production security and optional reports

The deployed project uses its existing independent RWA Lens Supabase shared read
rate limiter. Legacy configuration names are retained for that verified resource.
A bounded per-instance fallback for public reads favors availability and is **not**
a cross-instance security guarantee. Authentication requires durable storage and
shared limiting and fails closed if they cannot be reached.

New wallet authentication uses a cryptographic nonce with expiry, stored exact
message, domain/URI/network/purpose and browser binding. SQL consumes a challenge
atomically across instances; there is no process-memory production replay store.
Signature verification uses Node's maintained Ed25519 implementation. Session MACs
use constant-time comparison. State-changing authenticated routes require the
configured exact origin and use HttpOnly/SameSite cookies, Secure in production.

Cloud reports and sign-in are **disabled optional** on the deployed configuration:
`RWA_REPORTS_ENABLED`, `RWA_APP_ORIGIN`, `RWA_SESSION_SECRET`,
`RWA_SUPABASE_URL` and `RWA_SUPABASE_SERVICE_ROLE_KEY` plus the durable-store
migration are prerequisites. The UI omits unavailable cloud actions; export works.

The new `rwa_wallet_reports` table uses wallet addresses as server-enforced owners.
It is separate from the existing UUID-owner `rwa_reports` table. The service-role
client bypasses RLS, so the server explicitly filters every read by authenticated
wallet owner. The custom HMAC cookie is not a Supabase JWT, and no automatic RLS
mapping is claimed. Anonymous clients are denied the private table/functions.
Reports are produced by a fresh server inspection; the client cannot upload a
forged observation as server evidence. Cross-owner report IDs return 404.

Live wallet/provider-dependent optional behavior is not inferred from mocked
integration tests. The capability matrix identifies exactly which paths were
locally tested, exercised live, hosted, disabled or still blocked.

## Pointed metadata account scope

A configured MetadataPointer is validated as a 32-byte address. An unset pointer
causes no read; a self-pointer reuses the mint observation. Any other pointer
permits at most one account read through the same configured, abortable,
response-size-bounded RPC adapter. Owner, byte length, commitment and context
slot are recorded; pointed slots contribute to the observed slot spread.

Only a non-executable, initialized Token-2022 mint layout can be decoded with the
installed official codec, and its TokenMetadata must identify the original mint.
An arbitrary program implementing the metadata interface can choose a different
storage layout. Those owners/layouts remain explicitly unsupported and partial;
missing, malformed, mismatched or oversized metadata does not erase core mint
identity. No pointer chain is followed and no off-chain URI is fetched as part
of this account read. External pointer cases are deterministically tested; a
live external pointed-account receipt has not been captured.
