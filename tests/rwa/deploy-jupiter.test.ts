import { afterEach, describe, expect, it, vi } from 'vitest';
import { address } from '@solana/kit';
import { acceptSwapInstructions, createJupiter, JupiterError, type ExpectedAccounts, type JupiterQuote } from '@/lib/server/rwa/deploy/jupiter';
import { explainSimulationFailure } from '@/lib/server/rwa/deploy/failures';
import { readDeployStatus } from '@/lib/server/rwa/deploy/status';
import type { DeployChain } from '@/lib/server/rwa/deploy/chain';

const OWNER = address('H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS');
const OTHER = 'AGXrswVDRoUf62UX9voTXv6TCGw6fBUEwDpyUd9YdZfD';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDY = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const JUP = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM = '11111111111111111111111111111111';
const USDC_ACCOUNT = '7dQmths1cyCQ4xaC5KcVfXz4BvVWtnHc3hcgnfnE1PBx';
const USDY_ACCOUNT = '8FZ5RyL7xwtg4vEjdYWr9NZw7qUsdMKX5sCfkqEFdN5W';
const EXPECTED: ExpectedAccounts = { owner: OWNER, mint: address(USDY), tokenProgram: address(TOKEN), usdcAccount: address(USDC_ACCOUNT), tokenAccount: address(USDY_ACCOUNT) };
type Meta = { pubkey: string; isSigner: boolean; isWritable: boolean };
const meta = (pubkey: string, isSigner = false, isWritable = false): Meta => ({ pubkey, isSigner, isWritable });
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
/** CreateIdempotent for the wallet's USDY account, exactly as Jupiter sends it. */
const createAta = (account = USDY_ACCOUNT, mint = USDY, data = [1]) => ({ programId: ATA, accounts: [meta(OWNER, true, true), meta(account, false, true), meta(OWNER), meta(mint), meta(SYSTEM), meta(TOKEN)], data: b64(data) });
const swap = (accounts: Meta[] = [meta(TOKEN), meta(OWNER, true), meta(USDC_ACCOUNT, false, true), meta(USDY_ACCOUNT, false, true), meta(OTHER, false, true)]) => ({ programId: JUP, accounts, data: b64([229, 23, 203, 151, 122, 227, 173, 42]) });
const body = (over: Record<string, unknown> = {}) => ({ tokenLedgerInstruction: null, computeBudgetInstructions: [{ programId: 'ComputeBudget111111111111111111111111111111', accounts: [], data: b64([2, 0, 0, 0, 0]) }], setupInstructions: [createAta()], swapInstruction: swap(), cleanupInstruction: null, otherInstructions: [], addressLookupTableAddresses: ['5DzMTjeaEg2i1xKDde3wV1BKdetw68ZoKddiwfQK7x9K'], prioritizationFeeLamports: 0, ...over });
const quote: JupiterQuote = { inputMint: USDC, outputMint: USDY, inAmount: '5000000', outAmount: '4353028', otherAmountThreshold: '4309498', swapMode: 'ExactIn', slippageBps: 100, priceImpactPct: '0', routePlan: [{ swapInfo: { ammKey: OTHER, label: 'Whirlpool', inputMint: USDC, outputMint: USDY }, percent: 100 }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllEnvs(); });

