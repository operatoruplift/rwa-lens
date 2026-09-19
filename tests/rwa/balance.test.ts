import { describe, expect, it } from 'vitest';
import { amountToUiAmountForScaledUiAmountMintWithoutSimulation } from '@solana-program/token-2022';
import { buildDisplayBalance, exactUiAmount, selectMultiplier, sumRawAmounts } from '@/lib/rwa/balance';

const scaled = (multiplier: number, newMultiplier: number, effective: bigint) => [
  {
    __kind: 'ScaledUiAmountConfig' as const,
    authority: 'RWALensFixtureIssuer111111111111111111111',
    multiplier,
    newMultiplier,
    newMultiplierEffectiveTimestamp: effective,
  },
];

describe('exact decimal conversion', () => {
  it('converts base units without touching a float', () => {
    expect(exactUiAmount('1000000000', 6)).toBe('1000');
    expect(exactUiAmount('1', 6)).toBe('0.000001');
    expect(exactUiAmount('0', 6)).toBe('0');
    expect(exactUiAmount('123456789', 0)).toBe('123456789');
    expect(exactUiAmount('1250', 2)).toBe('12.5');
  });

  it('survives a u64 that would lose precision as a JS number', () => {
    const max = '18446744073709551615';
    expect(exactUiAmount(max, 0)).toBe(max);
    expect(exactUiAmount(max, 9)).toBe('18446744073.709551615');
    expect(Number(max).toString()).not.toBe(max);
  });

  it('rejects input that is not a non-negative integer string', () => {
    expect(() => exactUiAmount('12.5', 6)).toThrow();
    expect(() => exactUiAmount('-1', 6)).toThrow();
    expect(() => exactUiAmount('1e6', 6)).toThrow();
    expect(() => exactUiAmount('100', -1)).toThrow();
  });
});

describe('raw aggregation', () => {
  it('sums integers before any conversion, across many accounts', () => {
    const accounts = Array.from({ length: 50 }, () => ({ rawAmount: '18446744073709551615' }));
    expect(sumRawAmounts(accounts)).toBe((18446744073709551615n * 50n).toString());
  });
  it('returns zero for no accounts', () => {
    expect(sumRawAmounts([])).toBe('0');
  });
});

describe('multiplier boundary selection', () => {
  const config = { __kind: 'ScaledUiAmountConfig' as const, multiplier: 1.5, newMultiplier: 2, newMultiplierEffectiveTimestamp: 1000n };

  it('treats a zero timestamp as immediately effective, matching the program', () => {
    const result = selectMultiplier({ ...config, newMultiplierEffectiveTimestamp: 0n }, 5000n);
    expect(result).toMatchObject({ multiplier: 2, boundary: 'after' });
  });

  it('uses the current multiplier strictly before the boundary', () => {
    expect(selectMultiplier(config, 999n)).toMatchObject({ multiplier: 1.5, boundary: 'before' });
  });

  it('switches exactly at the boundary, not after it', () => {
    expect(selectMultiplier(config, 1000n)).toMatchObject({ multiplier: 2, boundary: 'at' });
  });

  it('uses the new multiplier after the boundary', () => {
    expect(selectMultiplier(config, 1001n)).toMatchObject({ multiplier: 2, boundary: 'after' });
  });

  it('does not guess a side when no time was observed', () => {
    const result = selectMultiplier(config, null);
    expect(result.multiplier).toBe(1.5);
    expect(result.boundary).toBe('unknown');
  });
});

describe('display balance', () => {
  it('is exact when no scaled extension exists', () => {
    const display = buildDisplayBalance({ totalRawAmount: '1000000000', decimals: 6, mintExtensions: [], observedSeconds: 0n });
    expect(display.standardUiAmount).toBe('1000');
    expect(display.rounding).toBe('exact-decimal');
    expect(display.extensionUiAmount).toBeUndefined();
    expect(display.boundary).toBe('none');
  });

  it('retains official helper rounding when the multiplier is precisely 1', () => {
    const display = buildDisplayBalance({
      totalRawAmount: '1000000000',
      decimals: 6,
      mintExtensions: scaled(1, 1, 0n),
      observedSeconds: 0n,
    });
    expect(display.extensionUiAmount).toBe('1000');
    expect(display.rounding).toBe('official-helper');
  });

  it('labels a helper conversion as a helper result, never as exact', () => {
    const display = buildDisplayBalance({
      totalRawAmount: '1000000000',
      decimals: 6,
      mintExtensions: scaled(1.04235, 1.05114, 2000n),
      observedSeconds: 1000n,
    });
    expect(display.rounding).toBe('official-helper');
    expect(display.note).toMatch(/floating-point/i);
    expect(display.standardUiAmount).toBe('1000');
    expect(display.extensionUiAmount).toBeDefined();
  });

  it('keeps the raw amount identical on both sides of a multiplier change', () => {
    const before = buildDisplayBalance({
      totalRawAmount: '1000000000',
      decimals: 6,
      mintExtensions: scaled(1.04235, 1.05114, 2000n),
      observedSeconds: 1999n,
    });
    const after = buildDisplayBalance({
      totalRawAmount: '1000000000',
      decimals: 6,
      mintExtensions: scaled(1.04235, 1.05114, 2000n),
      observedSeconds: 2001n,
    });
    expect(before.rawAmount).toBe(after.rawAmount);
    expect(before.standardUiAmount).toBe(after.standardUiAmount);
    expect(before.multiplier).not.toBe(after.multiplier);
    expect(before.extensionUiAmount).not.toBe(after.extensionUiAmount);
    expect(before.boundary).toBe('before');
    expect(after.boundary).toBe('after');
  });

  it('reports unavailable rather than zero when the raw amount is unusable', () => {
    const display = buildDisplayBalance({ totalRawAmount: 'not-a-number', decimals: 6, mintExtensions: [], observedSeconds: 0n });
    expect(display.rounding).toBe('unavailable');
    expect(display.standardUiAmount).toBeUndefined();
  });
});

