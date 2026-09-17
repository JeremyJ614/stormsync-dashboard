-- Close an entitlement-enumeration hole.
--
-- `alert_levels_for(uuid)` and `has_alert_level(uuid, integer)` were granted to
-- `authenticated`. Both are security definer and both take an arbitrary user id,
-- so any signed-in member could ask what levels any other member held — and
-- since levels map straight onto tier, that also disclosed their tier. Worse,
-- has_alert_level is the gate on my_emergency_pin, so it let a member probe the
-- gate on somebody else's behalf.
--
-- Neither needs to be callable from a client. `my_alert_levels()` is the caller
-- facing one and passes auth.uid() itself; the rest are called from inside other
-- security-definer functions, where the owner's privileges apply and these
-- grants are irrelevant. The fan-out edge function keeps service_role.
revoke execute on function public.alert_levels_for(uuid) from authenticated;
revoke execute on function public.has_alert_level(uuid, integer) from authenticated;

-- Admin reads should refuse rather than answer with an empty list.
--
-- `where private.is_admin()` filtered a non-admin down to zero rows, which is
-- safe but indistinguishable from "there is nothing to show". A real admin whose
-- flag went missing would read that as an empty roster rather than a permission
-- problem, so both now raise the same way admin_set_alert_level does.
create or replace function public.admin_alert_roster()
returns table (
  user_id uuid, name text, email text, tier integer,
  levels integer[], purchased integer[], scope text,
  alert_email text, alert_phone text, locations integer, direct_note text,
  lat double precision, lon double precision, place text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  return query
    select p.id, p.name, p.email, coalesce(p.tier, 1),
           coalesce((select array_agg(l.level order by l.level) from public.alert_levels_for(p.id) l), '{}'),
           coalesce((select array_agg(e.level order by e.level) from public.alert_entitlements e where e.user_id = p.id), '{}'),
           coalesce(np.alert_scope, 'state'),
           np.alert_email, np.alert_phone,
           (select count(*)::integer from public.saved_locations s where s.user_id = p.id),
           np.direct_line_note,
           sl.lat, sl.lon, sl.name
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    left join lateral (
      select s.lat, s.lon, s.name
      from public.saved_locations s
      where s.user_id = p.id
      order by s.is_primary desc, s.created_at
      limit 1
    ) sl on true
    order by coalesce(p.tier, 1) desc, p.name;
end;
$fn$;

revoke execute on function public.admin_alert_roster() from public, anon;
grant execute on function public.admin_alert_roster() to authenticated;

create or replace function public.admin_alert_requests()
returns table (
  id uuid, user_id uuid, name text, email text, tier integer,
  level integer, quoted_price numeric, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  return query
    select r.id, r.user_id, p.name, p.email, coalesce(p.tier, 1),
           r.level, r.quoted_price, r.created_at
    from public.alert_level_requests r
    join public.profiles p on p.id = r.user_id
    where r.status = 'open'
    order by r.created_at;
end;
$fn$;

revoke execute on function public.admin_alert_requests() from public, anon;
grant execute on function public.admin_alert_requests() to authenticated;
-- Levels are cumulative, and holding one has to mean holding the ones below it.
--
-- The first version returned only levels that were explicitly held or included
-- by tier, so a free-tier member who bought level 4 came back holding {1, 2, 4}:
-- they got the outlook alerts and the vault PIN but not the email and text
-- channel that level 4 is defined as building on. Every level's own description
-- starts "everything in the level below", so the entitlement has to say the same
-- thing or the product does not match its own copy.
--
-- The highest level held now sets the floor. `source` reports how they came to
-- hold that level: 'tier' if their tier reaches it, otherwise the source of the
-- purchase or grant that carried them there.
create or replace function public.alert_levels_for(p_user uuid)
returns table (level integer, source text)
language sql
stable
security definer
set search_path = public
as $fn$
  with t as (
    select coalesce(tier, 1) as tier from public.profiles where id = p_user
  ),
  -- The highest level reached by tier, and the highest reached by anything bought
  -- or granted, kept apart so we can say which one is doing the work.
  reach as (
    select
      coalesce((select max(l.level) from generate_series(1, 5) l(level)
                where (select tier from t) >= public.alert_level_included_from(l.level)), 0) as by_tier,
      coalesce((select max(level) from public.alert_entitlements where user_id = p_user), 0) as by_purchase
  ),
  top as (
    select greatest(by_tier, by_purchase) as top_level, by_tier, by_purchase from reach
  )
  select l.level,
         case
           when l.level <= (select by_tier from top) then 'tier'
           else coalesce(
             (select e.source from public.alert_entitlements e
               where e.user_id = p_user and e.level >= l.level
               order by e.level limit 1),
             'purchased')
         end as source
  from generate_series(1, 5) as l(level)
  where l.level <= (select top_level from top);
$fn$;

revoke execute on function public.alert_levels_for(uuid) from public, anon, authenticated;
grant execute on function public.alert_levels_for(uuid) to service_role;
