-- The prize is drawn too.
--
-- Running a raffle used to mean choosing the prize first and then finding out
-- who got it, which makes the interesting half of the event a decision the owner
-- has already made. A raffle where somebody knows what is coming out is a
-- giveaway with extra steps. Both halves are random now: the prize is drawn from
-- the active prizes for that draw type, then the winner is drawn from the
-- tickets, in the same transaction that hands the prize over.
--
-- WEIGHTS, NOT EQUAL CHANCES. "A Year of Advanced" and "100 Points" cannot come
-- up equally often, so every prize carries a weight and the draw is proportional
-- to it. A weight is a relative number rather than a percentage on purpose:
-- percentages have to sum to 100, so adding one prize means editing every other
-- one, and an owner who adds a prize at midnight should not have to rebalance
-- twenty rows. The odds are computed from the weights and shown as percentages
-- wherever they are edited, which is the half that actually needs to read as a
-- percentage.
--
-- Choosing a specific prize is still possible — `admin_run_raffle` takes one and
-- honours it — because "draw the yearly grand prize now" is a real thing an
-- owner does. It simply is not the default any more.

alter table public.raffle_prizes
  add column if not exists weight numeric not null default 1
    check (weight >= 0 and weight <= 1000000);

comment on column public.raffle_prizes.weight is
  'Relative chance of being drawn, within its draw type. 0 means never. The admin panel shows this as a percentage of the draw type''s total.';

-- Seed sensible odds from the rank the prizes already carry: a rank-25 grand
-- prize should not come up as often as a rank-1 consolation. This is a starting
-- shape, not a rule — every weight is editable.
update public.raffle_prizes
   set weight = greatest(0.05, round((100.0 / greatest(1, rank)) / 4, 2))
 where weight = 1;

/**
 * Pick a prize for a draw type, weighted.
 *
 * Kept separate from the draw itself so the admin panel can show exactly the
 * odds the draw will use rather than a second implementation of them.
 */
create or replace function public.pick_raffle_prize(p_draw_type text)
returns uuid
language plpgsql
-- VOLATILE, and it matters. Declared STABLE, Postgres is entitled to evaluate
-- this once per query and reuse the answer — which it does: four thousand calls
-- in one statement returned the same prize four thousand times. A function
-- containing `random()` is volatile by definition, and saying otherwise is a
-- promise to the planner that this cannot keep.
volatile
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_pick  numeric;
  v_id    uuid;
begin
  select coalesce(sum(weight), 0) into v_total
    from public.raffle_prizes where draw_type = p_draw_type and active and weight > 0;
  if v_total <= 0 then return null; end if;

  v_pick := random() * v_total;

  -- Running total over a stable order, so the same weights always carve the
  -- interval the same way and a prize with weight 0 can never be selected.
  select id into v_id from (
    select p.id,
           sum(p.weight) over (order by p.rank desc, p.id
                               rows between unbounded preceding and current row) as cum
      from public.raffle_prizes p
     where p.draw_type = p_draw_type and p.active and p.weight > 0
  ) q
  where q.cum >= v_pick
  order by q.cum
  limit 1;

  return v_id;
end;
$$;

grant execute on function public.pick_raffle_prize(text) to authenticated;

/** Every active prize for a draw type with the odds the draw will actually use. */
create or replace function public.raffle_prize_odds(p_draw_type text)
returns table (id uuid, label text, rank integer, weight numeric, odds numeric)
language sql
stable
security definer
set search_path = public
as $$
  with pool as (
    select p.id, p.label, p.rank, p.weight
      from public.raffle_prizes p
     where p.draw_type = p_draw_type and p.active
  ), total as (
    select nullif(sum(weight), 0) as t from pool
  )
  select pool.id, pool.label, pool.rank, pool.weight,
         round(coalesce(pool.weight / total.t, 0) * 100, 2) as odds
    from pool, total
   order by pool.rank desc, pool.label;
$$;

grant execute on function public.raffle_prize_odds(text) to authenticated;

/** Set one prize's weight. Admin only; the draw reads it on the next run. */
create or replace function public.admin_set_prize_weight(p_id uuid, p_weight numeric)
returns void
language plpgsql
volatile
security definer
set search_path = public, private
as $$
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  if p_weight is null or p_weight < 0 or p_weight > 1000000 then
    raise exception 'weight must be between 0 and 1000000';
  end if;
  update public.raffle_prizes set weight = p_weight where id = p_id;
