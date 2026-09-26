# RWA Lens — Presenter notes

Mainnet / September 2026

Audience: Solana ecosystem reviewers, wallet teams, issuers and treasury operators. Suggested duration: 7–9 minutes, plus 3–4 minutes for the live walkthrough.

## Presenting the deck

Open rwa-lens-pitch.html locally or from /presentation/rwa-lens-pitch.html. Use arrow keys, Page Up / Page Down, wheel, vertical swipe or the visible controls. Horizontal swipe also advances. N opens the current speaker note; Escape closes it. Home and End jump to the first and last slide. The HTML includes its font and artwork and works offline; outbound product and source links require connectivity. The PDF is a shareable fixed-layout copy. The PPTX keeps typography, geometry and diagrams editable; its optical artwork remains a raster image. Install the included Inter font for consistent PowerPoint typography.

## Five-minute live walkthrough

1. Open https://rwalensonsolana.vercel.app/demo. Introduce the read-only public inspection workflow.
2. Run the USDY mint inspection. Check the full address against the issuer registry and identify its legacy SPL Token program.
3. Review mint decimals, raw supply and authorities. Separate issuer attribution from independent asset assurance.
4. Open evidence: show observation time, network, commitment and per-read context slots.
5. Optionally enter a public owner address supplied by the audience. Explain returned public accounts and preserve partial or unavailable states.
6. Download JSON and CSV. Open the files and show the connection between the UI and the saved record.
7. Open /technical to discuss exact raw accounting, display conversion and Token-2022 extension handling.

If an upstream read fails, keep the error visible and explain the bounded request behavior. Retry when appropriate; do not present another source of data as a successful live read. Never imply that the USDY mint contains Token-2022 extensions.

## 01 — Real assets. Clearer vision.

Open with the product, not a market statistic. RWA Lens gives teams a clear view of the public Solana token data behind an asset: its identity, units, display conversion and observable controls. The live product is a read-only inspector on Solana mainnet. This is an invitation to use it and shape the next integrations.

## 02 — A balance is only the beginning.

A displayed balance is useful, but incomplete. Teams still need to understand the mint, the calculation behind the number and which controls can affect the token. Reading these separately creates reconciliation work and leaves room for incorrect assumptions. RWA Lens organizes those questions into one inspection.

## 03 — Built for the people behind the product.

The initial audience is wallet builders, token issuers, custodians and treasury operators. Wallet teams need clearer balance explanations. Issuers need their controls to be legible to integrators. Treasury teams need exportable evidence for investigation and reconciliation. These are target users and design-partner hypotheses, not a claim of customers or adoption.

## 04 — From address to understanding.

Enter a mint and optionally a public owner address. The server validates inputs and reads the configured Solana network. The result separates identity, balances, extensions, readiness and source evidence. Export JSON for the complete structured record or CSV for tabular review. Guest inspection and local exports require no wallet. RWA Lens does not sign or submit transactions.

## 05 — Follow USDY on mainnet.

Open https://rwalensonsolana.vercel.app/demo and run the USDY inspection. The official mint is A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6. Confirm the full mint address and legacy SPL Token program. Review identity, authorities, evidence and export. Explain that USDY’s legacy SPL program is separate from the product’s Token-2022 support. Issuer descriptions provide attribution; they do not independently establish backing, legal rights, eligibility or investment performance. Keep the live result visible if the provider reports an unavailable or partial observation.

## 06 — Exact underneath. Clear on the surface.

Raw amounts and supply remain integer strings or BigInt. Accounts are validated for program, mint and owner, then deduplicated before summing. Standard decimal formatting is exact. For supported Token-2022 Scaled UI Amount configuration, the official helper produces a separate floating-point display value. The observed Clock timestamp selects the active multiplier. Display output is never used as raw accounting. Interest-bearing conversion is detected but not calculated. Confidential holdings remain unobservable.

## 07 — See the controls. Keep the unknowns.

The extension inventory explains observable configuration instead of collapsing it into one reassuring badge. Known transfer blocks and unknown checks can coexist. A configured transfer hook still needs evaluation in its execution context. An address does not establish KYC status. A default account state governs new accounts and does not replace inspection of existing accounts. The result is a public-state explanation, not a guarantee of transfer success or legal authorization.

## 08 — Every conclusion has a path back.

The Next.js interface calls a validated server route. Bounded Solana RPC reads retrieve mint data, Clock and optional owner accounts. Official Solana codecs drive token and extension decoding. The result preserves source information, observation time, per-read context slots and incomplete states. Requests have timeout, retry and size bounds. Metadata retrieval is explicit and allowlisted, with private-address rejection and pinned connections. Secrets stay on the server. The separate reads do not form an atomic snapshot.

