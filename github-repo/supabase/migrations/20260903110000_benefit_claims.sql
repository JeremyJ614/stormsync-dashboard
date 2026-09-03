-- StormSync VIP — claiming what you won, and rehearsing a draw.
--
-- Some prizes are not handed over, they are held: "pick two modules", "take 700
-- points from each of the top three, at any time, with no expiration". Those sit
-- in `member_benefits` as `claimable` until the member reaches out and takes
-- them. This is the reaching-out.
--
-- All of it runs as the member, through `auth.uid()`, and every claim checks the
-- benefit is theirs and still unspent before it does anything. A points raid
-- that could be replayed would be a way to zero the leaderboard.

-- ── what I hold ─────────────────────────────────────────────────────────────
create or replace function public.my_benefits()
returns table (
  id uuid, kind text, label text, detail text, config jsonb,
  status text, months_total int, months_used int, perpetual boolean,
  coupon_code text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  select b.id, b.kind, b.label, b.detail, b.config, b.status,
         b.months_total, b.months_used, b.perpetual, b.coupon_code, b.created_at
  from public.member_benefits b
  where b.user_id = auth.uid() and b.status <> 'revoked'
  order by (b.status = 'claimable') desc, b.created_at desc;
$$;

grant execute on function public.my_benefits() to authenticated;

-- ── the year's point leaders ────────────────────────────────────────────────
/**
 * Who is top of the board this year, and by how much.
 *
 * Public on purpose: two prizes let somebody take points off the leaders, and
 * being told to press a button without being shown who it lands on would make
 * the prize impossible to use well.
 */
create or replace function public.points_leaders(p_top int default 3)
returns table (user_id uuid, display text, points bigint)
language sql
stable
security definer
set search_path = public, private
as $$
  select g.user_id,
         coalesce(max(nullif(trim(p.name), '')), max(g.user_name), 'Member') as display,
         sum(g.points)::bigint as points
  from public.game_points g
  left join public.profiles p on p.id = g.user_id
  where g.earned_on >= date_trunc('year', (now() at time zone 'utc'))::date
  group by g.user_id
  having sum(g.points) > 0
  order by sum(g.points) desc
  limit greatest(coalesce(p_top, 3), 1);
$$;

grant execute on function public.points_leaders(int) to authenticated, anon;

-- ── picking modules ─────────────────────────────────────────────────────────
create or replace function public.claim_module_credit(p_benefit uuid, p_modules text[])
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_b     public.member_benefits;
  v_want  int;
  v_valid text[];
begin
  select * into v_b from public.member_benefits
   where id = p_benefit and user_id = auth.uid() and kind = 'module_credit'
     and status = 'claimable'
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'That prize is not yours to claim.'); end if;

  v_want := coalesce((v_b.config->>'n')::int, 1);
  -- Only modules they do not already have, and only as many as they won.
  v_valid := array(select x from unnest(p_modules) x
                    where x = any(private.modules_missing(auth.uid())));
  if coalesce(array_length(v_valid, 1), 0) <> v_want then
    return jsonb_build_object('ok', false,
      'error', 'Pick exactly ' || v_want || ' module' || case when v_want = 1 then '' else 's' end
               || ' you do not already have.');
  end if;

  perform set_config('sswx.privileged_write', 'on', true);
  update public.profiles
     set enabled_modules = (select array(select distinct unnest(coalesce(enabled_modules, '{}') || v_valid)))
   where id = auth.uid();

  update public.member_benefits
     set status = 'spent', spent_at = now(),
         detail = array_to_string(v_valid, ', '),
         config = config || jsonb_build_object('picked', to_jsonb(v_valid))
   where id = p_benefit;

  return jsonb_build_object('ok', true, 'picked', to_jsonb(v_valid));
end;
$$;

grant execute on function public.claim_module_credit(uuid, text[]) to authenticated;

-- ── taking points off the leaders ───────────────────────────────────────────
/**
 * One press, no expiry, and then the button is gone.
 *
 * The points are moved rather than invented: a negative row lands on each
 * leader and a positive row on the winner, so the ledger still adds up and the
 * history says who took what from whom.
 */
