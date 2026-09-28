import { beforeEach, describe, expect, it } from 'vitest';
import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';
import { buildDeploy } from '@/lib/server/rwa/deploy/build';
import { createDeployChain } from '@/lib/server/rwa/deploy/chain';
import { createJupiter } from '@/lib/server/rwa/deploy/jupiter';
import { readVenues } from '@/lib/server/rwa/venues';

/**
 * Live mainnet check, skipped unless RWA_LIVE_DEPLOY_OWNER names a funded
 * wallet (any address with USDC and SOL; nothing is signed or sent). Needs
 * RWA_CLUSTER=mainnet-beta and RWA_RPC_URL. Example:
 *   RWA_LIVE_DEPLOY_OWNER=<address> RWA_CLUSTER=mainnet-beta RWA_RPC_URL=<url> npx vitest run tests/live
 */
const owner = process.env.RWA_LIVE_DEPLOY_OWNER ?? '';
const POOLS = [
  { mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6', pool: '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', label: 'USDY-USDC (SPL Token)' },
  { mint: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', pool: 'D8pGWVN3vWeyexBtMZjyyPbcLhM1oeTEMibE9h3nNRYL', label: 'METAx-USDC bin 10 (Token-2022)' },
  { mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', pool: 'BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2', label: 'TSLAx-USDC bin 50 (Token-2022)' },
  { mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', pool: 'eV4ogmq1yriacUmvXnFr2shVnXDrVidDvVcU24irEEo', label: 'QQQx-USDC bin 20 (Token-2022)' },
];

describe.skipIf(!owner)('deploy against mainnet (simulation only)', () => {
  // Built per test: a skipped suite is still collected, and the chain needs RPC configuration.
  const deps = () => ({ chain: createDeployChain(), jupiter: createJupiter(), venues: readVenues, now: Date.now, priorityMicroLamports: 100_000n });
  // Jupiter's keyless tier allows a few requests per second; each build makes two.
  beforeEach(() => new Promise<void>(resolve => setTimeout(resolve, 4000)));
  for (const target of POOLS) {
    it(`builds and simulates ${target.label}`, async () => {
      const result = await buildDeploy({ mint: target.mint, pool: target.pool, owner, amount: '10', slippageBps: 100 }, deps());
      console.log(target.label, JSON.stringify(result.state === 'ready' ? { ...result, transaction: `${result.transaction.length} base64 chars` } : result, null, 1));
      expect(result.state).toBe('ready');
      if (result.state !== 'ready') return;
      const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(result.transaction));
      expect(Object.keys(transaction.signatures)).toEqual([owner]);
      const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
      expect(message.staticAccounts[0]).toBe(owner);
      expect(result.simulation.unitsConsumed).toBeGreaterThan(0);
    }, 60_000);
  }
});
