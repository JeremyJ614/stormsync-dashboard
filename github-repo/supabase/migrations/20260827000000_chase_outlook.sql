-- The Storm Chasing outlook, precomputed once a day.
--
-- The module used to rank 59 hard-coded cities in the browser on every view.
-- That had two problems: if the best target in America was forty miles from all
-- fifty-nine, it could not see it, and every reader paid for the same scan.
--
-- The new shape is one row a day, written by the `chase-target` edge function:
-- candidates generated inside the SPC risk polygons, scored against Open-Meteo,
-- narrowed to two picks at least 200 km apart, then explained by one AI call.
-- The page reads this row and nothing else, so it opens instantly, costs nothing
-- per view, and leaves a historical record behind for free.

create table if not exists public.chase_outlook (
  outlook_date  date primary key,
  status        text not null default 'ok',          -- ok | skipped | error
  model         text,
  -- 0-10, the headline number the page opens with.
  day_score     numeric(3,1) not null default 0,
  day_label     text not null default 'No Setup',
  headline      text,
  overview      text,
  -- Two entries, best first. Shape documented in src/lib/chase.ts.
  targets       jsonb not null default '[]'::jsonb,
  -- { rank: 1-5, label, summary }
  yearly        jsonb,
  tips          jsonb not null default '[]'::jsonb,
  safety        text,
  -- What the run actually saw: SPC categories, candidate count, grid spacing,
  -- how many points were scored. Kept so a wrong answer can be explained later.
  source        jsonb not null default '{}'::jsonb,
  error         text,
  generated_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists chase_outlook_date_idx on public.chase_outlook (outlook_date desc);

alter table public.chase_outlook enable row level security;

-- Every signed-in member can read the day's outlook. Nobody writes from a
-- client: the row is authored by the edge function under the service role.
drop policy if exists chase_outlook_read on public.chase_outlook;
create policy chase_outlook_read on public.chase_outlook
  for select to authenticated using (true);

revoke insert, update, delete on public.chase_outlook from anon, authenticated;

-- ── run log ──────────────────────────────────────────────────────────────────
-- Separate from storm_engine_runs so a chase failure is never mistaken for a
-- brief failure on the System Health tab.
create table if not exists public.chase_runs (
  id           bigserial primary key,
  outlook_date date not null,
  status       text not null,
  model        text,
  trigger      text,
  duration_ms  integer,
  candidates   integer,
  scored       integer,
  detail       text,
  created_at   timestamptz not null default now()
);

create index if not exists chase_runs_created_idx on public.chase_runs (created_at desc);

alter table public.chase_runs enable row level security;

drop policy if exists chase_runs_read on public.chase_runs;
create policy chase_runs_read on public.chase_runs
  for select using (private.is_admin());

revoke insert, update, delete on public.chase_runs from anon, authenticated;

-- ── the year's ledger ────────────────────────────────────────────────────────
-- The "Yearly" tab ranks today against the other chase days of the year. That
-- comparison has to come from somewhere, and asking an AI to remember the year
-- is exactly how you get an invented number. So: read it back off the rows the
-- engine has already written.
create or replace function public.chase_year_context(p_year integer default null)
returns table (
  days_scored   integer,
  best_score    numeric,
  best_date     date,
  median_score  numeric,
  above_seven   integer,
  percentile    numeric
)
language sql
stable
security definer
set search_path = public
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
    end;
$$;

revoke execute on function public.chase_year_context(integer) from public, anon;
grant execute on function public.chase_year_context(integer) to authenticated, service_role;
