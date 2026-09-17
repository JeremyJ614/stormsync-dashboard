-- StormSync VIP — member benefits.
--
-- A raffle prize used to be one of five things a single function could do in
-- one statement: add points, mint a coupon, award a badge, add a module, grant
-- an alert level. Everything else was `manual` — a line of text saying "hand
-- this one over yourself".
--
-- The prize list this table exists for is not like that. "25% off every month
-- for a year", "the next month free then 75% off, then 50%", "pick two modules
-- and keep them for life", "take 700 points from each of the top three, at a
-- time of your choosing" — none of those are a statement. They are obligations
-- that play out over months, some of which the member has to reach out and
-- take. So they need somewhere to live.
--
-- ONE ROW PER OBLIGATION. Whatever is owed, this is where it is written down,
-- and it is the same row whether it has been applied to a live subscription, is
-- waiting for the member to have one, or is a button they have not pressed yet.
-- That matters because most members are not on a recurring plan right now: a
-- discount they win has nothing to attach to until they subscribe, and a prize
-- that quietly evaporated because there was no invoice that month would be
-- worse than not offering it.
--
-- WHY NOT PUT IT ALL IN STRIPE. Some of it does go to Stripe — a flat "50% off
-- for six months" is exactly a Stripe coupon and belongs there, where it is
-- applied without anybody's help. But a ladder that changes percentage every
-- month is not one coupon, a module grant is not billing at all, and a benefit
-- held for a member with no subscription has no Stripe object to hang on. The
-- ledger is the record; Stripe is one of the places it is enacted.

create table if not exists public.member_benefits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  -- What kind of obligation this is. Deliberately coarse: the shape of the
  -- thing, not the name of the prize.
  kind         text not null check (kind in (
    'discount',          -- a percentage off, for a number of months or for life
    'discount_ladder',   -- a different percentage each month, walking down
    'free_months',       -- 100% off, N months (a discount, named for what it is)
    'tier',              -- an account tier held for a period, or for life
    'modules',           -- named modules added, for a period or for life
    'module_credit',     -- "pick a module" — the member chooses, then it is theirs
    'alert_levels',      -- rungs of the alert ladder
    'points_monthly',    -- a stack of points at the start of each of N months
    'points_steal',      -- a one-press button that moves points off the leaders
    'points_wipe',       -- a one-press button that clears the board below a rank
    'engraving',         -- a name on the wall
    'beta_access',       -- early access to what is coming
    'referral_gift',     -- a code that gives the friend the same thing
    'extra_draw',        -- the right to draw a prize themselves
    'manual'             -- the owner does this one personally
  )),

  -- Shown to the member, verbatim. The prize's own words, so what they see in
  -- their profile is what they read on the wheel.
  label        text not null,
  detail       text,
  config       jsonb not null default '{}'::jsonb,

  -- ── when it applies ──────────────────────────────────────────────────────
  -- `months_total` null with `perpetual` true is "for life". A finite benefit
  -- counts months as they are consumed rather than by calendar date, so a
  -- member who pauses their subscription keeps what they were given.
  months_total integer check (months_total is null or months_total > 0),
  months_used  integer not null default 0 check (months_used >= 0),
  perpetual    boolean not null default false,

  -- ── how it is being honoured ─────────────────────────────────────────────
  --   pending   — recorded, nothing to attach it to yet (no live subscription)
  --   active    — in force; a Stripe discount exists, or the grant is applied
  --   claimable — waiting for the member to press something
  --   spent     — used up, or the member used their one press
  --   revoked   — taken back by an admin
  status       text not null default 'pending'
               check (status in ('pending', 'active', 'claimable', 'spent', 'revoked')),

  -- The Stripe coupon and discount this became, when it became one.
  stripe_coupon_id   text,
  stripe_discount_id text,
  -- The fallback when there is nothing live to discount: a code they can use.
  coupon_code  text references public.coupons(code) on delete set null,

  source       text not null default 'raffle',
  source_ref   uuid,
  note         text,
  granted_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  applied_at   timestamptz,
  spent_at     timestamptz
);

create index if not exists member_benefits_user_idx   on public.member_benefits (user_id, status);
create index if not exists member_benefits_open_idx   on public.member_benefits (status)
  where status in ('pending', 'active', 'claimable');

alter table public.member_benefits enable row level security;

drop policy if exists "benefits own" on public.member_benefits;
create policy "benefits own" on public.member_benefits
  for select using (user_id = auth.uid() or private.is_admin());

drop policy if exists "benefits admin" on public.member_benefits;
create policy "benefits admin" on public.member_benefits
  for all using (private.is_admin()) with check (private.is_admin());

-- ── the wall ────────────────────────────────────────────────────────────────
--
-- Several prizes are a name on the wall, and one of them is THE name — a single
-- slot that only ever holds one person, so winning it displaces whoever was
-- there. Keeping that as a table rather than a flag on the profile is what lets
-- the wall be curated: an admin can add a name nobody won, fix a spelling, or
-- put someone back.
create table if not exists public.wall_names (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  -- Denormalised on purpose: the wall is a monument. A member who leaves does
  -- not get chiselled off it.
  display     text not null,
  -- 'blessed' is the single top slot; 'engraved' is the roll beneath it.
  slot        text not null default 'engraved' check (slot in ('blessed', 'engraved')),
  note        text,
  source      text not null default 'raffle',
  source_ref  uuid,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists wall_names_slot_idx on public.wall_names (slot, sort_order, created_at);
-- Only one blessed name can be live at a time; winning it retires the last one.
create unique index if not exists wall_names_one_blessed
  on public.wall_names (slot) where slot = 'blessed' and active;

alter table public.wall_names enable row level security;

drop policy if exists "wall read" on public.wall_names;
create policy "wall read" on public.wall_names for select using (active or private.is_admin());

drop policy if exists "wall admin" on public.wall_names;
create policy "wall admin" on public.wall_names
  for all using (private.is_admin()) with check (private.is_admin());

-- ── putting a name up ───────────────────────────────────────────────────────
create or replace function private.engrave_name(
  p_user uuid,
  p_slot text default 'engraved',
  p_note text default null,
  p_ref  uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_name text;
begin
  select coalesce(nullif(trim(name), ''), split_part(email, '@', 1))
    into v_name from public.profiles where id = p_user;
  if v_name is null then return 'No name to engrave.'; end if;

  if p_slot = 'blessed' then
    -- The blessed slot holds one name. The previous holder is not deleted —
    -- they drop to the roll below, because they did win it.
    update public.wall_names
       set slot = 'engraved', note = coalesce(note, '') || ' (held the blessed slot)'
     where slot = 'blessed' and active;
  end if;

  insert into public.wall_names (user_id, display, slot, note, source_ref)
  values (p_user, v_name, p_slot, p_note, p_ref);

  return case when p_slot = 'blessed'
    then v_name || ' now holds the blessed name at the top of the wall.'
    else v_name || ' has been engraved on the wall.' end;
end;
$$;

revoke all on function private.engrave_name(uuid, text, text, uuid) from public;
revoke all on function private.engrave_name(uuid, text, text, uuid) from anon, authenticated;

comment on table public.member_benefits is
  'Everything a member has been given that plays out over time or waits to be claimed.';
comment on table public.wall_names is
  'The names engraved on the home page wall. One blessed slot, a roll beneath it.';
