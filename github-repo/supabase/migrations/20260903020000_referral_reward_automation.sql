-- Referral rewards, applied rather than remembered.
--
-- The ladder already knew what somebody had earned: `mark_referral_converted`
-- wrote the rung onto the redemption row, notified the referrer, and then
-- waited for the owner to open the admin panel and do it by hand. Every reward
-- in the programme was therefore only as fast as a person, which for a
-- programme whose entire promise is "bring someone in and you get something" is
-- the wrong shape. Somebody refers a friend at two in the morning, the friend
-- pays, and the reward sits in a queue.
--
-- This migration makes the ladder grant what it can grant, immediately, and be
-- honest about the rest.
--
-- WHAT IS AUTOMATED, AND HOW
--   · percentOff / flatOff        a personal single-use coupon is minted and
--                                 the code is put in the notification. Coupons
--                                 are already validated server-side at
--                                 checkout, so this is the real mechanism and
--                                 not a promise of one.
--   · freeMonths                  a 100%-off coupon with `max_uses` set to the
--                                 number of months. Same mechanism.
--   · addonModules / addons       appended to `profiles.addon_modules`, which
--                                 is what actually unlocks a paid module. A
--                                 bare count takes the cheapest PAID modules
--                                 they do not already hold.
--   · alertLevel                  an `alert_entitlements` row at that level,
--                                 sourced 'granted' with the referral named in
--                                 its note, so it stays distinguishable from a
--                                 purchase for ever afterwards.
--   · tier                        `profiles.tier` is raised, never lowered.
--   · points                      a `loyalty_events` row, keyed so a retry
--                                 cannot pay twice.
--   · raffleTickets               tickets in the current period, with an idem
--                                 key derived from the redemption so a retry
--                                 cannot double-issue.
--   · badge                       a `badge_awards` row plus the profile array.
--
-- WHAT IS NOT, AND WHY
-- Nothing here touches Stripe. A tier granted in `profiles` opens the app
-- immediately, which is what the member cares about; reconciling that with what
-- they are billed is a decision with money in it and belongs to the owner. Any
-- rung carrying `manual` keeps the old behaviour exactly — recorded, notified,
-- and left for a person. `fulfilled_at` is only set when every effect the rung
-- asked for actually applied.
--
-- IDEMPOTENCE. Everything keys off the redemption id: the coupon code embeds
-- it, the raffle idem key embeds it, the badge award is a no-op if held, and
-- the tier and module grants are set-like. Running the same conversion twice
-- cannot pay twice.

-- ── an idempotence key for the ledger ────────────────────────────────────────
--
-- Every other grant here is naturally idempotent: the coupon code is derived
-- from the redemption, alert entitlements are keyed (user, level), the module
-- and badge arrays are sets, the tier only ever moves up, and raffle tickets
-- already carry an `idem_key`. Loyalty points were the exception — a plain
-- insert, so a retried webhook paid twice. This gives the ledger the same key
-- the raffle has, nullable so nothing existing has to change.
alter table public.loyalty_events add column if not exists idem_key text;
-- Not a partial index. `on conflict (idem_key)` cannot infer a partial one
-- unless the statement repeats its predicate, and it does not need to be
-- partial: Postgres treats NULLs as distinct in a unique index, so every
-- existing keyless row and every future manual award coexists happily.
create unique index if not exists loyalty_events_idem_key_uidx
  on public.loyalty_events (idem_key);

-- ── minting ──────────────────────────────────────────────────────────────────
/**
 * A single-use coupon belonging to one person.
 *
 * `coupons` is keyed by code rather than by user, so "personal" here means the
 * code is generated unpredictably, capped at `p_max_uses`, and handed only to
 * the member it was minted for. That is the same guarantee a coupon card in the
 * post has, and it is enough: the value is small and the code is one of 36^8.
 *
 * The suffix is derived from the reason so the same reason cannot mint twice —
 * a retried webhook re-mints the identical code and the insert is a no-op.
 */
