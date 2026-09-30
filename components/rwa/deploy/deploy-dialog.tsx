'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleCheck, Layers, LoaderCircle, X } from 'lucide-react';
import {
  formatPrice, formatSol, formatUnits, MAX_DEPLOY_USDC, MIN_DEPLOY_USDC, parseUsdc, QUOTE_TTL_MS, SLIPPAGE_CHOICES_BPS, USDC_DECIMALS, WARN_PRICE_GAP_PCT,
  withinDeployLimits, type SlippageBps,
} from '@/lib/rwa/deploy';
import type { VenuePool } from '@/lib/rwa/venues';
import { Callout } from '../primitives';
import { useYieldDeployer, type DeployPhase, type ReadyDeploy } from './use-yield-deployer';

const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;
const solscan = (kind: 'tx' | 'account', value: string) => `https://solscan.io/${kind}/${value}`;
const pct = (value: number) => `${value < 0.01 ? '<0.01' : value.toFixed(2)}%`;

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="deploy-waiting" role="status"><LoaderCircle size={16} className="spinner" aria-hidden="true" />{children}</p>;
}

function useSecondsLeft(receivedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (receivedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [receivedAt]);
  return receivedAt === null ? 0 : Math.max(0, Math.ceil((receivedAt + QUOTE_TTL_MS - now) / 1000));
}

function Review({ ready }: { ready: ReadyDeploy }) {
  const { summary: s, simulation } = ready;
  const token = s.tokenSymbol;
  const bins = s.deposit.upperBinId - s.deposit.lowerBinId + 1;
  const rows: Array<[string, string, string]> = [
    ['Swap', `${formatUnits(s.swap.inRaw, USDC_DECIMALS)} USDC → at least ${formatUnits(s.swap.minOutRaw, s.tokenDecimals)} ${token}`, `Quoted ${formatUnits(s.swap.quotedOutRaw, s.tokenDecimals)} via ${s.swap.venues.join(', ')} · price impact ${pct(s.swap.priceImpactPct)}`],
    ['Deposit', `${formatUnits(s.deposit.tokenRaw, s.tokenDecimals)} ${token} + ${formatUnits(s.deposit.usdcRaw, USDC_DECIMALS)} USDC`, `Spread evenly over ${bins} bins centred on the pool price${s.position.isNew ? ', in a new position' : ', added to your existing position at this range'}`],
    ['Range', `${formatPrice(s.deposit.minPrice)} – ${formatPrice(s.deposit.maxPrice)} USDC per ${token}`, `Pool price ${formatPrice(s.deposit.poolPrice)} · swap price ${formatPrice(s.swap.price)} · ${pct(s.priceGapPct)} apart`],
    ['SOL', `${formatSol(s.sol.positionRentLamports)} SOL position rent`, `Returned when you close the position · plus ${formatSol(s.sol.otherRentLamports)} SOL for new token accounts${s.newBinArrays ? ' and pool bin arrays' : ''} and about ${formatSol(s.sol.networkFeeLamports)} SOL in network fees`],
    ['Check', 'Mainnet preflight check passed', `Slot ${Number(simulation.slot).toLocaleString('en-US')} · ${simulation.unitsConsumed.toLocaleString('en-US')} compute units`],
  ];
  return (
    <>
      <dl className="deploy-review">
        {rows.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd><strong>{value}</strong><span>{detail}</span></dd></div>)}
      </dl>
      {s.priceGapPct > WARN_PRICE_GAP_PCT ? <Callout tone="amber">The pool’s price is {pct(s.priceGapPct)} away from the swap price. When a pool lags the market, arbitrage can take part of the difference from new liquidity.</Callout> : null}
    </>
  );
}

function Outcome({ phase, pool, onBack, onChangeWallet }: { phase: Extract<DeployPhase, { kind: 'confirmed' | 'failed' }>; pool: VenuePool; onBack: () => void; onChangeWallet: () => void }) {
  if (phase.kind === 'confirmed') {
    const { summary } = phase.ready;
    return (
      <div className="deploy-outcome" role="status">
        <p className="deploy-success"><CircleCheck size={18} aria-hidden="true" />Deployed. Your position holds {summary.tokenSymbol} and USDC in {summary.pair}.</p>
        <div className="deploy-links">
          <a href={solscan('tx', phase.signature)} target="_blank" rel="noreferrer noopener">View transaction <ArrowUpRight size={13} /></a>
          <a href={solscan('account', summary.position.address)} target="_blank" rel="noreferrer noopener">Position {short(summary.position.address)} <ArrowUpRight size={13} /></a>
          <a href={pool.meteoraUrl} target="_blank" rel="noreferrer noopener">Manage or withdraw on Meteora <ArrowUpRight size={13} /></a>
        </div>
      </div>
    );
  }
  return (
    <div className="deploy-outcome">
      <div role="alert"><Callout tone="amber">{phase.message}</Callout></div>
      <div className="deploy-links">
        {phase.signature ? <a href={solscan('tx', phase.signature)} target="_blank" rel="noreferrer noopener">View transaction <ArrowUpRight size={13} /></a> : null}
        <button type="button" className="text-link" onClick={phase.back === 'wallet' ? onChangeWallet : onBack}>{phase.back === 'wallet' ? 'Choose a wallet' : 'Back to amount'}</button>
      </div>
    </div>
  );
}

/**
 * Deploy USDC into one listed Meteora pool. The server builds and simulates
 * one transaction; the user's wallet is its only signer and sends it.
 */
