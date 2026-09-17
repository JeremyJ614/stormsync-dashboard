-- Past a hundred automated badges, and twelve new things to earn them for.
--
-- Every metric below is computed from data the app already keeps. Nothing here
-- is aspirational: if a table could not answer the question, the badge is not
-- in the list. The awkward ones are the two streaks, which are gaps-and-islands
-- queries — the difference between a date and a row number is constant across a
-- run of consecutive days, so grouping on it counts the runs.

create or replace function public.award_badges_for(p_uid uuid, p_notify boolean default true)
returns table (badge_id text, label text)
language plpgsql
security definer
set search_path = public, private
as $fn$
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

        -- ── added with the hundred-badge catalogue ─────────────────────────
        when 'module_views_total' then
          coalesce((select sum(views) from public.module_views where user_id = p_uid), 0)
        when 'months_active' then
          coalesce((select count(distinct date_trunc('month', day))
                    from public.module_views where user_id = p_uid), 0)
        when 'favourite_module_views' then
          -- The single module you have opened most, not the total.
          coalesce((select max(s) from (
            select sum(views) as s from public.module_views
            where user_id = p_uid group by module_id) t), 0)
        when 'single_day_views' then
          coalesce((select max(s) from (
            select sum(views) as s from public.module_views
            where user_id = p_uid group by day) t), 0)
        when 'day_streak' then
          -- Longest run of consecutive days with any activity. The difference
          -- between a date and its row number is constant inside a run.
          coalesce((select max(n) from (
            select count(*) as n from (
              select day, day - (row_number() over (order by day))::int as grp
              from (select distinct day from public.module_views where user_id = p_uid) d
            ) g group by grp) s), 0)
        when 'trivia_streak' then
          coalesce((select max(n) from (
            select count(*) as n from (
              select d, d - (row_number() over (order by d))::int as grp
              from (select distinct answered_at::date as d
                    from public.trivia_answers where user_id = p_uid and correct) x
            ) g group by grp) s), 0)
        when 'notifications_received' then
          coalesce((select count(*) from public.notifications where user_id = p_uid), 0)
        when 'notifications_read' then
          coalesce((select count(*) from public.notifications
                    where user_id = p_uid and read_at is not null), 0)
        when 'push_received' then
          -- push_sent keys on the endpoint, which is what ties it to a person.
          coalesce((select count(*) from public.push_sent ps
                    join public.push_subscriptions s on s.endpoint = ps.endpoint
                    where s.user_id = p_uid), 0)
        when 'referrals_converted' then
          coalesce((select count(*) from public.referral_redemptions
                    where referrer_id = p_uid and converted_at is not null), 0)
        when 'loyalty_events' then
          coalesce((select count(*) from public.loyalty_events where user_id = p_uid), 0)
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
$fn$;

