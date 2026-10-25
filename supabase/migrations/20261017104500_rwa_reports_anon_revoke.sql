-- Saved reports, legacy UUID-owner table (public.rwa_reports, created by
-- 20260916085527_create_rwa_reports.sql): the anon key gets no privilege on it at
-- all, and each owner policy evaluates auth.uid() once per statement.
--
-- Supabase's default grants gave anon select, insert and delete on the table when
-- it was created. Row level security hid every row from an anonymous caller
-- (auth.uid() is null), but the privilege itself stayed and is revoked here.
-- authenticated keeps select, insert and delete; update has been revoked since
-- the table was created. The three policies are recreated with
-- (select auth.uid()) so the planner evaluates the function once per statement
-- rather than once per row, the form Supabase's performance advisor recommends.
begin;

revoke all on public.rwa_reports from anon;

drop policy if exists rwa_reports_select_own on public.rwa_reports;
create policy rwa_reports_select_own on public.rwa_reports
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists rwa_reports_insert_own on public.rwa_reports;
create policy rwa_reports_insert_own on public.rwa_reports
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists rwa_reports_delete_own on public.rwa_reports;
create policy rwa_reports_delete_own on public.rwa_reports
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

commit;

-- Rollout: safe at any time; the app never touches this table (its reports live
-- in public.rwa_wallet_reports). Verify after applying
-- (tests/rwa/ledger-migration.test.ts covers each):
--   anon: "permission denied" for select, insert and delete on public.rwa_reports
--   authenticated: sees, writes and deletes only rows whose owner_id is its auth.uid()
--   select policyname, qual, with_check from pg_policies where tablename = 'rwa_reports';
--     each shows "( SELECT auth.uid() AS uid)"
-- Roll back: re-run the policy statements of 20260916085527_create_rwa_reports.sql.
-- Granting anon back is not recommended; nothing needs it.
