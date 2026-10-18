import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apply, emptySupabase, ledger } from './ledger';

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
