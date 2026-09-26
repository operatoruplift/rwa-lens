/**
 * How an inspection failure is resolved, so the UI never offers a retry that
 * cannot succeed. A mint address the network decoded and rejected stays rejected
 * however long the provider stays healthy; only provider and pacing states clear
 * on their own.
 */
export type Recovery = 'address' | 'wait' | 'provider';

export type InspectionError = { message: string; recovery: Recovery };

export const recoveryCopy: Record<Recovery, string> = {
  address: 'Enter a different mint address to inspect.',
  wait: 'Retry the inspection in a moment.',
  provider: 'Retry the inspection when the provider is available.',
};

/** Determinations about the submitted address. Retrying one never changes it. */
const ADDRESS_KINDS = ['invalid-address', 'not-a-mint', 'decoder-failure', 'not-found'];

/** `kind` is the server's RpcError classification when it sent one; the HTTP
 * status carries the request-validation cases that never reach a classifier. */
export function recoveryFor(status: number, kind?: string): Recovery {
  if (kind === 'rate-limited' || status === 429) return 'wait';
  if (kind ? ADDRESS_KINDS.includes(kind) : status === 400 || status === 422) return 'address';
  return 'provider';
}
