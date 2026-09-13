-- An early look at tomorrow, half an hour after the 00Z data cycle.
--
-- The module previously produced a day's targets at 04:25Z and refreshed them
-- at 13:35Z. 04:25Z is the small hours across the United States, which is a
-- sensible moment to roll the day over but a late one to find out where to be:
-- the whole point of a chase target is deciding the night before whether to
-- drive.
--
-- 00:30Z is thirty minutes after the 00Z synoptic cycle — the balloons NWS
-- launches at 00Z are the first observations that belong to the coming
-- convective day, and the models initialised from them are the first guidance
-- for it. In United States time that is half past eight in the evening on the
-- East Coast.
--
-- WHY THIS IS AN ADDITIONAL RUN AND NOT A REPLACEMENT
-- At 00:30Z the 00Z model output is only beginning to appear: HRRR is in, but
-- HRRR does not reach tomorrow afternoon, and the global models that do are
-- still running. The 04:25Z pass sees the finished 00Z GFS, and the 13:35Z pass
-- sees SPC's 1300Z Day 1 with its tornado, hail and wind probabilities — the
-- strongest single signal the engine has. Each run overwrites the same row, so
-- the answer sharpens through the night rather than being fixed at its
-- earliest and weakest.
--
-- The command is copied from the existing job rather than written out, so the
-- engine secret stays where it already is and appears nowhere in this file.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'chase-target-night') then
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = 'chase-target-night'),
      schedule := '30 0 * * *', active := true);
  else
    perform cron.schedule(
      'chase-target-night', '30 0 * * *',
      (select command from cron.job where jobname = 'chase-target-early'));
  end if;
end $$;

-- While we are here: the historical backfill ran every twenty minutes, which is
-- seventy-two chunks a day against a weather API whose free tier is exhausted
-- by roughly a hundred reconstructed days. Every chunk past that point used to
-- write a row per date saying the day scored zero. The engine now stops on the
-- quota rather than inventing those rows, and two-hourly keeps the whole day's
-- work comfortably inside one day's allowance.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'chase-backfill-chunk'),
  schedule := '0 */2 * * *',
  active := true);
