-- StormSync VIP — what a raffle prize actually does.
--
-- The old fulfilment function was a five-branch `if`: points, a coupon, a
-- badge, a module, an alert level, and "hand this one over yourself" for
-- everything else. The prize list it now has to serve does not fit that shape.
-- A single prize is routinely several things at once ("Three Free Months, 1000
-- Points and a Blessed Ticket"), and a third of them carry a condition —
-- "(if they already have Advanced for Life, upgrade them to 2 Blessed
-- Tickets)".
--
-- So a prize is a LIST OF EFFECTS, and an effect can name a replacement to try
-- when it cannot land. That is the whole design, and it is what makes the
-- conditions in the prize list expressible as data instead of as a special case
-- per prize:
--
--   effects: [
--     { "t": "modules", "ids": ["/chasing"],
--       "else": { "t": "module_credit", "n": 1,
--                 "else": { "t": "discount", "percent": 10, "months_from_membership": true } } }
--   ]
--
-- THE FALLBACK. When every branch of an effect is exhausted — the member
-- already owns everything it could give them — they are not given nothing. The
-- house rule is one monthly ticket and one yearly ticket, applied unless the
-- prize names its own replacement. It is written once, here, rather than
-- twenty-five times in the catalogue.

-- The kinds a prize row can carry. Widened from the original five because a
-- prize is now described by its effects rather than by a single verb.
alter table public.raffle_prizes drop constraint if exists raffle_prizes_kind_check;
alter table public.raffle_prizes add constraint raffle_prizes_kind_check
  check (kind in ('points', 'coupon_percent', 'badge', 'module', 'alert_level',
                  'manual', 'effects'));

-- ── helpers ─────────────────────────────────────────────────────────────────

