-- Raffles.
--
-- Four draws, each with its own pool of tickets: `random` can be run whenever
-- there is a reason to, `monthly` and `yearly` run on their period, and
-- `blessed` is the one that is not earned at all — it is given.
--
-- Tickets are a ledger rather than a counter. A counter tells you somebody has
-- four tickets; a ledger tells you why, which is what you need when someone
-- asks, and what makes the subscription grant safe to re-run without doubling
-- anybody's entries.

-- ── prizes ───────────────────────────────────────────────────────────────────
create table if not exists public.raffle_prizes (
  id          uuid primary key default gen_random_uuid(),
  draw_type   text not null check (draw_type in ('random', 'monthly', 'yearly', 'blessed')),
  -- 1 is the smallest, 25 the best. Ranking them is what makes a draw feel like
  -- a draw rather than a lottery of identical envelopes.
  rank        integer not null check (rank between 1 and 99),
  label       text not null,
  description text,
  -- How it is handed over. `manual` means the owner does it — a seat in the
  -- car is not something a database can grant.
  kind        text not null check (kind in ('points', 'coupon_percent', 'badge', 'module', 'alert_level', 'manual')),
  config      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (draw_type, rank)
);

-- ── tickets ──────────────────────────────────────────────────────────────────
create table if not exists public.raffle_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  draw_type   text not null check (draw_type in ('random', 'monthly', 'yearly', 'blessed')),
  -- The period the ticket belongs to. Monthly and yearly reset; random and
  -- blessed carry a null period and accumulate.
  period_start date,
  qty         integer not null default 1 check (qty <> 0),
  reason      text not null,
  -- Set for grants that must never be applied twice — the subscription grant
  -- uses it, so re-running it is a no-op rather than a doubling.
  idem_key    text unique,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists raffle_tickets_user_idx on public.raffle_tickets (user_id, draw_type, period_start);

-- ── draws ────────────────────────────────────────────────────────────────────
create table if not exists public.raffle_draws (
  id             uuid primary key default gen_random_uuid(),
  draw_type      text not null,
  period_start   date,
  prize_id       uuid references public.raffle_prizes(id) on delete set null,
  prize_label    text not null,
  winner_id      uuid references public.profiles(id) on delete set null,
  winner_name    text not null,
  entrants       integer not null default 0,
  tickets_total  integer not null default 0,
  winner_tickets integer not null default 0,
  -- What actually happened to the account when they won, in plain words.
  fulfilment     text,
  note           text,
  drawn_at       timestamptz not null default now(),
  drawn_by       uuid references public.profiles(id) on delete set null
);

create index if not exists raffle_draws_when_idx on public.raffle_draws (drawn_at desc);

alter table public.raffle_prizes  enable row level security;
alter table public.raffle_tickets enable row level security;
alter table public.raffle_draws   enable row level security;

-- Prizes are the shop window: everybody sees what is up for grabs.
drop policy if exists "prizes read" on public.raffle_prizes;
create policy "prizes read" on public.raffle_prizes for select using (active or private.is_admin());
drop policy if exists "prizes admin" on public.raffle_prizes;
create policy "prizes admin" on public.raffle_prizes for all using (private.is_admin()) with check (private.is_admin());

-- Your own tickets, nobody else's.
drop policy if exists "tickets own" on public.raffle_tickets;
create policy "tickets own" on public.raffle_tickets
  for select using (user_id = (select auth.uid()) or private.is_admin());
drop policy if exists "tickets admin" on public.raffle_tickets;
create policy "tickets admin" on public.raffle_tickets for all using (private.is_admin()) with check (private.is_admin());

-- Winners are public. That is the point of winning.
drop policy if exists "draws read" on public.raffle_draws;
create policy "draws read" on public.raffle_draws for select using (true);
drop policy if exists "draws admin" on public.raffle_draws;
create policy "draws admin" on public.raffle_draws for all using (private.is_admin()) with check (private.is_admin());

