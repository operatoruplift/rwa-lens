import { describe, expect, it } from 'vitest';
import { requestOrigin } from '@/lib/server/rwa/http';

describe('public request origin', () => {
  it('retains the browser Host when Next normalizes a loopback hostname', () => {
    const request = new Request('http://localhost:3300/api/rwa/inspect', {
      headers: { host: '127.0.0.1:3300', origin: 'http://127.0.0.1:3300' },
    });
    expect(requestOrigin(request)).toBe(request.headers.get('origin'));
  });
  it('does not accept a foreign origin or trust forwarded host headers', () => {
    const request = new Request('https://rwa.example/api/rwa/inspect', {
      headers: { host: 'rwa.example', origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' },
    });
    expect(requestOrigin(request)).toBe('https://rwa.example');
    expect(requestOrigin(request)).not.toBe(request.headers.get('origin'));
  });
  it('uses request.url for direct requests with no Host header', () => {
    expect(requestOrigin(new Request('https://rwa.example:444/rwa'))).toBe('https://rwa.example:444');
  });
  it.each(['rwa.example/path', 'user@rwa.example', 'rwa.example,evil.example', 'rwa.example?x=1', 'rwa.example#x', 'rwa.example\\evil', 'bad host', ':'])('rejects malformed host %s', host => {
    expect(requestOrigin(new Request('https://rwa.example/rwa', { headers: { host } }))).toBeNull();
  });
});
