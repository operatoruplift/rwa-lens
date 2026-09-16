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

- **Rate limiting is per-instance and in-memory.** It protects one process and
  the RPC budget. It is not a distributed limiter and not a security boundary.
- **Metadata fetching is deny-by-default.** No URI is fetched unless its host is
  explicitly allowlisted. https only; loopback, private, link-local and bare-IP
  hosts are rejected. Core inspection never requires fetching a URI.
- **No RPC URL, cluster or redirect target is ever accepted from user input.**
- **Errors are structured.** Provider URLs, keys and stack traces are never
  returned to the client.

## Not integrated

Pyth, Switchboard, Jupiter, Meteora, MagicBlock and issuer NAV feeds are **not**
integrated. Adapter interfaces exist for a registry and a NAV source, but both
are disabled by default and no issuer endpoint is hard-coded. No USD value is
ever fabricated when a price source is absent.
