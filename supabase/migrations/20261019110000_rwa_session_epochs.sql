-- Session epochs: a per-wallet counter that every authenticated request compares
-- with the one its cookie carries, so sign-out and Delete my data end every copy
-- of a session, not only the cookie in one browser. The table lives in
-- rwa_private with no grant to any API role; the service role reaches it only
-- through public.rwa_session_epoch(p_owner_id, p_action):
--   read   the wallet's epoch, 0 when it has no row
--   touch  sign-in: ensure the row, refresh touched_at, return the epoch the new session carries
--   bump   sign-out: epoch + 1, so every session issued before it stops working
-- rwa_delete_wallet_data bumps as well, in the same transaction as the deletion.
--
-- Retention: a session lives 24 hours (lib/server/rwa/session.ts). touch and bump
-- first delete every row not touched for 25 hours; no live session can still
-- carry such a row's epoch, so a wallet address stays here at most about a day
-- after its last sign-in, sign-out or deletion. A row holds the address, a
-- number and a time, nothing else.
begin;

create table if not exists rwa_private.session_epochs (
  owner_id text primary key check (owner_id ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  epoch integer not null default 1 check (epoch >= 1),
  touched_at timestamptz not null default now()
);
create index if not exists rwa_session_epochs_touched_idx on rwa_private.session_epochs(touched_at);
revoke all on rwa_private.session_epochs from public, anon, authenticated, service_role;

create or replace function public.rwa_session_epoch(p_owner_id text, p_action text default 'read') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_epoch integer;
begin
  if p_owner_id is null or p_owner_id !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'invalid owner';
  end if;
  if p_action = 'read' then
    select epoch into current_epoch from rwa_private.session_epochs where owner_id = p_owner_id;
    return coalesce(current_epoch, 0);
  end if;
  if p_action not in ('touch', 'bump') then
    raise exception 'invalid action';
  end if;
  delete from rwa_private.session_epochs where touched_at < now() - interval '25 hours';
  insert into rwa_private.session_epochs as existing (owner_id) values (p_owner_id)
  on conflict (owner_id) do update
    set epoch = case when p_action = 'bump' then existing.epoch + 1 else existing.epoch end,
        touched_at = now()
  returning epoch into current_epoch;
  return current_epoch;
end; $$;
-- Supabase grants new public functions to the API roles directly; revoke by name.
revoke all on function public.rwa_session_epoch(text, text) from public, anon, authenticated;
grant execute on function public.rwa_session_epoch(text, text) to service_role;

-- Delete my data, as in 20261008081848, plus the bump: a wallet whose data is
-- deleted is signed out everywhere in the same transaction. Same signature,
-- same return shape, same grants.
create or replace function public.rwa_delete_wallet_data(p_owner_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  deleted_reports integer;
  deleted_challenges integer;
begin
  if p_owner_id is null or p_owner_id !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'invalid owner';
  end if;
  delete from public.rwa_wallet_reports where owner_id = p_owner_id;
  get diagnostics deleted_reports = row_count;
  delete from rwa_private.auth_challenges where challenge->>'address' = p_owner_id;
  get diagnostics deleted_challenges = row_count;
  perform public.rwa_session_epoch(p_owner_id, 'bump');
  return jsonb_build_object('reports', deleted_reports, 'challenges', deleted_challenges);
end; $$;
revoke all on function public.rwa_delete_wallet_data(text) from public, anon, authenticated;
grant execute on function public.rwa_delete_wallet_data(text) to service_role;

commit;

-- Rollout: apply BEFORE deploying an app that includes it. That app checks the
-- epoch on every authenticated request and fails closed, so without this
-- migration every session reads as unavailable (HTTP 503). With saved reports
-- off (production today) there is no live session either way. Verify after
-- applying (tests/rwa/ledger-migration.test.ts covers each):
--   select public.rwa_session_epoch('<wallet>');            -- 0 for a wallet that never signed in
--   touch returns 1 and keeps returning 1; bump returns 2; read then returns 2
--   rwa_delete_wallet_data raises the wallet's epoch by one
--   anon/authenticated: "permission denied" for the function; every API role for the table
-- Roll back:
--   re-create public.rwa_delete_wallet_data from 20261008081848_rwa_delete_wallet_data.sql;
--   drop function public.rwa_session_epoch(text, text);
--   drop table rwa_private.session_epochs;
