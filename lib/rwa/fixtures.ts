import { buildDisplayBalance } from './balance';
import { DECODER_VERSION, READINESS_DISCLAIMER } from './types';
import type { InspectRequest, InspectResult } from './types';

/**
 * Deterministic fixtures. These are *illustrative*, not observations of any real
 * issuer, and every fixture says so. They exist so the product is fully usable
 * with no RPC, and so the multiplier-boundary behaviour can be demonstrated
 * without waiting for a real schedule to elapse.
 */

export type Fixture = {
  id: Extract<InspectRequest, { mode: 'fixture' }>['fixtureId'];
  label: string;
  summary: string;
  result: InspectResult;
};

const FIXTURE_NOTE = 'Illustrative fixture. Not a real issuer, mint or balance.';

const baseProvenance = (extra: Partial<InspectResult['provenance']> = {}): InspectResult['provenance'] => ({
  mode: 'fixture',
  cluster: 'devnet',
  rpcProvider: 'fixture',
  fetchedAt: '2026-09-16T00:00:00.000Z',
  slot: '300000000',
  blockTime: '2026-09-16T00:00:00.000Z',
  commitment: 'finalized',
  decoderVersion: DECODER_VERSION,
  timeSource: 'fixture',
  sources: [{ label: 'Fixture', method: 'fixture', status: 'ok', detail: FIXTURE_NOTE }],
  ...extra,
});

/** A tokenised treasury receipt that accrues by multiplier, with a pending change. */
const treasury: Fixture = {
  id: 'treasury-scaled',
  label: 'Tokenised treasury with scheduled yield',
  summary: 'Scaled UI Amount with a pending multiplier change. Raw units never move; the display amount does.',
  result: {
    status: 'verified',
    mode: 'fixture',
    balanceStatus: 'observed',
    identity: {
      mint: 'RWALensFixtureTreasury1111111111111111111',
      tokenProgram: 'token-2022',
      tokenProgramAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      decimals: 6,
      supply: '5000000000000',
      mintAuthority: 'RWALensFixtureEmitter11111111111111111111',
      freezeAuthority: 'RWALensFixtureEmitter11111111111111111111',
      isInitialized: true,
      metadata: {
        name: 'Fixture Treasury Receipt',
        symbol: 'fTRSY',
        uriFetch: 'skipped',
      },
    },
    balances: {
      owner: 'RWALensFixtureBearer111111111111111111111',
      accounts: [
        {
          tokenAccount: 'RWALensFixtureAta11111111111111111111111',
          owner: 'RWALensFixtureBearer111111111111111111111',
          rawAmount: '1000000000',
          decimals: 6,
          state: 'initialized',
          extensions: [],
        },
      ],
      complete: true,
      totalRawAmount: '1000000000',
      display: {
        rawAmount: '1000000000',
        standardUiAmount: '1000',
        extensionUiAmount: '1042.35',
        multiplier: '1.04235',
        pendingMultiplier: '1.05114',
        effectiveAt: '2026-10-01T00:00:00.000Z',
        boundary: 'before',
        rounding: 'official-helper',
        note:
          'Converted with the official Token-2022 display helper, which uses floating-point arithmetic. The raw base units are exact.',
      },
    },
    extensions: [
      {
        kind: 'ScaledUiAmountConfig',
        scope: 'mint',
        severity: 'attention',
        impact:
          'Your balance is a raw amount multiplied by an issuer-controlled number. Yield is applied by changing that multiplier, not by moving tokens.',
        authorities: [{ role: 'Multiplier authority', address: 'RWALensFixtureEmitter11111111111111111111' }],
        fields: [
          { label: 'Stored prior multiplier', value: '1.04235' },
          { label: 'Scheduled multiplier', value: '1.05114' },
          { label: 'Effective at', value: '2026-10-01T00:00:00.000Z' },
        ],
        calculationUnavailable: false,
      },
      {
        kind: 'PermanentDelegate',
        scope: 'mint',
        severity: 'attention',
        impact:
          'This address can transfer or burn your tokens without your signature, and you cannot revoke it.',
        authorities: [{ role: 'Permanent delegate', address: 'RWALensFixtureEmitter11111111111111111111' }],
        fields: [],
        calculationUnavailable: false,
      },
      {
        kind: 'DefaultAccountState',
        scope: 'mint',
        severity: 'attention',
        impact: 'New token accounts arrive frozen until an authority thaws them.',
        authorities: [],
        fields: [{ label: 'Default state', value: 'Frozen' }],
        calculationUnavailable: false,
      },
    ],
    transferReadiness: {
      verdict: 'attention',
      reasons: [
        {
          verdict: 'attention',
          check: 'Default account state',
          detail:
            'New holders receive a frozen account and cannot move the token until an authority thaws it.',
          evidence: 'DefaultAccountState = Frozen',
        },
        {
          verdict: 'attention',
          check: 'Permanent delegate',
          detail: 'The issuer can move or burn the token without the holder’s signature.',
          evidence: 'Permanent delegate: RWALensFixtureEmitter11111111111111111111',
        },
      ],
      disclaimer: READINESS_DISCLAIMER,
    },
    registry: null,
    provenance: baseProvenance(),
    warnings: [FIXTURE_NOTE],
    limitations: [
      'Fixture data. No RPC call was made.',
      'Scaled amounts use the official floating-point helper and are display values.',
    ],
  },
};