create or replace function public.claim_points_steal(p_benefit uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_b     public.member_benefits;
  v_each  int;
  v_top   int;
  v_name  text;
  v_taken int := 0;
  v_from  jsonb := '[]'::jsonb;
  r       record;
begin
  select * into v_b from public.member_benefits
   where id = p_benefit and user_id = auth.uid() and kind = 'points_steal' and status = 'claimable'
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'That prize is not yours to claim.'); end if;

  v_each := coalesce((v_b.config->>'each')::int, 0);
  v_top  := coalesce((v_b.config->>'from_top')::int, 3);
  select coalesce(nullif(trim(name), ''), 'Member') into v_name from public.profiles where id = auth.uid();
  perform set_config('sswx.privileged_write', 'on', true);

  for r in select * from public.points_leaders(v_top) loop
    -- Never take more than they have: a negative leaderboard is not a prize,
    -- it is a bug with somebody's name on it.
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (r.user_id, r.display, 'raffle', -least(v_each, r.points)::int,
            (now() at time zone 'utc')::date,
            jsonb_build_object('prize', v_b.label, 'taken_by', v_name));
    v_taken := v_taken + least(v_each, r.points)::int;
    v_from := v_from || jsonb_build_object('name', r.display, 'lost', least(v_each, r.points));
  end loop;

  insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
  values (auth.uid(), v_name, 'raffle', v_taken, (now() at time zone 'utc')::date,
          jsonb_build_object('prize', v_b.label, 'taken_from', v_from));

  update public.member_benefits
     set status = 'spent', spent_at = now(),
         config = config || jsonb_build_object('taken', v_taken, 'from', v_from)
   where id = p_benefit;

  return jsonb_build_object('ok', true, 'taken', v_taken, 'from', v_from);
end;
$$;

grant execute on function public.claim_points_steal(uuid) to authenticated;

-- ── clearing the board ──────────────────────────────────────────────────────
create or replace function public.claim_points_wipe(p_benefit uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_b    public.member_benefits;
  v_rank int;
  v_name text;
  v_tot  bigint := 0;
  v_hit  jsonb := '[]'::jsonb;
  r      record;
begin
  select * into v_b from public.member_benefits
   where id = p_benefit and user_id = auth.uid() and kind = 'points_wipe' and status = 'claimable'
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'That prize is not yours to claim.'); end if;

  v_rank := coalesce((v_b.config->>'below_rank')::int, 5);
  select coalesce(nullif(trim(name), ''), 'Member') into v_name from public.profiles where id = auth.uid();
  perform set_config('sswx.privileged_write', 'on', true);

  for r in
    with board as (
      select g.user_id,
             coalesce(max(nullif(trim(p.name), '')), max(g.user_name), 'Member') as display,
             sum(g.points)::bigint as points,
             row_number() over (order by sum(g.points) desc) as rn
      from public.game_points g
      left join public.profiles p on p.id = g.user_id
      where g.earned_on >= date_trunc('year', (now() at time zone 'utc'))::date
      group by g.user_id
      having sum(g.points) > 0
    )
    -- The winner does not wipe themselves out.
    select * from board where rn >= v_rank and user_id <> auth.uid()
  loop
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (r.user_id, r.display, 'raffle', (-r.points)::int, (now() at time zone 'utc')::date,
            jsonb_build_object('prize', v_b.label, 'taken_by', v_name));
    v_tot := v_tot + r.points;
    v_hit := v_hit || jsonb_build_object('name', r.display, 'lost', r.points);
  end loop;

  if v_tot > 0 then
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (auth.uid(), v_name, 'raffle', v_tot::int, (now() at time zone 'utc')::date,
            jsonb_build_object('prize', v_b.label, 'taken_from', v_hit));
  end if;

  update public.member_benefits
     set status = 'spent', spent_at = now(),
         config = config || jsonb_build_object('taken', v_tot, 'from', v_hit)
   where id = p_benefit;

  return jsonb_build_object('ok', true, 'taken', v_tot, 'from', v_hit);
end;
$$;

grant execute on function public.claim_points_wipe(uuid) to authenticated;

