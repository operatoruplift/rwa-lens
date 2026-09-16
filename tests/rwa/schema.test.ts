import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  inspectRequestSchema,
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

  it('allows an exact host and its subdomains only', () => {
    expect(isHostAllowed('https://metadata.example.com/a.json', allowed)).toBe(true);
    expect(isHostAllowed('https://cdn.ipfs.io/a.json', allowed)).toBe(true);
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

describe('fixtures are valid against the real schema', () => {
  it('every fixture address passes the same validation a user request does', async () => {
    const { FIXTURES } = await import('@/lib/rwa/fixtures');
    expect(FIXTURES.length).toBeGreaterThan(0);
    for (const fixture of FIXTURES) {
      const mint = fixture.result.identity?.mint;
      expect(mint, `${fixture.id} has no mint`).toBeDefined();
      // A fixture the API would reject is a broken demo, which is worse than none.
      const parsed = inspectRequestSchema.safeParse({ cluster: 'devnet', mint, fixtureId: fixture.id });
      expect(parsed.success, `${fixture.id} mint ${mint} failed validation`).toBe(true);

      for (const account of fixture.result.balances?.accounts ?? []) {
        expect(addressSchema.safeParse(account.tokenAccount).success, `${fixture.id} token account`).toBe(true);
        expect(addressSchema.safeParse(account.owner).success, `${fixture.id} owner`).toBe(true);
        expect(/^\d+$/.test(account.rawAmount), `${fixture.id} raw amount is an integer string`).toBe(true);
      }
    }
  });
});
