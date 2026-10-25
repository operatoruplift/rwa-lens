-- Rate-limit privacy: counters stop accumulating, and a counter is stored under
-- a keyed hash (HMAC-SHA-256) instead of the plain SHA-256 the app sends.
--
-- Both limiter entry points keep their exact signatures, grants and return
-- shapes, so the app deployed before or after this migration works unchanged:
--   public.rwa_consume_rate_limit(text,integer,integer)          RWA_SUPABASE_* path
--   public.consume_rate_limit(text,text,integer,integer)         legacy RATE_LIMIT_SECRET path;
--                                                                replaced only where it already
--                                                                exists (the production project)
-- Both now count through rwa_private.consume_rate_window, which deletes every
-- counter whose window has ended and then counts under
-- HMAC-SHA-256(key, p_key). The key is 32 random bytes generated here, kept in
-- rwa_private.rate_limit_key, and readable only by the table owner: anon,
-- authenticated and service_role have no grant on it or on its schema. No new
-- environment variable or secret is needed.
begin;

-- Supabase installs pgcrypto in the extensions schema; both are no-ops there.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists rwa_private.rate_limit_key (
  id boolean primary key default true check (id),
  secret bytea not null check (length(secret) = 32),
  created_at timestamptz not null default now()
);
alter table rwa_private.rate_limit_key enable row level security;
-- No policies: RLS denies every row to anyone but the owner, on top of no grants.
revoke all on rwa_private.rate_limit_key from public, anon, authenticated, service_role;
-- Seeded once. Re-running the migration keeps the existing key.
insert into rwa_private.rate_limit_key (secret) values (extensions.gen_random_bytes(32))
on conflict (id) do nothing;

-- The one place a counter is written. Not callable by any API role: both public
-- entry points below run as the owner and call it.
create or replace function rwa_private.consume_rate_window(p_key text, p_limit integer, p_window_seconds integer)
returns rwa_private.rate_windows
language plpgsql security definer set search_path = '' as $$
declare
  hashed text;
  observed rwa_private.rate_windows%rowtype;
begin
  if p_key is null or length(p_key) > 100 or p_limit is null or p_limit < 1 or p_limit > 1000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid limit';
  end if;
  -- STRICT: a missing key raises, so the app fails closed for sign-in and saving
  -- and falls back to its per-instance counter for public reads.
  select encode(extensions.hmac(convert_to(p_key, 'UTF8'), k.secret, 'sha256'), 'hex')
  into strict hashed from rwa_private.rate_limit_key k where k.id;
  -- Retention: every counter whose window has ended is deleted before counting.
  delete from rwa_private.rate_windows where reset_at <= now();
  insert into rwa_private.rate_windows as existing values (hashed, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set used = existing.used + 1
  returning * into observed;
  return observed;
end; $$;
revoke all on function rwa_private.consume_rate_window(text,integer,integer) from public, anon, authenticated, service_role;

create or replace function public.rwa_consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare observed rwa_private.rate_windows%rowtype;
begin
  select * into observed from rwa_private.consume_rate_window(p_key, p_limit, p_window_seconds);
  return jsonb_build_object('allowed', observed.used <= p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from observed.reset_at - now()))::integer));
end; $$;
-- Unchanged from 202609200001: Supabase grants new public functions to the API
-- roles directly, so each one is revoked by name, not only PUBLIC.
revoke all on function public.rwa_consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.rwa_consume_rate_limit(text,integer,integer) to service_role;

-- The legacy limiter predates this repository (production migration
-- create_rate_limiter). Where it exists it is replaced in place: same signature,
-- same grants (the deployed app calls it with the publishable key, so anon keeps
-- EXECUTE), same refusal for a wrong secret. It now counts in the keyed,
-- self-pruning table instead of private.rate_limits. Where it does not exist,
-- nothing is created, so a fresh RWA database gains no function for anon.
do $legacy$
begin
  if to_regprocedure('public.consume_rate_limit(text,text,integer,integer)') is null then
    return;
  end if;
  execute $ddl$
    create or replace function public.consume_rate_limit(p_secret text, p_key text, p_limit integer, p_window_seconds integer)
    returns table(allowed boolean, remaining integer, retry_after integer)
    language plpgsql security definer set search_path = '' as $fn$
    declare observed rwa_private.rate_windows%rowtype;
    begin
      -- Wrong or missing secret (or no configured secret): refuse, and touch no counter.
      if p_secret is null or p_secret is distinct from (select c.secret from private.rate_limit_config c where c.id) then
        return query select false, 0, p_window_seconds;
        return;
      end if;
      if p_key is null or length(p_key) > 100 or p_limit is null or p_limit < 1 or p_limit > 1000
         or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
        return query select false, 0, p_window_seconds;
        return;
      end if;
      select * into observed from rwa_private.consume_rate_window(p_key, p_limit, p_window_seconds);
      return query select observed.used <= p_limit, greatest(p_limit - observed.used, 0),
        greatest(1, ceil(extract(epoch from observed.reset_at - now()))::integer);
    end; $fn$
  $ddl$;
end $legacy$;

-- Delete every counter stored under the app's plain key (`scope:` plus a
-- shortened SHA-256). A keyed counter is exactly 64 hex characters and an app
-- key never is, so a re-run keeps live keyed counters. Nothing writes
-- private.rate_limits any more, so all of its rows go. These only count
-- requests within a 60-second window.
delete from rwa_private.rate_windows where key !~ '^[0-9a-f]{64}$';
do $legacy_rows$
begin
  if to_regclass('private.rate_limits') is not null then
    execute 'delete from private.rate_limits';
  end if;
end $legacy_rows$;

commit;

-- Rollout: safe before or after the app deploys; no app change is required and
-- no environment variable is added. Apply it before the privacy page that
-- describes it goes live. The only visible effect is that current one-minute
-- windows restart. The legacy entry point now refuses keys over 100
-- characters, limits over 1000 and windows over 3600 s, like the dedicated one;
-- the app sends keys of about 40 characters, limits up to 120 and 60 s.
-- Verify after applying (tests/rwa/rate-limit-migration.test.ts covers each):
--   select count(*) from private.rate_limits;            -- 0, and stays 0
--   select key from rwa_private.rate_windows limit 1;    -- 64 hex characters
--   anon/authenticated/service_role: "permission denied" for rwa_private.rate_limit_key
--   and for rwa_private.consume_rate_window.
-- Rotate the key (all current windows restart):
--   update rwa_private.rate_limit_key set secret = extensions.gen_random_bytes(32);
--   delete from rwa_private.rate_windows;
-- Roll back: re-create the two public functions from their previous definitions
-- (202609200001 and the production create_rate_limiter migration), then
--   drop function rwa_private.consume_rate_window(text,integer,integer);
--   drop table rwa_private.rate_limit_key;
-- private.rate_limits and private.prune_rate_limits() are left in place, empty
-- and unused, so that rollback needs no table re-creation.