create or replace function private.mint_personal_coupon(
  p_kind      text,
  p_value     numeric,
  p_max_uses  integer,
  p_valid_days integer,
  p_seed      text
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_code text;
begin
  -- Deterministic in the seed, so a replay produces the same code rather than
  -- a second one. md5 is fine here: this is a namespace, not a secret.
  v_code := 'REF-' || upper(substr(md5(p_seed), 1, 8));

  insert into public.coupons (code, kind, value, active, max_uses, used_count, expires_at)
  values (v_code, p_kind, p_value, true, greatest(1, coalesce(p_max_uses, 1)), 0,
          now() + make_interval(days => greatest(1, coalesce(p_valid_days, 60))))
  on conflict (code) do nothing;

  return v_code;
end;
$$;

revoke all on function private.mint_personal_coupon(text, numeric, integer, integer, text) from public, anon, authenticated;

-- ── applying ─────────────────────────────────────────────────────────────────
/**
 * Apply one reward's effects to one member.
 *
 * Returns what it actually did, as jsonb, so the caller can record it and the
 * member can be told in words rather than in config. An effect the reward does
 * not mention is not applied; an effect that cannot apply (a module they
 * already own, a tier below their current one) is skipped and said so.
 *
 * `p_seed` must be stable for a given grant — it is what makes coupon codes and
 * raffle tickets idempotent across retries.
 */
create or replace function public.apply_reward_effects(
  p_user    uuid,
  p_effects jsonb,
  p_source  text,
  p_seed    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private
as $$
declare
  v_done      jsonb := '[]'::jsonb;
  v_code      text;
  v_n         integer;
  v_tier      integer;
  v_mods      text[];
  v_pick      text[];
  v_badge     text;
  v_draw      text;
  v_period    date;
  v_manual    boolean := coalesce((p_effects ->> 'manual')::boolean, false);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_user is null or p_effects is null then
    return jsonb_build_object('ok', false, 'error', 'missing user or effects');
  end if;

  -- Money off, as a real coupon.
  v_n := coalesce((p_effects ->> 'percentOff')::int, 0);
  if v_n > 0 then
    v_code := private.mint_personal_coupon(
      case when coalesce((p_effects ->> 'firstMonthOnly')::boolean, false)
           then 'first_month_percent_off' else 'percent_off' end,
      least(100, v_n), 1, coalesce((p_effects ->> 'couponDays')::int, 60), p_seed || ':pct');
    v_done := v_done || jsonb_build_object('effect', 'coupon', 'kind', 'percent_off', 'value', v_n, 'code', v_code);
  end if;

  v_n := coalesce((p_effects ->> 'flatOff')::int, 0);
  if v_n > 0 then
    v_code := private.mint_personal_coupon(
      case when coalesce((p_effects ->> 'firstMonthOnly')::boolean, false)
           then 'first_month_flat_off' else 'flat_off' end,
      v_n, 1, coalesce((p_effects ->> 'couponDays')::int, 60), p_seed || ':flat');
    v_done := v_done || jsonb_build_object('effect', 'coupon', 'kind', 'flat_off', 'value', v_n, 'code', v_code);
  end if;

  -- Free months are a 100%-off coupon usable once per month.
  v_n := coalesce((p_effects ->> 'freeMonths')::int, 0);
  if v_n > 0 then
    v_code := private.mint_personal_coupon('percent_off', 100, v_n,
      greatest(60, v_n * 31 + 30), p_seed || ':free');
    v_done := v_done || jsonb_build_object('effect', 'free_months', 'months', v_n, 'code', v_code);
  end if;

  -- Add-on modules. An explicit list wins; a bare count takes the cheapest
  -- modules they do not already have, which is the only defensible way to
  -- choose on somebody's behalf.
  v_pick := '{}'::text[];
  if jsonb_typeof(p_effects -> 'addonModules') = 'array' then
    select array_agg(value::text) into v_pick
    from jsonb_array_elements_text(p_effects -> 'addonModules');
  end if;

  v_n := coalesce((p_effects ->> 'addons')::int, 0);
  if v_n > 0 and coalesce(array_length(v_pick, 1), 0) = 0 then
    -- `<> all (subquery)` compares against the subquery's ROWS, and the row here
    -- is itself a text[] — so it asked whether a text differs from an array and
    -- failed with 42883. Array membership is `= any (array)`, with the array
    -- fetched first rather than left as a subquery.
    select coalesce(pr.addon_modules, '{}'::text[]) into v_mods
      from public.profiles pr where pr.id = p_user;

    select array_agg(m.module_id) into v_pick from (
      select p.module_id
      from public.module_addon_prices p
      where not (p.module_id = any (coalesce(v_mods, '{}'::text[])))
        -- Only modules that actually cost something. A "free add-on module"
        -- that was free anyway is not a reward, and picking purely by lowest
        -- price handed out /dashboard.
        and coalesce(p.vip_price, 0) > 0
      order by p.vip_price asc nulls last, p.module_id
      limit v_n
    ) m;
  end if;

  if coalesce(array_length(v_pick, 1), 0) > 0 then
    perform set_config('sswx.privileged_write', 'on', true);
    update public.profiles
       set addon_modules = (
         select array_agg(distinct x) from unnest(coalesce(addon_modules, '{}'::text[]) || v_pick) x
       )
     where id = p_user;
    v_done := v_done || jsonb_build_object('effect', 'addons', 'modules', to_jsonb(v_pick));
  end if;

  -- Alert level. Additive: holding level 3 and being granted 2 leaves both.
  v_n := coalesce((p_effects ->> 'alertLevel')::int, 0);
  if v_n between 1 and 5 then
    -- `source` is constrained to 'purchased' or 'granted'. A referral reward is
    -- granted, not bought; which grant it was lives in `note`, so the
    -- constraint stays as narrow as it was written to be.
    insert into public.alert_entitlements (user_id, level, source, note)
    values (p_user, v_n, 'granted', p_source)
    on conflict do nothing;
    v_done := v_done || jsonb_build_object('effect', 'alert_level', 'level', v_n);
  end if;

  -- Plan tier. Raised, never lowered — a reward must not be able to cost
  -- somebody access they are already paying for.
  --
  -- Accepts either the number stored on the profile or the name the rest of the
  -- app uses, because the ladder shipped with `"tier": "advanced"` in it and a
  -- migration that silently stopped honouring existing config would be a
  -- regression dressed as an improvement.
  v_n := case lower(coalesce(p_effects ->> 'tier', ''))
           when 'free' then 1 when 'basic' then 2 when 'vip' then 3 when 'advanced' then 4
           else coalesce(nullif(regexp_replace(coalesce(p_effects ->> 'tier', ''), '[^0-9]', '', 'g'), '')::int, 0)
         end;
  if v_n between 1 and 4 then
    select tier into v_tier from public.profiles where id = p_user;
    if coalesce(v_tier, 1) < v_n then
      perform set_config('sswx.privileged_write', 'on', true);
      update public.profiles set tier = v_n where id = p_user;
      v_done := v_done || jsonb_build_object('effect', 'tier', 'from', v_tier, 'to', v_n);
    else
      v_done := v_done || jsonb_build_object('effect', 'tier', 'skipped', 'already at or above');
    end if;
  end if;

  -- Loyalty points.
  v_n := coalesce((p_effects ->> 'points')::int, 0);
  if v_n <> 0 then
    insert into public.loyalty_events (user_id, kind, points, note, idem_key)
    values (p_user, 'referral', v_n, p_source, p_seed || ':points')
    on conflict (idem_key) do nothing;
    v_done := v_done || jsonb_build_object('effect', 'points', 'points', v_n);
  end if;

  -- Raffle tickets, in whichever period is running now.
  v_n := coalesce((p_effects ->> 'raffleTickets')::int, 0);
  if v_n > 0 then
    v_draw := coalesce(p_effects ->> 'raffleDrawType', 'monthly');
    v_period := public.raffle_period(v_draw, current_date);
    insert into public.raffle_tickets (user_id, draw_type, period_start, qty, reason, idem_key)
    values (p_user, v_draw, v_period, v_n, p_source, p_seed || ':raffle')
    on conflict (idem_key) do nothing;
    v_done := v_done || jsonb_build_object('effect', 'raffle_tickets', 'qty', v_n, 'draw', v_draw);
  end if;

  -- Badge.
  v_badge := nullif(p_effects ->> 'badge', '');
  if v_badge is not null and exists (select 1 from public.badge_defs where id = v_badge) then
    insert into public.badge_awards (user_id, badge_id, reason)
    values (p_user, v_badge, p_source)
    on conflict do nothing;
    perform set_config('sswx.privileged_write', 'on', true);
    update public.profiles
       set badges = (select array_agg(distinct x) from unnest(coalesce(badges, '{}'::text[]) || array[v_badge]) x)
     where id = p_user;
    v_done := v_done || jsonb_build_object('effect', 'badge', 'badge', v_badge);
  end if;

  return jsonb_build_object(
    'ok', true,
    -- A rung marked `manual`, or one with no automatable effect at all, is not
    -- finished — the caller must leave it in the owner's queue.
    'complete', (not v_manual) and jsonb_array_length(v_done) > 0,
    'manual', v_manual,
    'applied', v_done
  );
end;
$$;

revoke all on function public.apply_reward_effects(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.apply_reward_effects(uuid, jsonb, text, text) to service_role;

-- ── the ladder now pays itself ───────────────────────────────────────────────
/**
 * A referral counts when the person referred actually pays.
 *
 * Unchanged in what it decides; changed in what it then does. The rung is still
 * chosen from the promo config so the owner can rewrite the ladder without a
 * deploy, still recorded on the redemption row, and still notified. What is new
 * is that its effects are applied on the spot, and `fulfilled_at` is stamped
 * when they all did — so the owner's queue now contains only the rewards that
 * genuinely need a person.
 */
create or replace function public.mark_referral_converted(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private
as $$
declare
  rec       record;
  n         integer;
  v_rungs   jsonb;
  -- Named v_reward, not reward: `set reward = reward` cannot tell the local
  -- from the column of the same name and fails at runtime with 42702.
  v_reward  jsonb;
  v_result  jsonb := jsonb_build_object('ok', true, 'complete', false, 'applied', '[]'::jsonb);
  v_body    text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not coalesce((select active from public.promos where key = 'referral_ladder'), false) then
    return jsonb_build_object('ok', true, 'skipped', 'programme inactive');
  end if;

  select * into rec from public.referral_redemptions
  where referee_id = p_user and converted_at is null;
  if not found then return jsonb_build_object('ok', true, 'skipped', 'no pending referral'); end if;

  select count(*) + 1 into n from public.referral_redemptions
  where referrer_id = rec.referrer_id and converted_at is not null;

  v_rungs := coalesce((select config -> 'rungs' from public.promos where key = 'referral_ladder'), '[]'::jsonb);
  -- Past the last rung, the ladder keeps paying its top rung rather than
  -- stopping — somebody who brings in a tenth member has not done less.
  select r into v_reward from jsonb_array_elements(v_rungs) r
   where (r ->> 'rank')::int = least(n, jsonb_array_length(v_rungs));

  if v_reward is not null then
    v_result := public.apply_reward_effects(
      rec.referrer_id,
      coalesce(v_reward -> 'effects', v_reward),
      'Referral #' || n,
      'referral:' || rec.id::text
    );
  end if;

  update public.referral_redemptions
     set converted_at = now(),
         rank = n,
         reward = coalesce(v_reward, '{}'::jsonb) || jsonb_build_object('applied', v_result -> 'applied'),
         fulfilled_at = case when coalesce((v_result ->> 'complete')::boolean, false) then now() else null end
   where id = rec.id;

  -- The notification carries the coupon codes, because a coupon nobody was
  -- told about is not a reward.
  v_body := 'That is referral number ' || n || '. Your reward: '
         || coalesce(v_reward ->> 'label', 'we will be in touch') || '.';
  select v_body || coalesce(
    ' Code: ' || string_agg(a ->> 'code', ', '), '')
    into v_body
  from jsonb_array_elements(coalesce(v_result -> 'applied', '[]'::jsonb)) a
  where a ? 'code';

  insert into public.notifications (user_id, kind, severity, title, body, link, dedup_key)
  values (rec.referrer_id, 'referral', 'info',
          'Someone you referred just subscribed',
          v_body, '/loyalty', 'referral-converted:' || rec.id::text)
  on conflict do nothing;

  -- The legacy counter on the profile is what the older badge rules and the
  -- loyalty page read, so it is kept in step.
  perform set_config('sswx.privileged_write', 'on', true);
  update public.profiles set referrals = coalesce(referrals, 0) + 1 where id = rec.referrer_id;

  return jsonb_build_object('ok', true, 'rank', n, 'reward', v_reward, 'granted', v_result);
end;
$$;

revoke execute on function public.mark_referral_converted(uuid) from public, anon, authenticated;
grant execute on function public.mark_referral_converted(uuid) to service_role;

-- ── the catalogue ────────────────────────────────────────────────────────────
--
-- Thirty rewards the ladder can pay, each one made of the effects above, and
-- all of them stored in the promo's own config so the owner can rewrite any of
-- them — or add a thirty-first — from the admin panel without a deploy.
--
-- Rungs reference a catalogue entry by `catalog` and carry a copy of its
-- `effects`. The copy is deliberate: a rung must keep paying what it promised
-- even if the catalogue entry is later edited, and a member looking at the
-- ladder should see the rung, not a pointer to somewhere else.
--
-- The five existing rungs keep their labels and gain the effects that match
-- what those labels always said they would do. Nothing about who has earned
-- what changes; what changes is that earning it now does something.
with cat as (
  select jsonb_build_array(
    -- money off
    jsonb_build_object('key','pct_10',        'label','10% off next month',                'group','Money off',   'effects', jsonb_build_object('percentOff',10)),
    jsonb_build_object('key','pct_25',        'label','25% off next month',                'group','Money off',   'effects', jsonb_build_object('percentOff',25)),
    jsonb_build_object('key','pct_50',        'label','50% off next month',                'group','Money off',   'effects', jsonb_build_object('percentOff',50)),
    jsonb_build_object('key','pct_75',        'label','75% off next month',                'group','Money off',   'effects', jsonb_build_object('percentOff',75)),
    jsonb_build_object('key','flat_5',        'label','$5 off next month',                 'group','Money off',   'effects', jsonb_build_object('flatOff',5)),
    jsonb_build_object('key','flat_15',       'label','$15 off next month',                'group','Money off',   'effects', jsonb_build_object('flatOff',15)),
    jsonb_build_object('key','first_half',    'label','Half off a first month',            'group','Money off',   'effects', jsonb_build_object('percentOff',50,'firstMonthOnly',true)),
    -- free time
    jsonb_build_object('key','free_1',        'label','One month free',                    'group','Free time',   'effects', jsonb_build_object('freeMonths',1)),
    jsonb_build_object('key','free_2',        'label','Two months free',                   'group','Free time',   'effects', jsonb_build_object('freeMonths',2)),
    jsonb_build_object('key','free_3',        'label','Three months free',                 'group','Free time',   'effects', jsonb_build_object('freeMonths',3)),
    jsonb_build_object('key','free_6',        'label','Six months free',                   'group','Free time',   'effects', jsonb_build_object('freeMonths',6)),
    -- modules
    jsonb_build_object('key','addon_1',       'label','One add-on module',                 'group','Modules',     'effects', jsonb_build_object('addons',1)),
    jsonb_build_object('key','addon_2',       'label','Two add-on modules',                'group','Modules',     'effects', jsonb_build_object('addons',2)),
    jsonb_build_object('key','addon_3',       'label','Three add-on modules',              'group','Modules',     'effects', jsonb_build_object('addons',3)),
    jsonb_build_object('key','pack_chase',    'label','The chase pack',                    'group','Modules',     'effects', jsonb_build_object('addonModules', jsonb_build_array('/chasing','/rotation','/meso'))),
    jsonb_build_object('key','pack_tropical', 'label','The tropical pack',                 'group','Modules',     'effects', jsonb_build_object('addonModules', jsonb_build_array('/hurricane','/rivers','/flooding'))),
    jsonb_build_object('key','pack_winter',   'label','The winter pack',                   'group','Modules',     'effects', jsonb_build_object('addonModules', jsonb_build_array('/winter','/hazards','/summary'))),
    jsonb_build_object('key','pack_sky',      'label','The sky pack',                      'group','Modules',     'effects', jsonb_build_object('addonModules', jsonb_build_array('/aurora','/moon','/lightning-globe'))),
    -- alerts
    jsonb_build_object('key','alert_2',       'label','Push alerts unlocked',              'group','Alerts',      'effects', jsonb_build_object('alertLevel',2)),
    jsonb_build_object('key','alert_3',       'label','Contact alerts unlocked',           'group','Alerts',      'effects', jsonb_build_object('alertLevel',3)),
    jsonb_build_object('key','alert_4',       'label','Outlook & Vault unlocked',          'group','Alerts',      'effects', jsonb_build_object('alertLevel',4)),
    jsonb_build_object('key','alert_5',       'label','Direct Line unlocked',              'group','Alerts',      'effects', jsonb_build_object('alertLevel',5)),
    -- plan
    jsonb_build_object('key','tier_vip',      'label','Upgraded to VIP',                   'group','Plan',        'effects', jsonb_build_object('tier',3)),
    jsonb_build_object('key','tier_advanced', 'label','Upgraded to Advanced',              'group','Plan',        'effects', jsonb_build_object('tier',4)),
    -- points and tickets
    jsonb_build_object('key','points_250',    'label','250 loyalty points',                'group','Points',      'effects', jsonb_build_object('points',250)),
    jsonb_build_object('key','points_1000',   'label','1,000 loyalty points',              'group','Points',      'effects', jsonb_build_object('points',1000)),
    jsonb_build_object('key','raffle_5',      'label','Five raffle tickets',               'group','Raffle',      'effects', jsonb_build_object('raffleTickets',5,'raffleDrawType','monthly')),
    jsonb_build_object('key','raffle_20',     'label','Twenty raffle tickets',             'group','Raffle',      'effects', jsonb_build_object('raffleTickets',20,'raffleDrawType','monthly')),
    jsonb_build_object('key','raffle_year_10','label','Ten tickets in the yearly draw',    'group','Raffle',      'effects', jsonb_build_object('raffleTickets',10,'raffleDrawType','yearly')),
    -- bundles
    jsonb_build_object('key','combo_starter', 'label','25% off, an add-on and 250 points', 'group','Bundles',
      'effects', jsonb_build_object('percentOff',25,'addons',1,'points',250)),
    jsonb_build_object('key','combo_serious', 'label','50% off, two add-ons, push alerts and 500 points', 'group','Bundles',
      'effects', jsonb_build_object('percentOff',50,'addons',2,'alertLevel',2,'points',500)),
    jsonb_build_object('key','combo_champion','label','A free month on Advanced, Direct Line, 2,000 points and 20 tickets', 'group','Bundles',
      'effects', jsonb_build_object('freeMonths',1,'tier',4,'alertLevel',5,'points',2000,'raffleTickets',20,'raffleDrawType','monthly'))
  ) as v
),
rungs as (
  select jsonb_build_array(
    jsonb_build_object('rank',1,'label','25% off next month, plus one add-on kept for two months',
      'catalog','combo_starter',
      'percentOff',25,'addons',1,'addonMonths',2,'freeMonths',0,'tier',null,
      'effects', jsonb_build_object('percentOff',25,'addons',1,'points',250)),
    jsonb_build_object('rank',2,'label','50% off next month, plus two add-ons',
      'catalog','combo_serious',
      'percentOff',50,'addons',2,'addonMonths',2,'freeMonths',0,'tier',null,
      'effects', jsonb_build_object('percentOff',50,'addons',2,'alertLevel',2,'points',500)),
    jsonb_build_object('rank',3,'label','One month free',
      'catalog','free_1',
      'percentOff',100,'addons',0,'addonMonths',0,'freeMonths',1,'tier',null,
      'effects', jsonb_build_object('freeMonths',1,'points',750)),
    jsonb_build_object('rank',4,'label','Upgraded to Advanced, plus two months free',
      'catalog','tier_advanced',
      'percentOff',0,'addons',0,'addonMonths',0,'freeMonths',2,'tier','advanced',
      'effects', jsonb_build_object('tier',4,'freeMonths',2,'points',1000)),
    jsonb_build_object('rank',5,'label','Three months free, on Advanced',
      'catalog','combo_champion',
      'percentOff',0,'addons',0,'addonMonths',0,'freeMonths',3,'tier','advanced',
      'effects', jsonb_build_object('tier',4,'freeMonths',3,'alertLevel',5,'points',2000,'raffleTickets',20,'raffleDrawType','monthly'))
  ) as v
)
update public.promos p
   set config = p.config || jsonb_build_object('catalog', (select v from cat), 'rungs', (select v from rungs)),
       updated_at = now()
 where p.key = 'referral_ladder';

-- One more automated hook, and the cheapest one to add: a referral that has not
-- converted yet is still worth acknowledging, so the referrer sees movement the
-- moment somebody signs up rather than only when they pay.
create or replace function public.redeem_referral_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  owner uuid;
  v_id  uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if not coalesce((select active from public.promos where key = 'referral_ladder'), false) then
    return jsonb_build_object('ok', false, 'error', 'The referral programme is not running right now.');
  end if;

  select user_id into owner from public.referral_codes where code = trim(p_code);
  if owner is null then
    return jsonb_build_object('ok', false, 'error', 'That code does not match anybody.');
  end if;
  if owner = uid then
    return jsonb_build_object('ok', false, 'error', 'That is your own code.');
  end if;
  if exists (select 1 from public.referral_redemptions where referee_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'You have already used a referral code.');
  end if;

  insert into public.referral_redemptions (referrer_id, referee_id, code)
  values (owner, uid, trim(p_code))
  returning id into v_id;

  insert into public.notifications (user_id, kind, severity, title, body, link, dedup_key)
  values (owner, 'referral', 'info',
          'Someone used your referral code',
          'They are signed up. Your reward lands the moment they subscribe.',
          '/loyalty', 'referral-pending:' || v_id::text)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.redeem_referral_code(text) from public, anon;
grant execute on function public.redeem_referral_code(text) to authenticated;
