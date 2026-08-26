-- The five-level alert ladder.
--
-- Until now "alerts" was a set of loose booleans on notification_prefs plus a
-- hard-coded tier check inside the fan-out function. That could not answer the
-- two questions this feature exists to answer: what is this member entitled to,
-- and what would it cost them to have more.
--
-- So alerts become a product, priced and sold the same way modules already are.
-- Two levels are free to everyone, each tier includes more, and any level can be
-- bought individually regardless of tier.
--
--   1  In-app notification for severe weather affecting your state
--   2  Push notification, scoped how the member chooses
--   3  Email or text to a real contact, scoped the same way
--   4  Everything in 3, plus SPC and winter outlook alerts at the start of the
--      day, plus the Emergency Contact PIN
--   5  Everything in 4, plus a direct line: we make contact personally when we
--      see something troubling
--
-- Included from tier: 1 and 2 from free, 3 from basic, 4 from VIP, 5 from
-- advanced. Tiers are integers here (1 free, 2 basic, 3 VIP, 4 advanced).

-- ── the catalogue and its prices ─────────────────────────────────────────────
-- Shape deliberately mirrors module_addon_prices so the admin pricing panel is
-- the same idea twice rather than two ideas. There is no advanced_price column
-- for the same reason there is none on modules: the top tier includes
-- everything, so it can never be charged an add-on price.
create table if not exists public.alert_level_prices (
  level         integer primary key check (level between 1 and 5),
  label         text not null,
  blurb         text not null default '',
  -- What a member of each tier pays to add this level as an extra. NULL means
  -- the level is already included at that tier and is not for sale to them.
  free_price    numeric(10,2),
  basic_price   numeric(10,2),
  vip_price     numeric(10,2),
  stripe_free_price_id  text,
  stripe_basic_price_id text,
  stripe_vip_price_id   text,
  updated_at    timestamptz not null default now()
);

insert into public.alert_level_prices (level, label, blurb, free_price, basic_price, vip_price) values
  (1, 'In-App Alerts',      'Severe weather affecting your state, in your notification inbox.',                     null, null, null),
  (2, 'Push Alerts',        'Pushed to your phone for the state, one location, several, or everywhere.',           null, null, null),
  (3, 'Contact Alerts',     'Email or text to a real contact of yours, scoped the same way.',                       2.99, null, null),
  (4, 'Outlook & Vault',    'Everything in Contact Alerts, plus SPC and winter outlooks at the start of the day, plus the Emergency Contact PIN.', 4.99, 3.99, null),
  (5, 'Direct Line',        'Everything above, and we contact you personally when we see something troubling.',     9.99, 7.99, 5.99)
on conflict (level) do nothing;

alter table public.alert_level_prices enable row level security;

-- The catalogue is readable by anyone, signed in or not: the signup page shows
-- it before an account exists, and a price nobody can see is a price nobody pays.
drop policy if exists alert_prices_read on public.alert_level_prices;
create policy alert_prices_read on public.alert_level_prices
  for select to anon, authenticated using (true);

drop policy if exists alert_prices_write on public.alert_level_prices;
create policy alert_prices_write on public.alert_level_prices
  for all using (private.is_admin()) with check (private.is_admin());

-- ── what a member actually holds ─────────────────────────────────────────────
-- Only levels that were BOUGHT or GRANTED get a row. Levels included by tier are
-- computed, never stored, so a tier change can never leave a stale entitlement
-- behind and a downgrade cannot silently keep a level the member stopped paying
-- for.
create table if not exists public.alert_entitlements (
  user_id    uuid not null references auth.users (id) on delete cascade,
  level      integer not null check (level between 1 and 5),
  source     text not null default 'purchased' check (source in ('purchased', 'granted')),
  note       text,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, level)
);

create index if not exists alert_entitlements_user_idx on public.alert_entitlements (user_id);

alter table public.alert_entitlements enable row level security;

