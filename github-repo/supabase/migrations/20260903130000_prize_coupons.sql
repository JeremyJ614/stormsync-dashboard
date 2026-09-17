-- StormSync VIP — turning a won discount into something that applies itself.
--
-- The ask was that every prize that can be automated is automated, and that
-- anything that cannot becomes a coupon shown in the member's profile. A
-- discount is the commonest prize in the catalogue by a wide margin, so it is
-- worth getting exactly right.
--
-- WHAT WAS IN THE WAY. A coupon could only be "once" or "for ever": the kind
-- column encodes `first_month_*` as Stripe's `duration: once` and everything
-- else as `duration: forever`. Two thirds of the discount prizes are neither —
-- "25% off every month for a year", "50% off for two years", "30% off the next
-- four months". Minting those as `forever` would give away far more than the
-- prize; as `once`, far less. Neither is acceptable, so the vocabulary grows a
-- duration and Stripe's `repeating` is used for the middle case. After this a
-- fixed-percentage discount of any length is ONE coupon that Stripe then
-- applies on its own every cycle, with nobody in the loop.
--
-- WHAT IS STILL NOT ONE COUPON. A ladder changes percentage every month, and no
-- single Stripe coupon expresses that. Those mint the first rung and keep the
-- remaining rungs on the benefit row, which is what the monthly applier walks.
--
-- OWNERSHIP. A prize coupon is minted against the winner. Without that, a code
-- pasted into a group chat is a discount for everybody who reads it.

alter table public.coupons add column if not exists duration_months integer
  check (duration_months is null or duration_months > 0);
alter table public.coupons add column if not exists owner_id uuid
  references public.profiles(id) on delete cascade;

comment on column public.coupons.duration_months is
  'How many billing cycles it applies to. 1 = once, null = for ever, N = repeating.';
comment on column public.coupons.owner_id is
  'Set when a code was minted for one person. Only they can redeem it.';

-- ── validation ──────────────────────────────────────────────────────────────
/**
 * Unchanged for every code that already existed, and it has to stay that way:
 * `owner_id` and `duration_months` are null on all of them, so a public code is
 * still public and still lasts as long as it always did.
 */
