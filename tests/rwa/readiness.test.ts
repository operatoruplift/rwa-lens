import { describe, expect, it } from 'vitest';
import { describeExtension, describeExtensions } from '@/lib/rwa/extensions';
import { evaluateReadiness } from '@/lib/rwa/readiness';
import type { DecodedExtension, RawBalance } from '@/lib/rwa/types';

const account = (over: Partial<RawBalance> = {}): RawBalance => ({
  tokenAccount: 'RWALensFixtureAta11111111111111111111111',
  owner: 'RWALensFixtureBearer111111111111111111111',
  rawAmount: '1000',
  decimals: 6,
  state: 'initialized',
  extensions: [],
  ...over,
});

const ext = (kind: string): DecodedExtension[] =>
  describeExtensions([{ __kind: kind, authority: 'RWALensFixtureEmitter11111111111111111111', delegate: 'RWALensFixtureEmitter11111111111111111111', programId: 'RWALensFixtureHook11111111111111111111111', state: { __kind: 'Frozen' }, paused: false }], 'mint');

describe('extension description', () => {
  it('explains a permanent delegate in holder terms and names the address', () => {
    const [delegate] = ext('PermanentDelegate');
    expect(delegate.severity).toBe('attention');
    expect(delegate.impact).toMatch(/without your signature/i);
    expect(delegate.authorities[0]).toEqual({
      role: 'Permanent delegate',
      address: 'RWALensFixtureEmitter11111111111111111111',
    });
  });

  it('never drops an unrecognised future variant', () => {
    const unknown = describeExtension({ __kind: 'SomeFutureExtension2029' }, 'mint');
    expect(unknown).not.toBeNull();
    expect(unknown!.severity).toBe('opaque');
    expect(unknown!.calculationUnavailable).toBe(true);
    expect(unknown!.kind).toBe('SomeFutureExtension2029');
  });

  it('skips the Uninitialized padding variant', () => {
    expect(describeExtension({ __kind: 'Uninitialized' }, 'mint')).toBeNull();
  });

  it('marks confidential state opaque, never zero', () => {
    const [confidential] = ext('ConfidentialTransferAccount');
    expect(confidential.severity).toBe('opaque');
    expect(confidential.impact).toMatch(/unknown/i);
  });

  it('marks interest bearing as detected but not computed', () => {
    const [interest] = ext('InterestBearingConfig');
    expect(interest.calculationUnavailable).toBe(true);
  });
});

describe('transfer readiness', () => {
  it('is ready only when nothing restrictive was observed, and still disclaims', () => {
    const readiness = evaluateReadiness([], [account()]);
    expect(readiness.verdict).toBe('ready');
    expect(readiness.disclaimer).toMatch(/not legal advice/i);
  });

  it('blocks a non-transferable token', () => {
    expect(evaluateReadiness(ext('NonTransferable'), [account()]).verdict).toBe('blocked');
  });

  it('blocks when any inspected account is frozen', () => {
    const readiness = evaluateReadiness([], [account(), account({ tokenAccount: 'B', state: 'frozen' })]);
    expect(readiness.verdict).toBe('blocked');
    expect(readiness.reasons.some(reason => /frozen/i.test(reason.check))).toBe(true);
  });

  it('returns unknown for a transfer hook it cannot execute', () => {
    const readiness = evaluateReadiness(ext('TransferHook'), [account()]);
    expect(readiness.verdict).toBe('unknown');
    expect(readiness.reasons[0].detail).toMatch(/does not execute or simulate/i);
  });

  it('never softens an unknown into a ready', () => {
    const mixed = [...ext('TransferHook'), ...describeExtensions([{ __kind: 'MemoTransfer', requireIncomingTransferMemos: true }], 'account')];
    expect(evaluateReadiness(mixed, [account()]).verdict).toBe('unknown');
  });

  it('lets blocked outrank unknown', () => {
    const mixed = [...ext('TransferHook'), ...ext('NonTransferable')];
    expect(evaluateReadiness(mixed, [account()]).verdict).toBe('blocked');
  });

  it('flags a default-frozen mint as attention with the reason stated', () => {
    const readiness = evaluateReadiness(ext('DefaultAccountState'), [account()]);
    expect(readiness.verdict).toBe('attention');
    expect(readiness.reasons[0].detail).toMatch(/frozen account/i);
  });

  it('treats an undecodable account state as unknown rather than fine', () => {
    expect(evaluateReadiness([], [account({ state: 'unknown' })]).verdict).toBe('unknown');
  });
});

