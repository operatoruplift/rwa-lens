import { amountToUiAmountForScaledUiAmountMintWithoutSimulation } from '@solana-program/token-2022';
import { EXTENSION_DEFINITIONS, findExtension } from './extensions';
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
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Decimals must be an integer between 0 and 255.');
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
  boundary: 'before' | 'at' | 'after' | 'none' | 'unknown';
};

/**
 * Picks the multiplier that is actually in force at `observedSeconds`.
 *
 * At or past the boundary the new multiplier is active, including timestamp 0
 * for an immediate update. The same selection is passed to the display helper.
 */
export function selectMultiplier(config: ScaledConfig, observedSeconds: bigint | null): MultiplierSelection {
  if (![config.multiplier, config.newMultiplier].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid multiplier.');
  const effective = toSeconds(config.newMultiplierEffectiveTimestamp);
  if (effective === null) throw new Error('Invalid effective timestamp.');
  const effectiveAt = new Date(Number(effective) * 1000).toISOString();
  if (observedSeconds === null) {
    // Without an observed time we must not guess which side of the boundary we are on.
    return {
      multiplier: config.multiplier,
      pendingMultiplier: config.newMultiplier,
      effectiveAt,
      boundary: 'unknown',
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
  /** Unknown account extensions may alter the interpretation of public units. */
  unknownAccountExtensions?: boolean;
  /** Observed Clock time, a labelled fallback estimate, or null if unavailable. */
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

  const unknownMintExtension = !Array.isArray(mintExtensions) || mintExtensions.some(extension => {
    if (!extension || typeof extension !== 'object' || typeof extension.__kind !== 'string') return true;
    return extension.__kind !== 'Uninitialized' && !Object.hasOwn(EXTENSION_DEFINITIONS, extension.__kind);
  });
  if (unknownMintExtension || input.unknownAccountExtensions) return {
    rawAmount: totalRawAmount, standardUiAmount, boundary: 'unknown', rounding: 'unavailable',
    note: 'An extension is unknown or could not be decoded, so extension-aware display conversion is unavailable. The standard decimal amount remains an exact representation of the observed public raw units.',
  };

  const config = findExtension<ScaledConfig>(mintExtensions, 'ScaledUiAmountConfig');
  const interest = findExtension(mintExtensions, 'InterestBearingConfig');
  if (interest) return {
    rawAmount: totalRawAmount, standardUiAmount, rounding: 'unavailable',
    note: config ? 'Scaled UI Amount and InterestBearingConfig are incompatible. Display conversion is unavailable.' : 'Interest-bearing display conversion is not supported by this release. Standard units are shown separately.',
  };
  if (!config) {
    return {
      rawAmount: totalRawAmount,
      standardUiAmount,
      boundary: 'none',
      rounding: 'exact-decimal',
      note: 'No Scaled UI Amount extension. The displayed amount is the raw amount divided by 10^decimals, computed exactly.',
    };
  }

  let selection: MultiplierSelection;
  try { selection = selectMultiplier(config, observedSeconds); } catch {
    return { rawAmount: totalRawAmount, standardUiAmount, rounding: 'unavailable', note: 'The multiplier or effective timestamp is invalid; no display conversion was performed.' };
  }
  if (selection.boundary === 'unknown') return {
    rawAmount: totalRawAmount, standardUiAmount, pendingMultiplier: String(selection.pendingMultiplier),
    effectiveAt: selection.effectiveAt, boundary: 'unknown', rounding: 'unavailable', note: 'No time was observed, so the active multiplier cannot be selected.',
  };

  let extensionUiAmount: string | undefined;
  let rounding: DisplayBalance['rounding'] = 'official-helper';
  let note =
    'Converted with the official Token-2022 display helper, which uses floating-point arithmetic. Treat the displayed value as a display amount, not an exact accounting figure. The raw base units above are exact.';

  try {
    // Even multiplier 1 must preserve the program helper's f64 rounding behavior.
    extensionUiAmount = amountToUiAmountForScaledUiAmountMintWithoutSimulation(
      BigInt(totalRawAmount), decimals, selection.multiplier,
    );
    if (!Number.isFinite(Number(extensionUiAmount)) || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(extensionUiAmount)) throw new Error('Invalid display output.');
  } catch {
    extensionUiAmount = undefined;
    rounding = 'unavailable';
    note = 'The official conversion helper could not produce a value for this amount and multiplier.';
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
