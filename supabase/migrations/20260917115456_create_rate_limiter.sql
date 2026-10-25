-- Cross-instance rate limiting for a serverless app.
--
-- An in-memory limiter is per-lambda and therefore no limiter at all on
-- Vercel. This keeps one fixed window per key in Postgres. The function runs
-- as SECURITY DEFINER so it is callable with the publishable key, and it is
-- guarded by a secret the server holds and the anon role cannot read, so a
-- direct caller cannot consume (or exhaust) someone else's bucket.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.rate_limit_config (
  id boolean primary key default true check (id),
  secret text not null default encode(gen_random_bytes(32), 'hex')
);
insert into private.rate_limit_config (id) values (true) on conflict do nothing;
revoke all on private.rate_limit_config from anon, authenticated;

create table if not exists private.rate_limits (
  key text primary key,
  count integer not null,
  window_start timestamptz not null
);
revoke all on private.rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_secret text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_start timestamptz;
begin
  if p_secret is null or p_secret <> (select secret from private.rate_limit_config where id) then
    -- Wrong secret: refuse, and do not touch any bucket.
    return query select false, 0, p_window_seconds;
    return;
  end if;
  if p_key is null or length(p_key) > 200 or p_limit < 1 or p_window_seconds < 1 then
    return query select false, 0, p_window_seconds;
    return;
  end if;

  insert into private.rate_limits (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
    set count = case when private.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now then 1 else private.rate_limits.count + 1 end,
        window_start = case when private.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now else private.rate_limits.window_start end
  returning count, window_start into v_count, v_start;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    greatest(ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer, 1);
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to anon, authenticated;

-- Keep the table from growing without bound: windows older than an hour are dead.
create or replace function private.prune_rate_limits() returns void language sql security definer as $$
  delete from private.rate_limits where window_start < now() - interval '1 hour';
$$;
