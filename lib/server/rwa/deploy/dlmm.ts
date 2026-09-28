import 'server-only';
import {
  AccountRole, address, fixEncoderSize, getAddressDecoder, getAddressEncoder, getArrayEncoder, getBytesEncoder, getI32Encoder, getI64Encoder,
  getProgramDerivedAddress, getStructEncoder, getU64Encoder, getU8Encoder, type Address, type Instruction,
} from '@solana/kit';

/**
 * Meteora DLMM (program LBUZKhRx…, IDL 0.12.0), hand-encoded so the app needs
 * no Anchor or web3.js dependency. Layouts and discriminators come from the
 * published IDL; tests pin every byte against the official SDK's output.
 */
export const DLMM_PROGRAM = address('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
export const RENT_SYSVAR = address('SysvarRent111111111111111111111111111111111');
export const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const BINS_PER_ARRAY = 70;
/** Bin arrays inside [-512, 511] are tracked by the pair itself; beyond, by a bitmap extension account. */
const INTERNAL_BITMAP_HALF = 512;
export const LB_PAIR_SIZE = 904;
/** 8-byte discriminator + PositionV2 (70 bins). */
export const POSITION_SIZE = 8120;
/** 8-byte discriminator + BinArray header (48) + 70 bins of 144 bytes. */
export const BIN_ARRAY_SIZE = 10_136;

const DISCRIMINATORS = {
  lbPair: [33, 11, 49, 98, 181, 101, 177, 13],
  positionV2: [117, 176, 212, 199, 245, 180, 133, 182],
  binArray: [92, 142, 92, 220, 5, 148, 70, 181],
  initializePositionPda: [46, 82, 125, 146, 85, 141, 228, 153],
  initializeBinArray: [35, 86, 19, 185, 78, 212, 75, 211],
  addLiquidityByStrategy2: [3, 221, 149, 218, 111, 141, 118, 213],
} as const;
/** StrategyType::SpotImBalanced — what the SDK sends for its Spot strategy. */
const SPOT_IMBALANCED = 6;
/** RemainingAccountsInfo slices, as the SDK always sends them: X hooks, then Y hooks. */
const TRANSFER_HOOK_X = 0;
const TRANSFER_HOOK_Y = 1;

const hasPrefix = (bytes: Uint8Array, prefix: readonly number[]) => bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
const addressAt = (bytes: Uint8Array, offset: number) => getAddressDecoder().decode(bytes.subarray(offset, offset + 32));

export interface LbPair {
  activeId: number;
  binStep: number;
  /** 0 enabled, 1 disabled. */
  status: number;
  minBinId: number;
  maxBinId: number;
  tokenXMint: Address;
  tokenYMint: Address;
  reserveX: Address;
  reserveY: Address;
  tokenXProgram: Address;
  tokenYProgram: Address;
}

function programForFlag(flag: number): Address {
  if (flag === 0) return TOKEN_PROGRAM;
  if (flag === 1) return TOKEN_2022_PROGRAM;
  throw new Error('Unknown token program flag.');
}

/** Returns null for anything that is not a DLMM LbPair account. */
export function decodeLbPair(bytes: Uint8Array): LbPair | null {
  if (bytes.length !== LB_PAIR_SIZE || !hasPrefix(bytes, DISCRIMINATORS.lbPair)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    return {
      minBinId: view.getInt32(24, true),
      maxBinId: view.getInt32(28, true),
      activeId: view.getInt32(76, true),
      binStep: view.getUint16(80, true),
      status: bytes[82],
      tokenXMint: addressAt(bytes, 88),
      tokenYMint: addressAt(bytes, 120),
      reserveX: addressAt(bytes, 152),
      reserveY: addressAt(bytes, 184),
      tokenXProgram: programForFlag(bytes[880]),
      tokenYProgram: programForFlag(bytes[881]),
    };
  } catch { return null; }
}

/** The pair and owner a PositionV2 account records, or null for anything else. */
export function decodePositionOwner(bytes: Uint8Array): { lbPair: Address; owner: Address } | null {
  if (bytes.length !== POSITION_SIZE || !hasPrefix(bytes, DISCRIMINATORS.positionV2)) return null;
  return { lbPair: addressAt(bytes, 8), owner: addressAt(bytes, 40) };
}

export function isBinArray(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, DISCRIMINATORS.binArray);
}

