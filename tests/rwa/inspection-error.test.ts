import { describe, expect, it } from 'vitest';
import { recoveryCopy, recoveryFor } from '@/lib/rwa/inspection-error';

describe('inspection failure recovery', () => {
  it.each([
    ['invalid-address', 400],
    ['not-a-mint', 422],
    ['decoder-failure', 422],
    ['not-found', 404],
  ] as const)('sends %s to a different address rather than a provider retry', (kind, status) => {
    expect(recoveryFor(status, kind)).toBe('address');
    expect(recoveryCopy[recoveryFor(status, kind)]).toBe('Enter a different mint address to inspect.');
    expect(recoveryCopy[recoveryFor(status, kind)]).not.toMatch(/provider/i);
  });

  it.each([
    ['timeout', 503],
    ['provider-failure', 502],
    ['not-configured', 503],
    ['response-too-large', 503],
  ] as const)('keeps the provider retry for %s', (kind, status) => {
    expect(recoveryFor(status, kind)).toBe('provider');
    expect(recoveryCopy.provider).toBe('Retry the inspection when the provider is available.');
  });

  it('asks for a pause when the request was paced, by kind or by status alone', () => {
    expect(recoveryFor(429, 'rate-limited')).toBe('wait');
    expect(recoveryFor(429)).toBe('wait');
    expect(recoveryCopy.wait).not.toMatch(/different mint|provider/i);
  });

  it('treats an unclassified request rejection as an address problem and anything else as the provider', () => {
    expect(recoveryFor(400)).toBe('address');
    expect(recoveryFor(422)).toBe('address');
    expect(recoveryFor(502)).toBe('provider');
    expect(recoveryFor(500, 'something-new')).toBe('provider');
  });
});
