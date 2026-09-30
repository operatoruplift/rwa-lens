import 'server-only';
import { DLMM_ERRORS } from './dlmm';

const LABELS: Readonly<Record<string, string>> = {
  ComputeBudget111111111111111111111111111111: 'the compute budget',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'the Jupiter swap',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'the Meteora deposit',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'token account setup',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'a token transfer',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'a token transfer',
  '11111111111111111111111111111111': 'account creation',
};
const JUPITER_SLIPPAGE = 6001;
const NO_TX = ' No transaction was offered to your wallet.';

const asNumber = (value: unknown) => (typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : null);

/**
 * A plain-language reason for a failed simulation. The raw error and logs stay
 * on the server; the user sees which step failed and what to change.
 */
export function explainSimulationFailure(err: unknown, logs: readonly string[], programs: readonly string[]): string {
  const text = logs.join('\n');
  if (err === 'InsufficientFundsForFee' || (typeof err === 'object' && err !== null && 'InsufficientFundsForRent' in err) || /insufficient lamports/i.test(text)) {
    return `The wallet needs more SOL for account rent and the network fee.${NO_TX}`;
  }
  if (/insufficient funds/i.test(text)) return `The wallet does not hold enough of a token this transaction spends.${NO_TX}`;
  if (err === 'BlockhashNotFound') return 'The network moved on before the check finished. Build the deploy again.';
  const failure = typeof err === 'object' && err !== null && 'InstructionError' in err ? (err as { InstructionError: unknown }).InstructionError : null;
  if (!Array.isArray(failure)) return `The transaction failed its mainnet preflight check.${NO_TX}`;
  const index = asNumber(failure[0]);
  const program = index === null ? undefined : programs[index];
  const detail = failure[1];
  const custom = typeof detail === 'object' && detail !== null && 'Custom' in detail ? asNumber((detail as { Custom: unknown }).Custom) : null;
  if (program === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' && custom === JUPITER_SLIPPAGE) return `The price moved beyond your slippage before the swap could fill. Try again or allow more slippage.${NO_TX}`;
  if (program === 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo' && custom !== null) {
    if (custom === 6004) return `The pool’s price moved further than your slippage allows. Try again or allow more slippage.${NO_TX}`;
    return `Meteora rejected the deposit (${DLMM_ERRORS[custom] ?? `error ${custom}`}).${NO_TX}`;
  }
  return `The mainnet preflight check failed at ${program ? LABELS[program] ?? 'an unexpected program' : 'an unknown step'}.${NO_TX}`;
}