/** Floor division: bin -1 lives in array -1, bin -70 in array -1, bin -71 in array -2. */
export function binArrayIndex(binId: number): number {
  return Math.floor(binId / BINS_PER_ARRAY);
}

export function needsBitmapExtension(index: number): boolean {
  return index < -INTERNAL_BITMAP_HALF || index > INTERNAL_BITMAP_HALF - 1;
}

const addressEncoder = getAddressEncoder();
const seed = (text: string) => new TextEncoder().encode(text);

export async function positionAddress(lbPair: Address, base: Address, lowerBinId: number, width: number): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: DLMM_PROGRAM, seeds: [seed('position'), addressEncoder.encode(lbPair), addressEncoder.encode(base), getI32Encoder().encode(lowerBinId), getI32Encoder().encode(width)] });
  return pda;
}
export async function binArrayAddress(lbPair: Address, index: number): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: DLMM_PROGRAM, seeds: [seed('bin_array'), addressEncoder.encode(lbPair), getI64Encoder().encode(BigInt(index))] });
  return pda;
}
export async function bitmapExtensionAddress(lbPair: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: DLMM_PROGRAM, seeds: [seed('bitmap'), addressEncoder.encode(lbPair)] });
  return pda;
}
export async function eventAuthorityAddress(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: DLMM_PROGRAM, seeds: [seed('__event_authority')] });
  return pda;
}

/** Price of token X in token Y at a bin, in UI units. Display only; never used for amounts. */
export function binPrice(binId: number, binStep: number, decimalsX: number, decimalsY: number): number {
  return Math.pow(1 + binStep / 10_000, binId) * Math.pow(10, decimalsX - decimalsY);
}