describe('regressions found against real mainnet data', () => {
  it('renders the AccountState enum as a name, never as a bare index', () => {
    const [state] = describeExtensions([{ __kind: 'DefaultAccountState', state: 1 }], 'mint');
    expect(state.fields[0]).toEqual({ label: 'Default state', value: 'Initialized' });

    const [frozen] = describeExtensions([{ __kind: 'DefaultAccountState', state: 2 }], 'mint');
    expect(frozen.fields[0].value).toBe('Frozen');
  });

  it('detects frozen-by-default from the decoded name, not an index', () => {
    const frozen = describeExtensions([{ __kind: 'DefaultAccountState', state: 2 }], 'mint');
    expect(evaluateReadiness(frozen, [account()]).verdict).toBe('attention');

    const initialized = describeExtensions([{ __kind: 'DefaultAccountState', state: 1 }], 'mint');
    expect(evaluateReadiness(initialized, [account()]).verdict).toBe('ready');
  });

  it('does not treat a transfer hook with no program set as an active gate', () => {
    const unset = describeExtensions(
      [{ __kind: 'TransferHook', authority: 'RWALensFixtureEmitter11111111111111111111', programId: '11111111111111111111111111111111' }],
      'mint',
    );
    expect(unset[0].inactive).toBe(true);
    expect(unset[0].severity).toBe('info');
    expect(evaluateReadiness(unset, [account()]).verdict).toBe('ready');
  });

  it('still treats a real hook program as unknown', () => {
    const active = describeExtensions(
      [{ __kind: 'TransferHook', authority: 'RWALensFixtureEmitter11111111111111111111', programId: 'RWALensFixtureHook11111111111111111111111' }],
      'mint',
    );
    expect(active[0].inactive).toBe(false);
    expect(evaluateReadiness(active, [account()]).verdict).toBe('unknown');
  });
});

describe('independent controls and required extension coverage', () => {
  it('preserves known frozen blocks and unknown hook checks simultaneously', () => {
    const result = evaluateReadiness(ext('TransferHook'), [account({ state: 'frozen' })]);
    expect(result).toMatchObject({ verdict: 'blocked', knownBlock: true, unknownChecks: true });
    expect(result.reasons.some(reason => reason.check === 'Frozen token account')).toBe(true);
  });
  it('incomplete account evidence never becomes ready', () => {
    expect(evaluateReadiness([], [], false)).toMatchObject({ verdict: 'unknown', unknownChecks: true });
  });
  it.each(['ScaledUiAmountConfig', 'InterestBearingConfig', 'TransferHook', 'TransferHookAccount', 'DefaultAccountState', 'PermanentDelegate', 'TransferFeeConfig', 'TransferFeeAmount', 'MetadataPointer', 'TokenMetadata', 'NonTransferable', 'PausableConfig', 'CpiGuard', 'ConfidentialTransferMint', 'ConfidentialTransferAccount', 'ConfidentialTransferFee', 'ConfidentialTransferFeeAmount', 'ConfidentialMintBurn', 'GroupPointer', 'GroupMemberPointer'])('classifies required extension %s', kind => {
    const extension = describeExtension({ __kind: kind }, 'mint');
    expect(extension).not.toBeNull();
    expect(extension!.impact.length).toBeGreaterThan(15);
    expect(extension!.kind).toBe(kind);
    if (kind.startsWith('Confidential')) expect(extension!.severity).toBe('opaque');
  });
  it('does not subtract previously withheld fees or assert a nonzero confidential holding', () => {
    const withholding = describeExtension({ __kind: 'TransferFeeAmount', withheldAmount: 23n }, 'account')!;
    expect(withholding.fields).toContainEqual({ label: 'Withheld amount', value: '23' });
    expect(withholding.impact).toMatch(/not subtracted again/);
    const capability = describeExtension({ __kind: 'ConfidentialTransferMint' }, 'mint')!;
    expect(capability.impact).toMatch(/does not prove/);
  });
});


it('describes zero-timestamp scaled configuration as immediately effective with stored rather than active field labels', () => {
  const extension = describeExtension({ __kind: 'ScaledUiAmountConfig', multiplier: 1.5, newMultiplier: 2, newMultiplierEffectiveTimestamp: 0n }, 'mint')!;
  expect(extension.fields).toContainEqual({ label: 'Stored prior multiplier', value: '1.5' });
  expect(extension.fields).toContainEqual({ label: 'Scheduled multiplier', value: '2' });
  expect(extension.fields).toContainEqual({ label: 'Effective at', value: 'Immediately effective (Unix timestamp 0)' });
});


it('treats zero-address optional authorities as unset rather than active delegates', () => {
  const none = '11111111111111111111111111111111';
  const delegate = describeExtension({ __kind: 'PermanentDelegate', delegate: none }, 'mint')!;
  expect(delegate).toMatchObject({ inactive: true, severity: 'info', authorities: [] });
  expect(evaluateReadiness([delegate], [account()]).verdict).toBe('ready');
  const pausable = describeExtension({ __kind: 'PausableConfig', authority: none, paused: false }, 'mint')!;
  expect(evaluateReadiness([pausable], [account()]).reasons[0].detail).toMatch(/no pause authority/);
  const paused = describeExtension({ __kind: 'PausableConfig', authority: none, paused: true }, 'mint')!;
  expect(evaluateReadiness([paused], [account()]).verdict).toBe('blocked');
  const scaled = describeExtension({ __kind: 'ScaledUiAmountConfig', authority: none, multiplier: 1, newMultiplier: 1, newMultiplierEffectiveTimestamp: 0n }, 'mint')!;
  expect(scaled.authorities).toEqual([]);
});
