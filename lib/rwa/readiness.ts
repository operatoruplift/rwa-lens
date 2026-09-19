import { READINESS_DISCLAIMER } from './types';
import type {
  DecodedExtension,
  RawBalance,
  ReadinessReason,
  ReadinessVerdict,
  TransferReadiness,
} from './types';

/**
 * Transfer readiness is an *explanation*, never an authorisation.
 *
 * The ranking below matters: an unknown must never be softened into a ready.
 * If any signal is opaque the whole verdict degrades, because a green badge on
 * a token nobody understands is the failure mode this product exists to avoid.
 */
const RANK: Record<ReadinessVerdict, number> = { ready: 0, attention: 1, unknown: 2, blocked: 3 };

function worst(verdicts: ReadinessVerdict[]): ReadinessVerdict {
  return verdicts.reduce<ReadinessVerdict>(
    (current, next) => (RANK[next] > RANK[current] ? next : current),
    'ready',
  );
}

export function evaluateReadiness(
  extensions: DecodedExtension[],
  accounts: RawBalance[],
  complete = true,
): TransferReadiness {
  const reasons: ReadinessReason[] = [];

  const has = (kind: string) => extensions.find(extension => extension.kind === kind);

  if (has('NonTransferable') || has('NonTransferableAccount')) {
    reasons.push({
      verdict: 'blocked',
      check: 'Non-transferable',
      detail: 'This token cannot be transferred by anyone. It can only be held or burned.',
      evidence: 'NonTransferable extension present on the mint.',
    });
  }

  const pausable = has('PausableConfig');
  if (pausable) {
    const paused = pausable.fields.find(field => field.label === 'Paused')?.value === 'yes';
    reasons.push({
      verdict: paused ? 'blocked' : pausable.authorities.length > 0 ? 'attention' : 'ready',
      check: 'Pausable',
      detail: paused
        ? 'Transfers are currently paused by the mint authority. Nobody can move this token right now.'
        : pausable.authorities.length > 0 ? 'An authority can pause all transfers of this token at any time.' : 'The mint is unpaused and no pause authority is configured.',
      evidence: pausable.authorities.map(a => `${a.role}: ${a.address}`).join(', ') || 'PausableConfig present.',
    });
  }

  const defaultState = has('DefaultAccountState');
  if (defaultState) {
    const state = defaultState.fields.find(field => field.label === 'Default state')?.value ?? 'unknown';
    const frozenByDefault = /frozen/i.test(state);
    reasons.push({
      verdict: frozenByDefault ? 'attention' : 'ready',
      check: 'Default account state',
      detail: frozenByDefault
        ? 'New holders receive a frozen account and cannot move the token until an authority thaws it. This is how issuers gate distribution.'
        : `New accounts default to ${state}.`,
      evidence: `DefaultAccountState = ${state}`,
    });
  }

  const hook = has('TransferHook');
  if (hook) {
    const program = hook.authorities.find(a => a.role === 'Hook program')?.address;
    reasons.push(
      hook.inactive
        ? {
            verdict: 'ready',
            check: 'Transfer hook',
            detail:
              'The transfer-hook extension is present but no hook program is set, so no extra program runs on transfer today. The hook authority can set one later.',
            evidence: program ? `Hook program: ${program} (unset)` : 'No hook program configured.',
          }
        : {
            verdict: 'unknown',
            check: 'Transfer hook',
            detail:
              'Every transfer calls a program that can reject it. Whether a specific transfer succeeds depends on that program, which this tool does not execute or simulate.',
            evidence: program ? `Hook program: ${program}` : 'TransferHook present on the mint.',
          },
    );
  }

  const delegate = has('PermanentDelegate');
  if (delegate && !delegate.inactive) {
    reasons.push({
      verdict: 'attention',
      check: 'Permanent delegate',
      detail:
        'This address can move or burn the token without the holder’s signature, and the holder cannot revoke it.',
      evidence: delegate.authorities.map(a => `${a.role}: ${a.address}`).join(', '),
    });
  }

  const fee = has('TransferFeeConfig');
  if (fee) {
    reasons.push({
      verdict: 'attention',
      check: 'Transfer fee',
      detail: 'Configured fees may reduce transfer proceeds, depending on the active epoch, rate and cap. Holding alone incurs no fresh transfer fee; already withheld units are reported separately.',
      evidence: fee.fields.map(field => `${field.label}: ${field.value}`).join(', '),
    });
  }

  const confidential = extensions.filter(extension => extension.severity === 'opaque' && !extension.inactive);
  if (confidential.length > 0) {
    reasons.push({
      verdict: 'unknown',
      check: 'Opaque or unrecognised state',
      detail:
        'Confidential capability or an unsupported extension was detected. Mint capability does not prove an encrypted holding; any encrypted or omitted portion remains unknown.',
      evidence: confidential.map(extension => extension.kind).join(', '),
    });
  }

  const frozenAccounts = accounts.filter(account => account.state === 'frozen');
  if (frozenAccounts.length > 0) {
    reasons.push({
      verdict: 'blocked',
      check: 'Frozen token account',
      detail: `${frozenAccounts.length} of ${accounts.length} inspected account(s) are frozen and cannot send until thawed.`,
      evidence: frozenAccounts.map(account => account.tokenAccount).join(', '),
    });
  }

  const unknownState = accounts.filter(account => account.state === 'unknown' || account.state === 'uninitialized');
  if (unknownState.length > 0) {
    reasons.push({
      verdict: 'unknown',
      check: 'Account state unreadable',
      detail: 'At least one token account state could not be decoded.',
      evidence: unknownState.map(account => account.tokenAccount).join(', '),
    });
  }

  if (!complete) reasons.push({ verdict: 'unknown', check: 'Incomplete owner observation', detail: 'Some owner accounts or their state could not be validated. Readiness is not established for the omitted accounts.' });

  if (has('CpiGuard')) reasons.push({ verdict: 'attention', check: 'CPI guard', detail: 'CPI-specific restrictions may apply. Ordinary owner transfers are not necessarily blocked.', evidence: 'CpiGuard account extension' });

  if (reasons.length === 0) {
    reasons.push({
      verdict: 'ready',
      check: 'No restrictive controls observed',
      detail:
        'No extension or account state was found that would block a transfer. This describes observed state only and is not a counterparty or legal guarantee.',
    });
  }

  return {
    verdict: worst(reasons.map(reason => reason.verdict)),
    knownBlock: reasons.some(reason => reason.verdict === 'blocked'),
    unknownChecks: reasons.some(reason => reason.verdict === 'unknown'),
    reasons,
    disclaimer: READINESS_DISCLAIMER,
  };
}
