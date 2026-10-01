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

- the selected pool's direct Meteora lookup does not match its exact address,
  inspected mint and USDC pair, is blacklisted, or has less than $100 TVL;
  on-chain checks also reject a pool that is not a DLMM LbPair or is disabled.
  The inspector displays five pools, while eligible pools selected from the
  yield screener use this same direct lookup without that display limit;
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
connecting → form → quoting → review → signing → confirming → confirmed → finalized,
with separate failed and unconfirmed recovery states.
The client checks that the prepared transaction's fee payer and only signer is
the connected account before calling the wallet's
`solana:signAndSendTransaction` (Wallet Standard, v0 required; Mobile Wallet
Adapter works the same way). A review is signable for 45 seconds, after which it
must be rebuilt. An error-free `confirmed` status displays **Confirmed. Waiting
for finality** and polling continues. Only an error-free `finalized` status
displays **Settled**. Processed outcomes and errors that are not yet finalized
remain pending; a finalized on-chain error is a failure.

When no signature is found and the blockhash's last valid height has passed,
the server checks signature history again before returning expiry. This avoids
missing a transaction that landed between the first lookup and the height read.
An absent RPC result is not presented as proof that no funds moved. After expiry,
RPC uncertainty, or the three-minute polling deadline, the dialog retains the
transaction signature and offers **Recheck transaction**. Recheck polls that
same signature; it never rebuilds, signs, or sends another transaction.

Tracking stays in the open dialog. Reloading or leaving the page does not cancel
an on-chain transaction, but it clears this UI state; use the wallet's transaction
history or the transaction's explorer link to recover it. There is no server-side
custody or transaction history database.

## Verification

- Unit: SDK-parity and builder tests (fakes for chain, Jupiter and
  venues, including each balance mismatch, a route reaching another of the
  wallet's token accounts, a retired lookup table and a program marked
  writable), Jupiter-acceptance, failure-explanation and status tests (every
  way a response could smuggle a transfer, approval or cleanup), and route
  tests. Status regressions cover confirmation versus finality, late outcomes
  appearing during the expiry-height read, and an unavailable final lookup.
- Browser (`npm run test:e2e:deploy`, flag on, mocked wallet and APIs): preview,
  sign once, confirm, then finalize; refusals, a mismatched fee payer and a declined signature never
  send; an expired preview must be rebuilt; no-wallet state; 390px layout; axe
  WCAG 2.1 AA on the open dialog; landing copy; expiry and timeout recovery retain
  the original signature and recheck without another preview or wallet request. The main suite asserts the button
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

## Actual settlement activation

The previous mainnet preflight runs and wallet browser tests do not establish a
funded settlement. Before claiming that an owner deposit has settled:

1. Confirm the canonical `RWA_APP_ORIGIN`, mainnet `RWA_RPC_URL`, public pool lookup,
   and Jupiter quote/instruction access. Reports/Supabase sign-in are independent
   of deposits. Turn on `RWA_DEPLOY_ENABLED` only as an intentional operator action.
2. Obtain the owner's public wallet address, the exact USDC-paired pool and token
   mint, a chosen budget between 1 and 25,000 USDC, and a chosen 0.5%, 1%, or 2%
   slippage tolerance. The owner needs that USDC budget in their associated token
   account and enough SOL for the preview's current rent and fee estimate. There
   is no fixed SOL amount that covers every pool/range/account combination.
3. Run a fresh preview for that exact owner. The owner reviews the swap minimum,
   deposit range, position address, and SOL costs, then personally approves the
   single v0 transaction in their wallet. No operator key or server signer is
   required; an arbitrary public wallet used for a preflight is not authority to
   sign or spend its funds.
4. Keep the real transaction signature and verify error-free **finalized** status.
   Check its transaction details and the resulting position: the expected owner,
   selected pool, swap/deposit instructions, and position account must match the
   reviewed request. A public read of the position and the Meteora management link
   provides recovery evidence; it does not require another transaction.

Only the owner's wallet signature can complete this last funded step. Until it
occurs, describe the deployment and preflight evidence separately from completed
settlement. Withdrawals require their own owner-approved transaction on Meteora.

## Not covered

No withdrawals, rebalancing or position management (users manage positions on
Meteora); USDC-paired pools only; no transfer-hook or transfer-fee tokens; fixed
Spot shape and width. Fee APY is historical, a position earns only while the
price is inside its range, and it can end holding mostly one token. Nothing here
is investment advice, and deploying is the user's own decision in their own
wallet.
