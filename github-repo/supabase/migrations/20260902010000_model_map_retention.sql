-- Model-map retention.
--
-- The renderer uploads a full set of frames every cycle and nothing ever took
-- them away again. Twenty-six days of HRRR and GFS reached 3.7 GB across 18,642
-- objects, went past the project's storage quota, and Supabase restricted the
-- whole project: Auth, the Data API, Edge Functions and Storage all answering
-- 402. Nobody could sign in, because model maps from three weeks ago were still
-- on disk.
--
-- The viewer reads six runs per model. Everything older than that was never
-- reachable through the product at all, so this keeps twelve — double what the
-- archive dropdown can show — and drops the rest daily.
--
-- Deletion itself belongs to the `model-retention` Edge Function, which goes
-- through the Storage API so the files actually leave. Deleting rows out of
-- `storage.objects` here would strand the underlying objects: `protect_delete`
-- on that table refuses direct deletes for exactly that reason, and it is right
-- to. This migration only supplies the list.

-- How many cycles per model survive. One row so it can be tuned without a
-- deploy, and so the function and any future caller agree on the number.
insert into public.app_config (key, value)
values ('model_map_retention', '{"keep_runs": 12}'::jsonb)
on conflict (key) do nothing;

/**
 * Object names that retention should remove.
 *
 * Two kinds are returned:
 *   1. frames belonging to a cycle older than the newest `keep_runs`, and
 *   2. frames under a cycle prefix with no `model_runs` row at all — orphans
 *      from a render that uploaded and then failed to write its manifest.
 *
 * SECURITY DEFINER because `storage.objects` is owned by the storage role and
 * is not otherwise readable from here. It only ever reads, and it is revoked
 * from anon and authenticated below: this is a service-role tool.
 */
create or replace function public.stale_model_map_objects(keep_runs integer default null)
returns table (name text, size bigint)
language sql
security definer
set search_path = public, storage
as $$
  with cfg as (
    select coalesce(
      keep_runs,
      (select (value->>'keep_runs')::int from public.app_config where key = 'model_map_retention'),
      12
    ) as keep
  ),
  ranked as (
    select
      m.model,
      to_char(m.cycle at time zone 'UTC', 'YYYYMMDDHH24') as stamp,
      row_number() over (partition by m.model order by m.cycle desc) as rn
    from public.model_runs m
  ),
  keepers as (
    select r.model || '/' || r.stamp as prefix
    from ranked r, cfg
    where r.rn <= cfg.keep
  )
  select o.name, (o.metadata->>'size')::bigint
  from storage.objects o
  where o.bucket_id = 'model-maps'
    and split_part(o.name, '/', 1) || '/' || split_part(o.name, '/', 2)
        not in (select prefix from keepers);
$$;

revoke all on function public.stale_model_map_objects(integer) from public, anon, authenticated;

/**
 * Drop the manifest rows for cycles past the retention window.
 *
 * Called after the frames are gone, so a failure part-way through leaves rows
 * pointing at missing files rather than files nothing points at — the first is
 * a visibly broken run the next pass cleans up, the second is invisible cost.
 */
create or replace function public.prune_model_runs(keep_runs integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  keep int;
  removed int;
begin
  keep := coalesce(
    keep_runs,
    (select (value->>'keep_runs')::int from public.app_config where key = 'model_map_retention'),
    12
  );

  with ranked as (
    select id, row_number() over (partition by model order by cycle desc) as rn
    from public.model_runs
  )
  delete from public.model_runs m
  using ranked r
  where m.id = r.id and r.rn > keep;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_model_runs(integer) from public, anon, authenticated;

-- Shared secret, same shape as the storm engine's: cron carries it in a header
-- and the function checks it, so nothing needs a service-role key in a job body.
insert into public.app_config (key, value)
values ('model_retention_secret', jsonb_build_object('secret', gen_random_uuid()::text))
on conflict (key) do nothing;

-- Daily, a little after the last render cycle of the day has landed. Given a
-- generous timeout: a first run has thousands of objects to work through.
select cron.schedule(
  'model-maps-retention-daily',
  '40 12 * * *',
  $cron$
  select net.http_post(
    url := 'https://djonpetxdjuwcbgftqmt.supabase.co/functions/v1/model-retention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retention-secret', (select value->>'secret' from public.app_config where key = 'model_retention_secret')
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 150000
  );
  $cron$
);