drop policy if exists alert_ent_read on public.alert_entitlements;
create policy alert_ent_read on public.alert_entitlements
  for select using (private.is_admin() or user_id = auth.uid());

-- Members never write their own entitlements. Purchases arrive through the
-- billing webhook under the service role; admins grant through the panel.
drop policy if exists alert_ent_admin on public.alert_entitlements;
create policy alert_ent_admin on public.alert_entitlements
  for all using (private.is_admin()) with check (private.is_admin());

revoke insert, update, delete on public.alert_entitlements from anon, authenticated;

-- ── how the member wants to be reached ───────────────────────────────────────
-- Scope is one setting, not one per level: a member who wants "all my locations"
-- wants it for push and for text alike, and asking twice is how preferences
-- drift out of sync with each other.
alter table public.notification_prefs
  add column if not exists alert_scope text not null default 'state'
    check (alert_scope in ('state', 'location', 'multiple', 'all')),
  add column if not exists alert_location_ids uuid[] not null default '{}',
  add column if not exists alert_state text,
  -- Level 5 members can say how they would rather be reached when we call.
  add column if not exists direct_line_note text;

-- ── the rule, in one place ───────────────────────────────────────────────────
-- Which tier each level starts being free at. Kept as a function rather than a
-- table because it is the product definition, not configuration: changing it is
-- a decision, not a setting.
create or replace function public.alert_level_included_from(p_level integer)
returns integer
language sql
immutable
as $$
  select case p_level
    when 1 then 1   -- free
    when 2 then 1   -- free
    when 3 then 2   -- basic
    when 4 then 3   -- VIP
    when 5 then 4   -- advanced
    else 99
  end;
$$;

/**
 * Every level a user holds, and why.
 *
 * `source` is 'tier' when the level comes with what they already pay for,
 * 'purchased' when they added it, 'granted' when an admin gave it to them. The
 * distinction matters on screen: a member should be able to see what they are
 * getting for free and what they are paying extra for.
 */
create or replace function public.alert_levels_for(p_user uuid)
returns table (level integer, source text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select coalesce(tier, 1) as tier from public.profiles where id = p_user)
  select l.level,
         case
           when (select tier from t) >= public.alert_level_included_from(l.level) then 'tier'
           else coalesce(e.source, 'none')
         end as source
  from generate_series(1, 5) as l(level)
  left join public.alert_entitlements e on e.user_id = p_user and e.level = l.level
  where (select tier from t) >= public.alert_level_included_from(l.level)
     or e.level is not null;
$$;

revoke execute on function public.alert_levels_for(uuid) from public, anon;
grant execute on function public.alert_levels_for(uuid) to authenticated, service_role;

/** The caller's own levels. The client never passes its own id. */
create or replace function public.my_alert_levels()
returns table (level integer, source text)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.alert_levels_for(auth.uid());
$$;

revoke execute on function public.my_alert_levels() from public, anon;
grant execute on function public.my_alert_levels() to authenticated;

create or replace function public.has_alert_level(p_user uuid, p_level integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.alert_levels_for(p_user) l where l.level = p_level);
$$;

revoke execute on function public.has_alert_level(uuid, integer) from public, anon;
grant execute on function public.has_alert_level(uuid, integer) to authenticated, service_role;

/**
 * The Emergency Contact PIN, released to the people who are entitled to it.
 *
 * Level 4 is partly defined as "and they receive the PIN", so the PIN has to be
 * reachable from the app rather than told to people by hand. It is still never
 * readable from the client directly: app_config stays closed, this function
 * checks the entitlement, and anyone without level 4 gets null rather than an
 * error, because an error would confirm that a PIN exists to probe for.
 */
create or replace function public.my_emergency_pin()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  if auth.uid() is null then return null; end if;
  if not (public.has_alert_level(auth.uid(), 4) or private.is_admin()) then
    return null;
  end if;
  select value->>'pin' into v_pin from public.app_config where key = 'emergency_pin';
  return v_pin;
end;
$$;

