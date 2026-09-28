import 'server-only';
import type { DeployStatus } from '@/lib/rwa/deploy';
import type { DeployChain } from './chain';

/**
 * Where a submitted deploy stands. "Confirmed" requires a status without an
 * error: a signature appearing on chain is not success on its own. A missing
 * status past the blockhash's last valid height means it can no longer land.
 */
export async function readDeployStatus(chain: DeployChain, signature: string, lastValidBlockHeight: bigint): Promise<DeployStatus> {
  try {
    const status = await chain.signatureStatus(signature);
    if (status?.failed) return { state: 'failed', message: 'The transaction failed on-chain. Nothing moved except the network fee.' };
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return { state: 'confirmed', slot: status.slot.toString() };
    if (status) return { state: 'pending' };
    return (await chain.blockHeight()) > lastValidBlockHeight ? { state: 'expired' } : { state: 'pending' };
  } catch {
    return { state: 'unavailable', message: 'The confirmation check could not reach the RPC provider. It will retry.' };
  }
}