create or replace function public.validate_coupon(
  p_code text, p_tier text, p_user uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  c record;
begin
  select * into c from public.coupons where upper(code) = upper(p_code);

  if not found or c.active = false then
    return jsonb_build_object('valid', false, 'error', 'Invalid or expired code');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('valid', false, 'error', 'This code has expired');
  end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then
    return jsonb_build_object('valid', false, 'error', 'This code has reached its use limit');
  end if;
  if p_tier is null or not (p_tier = any(c.applies_to_tiers)) then
    return jsonb_build_object('valid', false, 'error', 'This code is not valid for the selected plan');
  end if;
  -- A code minted as somebody's prize is theirs.
  if c.owner_id is not null and (p_user is null or p_user <> c.owner_id) then
    return jsonb_build_object('valid', false, 'error', 'This code belongs to another member');
  end if;

  return jsonb_build_object('valid', true, 'kind', c.kind, 'value', c.value,
                            'code', c.code, 'duration_months', c.duration_months);
end;
$$;

-- ── minting ─────────────────────────────────────────────────────────────────
create or replace function private.mint_prize_coupon(
  p_user uuid, p_percent numeric, p_months integer, p_label text
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_code text;
begin
  -- Random tail, so a code cannot be guessed from another one.
  v_code := 'WIN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupons
    (code, kind, value, active, max_uses, used_count, expires_at, duration_months, owner_id)
  values (v_code,
          -- A single-cycle discount keeps the old `first_month` kind so nothing
          -- downstream has to change to recognise it.
          case when p_months = 1 then 'first_month_percent_off' else 'percent_off' end,
          p_percent, true, 1, 0,
          -- A prize does not go stale on a shelf. Long enough to be a deadline,
          -- long enough not to be a trap.
          now() + interval '365 days',
          p_months, p_user);
  return v_code;
end;
$$;

revoke all on function private.mint_prize_coupon(uuid, numeric, integer, text) from public, anon, authenticated;

-- ── the discount branches, now minting ──────────────────────────────────────
-- Only the three money-off branches change; everything else in `apply_effect`
-- is as it was.
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
  v_code     text;
  v_pct      numeric;
begin
  select coalesce(nullif(trim(name), ''), split_part(email, '@', 1)) into v_name
    from public.profiles where id = p_user;
  perform set_config('sswx.privileged_write', 'on', true);

  if v_t = 'points' then
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (p_user, coalesce(v_name, 'Member'), 'raffle', (p_effect->>'n')::int,
            (now() at time zone 'utc')::date, jsonb_build_object('prize', p_label));
    return query select true, (p_effect->>'n') || ' points.';

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

  elsif v_t = 'tickets' then
    v_said := private.grant_tickets(p_user,
      (p_effect->>'monthly')::int, (p_effect->>'yearly')::int,
      (p_effect->>'random')::int,  (p_effect->>'blessed')::int, p_label);
    return query select v_said is not null, coalesce(v_said, 'No tickets specified.');

  -- ── money off, as a coupon that carries its own duration ─────────────────
  elsif v_t in ('discount', 'free_months') then
    v_months := case
      when coalesce((p_effect->>'months_from_membership')::boolean, false)
        then private.months_a_member(p_user)
      else (p_effect->>'months')::int
    end;
    v_pct := case when v_t = 'free_months' then 100 else (p_effect->>'percent')::numeric end;
    v_code := private.mint_prize_coupon(p_user, v_pct, v_months, p_label);

    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, perpetual, status,
       coupon_code, source, source_ref)
    values (p_user,
            case when v_t = 'free_months' then 'free_months' else 'discount' end,
            p_label,
            case when v_t = 'free_months'
              then case when v_months is null then 'Free, for life'
                        else v_months || ' month(s) free' end
              else v_pct || '% off'
                   || case when v_months is null then ', for life'
                           else ' for ' || v_months || ' month(s)' end end,
            jsonb_build_object('percent', v_pct),
            v_months, v_months is null, 'active', v_code, 'raffle', p_ref);
    return query select true,
      case when v_t = 'free_months'
             then case when v_months is null then 'Free for life'
                       else v_months || ' month(s) free' end
           else v_pct || '% off'
                || case when v_months is null then ' for life'
                        else ' for ' || v_months || ' month(s)' end end
      || ' — code ' || v_code || '.';

  elsif v_t = 'ladder' then
    -- A changing percentage is not one coupon. The first rung is minted so the
    -- prize starts working immediately; the rest live on the benefit row.
    v_pct := (p_effect->'steps'->>0)::numeric;
    v_code := private.mint_prize_coupon(p_user, v_pct, 1, p_label);
    insert into public.member_benefits
      (user_id, kind, label, detail, config, months_total, months_used, status,
       coupon_code, source, source_ref)
    values (p_user, 'discount_ladder', p_label,
            'Starts at ' || v_pct || '% and steps down each month',
            jsonb_build_object('steps', p_effect->'steps'),
            jsonb_array_length(p_effect->'steps'), 1, 'active', v_code, 'raffle', p_ref);
    return query select true,
      'A discount ladder over ' || jsonb_array_length(p_effect->'steps')
      || ' months, starting at ' || v_pct || '% — code ' || v_code || '.';

  elsif v_t = 'tier' then
    v_months := (p_effect->>'months')::int;
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
            v_months, v_months is null, 'active', 'raffle', p_ref);
    update public.profiles set tier = greatest(tier, (p_effect->>'tier')::int) where id = p_user;
    if v_months is null then
      update public.profiles
         set billing_type = 'lifetime', subscription_status = 'active' where id = p_user;
    end if;
    return query select true, 'Tier ' || (p_effect->>'tier') ||
      case when v_months is null then ' for life.' else ' for ' || v_months || ' months.' end;

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

  elsif v_t = 'engraving' then
    v_said := private.engrave_name(p_user, coalesce(p_effect->>'slot', 'engraved'), p_label, p_ref);
    insert into public.member_benefits
      (user_id, kind, label, detail, config, perpetual, status, source, source_ref)
    values (p_user, 'engraving', p_label, v_said,
            jsonb_build_object('slot', coalesce(p_effect->>'slot', 'engraved')),
            true, 'active', 'raffle', p_ref);
    return query select true, v_said;

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

revoke all on function private.apply_effect(uuid, jsonb, text, uuid) from public, anon, authenticated;
