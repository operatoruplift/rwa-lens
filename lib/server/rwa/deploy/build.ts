import 'server-only';
import {
  AccountRole, address, appendTransactionMessageInstructions, compileTransaction, compressTransactionMessageUsingAddressLookupTables, createTransactionMessage,
  getAddressDecoder, getBase64EncodedWireTransaction, getTransactionSize, getU32Encoder, getU64Encoder, pipe, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash, type Address, type Blockhash, type Instruction,
} from '@solana/kit';
import { findAssociatedTokenPda, getMintDecoder } from '@solana-program/token-2022';
import {
  DEPLOY_HALF_WIDTH, MAX_PRICE_GAP_PCT, MAX_PRICE_IMPACT_PCT, USDC_DECIMALS, USDC_MINT, parseUsdc, withinDeployLimits,
  type DeployRequest, type DeployResponse, type DeploySummary,
} from '@/lib/rwa/deploy';
import { NONE_ADDRESS, findExtension } from '@/lib/rwa/extensions';
import type { VenuePool, VenuesResponse } from '@/lib/rwa/venues';
import { RpcError } from '../rpc';
import type { DeployChain } from './chain';
import {
  BIN_ARRAY_SIZE, DLMM_PROGRAM, POSITION_SIZE, RENT_SYSVAR, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, addLiquidityByStrategy2Instruction, binArrayAddress, binArrayIndex,
  binPrice, bitmapExtensionAddress, decodeLbPair, decodePositionOwner, eventAuthorityAddress, initializeBinArrayInstruction, initializePositionPdaInstruction,
  isBinArray, needsBitmapExtension, positionAddress, type LbPair,
} from './dlmm';
import { JupiterError, type Jupiter, type JupiterQuote } from './jupiter';
import { explainSimulationFailure } from './failures';

export const COMPUTE_BUDGET_PROGRAM = address('ComputeBudget111111111111111111111111111111');
const LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111';
const USDC = address(USDC_MINT);
const WIDTH = DEPLOY_HALF_WIDTH * 2 + 1;
const MAX_COMPUTE_UNITS = 1_400_000;
const TRANSACTION_SIZE_LIMIT = 1232;
/** Jupiter route account budgets, tried in order until the whole transaction fits. */
const MAX_ACCOUNTS_STEPS = [40, 24, 16] as const;
const BASE_FEE_LAMPORTS = 5000n;
/** A Token-2022 ATA with typical account extensions; only used for the pre-flight SOL check. */
const ESTIMATED_TOKEN_ACCOUNT_SIZE = 200;
const FEE_MARGIN_LAMPORTS = 1_000_000n;

export type BuildDeps = {
  chain: DeployChain;
  jupiter: Jupiter;
  venues: (mint: string) => Promise<VenuesResponse>;
  now: () => number;
  /** Compute-unit price in micro-lamports. */
  priorityMicroLamports: bigint;
};

export class DeployRefusal extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'DeployRefusal'; }
}
const refuse = (code: string, message: string): never => { throw new DeployRefusal(code, message); };

