-- StormSync Chases.
--
-- The chases actually driven: where the car went, where the tornado went, and
-- whatever numbers are worth putting next to each one. The route is stored
-- already snapped to roads — snapping happens once, in the admin panel, when a
-- chase is drawn, so nobody viewing the map ever calls a routing service.
--
-- Numbers per chase are deliberately free-form. Every chase is worth
-- remembering for a different reason: one for the mileage, one for how long the
-- tornado was on the ground, one for the hail. A fixed set of columns would be
-- wrong for most of them.

create table if not exists public.chases (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  chase_date    date not null,
  -- Free text; rendered through the same Markdown subset as the news feed.
  summary       text,

  -- GeoJSON LineString coordinates, [[lon,lat], …], road-snapped at save time.
  route         jsonb not null default '[]'::jsonb,
  route_miles   numeric(8,1),
  -- Whether `route` came back from a matcher or is the raw drawn line, so the
  -- map can say which it is rather than implying a precision it does not have.
  route_snapped boolean not null default false,

  -- [{ coords: [[lon,lat],…], ef: 0-5|null, width_yd, length_mi, label }]
  tornado_paths jsonb not null default '[]'::jsonb,

  -- [{ label, value }] — whatever is worth saying about this one.
  stats         jsonb not null default '[]'::jsonb,

  cover_url     text,
  -- [{ url, caption, kind: 'image'|'video' }]
  media         jsonb not null default '[]'::jsonb,

  -- Off by default. A chase is written over several sittings and should not
  -- appear half-finished.
  published     boolean not null default false,
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists chases_date_idx on public.chases (chase_date desc);
create index if not exists chases_published_idx on public.chases (published, chase_date desc);

alter table public.chases enable row level security;

-- Members see published chases; admins see everything.
drop policy if exists "chases read" on public.chases;
create policy "chases read" on public.chases
  for select using (published or private.is_admin());

drop policy if exists "chases admin write" on public.chases;
create policy "chases admin write" on public.chases
  for all using (private.is_admin()) with check (private.is_admin());

create or replace function private.touch_chase()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists chases_touch on public.chases;
create trigger chases_touch before update on public.chases
  for each row execute function private.touch_chase();

-- ── the module itself ────────────────────────────────────────────────────────
-- Added to the menu admin-only, which is how it stays off for members while the
-- first chases are written. Flipping `admin_only` off later publishes it — and
-- the Advanced grant trigger picks it up in the same moment, so nobody has to
-- remember to hand it out.
insert into public.nav_modules (module_id, label, section_id, sort_order, visible, admin_only)
select '/chases', 'StormSync Chases', s.section_id, 900, true, true
  from (select section_id from public.nav_modules
         where module_id in ('/chasing', '/climatology', '/history')
         order by sort_order limit 1) s
 where not exists (select 1 from public.nav_modules where module_id = '/chases');