-- ── the period a draw belongs to ─────────────────────────────────────────────
create or replace function public.raffle_period(p_draw_type text, p_when date default null)
returns date language sql immutable as $$
  select case p_draw_type
    when 'monthly' then date_trunc('month', coalesce(p_when, (now() at time zone 'utc')::date))::date
    when 'yearly'  then date_trunc('year',  coalesce(p_when, (now() at time zone 'utc')::date))::date
    else null
  end;
$$;

-- ── what a subscription is worth, per period ─────────────────────────────────
-- Basic: one monthly. VIP: one monthly and one yearly. Advanced: two of each.
-- Free tier earns tickets by doing things rather than by paying.
create or replace function public.raffle_tier_entitlement(p_tier integer, p_draw_type text)
returns integer language sql immutable as $$
  select case
    when p_draw_type = 'monthly' then case p_tier when 2 then 1 when 3 then 1 when 4 then 2 else 0 end
    when p_draw_type = 'yearly'  then case p_tier when 3 then 1 when 4 then 2 else 0 end
    else 0
  end;
$$;

/**
 * Hand out the tickets a subscription is owed for a period.
 *
 * Idempotent by construction: each grant carries a key naming the member, the
 * draw and the period, so running it twice in a month cannot give anybody two
 * sets. Safe to call from a cron, from the admin panel, or both.
 */
create or replace function public.sync_subscription_tickets(p_when date default null)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_month date := public.raffle_period('monthly', p_when);
  v_year  date := public.raffle_period('yearly',  p_when);
  v_n     integer := 0;
begin
  with owed as (
    select p.id as user_id, d.draw_type,
           case d.draw_type when 'monthly' then v_month else v_year end as period_start,
           public.raffle_tier_entitlement(p.tier, d.draw_type) as qty
      from public.profiles p
      cross join (values ('monthly'), ('yearly')) as d(draw_type)
     where coalesce(p.tier, 1) >= 2
  ),
  put as (
    insert into public.raffle_tickets (user_id, draw_type, period_start, qty, reason, idem_key)
    select o.user_id, o.draw_type, o.period_start, o.qty, 'Included with your plan',
           'sub:' || o.user_id::text || ':' || o.draw_type || ':' || o.period_start::text
      from owed o
     where o.qty > 0
    -- The key is what makes this safe to run twice in a month, or twice a
    -- minute: a grant that already exists is skipped rather than doubled.
    on conflict (idem_key) do nothing
    returning 1
  )
  select count(*) into v_n from put;
  return v_n;
end;
$$;

revoke all on function public.sync_subscription_tickets(date) from public, anon;
grant execute on function public.sync_subscription_tickets(date) to authenticated, service_role;

-- ── handing a prize over ─────────────────────────────────────────────────────
/**
 * Apply a prize to an account, and say in words what happened.
 *
 * Everything that can be granted is granted here and now — a 25% code is minted
 * against the winner's name, points land on the leaderboard, a module appears in
 * their plan. `manual` prizes return their own description instead: a seat in
 * the car is not something a database can hand over, and pretending otherwise
 * would be worse than saying so.
 */
create or replace function private.fulfil_raffle_prize(p_user uuid, p_prize public.raffle_prizes)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cfg   jsonb := coalesce(p_prize.config, '{}'::jsonb);
  v_code  text;
  v_name  text;
