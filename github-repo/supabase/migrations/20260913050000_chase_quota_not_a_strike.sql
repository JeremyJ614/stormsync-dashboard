-- Give back the strikes that Open-Meteo's daily cap took off good dates.
--
-- `chase_missing_dates` retires a date once three rows in `chase_runs` carry
-- `status = 'error'` for it. That rule is right — some days genuinely cannot be
-- rebuilt, and without it the job would grind on the same Tuesday in April for
-- ever — but the backfill was writing `error` for running out of Open-Meteo
-- quota as well, which says nothing whatever about the date.
--
-- Because the RPC hands back the NEWEST unfilled date first, it was always the
-- same date in the firing line when the free tier ran dry. Three dry days and a
-- perfectly reconstructable date was retired permanently; the next one down
-- then became "newest unfilled" and started collecting its own three. The
-- backfill was not stuck on one date so much as walking backwards abandoning
-- good ones, which is why it looked like it had stopped dead in mid-April.
--
-- The engine now records these as `status = 'quota'`, which the three-strikes
-- rule does not count. This reclassifies the rows already written, so the dates
-- they retired come back into the queue on the next run.
--
-- Matching on the detail text rather than on a guess about which dates were
-- affected: that string is written in exactly one place in the function, and a
-- date that failed for a real reason keeps its strike.
update public.chase_runs
   set status = 'quota'
 where status = 'error'
   and detail like '%Open-Meteo daily request limit exhausted%';

-- The `error` status keeps its meaning — "this date resisted reconstruction for
-- a reason that will still be true tomorrow" — and `quota` means "we ran out of
-- allowance before we got to it". Only the first should ever retire a date.
comment on column public.chase_runs.status is
  'ok | error | quota. Only ''error'' counts toward the three-strikes rule in '
  'chase_missing_dates: it means the date itself resisted reconstruction. ''quota'' means '
  'the run hit Open-Meteo''s daily cap before reaching the date, which is a reason to wait, '
  'not a reason to give up on the day.';
