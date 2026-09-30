import 'server-only';
import { z } from 'zod';
import { AccountRole, address, type Address, type Instruction } from '@solana/kit';

/**
 * Jupiter's Metis swap API (v1), used only for a USDC → token route that is
 * composed with the Meteora deposit in one transaction. Hosts are fixed; no
 * caller supplies a URL. With JUPITER_API_KEY the keyed host is used; without
 * one, the free host (the keyed host's keyless tier allows only a few calls a
 * minute, and each deploy needs two).
 */
export const JUPITER_HOSTS = { keyed: 'api.jup.ag', free: 'lite-api.jup.ag' } as const;
const apiKey = () => (process.env.JUPITER_API_KEY ?? '').trim();
const base = () => `https://${apiKey() ? JUPITER_HOSTS.keyed : JUPITER_HOSTS.free}/swap/v1`;
export const JUPITER_PROGRAM = address('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The accounts a deploy's swap may create and must move funds between. */
export type ExpectedAccounts = { owner: Address; mint: Address; tokenProgram: Address; usdcAccount: Address; tokenAccount: Address };
const TIMEOUT_MS = 8000;
const MAX_BYTES = 512 * 1024;

const digits = z.string().regex(/^\d{1,30}$/);
const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const quoteSchema = z.object({
  inputMint: base58,
  outputMint: base58,
  inAmount: digits,
  outAmount: digits,
  otherAmountThreshold: digits,
  swapMode: z.literal('ExactIn'),
  slippageBps: z.number().int().min(0).max(10_000),
  priceImpactPct: z.string().regex(/^-?\d+(\.\d+)?(e-?\d+)?$/i),
  routePlan: z.array(z.object({ swapInfo: z.object({ ammKey: base58, label: z.string().max(60).optional(), inputMint: base58, outputMint: base58 }).passthrough(), percent: z.number().nullable().optional() }).passthrough()).min(1).max(8),
}).passthrough();
export type JupiterQuote = z.infer<typeof quoteSchema>;

const instructionSchema = z.object({
  programId: base58,
  accounts: z.array(z.object({ pubkey: base58, isSigner: z.boolean(), isWritable: z.boolean() })).max(64),
  data: z.string().max(4096),
});
type JupiterInstruction = z.infer<typeof instructionSchema>;
export const swapInstructionsSchema = z.object({
  tokenLedgerInstruction: z.null().optional(),
  computeBudgetInstructions: z.array(instructionSchema).max(4),
  setupInstructions: z.array(instructionSchema).max(6),
  swapInstruction: instructionSchema,
  cleanupInstruction: instructionSchema.nullable().optional(),
  otherInstructions: z.array(instructionSchema).max(0).optional(),
  addressLookupTableAddresses: z.array(base58).max(8),
  simulationError: z.unknown().optional(),
}).passthrough();

export type SwapPlan = {
  /** Account creation, then the swap. Jupiter's own compute-budget instructions are dropped. */
  instructions: Instruction[];
  lookupTables: Address[];
};

export class JupiterError extends Error {
  constructor(readonly kind: 'rate-limited' | 'unavailable' | 'no-route' | 'rejected', message: string) { super(message); this.name = 'JupiterError'; }
}

type Fetch = typeof fetch;
async function readJson(fetcher: Fetch, url: string, init: RequestInit): Promise<unknown> {
  const key = apiKey();
  let response: Response;
  try {
    response = await fetcher(url, { ...init, headers: { accept: 'application/json', ...(key ? { 'x-api-key': key } : {}), ...(init.headers ?? {}) }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { throw new JupiterError('unavailable', 'Jupiter could not be reached.'); }
  if (response.status === 429) { await response.body?.cancel(); throw new JupiterError('rate-limited', 'Jupiter rate limited this request.'); }
  const text = await response.text().catch(() => '');
  if (text.length > MAX_BYTES) throw new JupiterError('unavailable', 'Jupiter returned an oversized response.');
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* handled below */ }
  if (!response.ok) {
    const code = typeof body === 'object' && body && 'errorCode' in body ? String((body as { errorCode: unknown }).errorCode) : '';
    if (response.status === 400 && /ROUTE|NO_ROUTES|TOKEN_NOT_TRADABLE|COULD_NOT_FIND/i.test(`${code} ${text}`)) throw new JupiterError('no-route', 'Jupiter found no route for this swap.');
    throw new JupiterError('unavailable', 'Jupiter could not quote this swap.');
  }
  return body;
}

function toInstruction(raw: JupiterInstruction): Instruction {
  return {
    programAddress: address(raw.programId),
    accounts: raw.accounts.map(meta => ({
      address: address(meta.pubkey),
      role: meta.isSigner ? (meta.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER) : (meta.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY),
    })),
    data: Uint8Array.from(Buffer.from(raw.data, 'base64')),
  };
}

/**
 * Associated-token-account creation (Create or CreateIdempotent) for exactly
 * one of the two accounts the deploy uses, paid by the wallet. Nothing else in
 * the ATA program, and no System or Token instruction, can pass.
 */
function createsExpectedAccount(instruction: JupiterInstruction, expected: ExpectedAccounts): boolean {
  if (instruction.programId !== ATA_PROGRAM) return false;
  const data = Buffer.from(instruction.data, 'base64');
  if (data.length > 1 || (data.length === 1 && data[0] > 1)) return false;
  if (instruction.accounts.length !== 6) return false;
  const [payer, account, wallet, mint, system, tokenProgram] = instruction.accounts;
  const target = account.pubkey === expected.usdcAccount ? { mint: USDC_MINT, program: TOKEN_PROGRAM }
    : account.pubkey === expected.tokenAccount ? { mint: expected.mint, program: expected.tokenProgram } : null;
  return !!target && payer.pubkey === expected.owner && payer.isSigner && !account.isSigner && wallet.pubkey === expected.owner && !wallet.isSigner
    && mint.pubkey === target.mint && system.pubkey === SYSTEM_PROGRAM && tokenProgram.pubkey === target.program;
}

/**
 * Accepts Jupiter's swap instruction plus, at most, creation of the wallet's
 * own USDC and token accounts. No cleanup or extra instruction, no signer but
 * the wallet, and the swap must move funds between those two accounts. The
 * builder then checks every writable account and the simulated balances.
 */
export function acceptSwapInstructions(body: unknown, expected: ExpectedAccounts): SwapPlan {
  const parsed = swapInstructionsSchema.safeParse(body);
  if (!parsed.success) throw new JupiterError('rejected', 'Jupiter returned instructions in an unexpected shape.');
  const plan = parsed.data;
  if (plan.simulationError) throw new JupiterError('rejected', 'Jupiter could not complete the swap preflight for this wallet.');
  if (plan.swapInstruction.programId !== JUPITER_PROGRAM) throw new JupiterError('rejected', 'The swap did not use Jupiter’s program.');
  if (plan.cleanupInstruction) throw new JupiterError('rejected', 'The swap included a cleanup step this deploy never needs.');
  if (plan.setupInstructions.some(instruction => !createsExpectedAccount(instruction, expected))) throw new JupiterError('rejected', 'The swap included a setup step other than creating this wallet’s token accounts.');
  const all = [...plan.setupInstructions, plan.swapInstruction];
  if (all.some(instruction => instruction.accounts.some(meta => meta.isSigner && meta.pubkey !== expected.owner))) throw new JupiterError('rejected', 'The swap asked for a signer other than the wallet.');
  const swapAccounts = plan.swapInstruction.accounts;
  if (!swapAccounts.some(meta => meta.isSigner && meta.pubkey === expected.owner)) throw new JupiterError('rejected', 'The swap was not built for this wallet.');
  const writes = (target: string) => swapAccounts.some(meta => meta.pubkey === target && meta.isWritable);
  if (!writes(expected.usdcAccount) || !writes(expected.tokenAccount)) throw new JupiterError('rejected', 'The swap did not move funds between this wallet’s USDC and token accounts.');
  return {
    instructions: [...plan.setupInstructions.map(toInstruction), toInstruction(plan.swapInstruction)],
    lookupTables: plan.addressLookupTableAddresses.map(value => address(value)),
  };
}

export type QuoteInput = { inputMint: string; outputMint: string; amount: bigint; slippageBps: number; maxAccounts: number };
export function createJupiter(fetcher: Fetch = fetch) {
  return {
    async quote(input: QuoteInput): Promise<JupiterQuote> {
      const params = new URLSearchParams({
        inputMint: input.inputMint, outputMint: input.outputMint, amount: input.amount.toString(), slippageBps: String(input.slippageBps),
        // Direct routes only: no intermediate token, so the swap touches no wallet account but USDC and the token.
        swapMode: 'ExactIn', onlyDirectRoutes: 'true', maxAccounts: String(input.maxAccounts),
      });
      const parsed = quoteSchema.safeParse(await readJson(fetcher, `${base()}/quote?${params}`, { method: 'GET' }));
      if (!parsed.success) throw new JupiterError('rejected', 'Jupiter returned a quote in an unexpected shape.');
      const quote = parsed.data;
      if (quote.inputMint !== input.inputMint || quote.outputMint !== input.outputMint || quote.inAmount !== input.amount.toString() || quote.slippageBps !== input.slippageBps) {
        throw new JupiterError('rejected', 'Jupiter’s quote did not match the request.');
      }
      if (BigInt(quote.otherAmountThreshold) <= 0n || BigInt(quote.otherAmountThreshold) > BigInt(quote.outAmount)) throw new JupiterError('rejected', 'Jupiter’s quote had no usable minimum output.');
      return quote;
    },
    async swapInstructions(quote: JupiterQuote, expected: ExpectedAccounts): Promise<SwapPlan> {
      const body = await readJson(fetcher, `${base()}/swap-instructions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: expected.owner, wrapAndUnwrapSol: false, dynamicComputeUnitLimit: false }),
      });
      return acceptSwapInstructions(body, expected);
    },
  };
}
export type Jupiter = ReturnType<typeof createJupiter>;
