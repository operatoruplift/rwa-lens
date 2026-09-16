import { amountToUiAmountForScaledUiAmountMintWithoutSimulation } from '@solana-program/token-2022';
import { findExtension } from './extensions';
import type { DisplayBalance, RawBalance } from './types';

/**
 * Scaled UI Amount accounting.
 *
 * Token-2022 stores raw base units. A ScaledUiAmountConfig changes only how
 * those units are *displayed*, by an issuer-controlled multiplier that can be
 * scheduled to change at a timestamp. Yield therefore arrives without any
 * transfer, and a naive wallet shows the wrong number.
 *
 * Two rules hold everywhere below:
 *   1. Raw amounts are summed as integers first, then converted exactly once.
 *   2. The official helper is floating-point, so its output is labelled
 *      `official-helper` and never described as exact.
 */

type ScaledConfig = {
  __kind: 'ScaledUiAmountConfig';
  multiplier: number;
  newMultiplier: number;
  newMultiplierEffectiveTimestamp: bigint | number;
};

/** Exact base-unit → decimal conversion with no float anywhere. */
export function exactUiAmount(rawAmount: string, decimals: number): string {
  if (!/^\d+$/.test(rawAmount)) throw new Error('Raw amount must be a non-negative integer string.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
    throw new Error('Decimals must be an integer between 0 and 20.');
  }
  const raw = BigInt(rawAmount);
  if (decimals === 0) return raw.toString();
  const factor = 10n ** BigInt(decimals);
  const whole = raw / factor;
  const fraction = (raw % factor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function sumRawAmounts(accounts: Pick<RawBalance, 'rawAmount'>[]): string {
  return accounts.reduce((total, account) => total + BigInt(account.rawAmount), 0n).toString();
}

function toSeconds(value: bigint | number | undefined): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return null;
}

export type MultiplierSelection = {
  multiplier: number;
  pendingMultiplier?: number;
  effectiveAt?: string;
  boundary: 'before' | 'at' | 'after' | 'none';
};

/**
 * Picks the multiplier that is actually in force at `observedSeconds`.
 *
 * `newMultiplierEffectiveTimestamp` of 0 means nothing is scheduled. At or past
 * the boundary the new multiplier is the live one — "at" is not "before".
 */
export function selectMultiplier(config: ScaledConfig, observedSeconds: bigint | null): MultiplierSelection {
  const effective = toSeconds(config.newMultiplierEffectiveTimestamp);
  if (effective === null || effective === 0n) {
    return { multiplier: config.multiplier, boundary: 'none' };
  }
  const effectiveAt = new Date(Number(effective) * 1000).toISOString();
  if (observedSeconds === null) {
    // Without an observed time we must not guess which side of the boundary we are on.
    return {
      multiplier: config.multiplier,
      pendingMultiplier: config.newMultiplier,
      effectiveAt,
      boundary: 'before',
    };
  }
  if (observedSeconds < effective) {
    return {
      multiplier: config.multiplier,
      pendingMultiplier: config.newMultiplier,
      effectiveAt,
      boundary: 'before',
    };
  }
  return {
    multiplier: config.newMultiplier,
    pendingMultiplier: config.newMultiplier,
    effectiveAt,
    boundary: observedSeconds === effective ? 'at' : 'after',
  };
}

export type BuildDisplayInput = {
  totalRawAmount: string;
  decimals: number;
  mintExtensions: unknown;
  /** Chain block time in seconds, or null when it could not be observed. */
  observedSeconds: bigint | null;
};

export function buildDisplayBalance(input: BuildDisplayInput): DisplayBalance {
  const { totalRawAmount, decimals, mintExtensions, observedSeconds } = input;

  let standardUiAmount: string | undefined;
  try {
    standardUiAmount = exactUiAmount(totalRawAmount, decimals);
  } catch {
    return { rawAmount: totalRawAmount, rounding: 'unavailable', note: 'The raw amount could not be interpreted.' };
  }

  const config = findExtension<ScaledConfig>(mintExtensions, 'ScaledUiAmountConfig');
  if (!config) {
    return {
      rawAmount: totalRawAmount,
      standardUiAmount,
      boundary: 'none',
      rounding: 'exact-decimal',
      note: 'No Scaled UI Amount extension. The displayed amount is the raw amount divided by 10^decimals, computed exactly.',
    };
  }

  const selection = selectMultiplier(config, observedSeconds);

  let extensionUiAmount: string | undefined;
  let rounding: DisplayBalance['rounding'] = 'official-helper';
  let note =
    'Converted with the official Token-2022 display helper, which uses floating-point arithmetic. Treat the displayed value as a display amount, not an exact accounting figure. The raw base units above are exact.';

  if (selection.multiplier === 1) {
    // A multiplier of exactly 1 is representable, so the exact path is honest here.
    extensionUiAmount = standardUiAmount;
    rounding = 'exact-decimal';
    note = 'The multiplier is exactly 1, so the scaled amount equals the exact decimal amount.';
  } else {
    try {
      extensionUiAmount = amountToUiAmountForScaledUiAmountMintWithoutSimulation(
        BigInt(totalRawAmount),
        decimals,
        selection.multiplier,
      );
    } catch {
      extensionUiAmount = undefined;
      rounding = 'unavailable';
      note = 'The official conversion helper could not produce a value for this amount and multiplier.';
    }
  }

  return {
    rawAmount: totalRawAmount,
    standardUiAmount,
    extensionUiAmount,
    multiplier: String(selection.multiplier),
    pendingMultiplier: selection.pendingMultiplier === undefined ? undefined : String(selection.pendingMultiplier),
    effectiveAt: selection.effectiveAt,
    boundary: selection.boundary,
    rounding,
    note,
  };
}
