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
-- Routine deletion belongs to the `model-retention` Edge Function, which goes
-- through the Storage API so the files actually leave. Deleting rows out of
-- `storage.objects` strands the underlying objects, which is precisely what
-- `protect_delete` on that table exists to prevent. This migration supplies the
-- list; the function does the removing.
--
-- The one-time recovery was the exception, and it could not be anything else:
-- the Storage API was itself behind the 402, so the only way back under quota
-- was a direct delete using `protect_delete`'s own opt-in setting. That did
-- strand 15,938 files, and the orphan ledger at the bottom of this migration is
-- how they get cleaned up properly once the API is reachable again.

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
    url := 'https://sofrhcdjkjfphibysmxc.supabase.co/functions/v1/model-retention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retention-secret', (select value->>'secret' from public.app_config where key = 'model_retention_secret')
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 150000
  );
  $cron$
);

-- ── orphan ledger ────────────────────────────────────────────────────────────
--
-- Recovering from the outage needed a direct delete out of `storage.objects`,
-- because the Storage API was itself behind the 402 and could not be used to
-- get back under quota. `storage.protect_delete` has a sanctioned opt-in for
-- exactly that (`storage.allow_delete_query`), so no guard was disabled — but
-- the consequence is real: the rows are gone and the underlying files are not.
--
-- Without their metadata rows those files cannot be addressed by the Storage
-- API, so they would sit there forever, invisible and unaddressable. This table
-- remembers their names. `model-retention` re-registers a batch each run and
-- deletes it properly, which walks the whole backlog down to nothing and then
-- costs nothing to keep.
create table if not exists public.model_map_orphans (
  name      text primary key,
  swept_at  timestamptz
);

alter table public.model_map_orphans enable row level security;
-- No policies: service role only. Nothing member-facing reads this.

/** A batch of orphan names still needing a sweep. */
create or replace function public.next_model_map_orphans(batch integer default 100)
returns setof text
language sql
security definer
set search_path = public
as $$
  select name from public.model_map_orphans
  where swept_at is null
  order by name
  limit greatest(1, least(batch, 1000));
$$;

revoke all on function public.next_model_map_orphans(integer) from public, anon, authenticated;

/** Mark names the Storage API has now actually removed. */
create or replace function public.mark_model_map_orphans_swept(names text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.model_map_orphans
     set swept_at = now()
   where name = any(names) and swept_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_model_map_orphans_swept(text[]) from public, anon, authenticated;

/**
 * Put a placeholder row back for an orphaned file so the Storage API can see it.
 *
 * The API deletes an object by looking it up in `storage.objects` first and then
 * removing it from the backing store; with no row it answers "not found" and the
 * file survives. So the sweep re-registers a batch, deletes it the proper way,
 * and the row leaves with the file. `metadata` is minimal on purpose — it is
 * used for nothing but the lookup, and the row exists for a few seconds.
 */
create or replace function public.register_model_map_orphans(names text[])
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare n int;
begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  select 'model-maps', u.name, null, '{"size": 0}'::jsonb
  from unnest(names) as u(name)
  on conflict (bucket_id, name) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.register_model_map_orphans(text[]) from public, anon, authenticated;
