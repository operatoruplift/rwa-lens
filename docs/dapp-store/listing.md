# Solana dApp Store listing: RWA Lens

Copy for the Publisher Portal (https://publish.solanamobile.com). Each fenced block is pasted as is. `tests/rwa/store-kit.test.ts` checks the length limits and the assets below; `node scripts/capture-store-assets.mjs` regenerates the banner and screenshots.

## App name

Limit: 25 characters.

```text
RWA Lens
```

## Subtitle

Limit: 30 characters.

```text
Inspect RWA tokens on Solana
```

## Description

Limit: 10,000 characters.

```text
RWA Lens shows the token behind a tokenized real-world asset on Solana.

Paste a mint address, or start with a listed asset such as Ondo USDY or an xStock, and RWA Lens reads its public on-chain state:

• Identity: the mint, its token program (SPL Token or Token-2022), decimals, supply, and mint and freeze authorities. The issuer's published attribution is shown separately from what the chain says.
• Balances: add any public wallet address to reconcile its exact raw units with the amount you see, including Token-2022 scaled display amounts.
• Controls: Token-2022 extensions such as pause, permanent delegate, default account state, transfer hooks and transfer fees, each explained with its evidence.
• Evidence: every reading records its RPC method, slot and time. Export an observation as JSON or CSV with a SHA-256 content hash.
• Liquidity: Meteora DLMM pools that hold the token, with TVL, volume and fees from Meteora's data.
• Yield screener: pools holding tokenized assets from xStocks and Ondo, filterable by issuer, pair and liquidity.
• Watchlist: keep the mint addresses you follow on your device.

Read-only. Inspecting a token needs no account and no wallet, and nothing in this release asks you to sign anything. RWA Lens never holds keys or funds.

RWA Lens shows observations of public data. It does not certify asset backing, compliance, eligibility or redemption, and it is not investment, legal or tax advice. Tokenized securities are offered only to eligible people under their issuers' terms.

Open source under the MIT license: github.com/operatoruplift/rwa-lens
```

## What's new

```text
First release
```

## Links and contact

| Field | Value |
| --- | --- |
| Website | https://rwalensonsolana.vercel.app |
| Privacy policy | https://rwalensonsolana.vercel.app/privacy |
| Terms of use (license agreement) | https://rwalensonsolana.vercel.app/terms |
| Support email | Set in the Portal. Use the same address as `NEXT_PUBLIC_SUPPORT_EMAIL` so the legal pages show it. |
| Contact email | Set in the Portal. |

## Details

| Field | Value |
| --- | --- |
| Publisher | Operator Uplift |
| Copyright | © 2026 Operator Uplift |
| Languages | English (the APK declares English only) |
| Token distribution | No. RWA Lens does not sell, distribute or airdrop any token. |
| Category (suggested) | Finance |
| Package | `com.operatoruplift.rwalens`, version 1.0.0 (code 1), min SDK 28, target SDK 36 |
| App icon | `public/icons/icon-512.png` (512×512) |
| Release APK | Signed release build from `docs/seeker-and-pwa.md`. Never upload a debug or unsigned APK. |

## Country exclusions

- Exclude every country under comprehensive sanctions. At the time of writing that includes Cuba, Iran and North Korea. Confirm the current list with counsel before you submit, because sanctions programs change.
- The Portal excludes countries, not regions. The terms prohibit use from sanctioned regions such as Crimea and the Donetsk and Luhansk regions of Ukraine.
- Issuer eligibility: xStocks and Ondo USDY are offered only to eligible people under their issuers' terms, which often exclude US persons and residents of other restricted jurisdictions. Inspection and the yield screener only read public data. If Deploy USDC is ever enabled, it can swap USDC into those tokens, so decide then whether to exclude further countries, such as the United States.

## Reviewer notes

```text
No account, wallet or sign-in is needed, and nothing in this release asks a wallet to sign.

1. Open the app. The inspector loads Ondo US Dollar Yield (USDY, mint A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6) from Solana mainnet. Overview shows its identity and issuer attribution. Controls and Evidence show the rest.
2. For an xStock, paste XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp (Apple xStock, AAPLx) into Mint address and tap Inspect. Controls lists its Token-2022 controls, such as pause, permanent delegate and transfer hook. To see a balance reconciled, also enter 3oJpVmbKATLWbKg4G3o1VBfDSMXQJwMv9VqgnS7yXf4R (a public Meteora AAPLx-SOL pool) in Wallet address, tap Inspect and open Balances.
3. Tap Yield in the bottom bar for the screener of Meteora pools that hold tokenized assets. Tap Inspect on any row to open that token.

Saved reports and Deploy USDC are switched off in this release. The privacy policy and terms are linked from every page footer.
```

## Banner

`banner-1200x600.png`: exactly 1200×600, composed from `public/brand-kit/` sources (the lens mark, Inter and the brand palette) and the lens artwork in `public/brand/`, rendered with Playwright at device scale factor 1.

## Screenshots

Six portrait screenshots, each exactly 1080×1920 and under 3 MB, captured from the live site at a 360×640 viewport with device scale factor 3, mobile emulation and service workers blocked. They show live mainnet data at capture time.

| File | Shows |
| --- | --- |
| `screenshots/01-landing.png` | The landing page |
| `screenshots/02-usdy-overview.png` | `/rwa` inspecting Ondo USDY: identity and issuer attribution |
| `screenshots/03-aaplx-controls.png` | Apple xStock (AAPLx): its Token-2022 controls |
| `screenshots/04-aaplx-balance.png` | AAPLx balance reconciliation: raw units, standard amount and scaled display |
| `screenshots/05-yield-screener.png` | `/yield`: pools holding tokenized assets |
| `screenshots/06-pool-detail.png` | A token's Meteora pools with TVL, volume, fees and fee APY |
