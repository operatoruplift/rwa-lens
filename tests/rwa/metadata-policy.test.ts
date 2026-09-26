import { describe, expect, it } from 'vitest';
import { declaredUriPolicy, policyCopy } from '@/lib/rwa/metadata-policy';
import { metadataUriPolicy } from '@/lib/server/rwa/metadata-fetch';

const ALLOWED = 'https://metadata.example.com/token.json';
const FOREIGN = 'https://evil.example.net/token.json';
const IPFS = 'ipfs://issuer-document';

describe('declared metadata URI policy', () => {
  it('offers a request only for an allowlisted host the observation recorded as fetchable', () => {
    expect(declaredUriPolicy(ALLOWED, 'skipped')).toBe('fetchable');
    expect(declaredUriPolicy(ALLOWED, undefined)).toBe('fetchable');
  });

  it('states the host decision the observation carries', () => {
    expect(declaredUriPolicy(FOREIGN, 'blocked')).toBe('blocked');
    expect(declaredUriPolicy(ALLOWED, 'not-configured')).toBe('not-configured');
  });

  it('names the URI itself when it cannot meet the HTTPS policy', () => {
    expect(declaredUriPolicy(IPFS, 'skipped')).toBe('unsupported');
    expect(declaredUriPolicy(IPFS, 'blocked')).toBe('unsupported');
    expect(declaredUriPolicy('not a uri', undefined)).toBe('unsupported');
  });

  it('follows the recorded state when an unconfigured allowlist decided first', () => {
    // The server reaches 'not-configured' before it looks at the URI, so the
    // reason a reader sees is the one the exported receipt records.
    expect(metadataUriPolicy(IPFS, []).state).toBe('not-configured');
    expect(declaredUriPolicy(IPFS, 'not-configured')).toBe('not-configured');
  });

  it.each(['blocked', 'not-configured', 'unsupported'] as const)('explains %s without contradicting the recorded status', reason => {
    expect(policyCopy[reason]).toMatch(/no request made to it\.$/);
    // "Skipped" would read as a different state from the `blocked` the server
    // records for a declined host or an unsupported scheme.
    expect(policyCopy[reason]).not.toMatch(/^skipped/i);
  });

  it('agrees with the server policy it reports', () => {
    const allowed = ['metadata.example.com'];
    expect(declaredUriPolicy(ALLOWED, metadataUriPolicy(ALLOWED, allowed).state)).toBe('fetchable');
    expect(declaredUriPolicy(FOREIGN, metadataUriPolicy(FOREIGN, allowed).state)).toBe('blocked');
    expect(declaredUriPolicy(IPFS, metadataUriPolicy(IPFS, allowed).state)).toBe('unsupported');
  });
});
