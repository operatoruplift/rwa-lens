-- Delete my data: one wallet's saved reports and its sign-in challenges, in one
-- transaction. Additive: no table privilege changes. The service role still has
-- no direct DELETE on rwa_wallet_reports; it can only call this owner-scoped
-- function, and the server passes the owner from a verified wallet session.
begin;

create or replace function public.rwa_delete_wallet_data(p_owner_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  deleted_reports integer;
  deleted_challenges integer;
begin
  -- A Solana address is 32 to 44 base58 characters. Anything else deletes nothing.
  if p_owner_id is null or p_owner_id !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'invalid owner';
  end if;
  delete from public.rwa_wallet_reports where owner_id = p_owner_id;
  get diagnostics deleted_reports = row_count;
  -- Pending and expired challenges both name the wallet in their stored message.
  delete from rwa_private.auth_challenges where challenge->>'address' = p_owner_id;
  get diagnostics deleted_challenges = row_count;
  return jsonb_build_object('reports', deleted_reports, 'challenges', deleted_challenges);
end; $$;

revoke all on function public.rwa_delete_wallet_data(text) from public, anon, authenticated;
grant execute on function public.rwa_delete_wallet_data(text) to service_role;
commit;

-- Rollout: apply with RWA_REPORTS_ENABLED=false or true; the app calls this only
-- from DELETE /api/rwa/account after verifying the session and exact origin.
-- Verify after applying: anon and authenticated get "permission denied", the
-- service role still cannot DELETE the table directly, and one wallet's call
-- leaves another wallet's rows intact (tests/rwa/wallet-data-migration.test.ts).
-- Roll back with: drop function public.rwa_delete_wallet_data(text);
