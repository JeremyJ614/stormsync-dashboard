-- StormSync VIP — housekeeping.
--
-- The previous project was restricted for exceeding its storage quota and every
-- member lost access to everything: Auth, the Data API, Edge Functions and
-- Storage all answered 402 together. Rendered model frames were the cause and
-- they now have retention. This is the same question asked of everything else
-- that grows, because the free plan allows 500 MB of database and the tables
-- below had nothing deleting from them at all.
--
-- WHAT IS *NOT* PRUNED HERE, deliberately.
--
--   notifications, module_views, push_sent
--
-- Each of these is read by `evaluate_badges` as a LIFETIME counter — total
-- module opens, distinct days active, alerts received, notifications received.
-- Deleting old rows would quietly revoke badges people have earned and move the
-- goalposts for the ones they are working towards. They grow with membership
-- rather than with time, at a few hundred bytes a row, and that is a cost worth
-- paying for a ledger that has to be permanent. If they ever do need trimming,
-- the badge counters have to be snapshotted first.

-- ── the weather cache ───────────────────────────────────────────────────────
--
-- Every upstream fetch upserts here and nothing has ever deleted. Two of the
-- key families are unbounded by construction:
--
--   tropical:radii:<storm>:<advisory>   a new 140 kB row for every advisory of
--                                       every storm, kept for ever
--   water:gauges:<bbox>                 a new 260 kB row for every distinct map
--                                       viewport anybody has ever looked at
--
-- Nothing re-reads an old advisory, or a bbox nobody is looking at any more, so
-- this is dead weight that only accumulates: one season of tropical advisories
-- is on the order of 150 MB against a 500 MB database.
--
-- Eviction is safe by design — a miss costs one upstream fetch, which is what
-- the cache is for. The age cap is generous because several functions fall back
-- to a stale row when upstream is down, and that safety net is worth a week of
-- rows.
create or replace function public.prune_weather_cache(
  max_age_hours int default 168,
  keep_per_family int default 60
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
  age interval := make_interval(hours => greatest(coalesce(max_age_hours, 168), 1));
  keep int := greatest(coalesce(keep_per_family, 60), 1);
begin
  with ranked as (
    select
      key,
      fetched_at,
      -- Family, not key: `tropical:radii` is one family with a thousand keys,
      -- while `spc:outlook` is one family with three that are overwritten in
      -- place. Only the first kind can run away.
      row_number() over (
        partition by split_part(key, ':', 1) || ':' || split_part(key, ':', 2)
        order by fetched_at desc
      ) as rn
    from public.weather_cache
  ),
  doomed as (
    select key from ranked where rn > keep or fetched_at < now() - age
  )
  delete from public.weather_cache c using doomed d where c.key = d.key;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ── the logs ────────────────────────────────────────────────────────────────
--
-- cron.job_run_details records every firing of every scheduled job — around a
-- thousand rows a day at the current schedule, for ever, and nothing in the app
-- reads a run older than the last few. The audit trail is kept far longer
-- because it is the record of who changed what.
create or replace function public.prune_operational_logs(
  cron_days int default 7,
  engine_days int default 180,
  audit_days int default 365
)
returns jsonb
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  a int := 0; b int := 0; c int := 0;
begin
  delete from cron.job_run_details
   where start_time < now() - make_interval(days => greatest(coalesce(cron_days, 7), 1));
  get diagnostics a = row_count;

  delete from public.storm_engine_runs
   where ran_at < now() - make_interval(days => greatest(coalesce(engine_days, 180), 7));
  get diagnostics b = row_count;

  delete from public.admin_audit
   where created_at < now() - make_interval(days => greatest(coalesce(audit_days, 365), 90));
  get diagnostics c = row_count;

  return jsonb_build_object('cronRuns', a, 'engineRuns', b, 'auditRows', c);
end;
$$;

revoke all on function public.prune_weather_cache(int, int) from public;
revoke all on function public.prune_weather_cache(int, int) from anon, authenticated;
revoke all on function public.prune_operational_logs(int, int, int) from public;
revoke all on function public.prune_operational_logs(int, int, int) from anon, authenticated;
grant execute on function public.prune_weather_cache(int, int) to service_role;
grant execute on function public.prune_operational_logs(int, int, int) to service_role;

comment on function public.prune_weather_cache(int, int) is
  'Evicts weather_cache rows past an age cap or beyond the newest N per key family.';
comment on function public.prune_operational_logs(int, int, int) is
  'Trims cron run history, storm-engine run history and the admin audit trail.';

-- Half an hour before the model-map retention pass, so a day's tidying happens
-- in one window and the two never contend for the same locks.
select cron.unschedule('housekeeping-daily')
where exists (select 1 from cron.job where jobname = 'housekeeping-daily');

select cron.schedule(
  'housekeeping-daily',
  '10 12 * * *',
  $cron$
    select public.prune_weather_cache();
    select public.prune_operational_logs();
  $cron$
);

-- ── the model-map ceiling ───────────────────────────────────────────────────
--
-- Retention kept the newest twelve cycles per model. Measured against what the
-- renderer actually produces — a GFS cycle is 102 frames at ~179 kB (18 MB) and
-- a full HRRR cycle is 152 frames at ~231 kB (35 MB), four cycles a day each —
-- twelve is a steady state of about 640 MB against a 1 GB allowance. That is
-- 64% of the quota permanently occupied by an archive the viewer cannot reach
-- past its sixth entry, on the same plan whose storage limit took the previous
-- project offline.
--
-- Eight is still two more than `listRuns` offers and brings the ceiling to
-- about 430 MB. Nothing currently held is affected; it changes where the line
-- sits once a full archive has accumulated.
update public.app_config
   set value = jsonb_set(value, '{keep_runs}', '8'::jsonb)
 where key = 'model_map_retention';