describe('Jupiter instructions are accepted only in a narrow shape', () => {
  it('keeps account creation and the swap, drops Jupiter’s compute budget and returns the lookup tables', () => {
    const plan = acceptSwapInstructions(body({ setupInstructions: [createAta(USDC_ACCOUNT, USDC, [0]), createAta()] }), EXPECTED);
    expect(plan.instructions.map(instruction => instruction.programAddress)).toEqual([ATA, ATA, JUP]);
    expect(plan.lookupTables).toEqual(['5DzMTjeaEg2i1xKDde3wV1BKdetw68ZoKddiwfQK7x9K']);
  });
  it.each([
    ['a token transfer smuggled into setup', body({ setupInstructions: [{ programId: TOKEN, accounts: [meta(USDC_ACCOUNT, false, true), meta(OTHER, false, true), meta(OWNER, true)], data: b64([3, 0, 225, 245, 5, 0, 0, 0, 0]) }] })],
    ['a SOL transfer smuggled into setup', body({ setupInstructions: [{ programId: SYSTEM, accounts: [meta(OWNER, true, true), meta(OTHER, false, true)], data: b64([2, 0, 0, 0, 0, 202, 154, 59, 0, 0, 0, 0]) }] })],
    ['creating an account the deploy does not use', body({ setupInstructions: [createAta(OTHER)] })],
    ['creating the right account for the wrong mint', body({ setupInstructions: [createAta(USDY_ACCOUNT, USDC)] })],
    ['an ATA instruction other than create', body({ setupInstructions: [createAta(USDY_ACCOUNT, USDY, [2])] })],
    ['any cleanup step', body({ cleanupInstruction: { programId: TOKEN, accounts: [meta(USDY_ACCOUNT, false, true), meta(OWNER, false, true), meta(OWNER, true)], data: b64([9]) } })],
    ['a swap outside Jupiter’s program', body({ swapInstruction: { ...swap(), programId: OTHER } })],
    ['a swap that never touches the wallet’s token account', body({ swapInstruction: swap([meta(TOKEN), meta(OWNER, true), meta(USDC_ACCOUNT, false, true), meta(OTHER, false, true)]) })],
    ['a second signer', body({ swapInstruction: swap([meta(OWNER, true), meta(OTHER, true), meta(USDC_ACCOUNT, false, true), meta(USDY_ACCOUNT, false, true)]) })],
    ['instructions built for another wallet', body({ setupInstructions: [], swapInstruction: swap([meta(OTHER, true), meta(USDC_ACCOUNT, false, true), meta(USDY_ACCOUNT, false, true)]) })],
    ['extra instructions such as tips', body({ otherInstructions: [{ programId: SYSTEM, accounts: [], data: '' }] })],
    ['Jupiter’s own failed simulation', body({ simulationError: { errorCode: 'INSUFFICIENT_FUNDS' } })],
    ['a malformed body', { swapInstruction: 'nope' }],
  ])('rejects %s', (_label, value) => {
    expect(() => acceptSwapInstructions(value, EXPECTED)).toThrow(JupiterError);
  });
});

