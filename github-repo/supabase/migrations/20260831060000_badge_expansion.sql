-- Badges, expanded from twelve automated to fifty-five.
--
-- Three things happen here.
--
-- 1. The evaluator gains ten new rule kinds, and moves into a shared function
--    so that "evaluate for me" and "evaluate for everybody" cannot drift apart.
--    Before, evaluation ran for the caller only and there was deliberately no
--    way to run it for someone else — which is correct as a client-facing rule
--    and useless when forty new badges land and nobody has been evaluated
--    against them. The admin path is bounded, admin-only, and audited.
--
-- 2. Forty-two new badges across those kinds, so the ladder from "you just
--    signed up" to "you have been here two years and read everything" has rungs
--    in it rather than three widely spaced steps.
--
-- 3. Region badges, awarded from the first location a member ever saved. These
--    sit on top of the forty-two: they are not earned by doing anything, they
--    are a nickname for where you watch the sky from.

-- ── a rule can carry a value that is not a number ────────────────────────────
alter table public.badge_rules
  add column if not exists param text;

comment on column public.badge_rules.param is
  'Non-numeric argument for kinds that need one — currently the region key for kind=region.';

-- ── where a state sits ───────────────────────────────────────────────────────
-- Saved locations are stored as "City, State, US", so the state arrives as a
-- full name rather than a code. One region per state, no overlaps: a member
-- belongs to exactly one, and it is the one their first saved location is in.
create or replace function public.state_region(p_state text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_state, '')))
    when 'michigan' then 'lake-effect'
    when 'wisconsin' then 'lake-effect'
    when 'ohio' then 'lake-effect'
    when 'indiana' then 'lake-effect'
    when 'illinois' then 'lake-effect'

    when 'minnesota' then 'heartland'
    when 'iowa' then 'heartland'
    when 'missouri' then 'heartland'
    when 'north dakota' then 'heartland'
    when 'south dakota' then 'heartland'
    when 'nebraska' then 'heartland'

    when 'kansas' then 'alley'
    when 'oklahoma' then 'alley'
    when 'texas' then 'alley'

    when 'arkansas' then 'dixie'
    when 'louisiana' then 'dixie'
    when 'mississippi' then 'dixie'
    when 'alabama' then 'dixie'
    when 'tennessee' then 'dixie'
    when 'kentucky' then 'dixie'

    when 'florida' then 'gulf'
    when 'georgia' then 'gulf'
    when 'south carolina' then 'gulf'

    when 'maine' then 'noreaster'
    when 'new hampshire' then 'noreaster'
    when 'vermont' then 'noreaster'
    when 'massachusetts' then 'noreaster'
    when 'rhode island' then 'noreaster'
    when 'connecticut' then 'noreaster'
    when 'new york' then 'noreaster'
    when 'new jersey' then 'noreaster'
    when 'pennsylvania' then 'noreaster'

    when 'maryland' then 'blue-ridge'
    when 'delaware' then 'blue-ridge'
    when 'virginia' then 'blue-ridge'
    when 'west virginia' then 'blue-ridge'
    when 'north carolina' then 'blue-ridge'
    when 'district of columbia' then 'blue-ridge'
    when 'washington, d.c.' then 'blue-ridge'

    when 'colorado' then 'high-country'
    when 'wyoming' then 'high-country'
    when 'montana' then 'high-country'
    when 'utah' then 'high-country'
    when 'idaho' then 'high-country'

    when 'arizona' then 'dryline'
    when 'new mexico' then 'dryline'
    when 'nevada' then 'dryline'

    when 'washington' then 'pineapple'
    when 'oregon' then 'pineapple'

    when 'california' then 'golden'
    when 'alaska' then 'frontier'
    when 'hawaii' then 'island'
    else null
  end;
$$;

/** The region a member belongs to: the one their FIRST saved location is in. */
create or replace function public.member_region(p_user uuid)
returns text
language sql
stable
as $$
  select public.state_region(trim(split_part(l.name, ',', 2)))
  from public.saved_locations l
  where l.user_id = p_user
  order by l.created_at asc
  limit 1;
$$;

-- ── the evaluator, shared ────────────────────────────────────────────────────
/*
 * Award every enabled rule this member now satisfies and has not already been
 * given. Returns one row per badge newly awarded.
 *
 * `p_notify` exists for the backfill: awarding a member their first forty
 * badges in one pass should not put forty rows in their notification inbox, so
 * the caller turns notifications off and writes a single summary instead.
 *
 * `badges` on profiles is a protected column (see protect_profile_columns), and
 * being security-definer is not enough to get past that guard — it checks
 * private.is_admin(), which is false for an ordinary member even inside a
 * definer function. So this announces itself through the same
 * `sswx.privileged_write` escape hatch the other trusted RPCs use, scoped to
 * the transaction.
 */
create or replace function public.award_badges_for(p_uid uuid, p_notify boolean default true)
returns table (badge_id text, label text)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT parameters are named `badge_id` and `label`, which collide with the
-- columns of the same name — `on conflict (badge_id)` cannot tell which one is
-- meant and the whole function fails with 42702 at runtime.
#variable_conflict use_column
declare
  r        record;
  v        numeric;
  v_region text;
  hit      boolean;
