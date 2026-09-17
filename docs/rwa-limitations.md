# RWA Lens — limitations and boundaries

## What this app does not do

RWA Lens is **read-only**. It never signs, sends, mints, burns, freezes, thaws,
transfers, swaps, lends, borrows, bridges or rebalances anything. There is no
signer, no private key and no funds path anywhere in the codebase. The only
write path that exists at all is an optional, owner-scoped saved report.

It makes **no claim** about KYC, AML, accreditation, sanctions, securities law,
proof of reserves, redemption rights or investment performance. It explains the
on-chain controls it can observe and names the authorities behind them. A human
or a regulated service remains responsible for every legal decision.

## Accounting limitations

- **Scaled UI Amount conversion is floating-point.** The official Token-2022
  helper (`amountToUiAmountForScaledUiAmountMintWithoutSimulation`) multiplies
  through a JS `number`. Any value it produces is labelled `official-helper` and
  is a *display* amount, not an accounting figure. The raw base units shown
  alongside it are exact and are what should be reconciled against.
- **The multiplier itself is an f64** in the extension, so no conversion path can
  be more exact than the value on chain.
- **`InterestBearingConfig` is detected but not computed.** It is reported as
  "calculation unavailable" rather than guessed at. It is also documented as
  incompatible with Scaled UI Amount.
- **Confidential balances are unknown, never zero.** Any encrypted portion is
  outside what this tool can observe, and the UI says so.

## Observation limitations

- **Account lists can be incomplete.** Owner token accounts are bounded by
  `RWA_RPC_MAX_ACCOUNTS`. When the cap is hit the result sets `complete: false`
  and the UI explicitly states the total is not a complete wallet balance.
- **Reads are not atomic.** Chain time, the mint account and token accounts are
  separate RPC calls at potentially different slots. The observed slot and block
  time are recorded in provenance for exactly this reason.
- **Block time can be missing.** When it is, the multiplier boundary is evaluated
  against local time, `timeSource` becomes `local-estimate`, and an amber warning
  is shown. It is never silently treated as chain time.
- **Unknown extensions stay unknown.** A future Token-2022 variant this release
  does not recognise is surfaced as opaque with its identifier, and it degrades
  the transfer-readiness verdict rather than being ignored.

## Security limitations

- **Rate limiting is shared across instances when Supabase is configured.** The
  count lives in Postgres behind a `SECURITY DEFINER` function guarded by a
  server-held secret, keyed by a hash of the client IP (no address is stored).
  Without that configuration it falls back to a per-instance window, which on a
  serverless host is not a limit under concurrency. If the shared store is
  unreachable it fails open to the local window: availability over strictness
  for a read-only tool. It is still not a security boundary.
- **Metadata fetching is deny-by-default.** No URI is fetched unless its host is
  explicitly allowlisted. https only; loopback, private, link-local and bare-IP
  hosts are rejected. Core inspection never requires fetching a URI.
- **No RPC URL, cluster or redirect target is ever accepted from user input.**
- **Errors are structured.** Provider URLs, keys and stack traces are never
  returned to the client.

## Optional surfaces and their limits

- **Wallet sign-in requests a message signature only.** It never requests a
  transaction and never touches a private key. Nonces are single-use with a
  five-minute expiry; a replay finds nothing. Sessions are HMAC-signed and
  verified in constant time, and a failed signature never degrades into a
  session. Nonce state is **per-instance and in memory**, so a multi-instance
  deployment needs a shared store before this is relied on.
- **Saved reports are owner-scoped twice** — the query filters by owner and
  row-level security enforces it again. Another owner's id returns 404 rather
  than 403 so an id cannot be probed for existence. Ownership always comes from
  the session, never from the request body, and the content hash is computed
  server-side.
- **Metadata fetching follows no redirects.** A redirect is an error rather than
  a hop, because a redirect is the ordinary way to escape a host allowlist.
  Errors never include the URI, host or underlying message.
- **The registry adapter is not proof of anything.** Whatever it returns is
  issuer-supplied description, carries a source and a stale flag, and can never
  fail an inspection.

## Not integrated

Pyth, Switchboard, Jupiter, Meteora, MagicBlock and issuer NAV feeds are **not**
integrated. Adapter interfaces exist for a registry and a NAV source, but both
are disabled by default and no issuer endpoint is hard-coded. No USD value is
ever fabricated when a price source is absent.
