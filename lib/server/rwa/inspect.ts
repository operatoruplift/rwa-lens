import 'server-only';
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  decodeMint,
  decodeToken,
} from '@solana-program/token-2022';
import { buildDisplayBalance, sumRawAmounts } from '@/lib/rwa/balance';
import { describeExtensions } from '@/lib/rwa/extensions';
import { evaluateReadiness } from '@/lib/rwa/readiness';
import { DECODER_VERSION } from '@/lib/rwa/types';
import type {
  AccountState,
  Cluster,
  Identity,
  InspectResult,
  Provenance,
  ProvenanceSource,
  RawBalance,
  TokenProgram,
} from '@/lib/rwa/types';
import {
  RpcError,
  createClient,
  readAccount,
  readChainTime,
  readOwnerTokenAccounts,
  resolveRpcConfig,
} from './rpc';

const BASE_LIMITATIONS = [
  'RWA Lens reads public chain state. It never signs, sends, mints, burns, freezes or transfers anything.',
  'Scaled amounts use the official Token-2022 display helper, which is floating-point. Raw base units are the exact figure.',
  'Issuer metadata is descriptive only. It is not proof of reserves, compliance or legal transferability.',
];

function optionValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const option = value as { __option?: string; value?: unknown };
    if (option.__option === 'Some' && typeof option.value === 'string') return option.value;
  }
  return undefined;
}

function identifyProgram(owner: string): TokenProgram {
  if (owner === String(TOKEN_2022_PROGRAM_ADDRESS)) return 'token-2022';
  if (owner === String(TOKEN_PROGRAM_ADDRESS)) return 'spl-token';
  return 'unknown';
}

function accountState(state: unknown): AccountState {
  const value = typeof state === 'object' && state && '__kind' in state ? String((state as { __kind: string }).__kind) : String(state ?? '');
  if (/frozen/i.test(value)) return 'frozen';
  if (/initialized/i.test(value) && !/uninitialized/i.test(value)) return 'initialized';
  if (/uninitialized/i.test(value)) return 'uninitialized';
  return 'unknown';
}

function decodeBase64(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, 'base64'));
}

/**
 * The generated decoders take a full encoded account. Only `data` carries
 * meaning for decoding, but the shape must be complete or the codec rejects it.
 */
function encodedAccount(addressValue: string, programAddress: unknown, data: Uint8Array) {
  return {
    address: addressValue,
    data,
    executable: false,
    lamports: 0n,
    programAddress,
    space: BigInt(data.length),
    exists: true,
  } as never;
}

type DecodedMint = {
  decimals: number;
  supply: bigint;
  mintAuthority: unknown;
  freezeAuthority: unknown;
  isInitialized: boolean;
  extensions?: unknown;
};

export type InspectInput = {
  cluster: Cluster;
  mint: string;
  owner?: string;
};

