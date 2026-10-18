import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, Definitions, LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { OPERATOR } from '@/lib/legal';
import { reportsEnabled } from '@/lib/server/rwa/repository';
import { sessionsConfigured } from '@/lib/server/rwa/session';

/** Rendered per request, so the page states whether saved reports are on for this deployment right now. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy policy — RWA Lens',
  description: 'What RWA Lens reads, what it keeps and how to delete it. Inspecting a token needs no account, and the addresses you inspect are not stored.',
  alternates: { canonical: '/privacy' },
};

const SOURCE = 'https://github.com/operatoruplift/rwa-lens';

const OFF = 'Saved reports are switched off on this deployment.';

const summary = (savedReportsOn: boolean) => [
  'RWA Lens reads public Solana data. Inspecting a token needs no account, and we do not store the addresses you inspect.',
  'There are no analytics, advertising or tracking cookies, and we do not sell personal data.',
  'To limit abuse, we count requests from each network per minute. Our database stores only a keyed hash of its IP address and deletes each count after its minute ends.',
  savedReportsOn
    ? 'Saved reports are optional. If you save any, Delete my data removes all of them and ends your session.'
    : `${OFF} Nothing is stored per wallet, so there is nothing to delete.`,
  'Your watchlist stays on your device.',
];

/** The policy for this deployment: saved reports are either on, with their instructions, or off, with nothing stored per wallet. */
const sections = (savedReportsOn: boolean): LegalSection[] => [
  { id: 'who-we-are', title: 'Who we are', body: <>
    <p>RWA Lens is operated by {OPERATOR}. This policy covers the website at rwalensonsolana.vercel.app, the RWA Lens Android app, which opens the same website, and the API they use. “We” and “us” mean {OPERATOR}.</p>
    <p>RWA Lens is open source, so you can check everything described here in <a href={SOURCE} target="_blank" rel="noreferrer noopener">its source code</a>.</p>
  </> },
  { id: 'inspections', title: 'Addresses you inspect', body: <>
    <p>When you inspect a token, your browser sends its mint address to our server, with any wallet address you add. Our server reads the public Solana accounts for those addresses from our RPC provider and returns what it found. The Liquidity section sends the same mint to our server, which looks up its pools in Meteora’s data API.</p>
    <p>We do not store the addresses you inspect or the results. To answer repeat requests quickly, a server keeps a recent result in memory for up to one minute, then discards it.</p>
    <p>A wallet address you type is read as a public address. We do not treat it as yours or link it to you. Everything an inspection reads is already public on Solana.</p>
    <p>An inspector link can carry a mint in its address, such as <code>/rwa?mint=</code> followed by the mint. Like any page address, it reaches our hosting provider.</p>
  </> },
  { id: 'saved-reports', title: 'Wallet sign-in and saved reports', body: <>
    {savedReportsOn
      ? <p>Saved reports are optional and available only when we enable them. On this deployment they are on. When you use them:</p>
      : <p><strong>{OFF}</strong> Nothing is stored per wallet: no sign-in challenge, no session cookie and no report. When we enable them, this is what they store:</p>}
    <ul>
      <li><strong>Sign-in.</strong> You connect a wallet and sign a message. It is never a transaction and moves no funds. For each attempt we store a single-use challenge for up to 5 minutes: your wallet address, a random value, a hash of a random code kept in a cookie in your browser, this site’s address, the network and the times. It is deleted when it is used.</li>
      <li><strong>Session.</strong> After you sign, your browser keeps a session cookie for up to 7 days. It holds your wallet address and its expiry, signed with a server secret (<code>RWA_SESSION_SECRET</code>). We keep no copy on the server.</li>
      <li><strong>Saved report.</strong> When you save, our server inspects the token again and stores the result with your wallet address as its owner. A report holds the mint, any wallet address you inspected, the network, the full observation (public on-chain data, the RPC provider, slots and times), the decoder version, a content hash and when you saved it. One wallet can keep up to 100 reports, 16 MB in total.</li>
    </ul>
    <p>Only a session for the same wallet can list, export or delete its reports.</p>
  </> },
  { id: 'deploy', title: 'Deploy USDC', body: <>
    <p>Deploy USDC is off unless we enable it. When it is on and you ask for a preview, your browser sends your wallet address, the token, the pool, your USDC amount and your slippage choice to our server. Our server uses them to read your balances, get a swap route from Jupiter, check the pool with Meteora and simulate the transaction on Solana. We do not store any of it.</p>
    <p>Your wallet signs and sends the transaction. Once sent, it is public on Solana permanently. To show its progress, your browser asks our server for its status by transaction signature.</p>
  </> },
  { id: 'rate-limiting', title: 'Rate limiting', body: <>
    <p>To keep RWA Lens available, we count requests from each network per minute, for each kind of request, such as inspections. Our server identifies a network by a shortened SHA-256 hash of the IPv4 address your request comes from, or of the first 64 bits of its IPv6 address, which is the block an internet provider gives one connection. That hash is not salted, so on its own it could be matched back to an address. We treat it as personal data and use it only to count requests. It is never linked to a wallet, a report or anything you inspect.</p>
    <p>We also count, for everyone together, how many inspections we send to our RPC provider and how many requests we send to Meteora’s data API each minute. Those counters hold nothing about any person.</p>
    <p>Our Supabase database does not store that hash. It stores a keyed hash instead: an HMAC-SHA-256 of the kind of request and the shortened hash, made with a random 256-bit key that is kept in the database and that our server cannot read. Without that key, a stored counter cannot be matched back to an IP address. Each counter holds only the keyed hash, the number of requests and the time its one-minute window ends.</p>
    <p>Each time the limiter runs, for a request from anyone, it first deletes every counter whose minute is over. A counter is therefore kept until the limiter next runs after its minute ends.</p>
    <p>If the shared counter cannot be reached, a server counts public reads in its own memory instead, under the shortened hash, and refuses sign-in and saving until the counter is back. Each time that server rate-limits a request, it deletes every counter in its memory whose minute is over.</p>
  </> },
  { id: 'metadata', title: 'Token metadata', body: <>
    <p>A token can point to a metadata document hosted elsewhere. RWA Lens shows that address exactly as the token records it. It requests the document only when you ask, and only from hosts on this deployment’s allowlist (<code>RWA_METADATA_ALLOWED_HOSTS</code>). With an empty allowlist, nothing is fetched.</p>
    <p>The request comes from our server and carries only the document’s address, so the host sees our server rather than you. A fetched document stays in server memory for up to one minute.</p>
    <p>If we connect an issuer registry, our server also sends it the mint you inspect, to look up the issuer’s published details.</p>
  </> },
  { id: 'providers', title: 'Service providers', body: <>
    <p>Apart from Vercel, which hosts RWA Lens, these services are called by our server, not by your browser. They see our server rather than you, and receive only what is listed here.</p>
    <Definitions label="Service providers and what they receive" items={[
      ['Vercel', 'Hosts the website and API. To deliver each request it processes your IP address, the page address and browser details, and it keeps request logs.'],
      ['Supabase', 'Our database: rate-limit counters and, when enabled, sign-in challenges and saved reports.'],
      ['Solana RPC provider', 'Receives the mint and wallet addresses you inspect. For Deploy USDC, it also receives your wallet address for balance reads, the simulation and status checks. Each observation names the provider in its evidence.'],
      ['Meteora data API', 'Receives the mints you inspect, to list their pools, and the pool you choose for Deploy USDC. It also supplies the pools in the yield screener.'],
      ['xStocks public API', 'Supplies the yield screener’s list of xStocks and their market status. It receives nothing about you.'],
      ['Jupiter', 'Only when Deploy USDC is enabled. Receives the token, the USDC amount and your wallet address to build the swap.'],
      ['Issuer metadata hosts', 'Only allowlisted hosts, only when you ask for a document. They receive the document’s address.'],
    ]} />
    <p>Links to other sites, such as Solana Explorer, Solscan, Meteora and issuers’ sites, open those sites under their own policies. Your wallet app is separate from RWA Lens and has its own policy.</p>
    <p>We do not sell personal data or share it for advertising. RWA Lens has no analytics or advertising trackers.</p>
  </> },
  { id: 'device', title: 'On your device', body: <>
    <ul>
      <li><strong>Watchlist.</strong> Kept in this browser’s local storage: up to 20 mint addresses, each with an optional name and symbol and the time you saved it. The list itself is never sent to our server. Remove items on the Watchlist page, or clear this site’s data in your browser.</li>
      <li><strong>Cookies.</strong> {savedReportsOn ? 'RWA Lens sets cookies only when you sign in' : `RWA Lens sets no cookies on this deployment. ${OFF} Cookies exist only when they are on and you sign in`}: a sign-in cookie with a random code for up to 5 minutes, and a session cookie for up to 7 days. Page scripts cannot read either one. There are no other cookies.</li>
      <li><strong>Mobile Wallet Adapter.</strong> On Android, when you connect a wallet through it, it keeps the wallet’s authorization and your account address in this browser’s storage so the wallet stays connected. Disconnect in your wallet, or clear the site’s or app’s data, to remove it.</li>
      <li><strong>Offline files.</strong> A service worker keeps public files, such as icons and app code, and an offline notice. It keeps nothing about you.</li>
      <li><strong>Exports.</strong> JSON and CSV files you export are saved on your device. We do not keep a copy.</li>
    </ul>
  </> },
  { id: 'retention', title: 'How long we keep data', body: <>
    <ul>
      <li><strong>Inspections, pool lookups and metadata documents:</strong> up to one minute in server memory. They are not stored.</li>
      <li><strong>Rate-limit counters:</strong> until the limiter next runs after their one-minute window ends, which deletes them (see Rate limiting).</li>
      {savedReportsOn ? <>
        <li><strong>Sign-in challenges:</strong> until used. One that expires unused is deleted at the next sign-in request.</li>
        <li><strong>Sessions:</strong> up to 7 days, in your browser only.</li>
        <li><strong>Saved reports:</strong> until you delete them. They do not expire. If we switch saved reports off, existing reports stay stored until they are deleted.</li>
      </> : <li><strong>Sign-in challenges, sessions and saved reports:</strong> none. {OFF} Nothing is stored per wallet.</li>}
      <li><strong>Hosting logs:</strong> as set by Vercel.</li>
      <li><strong>Your watchlist and other device storage:</strong> until you remove them.</li>
    </ul>
  </> },
  { id: 'delete', title: 'Delete your data', body: <>
    {savedReportsOn
      ? <p><strong>Saved reports.</strong> Inspect any token, open its Evidence section, choose <strong>My reports</strong> and sign in with the wallet that saved them. Then choose <strong>Delete my data</strong> and confirm. This deletes every report that wallet saved and any sign-in challenge still pending for it, then signs you out. It cannot be undone. Files you exported stay on your device.</p>
      : <p><strong>Saved reports.</strong> {OFF} Nothing is stored per wallet, so there is nothing to delete.</p>}
    <p><strong>Watchlist and device storage.</strong> Remove watchlist items on the Watchlist page, or clear this site’s data in your browser.</p>
    <p>Rate-limit counters and hosting logs are not linked to a wallet, so we cannot find them by wallet address.</p>
    <p>Depending on where you live, you may have the right to access, correct or delete personal data, or to object to how it is used. {savedReportsOn ? 'If you cannot use Delete my data, contact us. We may ask you to show that you control the wallet.' : 'Contact us with any request.'}</p>
  </> },
  { id: 'security', title: 'Security', body: <>
    <p>Connections use HTTPS. Our database key stays on our server, and the database refuses direct public access to reports, challenges and counters. Every report query is limited to the signed-in wallet. Session cookies are signed, sent only to this site and unreadable by page scripts. Sign-in checks this site’s exact address and uses each challenge once. RWA Lens holds no keys that can move your funds.</p>
    <p>No system is perfectly secure. If you find a problem, tell us through the contact below.</p>
  </> },
  { id: 'children', title: 'Children', body: <>
    <p>RWA Lens is for people aged 18 or older. We do not knowingly collect personal data from anyone under 18. If you believe someone under 18 has saved reports, contact us and we will delete them.</p>
  </> },
  { id: 'changes', title: 'Changes to this policy', body: <>
    <p>We will post any change on this page and update the date at the top. If a change affects how we use personal data in a significant way, we will say so here.</p>
  </> },
  { id: 'contact', title: 'Contact', body: <>
    <ContactLine />
    <p>The <Link href="/terms">terms of use</Link> explain the rules for using RWA Lens.</p>
  </> },
];

export default function PrivacyPage() {
  const savedReportsOn = reportsEnabled() && sessionsConfigured();
  return <LegalDocument eyebrow="LEGAL / PRIVACY" title="Privacy policy" description="What RWA Lens reads, what it keeps and how to delete it. Inspecting a token needs no account, and the addresses you inspect are not stored." summary={summary(savedReportsOn)} sections={sections(savedReportsOn)} />;
}