-- Generated from one list, so the defs and the rules cannot disagree.
insert into public.badge_defs (id, label, color, description, badge_group, icon, rarity) values
  ('two-seasons', 'Two Seasons', '#8fb2ff', 'Six months with StormSync.', 'Achievement', 'calendar', 'epic'),
  ('a-full-year', 'A Full Year', '#d9b775', 'One year to the day.', 'Achievement', 'calendar', 'legendary'),
  ('second-year', 'Second Year', '#d9b775', 'Two years with StormSync.', 'Achievement', 'crown', 'legendary'),
  ('ninety-days', 'Ninety Days', '#8fb2ff', 'Ninety days in.', 'Achievement', 'calendar', 'rare'),
  ('fortnight', 'Fortnight', '#9adcc0', 'Opened the app on fourteen separate days.', 'Achievement', 'calendar', 'rare'),
  ('thirty-days-in', 'Thirty Days In', '#9adcc0', 'Thirty days of turning up.', 'Achievement', 'calendar', 'rare'),
  ('hundred-days', 'Hundred Days', '#d9b775', 'A hundred days of turning up.', 'Achievement', 'calendar', 'epic'),
  ('two-hundred-days', 'Two Hundred Days', '#d9b775', 'Two hundred days of turning up.', 'Achievement', 'crown', 'legendary'),
  ('three-months-running', 'Three Months Running', '#9adcc0', 'Active in three different months.', 'Achievement', 'calendar', 'rare'),
  ('half-a-year-running', 'Half a Year Running', '#8fb2ff', 'Active in six different months.', 'Achievement', 'calendar', 'epic'),
  ('every-month', 'Every Month', '#d9b775', 'Active in twelve different months.', 'Achievement', 'crown', 'legendary'),
  ('three-day-run', 'Three-Day Run', '#f5a962', 'Three days in a row.', 'Achievement', 'flame', 'common'),
  ('week-straight', 'Week Straight', '#f5a962', 'Seven days in a row.', 'Achievement', 'flame', 'rare'),
  ('fortnight-straight', 'Fortnight Straight', '#fb923c', 'Fourteen days in a row.', 'Achievement', 'flame', 'epic'),
  ('thirty-straight', 'Thirty Straight', '#f87171', 'Thirty days in a row. Nobody made you.', 'Achievement', 'flame', 'legendary'),
  ('fifty-opens', 'Fifty Opens', '#a8b4cf', 'Fifty module opens.', 'Achievement', 'compass', 'common'),
  ('two-fifty-opens', 'Two Fifty Opens', '#a8b4cf', 'Two hundred and fifty module opens.', 'Achievement', 'compass', 'rare'),
  ('thousand-opens', 'Thousand Opens', '#d9b775', 'A thousand module opens.', 'Achievement', 'compass', 'epic'),
  ('five-thousand-opens', 'Five Thousand Opens', '#d9b775', 'Five thousand module opens.', 'Achievement', 'crown', 'legendary'),
  ('regular-module', 'Regular', '#9adcc0', 'Fifty opens of one single module.', 'Achievement', 'target', 'rare'),
  ('devoted-module', 'Devoted', '#d9b775', 'Two hundred opens of one single module.', 'Achievement', 'target', 'epic'),
  ('deep-dive', 'Deep Dive', '#8fb2ff', 'Twenty-five module opens in one day.', 'Achievement', 'layers', 'rare'),
  ('marathon-day', 'Marathon', '#d9b775', 'Sixty module opens in one day.', 'Achievement', 'layers', 'epic'),
  ('well-travelled', 'Well Travelled', '#9adcc0', 'Opened twelve different modules.', 'Achievement', 'compass', 'rare'),
  ('every-corner', 'Every Corner', '#d9b775', 'Opened twenty-five different modules.', 'Achievement', 'compass', 'epic'),
  ('the-whole-map', 'The Whole Map', '#d9b775', 'Opened every module on the menu.', 'Achievement', 'crown', 'legendary'),
  ('ten-warnings', 'Ten Warnings', '#f5a962', 'Ten warnings delivered to you.', 'Achievement', 'bell-ring', 'common'),
  ('fifty-warnings', 'Fifty Warnings', '#fb923c', 'Fifty warnings delivered to you.', 'Achievement', 'bell-ring', 'rare'),
  ('two-hundred-warnings', 'Two Hundred Warnings', '#f87171', 'Two hundred warnings delivered to you.', 'Achievement', 'bell-ring', 'epic'),
  ('kept-informed', 'Kept Informed', '#8fb2ff', 'Twenty-five notifications received.', 'Achievement', 'bell', 'common'),
  ('well-briefed', 'Well Briefed', '#8fb2ff', 'A hundred notifications received.', 'Achievement', 'bell', 'rare'),
  ('nothing-missed', 'Nothing Missed', '#9adcc0', 'Fifty notifications actually read.', 'Achievement', 'bell', 'rare'),
  ('attentive', 'Attentive', '#d9b775', 'Two hundred notifications actually read.', 'Achievement', 'bell', 'epic'),
  ('phone-buzzed', 'Phone Buzzed', '#ccccff', 'Five push alerts landed on your phone.', 'Achievement', 'radio', 'common'),
  ('woken-up', 'Woken Up', '#ccccff', 'Twenty-five push alerts landed on your phone.', 'Achievement', 'radio', 'rare'),
  ('always-on', 'Always On', '#d9b775', 'A hundred push alerts landed on your phone.', 'Achievement', 'radio', 'epic'),
  ('twenty-five-rounds', 'Twenty-Five Rounds', '#9adcc0', 'Twenty-five forecast rounds played.', 'Achievement', 'target', 'common'),
  ('two-fifty-rounds', 'Two Fifty Rounds', '#d9b775', 'Two hundred and fifty rounds played.', 'Achievement', 'target', 'epic'),
  ('five-hundred-rounds', 'Five Hundred Rounds', '#d9b775', 'Five hundred rounds played.', 'Achievement', 'crown', 'legendary'),
  ('five-wins', 'Five Wins', '#f5a962', 'Five outright wins.', 'Achievement', 'trophy', 'common'),
  ('twenty-wins', 'Twenty Wins', '#d9b775', 'Twenty outright wins.', 'Achievement', 'trophy', 'epic'),
  ('fifty-wins', 'Fifty Wins', '#d9b775', 'Fifty outright wins.', 'Achievement', 'crown', 'legendary'),
  ('twenty-five-right', 'Twenty-Five Right', '#9adcc0', 'Twenty-five trivia answers correct.', 'Achievement', 'brain', 'common'),
  ('hundred-right', 'Hundred Right', '#d9b775', 'A hundred trivia answers correct.', 'Achievement', 'brain', 'epic'),
  ('two-fifty-right', 'Two Fifty Right', '#d9b775', 'Two hundred and fifty trivia answers correct.', 'Achievement', 'crown', 'legendary'),
  ('fifty-questions', 'Fifty Questions', '#a8b4cf', 'Fifty trivia questions attempted.', 'Achievement', 'brain', 'common'),
  ('two-hundred-questions', 'Two Hundred Questions', '#8fb2ff', 'Two hundred trivia questions attempted.', 'Achievement', 'brain', 'rare'),
  ('five-in-a-row', 'Five in a Row', '#f5a962', 'Five days of correct trivia in a row.', 'Achievement', 'flame', 'rare'),
  ('ten-in-a-row', 'Ten in a Row', '#fb923c', 'Ten days of correct trivia in a row.', 'Achievement', 'flame', 'epic'),
  ('twenty-in-a-row', 'Twenty in a Row', '#f87171', 'Twenty days of correct trivia in a row.', 'Achievement', 'flame', 'legendary'),
  ('five-hundred-pts', 'Five Hundred', '#9adcc0', 'Five hundred points, all sources.', 'Achievement', 'trophy', 'rare'),
  ('twenty-five-hundred', 'Twenty-Five Hundred', '#8fb2ff', 'Two and a half thousand points.', 'Achievement', 'trophy', 'epic'),
  ('twenty-five-thousand', 'Twenty-Five Thousand', '#d9b775', 'Twenty-five thousand points.', 'Achievement', 'crown', 'legendary'),
  ('big-day', 'Big Day', '#f5a962', 'Two hundred and fifty points in one day.', 'Achievement', 'flame', 'rare'),
  ('enormous-day', 'Enormous Day', '#d9b775', 'Seven hundred and fifty points in one day.', 'Achievement', 'flame', 'epic'),
  ('first-convert', 'First Convert', '#9adcc0', 'Somebody you referred started paying.', 'Achievement', 'users', 'rare'),
  ('three-converts', 'Three Converts', '#8fb2ff', 'Three referrals started paying.', 'Achievement', 'users', 'epic'),
  ('ten-converts', 'Ten Converts', '#d9b775', 'Ten referrals started paying.', 'Achievement', 'crown', 'legendary'),
  ('fifty-strong', 'Fifty Strong', '#d9b775', 'Fifty people joined on your name.', 'Achievement', 'crown', 'legendary'),
  ('five-places', 'Five Places', '#9adcc0', 'Five saved locations.', 'Achievement', 'map-pin', 'rare'),
  ('ten-places', 'Ten Places', '#8fb2ff', 'Ten saved locations.', 'Achievement', 'map-pin', 'epic'),
  ('rewarded', 'Rewarded', '#ccccff', 'Five loyalty events on your account.', 'Achievement', 'gem', 'common'),
  ('well-rewarded', 'Well Rewarded', '#d9b775', 'Twenty-five loyalty events on your account.', 'Achievement', 'gem', 'rare'),
  ('half-collected', 'Half Collected', '#8fb2ff', 'Twenty-five badges earned.', 'Achievement', 'award', 'epic'),
  ('case-full', 'Case Full', '#d9b775', 'Fifty badges earned.', 'Achievement', 'crown', 'legendary')
