import { PGlite } from '@electric-sql/pglite';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apply, emptySupabase, ledger } from './ledger';

/** The whole migration ledger, applied in production order to an in-memory Postgres. Nothing here reaches a hosted database. */
const wallet = (seed: number) => bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(seed)).publicKey);
const ALICE = wallet(21);
const BOB = wallet(22);
const HASH = 'a'.repeat(64);
let db: PGlite;

async function asRole<T>(role: 'anon' | 'authenticated' | 'service_role', run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try { return await run(); } finally { await db.exec('reset role'); }
}
const deleteFor = (owner: string | null) => db.query<{ result: { reports: number; challenges: number } }>('select public.rwa_delete_wallet_data($1) as result', [owner]);
async function count(sql: string, owner: string): Promise<number> {
  return Number((await db.query<{ n: number }>(sql, [owner])).rows[0].n);
}
const reportsOf = (owner: string) => count('select count(*)::int as n from public.rwa_wallet_reports where owner_id = $1', owner);
const challengesOf = (owner: string) => count("select count(*)::int as n from rwa_private.auth_challenges where challenge->>'address' = $1", owner);

// Starting Postgres compiles a WebAssembly build: a few seconds alone, but over a minute
// while every other test file runs on a loaded machine. The budget grows instead.
beforeAll(async () => {
  db = await emptySupabase();
  await apply(db, ledger());
}, 180_000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec('truncate public.rwa_wallet_reports; truncate rwa_private.auth_challenges;');
  for (const [owner, mint] of [[ALICE, 'mint-one'], [ALICE, 'mint-two'], [BOB, 'mint-one']]) {
    await db.query("insert into public.rwa_wallet_reports (owner_id, cluster, mint, observation, decoder_version, content_hash, mode) values ($1, 'mainnet-beta', $2, '{}'::jsonb, 'test', $3, 'live')", [owner, mint, HASH]);
  }
  // One pending and one long-expired challenge for Alice; one pending for Bob.
  for (const [nonce, owner, expiresAt] of [['nonce-alice-pending', ALICE, 'now() + interval \'4 minutes\''], ['nonce-alice-expired', ALICE, 'now() - interval \'2 days\''], ['nonce-bob-pending', BOB, 'now() + interval \'4 minutes\'']]) {
    await db.query(`insert into rwa_private.auth_challenges values ($1, jsonb_build_object('nonce', $1::text, 'address', $2::text), ${expiresAt})`, [nonce, owner]);
  }
});

describe('rwa_delete_wallet_data migration', () => {
  it('deletes every report and sign-in challenge of one wallet, and nothing of another', async () => {
    const { rows } = await asRole('service_role', () => deleteFor(ALICE));
    expect(rows[0].result).toEqual({ reports: 2, challenges: 2 });
    expect(await reportsOf(ALICE)).toBe(0);
    expect(await challengesOf(ALICE)).toBe(0);
    expect(await reportsOf(BOB)).toBe(1);
    expect(await challengesOf(BOB)).toBe(1);
  });

  it('is idempotent, so a retried request finds nothing left to delete', async () => {
    await asRole('service_role', () => deleteFor(ALICE));
    const { rows } = await asRole('service_role', () => deleteFor(ALICE));
    expect(rows[0].result).toEqual({ reports: 0, challenges: 0 });
    expect(await reportsOf(BOB)).toBe(1);
  });

  it.each(['anon', 'authenticated'] as const)('refuses the %s role', async role => {
    await expect(asRole(role, () => deleteFor(ALICE))).rejects.toThrow(/permission denied/);
    expect(await reportsOf(ALICE)).toBe(2);
  });

  it('leaves the service role without a direct DELETE on the reports table', async () => {
    await expect(asRole('service_role', () => db.query('delete from public.rwa_wallet_reports where owner_id = $1', [ALICE]))).rejects.toThrow(/permission denied/);
    expect(await reportsOf(ALICE)).toBe(2);
  });

  it.each([null, '', 'short', `${ALICE}x`.padEnd(45, 'x'), "' or true --", 'O0Il'.repeat(9)])('rejects an owner that is not a Solana address: %s', async owner => {
    await expect(asRole('service_role', () => deleteFor(owner))).rejects.toThrow(/invalid owner/);
    expect(await reportsOf(ALICE)).toBe(2);
    expect(await reportsOf(BOB)).toBe(1);
  });

  it('runs as a security definer with an empty search path', async () => {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef, proconfig from pg_proc where proname = 'rwa_delete_wallet_data'");
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
    expect(rows[0].proconfig).toContain('search_path=""');
  });
});
