import 'server-only';
import type { DeployStatus } from '@/lib/rwa/deploy';
import type { DeployChain } from './chain';

function observedStatus(status: NonNullable<Awaited<ReturnType<DeployChain['signatureStatus']>>>): DeployStatus {
  if (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized') return { state: 'pending' };
  if (status.failed) return status.confirmationStatus === 'finalized'
    ? { state: 'failed', message: 'The transaction failed on-chain. Nothing moved except the network fee.' }
    : { state: 'pending' };
  return { state: status.confirmationStatus, slot: status.slot.toString() };
}

/**
 * Where a submitted deploy stands. "Confirmed" requires a status without an
 * error at confirmed commitment or better. Finalized success and failure are
 * terminal; earlier observations can still change forks.
 * Recheck the signature after observing expiry height so a transaction that
 * landed during the height read is not incorrectly reported as expired.
 */
export async function readDeployStatus(chain: DeployChain, signature: string, lastValidBlockHeight: bigint): Promise<DeployStatus> {
  try {
    const status = await chain.signatureStatus(signature);
    if (status) return observedStatus(status);
    if ((await chain.blockHeight()) <= lastValidBlockHeight) return { state: 'pending' };
    const afterExpiry = await chain.signatureStatus(signature);
    return afterExpiry ? observedStatus(afterExpiry) : { state: 'expired' };
  } catch {
    return { state: 'unavailable', message: 'The confirmation check could not reach the RPC provider. It will retry.' };
  }
}
