-- Drain the owner queue every two minutes.
--
-- Tighter than the ten-minute member sweeps on purpose: a warning ten minutes
-- late is still a warning, but "somebody just signed up" ten minutes late has
-- stopped being news. Two minutes is as close to immediate as pg_cron goes
-- without a job that is mostly no-ops.
select cron.unschedule('owner-dispatch-2min')
where exists (select 1 from cron.job where jobname = 'owner-dispatch-2min');

select cron.schedule(
  'owner-dispatch-2min',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://djonpetxdjuwcbgftqmt.supabase.co/functions/v1/owner-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-engine-secret', (select value->>'secret' from public.app_config where key = 'storm_engine_secret')
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 60000
  );
  $cron$
);