/** A private-credit receipt gated by a transfer hook, with an opaque portion. */
const credit: Fixture = {
  id: 'credit-hooked',
  label: 'Private-credit receipt behind a transfer hook',
  summary: 'Transfer hook plus a confidential portion. The verdict is unknown, and unknown is not zero.',
  result: {
    status: 'partial',
    mode: 'fixture',
    balanceStatus: 'partial',
    identity: {
      mint: 'RWALensFixtureCredit11111111111111111111',
      tokenProgram: 'token-2022',
      tokenProgramAddress: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      decimals: 2,
      supply: '250000000',
      mintAuthority: 'RWALensFixtureFund11111111111111111111111',
      isInitialized: true,
      metadata: { name: 'Fixture Credit Receipt', symbol: 'fCRED', uriFetch: 'not-configured' },
    },
    balances: {
      owner: 'RWALensFixtureBearer111111111111111111111',
      accounts: [
        {
          tokenAccount: 'RWALensFixtureAta22222222222222222222222',
          owner: 'RWALensFixtureBearer111111111111111111111',
          rawAmount: '125000',
          decimals: 2,
          state: 'initialized',
          extensions: ['ConfidentialTransferAccount'],
        },
      ],
      complete: false,
      accountLimit: 100,
      totalRawAmount: '125000',
      display: {
        rawAmount: '125000',
        standardUiAmount: '1250',
        boundary: 'none',
        rounding: 'exact-decimal',
        note: 'No Scaled UI Amount extension. Public balance only; a confidential portion may exist and is unknown.',
      },
    },
    extensions: [
      {
        kind: 'TransferHook',
        scope: 'mint',
        severity: 'attention',
        impact:
          'A program runs on every transfer and can reject it. Its conditions are program-specific and are not evaluated here.',
        authorities: [
          { role: 'Hook update authority', address: 'RWALensFixtureFund11111111111111111111111' },
          { role: 'Hook program', address: 'RWALensFixtureHook11111111111111111111111' },
        ],
        fields: [],
        calculationUnavailable: false,
      },
      {
        kind: 'ConfidentialTransferAccount',
        scope: 'account',
        severity: 'opaque',
        impact:
          'This account supports encrypted balances; a nonzero encrypted amount is not proven. The amount shown covers only the public portion; the confidential portion is unknown.',
        authorities: [],
        fields: [],
        calculationUnavailable: true,
      },
    ],
    transferReadiness: {
      verdict: 'unknown',
      reasons: [
        {
          verdict: 'unknown',
          check: 'Transfer hook',
          detail:
            'Every transfer calls a program that can reject it. This tool does not execute or simulate that program.',
          evidence: 'Hook program: RWALensFixtureHook11111111111111111111111',
        },
        {
          verdict: 'unknown',
          check: 'Opaque or unrecognised state',
          detail: 'Part of the balance is encrypted. Any amount involved is unknown — it is not zero.',
          evidence: 'ConfidentialTransferAccount',
        },
      ],
      disclaimer: READINESS_DISCLAIMER,
    },
    registry: null,
    provenance: baseProvenance({ sources: [{ label: 'Fixture', method: 'fixture', status: 'ok', detail: FIXTURE_NOTE }] }),
    warnings: [FIXTURE_NOTE, 'The inspected account list is not guaranteed complete.'],
    limitations: [
      'Fixture data. No RPC call was made.',
      'Confidential balances are never rendered as zero.',
    ],
  },
};

/** A plain SPL mint, to prove the product says so plainly. */
const plain: Fixture = {
  id: 'plain-spl',
  label: 'Plain SPL token (not Token-2022)',
  summary: 'No extensions exist on this program. The product states that rather than showing an empty result.',
  result: {
    status: 'verified',
    mode: 'fixture',
    balanceStatus: 'not-requested',
    identity: {
      mint: 'RWALensFixtureSpot11111111111111111111',
      tokenProgram: 'spl-token',
      tokenProgramAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      decimals: 9,
      supply: '1000000000000',
      isInitialized: true,
    },
    balances: undefined,
    extensions: [],
    transferReadiness: {
      verdict: 'ready',
      reasons: [
        {
          verdict: 'ready',
          check: 'No restrictive controls observed',
          detail:
            'This is a legacy SPL mint, which has no Token-2022 extensions at all. Nothing observed blocks a transfer.',
        },
      ],
      disclaimer: READINESS_DISCLAIMER,
    },
    registry: null,
    provenance: baseProvenance(),
    warnings: [FIXTURE_NOTE],
    limitations: ['Fixture data. No RPC call was made.', 'Legacy SPL mints cannot carry Token-2022 extensions.'],
  },
};

export const FIXTURES: Fixture[] = [treasury, credit, plain];

export function getFixture(id: string): Fixture | undefined {
  return FIXTURES.find(fixture => fixture.id === id);
}

/**
 * Re-times the treasury fixture so the UI can demonstrate the multiplier
 * boundary. The raw amount is identical on both sides — that is the point.
 */
export function treasuryAtBoundary(side: 'before' | 'at' | 'after'): InspectResult {
  const source = treasury.result;
  const observed = side === 'before' ? '2026-09-16T00:00:00.000Z' : side === 'at' ? '2026-10-01T00:00:00.000Z' : '2026-10-01T00:00:01.000Z';
  const display = buildDisplayBalance({
    totalRawAmount: source.balances!.totalRawAmount, decimals: source.identity!.decimals,
    observedSeconds: BigInt(Date.parse(observed) / 1000),
    mintExtensions: [{ __kind: 'ScaledUiAmountConfig', multiplier: 1.04235, newMultiplier: 1.05114, newMultiplierEffectiveTimestamp: BigInt(Date.parse('2026-10-01T00:00:00.000Z') / 1000) }],
  });
  return {
    ...source,
    balances: source.balances && {
      ...source.balances,
      display,
    },
    provenance: {
      ...source.provenance,
      blockTime: observed,
      observedTimestamp: observed,
    },
  };
}

// Initialize the seeded treasury through the accounting engine too.
treasury.result.balances!.display = treasuryAtBoundary('before').balances!.display;