begin
  if p_uid is null then return; end if;
  perform set_config('sswx.privileged_write', 'on', true);
  v_region := public.member_region(p_uid);

  for r in
    select br.badge_id, br.kind, br.threshold, br.param, bd.label
    from public.badge_rules br
    join public.badge_defs bd on bd.id = br.badge_id
    where br.enabled
      and not exists (select 1 from public.badge_awards a
                      where a.user_id = p_uid and a.badge_id = br.badge_id)
  loop
    hit := false;
    v := null;

    if r.kind = 'region' then
      -- Not a threshold at all: either you watch from there or you do not.
      hit := (v_region is not null and v_region = r.param);
    else
      v := case r.kind
        when 'points_total' then
          coalesce((select sum(points) from public.game_points where user_id = p_uid), 0)
        when 'points_day_best' then
          coalesce((select max(d) from (
            select sum(points) as d from public.game_points
            where user_id = p_uid group by earned_on) s), 0)
        when 'referrals' then
          coalesce((select referrals from public.profiles where id = p_uid), 0)
        when 'modules_owned' then
          coalesce((select array_length(enabled_modules, 1) from public.profiles where id = p_uid), 0)
        when 'days_member' then
          coalesce((select extract(day from now() - joined_at) from public.profiles where id = p_uid), 0)
        when 'trivia_correct' then
          coalesce((select count(*) from public.trivia_answers where user_id = p_uid and correct), 0)
        when 'trivia_answered' then
          coalesce((select count(*) from public.trivia_answers where user_id = p_uid), 0)
        when 'game_wins' then
          coalesce((select count(*) from public.game_winners where user_id = p_uid), 0)
        when 'game_plays' then
          coalesce((select count(*) from public.game_guesses where user_id = p_uid), 0)
        when 'tier_at_least' then
          coalesce((select tier from public.profiles where id = p_uid), 0)
        when 'locations_saved' then
          coalesce((select count(*) from public.saved_locations where user_id = p_uid), 0)
        when 'modules_explored' then
          coalesce((select count(distinct module_id) from public.module_views where user_id = p_uid), 0)
        when 'active_days' then
          coalesce((select count(distinct day) from public.module_views where user_id = p_uid), 0)
        when 'warnings_received' then
          coalesce((select count(*) from public.notifications
                    where user_id = p_uid and kind in ('warning', 'watch')), 0)
        when 'badges_earned' then
          coalesce((select count(*) from public.badge_awards where user_id = p_uid), 0)
        when 'alert_level' then
          coalesce((select max(al.level) from public.alert_levels_for(p_uid) al
                    where al.source <> 'none'), 0)
        else null
      end;
      hit := (v is not null and v >= r.threshold);
    end if;

    if hit then
      insert into public.badge_awards (user_id, badge_id, reason)
      values (p_uid, r.badge_id,
              case when r.kind = 'region' then 'first location is in ' || coalesce(v_region, '?')
                   else r.kind || ' reached ' || r.threshold::text end)
      on conflict (user_id, badge_id) do nothing;

      update public.profiles
         set badges = (select array(select distinct unnest(coalesce(badges, '{}') || r.badge_id)))
       where id = p_uid;

      if p_notify then
        insert into public.notifications (user_id, kind, severity, title, body, dedup_key)
        values (p_uid, 'badge', 'info',
                'You earned a badge',
                'You just earned ' || r.label || '.',
                'badge:' || r.badge_id)
        on conflict do nothing;
      end if;

      return query select r.badge_id, r.label;
    end if;
  end loop;
end;
$$;

revoke execute on function public.award_badges_for(uuid, boolean) from public, anon, authenticated;

-- The member-facing entry point is unchanged in name, signature and behaviour.
create or replace function public.evaluate_badges()
returns table (badge_id text, label text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  return query select * from public.award_badges_for(auth.uid(), true);
end;
$$;

revoke execute on function public.evaluate_badges() from public, anon;
grant execute on function public.evaluate_badges() to authenticated;

-- ── the backfill ─────────────────────────────────────────────────────────────
/*
 * Evaluate every member against every rule.
 *
 * Bounded by the member count and admin-only, which is what makes it safe to
 * exist at all — the member-facing evaluator still refuses to run for anybody
 * but its caller. Notifications are suppressed per badge and replaced with one
 * summary each, because forty rows in an inbox is not a celebration.
 */
create or replace function public.admin_backfill_badges()
returns table (user_id uuid, awarded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  u   record;
  n   integer;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  for u in select id from public.profiles loop
    select count(*) into n from public.award_badges_for(u.id, false);
    if n > 0 then
      insert into public.notifications (user_id, kind, severity, title, body, dedup_key)
      values (u.id, 'badge', 'info', 'New badges on your profile',
              'We added ' || n || ' badge' || case when n = 1 then '' else 's' end ||
              ' you had already earned. Have a look at your profile.',
              'badge-backfill:' || to_char(now(), 'YYYYMMDDHH24MI'))
      on conflict do nothing;
    end if;
    user_id := u.id;
    awarded := n;
    return next;
  end loop;

  insert into public.admin_audit (actor_id, actor_email, action, target_type, target_label, detail)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          'badge.backfill', 'badges', 'All members', '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_backfill_badges() from public, anon;
grant execute on function public.admin_backfill_badges() to authenticated;
