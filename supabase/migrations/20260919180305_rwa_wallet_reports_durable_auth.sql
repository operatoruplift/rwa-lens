-- Additive RWA Lens-only schema. Existing UUID-owner rwa_reports and legacy
-- consume_rate_limit remain untouched. Apply only to the independent RWA DB.
begin;
create schema if not exists rwa_private;
revoke all on schema rwa_private from public, anon, authenticated;

create table if not exists public.rwa_wallet_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null check (length(owner_id) between 32 and 44),
  cluster text not null check (cluster in ('devnet','mainnet-beta','fixture')),
  mint text not null,
  owner_address text,
  observation jsonb not null,
  decoder_version text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check (mode in ('live','fixture','recorded')),
  created_at timestamptz not null default now()
);
create index if not exists rwa_wallet_reports_owner_created_idx on public.rwa_wallet_reports(owner_id, created_at desc);
alter table public.rwa_wallet_reports enable row level security;
revoke all on public.rwa_wallet_reports from public, anon, authenticated;
revoke all on public.rwa_wallet_reports from service_role;
grant select, insert on public.rwa_wallet_reports to service_role;
-- No wallet JWT mapping exists. The server's service role bypasses RLS and must
-- always filter owner_id; no anonymous/authenticated RLS policies are created.

create table if not exists rwa_private.auth_challenges (
  nonce text primary key,
  challenge jsonb not null,
  expires_at timestamptz not null
);
create table if not exists rwa_private.rate_windows (
  key text primary key,
  used integer not null,
  reset_at timestamptz not null
);
create index if not exists rwa_auth_challenges_expiry_idx on rwa_private.auth_challenges(expires_at);
create index if not exists rwa_rate_windows_expiry_idx on rwa_private.rate_windows(reset_at);
revoke all on all tables in schema rwa_private from public, anon, authenticated;

create or replace function public.rwa_issue_challenge(p_challenge jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if length(p_challenge->>'nonce') <> 32 or (p_challenge->>'expiresAt')::timestamptz > now() + interval '5 minutes 5 seconds'
     or (p_challenge->>'expiresAt')::timestamptz <= now() then raise exception 'invalid challenge'; end if;
  delete from rwa_private.auth_challenges where expires_at <= now();
  insert into rwa_private.auth_challenges values (p_challenge->>'nonce', p_challenge, (p_challenge->>'expiresAt')::timestamptz);
  return jsonb_build_object('stored',true);
end; $$;

create or replace function public.rwa_consume_challenge(p_nonce text, p_address text, p_browser_hash text, p_origin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  -- Atomic across instances: concurrent DELETEs can return at most one row.
  delete from rwa_private.auth_challenges
  where nonce = p_nonce and expires_at > now()
    and challenge->>'address' = p_address and challenge->>'browserHash' = p_browser_hash
    and challenge->>'origin' = p_origin
  returning challenge into result;
  return result;
end; $$;

create or replace function public.rwa_consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare observed rwa_private.rate_windows%rowtype;
begin
  if length(p_key) > 100 or p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 3600 then raise exception 'invalid limit'; end if;
  delete from rwa_private.rate_windows where reset_at <= now();
  insert into rwa_private.rate_windows as existing values (p_key,1,now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set used = existing.used + 1
  returning * into observed;
  return jsonb_build_object('allowed',observed.used <= p_limit,'retry_after',greatest(1,ceil(extract(epoch from observed.reset_at-now()))::integer));
end; $$;
revoke all on function public.rwa_issue_challenge(jsonb) from public, anon, authenticated;
revoke all on function public.rwa_consume_challenge(text,text,text,text) from public, anon, authenticated;
revoke all on function public.rwa_consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.rwa_issue_challenge(jsonb) to service_role;
grant execute on function public.rwa_consume_challenge(text,text,text,text) to service_role;
grant execute on function public.rwa_consume_rate_limit(text,integer,integer) to service_role;
commit;

-- Safe rollout/rollback: leave RWA_REPORTS_ENABLED=false while applying. Verify
-- anonymous table/RPC denial and two-wallet isolation before enabling. Roll back
-- application exposure by setting the flag false; retain reports for recovery.
-- Forward repair new objects only; do not drop existing rwa_reports or its data.
