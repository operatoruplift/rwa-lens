# Optional deploy: USDC into a listed Meteora pool

Off by default. With `RWA_DEPLOY_ENABLED=true` (mainnet only), each Meteora DLMM
pool in the venues panel that pairs the inspected token with USDC offers
**Deploy USDC**. One click builds, simulates and hands the user's wallet a single
transaction; inspection, exports and saved reports are unchanged and still need
no wallet.

## What the transaction does

1. **Swap.** Half of the USDC budget goes through Jupiter's swap API (v1,
   ExactIn, direct routes only) into the inspected token. Jupiter's own
   compute-budget instructions are dropped. The only other Jupiter step accepted is
   creating the wallet's own USDC or token account; see the checks below.
2. **Deposit.** A Meteora DLMM Spot deposit (`add_liquidity_by_strategy2`,
   `SpotImBalanced`) across 69 bins centred on the pool's active bin: the swap's
   **guaranteed minimum** output plus the other half of the USDC. Any fill better
   than the minimum stays in the wallet.
3. **Position.** `initialize_position_pda` with the wallet itself as the PDA base,
   so the wallet is the transaction's only signer. A repeat deploy at the same
   range adds to the wallet's existing position instead of failing. Missing bin
   arrays are initialised in the same transaction and reported.

The DLMM instructions are hand-encoded from IDL 0.12.0 with `@solana/kit`; no
Anchor or web3.js dependency ships. `tests/rwa/deploy-dlmm.test.ts` pins every
byte and PDA against the official `@meteora-ag/dlmm` 1.9.14 SDK output
(`tests/rwa/fixtures/dlmm-golden.json`), including negative bins and the bitmap
extension case.

## Checks before a wallet sees anything

The server refuses, with a plain reason, when:

- the pool is not in the venues listing for the mint (exact mint, not blacklisted,
  at least $100 TVL, top five), is not a DLMM LbPair, is disabled, or does not
  pair the token with USDC;
- the token's program does not match the pool's record, or the mint runs an active
  transfer hook, charges a transfer fee, is paused, non-transferable, or starts new
  accounts frozen;
- the wallet cannot pay fees, holds less USDC than the budget, has a frozen token
  account, or has too little SOL for rent (from the Rent sysvar, so rent changes
  are respected);
- the swap's price impact exceeds 5%, or the pool's price is more than 5% from the
  swap's price (above 1% the review shows a warning, because a lagging pool can
  lose part of the difference to arbitrage);
- Jupiter's response holds anything beyond its swap instruction plus
  associated-token-account creation (Create or CreateIdempotent, paid by the
  wallet) for the wallet's own USDC or token account: any Token or System
  instruction, any cleanup step, any extra instruction such as a tip, any signer
  other than the wallet, or a swap that does not move funds between those two
  accounts;
- any writable account in the transaction is a token account held by the wallet
  other than those two, which stops a route from reaching the wallet's other
  holdings;
- a lookup table the route uses is being retired (table entries are append-only,
  so an index the transaction references cannot be remapped);
- the whole transaction does not fit in 1,232 bytes after shrinking the route
  (`maxAccounts` 40 → 24 → 16);
- **the whole transaction fails simulation** against current mainnet state
  (`sigVerify: false`). Failures are translated: slippage, bin slippage, SOL or
  token shortfalls, or the Meteora error name;
- **the simulated balances disagree with the preview**, compared with balances
  read just before simulating: USDC must fall by at least the swap's exact input
  and at most the budget (the deposit can leave a few base units behind to
  per-bin rounding), the wallet's token balance must not fall, and SOL spent must
  stay within the new accounts' rent plus the most the fees can be.

