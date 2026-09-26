# RWA Lens — Presenter walkthrough

A take-away script for the guided demo at
[rwalensonsolana.vercel.app/demo](https://rwalensonsolana.vercel.app/demo).
It follows the four chapters on that page — Identity, Balance, Controls,
Evidence — and ends with the exported receipt. Budget seven to nine minutes,
plus three for questions.

**Read the token. Understand the asset.**

## Before you present

1. Open `/demo` and let the inspector finish its first read. It loads the
   Ondo USDY mint `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` on Solana
   mainnet and shows a live observation with its provider and context slot.
2. Have one public wallet address ready to paste for the balance chapter. Any
   address the audience names works; an address you read is public data.
3. Say once, at the start, what the product guarantees: it reads public chain
   state. It never signs a transaction, submits an order, moves an asset or
   takes custody, and it asks for no wallet connection.
4. Keep a second tab on the issuer source
   ([docs.ondo.finance/addresses](https://docs.ondo.finance/addresses)) so
   attribution and decoding stay visibly separate.

Optional rehearsal: `node scripts/verify-live.mjs` performs one explicit public
mainnet read and writes its receipt, so you know the provider path is warm.

## 01 · Identity — start at the source

**Show:** the Token identity card. Mint address, token program badge, decimals,
raw supply, mint authority and freeze authority.

**Say:** "The issuer's documentation says this address is USDY. The RPC read
says this account is a mint owned by the legacy SPL Token program with six
decimals. Those are two different statements from two different sources, and
the page keeps them apart."

**Look for:** the program badge reads *SPL Token · legacy program*. That is the
observed program, so no Token-2022 extension logic applies to this mint. Open
*Program & metadata* to show the owning program address and the declared
metadata URI: a URI is issuer-supplied content, and the page states whether the
deployment's host allowlist permits fetching it before anything is requested.

## 02 · Balance — make every unit count

**Show:** paste the public wallet address into *Wallet address (optional)* and
press Inspect. Then open *Public token accounts*.

**Say:** "Raw base units are exact integers. The displayed amount is a
conversion. This page shows both, plus the account list the total came from."

**Look for:**

- *Raw base units* carries an EXACT marker. A display multiplier never changes it.
- *Standard decimal* is raw units ÷ 10^decimals.
- The account table lists each validated token account, its raw amount, its
  state and any extensions found on it.
- An empty validated account list means zero observed holdings for that owner.
  A read that did not complete says so instead, and no zero is invented.

## 03 · Controls — read the rules

**Show:** the Extension inventory and Transfer readiness cards.

**Say:** "Authorities and extensions are the controls that decide what can
happen to a holding. Readiness explains observed state; it is not permission and
not legal advice."

**Look for:** for USDY the inventory states that no Token-2022 extensions were
found on this mint, which is the honest result for a legacy SPL mint — a good
moment to explain that the inventory reports what the account actually carries.
In Transfer readiness, point at the separation between a known block, such as a
configured freeze authority, and an unresolved check. Each reason carries its
own evidence line.

If the audience wants to see extension handling, inspect any Token-2022 mint
they name. Scaled UI Amount, Interest Bearing, Transfer Hook, Default Account
State and Permanent Delegate each get a plain-language impact line, their
authorities and their decoded fields.

## 04 · Evidence — take it with you

**Show:** open *Every observation has a source*, then Export JSON and Export CSV.

**Say:** "Every number you just saw has a method, a context slot and a time
behind it. The export is that record, as a file you keep."

**Look for:**

- The evidence table lists each read: method, status, context slot and detail.
- Commitment, fetched-at time, observed Clock timestamp, time source and decoder
  version are all stated.
- Separate reads keep their own context slots. The page says plainly that this
  is not an atomic snapshot.
- The JSON receipt contains the inspection request, the export time, the full
  observation and a SHA-256 content hash of the observation payload. The hash
  identifies the payload; it is not an issuer endorsement.
- The CSV carries the same values as flat rows for a reconciliation workflow.

Also open *Issuer registry attribution*. It names the issuer, the asset class,
the exact retrieval timestamp and the freshness of that record, and links to the
issuer source. The same retrieval timestamp appears in the JSON receipt, so a
reviewer can check the page against the file.

## Questions you should expect

**Does this prove the token is backed by a real asset?** No, and the page says
so wherever attribution appears. It proves what the mint account contains and
who can act on it. Backing, eligibility and redemption rights come from the
issuer and from diligence outside this tool.

**Can it move my tokens?** No. Inspection is a read. The product signs nothing,
submits nothing and holds nothing. Inspection and export need no wallet.

**Where does the data come from?** One configured Solana RPC provider, named in
the evidence drawer with the context slot of every read. The browser cannot
choose the provider.

**What if a read fails?** The failure stays visible, the previous observation
keeps its original timestamp, and the message names what resolves it — a
different address, a pause, or the provider. No value is replaced with a zero.

**Is the displayed amount exact?** The standard decimal conversion is exact. A
Scaled UI Amount display uses the official Token-2022 helper and is labelled as
a rounded display conversion, next to the exact raw units.

## Where to go next

- `/technical` — architecture, accounting boundaries, the API contract and the
  reliability and security model.
- `/pitch` — the presentation kit.
- `/rwa` — the compact inspector, for a direct second look.