begin
  select name into v_name from public.profiles where id = p_user;
  perform set_config('sswx.privileged_write', 'on', true);

  if p_prize.kind = 'points' then
    -- `detail` is jsonb, not text.
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (p_user, coalesce(v_name, 'Member'), 'raffle', (v_cfg->>'points')::int,
            (now() at time zone 'utc')::date,
            jsonb_build_object('prize', p_prize.label, 'draw', p_prize.draw_type));
    return (v_cfg->>'points') || ' points added to the leaderboard.';

  elsif p_prize.kind = 'coupon_percent' then
    -- One code, one use, theirs. Unguessable because it carries a random tail.
    v_code := 'RAFFLE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.coupons (code, kind, value, active, max_uses, used_count, expires_at)
    values (v_code,
            coalesce(v_cfg->>'coupon_kind', 'first_month_percent_off'),
            (v_cfg->>'percent')::numeric, true, 1, 0,
            now() + interval '90 days');
    return 'Code ' || v_code || ' — ' || (v_cfg->>'percent') || '% off, one use, expires in 90 days.';

  elsif p_prize.kind = 'badge' then
    insert into public.badge_awards (user_id, badge_id, reason)
    values (p_user, v_cfg->>'badge_id', 'Raffle prize: ' || p_prize.label)
    on conflict (user_id, badge_id) do nothing;
    update public.profiles
       set badges = (select array(select distinct unnest(coalesce(badges, '{}') || (v_cfg->>'badge_id'))))
     where id = p_user;
    return 'Badge awarded.';

  elsif p_prize.kind = 'module' then
    update public.profiles
       set enabled_modules = (select array(select distinct unnest(coalesce(enabled_modules, '{}') || (v_cfg->>'module_id'))))
     where id = p_user;
    return 'Module ' || (v_cfg->>'module_id') || ' added to their plan.';

  elsif p_prize.kind = 'alert_level' then
    -- `source` is constrained to purchased|granted, and a raffle win is a
    -- grant; the note is what records where it came from.
    insert into public.alert_entitlements (user_id, level, source, note)
    values (p_user, (v_cfg->>'level')::int, 'granted', 'Raffle prize: ' || p_prize.label)
    on conflict do nothing;
    return 'Alert level ' || (v_cfg->>'level') || ' granted.';
  end if;

  return coalesce(p_prize.description, p_prize.label) || ' — hand this one over yourself.';
end;
$$;

/**
 * Draw a winner, weighted by tickets, and hand the prize over.
 *
 * Weighted rather than one-entry-per-person: tickets exist so that having more
 * of them matters. The pick expands the pool into a running total and lands a
 * random point inside it, which is the same thing as putting every ticket in a
 * hat.
 *
 * For `random` and `blessed`, whose tickets accumulate rather than resetting,
 * the winner's entries are spent. Monthly and yearly do not need it — their
 * period rolls over on its own.
 */
