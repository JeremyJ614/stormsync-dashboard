-- Admin-readable system statistics.
--
-- The health panel needs counts and cache ages across the whole install, but
-- the tables it wants are correctly locked down for clients: `weather_cache`
-- has RLS on with no policy at all, and `notifications` only ever exposes the
-- caller's own rows. A client-side `count(*)` against either does not fail — it
-- succeeds and returns 0.
--
-- That silent zero is the dangerous part. A health panel that says "0 cached
-- feeds, nothing cached yet" when 77 feeds are cached and healthy is worse than
-- one that says nothing, because it looks like an outage. These functions read
-- the real numbers behind an explicit admin check, and raise rather than
-- return empty when the caller is not an admin, so the UI can tell "no data"
-- apart from "not allowed to look".

create or replace function public.admin_system_stats()
returns table (
  members bigint,
  notifications bigint,
  cached_feeds bigint,
  push_subscriptions bigint,
  module_view_rows bigint,
  audit_rows bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select
      (select count(*) from public.profiles),
      (select count(*) from public.notifications),
      (select count(*) from public.weather_cache),
      (select count(*) from public.push_subscriptions),
      (select count(*) from public.module_views),
      (select count(*) from public.admin_audit);
end;
$$;

revoke execute on function public.admin_system_stats() from public, anon;
grant execute on function public.admin_system_stats() to authenticated;

create or replace function public.admin_cache_ages(p_limit integer default 60)
returns table (key text, fetched_at timestamptz, age_minutes integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select c.key,
           c.fetched_at,
           (extract(epoch from (now() - c.fetched_at)) / 60)::integer
    from public.weather_cache c
    order by c.fetched_at desc
    limit greatest(p_limit, 1);
end;
$$;

revoke execute on function public.admin_cache_ages(integer) from public, anon;
grant execute on function public.admin_cache_ages(integer) to authenticated;
