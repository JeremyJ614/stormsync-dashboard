-- Storm Chasing: roll the day over in the small hours, and give terrain a cache.
--
-- THE ROLLOVER
-- `chase-target-daily` ran at 13:30 UTC — half past eight in the morning in the
-- Plains. Chasers decide where they are driving long before that, so the module
-- was publishing a forecast after the audience had already left. It now runs at
-- 04:25 UTC, which is 12:25 am Eastern and 11:25 pm Central the evening before.
--
-- 04:25 is not an arbitrary hour. SPC's convective day runs 12Z to 12Z, and the
-- first Day 1 outlook covering a given afternoon is not issued until 12Z that
-- morning. The product that already covers it is the Day 2 outlook issued at
-- 1730Z the day before — and that one is replaced by the next Day 2 (which
-- jumps forward a day) at around 05:09Z. So the window in which an early run
-- can see a real SPC outlook for the coming afternoon closes just after 05:00Z.
-- The engine checks each product's VALID/EXPIRE window against the day it is
-- forecasting rather than trusting the file name, so it cannot quietly score
-- yesterday's polygons.
--
-- The 13:30 slot is kept as a refresh. By then SPC's own Day 1 is out, which is
-- better guidance than the Day 2 the overnight run had, and the row is upserted
-- on outlook_date so the day improves in place instead of being duplicated.
--
-- THE BACKFILL
-- `chase_outlook` held seven rows, so the Yearly tab was comparing today
-- against a week. `chase-target` now takes {"action":"backfill"} and fills in
-- missing dates from real archived data — SPC's outlook archive for the risk
-- areas, Open-Meteo's historical forecast archive for the soundings. It works
-- backwards from the most recent gap, skips any date already written, and stops
-- when it runs out of budget, so it is safe to call repeatedly and cheap once
-- the season is complete. The cron below walks it home a chunk at a time.

-- ── terrain cache ────────────────────────────────────────────────────────────
-- Terrain is the one input that is identical every day, and the new scorer costs
-- seven requests across three public services to measure a location. Caching it
-- on a 0.05° grid (~5.5 km, finer than the 20 km box each measurement averages
-- over) is what makes the backfill affordable and keeps the daily run polite.
create table if not exists public.chase_terrain_cache (
  cell_key    text primary key,
  lat         double precision not null,
  lon         double precision not null,
  score       numeric(5,1) not null,
  trees       smallint,
  rugged      smallint,
  sight       smallint,
  roads       smallint,
  confidence  numeric(4,2),
  detail      jsonb not null default '{}'::jsonb,
  measured_at timestamptz not null default now()
);

comment on table public.chase_terrain_cache is
  'Chase-terrain measurements on a 0.05° grid. Written by the chase-target edge function; '
  'read by nothing else. Terrain does not change day to day, so a cell is measured once and '
  'reused by every later outlook and by the historical backfill.';

alter table public.chase_terrain_cache enable row level security;

-- No policy is created on purpose: this is service-role-only working data, and
-- a member has no reason to read it. RLS with no policy denies everyone else.
revoke all on table public.chase_terrain_cache from anon, authenticated;

create index if not exists chase_terrain_cache_measured_idx
  on public.chase_terrain_cache (measured_at desc);

-- ── year context: say when the ledger starts ─────────────────────────────────
-- Unchanged in purpose and in every number it already returned. `first_date` is
-- added so the Yearly tab can say what span it is comparing against, which
-- matters a great deal more once the backfill has taken the ledger from seven
-- days to a season.
-- Dropped rather than replaced: `create or replace` cannot widen the OUT list of
-- an existing function, and this one gains `first_date`. Nothing but the RPC
-- calls it, so there is nothing to cascade to.
drop function if exists public.chase_year_context(integer);

