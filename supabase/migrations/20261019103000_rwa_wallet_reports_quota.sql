-- Saved reports per wallet are capped: at most 100 rows and 16 MiB of report JSON
-- in total. A BEFORE INSERT trigger refuses the row that would exceed either and
-- raises a code the app turns into a clear 4xx (lib/server/rwa/repository.ts,
-- app/api/rwa/reports/route.ts):
--   RW001  the wallet already holds 100 reports
--   RW002  the wallet's reports would exceed 16 MiB
-- RW is an implementation-defined SQLSTATE class, so no Postgres error shares
-- these codes. Size is octet_length(observation::text): the JSON as the app
-- sent it, independent of how Postgres compresses it. A transaction-scoped
-- advisory lock per owner serialises concurrent saves for one wallet, so two
-- requests cannot both pass the check. No privilege changes: the service role
-- keeps insert and select, and a trigger function cannot be called directly.
begin;

create or replace function rwa_private.enforce_report_quota() returns trigger
language plpgsql set search_path = '' as $$
declare
  max_rows constant integer := 100;
  max_bytes constant bigint := 16 * 1024 * 1024;
  held_rows integer;
  held_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtext('rwa_wallet_reports:' || new.owner_id)::bigint);
  select count(*), coalesce(sum(octet_length(r.observation::text)), 0)
    into held_rows, held_bytes
    from public.rwa_wallet_reports r
    where r.owner_id = new.owner_id;
  if held_rows >= max_rows then
    raise exception 'saved report limit reached: this wallet already holds % reports', max_rows
      using errcode = 'RW001', hint = 'Delete my data removes every report of this wallet.';
  end if;
  if held_bytes + octet_length(new.observation::text) > max_bytes then
    raise exception 'saved report size limit reached: this wallet''s reports would exceed % MiB', max_bytes / 1048576
      using errcode = 'RW002', hint = 'Delete my data removes every report of this wallet.';
  end if;
  return new;
end; $$;
revoke all on function rwa_private.enforce_report_quota() from public, anon, authenticated, service_role;

drop trigger if exists rwa_wallet_reports_quota on public.rwa_wallet_reports;
create trigger rwa_wallet_reports_quota
  before insert on public.rwa_wallet_reports
  for each row execute function rwa_private.enforce_report_quota();

commit;

-- Rollout: safe before or after the app deploys. An app without the matching
-- code reports a refused save as "storage unavailable" (503) instead of the
-- quota message (409); nothing is lost. Existing wallets over a limit keep
-- their rows and can only delete. Verify after applying
-- (tests/rwa/ledger-migration.test.ts covers each):
--   the 101st insert for one owner fails with SQLSTATE RW001, other owners unaffected
--   an insert taking one owner past 16 MiB fails with RW002; a smaller one still fits
--   rwa_delete_wallet_data frees the quota
-- Roll back:
--   drop trigger rwa_wallet_reports_quota on public.rwa_wallet_reports;
--   drop function rwa_private.enforce_report_quota();
