-- StormSync VIP — drop model runs whose frames are gone.
--
-- The archive dropdown is built from `model_runs`, and a row there is a promise
-- that the frames exist. When the previous project blew its storage quota the
-- files went and these rows stayed, so the Model Runs viewer listed twenty-four
-- cycles that could not be opened: pick one, get "Frames unavailable". That is
-- the whole of the reported bug. GFS looked fixed only because two fresh cycles
-- had since rendered and were what loaded by default.
--
-- Retention could not clear them. `stale_model_map_objects` finds OBJECTS
-- outside the newest cycles and there are no objects for these; `prune_model_runs`
-- keeps the newest twelve rows per model whether or not they point at anything.
-- Neither asks the question that matters: does this run still have frames?
--
-- A manifest row is written after the last frame uploads, so a row with no
-- objects at all is finished and empty, not in flight. The grace window is
-- belt and braces in case that order ever changes.
create or replace function public.prune_orphan_model_runs(grace_minutes int default 90)
returns int
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  removed int;
begin
  with dead as (
    select m.id
    from public.model_runs m
    where m.created_at < now() - make_interval(mins => greatest(coalesce(grace_minutes, 90), 0))
      and not exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'model-maps'
          and o.path_tokens[1] = m.model
          and o.path_tokens[2] = to_char(m.cycle at time zone 'UTC', 'YYYYMMDDHH24')
      )
  )
  delete from public.model_runs m using dead d where m.id = d.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_orphan_model_runs(int) from public;
revoke all on function public.prune_orphan_model_runs(int) from anon, authenticated;
grant execute on function public.prune_orphan_model_runs(int) to service_role;

comment on function public.prune_orphan_model_runs(int) is
  'Deletes model_runs rows that have no frames left in the model-maps bucket. Called by the model-retention function.';
