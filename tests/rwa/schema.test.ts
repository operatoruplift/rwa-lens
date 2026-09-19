import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  inspectRequestSchema,
  inspectResultSchema,
  isHostAllowed,
  metadataUriSchema,
  parseAllowedHosts,
} from '@/lib/rwa/schema';

const VALID = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';

describe('address validation', () => {
  it('accepts a real base58 Solana address and trims surrounding space', () => {
    expect(addressSchema.parse(`  ${VALID}  `)).toBe(VALID);
  });

  it.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['ambiguous base58 characters', '0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl'],
    ['oversized', 'X'.repeat(100)],
    ['sql-ish injection', "'; DROP TABLE reports;--"],
  ])('rejects %s', (_label, value) => {
    expect(addressSchema.safeParse(value).success).toBe(false);
  });
});

describe('inspect request', () => {
  it('accepts the two configured clusters only', () => {
    expect(inspectRequestSchema.safeParse({ cluster: 'devnet', mint: VALID }).success).toBe(true);
    expect(inspectRequestSchema.safeParse({ cluster: 'mainnet-beta', mint: VALID }).success).toBe(true);
    expect(inspectRequestSchema.safeParse({ cluster: 'testnet', mint: VALID }).success).toBe(false);
    expect(inspectRequestSchema.safeParse({ cluster: 'http://evil/rpc', mint: VALID }).success).toBe(false);
  });

  it('rejects an unknown fixture id shape', () => {
    expect(inspectRequestSchema.safeParse({ cluster: 'devnet', mint: VALID, fixtureId: '../../etc/passwd' }).success).toBe(false);
  });
});

describe('metadata URI safety', () => {
  it('accepts a plain https host', () => {
    expect(metadataUriSchema.safeParse('https://metadata.example.com/token.json').success).toBe(true);
  });

  it.each([
    ['http', 'http://metadata.example.com/token.json'],
    ['loopback', 'https://localhost/token.json'],
    ['loopback ip', 'https://127.0.0.1/token.json'],
    ['link-local metadata service', 'https://169.254.169.254/latest/meta-data/'],
    ['private range', 'https://10.0.0.5/token.json'],
    ['private range 172', 'https://172.16.4.4/token.json'],
    ['private range 192', 'https://192.168.1.1/token.json'],
    ['file', 'file:///etc/passwd'],
    ['internal tld', 'https://vault.internal/token.json'],
    ['mdns', 'https://printer.local/token.json'],
  ])('rejects %s', (_label, uri) => {
    expect(metadataUriSchema.safeParse(uri).success).toBe(false);
  });
});

describe('host allowlist', () => {
  const allowed = parseAllowedHosts('metadata.example.com, ipfs.io');

  it('parses and normalises a comma separated list', () => {
    expect(allowed).toEqual(['metadata.example.com', 'ipfs.io']);
  });

  it('allows exact configured hosts; subdomains require their own entry', () => {
    expect(isHostAllowed('https://metadata.example.com/a.json', allowed)).toBe(true);
    expect(isHostAllowed('https://cdn.ipfs.io/a.json', allowed)).toBe(false);
    expect(isHostAllowed('https://example.com/a.json', allowed)).toBe(false);
  });

  it('is deny-by-default when nothing is configured', () => {
    expect(isHostAllowed('https://metadata.example.com/a.json', [])).toBe(false);
  });

  it('is not fooled by a suffix lookalike host', () => {
    expect(isHostAllowed('https://evil-ipfs.io/a.json', allowed)).toBe(false);
    expect(isHostAllowed('https://metadata.example.com.evil.net/a.json', allowed)).toBe(false);
  });
});

describe('fixture/live contract', () => {
  it('all fixtures use the response schema without inventing live addresses', async () => {
    const { FIXTURES, treasuryAtBoundary } = await import('@/lib/rwa/fixtures');
    for (const fixture of FIXTURES) {
      expect(inspectRequestSchema.safeParse({ mode: 'fixture', fixtureId: fixture.id }).success).toBe(true);
      expect(inspectResultSchema.safeParse(fixture.result).success).toBe(true);
    }
    for (const side of ['before', 'at', 'after'] as const) expect(inspectResultSchema.safeParse(treasuryAtBoundary(side)).success).toBe(true);
  });
  it('rejects mixed identities and caller-controlled fixture data', () => {
    for (const extra of [{ mint: VALID }, { owner: VALID }, { cluster: 'devnet' }, { balances: {} }, { fetchedAt: 'now' }]) {
      expect(inspectRequestSchema.safeParse({ mode: 'fixture', fixtureId: 'treasury-scaled', ...extra }).success).toBe(false);
    }
    expect(inspectRequestSchema.safeParse({ mode: 'live', cluster: 'devnet', mint: VALID, fixtureId: 'treasury-scaled' }).success).toBe(false);
    expect(inspectRequestSchema.safeParse({ cluster: 'devnet', mint: VALID, fixtureId: 'treasury-scaled' }).success).toBe(false);
    expect(inspectRequestSchema.safeParse({ mode: 'fixture', fixtureId: 'unregistered' }).success).toBe(false);
  });
  it('explicitly migrates the deployed live request shape', () => {
    expect(inspectRequestSchema.parse({ cluster: 'mainnet-beta', mint: VALID })).toEqual({ mode: 'live', cluster: 'mainnet-beta', mint: VALID });
  });
  it('rejects base58 strings of plausible length that do not decode to 32 bytes', () => {
    expect(addressSchema.safeParse('1'.repeat(33)).success).toBe(false);
    expect(addressSchema.safeParse('z'.repeat(44)).success).toBe(false);
  });
});
