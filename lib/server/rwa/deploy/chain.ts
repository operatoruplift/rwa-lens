import 'server-only';
import { createSolanaRpcFromTransport, type Address, type Base64EncodedWireTransaction, type Signature } from '@solana/kit';
import { createBoundedTransport, resolveRpcConfig, translate } from '../rpc';

/** Everything the deploy plane may ask the RPC provider, and nothing that sends a transaction. */
const DEPLOY_METHODS = ['getMultipleAccounts', 'getLatestBlockhash', 'simulateTransaction', 'getSignatureStatuses', 'getBlockHeight'] as const;

export type ChainAccount = { owner: Address; lamports: bigint; data: Uint8Array };
export type Simulation = { err: unknown; logs: readonly string[]; unitsConsumed: bigint | null; slot: bigint; accounts: readonly (ChainAccount | null)[] };
export interface DeployChain {
  accounts(addresses: readonly Address[]): Promise<{ slot: bigint; values: readonly (ChainAccount | null)[] }>;
  latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  /** Signature checks off, so the unsigned transaction can be proven before any wallet sees it. */
  simulate(wireTransaction: string, postStateOf: readonly Address[]): Promise<Simulation>;
  signatureStatus(signature: string): Promise<{ slot: bigint; failed: boolean; confirmationStatus: string | null } | null>;
  blockHeight(): Promise<bigint>;
}

type RawAccount = { owner: string; lamports: bigint | number; data: readonly [string, string] | string[] } | null;
const toAccount = (raw: RawAccount): ChainAccount | null => raw ? { owner: raw.owner as Address, lamports: BigInt(raw.lamports), data: Uint8Array.from(Buffer.from(raw.data[0], 'base64')) } : null;

export function createDeployChain(): DeployChain {
  const config = resolveRpcConfig('mainnet-beta');
  const rpc = createSolanaRpcFromTransport(createBoundedTransport({ ...config, timeoutMs: Math.max(config.timeoutMs, 12_000) }, DEPLOY_METHODS));
  const commitment = 'confirmed' as const;
  return {
    async accounts(addresses) {
      try {
        const response = await rpc.getMultipleAccounts([...addresses], { encoding: 'base64', commitment }).send();
        return { slot: response.context.slot, values: response.value.map(value => toAccount(value as RawAccount)) };
      } catch (error) { throw translate(error, 'getMultipleAccounts'); }
    },
    async latestBlockhash() {
      try {
        const { value } = await rpc.getLatestBlockhash({ commitment }).send();
        return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
      } catch (error) { throw translate(error, 'getLatestBlockhash'); }
    },
    async simulate(wireTransaction, postStateOf) {
      try {
        const response = await rpc.simulateTransaction(wireTransaction as Base64EncodedWireTransaction, {
          encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment,
          ...(postStateOf.length ? { accounts: { addresses: [...postStateOf], encoding: 'base64' } } : {}),
        }).send();
        const value = response.value as { err: unknown; logs: readonly string[] | null; unitsConsumed?: bigint | number; accounts?: readonly RawAccount[] | null };
        return {
          err: value.err ?? null, logs: value.logs ?? [], slot: response.context.slot,
          unitsConsumed: value.unitsConsumed === undefined ? null : BigInt(value.unitsConsumed),
          accounts: (value.accounts ?? []).map(toAccount),
        };
      } catch (error) { throw translate(error, 'simulateTransaction'); }
    },
    async signatureStatus(signature) {
      try {
        const { value } = await rpc.getSignatureStatuses([signature as Signature], { searchTransactionHistory: true }).send();
        const status = value[0];
        return status ? { slot: status.slot, failed: status.err !== null, confirmationStatus: status.confirmationStatus ?? null } : null;
      } catch (error) { throw translate(error, 'getSignatureStatuses'); }
    },
    async blockHeight() {
      try { return await rpc.getBlockHeight({ commitment }).send(); }
      catch (error) { throw translate(error, 'getBlockHeight'); }
    },
  };
}