describe('precision and unavailable conversion', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1])('refuses invalid multiplier %s', value => {
    const display = buildDisplayBalance({ totalRawAmount: '18446744073709551615', decimals: 9, mintExtensions: scaled(value, value, 0n), observedSeconds: 1n });
    expect(display.rounding).toBe('unavailable');
    expect(display.extensionUiAmount).toBeUndefined();
    expect(display.rawAmount).toBe('18446744073709551615');
  });
  it('refuses incompatible interest-bearing and scaled extensions', () => {
    const display = buildDisplayBalance({ totalRawAmount: '1', decimals: 6, mintExtensions: [...scaled(1.5, 2, 0n), { __kind: 'InterestBearingConfig' }], observedSeconds: 1n });
    expect(display.rounding).toBe('unavailable');
    expect(display.note).toMatch(/incompatible/);
  });
  it('does not convert a scheduled value without an observed timestamp', () => {
    const display = buildDisplayBalance({ totalRawAmount: '1', decimals: 6, mintExtensions: scaled(1.5, 2, 1000n), observedSeconds: null });
    expect(display.rounding).toBe('unavailable');
    expect(display.boundary).toBe('unknown');
  });
  it('contains large u64 floating-point behavior to a labelled display conversion', () => {
    const display = buildDisplayBalance({ totalRawAmount: '18446744073709551615', decimals: 9, mintExtensions: scaled(1.5, 1.5, 0n), observedSeconds: 1n });
    expect(display.standardUiAmount).toBe('18446744073.709551615');
    expect(display.rounding).toBe('official-helper');
    expect(display.rawAmount).toBe('18446744073709551615');
  });
});

describe('unknown extension and identity-multiplier regressions', () => {
  it.each(['Unknown(25)', 'Unknown(999)', 'Unknown(truncated)', 'FutureDisplayExtension'])('does not infer a definitive display when %s is unrecognized', kind => {
    const display = buildDisplayBalance({ totalRawAmount: '1250000', decimals: 6, mintExtensions: [{ __kind: kind, byteLength: 56 }], observedSeconds: 1n });
    expect(display).toMatchObject({ rawAmount: '1250000', standardUiAmount: '1.25', rounding: 'unavailable', boundary: 'unknown' });
    expect(display.extensionUiAmount).toBeUndefined();
    expect(display.note).toMatch(/unknown or could not be decoded/);
  });
  it('does not compute with known scaled configuration alongside an unknown extension', () => {
    const display = buildDisplayBalance({ totalRawAmount: '1250000', decimals: 6, mintExtensions: [...scaled(1, 1, 0n), { __kind: 'Unknown(999)', byteLength: 3 }], observedSeconds: 1n });
    expect(display.rounding).toBe('unavailable');
    expect(display.standardUiAmount).toBe('1.25');
  });
  it('keeps standard units but withholds extension display for an unknown account extension', () => {
    const display = buildDisplayBalance({ totalRawAmount: '1250000', decimals: 6, mintExtensions: [], unknownAccountExtensions: true, observedSeconds: 1n });
    expect(display.rounding).toBe('unavailable');
    expect(display.standardUiAmount).toBe('1.25');
  });
  it('preserves official rounding for a large u64 at multiplier 1', () => {
    const rawAmount = '18446744073709551615';
    const display = buildDisplayBalance({ totalRawAmount: rawAmount, decimals: 9, mintExtensions: scaled(1, 1, 0n), observedSeconds: 1n });
    expect(display.rawAmount).toBe(rawAmount);
    expect(display.standardUiAmount).toBe('18446744073.709551615');
    expect(display.extensionUiAmount).toBe(amountToUiAmountForScaledUiAmountMintWithoutSimulation(BigInt(rawAmount), 9, 1));
    expect(display.extensionUiAmount).not.toBe(display.standardUiAmount);
    expect(display.rounding).toBe('official-helper');
  });
});