type Rent = (size: number) => bigint;
function decodeRent(data: Uint8Array | undefined): Rent {
  if (!data || data.length < 17) return refuse('chain-unreadable', 'The rent sysvar could not be read. Try again shortly.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const perByteYear = Number(view.getBigUint64(0, true));
  const threshold = view.getFloat64(8, true);
  return size => BigInt(Math.floor((128 + size) * perByteYear * threshold));
}

/** SPL and Token-2022 token accounts share this base layout: amount at 64, state at 108. */
const TOKEN_ACCOUNT_SIZE = 165;
const tokenAmount = (data: Uint8Array) => data.length >= TOKEN_ACCOUNT_SIZE ? new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true) : 0n;
const tokenFrozen = (data: Uint8Array) => data.length >= TOKEN_ACCOUNT_SIZE && data[108] === 2;
const format = (raw: bigint, decimals: number) => {
  const factor = 10n ** BigInt(decimals);
  const fraction = (raw % factor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${raw / factor}${fraction ? `.${fraction}` : ''}`;
};

type PoolContext = {
  listing: VenuePool; pair: LbPair & { address: Address }; owner: Address; mint: Address; tokenIsX: boolean; tokenDecimals: number; tokenProgram: Address;
  budget: bigint; usdcAccount: Address; ownerLamports: bigint; rent: Rent;
};

async function readPool(request: DeployRequest, budget: bigint, deps: BuildDeps): Promise<PoolContext> {
  const venues = await deps.venues(request.mint);
  const listing = venues.state === 'ok' ? venues.pools.find(pool => pool.address === request.pool) : undefined;
  if (!listing) return refuse('pool-not-listed', 'Deploy is offered only for the pools listed above. Refresh the inspection and try again.');
  if (listing.counterMint !== USDC_MINT) return refuse('not-usdc-pair', 'Deploy supports pools that pair this token with USDC.');
  const owner = address(request.owner);
  const mint = address(request.mint);
  const [usdcAccount] = await findAssociatedTokenPda({ owner, mint: USDC, tokenProgram: TOKEN_PROGRAM });
  const { values: [poolAccount, ownerAccount, mintAccount, usdcTokenAccount, rentAccount] } = await deps.chain.accounts([address(request.pool), owner, mint, usdcAccount, RENT_SYSVAR]);
  const decoded = poolAccount?.owner === DLMM_PROGRAM ? decodeLbPair(poolAccount.data) : null;
  if (!decoded) return refuse('pool-invalid', 'That address is not a Meteora DLMM pool.');
  if (decoded.status !== 0) return refuse('pool-disabled', 'This pool is disabled for deposits.');
  const tokenIsX = decoded.tokenXMint === mint;
  if (!(tokenIsX ? decoded.tokenYMint === USDC : decoded.tokenXMint === USDC && decoded.tokenYMint === mint)) return refuse('pool-mismatch', 'This pool does not pair the inspected token with USDC.');
  const tokenProgram = tokenIsX ? decoded.tokenXProgram : decoded.tokenYProgram;
  if (!mintAccount || mintAccount.owner !== tokenProgram) return refuse('mint-mismatch', 'The token’s program does not match the pool’s record of it.');
  const tokenDecimals = checkMint(mintAccount.data);
  if (!ownerAccount) return refuse('wallet-empty', 'This wallet holds no SOL. It needs SOL for account rent and the network fee.');
  if (ownerAccount.owner !== SYSTEM_PROGRAM || ownerAccount.data.length) return refuse('wallet-unsupported', 'This address cannot pay transaction fees. Connect a regular wallet account.');
  const held = usdcTokenAccount?.owner === TOKEN_PROGRAM ? tokenAmount(usdcTokenAccount.data) : 0n;
  if (usdcTokenAccount && tokenFrozen(usdcTokenAccount.data)) return refuse('usdc-frozen', 'This wallet’s USDC account is frozen.');
  if (held < budget) return refuse('insufficient-usdc', `This wallet holds ${format(held, USDC_DECIMALS)} USDC in its main USDC account; the deploy needs ${format(budget, USDC_DECIMALS)} USDC.`);
  return { listing, pair: { ...decoded, address: address(request.pool) }, owner, mint, tokenIsX, tokenDecimals, tokenProgram, budget, usdcAccount, ownerLamports: ownerAccount.lamports, rent: decodeRent(rentAccount?.data) };
}

/** Decimals, after refusing mints whose transfers need accounts or fees this transaction does not carry. */
function checkMint(data: Uint8Array): number {
  let mint: ReturnType<ReturnType<typeof getMintDecoder>['decode']>;
  try { mint = getMintDecoder().decode(data); } catch { return refuse('mint-unreadable', 'The token’s mint could not be decoded.'); }
  const extensions = mint.extensions.__option === 'Some' ? mint.extensions.value : [];
  const hook = findExtension<{ __kind: string; programId: string }>(extensions, 'TransferHook');
  if (hook && hook.programId !== NONE_ADDRESS) refuse('transfer-hook', 'This token runs a transfer hook, which deploy does not support. Use Meteora directly.');
  const pause = findExtension<{ __kind: string; paused: boolean }>(extensions, 'PausableConfig');
  if (pause?.paused) refuse('token-paused', 'The issuer has paused transfers of this token.');
  if (findExtension(extensions, 'NonTransferable')) refuse('non-transferable', 'This token cannot be transferred.');
  const fee = findExtension<{ __kind: string; olderTransferFee: { transferFeeBasisPoints: number }; newerTransferFee: { transferFeeBasisPoints: number } }>(extensions, 'TransferFeeConfig');
  if (fee && (fee.olderTransferFee.transferFeeBasisPoints > 0 || fee.newerTransferFee.transferFeeBasisPoints > 0)) refuse('transfer-fee', 'This token charges a transfer fee, which deploy does not support.');
  const state = findExtension<{ __kind: string; state: number }>(extensions, 'DefaultAccountState');
  if (state && state.state === 2) refuse('frozen-by-default', 'New accounts for this token start frozen, so the swap could not deliver it.');
  return mint.decimals;
}

type RangeContext = {
  lower: number; upper: number; binArrays: Address[]; missingBinArrays: { index: number; address: Address }[]; bitmapExtension: Address | null;
  position: Address; positionIsNew: boolean; tokenAccount: Address; tokenAccountIsNew: boolean;
};

async function readRange(context: PoolContext, deps: BuildDeps): Promise<RangeContext> {
  const { pair, owner } = context;
  const lower = pair.activeId - DEPLOY_HALF_WIDTH;
  const upper = pair.activeId + DEPLOY_HALF_WIDTH;
  if (lower < pair.minBinId || upper > pair.maxBinId) return refuse('range-outside-pool', 'The pool’s price is too close to the edge of its allowed range for a centred deposit.');
  const indexes = [...new Set([binArrayIndex(lower), binArrayIndex(upper)])];
  const binArrays = await Promise.all(indexes.map(index => binArrayAddress(pair.address, index)));
  const bitmapExtension = indexes.some(needsBitmapExtension) ? await bitmapExtensionAddress(pair.address) : null;
  const position = await positionAddress(pair.address, owner, lower, WIDTH);
  const [tokenAccount] = await findAssociatedTokenPda({ owner, mint: context.mint, tokenProgram: context.tokenProgram });
  const lookups = [...binArrays, position, tokenAccount, ...(bitmapExtension ? [bitmapExtension] : [])];
  const { values } = await deps.chain.accounts(lookups);
  const missingBinArrays: RangeContext['missingBinArrays'] = [];
  binArrays.forEach((binArray, index) => {
    const account = values[index];
    if (!account) missingBinArrays.push({ index: indexes[index], address: binArray });
    else if (account.owner !== DLMM_PROGRAM || !isBinArray(account.data)) refuse('pool-invalid', 'The pool’s bin array did not match the DLMM layout.');
  });
  const existing = values[binArrays.length];
  if (existing) {
    const recorded = existing.owner === DLMM_PROGRAM ? decodePositionOwner(existing.data) : null;
    if (!recorded || recorded.lbPair !== pair.address || recorded.owner !== owner) refuse('position-conflict', 'An unexpected account sits at this wallet’s position address for the range.');
  }
  const tokenAccountData = values[binArrays.length + 1];
  if (tokenAccountData && tokenFrozen(tokenAccountData.data)) refuse('token-account-frozen', 'This wallet’s account for the token is frozen.');
  if (bitmapExtension && !values[binArrays.length + 2]) refuse('needs-bitmap-extension', 'This range needs a pool account that does not exist yet. Deposit on Meteora directly.');
  return { lower, upper, binArrays, missingBinArrays, bitmapExtension, position, positionIsNew: !existing, tokenAccount, tokenAccountIsNew: !tokenAccountData };
}

/** The most this transaction can pay in fees: base fee plus priority at the compute ceiling. */
const maxFee = (deps: BuildDeps) => BASE_FEE_LAMPORTS + (BigInt(MAX_COMPUTE_UNITS) * deps.priorityMicroLamports + 999_999n) / 1_000_000n;

function checkSol(context: PoolContext, range: RangeContext, deps: BuildDeps): void {
  const rent = (range.positionIsNew ? context.rent(POSITION_SIZE) : 0n) + BigInt(range.missingBinArrays.length) * context.rent(BIN_ARRAY_SIZE) + (range.tokenAccountIsNew ? context.rent(ESTIMATED_TOKEN_ACCOUNT_SIZE) : 0n);
  const needed = rent + maxFee(deps) + FEE_MARGIN_LAMPORTS;
  if (context.ownerLamports < needed) refuse('insufficient-sol', `This wallet holds ${format(context.ownerLamports, 9)} SOL; the deploy needs about ${format(needed, 9)} SOL for account rent and fees.`);
}

const computeUnitLimit = (units: number): Instruction => ({ programAddress: COMPUTE_BUDGET_PROGRAM, data: Uint8Array.from([2, ...getU32Encoder().encode(units)]) });
const computeUnitPrice = (microLamports: bigint): Instruction => ({ programAddress: COMPUTE_BUDGET_PROGRAM, data: Uint8Array.from([3, ...getU64Encoder().encode(microLamports)]) });

async function lookupTables(addresses: readonly Address[], deps: BuildDeps): Promise<Record<Address, Address[]>> {
  if (!addresses.length) return {};
  const { values } = await deps.chain.accounts(addresses);
  const decoder = getAddressDecoder();
  return Object.fromEntries(addresses.map((table, index) => {
    const account = values[index];
    if (!account || account.owner !== LOOKUP_TABLE_PROGRAM || account.data.length < 56 || (account.data.length - 56) % 32) return refuse('route-rejected', 'The swap route referenced an unreadable lookup table.');
    // Entries are append-only, so an index this transaction uses cannot be remapped; a deactivated table could not be used at all.
    if (new DataView(account.data.buffer, account.data.byteOffset, account.data.byteLength).getBigUint64(4, true) !== 0xffff_ffff_ffff_ffffn) return refuse('route-rejected', 'The swap route uses a lookup table that is being retired. Try again.');
    const entries: Address[] = [];
    for (let offset = 56; offset < account.data.length; offset += 32) entries.push(decoder.decode(account.data.subarray(offset, offset + 32)));
    return [table, entries];
  }));
}

/**
 * An invoked program can never be written, and the runtime demotes such write
 * locks; a route that marks one writable (DLMM's optional-account placeholder)
 * is compiled with the same demotion instead of being refused by the encoder.
 */
function demoteInvokedPrograms(instructions: readonly Instruction[]): Instruction[] {
  const programs = new Set<string>(instructions.map(instruction => instruction.programAddress));
  return instructions.map(instruction => ({
    ...instruction,
    accounts: instruction.accounts?.map(meta => (programs.has(meta.address) && meta.role === AccountRole.WRITABLE ? { ...meta, role: AccountRole.READONLY } : meta)),
  }));
}

type Lifetime = { blockhash: string; lastValidBlockHeight: bigint };
function compile(owner: Address, lifetime: Lifetime, instructions: readonly Instruction[], tables: Record<Address, Address[]>) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    draft => setTransactionMessageFeePayer(owner, draft),
    draft => setTransactionMessageLifetimeUsingBlockhash({ blockhash: lifetime.blockhash as Blockhash, lastValidBlockHeight: lifetime.lastValidBlockHeight }, draft),
    draft => appendTransactionMessageInstructions(demoteInvokedPrograms(instructions), draft),
    draft => compressTransactionMessageUsingAddressLookupTables(draft, tables),
  );
  const transaction = compileTransaction(message);
  return { wire: getBase64EncodedWireTransaction(transaction), size: getTransactionSize(transaction) };
}

type Composed = { quote: JupiterQuote; swapIn: bigint; swapPrice: number; instructions: Instruction[]; tables: Record<Address, Address[]>; maxActiveBinSlippage: number; trialWire: string };

/** Quote, fetch the swap, append the deposit, and shrink the route until the transaction fits. */
async function compose(request: DeployRequest, context: PoolContext, range: RangeContext, lifetime: Lifetime, deps: BuildDeps): Promise<Composed> {
  const swapIn = context.budget / 2n;
  const eventAuthority = await eventAuthorityAddress();
  const maxActiveBinSlippage = Math.max(1, Math.ceil(request.slippageBps / context.pair.binStep));
  for (const maxAccounts of MAX_ACCOUNTS_STEPS) {
    const quote = await deps.jupiter.quote({ inputMint: USDC_MINT, outputMint: request.mint, amount: swapIn, slippageBps: request.slippageBps, maxAccounts });
    const impactPct = Math.abs(Number(quote.priceImpactPct)) * 100;
    if (!Number.isFinite(impactPct) || impactPct > MAX_PRICE_IMPACT_PCT) refuse('price-impact', `This swap would move the price by about ${impactPct.toFixed(2)}%. Try a smaller amount.`);
    const swapPrice = (Number(swapIn) / 10 ** USDC_DECIMALS) / (Number(quote.outAmount) / 10 ** context.tokenDecimals);
    const gapPct = Math.abs(poolPrice(context) - swapPrice) / swapPrice * 100;
    if (!(gapPct <= MAX_PRICE_GAP_PCT)) refuse('stale-pool-price', `The pool’s price is ${gapPct.toFixed(2)}% away from the swap price. Depositing at a stale price can lose value to arbitrage.`);
    const plan = await deps.jupiter.swapInstructions(quote, { owner: context.owner, mint: context.mint, tokenProgram: context.tokenProgram, usdcAccount: context.usdcAccount, tokenAccount: range.tokenAccount });
    const tokenRaw = BigInt(quote.otherAmountThreshold);
    const usdcRaw = context.budget - swapIn;
    const deposit = addLiquidityByStrategy2Instruction({
      position: range.position, lbPair: context.pair, bitmapExtension: range.bitmapExtension, sender: context.owner, eventAuthority,
      userTokenX: context.tokenIsX ? range.tokenAccount : context.usdcAccount, userTokenY: context.tokenIsX ? context.usdcAccount : range.tokenAccount,
      amountX: context.tokenIsX ? tokenRaw : usdcRaw, amountY: context.tokenIsX ? usdcRaw : tokenRaw,
      activeId: context.pair.activeId, maxActiveBinSlippage, minBinId: range.lower, maxBinId: range.upper, binArrays: range.binArrays,
    });
    const instructions = [
      ...plan.instructions,
      ...range.missingBinArrays.map(binArray => initializeBinArrayInstruction({ lbPair: context.pair.address, binArray: binArray.address, funder: context.owner, index: binArray.index })),
      ...(range.positionIsNew ? [initializePositionPdaInstruction({ owner: context.owner, position: range.position, lbPair: context.pair.address, lowerBinId: range.lower, width: WIDTH, eventAuthority })] : []),
      deposit,
    ];
    const tables = await lookupTables(plan.lookupTables, deps);
    const trial = compile(context.owner, lifetime, [computeUnitLimit(MAX_COMPUTE_UNITS), computeUnitPrice(deps.priorityMicroLamports), ...instructions], tables);
    if (trial.size <= TRANSACTION_SIZE_LIMIT) return { quote, swapIn, swapPrice, instructions, tables, maxActiveBinSlippage, trialWire: trial.wire };
  }
  return refuse('too-large', 'The swap route and the deposit do not fit in one transaction. Try a different amount.');
}

const TOKEN_OWNER_OFFSET = 32;

/**
 * Every writable account in the transaction that is a token account held by
 * this wallet must be the USDC or token account the deploy uses. A route that
 * reaches any other of the wallet's token accounts is refused.
 */
async function checkWritableAccounts(instructions: readonly Instruction[], context: PoolContext, range: RangeContext, deps: BuildDeps): Promise<void> {
  const allowed = new Set<string>([context.usdcAccount, range.tokenAccount]);
  const writable = [...new Set(instructions.flatMap(instruction => (instruction.accounts ?? [])
    .filter(meta => meta.role === AccountRole.WRITABLE && !allowed.has(meta.address))
    .map(meta => meta.address)))];
  for (let index = 0; index < writable.length; index += 100) {
    const { values } = await deps.chain.accounts(writable.slice(index, index + 100));
    for (const account of values) {
      if (!account || (account.owner !== TOKEN_PROGRAM && account.owner !== TOKEN_2022_PROGRAM) || account.data.length < TOKEN_ACCOUNT_SIZE) continue;
      if (getAddressDecoder().decode(account.data.subarray(TOKEN_OWNER_OFFSET, TOKEN_OWNER_OFFSET + 32)) === context.owner) {
        refuse('route-rejected', 'The swap route would write to another of this wallet’s token accounts. Nothing was offered to your wallet.');
      }
    }
  }
}

/**
 * The simulated outcome must match the preview. USDC falls by at least the
 * swap's exact input and at most the whole budget (the deposit may leave a few
 * base units behind to per-bin rounding); the wallet's token balance does not
 * fall; and SOL spent stays within the new accounts' rent plus the most the
 * fees can be.
 */
type Balances = { ownerLamports: bigint; usdcHeld: bigint; tokenHeld: bigint };
/** Read immediately before simulating, so activity during the build does not look like a mismatch. */
async function readBalances(context: PoolContext, range: RangeContext, deps: BuildDeps): Promise<Balances> {
  const { values: [owner, usdc, token] } = await deps.chain.accounts([context.owner, context.usdcAccount, range.tokenAccount]);
  return { ownerLamports: owner?.lamports ?? 0n, usdcHeld: usdc ? tokenAmount(usdc.data) : 0n, tokenHeld: token ? tokenAmount(token.data) : 0n };
}

function checkBalances(simulated: ReadonlyMap<string, { lamports: bigint; data: Uint8Array } | null>, before: Balances, context: PoolContext, range: RangeContext, swapIn: bigint, rent: bigint, deps: BuildDeps): void {
  const usdc = simulated.get(context.usdcAccount);
  const token = simulated.get(range.tokenAccount);
  const owner = simulated.get(context.owner);
  const usdcSpent = usdc ? before.usdcHeld - tokenAmount(usdc.data) : -1n;
  const tokenAfter = token ? tokenAmount(token.data) : 0n;
  const solSpent = owner ? before.ownerLamports - owner.lamports : -1n;
  if (usdcSpent < swapIn || usdcSpent > context.budget || tokenAfter < before.tokenHeld || solSpent < 0n || solSpent > rent + maxFee(deps) + 10_000n) {
    refuse('balance-mismatch', 'The simulated balances did not match this preview. If your balances just changed, build it again. Nothing was offered to your wallet.');
  }
}

/** USDC per token at a bin, whichever side of the pair the token is. Display and sanity checks only. */
function usdcPerToken(context: PoolContext, binId: number): number {
  const { pair, tokenIsX, tokenDecimals } = context;
  return tokenIsX ? binPrice(binId, pair.binStep, tokenDecimals, USDC_DECIMALS) : 1 / binPrice(binId, pair.binStep, USDC_DECIMALS, tokenDecimals);
}
const poolPrice = (context: PoolContext) => usdcPerToken(context, context.pair.activeId);

function summarize(context: PoolContext, range: RangeContext, composed: Composed, limit: number, rent: { position: bigint; other: bigint }, deps: BuildDeps): DeploySummary {
  const { quote, swapIn } = composed;
  const edges = [usdcPerToken(context, range.lower), usdcPerToken(context, range.upper)];
  const current = poolPrice(context);
  return {
    pool: context.pair.address, pair: context.listing.pair, tokenSymbol: context.listing.tokenSymbol, tokenMint: context.mint, tokenDecimals: context.tokenDecimals,
    owner: context.owner, budgetRaw: context.budget.toString(),
    swap: {
      inRaw: swapIn.toString(), quotedOutRaw: quote.outAmount, minOutRaw: quote.otherAmountThreshold, priceImpactPct: Math.abs(Number(quote.priceImpactPct)) * 100, price: composed.swapPrice,
      venues: [...new Set(quote.routePlan.map(step => step.swapInfo.label ?? 'Unlabelled venue'))].slice(0, 8),
    },
    deposit: {
      tokenRaw: quote.otherAmountThreshold, usdcRaw: (context.budget - swapIn).toString(), activeBinId: context.pair.activeId, lowerBinId: range.lower, upperBinId: range.upper,
      binStep: context.pair.binStep, poolPrice: current, minPrice: Math.min(...edges), maxPrice: Math.max(...edges), maxActiveBinSlippage: composed.maxActiveBinSlippage,
    },
    priceGapPct: Math.abs(current - composed.swapPrice) / composed.swapPrice * 100,
    position: { address: range.position, isNew: range.positionIsNew },
    sol: { positionRentLamports: rent.position.toString(), otherRentLamports: rent.other.toString(), networkFeeLamports: (BASE_FEE_LAMPORTS + (BigInt(limit) * deps.priorityMicroLamports + 999_999n) / 1_000_000n).toString() },
    newBinArrays: range.missingBinArrays.length,
  };
}

function failureResponse(error: unknown): DeployResponse {
  if (error instanceof DeployRefusal) return { state: 'refused', code: error.code, message: error.message };
  if (error instanceof JupiterError) return error.kind === 'no-route' || error.kind === 'rejected'
    ? { state: 'refused', code: `jupiter-${error.kind}`, message: error.message }
    : { state: 'unavailable', message: error.kind === 'rate-limited' ? 'Jupiter is rate limiting quotes. Try again in a minute.' : 'Jupiter could not be reached. Try again shortly.' };
  if (error instanceof RpcError) return { state: 'unavailable', message: error.kind === 'not-configured' ? 'Deploy is not configured on this deployment.' : 'The Solana RPC provider could not complete the checks. Try again shortly.' };
  throw error;
}

/**
 * Builds one unsigned v0 transaction: Jupiter swaps half the budget into the
 * token, then Meteora deposits the swap's guaranteed minimum plus the other
 * half of the USDC across 69 bins centred on the pool price. The whole
 * transaction is simulated before it is returned; the server never signs.
 */
export async function buildDeploy(request: DeployRequest, deps: BuildDeps): Promise<DeployResponse> {
  try {
    const budget = parseUsdc(request.amount);
    if (budget === null || !withinDeployLimits(budget)) return { state: 'invalid', message: 'Enter between 1 and 25,000 USDC.' };
    if (request.mint === USDC_MINT) refuse('usdc-itself', 'USDC is the budget; inspect the token you want to deploy into.');
    const context = await readPool(request, budget, deps);
    const range = await readRange(context, deps);
    checkSol(context, range, deps);
    const lifetime = await deps.chain.latestBlockhash();
    const composed = await compose(request, context, range, lifetime, deps);
    await checkWritableAccounts(composed.instructions, context, range, deps);
    const newAccounts = [...(range.positionIsNew ? [range.position] : []), ...range.missingBinArrays.map(binArray => binArray.address), ...(range.tokenAccountIsNew ? [range.tokenAccount] : [])];
    const watched = [...new Set<Address>([context.owner, context.usdcAccount, range.tokenAccount, ...newAccounts])];
    const before = await readBalances(context, range, deps);
    const simulation = await deps.chain.simulate(composed.trialWire, watched);
    if (simulation.err) refuse('simulation-failed', explainSimulationFailure(simulation.err, simulation.logs, [COMPUTE_BUDGET_PROGRAM, COMPUTE_BUDGET_PROGRAM, ...composed.instructions.map(instruction => instruction.programAddress)]));
    const simulated = new Map(watched.map((target, index) => [target as string, simulation.accounts[index] ?? null]));
    const rentOf = (target: Address) => simulated.get(target)?.lamports ?? 0n;
    const rent = { position: range.positionIsNew ? rentOf(range.position) : 0n, other: newAccounts.filter(target => target !== range.position).reduce((sum, target) => sum + rentOf(target), 0n) };
    checkBalances(simulated, before, context, range, composed.swapIn, rent.position + rent.other, deps);
    const units = Number(simulation.unitsConsumed ?? MAX_COMPUTE_UNITS);
    const limit = Math.min(MAX_COMPUTE_UNITS, Math.ceil(units * 1.15) + 20_000);
    const final = compile(context.owner, lifetime, [computeUnitLimit(limit), computeUnitPrice(deps.priorityMicroLamports), ...composed.instructions], composed.tables);
    return {
      state: 'ready', transaction: final.wire, lastValidBlockHeight: lifetime.lastValidBlockHeight.toString(), builtAt: new Date(deps.now()).toISOString(),
      simulation: { unitsConsumed: units, computeUnitLimit: limit, slot: simulation.slot.toString() },
      summary: summarize(context, range, composed, limit, rent, deps),
    };
  } catch (error) { return failureResponse(error); }
}