The compute-unit limit comes from the simulation (units × 1.15 + 20,000). The
review lists amounts, the price range, rent (from simulated post-state: the
position's rent is returned when it is closed) and the network fee, rounded up.

## In the browser

`components/rwa/deploy/use-yield-deployer.ts` is the state machine: wallet →
connecting → form → quoting → review → signing → confirming → confirmed or failed.
The client checks that the prepared transaction's fee payer and only signer is
the connected account before calling the wallet's
`solana:signAndSendTransaction` (Wallet Standard, v0 required; Mobile Wallet
Adapter works the same way). A review is signable for 45 seconds, after which it
must be rebuilt. Confirmation requires an error-free `confirmed` status; a
signature past its blockhash's last valid height is reported as expired.

## Verification

- Unit: 7 SDK-parity tests, 28 builder tests (fakes for chain, Jupiter and
  venues, including each balance mismatch, a route reaching another of the
  wallet's token accounts, a retired lookup table and a program marked
  writable), 26 Jupiter-acceptance, failure-explanation and status tests (every
  way a response could smuggle a transfer, approval or cleanup), and 4 route
  tests.
- Browser (`npm run test:e2e:deploy`, flag on, mocked wallet and APIs): preview,
  sign, confirm; refusals, a mismatched fee payer and a declined signature never
  send; an expired preview must be rebuilt; no-wallet state; 390px layout; axe
  WCAG 2.1 AA on the open dialog; landing copy. The main suite asserts the button
  is absent with the flag off.
- Live mainnet simulation (not sent), 2026-09-28, 10 USDC, 1% slippage, owner a
  funded public wallet — `tests/live/deploy.live.test.ts`:

| Pool | Token program | Direct route | Compute units | Pool vs swap price |
| --- | --- | --- | --- | --- |
| USDY-USDC `4dLtt8…Die` (bin 1) | SPL Token | Whirlpool | 457,351 | 0.33% |
| METAx-USDC `D8pGWV…YL` (bin 10) | Token-2022 | Meteora DLMM | 533,732 | 0.10% |
| TSLAx-USDC `BCZLEg…K2` (bin 50) | Token-2022 | direct via Jupiter | 504,519 | 3.21% (warned) |
| QQQx-USDC `eV4ogm…Eo` (bin 20) | Token-2022 | Riptide | 489,507 | 3.02% (warned) |

These runs caught two defects the unit tests could not: Jupiter can route through
Meteora DLMM with the DLMM program marked writable (the builder now demotes an
invoked program to read-only, as the runtime does), and a multi-hop route creates
the wallet's intermediate token accounts (quotes are now direct routes only).
A simulation against a busy exchange wallet also showed that balances read
seconds earlier can drift, so the balance check re-reads them just before
simulating.

Run it again with:

```sh
RWA_LIVE_DEPLOY_OWNER=<funded address> RWA_CLUSTER=mainnet-beta RWA_RPC_URL=<url> npx vitest run tests/live
```

## Operating it

- `RWA_DEPLOY_ENABLED=true` turns on the button, the two routes
  (`POST /api/rwa/deploy`, `GET /api/rwa/deploy/status`) and the adjusted landing
  copy. Off, both routes return 404 and nothing renders.
- `JUPITER_API_KEY` is recommended in production. Without it the free
  `lite-api.jup.ag` host is used; the keyed host's keyless tier allows only a few
  calls a minute and each preview needs two.
- `RWA_DEPLOY_PRIORITY_MICROLAMPORTS` sets the compute-unit price (default
  100,000, capped at 5,000,000).
- A dedicated `RWA_RPC_URL` is strongly preferred: each preview makes three
  account reads, a blockhash read and a simulation.
- Before enabling on the public deployment, update the pitch FAQ ("Does the
  product move funds?") in `docs/pitch/deck-content.json` and regenerate the deck
  with `scripts/build-presentation.mjs`.

## Not covered

No withdrawals, rebalancing or position management (users manage positions on
Meteora); USDC-paired pools only; no transfer-hook or transfer-fee tokens; fixed
Spot shape and width. Fee APY is historical, a position earns only while the
price is inside its range, and it can end holding mostly one token. Nothing here
is investment advice, and deploying is the user's own decision in their own
wallet.
