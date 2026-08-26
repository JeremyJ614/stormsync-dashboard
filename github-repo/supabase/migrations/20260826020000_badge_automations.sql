-- Badge automations and the award log.
--
-- Badges were entirely manual: an admin ticked a box on a profile. That works
-- for the honorary ones and not at all for the earned ones, which is most of
-- what a member actually wants — the whole point of an achievement badge is
-- that it arrives on its own when you do the thing.
--
-- Two tables and one function:
--   badge_rules   what earns a badge, as data an admin can edit
--   badge_awards  an append-only log of who earned what and when
--   evaluate_badges()  runs the rules for the caller, awards what is missing,
--                      and raises a notification for each
--
-- The award log matters beyond the badge itself: it is what makes "so-and-so
-- just earned X" possible on the home feed, and it is what stops a member being
-- notified twice for the same badge.

-- ── rules ────────────────────────────────────────────────────────────────────
create table if not exists public.badge_rules (
  badge_id    text primary key references public.badge_defs (id) on delete cascade,
  kind        text not null,
  threshold   numeric not null default 1,
  enabled     boolean not null default true,
  blurb       text,
  updated_at  timestamptz not null default now()
);

alter table public.badge_rules enable row level security;

drop policy if exists badge_rules_read on public.badge_rules;
create policy badge_rules_read on public.badge_rules
  for select using (true);

drop policy if exists badge_rules_admin on public.badge_rules;
create policy badge_rules_admin on public.badge_rules
  for all using (private.is_admin()) with check (private.is_admin());

-- ── awards ───────────────────────────────────────────────────────────────────
create table if not exists public.badge_awards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  badge_id   text not null references public.badge_defs (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  reason     text,
  unique (user_id, badge_id)
);

create index if not exists badge_awards_time_idx on public.badge_awards (awarded_at desc);

alter table public.badge_awards enable row level security;

-- The feed shows "someone earned a badge" to every member, so reads are open.
-- Nothing sensitive lives here: a badge id, a member id and a timestamp.
drop policy if exists badge_awards_read on public.badge_awards;
create policy badge_awards_read on public.badge_awards
  for select using (true);

-- Writes only ever come from evaluate_badges() or an admin. A client cannot
-- award itself a badge by inserting a row.
revoke insert, update, delete on public.badge_awards from anon, authenticated;

-- ── evaluation ───────────────────────────────────────────────────────────────
/*
 * Award every enabled rule the caller now satisfies and has not already been
 * given, and raise one notification per new badge.
 *
 * Runs for the *caller only*. There is deliberately no "evaluate everyone"
 * path: that would be an unbounded write triggered by a client request.
 *
 * `badges` on profiles is a protected column (see protect_profile_columns).
 * Being security-definer is not enough to get past that guard — it checks
 * private.is_admin(), which is false for an ordinary member even inside a
 * definer function — so this announces itself through the same
 * `sswx.privileged_write` escape hatch the other trusted RPCs use. Passing
 * true to set_config scopes it to this transaction.
 */
create or replace function public.evaluate_badges()
returns table (badge_id text, label text)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT parameters are named `badge_id` and `label`, which collide with the
-- columns of the same name — `on conflict (badge_id)` cannot tell which one is
-- meant and the whole function fails with 42702 at runtime. This tells plpgsql
-- that an ambiguous name means the column, which is right everywhere it occurs
-- below; the OUT variables are only ever written, and are qualified when they
-- are.
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  r record;
  v numeric;
begin
  if uid is null then return; end if;
  perform set_config('sswx.privileged_write', 'on', true);

  for r in
    select br.badge_id, br.kind, br.threshold, bd.label
    from public.badge_rules br
    join public.badge_defs bd on bd.id = br.badge_id
    where br.enabled
      and not exists (select 1 from public.badge_awards a
                      where a.user_id = uid and a.badge_id = br.badge_id)
  loop
    v := case r.kind
      when 'points_total' then
        coalesce((select sum(points) from public.game_points where user_id = uid), 0)
      when 'referrals' then
        coalesce((select referrals from public.profiles where id = uid), 0)
      when 'modules_owned' then
        coalesce((select array_length(enabled_modules, 1) from public.profiles where id = uid), 0)
      when 'days_member' then
        coalesce((select extract(day from now() - joined_at) from public.profiles where id = uid), 0)
      when 'trivia_correct' then
        coalesce((select count(*) from public.trivia_answers where user_id = uid and correct), 0)
      when 'game_wins' then
        coalesce((select count(*) from public.game_winners where user_id = uid), 0)
      when 'tier_at_least' then
        coalesce((select tier from public.profiles where id = uid), 0)
      else null
    end;

    if v is not null and v >= r.threshold then
      insert into public.badge_awards (user_id, badge_id, reason)
      values (uid, r.badge_id, r.kind || ' reached ' || r.threshold::text)
      on conflict (user_id, badge_id) do nothing;

      update public.profiles
         set badges = (select array(select distinct unnest(coalesce(badges, '{}') || r.badge_id)))
       where id = uid;

      insert into public.notifications (user_id, kind, severity, title, body, dedup_key)
      values (uid, 'badge', 'info',
              'You earned a badge',
              'You just earned ' || r.label || '.',
              'badge:' || r.badge_id);

      return query select r.badge_id, r.label;
    end if;
  end loop;
end;
$$;

revoke execute on function public.evaluate_badges() from public, anon;
grant execute on function public.evaluate_badges() to authenticated;