export default function DeployDialog({ mint, pool, onClose }: { mint: string; pool: VenuePool; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const deployer = useYieldDeployer({ mint, pool: pool.address });
  const { phase, refreshWallets } = deployer;
  const [amount, setAmount] = useState('10');
  const [slippage, setSlippage] = useState<SlippageBps>(50);
  useEffect(() => { dialog.current?.showModal(); refreshWallets(); }, [refreshWallets]);
  const secondsLeft = useSecondsLeft(phase.kind === 'review' ? phase.receivedAt : null);
  const locked = phase.kind === 'signing' || phase.kind === 'confirming';
  const raw = parseUsdc(amount);
  const amountValid = raw !== null && withinDeployLimits(raw);
  const walletName = deployer.connected?.wallet.name ?? 'your wallet';

  return (
    <dialog ref={dialog} className="wallet-dialog deploy-dialog" aria-labelledby="deploy-title" onClose={onClose} onCancel={event => { if (locked) event.preventDefault(); }}>
      <div className="dialog-top"><Layers size={23} /><button type="button" aria-label="Close deploy" onClick={() => dialog.current?.close()} disabled={locked}><X size={19} /></button></div>
      <h2 id="deploy-title">Deploy USDC into {pool.pair}</h2>
      <p>Half of your USDC is swapped into {pool.tokenSymbol} through Jupiter, then both are deposited into this Meteora pool around its current price, all in one transaction. RWA Lens builds it and runs a mainnet preflight check; your wallet signs and sends it. RWA Lens never holds keys or funds.</p>

      {deployer.connected && phase.kind !== 'wallet' && phase.kind !== 'connecting' ? (
        <p className="deploy-wallet">Wallet <strong>{deployer.connected.wallet.name} · {short(deployer.connected.account.address)}</strong>{locked ? null : <button type="button" className="text-link" onClick={deployer.changeWallet}>Change</button>}</p>
      ) : null}

      {phase.kind === 'wallet' ? (
        deployer.wallets.length ? (
          <div className="wallet-choices">{deployer.wallets.map((wallet, index) => <button type="button" key={`${wallet.name}-${index}`} onClick={() => void deployer.connect(wallet)}>Connect {wallet.name}</button>)}</div>
        ) : <Callout tone="slate">No wallet that can send Solana transactions is available. Enable one such as Phantom, Solflare or Backpack, or use Mobile Wallet Adapter on Android, then refresh.</Callout>
      ) : null}
      {phase.kind === 'wallet' ? <button type="button" className="text-link" onClick={refreshWallets}>Refresh wallet list</button> : null}
      {phase.kind === 'connecting' ? <Waiting>Connecting {phase.walletName}…</Waiting> : null}

      {phase.kind === 'form' ? (
        <form className="deploy-form" onSubmit={event => { event.preventDefault(); if (amountValid) void deployer.preview(amount.trim(), slippage); }}>
          <label htmlFor="deploy-amount">USDC to deploy</label>
          <input id="deploy-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={amount !== '' && !amountValid} aria-describedby="deploy-amount-help" />
          <p id="deploy-amount-help">Between {MIN_DEPLOY_USDC} and {MAX_DEPLOY_USDC.toLocaleString('en-US')} USDC. Half is swapped into {pool.tokenSymbol}; the rest is deposited as USDC.</p>
          <fieldset>
            <legend>Slippage tolerance</legend>
            <div className="deploy-slippage">{SLIPPAGE_CHOICES_BPS.map(bps => <label key={bps}><input type="radio" name="deploy-slippage" value={bps} checked={slippage === bps} onChange={() => setSlippage(bps)} />{bps / 100}%</label>)}</div>
          </fieldset>
          <button type="submit" className="primary-button" disabled={!amountValid}>Preview deploy</button>
        </form>
      ) : null}
      {phase.kind === 'quoting' ? <Waiting>Quoting the swap and running the full transaction through mainnet preflight…</Waiting> : null}

      {phase.kind === 'review' ? (
        <>
          <Review ready={phase.ready} />
          <p className="deploy-risk">A DLMM position earns fees only while the price is inside its range, and can end up holding mostly one of the two tokens. Past fees do not predict returns. You can withdraw at any time on Meteora.</p>
          <div className="deploy-actions">
            {secondsLeft > 0
              ? <button type="button" className="primary-button" onClick={() => void deployer.sign()}>Sign in {walletName}</button>
              : <button type="button" className="primary-button" onClick={() => void deployer.preview(amount.trim(), slippage)}>Refresh preview</button>}
            <button type="button" className="text-link" onClick={deployer.back}>Edit amount</button>
            <span aria-live="polite">{secondsLeft > 0 ? `Preview valid for ${secondsLeft}s` : 'Preview expired'}</span>
          </div>
        </>
      ) : null}
      {phase.kind === 'signing' ? <Waiting>Approve the transaction in {walletName}.</Waiting> : null}
      {phase.kind === 'confirming' ? (
        <>
          <Waiting>Submitted. Waiting for confirmation…</Waiting>
          <div className="deploy-links"><a href={solscan('tx', phase.signature)} target="_blank" rel="noreferrer noopener">View transaction <ArrowUpRight size={13} /></a></div>
        </>
      ) : null}
      {phase.kind === 'confirmed' || phase.kind === 'failed' ? <Outcome phase={phase} pool={pool} onBack={deployer.back} onChangeWallet={deployer.changeWallet} /> : null}
    </dialog>
  );
}
