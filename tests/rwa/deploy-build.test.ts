import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  AccountRole, address, getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder, getU32Decoder, none, some, type Address, type Instruction,
} from '@solana/kit';
import { extension, findAssociatedTokenPda, getMintEncoder } from '@solana-program/token-2022';
import bs58 from 'bs58';
import golden from './fixtures/dlmm-golden.json';
import { USDC_MINT, preparedFeePayer } from '@/lib/rwa/deploy';
import type { VenuesResponse } from '@/lib/rwa/venues';
import { buildDeploy, type BuildDeps } from '@/lib/server/rwa/deploy/build';
import type { ChainAccount, DeployChain, Simulation } from '@/lib/server/rwa/deploy/chain';
import { BIN_ARRAY_SIZE, DLMM_PROGRAM, POSITION_SIZE, RENT_SYSVAR, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, binArrayAddress, positionAddress } from '@/lib/server/rwa/deploy/dlmm';
import { JUPITER_PROGRAM, JupiterError, type Jupiter, type JupiterQuote, type SwapPlan } from '@/lib/server/rwa/deploy/jupiter';

const POOL = address(golden.pool);
const OWNER = address(golden.owner);
const USDY = address('A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6');
const USDC = address(USDC_MINT);
const ATA_PROGRAM = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const ALT = address('5DzMTjeaEg2i1xKDde3wV1BKdetw68ZoKddiwfQK7x9K');
const COMPUTE = 'ComputeBudget111111111111111111111111111111';
const AMM = [address('AGXrswVDRoUf62UX9voTXv6TCGw6fBUEwDpyUd9YdZfD'), address('BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU'), address('6SpQEBmwxwBh5FxhdCHkCKnQnDpAvJYAv993Bp8LiaEn')];
const POOL_BYTES = Uint8Array.from(Buffer.from(golden.lbPairBase64, 'base64'));

const legacyMint = (decimals: number) => { const bytes = new Uint8Array(82); bytes[44] = decimals; bytes[45] = 1; return bytes; };
const tokenAccount = (amount: bigint, state = 1) => { const bytes = new Uint8Array(165); new DataView(bytes.buffer).setBigUint64(64, amount, true); bytes[108] = state; return bytes; };
const rentSysvar = () => { const bytes = new Uint8Array(17); const view = new DataView(bytes.buffer); view.setBigUint64(0, 3480n, true); view.setFloat64(8, 2, true); bytes[16] = 50; return bytes; };
const binArray = () => { const bytes = new Uint8Array(BIN_ARRAY_SIZE); bytes.set([92, 142, 92, 220, 5, 148, 70, 181]); return bytes; };
const lookupTable = (entries: readonly Address[], deactivated = false) => { const bytes = new Uint8Array(56 + entries.length * 32); bytes.set([1, 0, 0, 0]); if (!deactivated) bytes.fill(0xff, 4, 12); entries.forEach((entry, index) => bytes.set(bs58.decode(entry), 56 + index * 32)); return bytes; };
const walletTokenAccount = (amount: bigint) => { const bytes = tokenAccount(amount); bytes.set(bs58.decode(OWNER), 32); return bytes; };
const account = (owner: Address | string, data: Uint8Array, lamports = 10_000_000n): ChainAccount => ({ owner: owner as Address, data, lamports });

type World = { accounts: Map<string, ChainAccount | null>; quote: JupiterQuote; plan: SwapPlan; simulation: Partial<Simulation>; post: Map<string, ChainAccount | null> };
let world: World;
let usdcAccount: Address;
let usdyAccount: Address;
let position: Address;
let binArrays: Address[];

