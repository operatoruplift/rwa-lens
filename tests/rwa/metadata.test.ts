import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMetadata } from '@/lib/server/rwa/metadata-fetch';
import { hashObservation, reportsEnabled, repositoryState } from '@/lib/server/rwa/repository';
import { registryConfigured } from '@/lib/server/rwa/registry';

const okJson = (body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': type } });

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('metadata fetching is deny-by-default', () => {
  it('fetches nothing at all when no host is allowlisted', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const outcome = await fetchMetadata('https://metadata.example.com/a.json');
    expect(outcome.state).toBe('not-configured');
    expect(spy).not.toHaveBeenCalled();
  });

  it('blocks a host that is not on the allowlist, without requesting it', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const outcome = await fetchMetadata('https://evil.example.net/a.json');
    expect(outcome.state).toBe('blocked');
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ['loopback', 'https://127.0.0.1/a.json'],
    ['cloud metadata service', 'https://169.254.169.254/latest/meta-data/'],
    ['private range', 'https://10.1.2.3/a.json'],
    ['plain http', 'http://metadata.example.com/a.json'],
  ])('blocks %s even when a host is allowlisted', async (_label, uri) => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect((await fetchMetadata(uri)).state).toBe('blocked');
    expect(spy).not.toHaveBeenCalled();
  });

  it('accepts a well-formed document from an allowlisted host', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ name: 'Fixture Fund', symbol: 'fFUND' })));
    const outcome = await fetchMetadata('https://metadata.example.com/a.json');
    expect(outcome.state).toBe('ok');
    if (outcome.state === 'ok') expect(outcome.body.name).toBe('Fixture Fund');
  });

  it('rejects a non-JSON content type', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ name: 'x' }, 'text/html')));
    expect((await fetchMetadata('https://metadata.example.com/b.json')).state).toBe('blocked');
  });

  it('rejects an oversized document by its declared length', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(500_000) } })),
    );
    expect((await fetchMetadata('https://metadata.example.com/c.json')).state).toBe('blocked');
  });

  it('reports an upstream error without leaking the host or the error text', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED 10.0.0.1:443 secret detail'); }));
    const outcome = await fetchMetadata('https://metadata.example.com/d.json');
    expect(outcome.state).toBe('failed');
    if (outcome.state === 'failed') {
      expect(outcome.reason).not.toMatch(/ECONNREFUSED|10\.0\.0\.1|secret/);
    }
  });

  it('follows no redirects, so a redirect cannot escape the allowlist', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com');
    const spy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('error');
      return okJson({ name: 'ok' });
    });
    vi.stubGlobal('fetch', spy);
    await fetchMetadata('https://metadata.example.com/e.json');
    expect(spy).toHaveBeenCalled();
  });
});

describe('optional adapters stay off unless configured', () => {
  it('reports the registry as unconfigured by default', () => {
    expect(registryConfigured()).toBe(false);
  });

  it('keeps reports disabled unless the flag is exactly true', () => {
    expect(reportsEnabled()).toBe(false);
    vi.stubEnv('RWA_REPORTS_ENABLED', 'TRUE');
    expect(reportsEnabled()).toBe(false);
    vi.stubEnv('RWA_REPORTS_ENABLED', 'true');
    expect(reportsEnabled()).toBe(true);
  });

  it('is misconfigured rather than ready when the flag is on but keys are missing', () => {
    vi.stubEnv('RWA_REPORTS_ENABLED', 'true');
    expect(repositoryState()).toBe('misconfigured');
  });

  it('hashes an observation deterministically and differently per payload', () => {
    expect(hashObservation({ a: 1 })).toBe(hashObservation({ a: 1 }));
    expect(hashObservation({ a: 1 })).not.toBe(hashObservation({ a: 2 }));
    expect(hashObservation({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