/** Every module a member could still be given, newest-first is not meaningful here. */
create or replace function private.modules_missing(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(array_agg(m.module_id order by m.sort_order), '{}')
  from public.nav_modules m
  where m.visible
    and not m.admin_only
    and m.module_id not in (
      select unnest(coalesce(p.enabled_modules, '{}')) from public.profiles p where p.id = p_user
    );
$$;

/** Whether this account already has everything, permanently. */
create or replace function private.has_everything(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (select p.tier >= 4 and p.billing_type = 'lifetime' from public.profiles p where p.id = p_user),
    false)
  or coalesce(array_length(private.modules_missing(p_user), 1), 0) = 0;
$$;

/** Whole months since they joined, floor 1 — used by the membership-length prize. */
create or replace function private.months_a_member(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select greatest(1, coalesce(
    (select (extract(year from age(now(), coalesce(joined_at, created_at))) * 12
           + extract(month from age(now(), coalesce(joined_at, created_at))))::int
     from public.profiles where id = p_user), 1));
$$;

/** Hand over raffle tickets of any mix. Returns what was given, in words. */
create or replace function private.grant_tickets(
  p_user uuid, p_monthly int, p_yearly int, p_random int, p_blessed int, p_reason text
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_said text[] := '{}';
  t      record;
begin
  for t in
    select * from (values
      ('monthly', coalesce(p_monthly, 0)),
      ('yearly',  coalesce(p_yearly, 0)),
      ('random',  coalesce(p_random, 0)),
      ('blessed', coalesce(p_blessed, 0))
    ) as v(kind, qty) where v.qty > 0
  loop
    insert into public.raffle_tickets (user_id, draw_type, period_start, qty, reason, idem_key)
    values (p_user, t.kind, public.raffle_period(t.kind), t.qty, p_reason,
            'prize:' || p_reason || ':' || t.kind || ':' || gen_random_uuid()::text);
    v_said := v_said || (t.qty || ' ' || t.kind);
  end loop;

  if array_length(v_said, 1) is null then return null; end if;
  return array_to_string(v_said, ', ') || ' ticket(s).';
end;
$$;

-- ── one effect ──────────────────────────────────────────────────────────────
/**
 * Apply a single effect, and say whether it landed.
 *
 * `landed` false means the member could not receive it — they already hold
 * everything it offers — which is the signal for the caller to try the
 * effect's `else` branch, and failing that the house fallback. It does NOT
 * mean an error: an error raises.
 *
 * Discounts always land. A member with no live subscription has nothing to
 * attach one to today, so the benefit is written down as `pending` and the
 * applier picks it up when they next have an invoice. Recording it and honouring
 * it later is the honest behaviour; refusing it because the timing is
 * inconvenient would be quietly taking a prize away.
 */
create or replace function private.apply_effect(
  p_user uuid, p_effect jsonb, p_label text, p_ref uuid
)
returns table (landed boolean, said text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_t        text := p_effect->>'t';
  v_name     text;
  v_missing  text[];
  v_pick     text[];
  v_n        int;
  v_months   int;
  v_said     text;
  v_id       uuid;
begin
  select coalesce(nullif(trim(name), ''), split_part(email, '@', 1)) into v_name
    from public.profiles where id = p_user;
  perform set_config('sswx.privileged_write', 'on', true);

  -- ── points ───────────────────────────────────────────────────────────────
  if v_t = 'points' then
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (p_user, coalesce(v_name, 'Member'), 'raffle', (p_effect->>'n')::int,
            (now() at time zone 'utc')::date,
            jsonb_build_object('prize', p_label));
    return query select true, (p_effect->>'n') || ' points.';

  -- ── points, month after month ────────────────────────────────────────────
  -- "Start the next three months off with 750 points" is three separate gifts
  -- on three separate dates, so the first lands now and the rest are owed.
  elsif v_t = 'points_monthly' then
    v_months := coalesce((p_effect->>'months')::int, 1);
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (p_user, coalesce(v_name, 'Member'), 'raffle', (p_effect->>'n')::int,
            (now() at time zone 'utc')::date, jsonb_build_object('prize', p_label, 'instalment', 1));
    if v_months > 1 then
      insert into public.member_benefits
        (user_id, kind, label, detail, config, months_total, months_used, status, source, source_ref)
      values (p_user, 'points_monthly', p_label,
              (p_effect->>'n') || ' points at the start of each of ' || v_months || ' months',
              jsonb_build_object('n', (p_effect->>'n')::int),
              v_months, 1, 'active', 'raffle', p_ref);
    end if;
    return query select true,
      (p_effect->>'n') || ' points now, and again at the start of the next '
      || (v_months - 1) || ' month(s).';

  -- ── raffle tickets ───────────────────────────────────────────────────────
  elsif v_t = 'tickets' then
    v_said := private.grant_tickets(p_user,
      (p_effect->>'monthly')::int, (p_effect->>'yearly')::int,
      (p_effect->>'random')::int,  (p_effect->>'blessed')::int, p_label);
    return query select v_said is not null, coalesce(v_said, 'No tickets specified.');

  -- ── money off ────────────────────────────────────────────────────────────
  -- `free_months` is the same obligation with the percentage fixed at 100; it
  -- is a separate kind only so the member's profile can call it what it is.
  elsif v_t in ('discount', 'free_months') then
    v_months := case
      when coalesce((p_effect->>'months_from_membership')::boolean, false)
        then private.months_a_member(p_user)
      else (p_effect->>'months')::int
    end;
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, perpetual, status, source, source_ref)
    values (p_user,
            case when v_t = 'free_months' then 'free_months' else 'discount' end,
            p_label,
            case when v_t = 'free_months'
              then case when v_months is null then 'Free, for life'
                        else v_months || ' month(s) free' end
              else (p_effect->>'percent') || '% off'
                   || case when v_months is null then ', for life'
                           else ' for ' || v_months || ' month(s)' end end,
            jsonb_build_object('percent',
              case when v_t = 'free_months' then 100 else (p_effect->>'percent')::numeric end),
            v_months, v_months is null, 'pending', 'raffle', p_ref);
    return query select true,
      case when v_t = 'free_months'
             then case when v_months is null then 'Free for life.'
                       else v_months || ' month(s) free.' end
           else (p_effect->>'percent') || '% off'
                || case when v_months is null then ' for life.'
                        else ' for ' || v_months || ' month(s).' end end;

  -- ── a discount that walks down ───────────────────────────────────────────
  elsif v_t = 'ladder' then
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, status, source, source_ref)
    values (p_user, 'discount_ladder', p_label,
            'Starts at ' || (p_effect->'steps'->>0) || '% and steps down each month',
            jsonb_build_object('steps', p_effect->'steps'),
            jsonb_array_length(p_effect->'steps'), 'pending', 'raffle', p_ref);
    return query select true,
      'A discount ladder over ' || jsonb_array_length(p_effect->'steps') || ' months.';

  -- ── tier ─────────────────────────────────────────────────────────────────
  elsif v_t = 'tier' then
    v_months := (p_effect->>'months')::int;
    -- Already there permanently: nothing to give, so the caller falls through.
    if exists (select 1 from public.profiles
                where id = p_user and tier >= (p_effect->>'tier')::int
                  and billing_type = 'lifetime') then
      return query select false, 'Already holds that tier for life.';
    end if;
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, perpetual, status, source, source_ref)
    values (p_user, 'tier', p_label,
            case when v_months is null then 'For life' else v_months || ' months' end,
            jsonb_build_object('tier', (p_effect->>'tier')::int),
            v_months, v_months is null, 'pending', 'raffle', p_ref);
    update public.profiles set tier = greatest(tier, (p_effect->>'tier')::int) where id = p_user;
    if v_months is null then
      update public.profiles
         set billing_type = 'lifetime', subscription_status = 'active' where id = p_user;
    end if;
    return query select true, 'Tier ' || (p_effect->>'tier') ||
      case when v_months is null then ' for life.' else ' for ' || v_months || ' months.' end;

  -- ── named modules ────────────────────────────────────────────────────────
  elsif v_t = 'modules' then
    v_pick := array(select x from jsonb_array_elements_text(p_effect->'ids') x
                     where x = any(private.modules_missing(p_user)));
    if coalesce(array_length(v_pick, 1), 0) = 0 then
      return query select false, 'Already has those modules.';
    end if;
    update public.profiles
       set enabled_modules = (select array(select distinct unnest(coalesce(enabled_modules, '{}') || v_pick)))
     where id = p_user;
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, perpetual, status, source, source_ref)
    values (p_user, 'modules', p_label, array_to_string(v_pick, ', '),
            jsonb_build_object('ids', to_jsonb(v_pick)),
            (p_effect->>'months')::int, (p_effect->>'months') is null,
            'active', 'raffle', p_ref);
    return query select true, array_to_string(v_pick, ', ') || ' added.';

  -- ── modules of their choosing ────────────────────────────────────────────
  -- Not granted here: the member picks. The benefit sits `claimable` until they
  -- do, which is what puts the chooser in front of them in their profile.
  elsif v_t = 'module_credit' then
    v_missing := private.modules_missing(p_user);
    v_n := least(coalesce((p_effect->>'n')::int, 1), coalesce(array_length(v_missing, 1), 0));
    if v_n = 0 then
      return query select false, 'There is no module left for them to pick.';
    end if;
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, perpetual, status, source, source_ref)
    values (p_user, 'module_credit', p_label,
            v_n || ' module' || case when v_n = 1 then '' else 's' end || ' of their choosing',
            jsonb_build_object('n', v_n, 'months', (p_effect->>'months')::int),
            (p_effect->>'months')::int, (p_effect->>'months') is null,
            'claimable', 'raffle', p_ref);
    return query select true, v_n || ' module pick(s) — waiting for them to choose.';

  -- ── alert ladder ─────────────────────────────────────────────────────────
  elsif v_t = 'alert_levels' then
    v_n := 0;
    for v_months in select (x)::int from jsonb_array_elements_text(p_effect->'levels') x loop
      insert into public.alert_entitlements (user_id, level, source, note)
      values (p_user, v_months, 'granted', 'Raffle prize: ' || p_label)
      on conflict do nothing;
      if found then v_n := v_n + 1; end if;
    end loop;
    return query select v_n > 0,
      case when v_n > 0 then v_n || ' alert level(s) granted.' else 'Already holds those levels.' end;

  -- ── badge ────────────────────────────────────────────────────────────────
  elsif v_t = 'badge' then
    if exists (select 1 from public.badge_awards
                where user_id = p_user and badge_id = p_effect->>'id') then
      return query select false, 'Already holds that badge.';
    end if;
    insert into public.badge_awards (user_id, badge_id, reason)
    values (p_user, p_effect->>'id', 'Raffle prize: ' || p_label)
    on conflict (user_id, badge_id) do nothing;
    update public.profiles
       set badges = (select array(select distinct unnest(coalesce(badges, '{}') || (p_effect->>'id'))))
     where id = p_user;
    return query select true, 'Badge awarded.';

  -- ── taking points off the leaders ────────────────────────────────────────
  -- Held, not fired. The prize is explicitly a button with no expiry, so this
  -- writes the right to press it and nothing else.
  elsif v_t = 'points_steal' then
    insert into public.member_benefits
      (user_id, kind, label, detail, config, status, source, source_ref)
    values (p_user, 'points_steal', p_label,
            'Take ' || (p_effect->>'each') || ' points from each of the top '
              || (p_effect->>'from_top') || ', whenever you like',
            jsonb_build_object('each', (p_effect->>'each')::int,
                               'from_top', coalesce((p_effect->>'from_top')::int, 3)),
            'claimable', 'raffle', p_ref);
    return query select true, 'A one-press points raid, theirs to time.';

  elsif v_t = 'points_wipe' then
    insert into public.member_benefits
      (user_id, kind, label, detail, config, status, source, source_ref)
    values (p_user, 'points_wipe', p_label,
            'Clear everyone ranked ' || (p_effect->>'below_rank') || ' and below, and take the lot',
            jsonb_build_object('below_rank', coalesce((p_effect->>'below_rank')::int, 5)),
            'claimable', 'raffle', p_ref);
    return query select true, 'A one-press wipe-out, theirs to time.';

  -- ── the wall ─────────────────────────────────────────────────────────────
  elsif v_t = 'engraving' then
    v_said := private.engrave_name(p_user, coalesce(p_effect->>'slot', 'engraved'), p_label, p_ref);
    insert into public.member_benefits
      (user_id, kind, label, detail, config, perpetual, status, source, source_ref)
    values (p_user, 'engraving', p_label, v_said,
            jsonb_build_object('slot', coalesce(p_effect->>'slot', 'engraved')),
            true, 'active', 'raffle', p_ref);
    return query select true, v_said;

  -- ── everything else that is simply held ──────────────────────────────────
  elsif v_t in ('beta_access', 'referral_gift', 'extra_draw') then
    v_months := (p_effect->>'months')::int;
    if v_t = 'beta_access' and exists (
      select 1 from public.member_benefits
       where user_id = p_user and kind = 'beta_access' and status in ('pending', 'active')
    ) then
      return query select false, 'Already has beta access.';
    end if;
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, perpetual, status, source, source_ref)
    values (p_user, v_t, p_label, p_effect->>'detail', p_effect - 't' - 'detail',
            v_months, v_months is null,
            case when v_t = 'extra_draw' then 'claimable' else 'active' end,
            'raffle', p_ref)
    returning id into v_id;
    return query select true, coalesce(p_effect->>'detail', p_label) || ' recorded.';

  -- ── the ones a person does ───────────────────────────────────────────────
  elsif v_t = 'manual' then
    insert into public.member_benefits
      (user_id, kind, label, detail, config, status, source, source_ref)
    values (p_user, 'manual', p_label, p_effect->>'detail', '{}'::jsonb,
            'claimable', 'raffle', p_ref);
    return query select true, coalesce(p_effect->>'detail', p_label)
      || ' — logged for you to hand over.';
  end if;

  return query select false, 'Unknown effect: ' || coalesce(v_t, 'null');