create or replace function public.admin_run_raffle(
  p_draw_type text,
  p_prize uuid,
  p_period date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_period  date;
  v_total   integer;
  v_ent     integer;
  v_pick    integer;
  v_winner  uuid;
  v_wname   text;
  v_wtix    integer;
  v_prize   public.raffle_prizes;
  v_ful     text;
  v_id      uuid;
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  if p_draw_type not in ('random', 'monthly', 'yearly', 'blessed') then
    raise exception 'unknown draw type %', p_draw_type;
  end if;

  select * into v_prize from public.raffle_prizes where id = p_prize;
  if v_prize.id is null then raise exception 'no such prize'; end if;

  v_period := coalesce(p_period, public.raffle_period(p_draw_type));

  create temp table _pool on commit drop as
  select t.user_id, sum(t.qty)::int as tickets
    from public.raffle_tickets t
   where t.draw_type = p_draw_type
     and t.period_start is not distinct from v_period
   group by t.user_id
  having sum(t.qty) > 0;

  select coalesce(sum(tickets), 0), count(*) into v_total, v_ent from _pool;
  if v_total <= 0 then raise exception 'nobody holds a ticket for this draw'; end if;

  v_pick := 1 + floor(random() * v_total)::int;

  select p.user_id, p.tickets into v_winner, v_wtix
    from (select user_id, tickets,
                 sum(tickets) over (order by user_id rows between unbounded preceding and current row) as cum
            from _pool) p
   where p.cum >= v_pick
   order by p.cum
   limit 1;

  select name into v_wname from public.profiles where id = v_winner;
  v_ful := private.fulfil_raffle_prize(v_winner, v_prize);

  -- Accumulating pools are spent when they win; period pools roll over anyway.
  if p_draw_type in ('random', 'blessed') then
    perform set_config('sswx.privileged_write', 'on', true);
    insert into public.raffle_tickets (user_id, draw_type, period_start, qty, reason, granted_by)
    values (v_winner, p_draw_type, v_period, -v_wtix, 'Spent winning: ' || v_prize.label, (select auth.uid()));
  end if;

  insert into public.raffle_draws (
    draw_type, period_start, prize_id, prize_label, winner_id, winner_name,
    entrants, tickets_total, winner_tickets, fulfilment, note, drawn_by)
  values (p_draw_type, v_period, v_prize.id, v_prize.label, v_winner, coalesce(v_wname, 'Member'),
          v_ent, v_total, v_wtix, v_ful, p_note, (select auth.uid()))
  returning id into v_id;

  -- The winner should hear it from the app, not from a rumour.
  insert into public.notifications (user_id, kind, severity, title, body, dedup_key)
  values (v_winner, 'raffle', 'info', 'You won the ' || p_draw_type || ' draw',
          v_prize.label || ' — ' || v_ful, 'raffle:' || v_id::text)
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.admin_run_raffle(text, uuid, date, text) from public, anon;
grant execute on function public.admin_run_raffle(text, uuid, date, text) to authenticated;

-- ── who holds what ───────────────────────────────────────────────────────────
create or replace function public.my_raffle_tickets()
returns table (draw_type text, period_start date, tickets bigint)
language sql stable security definer set search_path = public as $$
  select t.draw_type, t.period_start, sum(t.qty)
    from public.raffle_tickets t
   where t.user_id = (select auth.uid())
     and (t.period_start is null or t.period_start >= (date_trunc('year', now()) - interval '1 year')::date)
   group by t.draw_type, t.period_start
  having sum(t.qty) > 0
   order by t.draw_type;
$$;
revoke all on function public.my_raffle_tickets() from public, anon;
grant execute on function public.my_raffle_tickets() to authenticated;

create or replace function public.admin_raffle_overview()
returns table (user_id uuid, name text, email text, tier integer,
               monthly bigint, yearly bigint, random bigint, blessed bigint, total bigint)
language sql stable security definer set search_path = public, private as $$
  select p.id, p.name, p.email, p.tier,
         coalesce(sum(t.qty) filter (where t.draw_type = 'monthly' and t.period_start = public.raffle_period('monthly')), 0),
         coalesce(sum(t.qty) filter (where t.draw_type = 'yearly'  and t.period_start = public.raffle_period('yearly')), 0),
         coalesce(sum(t.qty) filter (where t.draw_type = 'random'), 0),
         coalesce(sum(t.qty) filter (where t.draw_type = 'blessed'), 0),
         coalesce(sum(t.qty), 0)
    from public.profiles p
    left join public.raffle_tickets t on t.user_id = p.id
   where private.is_admin()
   group by p.id, p.name, p.email, p.tier
   order by 9 desc, p.name;
$$;
revoke all on function public.admin_raffle_overview() from public, anon;
grant execute on function public.admin_raffle_overview() to authenticated;

create or replace function public.admin_grant_tickets(
  p_users uuid[], p_draw_type text, p_qty integer, p_reason text, p_period date default null)
returns integer
language plpgsql security definer set search_path = public, private as $$
declare v_n integer;
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  if p_draw_type not in ('random', 'monthly', 'yearly', 'blessed') then
    raise exception 'unknown draw type %', p_draw_type;
  end if;
  if p_qty = 0 then return 0; end if;
  with put as (
    insert into public.raffle_tickets (user_id, draw_type, period_start, qty, reason, granted_by)
    select u, p_draw_type,
           case when p_draw_type in ('monthly','yearly') then coalesce(p_period, public.raffle_period(p_draw_type)) else null end,
           p_qty, coalesce(nullif(trim(p_reason), ''), 'Granted by an administrator'), (select auth.uid())
      from unnest(p_users) u
    returning 1)
  select count(*) into v_n from put;
  return v_n;
end;
$$;
revoke all on function public.admin_grant_tickets(uuid[], text, integer, text, date) from public, anon;
grant execute on function public.admin_grant_tickets(uuid[], text, integer, text, date) to authenticated;

-- ── the suggested prizes ─────────────────────────────────────────────────────
-- Twenty-five per draw, ranked so that 25 is the one everybody wants. These are
-- suggestions: every one is editable and can be switched off, and new ones can
-- be added without touching this file. The kinds that can be granted are
-- granted the moment somebody wins; `manual` ones say plainly that they need a
-- person, because a seat in the car is not something a database can hand over.
insert into public.raffle_prizes (draw_type, rank, label, description, kind, config) values
  ('random', 1, '25 Points', 'Twenty-five points on the leaderboard.', 'points', '{"points": 25}'::jsonb),
  ('random', 2, '50 Points', 'Fifty points on the leaderboard.', 'points', '{"points": 50}'::jsonb),
  ('random', 3, '100 Points', 'A hundred points on the leaderboard.', 'points', '{"points": 100}'::jsonb),
  ('random', 4, '150 Points', 'A hundred and fifty points.', 'points', '{"points": 150}'::jsonb),
  ('random', 5, '250 Points', 'Two hundred and fifty points.', 'points', '{"points": 250}'::jsonb),
  ('random', 6, '400 Points', 'Four hundred points.', 'points', '{"points": 400}'::jsonb),
  ('random', 7, '600 Points', 'Six hundred points.', 'points', '{"points": 600}'::jsonb),
  ('random', 8, '5% Off Next Month', 'Five per cent off your next month.', 'coupon_percent', '{"percent": 5, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 9, '1,000 Points', 'A thousand points.', 'points', '{"points": 1000}'::jsonb),
  ('random', 10, '10% Off Next Month', 'Ten per cent off your next month.', 'coupon_percent', '{"percent": 10, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 11, '1,500 Points', 'Fifteen hundred points.', 'points', '{"points": 1500}'::jsonb),
  ('random', 12, '15% Off Next Month', 'Fifteen per cent off your next month.', 'coupon_percent', '{"percent": 15, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 13, '2,500 Points', 'Twenty-five hundred points.', 'points', '{"points": 2500}'::jsonb),
  ('random', 14, '20% Off Next Month', 'Twenty per cent off your next month.', 'coupon_percent', '{"percent": 20, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 15, 'A Module of Your Choice', 'Pick any single module and it is added to your plan.', 'manual', '{}'::jsonb),
  ('random', 16, '25% Off Next Month', 'Twenty-five per cent off your next month.', 'coupon_percent', '{"percent": 25, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 17, 'Push Alerts Unlocked', 'Alert level 2 — warnings straight to your phone.', 'alert_level', '{"level": 2}'::jsonb),
  ('random', 18, '30% Off Next Month', 'Thirty per cent off your next month.', 'coupon_percent', '{"percent": 30, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 19, 'Storm Chasing Module', 'The Storm Chasing module, added to your plan.', 'module', '{"module_id": "/chasing"}'::jsonb),
  ('random', 20, '40% Off Next Month', 'Forty per cent off your next month.', 'coupon_percent', '{"percent": 40, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 21, 'Radar & MRMS Module', 'The Radar & MRMS module, added to your plan.', 'module', '{"module_id": "/rotation"}'::jsonb),
  ('random', 22, '50% Off Next Month', 'Half off your next month.', 'coupon_percent', '{"percent": 50, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 23, 'Email & Text Alerts', 'Alert level 3 — alerts by email and text.', 'alert_level', '{"level": 3}'::jsonb),
  ('random', 24, '75% Off Next Month', 'Seventy-five per cent off your next month.', 'coupon_percent', '{"percent": 75, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('random', 25, 'A Free Month', 'Your next month, on us.', 'coupon_percent', '{"percent": 100, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 1, '100 Points', 'A hundred points on the leaderboard.', 'points', '{"points": 100}'::jsonb),
  ('monthly', 2, '250 Points', 'Two hundred and fifty points.', 'points', '{"points": 250}'::jsonb),
  ('monthly', 3, '500 Points', 'Five hundred points.', 'points', '{"points": 500}'::jsonb),
  ('monthly', 4, '10% Off Next Month', 'Ten per cent off your next month.', 'coupon_percent', '{"percent": 10, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 5, '1,000 Points', 'A thousand points.', 'points', '{"points": 1000}'::jsonb),
  ('monthly', 6, '15% Off Next Month', 'Fifteen per cent off your next month.', 'coupon_percent', '{"percent": 15, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 7, '2,000 Points', 'Two thousand points.', 'points', '{"points": 2000}'::jsonb),
  ('monthly', 8, '20% Off Next Month', 'Twenty per cent off your next month.', 'coupon_percent', '{"percent": 20, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 9, 'Thunderstorm Probability', 'The Thunderstorm Probability module.', 'module', '{"module_id": "/thunder"}'::jsonb),
  ('monthly', 10, '25% Off Next Month', 'Twenty-five per cent off your next month.', 'coupon_percent', '{"percent": 25, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 11, '5,000 Points', 'Five thousand points.', 'points', '{"points": 5000}'::jsonb),
  ('monthly', 12, 'Push Alerts Unlocked', 'Alert level 2 — warnings straight to your phone.', 'alert_level', '{"level": 2}'::jsonb),
  ('monthly', 13, '30% Off Next Month', 'Thirty per cent off your next month.', 'coupon_percent', '{"percent": 30, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 14, 'Storm Ingredients', 'The Storm Ingredients module.', 'module', '{"module_id": "/ingredients"}'::jsonb),
  ('monthly', 15, '40% Off Next Month', 'Forty per cent off your next month.', 'coupon_percent', '{"percent": 40, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 16, 'Email & Text Alerts', 'Alert level 3 — alerts by email and text.', 'alert_level', '{"level": 3}'::jsonb),
  ('monthly', 17, '50% Off Next Month', 'Half off your next month.', 'coupon_percent', '{"percent": 50, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 18, 'Two Modules of Your Choice', 'Pick any two modules; they are added to your plan.', 'manual', '{}'::jsonb),
  ('monthly', 19, '60% Off Next Month', 'Sixty per cent off your next month.', 'coupon_percent', '{"percent": 60, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 20, 'Outlook Alerts & The Emergency Line', 'Alert level 4 — outlook alerts and the emergency PIN.', 'alert_level', '{"level": 4}'::jsonb),
  ('monthly', 21, '75% Off Next Month', 'Seventy-five per cent off your next month.', 'coupon_percent', '{"percent": 75, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 22, 'A Free Month', 'Your next month, on us.', 'coupon_percent', '{"percent": 100, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('monthly', 23, '25% Off, Every Month', 'Twenty-five per cent off for as long as you stay.', 'coupon_percent', '{"percent": 25, "coupon_kind": "percent_off"}'::jsonb),
  ('monthly', 24, 'Two Free Months', 'Two months added to your subscription.', 'manual', '{}'::jsonb),
  ('monthly', 25, 'A Free Month, Plus Every Module', 'A month on us and every module unlocked for it.', 'manual', '{}'::jsonb),
  ('yearly', 1, '500 Points', 'Five hundred points on the leaderboard.', 'points', '{"points": 500}'::jsonb),
  ('yearly', 2, '1,000 Points', 'A thousand points.', 'points', '{"points": 1000}'::jsonb),
  ('yearly', 3, '2,500 Points', 'Twenty-five hundred points.', 'points', '{"points": 2500}'::jsonb),
  ('yearly', 4, '15% Off Next Month', 'Fifteen per cent off your next month.', 'coupon_percent', '{"percent": 15, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('yearly', 5, '5,000 Points', 'Five thousand points.', 'points', '{"points": 5000}'::jsonb),
  ('yearly', 6, '25% Off Next Month', 'Twenty-five per cent off your next month.', 'coupon_percent', '{"percent": 25, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('yearly', 7, '10,000 Points', 'Ten thousand points.', 'points', '{"points": 10000}'::jsonb),
  ('yearly', 8, 'A Module of Your Choice', 'Pick any single module and it is added to your plan.', 'manual', '{}'::jsonb),
  ('yearly', 9, '35% Off Next Month', 'Thirty-five per cent off your next month.', 'coupon_percent', '{"percent": 35, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('yearly', 10, 'Push Alerts Unlocked', 'Alert level 2 — warnings straight to your phone.', 'alert_level', '{"level": 2}'::jsonb),
  ('yearly', 11, '50% Off Next Month', 'Half off your next month.', 'coupon_percent', '{"percent": 50, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('yearly', 12, 'Email & Text Alerts', 'Alert level 3 — alerts by email and text.', 'alert_level', '{"level": 3}'::jsonb),
  ('yearly', 13, 'Three Modules of Your Choice', 'Pick any three modules; they are added to your plan.', 'manual', '{}'::jsonb),
  ('yearly', 14, '75% Off Next Month', 'Seventy-five per cent off your next month.', 'coupon_percent', '{"percent": 75, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('yearly', 15, 'Outlook Alerts & The Emergency Line', 'Alert level 4 — outlook alerts and the emergency PIN.', 'alert_level', '{"level": 4}'::jsonb),
  ('yearly', 16, 'A Free Month', 'Your next month, on us.', 'coupon_percent', '{"percent": 100, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('yearly', 17, '25% Off, Every Month', 'Twenty-five per cent off for as long as you stay.', 'coupon_percent', '{"percent": 25, "coupon_kind": "percent_off"}'::jsonb),
  ('yearly', 18, 'Three Free Months', 'Three months added to your subscription.', 'manual', '{}'::jsonb),
  ('yearly', 19, '40% Off, Every Month', 'Forty per cent off for as long as you stay.', 'coupon_percent', '{"percent": 40, "coupon_kind": "percent_off"}'::jsonb),
  ('yearly', 20, 'The Direct Line', 'Alert level 5 — the direct line.', 'alert_level', '{"level": 5}'::jsonb),
  ('yearly', 21, 'Six Free Months', 'Six months added to your subscription.', 'manual', '{}'::jsonb),
  ('yearly', 22, '50% Off, Every Month', 'Half off for as long as you stay.', 'coupon_percent', '{"percent": 50, "coupon_kind": "percent_off"}'::jsonb),
  ('yearly', 23, 'A Year of Advanced', 'Twelve months of the Advanced tier, every module included.', 'manual', '{}'::jsonb),
  ('yearly', 24, 'A Chase Seat', 'A seat in the car for a chase day, weather permitting.', 'manual', '{}'::jsonb),
  ('yearly', 25, 'Advanced, For Life', 'The Advanced tier, forever. Every module ever made.', 'manual', '{}'::jsonb),
  ('blessed', 1, '250 Points', 'Two hundred and fifty points, out of nowhere.', 'points', '{"points": 250}'::jsonb),
  ('blessed', 2, '500 Points', 'Five hundred points, out of nowhere.', 'points', '{"points": 500}'::jsonb),
  ('blessed', 3, '1,000 Points', 'A thousand points, out of nowhere.', 'points', '{"points": 1000}'::jsonb),
  ('blessed', 4, '2,000 Points', 'Two thousand points, out of nowhere.', 'points', '{"points": 2000}'::jsonb),
  ('blessed', 5, '20% Off Next Month', 'Twenty per cent off your next month.', 'coupon_percent', '{"percent": 20, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('blessed', 6, '5,000 Points', 'Five thousand points.', 'points', '{"points": 5000}'::jsonb),
  ('blessed', 7, '30% Off Next Month', 'Thirty per cent off your next month.', 'coupon_percent', '{"percent": 30, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('blessed', 8, '10,000 Points', 'Ten thousand points.', 'points', '{"points": 10000}'::jsonb),
  ('blessed', 9, 'A Module of Your Choice', 'Pick any single module and it is added to your plan.', 'manual', '{}'::jsonb),
  ('blessed', 10, '40% Off Next Month', 'Forty per cent off your next month.', 'coupon_percent', '{"percent": 40, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('blessed', 11, 'Push Alerts Unlocked', 'Alert level 2 — warnings straight to your phone.', 'alert_level', '{"level": 2}'::jsonb),
  ('blessed', 12, '50% Off Next Month', 'Half off your next month.', 'coupon_percent', '{"percent": 50, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('blessed', 13, 'Email & Text Alerts', 'Alert level 3 — alerts by email and text.', 'alert_level', '{"level": 3}'::jsonb),
  ('blessed', 14, '25,000 Points', 'Twenty-five thousand points. Nobody is catching you.', 'points', '{"points": 25000}'::jsonb),
  ('blessed', 15, '75% Off Next Month', 'Seventy-five per cent off your next month.', 'coupon_percent', '{"percent": 75, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('blessed', 16, 'Two Modules of Your Choice', 'Pick any two modules; they are added to your plan.', 'manual', '{}'::jsonb),
  ('blessed', 17, 'A Free Month', 'Your next month, on us.', 'coupon_percent', '{"percent": 100, "coupon_kind": "first_month_percent_off"}'::jsonb),
  ('blessed', 18, 'Outlook Alerts & The Emergency Line', 'Alert level 4 — outlook alerts and the emergency PIN.', 'alert_level', '{"level": 4}'::jsonb),
  ('blessed', 19, '25% Off, Every Month', 'Twenty-five per cent off for as long as you stay.', 'coupon_percent', '{"percent": 25, "coupon_kind": "percent_off"}'::jsonb),
  ('blessed', 20, 'The Direct Line', 'Alert level 5 — the direct line.', 'alert_level', '{"level": 5}'::jsonb),
  ('blessed', 21, 'Three Free Months', 'Three months added to your subscription.', 'manual', '{}'::jsonb),
  ('blessed', 22, '50% Off, Every Month', 'Half off for as long as you stay.', 'coupon_percent', '{"percent": 50, "coupon_kind": "percent_off"}'::jsonb),
  ('blessed', 23, 'Six Free Months', 'Six months added to your subscription.', 'manual', '{}'::jsonb),
  ('blessed', 24, 'A Year of Advanced', 'Twelve months of the Advanced tier, every module included.', 'manual', '{}'::jsonb),
  ('blessed', 25, 'Named In The App', 'Your name on the app, permanently, wherever it belongs best.', 'manual', '{}'::jsonb)
on conflict (draw_type, rank) do update set label = excluded.label,
  description = excluded.description, kind = excluded.kind, config = excluded.config;
-- 100 prizes

-- Plan entries appear on their own. Daily rather than monthly so somebody who
-- upgrades mid-month gets this month's entries the next day rather than waiting
-- for the next period — the grant is keyed per member per period, so running it
-- every day costs one no-op query and hands out nothing twice.
select cron.schedule(
  'raffle-tickets-daily',
  '20 12 * * *',
  $$select public.sync_subscription_tickets()$$
);