function quoteFor(amount: bigint, slippageBps: number, outAmount = '4353028', minOut = '4309498', impact = '0'): JupiterQuote {
  return { inputMint: USDC_MINT, outputMint: USDY, inAmount: amount.toString(), outAmount, otherAmountThreshold: minOut, swapMode: 'ExactIn', slippageBps, priceImpactPct: impact, routePlan: [{ swapInfo: { ammKey: AMM[0], label: 'Whirlpool', inputMint: USDC_MINT, outputMint: USDY }, percent: 100 }] };
}
function swapPlan(extraAccounts: readonly Address[] = []): SwapPlan {
  const setup: Instruction = { programAddress: ATA_PROGRAM, accounts: [
    { address: OWNER, role: AccountRole.WRITABLE_SIGNER }, { address: usdyAccount, role: AccountRole.WRITABLE }, { address: OWNER, role: AccountRole.READONLY },
    { address: USDY, role: AccountRole.READONLY }, { address: SYSTEM_PROGRAM, role: AccountRole.READONLY }, { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
  ], data: Uint8Array.from([1]) };
  const swap: Instruction = { programAddress: JUPITER_PROGRAM, accounts: [
    { address: TOKEN_PROGRAM, role: AccountRole.READONLY }, { address: OWNER, role: AccountRole.READONLY_SIGNER }, { address: usdcAccount, role: AccountRole.WRITABLE },
    { address: usdyAccount, role: AccountRole.WRITABLE }, ...AMM.map(amm => ({ address: amm, role: AccountRole.WRITABLE })), ...extraAccounts.map(extra => ({ address: extra, role: AccountRole.READONLY })),
  ], data: Uint8Array.from({ length: 40 }, (_, index) => index) };
  return { instructions: [setup, swap], lookupTables: [ALT] };
}

type Fake<T> = { [K in keyof T]: T[K] extends (...args: never[]) => unknown ? Mock<T[K]> : T[K] };
function deps(): Omit<BuildDeps, 'chain' | 'jupiter'> & { chain: Fake<DeployChain>; jupiter: Fake<Jupiter> } {
  const venues: VenuesResponse = {
    state: 'ok', mint: USDY, source: 'Meteora DLMM data API', fetchedAt: '2026-09-28T12:00:00.000Z', matched: 1, belowFloor: 0,
    pools: [{ address: POOL, pair: 'USDY-USDC', tokenSymbol: 'USDY', counterSymbol: 'USDC', counterMint: USDC_MINT, counterVerified: true, tvlUsd: 1742, volume24hUsd: 700, fees24hUsd: 0.1, feeTvl24hPct: 0.01, feeApyPct: 2.8, farmApyPct: null, binStep: 1, baseFeePct: 0.01, meteoraUrl: `https://app.meteora.ag/dlmm/${POOL}` }],
  };
  return {
    chain: {
      accounts: vi.fn(async (addresses: readonly Address[]) => ({ slot: 1n, values: addresses.map(target => world.accounts.get(target) ?? null) })),
      latestBlockhash: vi.fn(async () => ({ blockhash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', lastValidBlockHeight: 1000n })),
      simulate: vi.fn(async (_wire: string, post: readonly Address[]) => ({ err: null, logs: [], unitsConsumed: 400_000n, slot: 7n, accounts: post.map(target => postState(target)), ...world.simulation })),
      signatureStatus: vi.fn(), blockHeight: vi.fn(),
    },
    jupiter: {
      quote: vi.fn(async (input: { amount: bigint; slippageBps: number }) => world.quote ?? quoteFor(input.amount, input.slippageBps)),
      swapInstructions: vi.fn(async () => world.plan),
    },
    venues: vi.fn(async () => venues),
    now: () => Date.parse('2026-09-28T12:00:00.000Z'),
    priorityMicroLamports: 100_000n,
  } as never;
}
const request = (over: Record<string, unknown> = {}) => ({ mint: USDY, pool: POOL, owner: OWNER, amount: '10', slippageBps: 100 as const, ...over });

beforeEach(async () => {
  [usdcAccount] = await findAssociatedTokenPda({ owner: OWNER, mint: USDC, tokenProgram: TOKEN_PROGRAM });
  [usdyAccount] = await findAssociatedTokenPda({ owner: OWNER, mint: USDY, tokenProgram: TOKEN_PROGRAM });
  position = await positionAddress(POOL, OWNER, 1319, 69);
  binArrays = [await binArrayAddress(POOL, 18), await binArrayAddress(POOL, 19)];
  world = {
    accounts: new Map<string, ChainAccount | null>([
      [POOL, account(DLMM_PROGRAM, POOL_BYTES)], [OWNER, account(SYSTEM_PROGRAM, new Uint8Array(), 2_000_000_000n)], [USDY, account(TOKEN_PROGRAM, legacyMint(6))],
      [usdcAccount, account(TOKEN_PROGRAM, tokenAccount(50_000_000n))], [RENT_SYSVAR, account('Sysvar1111111111111111111111111111111111111', rentSysvar())],
      [binArrays[0], account(DLMM_PROGRAM, binArray())], [binArrays[1], account(DLMM_PROGRAM, binArray())],
      [ALT, account('AddressLookupTab1e1111111111111111111111111', lookupTable(AMM))],
    ]),
    quote: undefined as unknown as JupiterQuote, plan: swapPlan(), simulation: {}, post: new Map(),
  };
});

const RENT = { position: 41_899_840n, tokenAccount: 2_039_280n, binArray: 71_437_440n };
/** What the fake chain reports after the transaction, unless a test overrides an account in world.post. */
function postState(target: Address): ChainAccount | null {
  if (world.post.has(target)) return world.post.get(target)!;
  const before = world.accounts.get(target) ?? null;
  const amount = (value: ChainAccount | null) => (value ? new DataView(value.data.buffer, value.data.byteOffset).getBigUint64(64, true) : 0n);
  if (target === OWNER) {
    const missingBinArrays = BigInt(binArrays.filter(binArray => !world.accounts.get(binArray)).length);
    const created = (world.accounts.get(position) ? 0n : RENT.position) + (world.accounts.get(usdyAccount) ? 0n : RENT.tokenAccount) + missingBinArrays * RENT.binArray;
    return account(SYSTEM_PROGRAM, new Uint8Array(), before!.lamports - created - 53_000n);
  }
  // The live deposit leaves a few base units behind to per-bin rounding; the check must allow that.
  if (target === usdcAccount) return account(TOKEN_PROGRAM, tokenAccount(amount(before) - 10_000_000n + 5n));
  if (target === position) return account(DLMM_PROGRAM, new Uint8Array(POSITION_SIZE), RENT.position);
  if (binArrays.includes(target)) return account(DLMM_PROGRAM, binArray(), RENT.binArray);
  // Otherwise it is the token account the deploy uses: the fill above the swap's minimum stays there.
  return account(before?.owner ?? TOKEN_PROGRAM, tokenAccount(amount(before) + 43_530n), before?.lamports ?? RENT.tokenAccount);
}

function decode(wire: string) {
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (message.version !== 0) throw new Error('expected a v0 message');
  const programs = message.instructions.map(instruction => message.staticAccounts[instruction.programAddressIndex]);
  return { transaction, message, programs };
}

describe('deploy transaction builder', () => {
  it('swaps half the budget and deposits the swap minimum plus the other half, signed by the wallet alone', async () => {
    const d = deps();
    const result = await buildDeploy(request(), d);
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(d.jupiter.quote).toHaveBeenCalledWith({ inputMint: USDC_MINT, outputMint: USDY, amount: 5_000_000n, slippageBps: 100, maxAccounts: 40 });
    const { transaction, message, programs } = decode(result.transaction);
    expect(Object.keys(transaction.signatures)).toEqual([OWNER]);
    expect(message.staticAccounts[0]).toBe(OWNER);
    expect(preparedFeePayer(result.transaction)).toBe(OWNER);
    expect(preparedFeePayer(result.transaction.slice(4))).toBeNull();
    expect(preparedFeePayer('not base64!')).toBeNull();
    expect(programs).toEqual([COMPUTE, COMPUTE, ATA_PROGRAM, JUPITER_PROGRAM, DLMM_PROGRAM, DLMM_PROGRAM]);
    expect(message.addressTableLookups?.[0]?.lookupTableAddress).toBe(ALT);
    expect(getU32Decoder().decode(message.instructions[0].data!.slice(1))).toBe(480_000);
    expect(result.simulation).toEqual({ unitsConsumed: 400_000, computeUnitLimit: 480_000, slot: '7' });
    expect(result.summary).toMatchObject({
      tokenSymbol: 'USDY', budgetRaw: '10000000', priceGapPct: expect.closeTo(0.327, 2), newBinArrays: 0,
      swap: { inRaw: '5000000', quotedOutRaw: '4353028', minOutRaw: '4309498', venues: ['Whirlpool'] },
      deposit: { tokenRaw: '4309498', usdcRaw: '5000000', activeBinId: 1353, lowerBinId: 1319, upperBinId: 1387, binStep: 1, maxActiveBinSlippage: 100 },
      position: { address: position, isNew: true },
      sol: { positionRentLamports: '41899840', otherRentLamports: '2039280', networkFeeLamports: '53000' },
    });
    expect(d.chain.simulate).toHaveBeenCalledWith(expect.any(String), [OWNER, usdcAccount, usdyAccount, position]);
  });

  it('adds to the wallet’s existing position at the same range instead of creating one', async () => {
    const recorded = new Uint8Array(POSITION_SIZE);
    recorded.set([117, 176, 212, 199, 245, 180, 133, 182]);
    recorded.set(bs58.decode(POOL), 8); recorded.set(bs58.decode(OWNER), 40);
    world.accounts.set(position, account(DLMM_PROGRAM, recorded));
    const result = await buildDeploy(request(), deps());
    if (result.state !== 'ready') throw new Error(JSON.stringify(result));
    expect(decode(result.transaction).programs).toEqual([COMPUTE, COMPUTE, ATA_PROGRAM, JUPITER_PROGRAM, DLMM_PROGRAM]);
    expect(result.summary.position).toEqual({ address: position, isNew: false });
    expect(result.summary.sol.positionRentLamports).toBe('0');
    recorded.set(bs58.decode(USDY), 40);
    expect(await buildDeploy(request(), deps())).toMatchObject({ state: 'refused', code: 'position-conflict' });
  });

  it('creates a missing bin array and reports it', async () => {
    world.accounts.set(binArrays[1], null);
    const result = await buildDeploy(request(), deps());
    if (result.state !== 'ready') throw new Error(JSON.stringify(result));
    expect(decode(result.transaction).programs).toEqual([COMPUTE, COMPUTE, ATA_PROGRAM, JUPITER_PROGRAM, DLMM_PROGRAM, DLMM_PROGRAM, DLMM_PROGRAM]);
    expect(result.summary.newBinArrays).toBe(1);
  });

  it('refuses a route that writes to another of the wallet’s token accounts', async () => {
    const stash = address(bs58.encode(crypto.getRandomValues(new Uint8Array(32))));
    world.accounts.set(stash, account(TOKEN_PROGRAM, walletTokenAccount(1_000_000_000n)));
    world.plan = swapPlan();
    const [setup, swap] = world.plan.instructions;
    world.plan = { ...world.plan, instructions: [setup, { ...swap, accounts: [...swap.accounts!, { address: stash, role: AccountRole.WRITABLE }] }] };
    const d = deps();
    expect(await buildDeploy(request(), d)).toMatchObject({ state: 'refused', code: 'route-rejected', message: expect.stringContaining('another of this wallet’s token accounts') });
    expect(d.chain.simulate).not.toHaveBeenCalled();
  });

  it.each([
    ['USDC falls by more than the budget', () => { world.post.set(usdcAccount, account(TOKEN_PROGRAM, tokenAccount(30_000_000n))); }],
    ['USDC falls by less than the swap input', () => { world.post.set(usdcAccount, account(TOKEN_PROGRAM, tokenAccount(46_000_000n))); }],
    ['the wallet’s existing token balance falls', () => { world.accounts.set(usdyAccount, account(TOKEN_PROGRAM, tokenAccount(5_000_000n))); world.post.set(usdyAccount, account(TOKEN_PROGRAM, tokenAccount(4_000_000n))); }],
    ['more SOL leaves than rent and fees', () => { world.post.set(OWNER, account(SYSTEM_PROGRAM, new Uint8Array(), 1_000_000_000n)); }],
  ])('refuses when %s in the simulation', async (_label, arrange) => {
    arrange();
    expect(await buildDeploy(request(), deps())).toMatchObject({ state: 'refused', code: 'balance-mismatch' });
  });

  it('compiles a route that marks the DLMM program writable, as the runtime would, read-only', async () => {
    const [setup, swap] = world.plan.instructions;
    world.plan = { ...world.plan, instructions: [setup, { ...swap, accounts: [...swap.accounts!, { address: DLMM_PROGRAM, role: AccountRole.WRITABLE }] }] };
    const result = await buildDeploy(request(), deps());
    if (result.state !== 'ready') throw new Error(JSON.stringify(result));
    const { message } = decode(result.transaction);
    const index = message.staticAccounts.indexOf(DLMM_PROGRAM);
    const writableUnsigned = message.staticAccounts.length - message.header.numSignerAccounts - message.header.numReadonlyNonSignerAccounts;
    expect(index).toBeGreaterThanOrEqual(message.header.numSignerAccounts + writableUnsigned);
  });

  it('refuses a route whose lookup table is being retired', async () => {
    world.accounts.set(ALT, account('AddressLookupTab1e1111111111111111111111111', lookupTable(AMM, true)));
    expect(await buildDeploy(request(), deps())).toMatchObject({ state: 'refused', code: 'route-rejected', message: expect.stringContaining('being retired') });
  });

  it.each([
    ['pool-not-listed', () => undefined, { pool: 'GuBQaPTV9Cu5KzKfHkVLSh3bXc1z3BShXefQG7e2V5R3' }],
    ['pool-invalid', () => { world.accounts.set(POOL, account(SYSTEM_PROGRAM, POOL_BYTES)); }, {}],
    ['pool-disabled', () => { const bytes = POOL_BYTES.slice(); bytes[82] = 1; world.accounts.set(POOL, account(DLMM_PROGRAM, bytes)); }, {}],
    ['mint-mismatch', () => { world.accounts.set(USDY, account(TOKEN_2022_PROGRAM, legacyMint(6))); }, {}],
    ['wallet-empty', () => { world.accounts.set(OWNER, null); }, {}],
    ['wallet-unsupported', () => { world.accounts.set(OWNER, account(DLMM_PROGRAM, new Uint8Array(8))); }, {}],
    ['insufficient-usdc', () => { world.accounts.set(usdcAccount, account(TOKEN_PROGRAM, tokenAccount(9_999_999n))); }, {}],
    ['usdc-frozen', () => { world.accounts.set(usdcAccount, account(TOKEN_PROGRAM, tokenAccount(50_000_000n, 2))); }, {}],
    ['insufficient-sol', () => { world.accounts.set(OWNER, account(SYSTEM_PROGRAM, new Uint8Array(), 50_000_000n)); }, {}],
    ['price-impact', () => { world.quote = quoteFor(5_000_000n, 100, '4353028', '4309498', '0.06'); }, {}],
    ['stale-pool-price', () => { world.quote = quoteFor(5_000_000n, 100, '4000000', '3960000'); }, {}],
    ['usdc-itself', () => undefined, { mint: USDC_MINT }],
  ])('refuses with %s before anything is offered', async (code, arrange, over) => {
    arrange();
    const d = deps();
    const result = await buildDeploy(request(over), d);
    expect(result).toMatchObject({ state: 'refused', code });
    expect(d.chain.simulate).not.toHaveBeenCalled();
  });

  it('names a friendly reason when the whole transaction fails its simulation', async () => {
    world.simulation = { err: { InstructionError: [3n, { Custom: 6001n }] }, logs: ['Program JUP6… failed: custom program error: 0x1771'] };
    expect(await buildDeploy(request(), deps())).toMatchObject({ state: 'refused', code: 'simulation-failed', message: expect.stringContaining('slippage') });
    world.simulation = { err: { InstructionError: [5n, { Custom: 6004n }] }, logs: [] };
    expect(await buildDeploy(request(), deps())).toMatchObject({ message: expect.stringContaining('pool’s price moved') });
  });

  it('shrinks the Jupiter route until everything fits, then refuses', async () => {
    // Thirty accounts outside the lookup table cost ~960 bytes: no route budget can fit that.
    world.plan = swapPlan(Array.from({ length: 30 }, () => address(bs58.encode(crypto.getRandomValues(new Uint8Array(32))))));
    const d = deps();
    expect(await buildDeploy(request(), d)).toMatchObject({ state: 'refused', code: 'too-large' });
    expect(d.jupiter.quote.mock.calls.map(call => (call[0] as { maxAccounts: number }).maxAccounts)).toEqual([40, 24, 16]);
  });

  it('refuses a Token-2022 mint that runs a transfer hook', async () => {
    const bytes = POOL_BYTES.slice(); bytes[880] = 1;
    world.accounts.set(POOL, account(DLMM_PROGRAM, bytes));
    const hooked = getMintEncoder().encode({ mintAuthority: none(), supply: 0n, decimals: 8, isInitialized: true, freezeAuthority: none(), extensions: some([extension('TransferHook', { authority: OWNER, programId: JUPITER_PROGRAM })]) });
    world.accounts.set(USDY, account(TOKEN_2022_PROGRAM, Uint8Array.from(hooked)));
    expect(await buildDeploy(request(), deps())).toMatchObject({ state: 'refused', code: 'transfer-hook' });
    const inert = getMintEncoder().encode({ mintAuthority: none(), supply: 0n, decimals: 8, isInitialized: true, freezeAuthority: none(), extensions: some([extension('TransferHook', { authority: OWNER, programId: SYSTEM_PROGRAM })]) });
    world.accounts.set(USDY, account(TOKEN_2022_PROGRAM, Uint8Array.from(inert)));
    const [hookedAccount] = await findAssociatedTokenPda({ owner: OWNER, mint: USDY, tokenProgram: TOKEN_2022_PROGRAM });
    world.plan = { ...world.plan, instructions: world.plan.instructions.map(instruction => ({ ...instruction, accounts: instruction.accounts?.map(meta => meta.address === usdyAccount ? { ...meta, address: hookedAccount } : meta) })) };
    expect(await buildDeploy(request(), deps())).toMatchObject({ state: 'ready' });
  });

  it('maps Jupiter and RPC outages to retryable states', async () => {
    const d = deps();
    d.jupiter.quote.mockRejectedValueOnce(new JupiterError('no-route', 'Jupiter found no route for this swap.'));
    expect(await buildDeploy(request(), d)).toMatchObject({ state: 'refused', code: 'jupiter-no-route' });
    d.jupiter.quote.mockRejectedValueOnce(new JupiterError('rate-limited', 'slow down'));
    expect(await buildDeploy(request(), d)).toMatchObject({ state: 'unavailable', message: expect.stringContaining('rate limiting') });
    const { RpcError } = await import('@/lib/server/rwa/rpc');
    d.chain.latestBlockhash.mockRejectedValueOnce(new RpcError('timeout', 'slow'));
    expect(await buildDeploy(request(), d)).toMatchObject({ state: 'unavailable' });
  });

  it('rejects amounts outside the limits without reading the chain', async () => {
    const d = deps();
    for (const amount of ['0.5', '25000.000001', '1.1234567', 'ten']) expect(await buildDeploy(request({ amount }), d)).toMatchObject({ state: 'invalid' });
    expect(d.chain.accounts).not.toHaveBeenCalled();
  });
});

describe('deploy display helpers', () => {
  it('rounds SOL costs up and never rounds token amounts up', async () => {
    const { formatSol, formatUnits, parseUsdc, formatPrice } = await import('@/lib/rwa/deploy');
    expect([formatSol('41899840'), formatSol('1488440'), formatSol('59419'), formatSol('0'), formatSol('50000')]).toEqual(['0.0419', '0.00149', '0.00006', '0', '0.00005']);
    expect([formatUnits('4309498', 6), formatUnits('1234567891', 6, 2), formatUnits('682916', 8)]).toEqual(['4.309498', '1,234.56', '0.00682916']);
    expect([parseUsdc('10'), parseUsdc('0.000001'), parseUsdc('25000.5'), parseUsdc('1.1234567'), parseUsdc('1e3'), parseUsdc('')]).toEqual([10_000_000n, 1n, 25_000_500_000n, null, null, null]);
    expect([formatPrice(724.2816), formatPrice(1.144872), formatPrice(0.0123456), formatPrice(0)]).toEqual(['724.28', '1.1449', '0.012346', 'Unavailable']);
  });
});