## 09 — More context. Less guesswork.

The differentiation is the combination: amount reconciliation, controls explained in context and a portable observation. This is complementary to block explorers, issuer documentation and wallet interfaces. We are not claiming that other products cannot provide these features. The product’s focus is making the investigation easier to complete and easier to discuss across teams.

## 10 — Start with clarity. Build into workflows.

This slide describes a proposed business model, not shipped commercial features or booked revenue. The accessible inspector is the entry point. The working hypothesis is that teams pay for repeatable operational workflows and integration value, such as retained evidence, monitoring and embedded explanations. Pricing, packaging and demand need validation with partners. Cloud report storage is not part of the current public launch. No revenue or adoption figure is asserted.

## 11 — A useful product now. A deliberate next step.

The current product supports public mainnet token inspection and local evidence exports. Engineering verification covers accounting, decoders, request validation, failure states, keyboard and responsive UI paths. The next step is partner workflow validation. Monitoring, shared retained history and productized external integrations are roadmap items. These are priorities, not dated delivery commitments. Production RPC availability remains an operational dependency.

## 12 — Bring one workflow. Let’s make it clearer.

The ask is for design partners, not a fundraising amount. Bring one real operational task and a person who performs it. Together, define the evidence required, evaluate the product and agree what a useful pilot should achieve. Success criteria might include clearer explanations, fewer unresolved handoffs or a more usable evidence export; measure these during the pilot rather than promising a result in advance.

## 13 — Look closer.

Close by opening the live product or guided demo. RWA Lens makes observable public token state easier to inspect, explain and carry into a team's next decision. Invite questions about the accounting model, the evidence boundary or the partner workflow. Live product: https://rwalensonsolana.vercel.app. Demo: /demo. Technical breakdown: /technical. Source: https://github.com/operatoruplift/rwa-lens.

## Questions and answers

### Does the product move funds?

No. Public inspection and local export are read-only. No asset transaction is signed or submitted.

### Does USDY use Token-2022?

The attributed USDY mint uses legacy SPL Token. The inspector also supports Token-2022 mints and decodes their observed extensions separately.

### Does the result prove backing or compliance?

No. Issuer attribution, chain observations and legal or economic assurances are different things. The product reports observable token data.

### How are balances kept exact?

Raw quantities remain integer strings or BigInt. Standard decimals are formatted exactly. Supported extension display conversion is isolated and never becomes an accounting input.

### Can every holder balance be determined?

No. Public owner account reads can be partial, capped or unavailable, and confidential amounts are not observable. These states remain visible.

### Can the result certify transfer success?

No. Recipient state, hook execution and other unresolved checks can affect execution. Known blocks and unknown checks remain separate.

### Are all reads from one atomic snapshot?

No. Mint, Clock and owner calls expose their separate slots. A context spread is preserved, and a timestamp fallback is identified as an estimate.

### What is live and what is planned?

Public mainnet inspection and JSON/CSV exports are available. Commercial packaging, monitoring, shared retained history and productized integrations are plans to validate. Cloud reports remain outside the current public launch.

### What happens when an upstream provider fails?

The UI reports the unavailable read. The server bounds retries, deadlines and response sizes; it does not quietly change networks or replace the result.

### What is the immediate ask?

A wallet, issuer or treasury team willing to evaluate one real workflow and help define a useful integration pilot. No fundraising terms are proposed here.

## Source map

The content is grounded in README.md, lib/rwa/balance.ts, lib/rwa/extensions.ts, lib/rwa/readiness.ts, lib/server/rwa/inspect.ts, lib/server/rwa/rpc.ts, lib/rwa/live-assets.json and checked-in verification receipts. Current verification counts belong to the release receipt rather than evergreen pitch slides.

- [Live product](https://rwalensonsolana.vercel.app)
- [Guided demo](https://rwalensonsolana.vercel.app/demo)
- [Technical breakdown](https://rwalensonsolana.vercel.app/technical)
- [Source repository](https://github.com/operatoruplift/rwa-lens)
- [USDY mint address registry](https://docs.ondo.finance/addresses)
- [Issuer USDY description](https://docs.ondo.finance/general-access-products/usdy/basics)
- [Solana Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount)

Official USDY and Solana sources reviewed on 23 September 2026. The commercial model and future team capabilities are proposals to validate. The deck makes no customer, revenue, adoption, backing or return claim.
