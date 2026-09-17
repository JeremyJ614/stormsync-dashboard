-- Nothing was archiving finished tropical systems.
--
-- The Hurricane Tracker's archive read from `tropical_storms`, the app showed
-- it, and every row in it had been inserted by hand — so the newest storm in
-- the archive was Genevieve, from early August, while the season carried on
-- without her. A storm dropped off the tracker when the NHC stopped advising
-- on it and simply ceased to exist.
--
-- The archiver lives in the `nhc` edge function (`POST /archive-finished`),
-- and is stateless by design: the ATCF best-track directory lists every system
-- of the season, CurrentStorms.json lists the ones still being advised on, and
-- anything in the first and not the second is over. A storm missed because the
-- job was down is picked up the next time it runs.

-- Ids were stored in mixed case, so the /track route — which looks them up
-- upper-cased — could never find the lower-cased rows.
update public.tropical_storms set id = upper(id) where id <> upper(id);

select cron.schedule('tropical-archive-daily', '45 12 * * *', $j$
  select net.http_post(
    url := 'https://sofrhcdjkjfphibysmxc.supabase.co/functions/v1/nhc/archive-finished',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-engine-secret', (select value->>'secret' from public.app_config where key = 'storm_engine_secret')
    ),
    body := '{}'::jsonb
  );
$j$);
