-- Stop the backfill sharing a minute with the live chase runs.
--
-- `chase-backfill-chunk` posts to the SAME edge function as the four live
-- passes — it is the same `chase-target`, called with `{"action":"backfill"}`.
-- Its schedule is `*/30 * * * *`, so it fires at :00 and :30 of every hour,
-- which is exactly when two of the live passes fire: the night run at 00:30Z
-- and the afternoon run at 16:30Z.
--
-- Two invocations of the heaviest function in the project, launched in the same
-- second, competing for the same edge worker allowance. The logs for 15
-- September show five workers booting simultaneously at 16:30:00.
--
-- That was not the cause of the outage this migration accompanies — that was a
-- public WMS hanging under a burst, fixed in the function itself — but it is a
-- standing risk with no upside, and the backfill does not care which minute it
-- runs in. Five past and thirty-five past are equally good to it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chase-backfill-chunk') then
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = 'chase-backfill-chunk'),
      schedule := '5,35 * * * *');
  end if;
end $$;
