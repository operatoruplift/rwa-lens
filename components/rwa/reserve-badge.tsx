import { ArrowUpRight, ShieldCheck, ShieldQuestionMark } from 'lucide-react';
import type { RegistryAsset } from '@/lib/rwa/types';
import { publicHttpsLink } from './result-panels';

/**
 * Surfaces whether the issuer publishes reserve attestations for this asset.
 * A link to the issuer's own reports: RWA Lens does not read, audit or verify them.
 */
export function ReserveAttestationBadge({ registry }: { registry: RegistryAsset }) {
  const link = publicHttpsLink(registry.reserveProofUrl);
  if (!link) {
    return (
      <div className="reserve-badge" data-reserve-state="none">
        <ShieldQuestionMark size={18} aria-hidden="true" />
        <div>
          <strong>No reserve attestation on record</strong>
          <p>The attribution source lists no reserve report for this token. Check the issuer’s own disclosures before relying on backing claims.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="reserve-badge" data-reserve-state="linked">
      <ShieldCheck size={18} aria-hidden="true" />
      <div>
        <strong>Reserve attestations published by the issuer</strong>
        <p>{registry.reserveProofNote ? `${registry.reserveProofNote} ` : ''}Linked from the issuer’s source; RWA Lens does not read or verify these reports.</p>
      </div>
      <a href={link} target="_blank" rel="noreferrer noopener">Issuer reserve reports <ArrowUpRight size={14} /></a>
    </div>
  );
}
