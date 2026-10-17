import { createHash, createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_LIMITER, apply, emptySupabase, migrationSql, splitLedger } from './ledger';

/** The real migration ledger, applied in production order to in-memory Postgres. Nothing here reaches a hosted database. */
const PRIVACY_MIGRATION = '20261008142115_rwa_rate_limit_privacy.sql';
const NEW_MIGRATION = migrationSql(PRIVACY_MIGRATION);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** The key the app sends: the request kind and a shortened plain SHA-256 of the client network (lib/server/rwa/rate-limit.ts). */
const appKey = (scope: string, ip: string) => `${scope}:${sha256(ip).slice(0, 32)}`;
type Role = 'anon' | 'authenticated' | 'service_role';
const API_ROLES: Role[] = ['anon', 'authenticated', 'service_role'];

/**
 * The ledger up to the privacy migration, a seed of what the database held at that
 * point, then the privacy migration and everything after it. The production shape
 * includes the legacy limiter; a fresh RWA database never had one.
 */
async function database(withLegacyLimiter: boolean, seed: (db: PGlite) => Promise<void> = async () => undefined): Promise<PGlite> {
  const db = await emptySupabase();
  const { before, from } = splitLedger(PRIVACY_MIGRATION, { skip: withLegacyLimiter ? [] : [LEGACY_LIMITER] });
  await apply(db, before);
  await seed(db);
  await apply(db, from);
  return db;
}

let prod: PGlite;
let fresh: PGlite;
let legacySecret: string;

async function asRole<T>(db: PGlite, role: Role, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try { return await run(); } finally { await db.exec('reset role'); }
}
const consume = (db: PGlite, key: string, limit: number, windowSeconds = 60) =>
  asRole(db, 'service_role', async () => (await db.query<{ r: { allowed: boolean; retry_after: number } }>('select public.rwa_consume_rate_limit($1, $2, $3) as r', [key, limit, windowSeconds])).rows[0].r);
const consumeLegacy = (secret: string | null, key: string, limit: number, windowSeconds = 60) =>
  asRole(prod, 'anon', async () => (await prod.query<{ allowed: boolean; remaining: number; retry_after: number }>('select * from public.consume_rate_limit($1, $2, $3, $4)', [secret, key, limit, windowSeconds])).rows[0]);
const storedKeys = async (db: PGlite) => (await db.query<{ key: string }>('select key from rwa_private.rate_windows order by key')).rows.map(row => row.key);
const legacyRows = async () => Number((await prod.query<{ n: number }>('select count(*)::int as n from private.rate_limits')).rows[0].n);
const databaseKey = async (db: PGlite) => Buffer.from((await db.query<{ secret: Uint8Array }>('select secret from rwa_private.rate_limit_key')).rows[0].secret);
const expire = (db: PGlite, where = 'true') => db.exec(`update rwa_private.rate_windows set reset_at = now() - interval '1 second' where ${where}`);

// Starting Postgres compiles a WebAssembly build: a few seconds alone, but over a minute
// while every other test file runs on a loaded machine. The budget grows instead.
beforeAll(async () => {
  [prod, fresh] = await Promise.all([
    database(true, async db => {
      // What production held before the privacy migration: counters stored under the plain app key, most of them long expired.
      for (let i = 0; i < 50; i++) {
        await db.query(`insert into private.rate_limits values ($1, 1, now() - make_interval(days => $2))`, [appKey('inspect', `198.51.100.${i}`), i === 0 ? 0 : 2]);
      }
      await db.query(`insert into rwa_private.rate_windows values ($1, 3, now() + interval '30 seconds'), ($2, 1, now() - interval '3 days')`, [appKey('auth', '198.51.100.1'), appKey('reports', '198.51.100.2')]);
    }),
    database(false),
  ]);
  legacySecret = (await prod.query<{ secret: string }>('select secret from private.rate_limit_config')).rows[0].secret;
}, 240_000);
afterAll(async () => { await Promise.all([prod?.close(), fresh?.close()]); });

