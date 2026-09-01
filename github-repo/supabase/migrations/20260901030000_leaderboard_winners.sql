-- Who won, and the ability to say otherwise.
--
-- The leaderboard was computed live from `game_points` for the current period
-- and nothing else. The moment a month ended its winner ceased to exist —
-- there was no record of who had ever won anything, and no way for an admin to
-- crown somebody, correct a mistake, or credit a winner from before the app
-- kept score.
--
-- Two halves. Periods seal themselves the day after they end, from the real
-- standings, so history accumulates without anyone remembering to do it. And an
-- admin can override any period, including one that has not happened yet.

create table if not exists public.leaderboard_winners (
  id           uuid primary key default gen_random_uuid(),
  -- 'month' or 'year'. Weekly is deliberately absent: a weekly champion is not
  -- a thing anyone would look back on.
  period       text not null check (period in ('month', 'year')),
  -- The first day of the period, so a row is addressable without date maths.
  period_start date not null,
  user_id      uuid references public.profiles(id) on delete set null,
  -- Snapshotted, so a deleted account does not erase the fact that they won.
  user_name    text not null,
  points       integer not null default 0,
  note         text,
  -- True when an admin set this by hand rather than it being sealed from the
  -- standings. Shown in the admin list so an override is never mistaken for a
  -- computed result.
  manual       boolean not null default false,
  awarded_at   timestamptz not null default now(),
  unique (period, period_start)
);

alter table public.leaderboard_winners enable row level security;

drop policy if exists "winners public read" on public.leaderboard_winners;
create policy "winners public read" on public.leaderboard_winners
  for select using (true);

drop policy if exists "winners admin write" on public.leaderboard_winners;
create policy "winners admin write" on public.leaderboard_winners
  for all using (private.is_admin()) with check (private.is_admin());

create index if not exists leaderboard_winners_period_idx
  on public.leaderboard_winners (period, period_start desc);

-- ── the standings for any span, not just the current one ─────────────────────
create or replace function public.leaderboard_between(p_start date, p_end date)
returns table (user_id uuid, user_name text, points bigint, entries bigint)
language sql
stable
security definer
set search_path = public
as $$
  select gp.user_id,
         max(gp.user_name) as user_name,
         sum(gp.points)::bigint as points,
         count(*)::bigint as entries
    from public.game_points gp
   where gp.earned_on >= p_start
     and gp.earned_on <  p_end
   group by gp.user_id
  having sum(gp.points) > 0
   order by points desc
   limit 100;
$$;

revoke all on function public.leaderboard_between(date, date) from public, anon;
grant execute on function public.leaderboard_between(date, date) to authenticated;

create or replace function public.period_end(p_period text, p_start date)
returns date language sql immutable as $$
  select case when p_period = 'year' then (p_start + interval '1 year')::date
                                     else (p_start + interval '1 month')::date end;
$$;

-- ── sealing ──────────────────────────────────────────────────────────────────
-- Idempotent, and never overwrites a manual crowning: an admin's decision
-- outranks the arithmetic.
create or replace function public.seal_leaderboard_period(p_period text, p_start date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if exists (select 1 from public.leaderboard_winners
              where period = p_period and period_start = p_start) then
    return false;
  end if;

  select * into v_row
    from public.leaderboard_between(p_start, public.period_end(p_period, p_start))
   limit 1;

  if v_row.user_id is null then
    return false;  -- nobody scored; there is no winner to record
  end if;

  insert into public.leaderboard_winners (period, period_start, user_id, user_name, points, manual)
  values (p_period, p_start, v_row.user_id, coalesce(v_row.user_name, 'Member'), v_row.points, false);
  return true;
end;
$$;

-- Runs daily. Seals the month just gone and, in January, the year just gone.
create or replace function public.seal_due_leaderboards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_n integer := 0;
begin
  if public.seal_leaderboard_period('month', (date_trunc('month', v_today) - interval '1 month')::date) then
    v_n := v_n + 1;
  end if;
  if public.seal_leaderboard_period('year', (date_trunc('year', v_today) - interval '1 year')::date) then
    v_n := v_n + 1;
  end if;
  return v_n;
end;
$$;

revoke all on function public.seal_due_leaderboards() from public, anon;
grant execute on function public.seal_due_leaderboards() to authenticated, service_role;

-- ── the admin's say ──────────────────────────────────────────────────────────
create or replace function public.admin_set_leaderboard_winner(
  p_period text,
  p_start date,
  p_user uuid,
  p_points integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_points integer;
  v_id uuid;
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  if p_period not in ('month', 'year') then raise exception 'period must be month or year'; end if;

  select name into v_name from public.profiles where id = p_user;
  if v_name is null then raise exception 'no such member'; end if;

  -- Default the score to what they actually earned in that period, so crowning
  -- somebody by hand does not blank the number next to their name.
  v_points := coalesce(
    p_points,
    (select points::integer from public.leaderboard_between(p_start, public.period_end(p_period, p_start))
      where user_id = p_user),
    0);

  insert into public.leaderboard_winners (period, period_start, user_id, user_name, points, note, manual)
  values (p_period, p_start, p_user, v_name, v_points, p_note, true)
  on conflict (period, period_start) do update
    set user_id = excluded.user_id,
        user_name = excluded.user_name,
        points = excluded.points,
        note = excluded.note,
        manual = true,
        awarded_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_set_leaderboard_winner(text, date, uuid, integer, text) from public, anon;
grant execute on function public.admin_set_leaderboard_winner(text, date, uuid, integer, text) to authenticated;

create or replace function public.admin_clear_leaderboard_winner(p_period text, p_start date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  delete from public.leaderboard_winners where period = p_period and period_start = p_start;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.admin_clear_leaderboard_winner(text, date) from public, anon;
grant execute on function public.admin_clear_leaderboard_winner(text, date) to authenticated;

-- Seal the day after a period ends, so history accumulates whether or not
-- anybody remembers. 12:05 UTC — after the nightly jobs, and late enough that a
-- last-minute score on the final day is definitely in.
select cron.schedule(
  'leaderboard-seal-daily',
  '5 12 * * *',
  $$select public.seal_due_leaderboards()$$
);