on conflict (id) do update set label = excluded.label, color = excluded.color,
  description = excluded.description, icon = excluded.icon, rarity = excluded.rarity;

insert into public.badge_rules (badge_id, kind, threshold, enabled, blurb) values
  ('two-seasons', 'days_member', 180, true, 'Six months with StormSync.'),
  ('a-full-year', 'days_member', 365, true, 'One year to the day.'),
  ('second-year', 'days_member', 730, true, 'Two years with StormSync.'),
  ('ninety-days', 'days_member', 90, true, 'Ninety days in.'),
  ('fortnight', 'active_days', 14, true, 'Opened the app on fourteen separate days.'),
  ('thirty-days-in', 'active_days', 30, true, 'Thirty days of turning up.'),
  ('hundred-days', 'active_days', 100, true, 'A hundred days of turning up.'),
  ('two-hundred-days', 'active_days', 200, true, 'Two hundred days of turning up.'),
  ('three-months-running', 'months_active', 3, true, 'Active in three different months.'),
  ('half-a-year-running', 'months_active', 6, true, 'Active in six different months.'),
  ('every-month', 'months_active', 12, true, 'Active in twelve different months.'),
  ('three-day-run', 'day_streak', 3, true, 'Three days in a row.'),
  ('week-straight', 'day_streak', 7, true, 'Seven days in a row.'),
  ('fortnight-straight', 'day_streak', 14, true, 'Fourteen days in a row.'),
  ('thirty-straight', 'day_streak', 30, true, 'Thirty days in a row. Nobody made you.'),
  ('fifty-opens', 'module_views_total', 50, true, 'Fifty module opens.'),
  ('two-fifty-opens', 'module_views_total', 250, true, 'Two hundred and fifty module opens.'),
  ('thousand-opens', 'module_views_total', 1000, true, 'A thousand module opens.'),
  ('five-thousand-opens', 'module_views_total', 5000, true, 'Five thousand module opens.'),
  ('regular-module', 'favourite_module_views', 50, true, 'Fifty opens of one single module.'),
  ('devoted-module', 'favourite_module_views', 200, true, 'Two hundred opens of one single module.'),
  ('deep-dive', 'single_day_views', 25, true, 'Twenty-five module opens in one day.'),
  ('marathon-day', 'single_day_views', 60, true, 'Sixty module opens in one day.'),
  ('well-travelled', 'modules_explored', 12, true, 'Opened twelve different modules.'),
  ('every-corner', 'modules_explored', 25, true, 'Opened twenty-five different modules.'),
  ('the-whole-map', 'modules_explored', 38, true, 'Opened every module on the menu.'),
  ('ten-warnings', 'warnings_received', 10, true, 'Ten warnings delivered to you.'),
  ('fifty-warnings', 'warnings_received', 50, true, 'Fifty warnings delivered to you.'),
  ('two-hundred-warnings', 'warnings_received', 200, true, 'Two hundred warnings delivered to you.'),
  ('kept-informed', 'notifications_received', 25, true, 'Twenty-five notifications received.'),
  ('well-briefed', 'notifications_received', 100, true, 'A hundred notifications received.'),
  ('nothing-missed', 'notifications_read', 50, true, 'Fifty notifications actually read.'),
  ('attentive', 'notifications_read', 200, true, 'Two hundred notifications actually read.'),
  ('phone-buzzed', 'push_received', 5, true, 'Five push alerts landed on your phone.'),
  ('woken-up', 'push_received', 25, true, 'Twenty-five push alerts landed on your phone.'),
  ('always-on', 'push_received', 100, true, 'A hundred push alerts landed on your phone.'),
  ('twenty-five-rounds', 'game_plays', 25, true, 'Twenty-five forecast rounds played.'),
  ('two-fifty-rounds', 'game_plays', 250, true, 'Two hundred and fifty rounds played.'),
  ('five-hundred-rounds', 'game_plays', 500, true, 'Five hundred rounds played.'),
  ('five-wins', 'game_wins', 5, true, 'Five outright wins.'),
  ('twenty-wins', 'game_wins', 20, true, 'Twenty outright wins.'),
  ('fifty-wins', 'game_wins', 50, true, 'Fifty outright wins.'),
  ('twenty-five-right', 'trivia_correct', 25, true, 'Twenty-five trivia answers correct.'),
  ('hundred-right', 'trivia_correct', 100, true, 'A hundred trivia answers correct.'),
  ('two-fifty-right', 'trivia_correct', 250, true, 'Two hundred and fifty trivia answers correct.'),
  ('fifty-questions', 'trivia_answered', 50, true, 'Fifty trivia questions attempted.'),
  ('two-hundred-questions', 'trivia_answered', 200, true, 'Two hundred trivia questions attempted.'),
  ('five-in-a-row', 'trivia_streak', 5, true, 'Five days of correct trivia in a row.'),
  ('ten-in-a-row', 'trivia_streak', 10, true, 'Ten days of correct trivia in a row.'),
  ('twenty-in-a-row', 'trivia_streak', 20, true, 'Twenty days of correct trivia in a row.'),
  ('five-hundred-pts', 'points_total', 500, true, 'Five hundred points, all sources.'),
  ('twenty-five-hundred', 'points_total', 2500, true, 'Two and a half thousand points.'),
  ('twenty-five-thousand', 'points_total', 25000, true, 'Twenty-five thousand points.'),
  ('big-day', 'points_day_best', 250, true, 'Two hundred and fifty points in one day.'),
  ('enormous-day', 'points_day_best', 750, true, 'Seven hundred and fifty points in one day.'),
  ('first-convert', 'referrals_converted', 1, true, 'Somebody you referred started paying.'),
  ('three-converts', 'referrals_converted', 3, true, 'Three referrals started paying.'),
  ('ten-converts', 'referrals_converted', 10, true, 'Ten referrals started paying.'),
  ('fifty-strong', 'referrals', 50, true, 'Fifty people joined on your name.'),
  ('five-places', 'locations_saved', 5, true, 'Five saved locations.'),
  ('ten-places', 'locations_saved', 10, true, 'Ten saved locations.'),
  ('rewarded', 'loyalty_events', 5, true, 'Five loyalty events on your account.'),
  ('well-rewarded', 'loyalty_events', 25, true, 'Twenty-five loyalty events on your account.'),
  ('half-collected', 'badges_earned', 25, true, 'Twenty-five badges earned.'),
  ('case-full', 'badges_earned', 50, true, 'Fifty badges earned.')
on conflict (badge_id) do update set kind = excluded.kind, threshold = excluded.threshold,
  enabled = excluded.enabled, blurb = excluded.blurb;

-- 65 badges in this batch.

-- Three of the new names collided with badges that already existed. Two badges
-- called "Devoted" on one profile is a bug to the person looking at it, whatever
-- the ids say.
update public.badge_defs set label = 'Creature of Habit',
  description = 'Two hundred opens of one single module.' where id = 'devoted-module';
update public.badge_defs set label = 'Familiar Ground',
  description = 'Fifty opens of one single module.'       where id = 'regular-module';
update public.badge_defs set label = 'A Month of Days',
  description = 'Thirty days of turning up.'              where id = 'thirty-days-in';