end;
$$;

revoke all on function public.admin_set_prize_weight(uuid, numeric) from public, anon;
grant execute on function public.admin_set_prize_weight(uuid, numeric) to authenticated;

/**
 * Run a draw.
 *
 * `p_prize` is optional now. Left null — which is what the machine sends — the
 * prize is drawn by weight from the active prizes for that draw type, so the
 * owner finds out what was won at the same moment everybody else does. Passed a
 * prize, it honours it, because "draw the grand prize now" is a real thing.
 *
 * Everything downstream is unchanged: the winner is still drawn from the ticket
 * pool, the prize is still fulfilled in the same transaction, and the accumulating
 * pools are still spent on a win.
 */
create or replace function public.admin_run_raffle(
  p_draw_type text,
  p_prize uuid default null,
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
  v_prize_id uuid;
  v_ful     text;
  v_id      uuid;
begin
  if not private.is_admin() then raise exception 'admin only'; end if;
  if p_draw_type not in ('random', 'monthly', 'yearly', 'blessed') then
    raise exception 'unknown draw type %', p_draw_type;
  end if;

  -- The prize is drawn unless one was named.
  v_prize_id := coalesce(p_prize, public.pick_raffle_prize(p_draw_type));
  if v_prize_id is null then
    raise exception 'no active prize with a weight above zero for this draw';
  end if;

  select * into v_prize from public.raffle_prizes where id = v_prize_id;
  if v_prize.id is null then raise exception 'no such prize'; end if;

  v_period := coalesce(p_period, public.raffle_period(p_draw_type));

  -- The ticket pool as a CTE rather than a temp table.
  --
  -- This used `create temp table _pool on commit drop`, and `on commit drop`
  -- means exactly that: the table survives until the transaction COMMITS. One
  -- draw per request never noticed, but two draws inside one transaction failed
  -- on the second with `relation "_pool" already exists`. Nothing here needs the
  -- pool to outlive the query that reads it, so nothing here needs a table.
  with pool as (
    select t.user_id, sum(t.qty)::int as tickets
      from public.raffle_tickets t
     where t.draw_type = p_draw_type
       and t.period_start is not distinct from v_period
     group by t.user_id
    having sum(t.qty) > 0
  )
  select coalesce(sum(tickets), 0)::int, count(*)::int into v_total, v_ent from pool;

  if v_total <= 0 then raise exception 'nobody holds a ticket for this draw'; end if;

  v_pick := 1 + floor(random() * v_total)::int;

  -- One ball per ticket: the running total over a stable order carves the
  -- interval so somebody with nine tickets occupies nine times the space.
  with pool as (
    select t.user_id, sum(t.qty)::int as tickets
      from public.raffle_tickets t
     where t.draw_type = p_draw_type
       and t.period_start is not distinct from v_period
     group by t.user_id
    having sum(t.qty) > 0
  ), running as (
    select user_id, tickets,
           sum(tickets) over (order by user_id rows between unbounded preceding and current row) as cum
      from pool
  )
  select r.user_id, r.tickets into v_winner, v_wtix
    from running r
   where r.cum >= v_pick
   order by r.cum
   limit 1;

  select name into v_wname from public.profiles where id = v_winner;
  v_ful := private.fulfil_raffle_prize(v_winner, v_prize);

  -- Accumulating pools are spent when they win; period pools roll over anyway.
  if p_draw_type in ('random', 'blessed') then
    perform set_config('sswx.privileged_write', 'on', true);
    insert into public.raffle_tickets (user_id, draw_type, period_start, qty, reason, granted_by)
    values (v_winner, p_draw_type, v_period, -v_wtix, 'Spent on a win', auth.uid());
  end if;

  insert into public.raffle_draws (
    draw_type, period_start, prize_id, prize_label, winner_id, winner_name,
    entrants, tickets_total, winner_tickets, fulfilment, note, drawn_by
  )
  values (
    p_draw_type, v_period, v_prize.id, v_prize.label, v_winner, coalesce(v_wname, ''),
    v_ent, v_total, v_wtix, v_ful, p_note, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_run_raffle(text, uuid, date, text) from public, anon;
grant execute on function public.admin_run_raffle(text, uuid, date, text) to authenticated;
