# RWA Lens — Technical breakdown

Built to make the details add up. A read-only inspection pipeline that connects
raw Solana account data to usable identity, balance, controls and evidence. This
is the take-away copy of
[rwalensonsolana.vercel.app/technical](https://rwalensonsolana.vercel.app/technical).

## 01 · Architecture — an observation, end to end

1. **Validate** — bounded inputs, decoded 32-byte addresses, server-controlled network.
2. **Read** — mint, Clock and optional holder accounts through a bounded Solana RPC adapter.
3. **Interpret** — official token codecs, exact raw totals, display conversion, control checks.
4. **Explain** — typed result, per-call evidence, honest partial states, local receipt export.

The browser calls the application API. Provider credentials and metadata
retrieval stay on the server. The product has no transaction-signing, custody or
asset-transfer path.

## 02 · Capabilities — from raw bytes to useful context

| Capability | What it does |
| --- | --- |
| Mint identity | Official codecs distinguish SPL Token and Token-2022. Mint, program, decimals, supply and authorities remain inspectable. |
| Exact accounting | Validated token accounts are deduplicated and summed with `BigInt`. Raw quantities stay decimal strings across the API. |
| Display conversion | Scaled UI Amount uses the official conversion helper and observed chain time. Rounding stays separate from raw-unit accounting. |
| Token controls | Authority, pause, delegate, default-state, fee and hook evidence is explained alongside known blocks and unknown checks. |
| Source provenance | Each read records its method and available context slot. Separate RPC reads retain their own timing and completeness. |
| Portable receipts | Guest JSON and CSV exports carry the observation, source details and a SHA-256 content hash. No wallet connection is required. |

## 03 · Accounting — precision has a boundary

```text
raw total       = Σ validated account raw units
standard amount = raw total ÷ 10^decimals
scaled display  = official helper(raw total, active multiplier, time)

Raw units      → decimal strings / BigInt
Scaled display → labelled floating-point conversion
```

A display multiplier does not change stored raw units. The active multiplier is
selected against the observed Clock sysvar timestamp. A time fallback is
explicitly identified; it never becomes an unqualified chain observation.

USDY is a legacy SPL mint. Its balances use standard decimal conversion.
Token-2022 extension logic applies only when those extensions are detected on
the inspected mint or account.

## 04 · API contract — one request, traceable results

```http
POST /api/rwa/inspect
Content-Type: application/json

{
  "mode": "live",
  "cluster": "mainnet-beta",
  "mint": "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6"
}
```

Add an optional `owner` address to read public token accounts. The browser cannot
select a provider URL. Results distinguish available, partial and unavailable
data; identity and balance status are independent.

| Field | Purpose |
| --- | --- |
| `identity` | Decoded mint, program, decimals and authorities. |
| `balances` | Validated accounts, raw total, display amounts and completeness. |
| `extensions` / `transferReadiness` | Detected controls with reasons, evidence and unresolved checks. |
| `provenance` | Cluster, provider, method slots, fetched time, chain time and decoder version. |

Response status is the determination: a completed read is `200` with its
observation, a determination about the submitted address is a `4xx` carrying the
classifying `kind`, and only an upstream failure is a `5xx`. `POST
/api/rwa/metadata` answers `200` with the host-policy state for any well-formed
request, including a host the deployment allowlist declines.

## 05 · Reliability and security — fail clearly, keep the evidence

**Bounded reads.** Timeouts, aborts, retry budgets, response-size limits and
account caps prevent unbounded RPC work. A failed refresh retains the prior
observation with its original timestamp, and the message names what resolves it.

**Untrusted metadata.** Explicit HTTPS allowlists, private-address rejection,
DNS-pinned connections and no redirect following constrain metadata fetches. The
allowlist decision is made from the declared URI alone and is reported with the
observation, before any request. No arbitrary HTML is rendered.

**Honest uncertainty.** Different context slots are not an atomic snapshot.
Encrypted amounts, unsupported layouts and unresolved hook behaviour stay
unknown rather than becoming zero.

Automated coverage includes request schemas, accounting boundaries, token
layouts, control classification, provider failures, exports, responsive layouts,
keyboard navigation and reduced motion. Hosted checks exercise real mainnet reads
separately.

## 06 · Implementation scope — a clear contract with the user

| Available | Boundary |
| --- | --- |
| Public inspection and local exports | Read-only, with no wallet connection or asset movement. |
| Interest-bearing extension detection | The rate, pre-update rate and rate authority are reported next to the exact standard decimal amount; accrued display value sits outside this release's conversion scope. |
| Confidential-transfer detection | The capability is reported; an encrypted amount stays unknown and is never counted as zero. |
| Transfer control explanations | Observed controls are explained; recipient eligibility and execution success are established elsewhere. |
| Optional private report architecture | A deployment that supplies its own database, session secret and exact origin serves owner-scoped saved reports; the guest path serves inspection and receipts with no account. |

## Primary references

- [Ondo mint addresses](https://docs.ondo.finance/addresses)
- [Solana token extensions](https://solana.com/docs/tokens/extensions)
- [Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount)
- [Source](https://github.com/operatoruplift/rwa-lens)