-- ── rehearsing a draw ───────────────────────────────────────────────────────
/**
 * Run a draw that changes nothing.
 *
 * The real draw awards a prize to a real person and cannot be taken back, which
 * makes it a poor thing to test on. This takes an invented field — names and
 * ticket counts — and reports who would win and how often, using the same
 * weighting as the real thing so the rehearsal is worth something.
 *
 * `p_runs` above one reports a distribution rather than a single result, which
 * is the only way to see whether the odds are actually what the catalogue says.
 */
create or replace function public.admin_simulate_raffle(
  p_draw_type text,
  p_entrants  jsonb,          -- [{"name":"Jay","tickets":4}, …]
  p_runs      int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_runs    int := least(greatest(coalesce(p_runs, 1), 1), 10000);
  v_tickets bigint;
  v_weight  numeric;
  v_i       int;
  -- The roll has to be taken ONCE per draw and held. `random()` is volatile, so
  -- comparing against it inside a WHERE gives every candidate row its own
  -- number: the first row that happens to pass wins, which quietly turns a
  -- weighted draw into "whichever prize is listed first, mostly". The real draw
  -- gets this right; the first version of this rehearsal did not, and reported
  -- the top prizes as unreachable and the bottom ones at twice their odds.
  v_roll    numeric;
  v_names   jsonb := '{}'::jsonb;
  v_prizes  jsonb := '{}'::jsonb;
  v_first   jsonb;
  v_n       text;
  v_p       text;
begin
  if not private.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'Admins only.');
  end if;
  if p_draw_type not in ('random', 'monthly', 'yearly', 'blessed') then
    return jsonb_build_object('ok', false, 'error', 'Unknown draw type.');
  end if;

  select sum(greatest((e->>'tickets')::int, 0)) into v_tickets
    from jsonb_array_elements(coalesce(p_entrants, '[]'::jsonb)) e;
  if coalesce(v_tickets, 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nobody has a ticket.');
  end if;

  select sum(weight) into v_weight from public.raffle_prizes
   where draw_type = p_draw_type and active and weight > 0;
  if coalesce(v_weight, 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'No active prizes in that draw.');
  end if;

  for v_i in 1..v_runs loop
    -- The winner: every ticket is one entry, exactly as the real draw does it.
    v_roll := floor(random() * v_tickets);
    select e.name into v_n from (
      select (x->>'name') as name,
             sum(greatest((x->>'tickets')::int, 0))
               over (order by (x->>'name') rows between unbounded preceding and current row) as cum
      from jsonb_array_elements(p_entrants) x
    ) e
    where e.cum > v_roll
    order by e.cum
    limit 1;

    -- The prize: weighted the same way.
    v_roll := random() * v_weight;
    select p.label into v_p from (
      select label,
             sum(weight) over (order by rank rows between unbounded preceding and current row) as cum
      from public.raffle_prizes where draw_type = p_draw_type and active and weight > 0
    ) p
    where p.cum > v_roll
    order by p.cum
    limit 1;

    v_names  := jsonb_set(v_names,  array[coalesce(v_n, '—')],
                to_jsonb(coalesce((v_names->>coalesce(v_n, '—'))::int, 0) + 1));
    v_prizes := jsonb_set(v_prizes, array[coalesce(v_p, '—')],
                to_jsonb(coalesce((v_prizes->>coalesce(v_p, '—'))::int, 0) + 1));
    if v_i = 1 then
      v_first := jsonb_build_object('winner', v_n, 'prize', v_p);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'runs', v_runs, 'draw_type', p_draw_type,
    'tickets_total', v_tickets,
    'first', v_first, 'winners', v_names, 'prizes', v_prizes);
end;
$$;

revoke all on function public.admin_simulate_raffle(text, jsonb, int) from public, anon;
grant execute on function public.admin_simulate_raffle(text, jsonb, int) to authenticated;

-- ── the whole catalogue, for the member-facing module ───────────────────────
create or replace function public.raffle_catalogue()
returns table (
  draw_type text, rank int, label text, description text,
  config jsonb, weight numeric, odds numeric
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.draw_type, p.rank, p.label, p.description, p.config, p.weight,
         round(100.0 * p.weight / nullif(sum(p.weight) over (partition by p.draw_type), 0), 2)
  from public.raffle_prizes p
  where p.active
  order by p.draw_type, p.rank desc;
$$;

grant execute on function public.raffle_catalogue() to authenticated, anon;