end;
$$;

-- ── one effect, with its alternatives ───────────────────────────────────────
/**
 * Try an effect; if it cannot land, try its `else`, and so on down the chain.
 *
 * Depth is bounded rather than unbounded recursion: the deepest condition in
 * the catalogue is three ("the chasing module, or a module you do not have, or
 * a discount for every month you have been a member"), and a chain that ran
 * away would be a data bug worth failing on rather than following.
 */
create or replace function private.apply_effect_chain(
  p_user uuid, p_effect jsonb, p_label text, p_ref uuid
)
returns table (landed boolean, said text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cur   jsonb := p_effect;
  v_depth int := 0;
  v_res   record;
begin
  while v_cur is not null and v_depth < 5 loop
    select * into v_res from private.apply_effect(p_user, v_cur, p_label, p_ref);
    if v_res.landed then
      return query select true, v_res.said;
      return;
    end if;
    v_cur := v_cur->'else';
    v_depth := v_depth + 1;
  end loop;
  return query select false, coalesce(v_res.said, 'Nothing could be applied.');
end;
$$;

-- ── a whole prize ───────────────────────────────────────────────────────────
create or replace function private.fulfil_raffle_prize(p_user uuid, p_prize public.raffle_prizes)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cfg      jsonb := coalesce(p_prize.config, '{}'::jsonb);
  v_effects  jsonb := v_cfg->'effects';
  v_said     text[] := '{}';
  v_any      boolean := false;
  v_e        jsonb;
  v_res      record;
  v_fallback jsonb;
begin
  perform set_config('sswx.privileged_write', 'on', true);

  -- A prize written the old way still works: one kind, one config.
  if v_effects is null or jsonb_typeof(v_effects) <> 'array' then
    v_effects := case p_prize.kind
      when 'points'         then jsonb_build_array(jsonb_build_object('t', 'points', 'n', (v_cfg->>'points')::int))
      when 'badge'          then jsonb_build_array(jsonb_build_object('t', 'badge', 'id', v_cfg->>'badge_id'))
      when 'module'         then jsonb_build_array(jsonb_build_object('t', 'modules', 'ids', jsonb_build_array(v_cfg->>'module_id')))
      when 'alert_level'    then jsonb_build_array(jsonb_build_object('t', 'alert_levels', 'levels', jsonb_build_array((v_cfg->>'level')::int)))
      when 'coupon_percent' then jsonb_build_array(jsonb_build_object('t', 'discount', 'percent', (v_cfg->>'percent')::numeric, 'months', 1))
      else jsonb_build_array(jsonb_build_object('t', 'manual', 'detail', coalesce(p_prize.description, p_prize.label)))
    end;
  end if;

  for v_e in select value from jsonb_array_elements(v_effects) loop
    select * into v_res from private.apply_effect_chain(p_user, v_e, p_prize.label, null);
    if v_res.landed then
      v_any := true;
      -- A null here would be swallowed by `array_to_string` and the win would
      -- report as blank, which is exactly how the Golden Ticket came back empty.
      v_said := v_said || coalesce(v_res.said, p_prize.label || '.');
    end if;
  end loop;

  -- Nothing at all could be applied. The house rule, unless the prize names its
  -- own consolation.
  if not v_any then
    v_fallback := coalesce(v_cfg->'fallback',
      jsonb_build_object('t', 'tickets', 'monthly', 1, 'yearly', 1));
    select * into v_res from private.apply_effect_chain(p_user, v_fallback, p_prize.label, null);
    return 'Already had everything this prize offers, so instead: ' ||
           coalesce(v_res.said, '1 monthly, 1 yearly ticket(s).');
  end if;

  return array_to_string(v_said, ' ');
end;
$$;

revoke all on function private.apply_effect(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function private.apply_effect_chain(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function private.modules_missing(uuid) from public, anon, authenticated;
revoke all on function private.has_everything(uuid) from public, anon, authenticated;
revoke all on function private.months_a_member(uuid) from public, anon, authenticated;
revoke all on function private.grant_tickets(uuid, int, int, int, int, text) from public, anon, authenticated;
