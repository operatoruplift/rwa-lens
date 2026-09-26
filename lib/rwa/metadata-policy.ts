import { metadataUriSchema } from '@/lib/rwa/schema';
import type { Identity } from '@/lib/rwa/types';

/** Whether a declared metadata URI may be requested, and why when it may not. */
export type DeclaredUriPolicy = 'fetchable' | 'blocked' | 'not-configured' | 'unsupported';

type DeclaredState = NonNullable<Identity['metadata']>['uriFetch'] | undefined;

/**
 * Reached from the host decision the observation already recorded, so a request is
 * offered only where the deployment policy permits one. The precedence mirrors the
 * server's own order — allowlist first, then the URI itself — so the reason shown
 * to a reader names the same cause as the `uriFetch` state in the exported receipt.
 */
export function declaredUriPolicy(uri: string, declared: DeclaredState): DeclaredUriPolicy {
  if (declared === 'not-configured') return 'not-configured';
  if (!metadataUriSchema.safeParse(uri).success) return 'unsupported';
  if (declared === 'blocked') return 'blocked';
  return 'fetchable';
}

/** Each reason states the policy and that the declared value is shown untouched. */
export const policyCopy: Record<Exclude<DeclaredUriPolicy, 'fetchable'>, string> = {
  blocked: 'This host sits outside the deployment fetch allowlist. The declared URI above is shown exactly as the mint records it, with no request made to it.',
  'not-configured': 'This deployment allowlists no metadata host. The declared URI above is shown exactly as the mint records it, with no request made to it.',
  unsupported: 'This URI does not meet the HTTPS fetch policy. The declared URI above is shown exactly as the mint records it, with no request made to it.',
};
