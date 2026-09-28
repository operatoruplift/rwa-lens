import { describe, expect, it } from 'vitest';
import { AccountRole, address, type Instruction } from '@solana/kit';
import golden from './fixtures/dlmm-golden.json';
import {
  addLiquidityByStrategy2Instruction, binArrayAddress, binArrayIndex, binPrice, bitmapExtensionAddress, decodeLbPair, decodePositionOwner,
  eventAuthorityAddress, initializeBinArrayInstruction, initializePositionPdaInstruction, needsBitmapExtension, positionAddress, POSITION_SIZE,
} from '@/lib/server/rwa/deploy/dlmm';

const pool = address(golden.pool);
const owner = address(golden.owner);
const lbPairBytes = Uint8Array.from(Buffer.from(golden.lbPairBase64, 'base64'));

/** The SDK's web3.js shape: [pubkey, isSigner, isWritable]. */
function asSdk(instruction: Instruction) {
  const signer = (role: AccountRole) => role === AccountRole.READONLY_SIGNER || role === AccountRole.WRITABLE_SIGNER;
  const writable = (role: AccountRole) => role === AccountRole.WRITABLE || role === AccountRole.WRITABLE_SIGNER;
  return {
    programId: instruction.programAddress,
    keys: (instruction.accounts ?? []).map(meta => [meta.address, signer(meta.role), writable(meta.role)]),
    data: Buffer.from(instruction.data ?? []).toString('base64'),
  };
}

describe('Meteora DLMM encoding matches the official SDK', () => {
  it('decodes the live USDY-USDC pair', () => {
    expect(decodeLbPair(lbPairBytes)).toEqual({
      minBinId: expect.any(Number), maxBinId: expect.any(Number), activeId: 1353, binStep: 1, status: 0,
      tokenXMint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6', tokenYMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      reserveX: '6SpQEBmwxwBh5FxhdCHkCKnQnDpAvJYAv993Bp8LiaEn', reserveY: 'GuBQaPTV9Cu5KzKfHkVLSh3bXc1z3BShXefQG7e2V5R3',
      tokenXProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', tokenYProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });
    const pair = decodeLbPair(lbPairBytes)!;
    expect(pair.minBinId).toBeLessThan(pair.activeId);
    expect(pair.maxBinId).toBeGreaterThan(pair.activeId);
  });

  it('refuses bytes that are not an LbPair or a position', () => {
    expect(decodeLbPair(lbPairBytes.subarray(0, 903))).toBeNull();
    const wrong = lbPairBytes.slice(); wrong[0] ^= 1;
    expect(decodeLbPair(wrong)).toBeNull();
    const badFlag = lbPairBytes.slice(); badFlag[880] = 7;
    expect(decodeLbPair(badFlag)).toBeNull();
    expect(decodePositionOwner(lbPairBytes)).toBeNull();
    const position = new Uint8Array(POSITION_SIZE);
    position.set([117, 176, 212, 199, 245, 180, 133, 182]);
    position.set(lbPairBytes.subarray(88, 120), 8);
    position.set(lbPairBytes.subarray(120, 152), 40);
    // Any two known addresses stand in for the recorded pair and owner.
    expect(decodePositionOwner(position)).toEqual({ lbPair: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6', owner: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' });
  });

  it('derives the same PDAs, including negative bins and arrays', async () => {
    expect(await eventAuthorityAddress()).toBe(golden.eventAuthority);
    expect(await bitmapExtensionAddress(pool)).toBe(golden.bitmap);
    for (const [lower, width, expected] of golden.positions as [number, number, string][]) expect(await positionAddress(pool, owner, lower, width)).toBe(expected);
    for (const [index, expected] of golden.binArrays as [number, string][]) expect(await binArrayAddress(pool, index)).toBe(expected);
  });

  it('floors bin array indexes and knows when the bitmap extension is needed', () => {
    expect([0, 69, 70, 1319, 1387, -1, -70, -71].map(binArrayIndex)).toEqual([0, 0, 1, 18, 19, -1, -1, -2]);
    expect([511, -512].map(needsBitmapExtension)).toEqual([false, false]);
    expect([512, -513].map(needsBitmapExtension)).toEqual([true, true]);
  });

  it('encodes initialize_position_pda and initialize_bin_array byte for byte', async () => {
    const eventAuthority = await eventAuthorityAddress();
    const position = address(golden.positions[0][2] as string);
    expect(asSdk(initializePositionPdaInstruction({ owner, position, lbPair: pool, lowerBinId: 1319, width: 69, eventAuthority }))).toEqual(golden.initPda);
    const binArray = address(golden.binArrays[3][1] as string);
    expect(asSdk(initializeBinArrayInstruction({ lbPair: pool, binArray, funder: owner, index: -2 }))).toEqual(golden.initBinArray);
  });

  it('encodes add_liquidity_by_strategy2 byte for byte, with and without the bitmap extension', async () => {
    const pair = { ...decodeLbPair(lbPairBytes)!, address: pool };
    const input = {
      position: address(golden.positions[0][2] as string), lbPair: pair, bitmapExtension: null,
      userTokenX: address(golden.userTokenX), userTokenY: address(golden.userTokenY), sender: owner, eventAuthority: await eventAuthorityAddress(),
      amountX: 4_331_280n, amountY: 5_000_000n, activeId: 1353, maxActiveBinSlippage: 50, minBinId: 1319, maxBinId: 1387,
      binArrays: [await binArrayAddress(pool, 18), await binArrayAddress(pool, 19)],
    };
    expect(asSdk(addLiquidityByStrategy2Instruction(input))).toEqual(golden.addLiquidity);
    expect(asSdk(addLiquidityByStrategy2Instruction({ ...input, bitmapExtension: await bitmapExtensionAddress(pool) }))).toEqual(golden.addLiquidityWithBitmap);
  });

  it('prices bins from the bin step and the decimals difference', () => {
    expect(binPrice(0, 25, 6, 6)).toBe(1);
    expect(binPrice(1353, 1, 6, 6)).toBeCloseTo(1.144872, 5);
    expect(binPrice(-100, 100, 9, 6)).toBeCloseTo(1000 * Math.pow(1.01, -100), 6);
  });
});