revoke execute on function public.my_emergency_pin() from public, anon;
grant execute on function public.my_emergency_pin() to authenticated;

-- ── admin views ──────────────────────────────────────────────────────────────
/**
 * Who is on which level, for the Alerts tab.
 *
 * Level 5 is the one that creates an obligation on us rather than on the
 * software: it promises a person will make contact. The admin panel needs that
 * list in front of it, with contact details, or the promise is not kept.
 */
create or replace function public.admin_alert_roster()
returns table (
  user_id     uuid,
  name        text,
  email       text,
  tier        integer,
  levels      integer[],
  purchased   integer[],
  scope       text,
  alert_email text,
  alert_phone text,
  locations   integer,
  direct_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, coalesce(p.tier, 1),
         coalesce((select array_agg(l.level order by l.level) from public.alert_levels_for(p.id) l), '{}'),
         coalesce((select array_agg(e.level order by e.level) from public.alert_entitlements e where e.user_id = p.id), '{}'),
         coalesce(np.alert_scope, 'state'),
         np.alert_email, np.alert_phone,
         (select count(*)::integer from public.saved_locations s where s.user_id = p.id),
         np.direct_line_note
  from public.profiles p
  left join public.notification_prefs np on np.user_id = p.id
  where private.is_admin()
  order by coalesce(p.tier, 1) desc, p.name;
$$;

revoke execute on function public.admin_alert_roster() from public, anon;
grant execute on function public.admin_alert_roster() to authenticated;

/** Grant or revoke a level by hand, from the admin panel. */
create or replace function public.admin_set_alert_level(
  p_user uuid, p_level integer, p_on boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only';
  end if;
  if p_level < 1 or p_level > 5 then
    raise exception 'level must be 1-5';
  end if;
  if p_on then
    insert into public.alert_entitlements (user_id, level, source, note, granted_by)
    values (p_user, p_level, 'granted', p_note, auth.uid())
    on conflict (user_id, level) do update
      set source = 'granted', note = excluded.note, granted_by = excluded.granted_by;
  else
    delete from public.alert_entitlements where user_id = p_user and level = p_level;
  end if;
end;
$$;

revoke execute on function public.admin_set_alert_level(uuid, integer, boolean, text) from public, anon;
grant execute on function public.admin_set_alert_level(uuid, integer, boolean, text) to authenticated;
drop function if exists public.admin_alert_roster();

-- The roster needs coordinates: the Direct Line panel promises a person makes
-- contact, so it has to be able to check, live, which of those members are
-- somewhere with an active warning right now. Without a point to check it was
-- an obligation with no way to see when it came due.
create or replace function public.admin_alert_roster()
returns table (
  user_id     uuid,
  name        text,
  email       text,
  tier        integer,
  levels      integer[],
  purchased   integer[],
  scope       text,
  alert_email text,
  alert_phone text,
  locations   integer,
  direct_note text,
  lat         double precision,
  lon         double precision,
  place       text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, coalesce(p.tier, 1),
         coalesce((select array_agg(l.level order by l.level) from public.alert_levels_for(p.id) l), '{}'),
         coalesce((select array_agg(e.level order by e.level) from public.alert_entitlements e where e.user_id = p.id), '{}'),
         coalesce(np.alert_scope, 'state'),
         np.alert_email, np.alert_phone,
         (select count(*)::integer from public.saved_locations s where s.user_id = p.id),
         np.direct_line_note,
         sl.lat, sl.lon, sl.name
  from public.profiles p
  left join public.notification_prefs np on np.user_id = p.id
  left join lateral (
    select s.lat, s.lon, s.name
    from public.saved_locations s
    where s.user_id = p.id
    order by s.is_primary desc, s.created_at
    limit 1
  ) sl on true
  where private.is_admin()
  order by coalesce(p.tier, 1) desc, p.name;
$$;

revoke execute on function public.admin_alert_roster() from public, anon;
grant execute on function public.admin_alert_roster() to authenticated;
