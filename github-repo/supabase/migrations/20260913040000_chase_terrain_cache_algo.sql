-- Retire terrain rows measured by a scorer that no longer exists.
--
-- `chase_terrain_cache` was keyed on position alone — `"<lat cell>:<lon cell>"` —
-- and `terrainFor` returned any hit it found without asking which scorer had
-- written it. The first scorer to reach a cell therefore owned that cell for
-- ever, because a cache hit never re-runs the measurement.
--
-- That was invisible while the cache was broken. The original migration revoked
-- every privilege on this table and granted service_role nothing, so every read
-- came back 42501 and `terrainFor` swallowed it ("cache is an optimisation").
-- Fixing the grant in 20260913010000 is what switched the staleness on: from
-- that moment the old standard-deviation scorer's numbers — which clamped to
-- 100 almost everywhere east of the Rockies — started being stored, and then
-- returned to every later run.
--
-- The engine now stamps the algorithm into the key (`v2:<lat>:<lon>`), so rows
-- from the old key space can no longer be read by anything. This deletes them
-- rather than leaving them to sit in the table for ever.
--
-- Safe to run more than once, and safe to run before or after the deploy: the
-- rows it removes are unreadable either way. Cells are simply measured again
-- the next time an outlook lands on them.
delete from public.chase_terrain_cache
where cell_key not like 'v%';

comment on table public.chase_terrain_cache is
  'Chase-terrain measurements on a 0.05° grid, keyed "v<algo>:<lat cell>:<lon cell>". '
  'Written by the chase-target edge function; read by nothing else. Terrain does not change '
  'day to day, so a cell is measured once and reused by every later outlook and by the '
  'historical backfill — but only by the scorer version that measured it. Bumping ALGO in '
  'terrain.ts retires every earlier row, which is the only way a scoring change can reach '
  'ground that has already been measured.';
