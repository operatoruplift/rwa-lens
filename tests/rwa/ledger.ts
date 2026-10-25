import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * The migration ledger: every file in supabase/migrations, applied to an in-memory
 * Postgres in the order Supabase applies them (by the timestamp that names each one).
 * The first two files are the production project's own earliest migrations, copied
 * verbatim, so the test database is built exactly as the hosted one was.
 * Nothing here reaches a hosted database.
 */
const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
/** The limiter the production project created before this repository existed. */
export const LEGACY_LIMITER = '20260917115456_create_rate_limiter.sql';

export const migrationSql = (name: string): string => readFileSync(new URL(name, MIGRATIONS), 'utf8');

/** Migration file names in ledger order, minus any a test leaves out on purpose. */
export function ledger(options: { skip?: readonly string[] } = {}): string[] {
  const skipped = new Set(options.skip ?? []);
  return readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql') && !skipped.has(name)).sort();
}

/**
 * An empty database shaped like a Supabase project: the API roles, the default
 * grants Supabase gives them on every new public table and function (which a
 * migration must revoke by name), pgcrypto in the extensions schema on the search
 * path, and the parts of the auth schema the ledger refers to.
 */
export async function emptySupabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    set search_path = public, extensions;
  `);
  return db;
}

export async function apply(db: PGlite, names: readonly string[]): Promise<void> {
  for (const name of names) await db.exec(migrationSql(name));
}

/** The ledger up to, but not including, one migration; then that migration and the rest. */
export function splitLedger(at: string, options: { skip?: readonly string[] } = {}): { before: string[]; from: string[] } {
  const names = ledger(options);
  const index = names.indexOf(at);
  if (index < 0) throw new Error(`${at} is not in supabase/migrations`);
  return { before: names.slice(0, index), from: names.slice(index) };
}