describe('migration on the production shape', () => {
  it('deletes every counter stored under the old plain hash, in both limiter tables', async () => {
    // beforeAll seeded 50 legacy rows (49 older than a day) and 2 dedicated rows before migrating.
    expect(await legacyRows()).toBe(0);
    expect(await storedKeys(prod)).toEqual([]);
  });

  it('keeps one 32-byte random key and live keyed counters when the migration runs again', async () => {
    const before = await databaseKey(prod);
    expect(before).toHaveLength(32);
    await consume(prod, appKey('inspect', '203.0.113.50'), 30);
    const live = await storedKeys(prod);
    // A counter written under the plain app key, as a rolled-back function would, is still removed.
    await prod.query(`insert into rwa_private.rate_windows values ($1, 1, now() + interval '30 seconds')`, [appKey('inspect', '203.0.113.51')]);
    await prod.query(`insert into private.rate_limits values ($1, 1, now())`, [appKey('inspect', '203.0.113.52')]);
    await prod.exec(NEW_MIGRATION);
    expect((await databaseKey(prod)).equals(before)).toBe(true);
    expect((await prod.query<{ n: number }>('select count(*)::int as n from rwa_private.rate_limit_key')).rows[0].n).toBe(1);
    expect(await storedKeys(prod)).toEqual(live);
    expect(await legacyRows()).toBe(0);
    await prod.exec('delete from rwa_private.rate_windows');
  });
});

describe('keyed hash', () => {
  beforeEach(async () => { await prod.exec('delete from rwa_private.rate_windows'); });

  it('stores HMAC-SHA-256 under the database key, never the plain SHA-256 the app sends', async () => {
    const key = appKey('inspect', '203.0.113.7');
    await consume(prod, key, 30);
    const [stored] = await storedKeys(prod);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).toBe(createHmac('sha256', await databaseKey(prod)).update(key).digest('hex'));
    expect(stored).not.toBe(sha256(key));
    expect(stored).not.toBe(sha256('203.0.113.7'));
    expect(stored).not.toContain(key.split(':')[1]);
  });

  it('cannot be matched back to an IP by hashing candidate addresses without the key', async () => {
    await consume(prod, appKey('inspect', '203.0.113.7'), 30);
    const [stored] = await storedKeys(prod);
    const candidates = Array.from({ length: 256 }, (_, i) => appKey('inspect', `203.0.113.${i}`));
    // Plain SHA-256 guesses, as the old scheme allowed, find nothing.
    expect(candidates.flatMap(candidate => [candidate, sha256(candidate)])).not.toContain(stored);
    // Only the database key recovers the match.
    const key = await databaseKey(prod);
    expect(candidates.filter(candidate => createHmac('sha256', key).update(candidate).digest('hex') === stored)).toEqual([appKey('inspect', '203.0.113.7')]);
  });

  it('uses a different random key in every database', async () => {
    expect((await databaseKey(prod)).equals(await databaseKey(fresh))).toBe(false);
    const key = appKey('inspect', '203.0.113.9');
    await consume(prod, key, 30);
    await consume(fresh, key, 30);
    expect(await storedKeys(prod)).not.toEqual(await storedKeys(fresh));
    await fresh.exec('delete from rwa_private.rate_windows');
  });

  it('fails closed without the key instead of storing an unkeyed hash', async () => {
    const saved = await databaseKey(prod);
    await prod.exec('delete from rwa_private.rate_limit_key');
    try {
      await expect(consume(prod, appKey('auth', '203.0.113.7'), 10)).rejects.toThrow(/no rows/);
      expect(await storedKeys(prod)).toEqual([]);
    } finally {
      await prod.query('insert into rwa_private.rate_limit_key (secret) values ($1)', [saved]);
    }
  });
});

