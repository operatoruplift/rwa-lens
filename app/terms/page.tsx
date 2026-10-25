import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, ContactLine, LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of use — RWA Lens',
  description: 'The rules for using RWA Lens. It shows observations of public Solana data, not advice or attestations, and it never holds your keys or funds.',
  alternates: { canonical: '/terms' },
};

const SOURCE = 'https://github.com/operatoruplift/rwa-lens';

const summary = [
  'RWA Lens shows observations of public Solana data. They are not attestations, and nothing here is investment, legal or tax advice.',
  'Deploy USDC, when enabled, prepares a transaction that you review and sign in your own wallet. RWA Lens never holds your keys or funds.',
  'Tokenized assets carry issuer controls and issuer terms. You must be 18 or older and eligible under those terms.',
  'RWA Lens is provided as is, and our liability is limited.',
];

const sections: LegalSection[] = [
  { id: 'agreement', title: 'These terms', body: <>
    <p>These terms govern your use of RWA Lens: the website at rwalensonsolana.vercel.app, the RWA Lens Android app, which opens the same website, and their API. RWA Lens is operated by {OPERATOR} (“we”, “us”).</p>
    <p>By using RWA Lens you agree to these terms and to our <Link href="/privacy">privacy policy</Link>. If you do not agree, do not use RWA Lens.</p>
  </> },
  { id: 'service', title: 'What RWA Lens does', body: <>
    <p>RWA Lens reads public Solana data about a token mint and, if you add one, a wallet’s public token balances. It explains the token’s identity, balances and controls, shows the evidence behind each reading and lets you export it as JSON or CSV. The yield screener and the Liquidity section show third-party pool data.</p>
    <p>Two optional features exist only when we enable them: saved reports, which use a wallet message to sign in, and Deploy USDC. Inspecting a token never asks your wallet to sign anything.</p>
  </> },
  { id: 'observations', title: 'Observations, not attestations', body: <>
    <p>An inspection is a point-in-time observation of public data, as an RPC provider returned it at the slots shown. Data can be stale, incomplete or wrong, and reads made at different slots are not one snapshot.</p>
    <p>RWA Lens does not certify asset backing, reserves, legal compliance, eligibility, redemption rights, transferability or investment performance. Issuer attribution comes from the issuer’s own published sources and is kept separate from what the chain shows. A reserve link points to the issuer’s reports; we do not read, audit or verify them. A content hash identifies an exported payload; it does not prove that the payload is true.</p>
    <p>Pool figures, including fee APY, come from Meteora and xStocks as received. Fee APY annualizes recent fees, and past fees do not predict returns.</p>
    <p>RWA Lens is not investment, legal or tax advice, and nothing in it is a recommendation to buy, sell, hold or provide liquidity for any asset. Make your own decisions, and get professional advice where you need it.</p>
  </> },
  { id: 'deploy', title: 'Deploy USDC', body: <>
    <p>Deploy USDC is off unless we enable it. When it is on, RWA Lens prepares and simulates one unsigned transaction. You review it, then sign and send it in your own wallet. RWA Lens never holds your keys or funds. It cannot sign for you, and it cannot cancel or reverse a transaction once you send it.</p>
    <p>The transaction swaps half of your USDC budget into the token through Jupiter, then deposits the tokens and the other half into the Meteora DLMM pool you chose. RWA Lens does not manage the position afterwards; you withdraw or change it on Meteora.</p>
    <p>Providing liquidity carries risks, including impermanent loss, positions going out of range, fees, price impact and slippage:</p>
    <ul>
      <li><strong>Impermanent loss.</strong> As prices move, the position can end up worth less than holding the tokens, and it can end up holding mostly one of them.</li>
      <li><strong>Out of range.</strong> A DLMM position earns fees only while the price is inside its bins. Out of range, it earns nothing.</li>
      <li><strong>Fees.</strong> You pay Solana network fees and account rent, and the pool charges its own fees. The position’s rent comes back only when the position is closed.</li>
      <li><strong>Price impact.</strong> A swap moves the pool’s price against you. RWA Lens refuses a preview with more than 5% price impact, but any impact costs you.</li>
      <li><strong>Slippage.</strong> Prices can move between the preview and execution. Your slippage setting caps how far the swap can move against you; past it, the transaction fails. A preview expires after 45 seconds.</li>
      <li><strong>Third parties.</strong> Jupiter, Meteora, token programs and the Solana network can fail, change or be exploited. A successful simulation does not guarantee the result.</li>
    </ul>
    <p>Deploying is your own decision, made in your own wallet.</p>
  </> },
  { id: 'saved-reports', title: 'Saved reports', body: <>
    <p>Saved reports are off unless we enable them. When they are on, you sign in by signing a message with your wallet. It is never a transaction and moves no funds. Keep your wallet secure: anyone who controls it can sign in as you, and see or delete its reports.</p>
    <p>You can delete all of your saved reports at any time with Delete my data. The <Link href="/privacy#saved-reports">privacy policy</Link> lists what a report stores.</p>
  </> },
  { id: 'issuer-controls', title: 'Issuer controls', body: <>
    <p>Tokenized real-world assets are issued and controlled by third parties. Depending on the token, an issuer or another authority may be able to mint or burn tokens, freeze accounts, pause transfers, move tokens through a permanent delegate, require transfer hooks, charge transfer fees or change a displayed multiplier.</p>
    <p>RWA Lens shows the controls it can decode. It cannot tell you whether, when or how they will be used. Redemption, and any right in the underlying asset, depends on the issuer’s terms, not on RWA Lens or the token alone.</p>
  </> },
  { id: 'eligibility', title: 'Eligibility', body: <>
    <p>You must be at least 18 years old, and able to enter a binding agreement, to use RWA Lens.</p>
    <p>You may not use RWA Lens if you are located or ordinarily resident in a country or region under comprehensive sanctions, if you are named on a sanctions list, or if your use would break a law that applies to you.</p>
    <p>Tokenized securities and notes, such as xStocks and Ondo USDY, are offered only to eligible people in eligible places, under their issuers’ terms. Those terms often exclude US persons and residents of other restricted jurisdictions. RWA Lens does not check your eligibility. Read and follow each issuer’s terms before you acquire, hold, trade or provide liquidity for its tokens.</p>
  </> },
  { id: 'acceptable-use', title: 'Acceptable use', body: <>
    <p>Do not use RWA Lens to break the law, to harm others, or to disrupt or overload the service. Do not try to get around its rate limits or security, or to reach data that is not yours. We may limit or block access that breaks these terms.</p>
  </> },
  { id: 'third-parties', title: 'Third-party services', body: <>
    <p>RWA Lens relies on and links to services we do not control, including Solana RPC providers, Meteora, Jupiter, xStocks, issuers’ sites, Solana Explorer, Solscan and your wallet. Their own terms apply, and we are not responsible for them.</p>
  </> },
  { id: 'open-source', title: 'Open source', body: <>
    <p>The source code of RWA Lens is available under the MIT license at <a href={SOURCE} target="_blank" rel="noreferrer noopener">github.com/operatoruplift/rwa-lens</a>. The license governs your use of the code. These terms govern your use of the service we run.</p>
  </> },
  { id: 'changes', title: 'Changes and availability', body: <>
    <p>We may change, suspend or stop RWA Lens or any feature, including saved reports and Deploy USDC, at any time. We may update these terms. We will post the new version here and update the date at the top. If you keep using RWA Lens after an update, the updated terms apply.</p>
  </> },
  { id: 'no-warranty', title: 'No warranty', body: <>
    <p>RWA Lens is provided “as is” and “as available”. To the fullest extent the law allows, we make no warranties of any kind, express or implied, including about accuracy, completeness, availability, merchantability, fitness for a particular purpose or non-infringement.</p>
  </> },
  { id: 'liability', title: 'Limitation of liability', body: <>
    <p>To the fullest extent the law allows, {OPERATOR} is not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, revenue, data, tokens or other digital assets, arising from your use of RWA Lens, a transaction you sign or a third-party service, even if we were told such loss was possible.</p>
    <p>Our total liability for any claim about RWA Lens is limited to 100 US dollars. Some places do not allow these limits. Where that is the case, they apply as far as the law allows.</p>
  </> },
  { id: 'dapp-store', title: 'Solana dApp Store', body: <>
    <Clause>
      <p>If you obtained RWA Lens through the Solana dApp Store, these terms are between you and {OPERATOR} only. Solana Mobile and its parents, subsidiaries, affiliates, officers, employees, agents, partners, suppliers and licensors (the Solana Mobile Parties) are not a party to these terms and have no responsibility or liability to you in connection with RWA Lens, its content, its support or maintenance, or any Solana Mobile program. The No warranty and Limitation of liability sections of these terms protect the Solana Mobile Parties to the same extent as they protect {OPERATOR}. {OPERATOR} alone is responsible for RWA Lens and for answering any claim about it.</p>
    </Clause>
    <p>The dApp Store’s own terms also apply to your use of the store.</p>
  </> },
  { id: 'law', title: 'Governing law', body: <>
    <p>These terms are governed by the laws of the jurisdiction where {OPERATOR} is established, without regard to its conflict-of-law rules. Nothing in these terms removes a protection that the law of your country of residence gives you and that cannot be waived by agreement.</p>
  </> },
  { id: 'contact', title: 'Contact', body: <>
    <ContactLine />
  </> },
];

export default function TermsPage() {
  return <LegalDocument eyebrow="LEGAL / TERMS" title="Terms of use" description="The rules for using RWA Lens. It shows observations of public Solana data, not advice or attestations, and it never holds your keys or funds." summary={summary} sections={sections} />;
}
