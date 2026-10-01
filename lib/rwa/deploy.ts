import { z } from 'zod';
import bs58 from 'bs58';
import { addressSchema } from './schema';
import { exactUiAmount } from './balance';
import { USDC_MINT_ADDRESS } from './venues';

/**
 * The optional deploy action: one wallet-signed transaction that swaps part of
 * a USDC budget into the inspected token through Jupiter and deposits both
 * tokens into a listed Meteora DLMM pool. Off unless the operator sets
 * RWA_DEPLOY_ENABLED. The server builds and simulates an unsigned
 * transaction; only the user's own wallet signs, and nothing here is part of
 * an inspection, an export or a saved report.
 */
export const USDC_MINT = USDC_MINT_ADDRESS;
export const USDC_DECIMALS = 6;
export const MIN_DEPLOY_USDC = 1;
export const MAX_DEPLOY_USDC = 25_000;
export const SLIPPAGE_CHOICES_BPS = [50, 100, 200] as const;
export type SlippageBps = (typeof SLIPPAGE_CHOICES_BPS)[number];
/** Bins either side of the active bin. 69 bins in all, Meteora's default Spot width. */
export const DEPLOY_HALF_WIDTH = 34;
/** A review is signable for this long; after that the quote must be rebuilt. */
export const QUOTE_TTL_MS = 45_000;
/** Above this the swap would move the market too far to call the deposit balanced. */
export const MAX_PRICE_IMPACT_PCT = 5;
/** Pool price and swap price further apart than this block the deploy; above the warning they are flagged. */
export const MAX_PRICE_GAP_PCT = 5;
export const WARN_PRICE_GAP_PCT = 1;

const usdcAmountText = z.string().trim().regex(/^\d{1,6}(\.\d{1,6})?$/, 'Enter a USDC amount with up to six decimals.');

/** Exact decimal text → base units, or null when it is not a USDC amount. */
export function parseUsdc(text: string): bigint | null {
  const parsed = usdcAmountText.safeParse(text);
  if (!parsed.success) return null;
  const [whole, fraction = ''] = parsed.data.split('.');
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fraction.padEnd(USDC_DECIMALS, '0'));
}

export function withinDeployLimits(raw: bigint): boolean {
  return raw >= BigInt(MIN_DEPLOY_USDC) * 10n ** BigInt(USDC_DECIMALS) && raw <= BigInt(MAX_DEPLOY_USDC) * 10n ** BigInt(USDC_DECIMALS);
}

export const deployRequestSchema = z.object({
  mint: addressSchema,
  pool: addressSchema,
  owner: addressSchema,
  amount: usdcAmountText,
  slippageBps: z.union(SLIPPAGE_CHOICES_BPS.map(value => z.literal(value)) as [z.ZodLiteral<50>, z.ZodLiteral<100>, z.ZodLiteral<200>]),
}).strict();
export type DeployRequest = z.infer<typeof deployRequestSchema>;

const digits = z.string().regex(/^\d{1,30}$/);
const finite = z.number().finite();
export const deploySummarySchema = z.object({
  pool: addressSchema,
  pair: z.string().max(120),
  tokenSymbol: z.string().max(40),
  tokenMint: addressSchema,
  tokenDecimals: z.number().int().min(0).max(18),
  owner: addressSchema,
  budgetRaw: digits,
  swap: z.object({
    inRaw: digits,
    quotedOutRaw: digits,
    minOutRaw: digits,
    venues: z.array(z.string().max(60)).max(8),
    priceImpactPct: finite,
    /** USDC per token implied by the quoted route. */
    price: finite,
  }),
  deposit: z.object({
    tokenRaw: digits,
    usdcRaw: digits,
    activeBinId: z.number().int(),
    lowerBinId: z.number().int(),
    upperBinId: z.number().int(),
    binStep: z.number().int().min(1).max(400),
    /** USDC per token at the active bin and at the range edges. */
    poolPrice: finite,
    minPrice: finite,
    maxPrice: finite,
    maxActiveBinSlippage: z.number().int().min(1),
  }),
  /** Percentage gap between the pool's active price and the swap's price. */
  priceGapPct: finite,
  position: z.object({ address: addressSchema, isNew: z.boolean() }),
  sol: z.object({
    /** Position rent, returned when the position is closed. */
    positionRentLamports: digits,
    /** New bin arrays and token accounts this transaction creates. */
    otherRentLamports: digits,
    networkFeeLamports: digits,
  }),
  newBinArrays: z.number().int().min(0).max(2),
});
export type DeploySummary = z.infer<typeof deploySummarySchema>;

export const deployResponseSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    /** Unsigned v0 transaction, base64 wire format. The user's wallet is its only signer. */
    transaction: z.string().min(100).max(2000),
    lastValidBlockHeight: digits,
    builtAt: z.string().datetime(),
    simulation: z.object({ unitsConsumed: z.number().int().min(0), computeUnitLimit: z.number().int().min(1), slot: digits }),
    summary: deploySummarySchema,
  }),
  z.object({ state: z.literal('refused'), code: z.string().max(40), message: z.string().max(400) }),
  z.object({ state: z.literal('unavailable'), message: z.string().max(400) }),
  z.object({ state: z.literal('invalid'), message: z.string().max(400) }),
]);
export type DeployResponse = z.infer<typeof deployResponseSchema>;

export const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
export const deployStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('confirmed'), slot: digits }),
  z.object({ state: z.literal('finalized'), slot: digits }),
  z.object({ state: z.literal('failed'), message: z.string().max(300) }),
  z.object({ state: z.literal('expired') }),
  z.object({ state: z.literal('unavailable'), message: z.string().max(300) }),
]);
export type DeployStatus = z.infer<typeof deployStatusSchema>;

/** Base units as exact decimal text, trimmed for display. Never a float. */
export function formatUnits(raw: string, decimals: number, maxFraction = decimals): string {
  const exact = exactUiAmount(raw, decimals);
  const [whole, fraction = ''] = exact.split('.');
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '');
  return `${BigInt(whole).toLocaleString('en-US')}${trimmed ? `.${trimmed}` : ''}`;
}

/** SOL costs round up at five decimals, so a displayed cost is never smaller than the real one. */
export function formatSol(lamports: string): string {
  const step = 10_000n;
  return formatUnits(((BigInt(lamports) + step - 1n) / step * step).toString(), 9, 5);
}

/** Display rounding for a price in USDC, scaled to its magnitude. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Unavailable';
  const digitsAfter = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', { minimumFractionDigits: digitsAfter, maximumFractionDigits: digitsAfter });
}

/**
 * The fee payer of a prepared v0 transaction, or null unless it has exactly
 * one required signature. The client checks this against the connected
 * wallet before asking it to sign anything.
 */
export function preparedFeePayer(base64: string): string | null {
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0)); } catch { return null; }
  const message = 1 + 64;
  // One signature slot; a v0 message (0x80) whose header requires exactly one signature; a one-byte key count.
  if (bytes.length < message + 5 + 32 || bytes[0] !== 1 || bytes[message] !== 0x80 || bytes[message + 1] !== 1) return null;
  const keys = bytes[message + 4];
  if (keys === 0 || keys > 127) return null;
  return bs58.encode(bytes.subarray(message + 5, message + 5 + 32));
}
