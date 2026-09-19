'use client';

import { useState } from 'react';
import { z } from 'zod';
import { metadataBodySchema, metadataUriSchema } from '@/lib/rwa/schema';
import { Callout } from './primitives';
import type { Identity } from '@/lib/rwa/types';

const outcomeSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ok'), body: metadataBodySchema, fetchedAt: z.string(), bytes: z.number() }),
  z.object({ state: z.enum(['skipped', 'blocked', 'failed', 'not-configured']), reason: z.string() }),
]);
type Outcome = z.infer<typeof outcomeSchema>;

export function MetadataPanel({ identity, uri }: { identity: Identity; uri: string }) {
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const supported = metadataUriSchema.safeParse(uri).success;
  async function load() {
    if (!supported) return;
    setLoading(true);
    try {
      const response = await fetch('/api/rwa/metadata', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint: identity.mint, uri }) });
      const body: unknown = await response.json();
      const parsed = outcomeSchema.safeParse(body);
      setOutcome(parsed.success ? parsed.data : { state: 'failed', reason: 'The metadata response could not be read. Try again later.' });
    } catch { setOutcome({ state: 'failed', reason: 'The request could not be completed. Check your connection and try again.' }); }
    finally { setLoading(false); }
  }
  return <div className="metadata-panel"><h3>Issuer metadata</h3><p className="tabular metadata-uri">{uri}</p><p>Declared by the mint · fetch status: {outcome?.state ?? identity.metadata?.uriFetch ?? 'skipped'}. Issuer-supplied content, not proof of backing.</p>{supported ? <button type="button" className="text-link" disabled={loading} onClick={() => void load()}>{loading ? 'Fetching metadata…' : 'Fetch metadata'}</button> : <div className="mt-3"><Callout tone="slate">Skipped: this URI does not meet the HTTPS fetch policy. The declared value is shown without requesting it.</Callout></div>}<p>Only deployment-allowlisted hosts may be fetched. No URI is requested automatically.</p>{outcome ? <div className="mt-3">{outcome.state === 'ok' ? <><dl>{Object.entries(outcome.body).map(([key, value]) => <div className="data-field" key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><p className="detail-note">Fetched {outcome.fetchedAt} · {outcome.bytes} bytes.</p></> : <Callout tone={outcome.state === 'not-configured' ? 'slate' : 'amber'}><strong>{outcome.state}: </strong>{outcome.reason}</Callout>}</div> : null}</div>;
}