describe('limits and retention', () => {
  beforeEach(async () => { await prod.exec('delete from rwa_private.rate_windows'); });

  it('still enforces the limit per client and kind of request', async () => {
    const client = appKey('auth', '203.0.113.7');
    for (let i = 0; i < 3; i++) expect((await consume(prod, client, 3)).allowed).toBe(true);
    const refused = await consume(prod, client, 3);
    expect(refused.allowed).toBe(false);
    expect(refused.retry_after).toBeGreaterThanOrEqual(1);
    expect(refused.retry_after).toBeLessThanOrEqual(60);
    expect((await consume(prod, appKey('auth', '203.0.113.8'), 3)).allowed).toBe(true);
    expect((await consume(prod, appKey('inspect', '203.0.113.7'), 3)).allowed).toBe(true);
  });

  it('deletes every counter whose window has ended the next time the limiter runs', async () => {
    for (let i = 0; i < 50; i++) await consume(prod, appKey('inspect', `203.0.113.${i}`), 30);
    const live = appKey('inspect', '203.0.113.200');
    await consume(prod, live, 30);
    await expire(prod, `key <> '${createHmac('sha256', await databaseKey(prod)).update(live).digest('hex')}'`);
    await consume(prod, appKey('venues', '203.0.113.201'), 30);
    // The 50 expired counters are gone; the live one and the new one remain.
    expect(await storedKeys(prod)).toHaveLength(2);
  });

  it('restarts a client’s count once its window has ended', async () => {
    const client = appKey('auth', '203.0.113.7');
    await consume(prod, client, 1);
    expect((await consume(prod, client, 1)).allowed).toBe(false);
    await expire(prod);
    expect((await consume(prod, client, 1)).allowed).toBe(true);
  });

  it.each([['a'.repeat(101), 10, 60], ['k', 0, 60], ['k', 1001, 60], ['k', 10, 0], ['k', 10, 3601], [null, 10, 60]] as const)('rejects invalid input %#', async (key, limit, windowSeconds) => {
    await expect(asRole(prod, 'service_role', () => prod.query('select public.rwa_consume_rate_limit($1, $2, $3)', [key, limit, windowSeconds]))).rejects.toThrow(/invalid limit/);
    expect(await storedKeys(prod)).toEqual([]);
  });
});

describe('legacy limiter the deployed app calls with the publishable key', () => {
  beforeEach(async () => { await prod.exec('delete from rwa_private.rate_windows'); });

  it('keeps its contract, counts in the keyed table and never writes private.rate_limits', async () => {
    const client = appKey('inspect', '203.0.113.7');
    expect(await consumeLegacy(legacySecret, client, 2)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await consumeLegacy(legacySecret, client, 2)).toMatchObject({ allowed: true, remaining: 0 });
    const refused = await consumeLegacy(legacySecret, client, 2);
    expect(refused).toMatchObject({ allowed: false, remaining: 0 });
    expect(refused.retry_after).toBeGreaterThanOrEqual(1);
    expect(refused.retry_after).toBeLessThanOrEqual(60);
    expect(await storedKeys(prod)).toEqual([createHmac('sha256', await databaseKey(prod)).update(client).digest('hex')]);
    expect(await legacyRows()).toBe(0);
  });

  it('prunes expired counters too', async () => {
    for (let i = 0; i < 10; i++) await consumeLegacy(legacySecret, appKey('inspect', `203.0.113.${i}`), 30);
    await expire(prod);
    await consumeLegacy(legacySecret, appKey('inspect', '203.0.113.99'), 30);
    expect(await storedKeys(prod)).toHaveLength(1);
  });

  it.each([null, '', 'wrong-secret'])('refuses a wrong secret (%s) and touches no counter', async secret => {
    expect(await consumeLegacy(secret, appKey('inspect', '203.0.113.7'), 30)).toEqual({ allowed: false, remaining: 0, retry_after: 60 });
    expect(await storedKeys(prod)).toEqual([]);
  });

  it('refuses invalid input instead of raising, now with the dedicated limiter’s bounds', async () => {
    // The old function accepted keys up to 200 characters and any limit or window.
    expect(await consumeLegacy(legacySecret, 'a'.repeat(101), 30)).toMatchObject({ allowed: false });
    expect(await consumeLegacy(legacySecret, 'k', 1001)).toMatchObject({ allowed: false });
    expect(await consumeLegacy(legacySecret, 'k', 30, 3601)).toMatchObject({ allowed: false });
    expect(await storedKeys(prod)).toEqual([]);
  });
});