create function public.chase_year_context(p_year integer default null)
returns table (
  days_scored integer,
  best_score numeric,
  best_date date,
  median_score numeric,
  above_seven integer,
  percentile numeric,
  first_date date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with yr as (
    select coalesce(p_year, extract(year from (now() at time zone 'utc'))::integer) as y
  ),
  rows_ as (
    select outlook_date, day_score
    from public.chase_outlook
    where status = 'ok'
      and extract(year from outlook_date)::integer = (select y from yr)
  ),
  today_ as (
    select day_score from rows_
    where outlook_date = (now() at time zone 'utc')::date
  )
  select
    (select count(*)::integer from rows_),
    (select max(day_score) from rows_),
    (select outlook_date from rows_ order by day_score desc, outlook_date desc limit 1),
    (select percentile_cont(0.5) within group (order by day_score) from rows_),
    (select count(*)::integer from rows_ where day_score >= 7),
    case
      when (select count(*) from rows_) = 0 or (select count(*) from today_) = 0 then null
      else round(
        100.0 * (select count(*) from rows_ where day_score <= (select day_score from today_ limit 1))
              / nullif((select count(*) from rows_), 0), 1)
    end,
    (select min(outlook_date) from rows_);
$$;

revoke all on function public.chase_year_context(integer) from public;
grant execute on function public.chase_year_context(integer) to anon, authenticated, service_role;

/**
 * Which dates the backfill still owes, newest gap first.
 *
 * Returning the list from SQL rather than having the function walk a calendar
 * is what makes the job restartable: every invocation asks the table what is
 * still missing, so a run that dies half way through costs one chunk and not
 * the season.
 */
create or replace function public.chase_missing_dates(
  p_from date,
  p_to date,
  p_limit integer default 12
)
returns setof date
language sql
stable
security definer
set search_path to 'public'
as $$
  select d::date
  from generate_series(p_from, p_to, interval '1 day') d
  where not exists (
    select 1 from public.chase_outlook o
    where o.outlook_date = d::date
      and o.status = 'ok'
  )
  -- Three goes and then it is left alone. Some dates cannot be rebuilt — an SPC
  -- archive gap, a model archive that will not answer for that corner of the
  -- country — and without this the job would spend every twenty minutes, for
  -- ever, failing at the same Tuesday in April.
  and (
    select count(*) from public.chase_runs r
    where r.outlook_date = d::date and r.status = 'error'
  ) < 3
  order by d desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.chase_missing_dates(date, date, integer) from public, anon, authenticated;
grant execute on function public.chase_missing_dates(date, date, integer) to service_role;

-- ── schedules ────────────────────────────────────────────────────────────────
-- The functions base URL is read out of the job that already exists rather than
-- written here as a literal. This project has been rebuilt once already and the
-- migrations still carry the old project ref in their cron bodies; deriving it
-- means these three jobs cannot inherit that mistake.
do $$
declare
  base text;
  cmd  text;
begin
  select substring(command from 'https://[a-z0-9]+\.supabase\.co/functions/v1')
    into base
    from cron.job
   where jobname in ('chase-target-daily', 'storm-engine-nightly', 'daily-digest-morning')
     and command like '%functions/v1%'
   order by case jobname when 'chase-target-daily' then 0 else 1 end
   limit 1;

  if base is null then
    raise notice 'chase schedules: no existing job to copy the functions URL from; skipping';
    return;
  end if;

  -- Overnight: the day rolls over here.
  cmd := format($f$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-engine-secret',(select value->>'secret' from public.app_config where key = 'storm_engine_secret')
      ),
      body := jsonb_build_object('trigger','cron','pass','early'),
      timeout_milliseconds := 170000
    );
  $f$, base || '/chase-target');

  perform cron.unschedule('chase-target-daily');
  perform cron.schedule('chase-target-early', '25 4 * * *', cmd);

  -- Mid-morning: same day, upgraded to SPC's own Day 1 once it exists.
  cmd := replace(cmd, '''pass'',''early''', '''pass'',''refresh''');
  perform cron.schedule('chase-target-refresh', '35 13 * * *', cmd);

  -- The backfill walks itself home and then costs nothing, because a run with
  -- no missing dates returns before it fetches anything.
  cmd := format($f$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-engine-secret',(select value->>'secret' from public.app_config where key = 'storm_engine_secret')
      ),
      body := jsonb_build_object('trigger','cron','action','backfill'),
      timeout_milliseconds := 170000
    );
  $f$, base || '/chase-target');

  perform cron.schedule('chase-backfill-chunk', '*/20 * * * *', cmd);
exception
  when undefined_function then
    raise notice 'chase schedules: pg_cron not available here; skipping';
end
$$;

-- Where the backfill stops. March 7 is the start of the chase season the module
-- is written for; keeping it in config means the Owner can move it without a
-- deploy, and means the function has no calendar knowledge of its own.
insert into public.app_config (key, value)
values ('chase_backfill', jsonb_build_object(
  'from', '2026-03-07',
  'days_per_run', 8,
  'enabled', true
))
on conflict (key) do nothing;
