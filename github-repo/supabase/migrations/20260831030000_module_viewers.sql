-- Who used a module, not just how many.
--
-- admin_module_usage answers "which modules earn their place". The question it
-- cannot answer is the one asked next, every time: *who*. The counters already
-- hold it — module_views is keyed by user — so this is a grouping, not new
-- collection. Nothing about what is stored changes.
--
-- Admin-only, and security definer for the same reason the aggregate is: the
-- table's read policy is admin-only, and this joins profiles on top of it.

create or replace function public.admin_module_viewers(
  p_module text,
  p_days   integer default 30
)
returns table (
  user_id    uuid,
  name       text,
  email      text,
  tier       integer,
  views      bigint,
  days_seen  bigint,
  last_seen  timestamptz
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
    select v.user_id,
           p.name,
           p.email,
           p.tier,
           sum(v.views)::bigint      as views,
           count(*)::bigint          as days_seen,
           max(v.last_seen)          as last_seen
    from public.module_views v
    left join public.profiles p on p.id = v.user_id
    where v.module_id = p_module
      and v.day >= ((now() at time zone 'utc')::date - greatest(p_days, 1))
    group by v.user_id, p.name, p.email, p.tier
    order by 5 desc, 7 desc;
end;
$$;

revoke execute on function public.admin_module_viewers(text, integer) from public, anon;
grant  execute on function public.admin_module_viewers(text, integer) to authenticated;

-- The mirror question: everything one member has opened. Same rows, other axis.
create or replace function public.admin_member_modules(
  p_user uuid,
  p_days integer default 30
)
returns table (
  module_id text,
  views     bigint,
  days_seen bigint,
  last_seen timestamptz
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
    select v.module_id,
           sum(v.views)::bigint,
           count(*)::bigint,
           max(v.last_seen)
    from public.module_views v
    where v.user_id = p_user
      and v.day >= ((now() at time zone 'utc')::date - greatest(p_days, 1))
    group by v.module_id
    order by 2 desc;
end;
$$;

revoke execute on function public.admin_member_modules(uuid, integer) from public, anon;
grant  execute on function public.admin_member_modules(uuid, integer) to authenticated;
