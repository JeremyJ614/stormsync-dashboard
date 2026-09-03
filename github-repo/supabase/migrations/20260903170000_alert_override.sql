-- StormSync VIP — an alert level an admin can actually set.
--
-- `alert_levels_for` resolves to `greatest(by_tier, by_purchase)`. Tier is
-- therefore a FLOOR, and that makes the level un-lowerable: a tier-4 member is
-- entitled to level 4 by their plan, so revoking every grant they hold still
-- leaves them at 4. The admin panel's stepper skipped those levels on purpose
-- with the comment "those are not ours to take" — a reasonable rule that turns
-- out to be the wrong one, because the person running the app has to be able to
-- move somebody down a rung without also demoting their subscription.
--
-- So: an override. When it is set it IS the answer, above tier and above
-- anything bought. Null means the normal rules, which is what everybody has
-- until somebody deliberately intervenes.
--
-- Deliberately a single number rather than a per-level revoke list. "This
-- member is on level 2" is a thing an admin can hold in their head and undo;
-- a sparse set of level-by-level exceptions layered over two other sources is
-- not, and the panel already presents the ladder as one position.
alter table public.profiles add column if not exists alert_level_override integer;

alter table public.profiles drop constraint if exists profiles_alert_override_check;
alter table public.profiles add constraint profiles_alert_override_check
  check (alert_level_override is null or alert_level_override between 0 and 5);

comment on column public.profiles.alert_level_override is
  'Admin-set alert level. Wins over tier and purchases. Null = normal rules.';

-- ── resolution ──────────────────────────────────────────────────────────────
create or replace function public.alert_levels_for(p_user uuid)
returns table (level integer, source text)
language sql
stable
security definer
set search_path = public, private
as $$
  with t as (
    select coalesce(tier, 1) as tier, alert_level_override as ovr
    from public.profiles where id = p_user
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
    select
      -- An override replaces the calculation rather than joining it. Anything
      -- else and a tier floor would still be a floor.
      case when (select ovr from t) is not null then (select ovr from t)
           else greatest(by_tier, by_purchase) end as top_level,
      by_tier, by_purchase
    from reach
  )
  select l.level,
         case
           when (select ovr from t) is not null then 'admin'
           when l.level <= (select by_tier from top) then 'tier'
           else coalesce(
             (select e.source from public.alert_entitlements e
               where e.user_id = p_user and e.level >= l.level
               order by e.level limit 1),
             'purchased')
         end as source
  from generate_series(1, 5) as l(level)
  where l.level <= (select top_level from top);
$$;

revoke execute on function public.alert_levels_for(uuid) from public, anon, authenticated;

-- ── setting it ──────────────────────────────────────────────────────────────
/**
 * Put a member on a level, or hand them back to the normal rules.
 *
 * `p_level` null clears the override. 0 is a real value and means "no alerts at
 * all", which is different from null and is the whole reason an admin needs
 * this: taking somebody off alerts entirely was previously impossible without
 * changing what they pay for.
 */
create or replace function public.admin_set_alert_override(
  p_user uuid, p_level integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_name text;
begin
  if not private.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'Admins only.');
  end if;
  if p_level is not null and (p_level < 0 or p_level > 5) then
    return jsonb_build_object('ok', false, 'error', 'Level must be 0 to 5.');
  end if;

  perform set_config('sswx.privileged_write', 'on', true);
  update public.profiles set alert_level_override = p_level where id = p_user
  returning coalesce(nullif(trim(name), ''), email) into v_name;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No such member.');
  end if;

  return jsonb_build_object('ok', true, 'member', v_name, 'level', p_level);
end;
$$;

revoke all on function public.admin_set_alert_override(uuid, integer) from public, anon;
grant execute on function public.admin_set_alert_override(uuid, integer) to authenticated;

-- The panel has to be able to see the override, or an admin cannot tell why a
-- tier-4 member is sitting on level 2.
--
-- Added as its own small function rather than as a column on
-- `admin_alert_roster`: that one already returns thirteen columns feeding the
-- whole roster — scope, contact details, saved-location counts, map
-- coordinates — and a `returns table` signature cannot gain a column without
-- being dropped and rebuilt. Dropping a function the admin panel depends on to
-- append one integer is a poor trade.
create or replace function public.admin_alert_overrides()
returns table (user_id uuid, override integer)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, p.alert_level_override
  from public.profiles p
  where private.is_admin() and p.alert_level_override is not null;
$$;

revoke all on function public.admin_alert_overrides() from public, anon;
grant execute on function public.admin_alert_overrides() to authenticated;
