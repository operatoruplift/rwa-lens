-- RWA Lens saved reports.
-- Additive and owner-scoped. Reports are observations at a point in time; they
-- never contain secrets, wallet signatures or private keys.
create table if not exists public.rwa_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cluster text not null check (cluster in ('devnet', 'mainnet-beta')),
  mint text not null check (char_length(mint) between 32 and 44),
  owner_address text check (char_length(owner_address) between 32 and 44),
  observation jsonb not null,
  decoder_version text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists rwa_reports_owner_created_idx
  on public.rwa_reports (owner_id, created_at desc);

-- Deny by default. Every policy is scoped to the authenticated owner, and there
-- is no policy that lets one user read another user's row.
alter table public.rwa_reports enable row level security;

drop policy if exists rwa_reports_select_own on public.rwa_reports;
create policy rwa_reports_select_own on public.rwa_reports
  for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists rwa_reports_insert_own on public.rwa_reports;
create policy rwa_reports_insert_own on public.rwa_reports
  for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists rwa_reports_delete_own on public.rwa_reports;
create policy rwa_reports_delete_own on public.rwa_reports
  for delete to authenticated
  using (auth.uid() = owner_id);

-- Reports are immutable once written; a correction is a new observation.
revoke update on public.rwa_reports from authenticated;