const concat = (...parts: readonly Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

export function initializePositionPdaInstruction(input: { owner: Address; position: Address; lbPair: Address; lowerBinId: number; width: number; eventAuthority: Address }): Instruction {
  return {
    programAddress: DLMM_PROGRAM,
    accounts: [
      { address: input.owner, role: AccountRole.WRITABLE_SIGNER }, // payer
      { address: input.owner, role: AccountRole.READONLY_SIGNER }, // base
      { address: input.position, role: AccountRole.WRITABLE },
      { address: input.lbPair, role: AccountRole.READONLY },
      { address: input.owner, role: AccountRole.READONLY_SIGNER }, // owner
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: RENT_SYSVAR, role: AccountRole.READONLY },
      { address: input.eventAuthority, role: AccountRole.READONLY },
      { address: DLMM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: concat(Uint8Array.from(DISCRIMINATORS.initializePositionPda), getI32Encoder().encode(input.lowerBinId) as Uint8Array, getI32Encoder().encode(input.width) as Uint8Array),
  };
}

export function initializeBinArrayInstruction(input: { lbPair: Address; binArray: Address; funder: Address; index: number }): Instruction {
  return {
    programAddress: DLMM_PROGRAM,
    accounts: [
      { address: input.lbPair, role: AccountRole.READONLY },
      { address: input.binArray, role: AccountRole.WRITABLE },
      { address: input.funder, role: AccountRole.WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: concat(Uint8Array.from(DISCRIMINATORS.initializeBinArray), getI64Encoder().encode(BigInt(input.index)) as Uint8Array),
  };
}

const liquidityParameterEncoder = getStructEncoder([
  ['amountX', getU64Encoder()],
  ['amountY', getU64Encoder()],
  ['activeId', getI32Encoder()],
  ['maxActiveBinSlippage', getI32Encoder()],
  ['minBinId', getI32Encoder()],
  ['maxBinId', getI32Encoder()],
  ['strategyType', getU8Encoder()],
  ['parameteres', fixEncoderSize(getBytesEncoder(), 64)],
]);
const remainingAccountsInfoEncoder = getArrayEncoder(getStructEncoder([['accountsType', getU8Encoder()], ['length', getU8Encoder()]]));

export interface AddLiquidityInput {
  position: Address;
  lbPair: LbPair & { address: Address };
  bitmapExtension: Address | null;
  userTokenX: Address;
  userTokenY: Address;
  sender: Address;
  eventAuthority: Address;
  amountX: bigint;
  amountY: bigint;
  activeId: number;
  maxActiveBinSlippage: number;
  minBinId: number;
  maxBinId: number;
  binArrays: readonly Address[];
}

/** Spot liquidity across [minBinId, maxBinId]. No transfer-hook accounts: hooked mints are refused before this point. */
export function addLiquidityByStrategy2Instruction(input: AddLiquidityInput): Instruction {
  const pair = input.lbPair;
  const parameters = new Uint8Array(64); // parameteres[0] = 0: favour neither side as single-sided X.
  return {
    programAddress: DLMM_PROGRAM,
    accounts: [
      { address: input.position, role: AccountRole.WRITABLE },
      { address: pair.address, role: AccountRole.WRITABLE },
      input.bitmapExtension ? { address: input.bitmapExtension, role: AccountRole.WRITABLE } : { address: DLMM_PROGRAM, role: AccountRole.READONLY },
      { address: input.userTokenX, role: AccountRole.WRITABLE },
      { address: input.userTokenY, role: AccountRole.WRITABLE },
      { address: pair.reserveX, role: AccountRole.WRITABLE },
      { address: pair.reserveY, role: AccountRole.WRITABLE },
      { address: pair.tokenXMint, role: AccountRole.READONLY },
      { address: pair.tokenYMint, role: AccountRole.READONLY },
      { address: input.sender, role: AccountRole.READONLY_SIGNER },
      { address: pair.tokenXProgram, role: AccountRole.READONLY },
      { address: pair.tokenYProgram, role: AccountRole.READONLY },
      { address: input.eventAuthority, role: AccountRole.READONLY },
      { address: DLMM_PROGRAM, role: AccountRole.READONLY },
      ...input.binArrays.map(binArray => ({ address: binArray, role: AccountRole.WRITABLE })),
    ],
    data: concat(
      Uint8Array.from(DISCRIMINATORS.addLiquidityByStrategy2),
      liquidityParameterEncoder.encode({
        amountX: input.amountX, amountY: input.amountY, activeId: input.activeId, maxActiveBinSlippage: input.maxActiveBinSlippage,
        minBinId: input.minBinId, maxBinId: input.maxBinId, strategyType: SPOT_IMBALANCED, parameteres: parameters,
      }) as Uint8Array,
      remainingAccountsInfoEncoder.encode([{ accountsType: TRANSFER_HOOK_X, length: 0 }, { accountsType: TRANSFER_HOOK_Y, length: 0 }]) as Uint8Array,
    ),
  };
}

/** Named DLMM errors a deploy can plausibly hit, from the IDL. */
export const DLMM_ERRORS: Readonly<Record<number, string>> = {
  6003: 'ExceededAmountSlippageTolerance', 6004: 'ExceededBinSlippageTolerance', 6007: 'ZeroLiquidity', 6008: 'InvalidPosition',
  6009: 'BinArrayNotFound', 6010: 'InvalidTokenMint', 6027: 'InvalidBinArray', 6028: 'NonContinuousBinArrays', 6040: 'InvalidPositionWidth',
  6042: 'PoolDisabled', 6054: 'InvalidStrategyParameters', 6074: 'InsufficientRemainingAccounts', 6075: 'InvalidRemainingAccountSlice',
  6088: 'InvalidPositionOwner', 6100: 'CpiDisabled',
};
