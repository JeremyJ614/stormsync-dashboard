-- Per-model map retention.
--
-- WHY THIS IS NEEDED NOW
-- The parameter catalogue has gone from twenty products to sixty-one across
-- three models: HRRR 8 → 23, GFS 12 → 17, and HREF ensemble probabilities added
-- at 21. At the flat `keep_runs: 8` this table has carried, that is roughly
--
--   HRRR   23 × 19 frames × 8 runs = 3,496
--   GFS    17 × 17 frames × 8 runs = 2,312
--   HREF   21 × 19 frames × 8 runs = 3,192
--
-- about 9,000 objects. At the ~197 kB a frame currently weighs that is 1.8 GB,
-- and this project has already been taken offline once — Auth, the Data API,
-- Edge Functions and Storage all answering 402 — by model maps filling the
-- storage quota. Shipping sixty-one parameters on a flat retention would walk
-- straight back into it.
--
-- Two changes keep it affordable. The renderer now palette-quantises every PNG,
-- which is worth roughly 40% at no visible cost; and retention becomes
-- per-model, because the three do not deserve equal shelf space. HREF is the
-- biggest and the most perishable — an ensemble probability from eighteen hours
-- ago is of no interest — so it keeps the fewest.
--
--   HRRR 6 × 437 = 2,622      GFS 6 × 289 = 1,734      HREF 4 × 399 = 1,596
--
-- ~6,000 objects at ~120 kB after quantising: about 700 MB, with headroom.
--
-- The viewer shows six runs per model, so HRRR and GFS lose nothing. HREF's
-- archive dropdown will offer four.

update public.app_config
   set value = jsonb_build_object(
     'keep_runs', 6,                       -- the default for a model not listed
     'per_model', jsonb_build_object('hrrr', 6, 'gfs', 6, 'href', 4)
   )
 where key = 'model_map_retention';

insert into public.app_config (key, value)
values ('model_map_retention', jsonb_build_object(
  'keep_runs', 6,
  'per_model', jsonb_build_object('hrrr', 6, 'gfs', 6, 'href', 4)
))
on conflict (key) do nothing;

/**
 * Object names retention should remove, with the window chosen per model.
 *
 * Same contract as before — it lists, the `model-retention` Edge Function does
 * the removing through the Storage API so the files actually leave. The only
 * change is that `keep` is now looked up per model instead of being one number
 * for all of them.
 */
create or replace function public.stale_model_map_objects(keep_runs integer default null)
returns table (name text, size bigint)
language sql
security definer
set search_path = public, storage
as $$
  with cfg as (
    select
      coalesce(
        keep_runs,
        (select (value->>'keep_runs')::int from public.app_config where key = 'model_map_retention'),
        6
      ) as fallback,
      coalesce(
        (select value->'per_model' from public.app_config where key = 'model_map_retention'),
        '{}'::jsonb
      ) as per_model
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
    -- An explicit `keep_runs` argument still overrides everything, so a manual
    -- one-off sweep behaves exactly as it always did.
    where r.rn <= coalesce(
      keep_runs,
      (cfg.per_model ->> r.model)::int,
      cfg.fallback
    )
  )
  select o.name, (o.metadata->>'size')::bigint
  from storage.objects o
  where o.bucket_id = 'model-maps'
    and split_part(o.name, '/', 1) || '/' || split_part(o.name, '/', 2)
        not in (select prefix from keepers);
$$;

revoke all on function public.stale_model_map_objects(integer) from public, anon, authenticated;

/** The manifest side of the same window. */
create or replace function public.prune_model_runs(keep_runs integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback int;
  per_model jsonb;
  removed int;
begin
  select
    coalesce(keep_runs, (value->>'keep_runs')::int, 6),
    coalesce(value->'per_model', '{}'::jsonb)
    into fallback, per_model
    from public.app_config where key = 'model_map_retention';

  fallback := coalesce(fallback, keep_runs, 6);
  per_model := coalesce(per_model, '{}'::jsonb);

  with ranked as (
    select id, model, row_number() over (partition by model order by cycle desc) as rn
    from public.model_runs
  )
  delete from public.model_runs m
  using ranked r
  where m.id = r.id
    and r.rn > coalesce(keep_runs, (per_model ->> r.model)::int, fallback);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_model_runs(integer) from public, anon, authenticated;