describe('Jupiter client', () => {
  it('uses the free host without a key and the keyed host with one', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(quote));
    await createJupiter(fetcher).quote({ inputMint: USDC, outputMint: USDY, amount: 5_000_000n, slippageBps: 100, maxAccounts: 40 });
    expect(String(fetcher.mock.calls[0][0])).toMatch(/^https:\/\/lite-api\.jup\.ag\/swap\/v1\/quote\?.*maxAccounts=40/);
    vi.stubEnv('JUPITER_API_KEY', 'test-key');
    await createJupiter(fetcher).quote({ inputMint: USDC, outputMint: USDY, amount: 5_000_000n, slippageBps: 100, maxAccounts: 40 });
    const [url, init] = fetcher.mock.calls[1];
    expect(String(url)).toMatch(/^https:\/\/api\.jup\.ag\//);
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect(init?.redirect).toBe('error');
  });
  it('refuses a quote that does not answer the question asked', async () => {
    const client = (value: unknown, status = 200) => createJupiter((async () => json(value, status)) as typeof fetch);
    const ask = { inputMint: USDC, outputMint: USDY, amount: 5_000_000n, slippageBps: 100, maxAccounts: 40 };
    await expect(client({ ...quote, inAmount: '4000000' }).quote(ask)).rejects.toMatchObject({ kind: 'rejected' });
    await expect(client({ ...quote, otherAmountThreshold: '5000000' }).quote(ask)).rejects.toMatchObject({ kind: 'rejected' });
    await expect(client({ ...quote, swapMode: 'ExactOut' }).quote(ask)).rejects.toMatchObject({ kind: 'rejected' });
    await expect(client({ error: 'slow down' }, 429).quote(ask)).rejects.toMatchObject({ kind: 'rate-limited' });
    await expect(client({ errorCode: 'COULD_NOT_FIND_ANY_ROUTE' }, 400).quote(ask)).rejects.toMatchObject({ kind: 'no-route' });
    await expect(client({}, 500).quote(ask)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(createJupiter((async () => { throw new TypeError('offline'); }) as typeof fetch).quote(ask)).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('asks for instructions without SOL wrapping and validates them for the wallet', async () => {
    const fetcher = vi.fn(async () => json(body()));
    const plan = await createJupiter(fetcher as typeof fetch).swapInstructions(quote, EXPECTED);
    expect(plan.instructions).toHaveLength(2);
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).toEqual({ quoteResponse: quote, userPublicKey: OWNER, wrapAndUnwrapSol: false, dynamicComputeUnitLimit: false });
  });
});

describe('simulation failures read as next steps', () => {
  const programs = ['ComputeBudget111111111111111111111111111111', 'ComputeBudget111111111111111111111111111111', ATA, JUP, 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'];
  it.each([
    ['fee payer short of SOL', 'InsufficientFundsForFee', [], /more SOL/],
    ['token balance short', { InstructionError: [3, { Custom: 1 }] }, ['Program log: Error: insufficient funds'], /does not hold enough/],
    ['rent short', { InstructionError: [2, { Custom: 1 }] }, ['Transfer: insufficient lamports 10, need 2039280'], /more SOL/],
    ['Jupiter slippage (bigint codes)', { InstructionError: [3n, { Custom: 6001n }] }, [], /slippage/],
    ['DLMM bin slippage', { InstructionError: [4, { Custom: 6004 }] }, [], /pool’s price moved/],
    ['other DLMM error', { InstructionError: [4, { Custom: 6054 }] }, [], /InvalidStrategyParameters/],
    ['out-of-range index', { InstructionError: [9, 'InvalidAccountData'] }, [], /unknown step/],
    ['expired blockhash', 'BlockhashNotFound', [], /Build the deploy again/],
  ])('%s', (_label, err, logs, expected) => {
    expect(explainSimulationFailure(err, logs as string[], programs)).toMatch(expected);
  });
});

describe('confirmation', () => {
  const chain = (status: Awaited<ReturnType<DeployChain['signatureStatus']>> | Error, height = 10n) => ({
    signatureStatus: vi.fn(async () => { if (status instanceof Error) throw status; return status; }),
    blockHeight: vi.fn(async () => height),
  }) as unknown as DeployChain;
  it('requires an error-free confirmed status, and expires only past the last valid height', async () => {
    expect(await readDeployStatus(chain({ slot: 9n, failed: false, confirmationStatus: 'confirmed' }), 'sig', 100n)).toEqual({ state: 'confirmed', slot: '9' });
    expect(await readDeployStatus(chain({ slot: 9n, failed: false, confirmationStatus: 'finalized' }), 'sig', 100n)).toEqual({ state: 'finalized', slot: '9' });
    expect(await readDeployStatus(chain({ slot: 9n, failed: true, confirmationStatus: 'confirmed' }), 'sig', 100n)).toEqual({ state: 'pending' });
    expect(await readDeployStatus(chain({ slot: 9n, failed: true, confirmationStatus: 'finalized' }), 'sig', 100n)).toMatchObject({ state: 'failed' });
    expect(await readDeployStatus(chain({ slot: 9n, failed: false, confirmationStatus: 'processed' }), 'sig', 100n)).toEqual({ state: 'pending' });
    expect(await readDeployStatus(chain(null, 100n), 'sig', 100n)).toEqual({ state: 'pending' });
    expect(await readDeployStatus(chain(null, 101n), 'sig', 100n)).toEqual({ state: 'expired' });
    expect(await readDeployStatus(chain(new Error('down')), 'sig', 100n)).toMatchObject({ state: 'unavailable' });
  });
  it('keeps a processed error pending until its fork reaches confirmation', async () => {
    const pending = chain({ slot: 9n, failed: true, confirmationStatus: 'processed' }, 101n);
    expect(await readDeployStatus(pending, 'sig', 100n)).toEqual({ state: 'pending' });
    expect(pending.blockHeight).not.toHaveBeenCalled();
  });
  it.each([
    ['confirmed', { slot: 100n, failed: false, confirmationStatus: 'confirmed' }, { state: 'confirmed', slot: '100' }],
    ['finalized', { slot: 100n, failed: false, confirmationStatus: 'finalized' }, { state: 'finalized', slot: '100' }],
    ['failed', { slot: 100n, failed: true, confirmationStatus: 'finalized' }, { state: 'failed' }],
    ['processed', { slot: 100n, failed: false, confirmationStatus: 'processed' }, { state: 'pending' }],
    ['still absent', null, { state: 'expired' }],
  ])('rechecks a %s signature after observing expiry height', async (_label, lateStatus, expected) => {
    const pending = chain(null, 101n);
    vi.mocked(pending.blockHeight).mockImplementationOnce(async () => {
      // A last-valid-block transaction becomes visible during the height read.
      vi.mocked(pending.signatureStatus).mockResolvedValueOnce(lateStatus);
      return 101n;
    });
    expect(await readDeployStatus(pending, 'sig', 100n)).toMatchObject(expected);
    expect(pending.signatureStatus).toHaveBeenCalledTimes(2);
  });
  it('does not report expiry when its final signature lookup fails', async () => {
    const pending = chain(null, 101n);
    vi.mocked(pending.signatureStatus).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('RPC unavailable'));
    expect(await readDeployStatus(pending, 'sig', 100n)).toMatchObject({ state: 'unavailable' });
  });
});
