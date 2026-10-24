import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply, emptySupabase, ledger } from './ledger';

// A hundred inserts or four 4 MiB rows take seconds alone and far longer while every
// other test file runs on a loaded machine. The budget grows instead of the coverage.
vi.setConfig({ testTimeout: 60_000 });

/** The whole migration ledger on an in-memory Postgres shaped like the production project. Nothing here reaches a hosted database. */
let db: PGlite;
const USER_A = randomUUID();
const USER_B = randomUUID();
const MINT = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';

/** A PostgREST request: the JWT subject as a setting, then the API role. */
async function asUser<T>(user: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try { return await run(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
async function asServiceRole<T>(run: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try { return await run(); } finally { await db.exec('reset role'); }
}
const insertReport = (owner: string) => db.query("insert into public.rwa_reports (owner_id, cluster, mint, observation, decoder_version, content_hash) values ($1, 'mainnet-beta', $2, '{}'::jsonb, 'test', $3)", [owner, MINT, 'a'.repeat(64)]);
const countReports = async () => Number((await db.query<{ n: number }>('select count(*)::int as n from public.rwa_reports')).rows[0].n);

// Starting Postgres compiles a WebAssembly build: a few seconds alone, but over a minute
// while every other test file runs on a loaded machine. The budget grows instead.
beforeAll(async () => {
  db = await emptySupabase();
  await apply(db, ledger());
  await db.query('insert into auth.users (id) values ($1), ($2)', [USER_A, USER_B]);
}, 180_000);
afterAll(async () => { await db?.close(); });

describe('the ledger', () => {
  it('starts with the migrations exactly as production applied them, in order', () => {
    expect(ledger().slice(0, 5)).toEqual([
      '20260916085527_create_rwa_reports.sql',
      '20260917115456_create_rate_limiter.sql',
      '20260919180305_rwa_wallet_reports_durable_auth.sql',
      '20261008081848_rwa_delete_wallet_data.sql',
      '20261008142115_rwa_rate_limit_privacy.sql',
    ]);
  });
});

describe('rwa_reports after the anon revoke', () => {
  it('leaves anon no privilege and authenticated exactly select, insert and delete', async () => {
    const { rows } = await db.query<{ grantee: string; privilege: string; granted: boolean }>(`
      select grantee, privilege, has_table_privilege(grantee, 'public.rwa_reports', privilege) as granted
      from unnest(array['anon', 'authenticated']) as grantee, unnest(array['select', 'insert', 'update', 'delete']) as privilege
      order by grantee, privilege`);
    expect(rows.filter(row => row.granted).map(row => `${row.grantee}:${row.privilege}`)).toEqual(['authenticated:delete', 'authenticated:insert', 'authenticated:select']);
  });

  it('refuses an anonymous read, write or delete outright', async () => {
    for (const statement of ['select * from public.rwa_reports', 'delete from public.rwa_reports']) {
      await expect(asUser(null, () => db.query(statement))).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(null, () => insertReport(USER_A))).rejects.toThrow(/permission denied/);
  });

  it('lets a signed-in user see, write and delete only rows that are theirs', async () => {
    await asUser(USER_A, () => insertReport(USER_A));
    await asUser(USER_B, () => insertReport(USER_B));
    await expect(asUser(USER_A, () => insertReport(USER_B))).rejects.toThrow(/row-level security/);
    expect(await asUser(USER_A, countReports)).toBe(1);
    expect(await asUser(USER_B, countReports)).toBe(1);
    // Another owner's row is invisible to a delete, so nothing happens and nothing is reported.
    expect((await asUser(USER_A, () => db.query('delete from public.rwa_reports where owner_id = $1', [USER_B]))).affectedRows).toBe(0);
    expect(await countReports()).toBe(2);
    expect((await asUser(USER_B, () => db.query('delete from public.rwa_reports'))).affectedRows).toBe(1);
    expect(await countReports()).toBe(1);
  });

  it('evaluates auth.uid() once per statement in every policy', async () => {
    const { rows } = await db.query<{ policyname: string; roles: string[]; qual: string | null; with_check: string | null }>("select policyname, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'rwa_reports' order by policyname");
    expect(rows.map(row => row.policyname)).toEqual(['rwa_reports_delete_own', 'rwa_reports_insert_own', 'rwa_reports_select_own']);
    for (const row of rows) {
      expect(row.roles).toEqual(['authenticated']);
      const expression = row.with_check ?? row.qual;
      expect(expression).toMatch(/\( ?SELECT auth\.uid\(\) AS uid ?\)/);
      expect(expression).not.toMatch(/\(auth\.uid\(\) = owner_id\)/);
    }
  });
});

describe('saved report quota', () => {
  const ALICE = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS';
  const BOB = '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie';
  /** A save as the app performs it: the service role inserts, and the trigger reads as that role. */
  const save = (owner: string, observation = "'{}'::jsonb") => asServiceRole(() => db.query(`insert into public.rwa_wallet_reports (owner_id, cluster, mint, observation, decoder_version, content_hash, mode) values ($1, 'mainnet-beta', $2, ${observation}, 'test', $3, 'live')`, [owner, MINT, 'a'.repeat(64)]));
  const held = async (owner: string) => Number((await db.query<{ n: number }>('select count(*)::int as n from public.rwa_wallet_reports where owner_id = $1', [owner])).rows[0].n);
  const FOUR_MIB = "jsonb_build_object('blob', repeat('x', 4 * 1024 * 1024))";
  beforeEach(async () => { await db.exec('truncate public.rwa_wallet_reports'); });

  it('refuses the 101st report of one wallet with RW001 and leaves another wallet unaffected', async () => {
    for (let i = 0; i < 100; i++) await save(ALICE);
    await expect(save(ALICE)).rejects.toMatchObject({ code: 'RW001', message: expect.stringContaining('100 reports'), hint: expect.stringContaining('Delete my data') });
    expect(await held(ALICE)).toBe(100);
    await save(BOB);
    expect(await held(BOB)).toBe(1);
  });

  it('refuses the report that would take one wallet past 16 MiB with RW002, while a smaller one still fits', async () => {
    for (let i = 0; i < 3; i++) await save(ALICE, FOUR_MIB);
    await expect(save(ALICE, FOUR_MIB)).rejects.toMatchObject({ code: 'RW002', message: expect.stringContaining('16 MiB') });
    await save(ALICE);
    expect(await held(ALICE)).toBe(4);
  });

  it('is freed by Delete my data', async () => {
    for (let i = 0; i < 100; i++) await save(ALICE);
    await expect(save(ALICE)).rejects.toMatchObject({ code: 'RW001' });
    await asServiceRole(() => db.query('select public.rwa_delete_wallet_data($1)', [ALICE]));
    await save(ALICE);
    expect(await held(ALICE)).toBe(1);
  });

  it('runs before every insert with an empty search path, and only as a trigger', async () => {
    const { rows } = await db.query<{ tgname: string; tgenabled: string; prosecdef: boolean; proconfig: string[] }>("select t.tgname, t.tgenabled, p.prosecdef, p.proconfig from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.rwa_wallet_reports'::regclass and not t.tgisinternal");
    expect(rows).toEqual([{ tgname: 'rwa_wallet_reports_quota', tgenabled: 'O', prosecdef: false, proconfig: ['search_path=""'] }]);
    await expect(db.query('select rwa_private.enforce_report_quota()')).rejects.toThrow(/trigger/);
  });
});

describe('session epochs', () => {
  const CAROL = 'So11111111111111111111111111111111111111112';
  const DAVE = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const epoch = (owner: string | null, action = 'read') => asServiceRole(async () => Number((await db.query<{ e: number }>('select public.rwa_session_epoch($1, $2) as e', [owner, action])).rows[0].e));
  const rows = async () => (await db.query<{ owner_id: string }>('select owner_id from rwa_private.session_epochs order by owner_id')).rows.map(row => row.owner_id);
  beforeEach(async () => { await db.exec('truncate rwa_private.session_epochs'); });

  it('starts at 0, is set by a sign-in, kept by another sign-in and moved on by a sign-out', async () => {
    expect(await epoch(CAROL)).toBe(0);
    expect(await epoch(CAROL, 'touch')).toBe(1);
    expect(await epoch(CAROL, 'touch')).toBe(1);
    expect(await epoch(CAROL, 'bump')).toBe(2);
    expect(await epoch(CAROL)).toBe(2);
    expect(await epoch(DAVE)).toBe(0);
  });

  it('is moved on by Delete my data in the same call', async () => {
    await epoch(CAROL, 'touch');
    await asServiceRole(() => db.query('select public.rwa_delete_wallet_data($1)', [CAROL]));
    expect(await epoch(CAROL)).toBe(2);
  });

  it('forgets a wallet about a day after its last sign-in or sign-out, once no session can still carry its epoch', async () => {
    await epoch(CAROL, 'touch');
    await epoch(DAVE, 'bump');
    await db.query("update rwa_private.session_epochs set touched_at = now() - interval '26 hours' where owner_id = $1", [DAVE]);
    expect(await epoch(DAVE)).toBe(1);
    await epoch(CAROL, 'touch');
    expect(await rows()).toEqual([CAROL]);
    expect(await epoch(DAVE)).toBe(0);
  });

  it.each([null, 'short', "' or true --"])('rejects an owner that is not a Solana address: %s', async owner => {
    await expect(epoch(owner, 'touch')).rejects.toThrow(/invalid owner/);
    expect(await rows()).toEqual([]);
  });

  it('rejects an unknown action', async () => {
    await expect(epoch(CAROL, 'reset')).rejects.toThrow(/invalid action/);
  });

  it('is reachable only by the service role, and the table by no API role at all', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await db.exec(`set role ${role}`);
      try { await expect(db.query('select public.rwa_session_epoch($1, $2)', [CAROL, 'read'])).rejects.toThrow(/permission denied/); } finally { await db.exec('reset role'); }
    }
    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      await db.exec(`set role ${role}`);
      try { await expect(db.query('select * from rwa_private.session_epochs')).rejects.toThrow(/permission denied/); } finally { await db.exec('reset role'); }
    }
    const { rows: definers } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>("select proname, prosecdef, proconfig from pg_proc where proname in ('rwa_session_epoch', 'rwa_delete_wallet_data') order by proname");
    expect(definers.map(row => [row.proname, row.prosecdef, row.proconfig])).toEqual([['rwa_delete_wallet_data', true, ['search_path=""']], ['rwa_session_epoch', true, ['search_path=""']]]);
  });
});
