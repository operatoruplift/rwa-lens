import { EventEmitter } from 'node:events';
import type { request as httpsRequest, RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMetadataFetcher, isPublicAddress } from '@/lib/server/rwa/metadata-fetch';
import { hashObservation, reportsEnabled, repositoryState } from '@/lib/server/rwa/repository';
import { registryConfigured } from '@/lib/server/rwa/registry';

function transport(body = JSON.stringify({ name: 'Fixture Fund', symbol: 'fFUND' }), options: { status?: number; type?: string; length?: number } = {}) {
  let requested: RequestOptions | undefined;
  const request = vi.fn((_url: URL, init: RequestOptions, callback: (response: IncomingMessage) => void) => {
    requested = init;
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => queueMicrotask(() => {
      const response = Object.assign(new EventEmitter(), { statusCode: options.status ?? 200, headers: { 'content-type': options.type ?? 'application/json', ...(options.length ? { 'content-length': String(options.length) } : {}) }, destroy: vi.fn() });
      callback(response as unknown as IncomingMessage);
      response.emit('data', Buffer.from(body)); response.emit('end');
    });
    return req;
  });
  const resolve = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]);
  return { resolve, request, requested: () => requested, fetch: createMetadataFetcher({ resolve, request: request as unknown as typeof httpsRequest }) };
}
beforeEach(() => { vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', 'metadata.example.com'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('metadata policy and transport', () => {
  it('does not resolve or fetch without a configured allowed host', async () => {
    vi.stubEnv('RWA_METADATA_ALLOWED_HOSTS', ''); const io = transport();
    expect((await io.fetch('https://metadata.example.com/a.json')).state).toBe('not-configured');
    expect(io.resolve).not.toHaveBeenCalled(); expect(io.request).not.toHaveBeenCalled();
  });
  it.each(['https://evil.example.net/a.json','http://metadata.example.com/a.json','https://metadata.example.com:8443/a.json','https://user:pass@metadata.example.com/a.json','https://127.0.0.1/a.json','https://[::1]/a.json','https://sub.metadata.example.com/a.json'])('blocks %s before DNS', async uri => {
    const io = transport(); expect((await io.fetch(uri)).state).toBe('blocked'); expect(io.resolve).not.toHaveBeenCalled();
  });
  it.each(['127.0.0.1','10.1.2.3','169.254.169.254','172.16.1.1','192.168.1.1','100.64.0.1','198.19.1.1','224.0.0.1','0.0.0.0','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])('rejects non-public DNS answer %s', async address => {
    expect(isPublicAddress(address)).toBe(false);
    const io = transport(); io.resolve.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
    expect((await io.fetch('https://metadata.example.com/a.json')).state).toBe('blocked'); expect(io.request).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS answers', async () => {
    const io = transport(); io.resolve.mockResolvedValue([{ address:'8.8.8.8', family:4 },{ address:'10.0.0.1',family:4 }]);
    expect((await io.fetch('https://metadata.example.com/a.json')).state).toBe('blocked');
  });
  it('pins lookup to the validated address and keeps TLS host verification', async () => {
    const io = transport(); const result = await io.fetch('https://metadata.example.com/a.json');
    expect(result.state).toBe('ok'); expect(io.resolve).toHaveBeenCalledOnce();
    const options = io.requested()!; expect(options.servername).toBe('metadata.example.com'); expect(options.agent).toBe(false);
    const callback = vi.fn(); options.lookup!('metadata.example.com', { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(io.resolve).toHaveBeenCalledOnce();
  });
  it('caches short-lived normalized JSON and counts bytes, not characters', async () => {
    const io = transport(JSON.stringify({ name: 'Treasury €' }));
    const first = await io.fetch('https://metadata.example.com/a.json');
    expect(first.state).toBe('ok');
    if (first.state === 'ok') expect(first.bytes).toBe(Buffer.byteLength(JSON.stringify({ name: 'Treasury €' })));
    await io.fetch('https://metadata.example.com/a.json'); expect(io.request).toHaveBeenCalledOnce();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 61_000);
    await io.fetch('https://metadata.example.com/a.json'); expect(io.request).toHaveBeenCalledTimes(2);
  });
  it.each([301,302,307,500])('does not follow status %s', async status => {
    const io = transport('{}', {status}); expect((await io.fetch('https://metadata.example.com/a.json')).state).toBe('failed'); expect(io.request).toHaveBeenCalledOnce();
  });
  it.each(['text/html','text/plain'])('rejects content type %s', async type => { expect((await transport('{}',{ type }).fetch('https://metadata.example.com/a.json')).state).toBe('blocked'); });
  it('bounds declared and streamed bodies', async () => {
    expect((await transport('{}',{ length:500_000 }).fetch('https://metadata.example.com/a.json')).state).toBe('blocked');
    expect((await transport('x'.repeat(131073)).fetch('https://metadata.example.com/a.json')).state).toBe('blocked');
  });
  it('rejects invalid JSON and schema', async () => {
    expect((await transport('<script>').fetch('https://metadata.example.com/a.json')).state).toBe('failed');
    expect((await transport('{"name":1}').fetch('https://metadata.example.com/a.json')).state).toBe('failed');
  });
  it('times out during DNS and redacts its underlying exception', async () => {
    vi.useFakeTimers(); const io = transport(); io.resolve.mockImplementation(() => new Promise(() => {}));
    const pending = io.fetch('https://metadata.example.com/a.json'); await vi.advanceTimersByTimeAsync(5001);
    expect(await pending).toEqual({state:'failed',reason:'The metadata host did not respond in time.'});
  });
});

describe('optional surfaces', () => {
  it('keeps reports and registry disabled by default', () => { vi.stubEnv('RWA_REPORTS_ENABLED',''); expect(reportsEnabled()).toBe(false); expect(registryConfigured()).toBe(false); });
  it('fails closed with report flag but absent durable credentials', () => { vi.stubEnv('RWA_REPORTS_ENABLED','true'); expect(repositoryState()).toBe('misconfigured'); });
  it('hashes observation content deterministically', () => { expect(hashObservation({a:1})).toBe(hashObservation({a:1})); expect(hashObservation({a:1})).not.toBe(hashObservation({a:2})); });
});
