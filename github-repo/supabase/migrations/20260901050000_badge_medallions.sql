-- Badges, as things worth looking at.
--
-- The old chip was a text pill. Thirty of them on a profile is thirty wide
-- rectangles of shouting capitals — a wall of text pretending to be a trophy
-- case, and unreadable at exactly the moment it should be impressive.
--
-- A medallion needs two things a pill does not: something to draw in the
-- middle, and a sense of how hard it was to get. So badges gain an icon and a
-- rarity. Both are editable per badge, and both have sane defaults derived from
-- what each badge already is, so nothing has to be filled in by hand.

alter table public.badge_defs
  add column if not exists icon   text,
  add column if not exists rarity text not null default 'common';

alter table public.badge_defs
  drop constraint if exists badge_defs_rarity_check;
alter table public.badge_defs
  add constraint badge_defs_rarity_check
  check (rarity in ('common', 'rare', 'epic', 'legendary'));

comment on column public.badge_defs.icon is
  'Name from the curated icon set in src/lib/badgeIcons.ts. Null falls back to one chosen from the badge group.';
comment on column public.badge_defs.rarity is
  'common | rare | epic | legendary — drives how ornate the medallion is, nothing else.';

-- ── sensible defaults, from what each badge already says about itself ─────────
-- Matched on the badge id, which is descriptive by convention, so a badge lands
-- on a fitting icon without anyone choosing one.
update public.badge_defs set icon = case
  when id ~ 'founder|charter|origin'          then 'crown'
  when id ~ 'admin|staff|owner'               then 'shield'
  when id ~ 'tier|advanced|vip|elite'         then 'gem'
  when id ~ 'region|state|local|home'         then 'map-pin'
  when id ~ 'referr|invite|friend'            then 'users'
  when id ~ 'trivia|quiz|brain'               then 'brain'
  when id ~ 'game|duel|forecast_game|predict' then 'target'
  when id ~ 'point|score'                     then 'trophy'
  when id ~ 'tornado|twister'                 then 'tornado'
  when id ~ 'hurricane|tropical|cyclone'      then 'wind'
  when id ~ 'winter|snow|ice'                 then 'snowflake'
  when id ~ 'fire|heat|drought'               then 'flame'
  when id ~ 'flood|river|rain|water'          then 'droplets'
  when id ~ 'lightning|thunder|storm'         then 'zap'
  when id ~ 'alert|warning|siren'             then 'bell-ring'
  when id ~ 'night|moon|aurora|star'          then 'moon'
  when id ~ 'sun|day|dawn|morning'            then 'sun'
  when id ~ 'module|explor|discover'          then 'compass'
  when id ~ 'day|year|anniversar|veteran'     then 'calendar'
  when id ~ 'chase'                           then 'route'
  when id ~ 'badge|collect'                   then 'award'
  when id ~ 'streak|fire_streak'              then 'flame'
  when id ~ 'location|saved|pin'              then 'map-pin'
  else 'award'
end
where icon is null;

-- Rarity from the group, and from how far up a ladder a badge sits. A threshold
-- badge that asks for a thousand of something is not the same as one that asks
-- for one.
update public.badge_defs d set rarity = case
  when d.badge_group = 'Role' then 'epic'
  when d.badge_group = 'Tier' then 'rare'
  else coalesce((
    select case
      when r.threshold >= 500 then 'legendary'
      when r.threshold >= 100 then 'epic'
      when r.threshold >= 10  then 'rare'
      else 'common'
    end
    from public.badge_rules r where r.badge_id = d.id limit 1
  ), 'common')
end;

-- A second pass, matching on what a badge is *awarded for* rather than on the
-- wording of its id. Sixty-four badges landed on the generic icon after the
-- first pass because their ids say "century" and "dynasty" and "the-lot" —
-- perfectly good names that describe nothing mechanical. The rule behind them
-- does.
update public.badge_defs d set icon = coalesce(
  (select case r.kind
     when 'points_total'      then 'trophy'
     when 'points_day_best'   then 'flame'
     when 'referrals'         then 'users'
     when 'modules_owned'     then 'layers'
     when 'modules_explored'  then 'compass'
     when 'days_member'       then 'calendar'
     when 'active_days'       then 'calendar'
     when 'trivia_correct'    then 'brain'
     when 'trivia_answered'   then 'brain'
     when 'game_wins'         then 'trophy'
     when 'game_plays'        then 'target'
     when 'tier_at_least'     then 'gem'
     when 'locations_saved'   then 'map-pin'
     when 'warnings_received' then 'bell-ring'
     when 'badges_earned'     then 'award'
     when 'alert_level'       then 'bell-ring'
     when 'region'            then 'map-pin'
     else null
   end
   from public.badge_rules r where r.badge_id = d.id limit 1),
  case
    when d.id ~ 'raffle|luck|blessing|random'    then 'ticket'
    when d.id ~ 'hall-of-fame|alpha|honorable'   then 'crown'
    when d.id ~ 'board|management|supervisor|staff|admin' then 'shield'
    when d.id ~ 'member|subscriber|subscription' then 'gem'
    when d.id ~ 'bleeding|unconditional|loyal'   then 'heart'
    when d.id ~ 'west|east|north|south|midwest|buckeye' then 'map-pin'
    when d.id ~ 'recruit|influential|gravity|word-of-mouth' then 'users'
    when d.id ~ 'samaras|twistex|betts'          then 'tornado'
    when d.id ~ 'rookie|rsvp|beginner'           then 'sparkles'
    else d.icon
  end,
  'award');

-- The one-off honours are the rarest things here; a rule-less Achievement is
-- given by hand, which is the definition of hard to get.
update public.badge_defs d set rarity = 'legendary'
 where d.badge_group = 'Achievement'
   and not exists (select 1 from public.badge_rules r where r.badge_id = d.id)
   and d.id ~ 'hall-of-fame|alpha|samaras|twistex|blessing|demi-god';