export async function inspectOnChain(input: InspectInput): Promise<InspectResult> {
  const sources: ProvenanceSource[] = [];
  const warnings: string[] = [];
  const fetchedAt = new Date().toISOString();

  const config = resolveRpcConfig(input.cluster);
  const client = createClient(config);

  // 1. Chain time first, so time-sensitive extensions have a documented basis.
  let slot: bigint | undefined;
  let observedSeconds: bigint | null = null;
  let timeSource: Provenance['timeSource'] = 'chain';
  try {
    const time = await readChainTime(client, config);
    slot = time.slot;
    observedSeconds = time.blockTime;
    sources.push({ label: 'Chain time', method: 'getSlot + getBlockTime', status: 'ok' });
    if (time.blockTime === null) {
      timeSource = 'local-estimate';
      observedSeconds = BigInt(Math.floor(Date.now() / 1000));
      warnings.push(
        'Block time was unavailable, so any scheduled multiplier was evaluated against local time. Treat the boundary as an estimate.',
      );
    }
  } catch (error) {
    timeSource = 'local-estimate';
    observedSeconds = BigInt(Math.floor(Date.now() / 1000));
    sources.push({
      label: 'Chain time',
      method: 'getSlot',
      status: 'failed',
      detail: error instanceof RpcError ? error.kind : 'unknown',
    });
    warnings.push('Chain time could not be read. Multiplier boundaries are estimated from local time.');
  }

  // 2. The mint account, and its owning program — program identity is itself a fact.
  const account = await readAccount(client, config, input.mint);
  const programOwner = String(account.owner);
  const tokenProgram = identifyProgram(programOwner);
  sources.push({ label: 'Mint account', method: 'getAccountInfo', status: 'ok', detail: `owner ${programOwner}` });

  if (tokenProgram === 'unknown') {
    throw new RpcError('not-a-mint', 'That address is not owned by a Solana token program.');
  }

  let mint: DecodedMint;
  try {
    const raw = decodeBase64(account.data[0]);
    mint = decodeMint(encodedAccount(input.mint, account.owner, raw)).data as unknown as DecodedMint;
    sources.push({ label: 'Mint decode', method: 'decodeMint', status: 'ok' });
  } catch {
    throw new RpcError('decoder-failure', 'The mint account could not be decoded by this release.');
  }

  const mintExtensions = (mint.extensions as { __option?: string; value?: unknown })?.__option === 'Some'
    ? (mint.extensions as { value: unknown }).value
    : mint.extensions;

  const identity: Identity = {
    mint: input.mint,
    tokenProgram,
    tokenProgramAddress: programOwner,
    decimals: mint.decimals,
    supply: mint.supply?.toString(),
    mintAuthority: optionValue(mint.mintAuthority),
    freezeAuthority: optionValue(mint.freezeAuthority),
    isInitialized: Boolean(mint.isInitialized),
  };

  const extensions = describeExtensions(mintExtensions, 'mint');
  if (tokenProgram === 'spl-token' && extensions.length === 0) {
    warnings.push('This is a legacy SPL mint. It cannot carry Token-2022 extensions.');
  }

  // 3. Optional owner balance.
  let balances: InspectResult['balances'];
  const accountsOut: RawBalance[] = [];
  let complete = true;
  let accountLimit: number | undefined;

  if (input.owner) {
    try {
      const owned = await readOwnerTokenAccounts(client, config, input.owner, input.mint, programOwner);
      complete = owned.complete;
      accountLimit = owned.limit;
      if (!owned.complete) {
        warnings.push(
          `More than ${owned.limit} token accounts were returned. The total below covers the first ${owned.limit} and is not a complete wallet balance.`,
        );
      }
      for (const entry of owned.accounts) {
        try {
          const decoded = decodeToken(
            encodedAccount(entry.pubkey, account.owner, decodeBase64(entry.data)),
          ).data as unknown as { amount: bigint; state: unknown; extensions?: unknown };
          const accountExtensions = (decoded.extensions as { __option?: string; value?: unknown })?.__option === 'Some'
            ? (decoded.extensions as { value: unknown }).value
            : decoded.extensions;
          accountsOut.push({
            tokenAccount: entry.pubkey,
            owner: input.owner,
            rawAmount: decoded.amount.toString(),
            decimals: mint.decimals,
            state: accountState(decoded.state),
            extensions: describeExtensions(accountExtensions, 'account').map(item => item.kind),
          });
          for (const accountExtension of describeExtensions(accountExtensions, 'account')) {
            if (!extensions.some(existing => existing.kind === accountExtension.kind)) {
              extensions.push(accountExtension);
            }
          }
        } catch {
          accountsOut.push({
            tokenAccount: entry.pubkey,
            owner: input.owner,
            rawAmount: '0',
            decimals: mint.decimals,
            state: 'unknown',
            extensions: [],
          });
          warnings.push(`Token account ${entry.pubkey} could not be decoded. Its amount is unknown, not zero.`);
        }
      }
      sources.push({
        label: 'Owner token accounts',
        method: 'getTokenAccountsByOwner',
        status: 'ok',
        detail: `${accountsOut.length} account(s)`,
      });
    } catch (error) {
      sources.push({
        label: 'Owner token accounts',
        method: 'getTokenAccountsByOwner',
        status: 'failed',
        detail: error instanceof RpcError ? error.kind : 'unknown',
      });
      warnings.push('The owner balance could not be read. Mint identity below is still a live observation.');
    }

    const totalRawAmount = sumRawAmounts(accountsOut);
    balances = {
      owner: input.owner,
      accounts: accountsOut,
      complete,
      accountLimit,
      totalRawAmount,
      display: buildDisplayBalance({
        totalRawAmount,
        decimals: mint.decimals,
        mintExtensions,
        observedSeconds,
      }),
    };
  }

  const provenance: Provenance = {
    cluster: input.cluster,
    rpcProvider: config.provider,
    fetchedAt,
    slot: slot?.toString(),
    blockTime:
      timeSource === 'chain' && observedSeconds !== null
        ? new Date(Number(observedSeconds) * 1000).toISOString()
        : undefined,
    commitment: config.commitment,
    decoderVersion: DECODER_VERSION,
    timeSource,
    sources,
  };

  const status: InspectResult['status'] =
    sources.some(source => source.status === 'failed') || !complete ? 'partial' : 'verified';

  return {
    status,
    identity,
    balances,
    extensions,
    transferReadiness: evaluateReadiness(extensions, accountsOut),
    registry: null,
    provenance,
    warnings,
    limitations: BASE_LIMITATIONS,
  };
}