describe('access', () => {
  it.each(API_ROLES)('denies %s the key, the counters and the private counting function', async role => {
    for (const statement of ['select * from rwa_private.rate_limit_key', 'select * from rwa_private.rate_windows', "select rwa_private.consume_rate_window('k', 10, 60)"])
      await expect(asRole(prod, role, () => prod.query(statement))).rejects.toThrow(/permission denied/);
  });

  it.each(['anon', 'authenticated'] as const)('denies %s the dedicated limiter', async role => {
    await expect(asRole(prod, role, () => prod.query("select public.rwa_consume_rate_limit('k', 10, 60)"))).rejects.toThrow(/permission denied/);
    await expect(asRole(fresh, role, () => fresh.query("select public.rwa_consume_rate_limit('k', 10, 60)"))).rejects.toThrow(/permission denied/);
  });

  it('grants exactly what the app needs, even past Supabase default grants', async () => {
    const privileges = await prod.query<{ grantee: string; key: boolean; count: boolean; dedicated: boolean; legacy: boolean }>(`
      select grantee,
        has_table_privilege(grantee, 'rwa_private.rate_limit_key', 'select,insert,update,delete') as key,
        has_function_privilege(grantee, 'rwa_private.consume_rate_window(text,integer,integer)', 'execute') as count,
        has_function_privilege(grantee, 'public.rwa_consume_rate_limit(text,integer,integer)', 'execute') as dedicated,
        has_function_privilege(grantee, 'public.consume_rate_limit(text,text,integer,integer)', 'execute') as legacy
      from unnest(array['public', 'anon', 'authenticated', 'service_role']) as grantee order by grantee`);
    expect(privileges.rows).toEqual([
      { grantee: 'anon', key: false, count: false, dedicated: false, legacy: true },
      { grantee: 'authenticated', key: false, count: false, dedicated: false, legacy: true },
      { grantee: 'public', key: false, count: false, dedicated: false, legacy: false },
      { grantee: 'service_role', key: false, count: false, dedicated: true, legacy: true },
    ]);
  });

  it('keeps row level security on the key table and runs every limiter as a definer with an empty search path', async () => {
    expect((await prod.query<{ on: boolean }>("select relrowsecurity as on from pg_class where oid = 'rwa_private.rate_limit_key'::regclass")).rows[0].on).toBe(true);
    const { rows } = await prod.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>("select proname, prosecdef, proconfig from pg_proc where proname in ('consume_rate_window', 'rwa_consume_rate_limit', 'consume_rate_limit') order by proname");
    expect(rows.map(row => row.proname)).toEqual(['consume_rate_limit', 'consume_rate_window', 'rwa_consume_rate_limit']);
    for (const row of rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toContain('search_path=""');
    }
  });
});

describe('migration on a fresh RWA database', () => {
  it('creates no legacy limiter, so anon gains no function', async () => {
    expect((await fresh.query<{ fn: string | null }>("select to_regprocedure('public.consume_rate_limit(text,text,integer,integer)')::text as fn")).rows[0].fn).toBeNull();
    expect((await fresh.query<{ t: string | null }>("select to_regclass('private.rate_limits')::text as t")).rows[0].t).toBeNull();
  });

  it('counts under the keyed hash and denies the API roles the key', async () => {
    const key = appKey('reports', '203.0.113.7');
    expect((await consume(fresh, key, 1)).allowed).toBe(true);
    expect((await consume(fresh, key, 1)).allowed).toBe(false);
    expect(await storedKeys(fresh)).toEqual([createHmac('sha256', await databaseKey(fresh)).update(key).digest('hex')]);
    for (const role of API_ROLES) await expect(asRole(fresh, role, () => fresh.query('select * from rwa_private.rate_limit_key'))).rejects.toThrow(/permission denied/);
  });
});
