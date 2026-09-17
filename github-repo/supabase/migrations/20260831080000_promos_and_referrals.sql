-- Promotions, in one place, each with its own switch.
--
-- There was one promo — the twenty-five free Advanced spots — living in its own
-- single-row table, and nothing else. Three more were asked for, and three more
-- bespoke tables would have been three more places to look for "is this on?".
-- So promos become rows: a key, a label, a switch, and whatever configuration
-- that particular offer needs, as jsonb. The existing counter moves in with the
-- rest and keeps its numbers.
--
-- All three new promos are seeded INACTIVE. They are built, they are wired up,
-- and nothing happens until somebody turns them on.

create table if not exists public.promos (
  key        text primary key,
  label      text not null,
  blurb      text,
  active     boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.promos enable row level security;

-- Members have to be able to see what is on offer; nothing here is sensitive.
drop policy if exists promos_read on public.promos;
create policy promos_read on public.promos for select using (true);

drop policy if exists promos_admin on public.promos;
create policy promos_admin on public.promos
  for all using (private.is_admin()) with check (private.is_admin());

insert into public.promos (key, label, blurb, active, config) values
  ('free_advanced_25',
   'Free Advanced spots',
   'A fixed number of new members get Advanced for nothing. The signup page reads the counter live and switches to the "spots are gone" message on its own.',
   coalesce((select active from public.promo_counter where id), true),
   jsonb_build_object(
     'claimed', coalesce((select claimed from public.promo_counter where id), 0),
     'total',   coalesce((select total   from public.promo_counter where id), 25))),

  ('addon_duo',
   'Two add-ons, half off next month',
   'Buy two paid add-on modules in the same month and next month is 50% off. Issued as a single-use coupon on the member''s account.',
   false,
   jsonb_build_object('addonsRequired', 2, 'percentOff', 50)),

  ('paid_25',
   'Next 25 paid signups',
   'The next twenty-five people to buy any paid tier get three extra add-on modules and one alert-tier upgrade on the house.',
   false,
   jsonb_build_object('claimed', 0, 'total', 25, 'extraAddons', 3, 'alertLevelUp', 1)),

  ('referral_ladder',
   'Referral programme',
   'Every member gets a five-digit code. Rewards escalate with each referral who goes on to pay.',
   false,
   jsonb_build_object('rungs', jsonb_build_array(
     jsonb_build_object('rank', 1, 'label', '25% off next month, plus one add-on kept for two months',
                        'percentOff', 25, 'addons', 1, 'addonMonths', 2, 'freeMonths', 0, 'tier', null),
     jsonb_build_object('rank', 2, 'label', '50% off next month, plus two add-ons',
                        'percentOff', 50, 'addons', 2, 'addonMonths', 2, 'freeMonths', 0, 'tier', null),
     jsonb_build_object('rank', 3, 'label', 'One month free',
                        'percentOff', 100, 'addons', 0, 'addonMonths', 0, 'freeMonths', 1, 'tier', null),
     jsonb_build_object('rank', 4, 'label', 'Upgraded to Advanced, plus two months free',
                        'percentOff', 0, 'addons', 0, 'addonMonths', 0, 'freeMonths', 2, 'tier', 'advanced'),
     jsonb_build_object('rank', 5, 'label', 'Three months free, on Advanced',
                        'percentOff', 0, 'addons', 0, 'addonMonths', 0, 'freeMonths', 3, 'tier', 'advanced')
   )))
on conflict (key) do nothing;

-- ── referral codes ───────────────────────────────────────────────────────────
-- Five digits, as asked. Short enough to say down the phone, and the space is
-- 90,000 wide against a membership in the tens — collisions are handled by
-- retrying rather than by making the code longer than it needs to be.
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text unique not null check (code ~ '^[0-9]{5}$'),
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

-- A member reads their own. Looking a code up to redeem it goes through
-- redeem_referral_code(), never a select, so nobody can enumerate the table.
drop policy if exists referral_codes_own on public.referral_codes;
create policy referral_codes_own on public.referral_codes
  for select using (private.is_admin() or user_id = auth.uid());

revoke insert, update, delete on public.referral_codes from anon, authenticated;

-- ── who referred whom ────────────────────────────────────────────────────────
create table if not exists public.referral_redemptions (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references auth.users (id) on delete cascade,
  -- One referral per person, ever. The unique constraint is the whole guard
  -- against somebody being "referred" repeatedly to farm the ladder.
  referee_id   uuid not null unique references auth.users (id) on delete cascade,
  code         text not null,
  created_at   timestamptz not null default now(),
  converted_at timestamptz,
  rank         integer,
  reward       jsonb,
  fulfilled_at timestamptz,
  fulfilled_by uuid references auth.users (id) on delete set null,
  note         text,
  check (referrer_id <> referee_id)
);

create index if not exists referral_redemptions_referrer_idx
  on public.referral_redemptions (referrer_id, converted_at);

alter table public.referral_redemptions enable row level security;

drop policy if exists referral_redemptions_read on public.referral_redemptions;
create policy referral_redemptions_read on public.referral_redemptions
  for select using (private.is_admin() or referrer_id = auth.uid() or referee_id = auth.uid());

drop policy if exists referral_redemptions_admin on public.referral_redemptions;
create policy referral_redemptions_admin on public.referral_redemptions
  for all using (private.is_admin()) with check (private.is_admin());

revoke insert, update, delete on public.referral_redemptions from anon, authenticated;

-- ── my code ──────────────────────────────────────────────────────────────────
/** The caller's referral code, minted on first ask. */
create or replace function public.my_referral_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_code    text;
  candidate text;
begin
  if uid is null then return null; end if;
  select code into v_code from public.referral_codes where user_id = uid;
  if v_code is not null then return v_code; end if;

  -- Retry on collision rather than widening the code. Ten attempts against a
  -- 90,000-wide space is not going to run out.
  for i in 1..10 loop
    candidate := lpad((10000 + floor(random() * 90000))::int::text, 5, '0');
    begin
      insert into public.referral_codes (user_id, code) values (uid, candidate);
      return candidate;
    exception when unique_violation then
      -- Either the code was taken or this member already has one; check which.
      select code into v_code from public.referral_codes where user_id = uid;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  return null;
end;
$$;

revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- ── redeeming one ────────────────────────────────────────────────────────────
/**
 * "Somebody sent me."
 *
 * Deliberately a function rather than an insert: the code has to be looked up
 * to be used, and letting a client select referral_codes to find the owner
 * would let anyone enumerate every member's code. Here the lookup happens under
 * the definer's rights and only ever returns yes or no.
 */
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
  values (owner, uid, trim(p_code));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.redeem_referral_code(text) from public, anon;
grant execute on function public.redeem_referral_code(text) to authenticated;

-- ── conversion ───────────────────────────────────────────────────────────────
/**
 * A referral counts when the person referred actually pays.
 *
 * Called by the Stripe webhook under the service role — never by a client, and
 * never on signup: a referral that has not converted is worth nothing, which is
 * the whole reason the ladder is worth anything.
 *
 * The reward is the rung matching the referrer's Nth conversion, taken from the
 * promo config so the owner can rewrite the ladder without a deploy. It is
 * recorded as owed, not applied: what "50% off next month" means depends on
 * what they are paying for, and that is a decision, not an arithmetic.
 */
create or replace function public.mark_referral_converted(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  rec       record;
  n         integer;
  v_rungs   jsonb;
  -- Named v_reward, not reward: `set reward = reward` cannot tell the local
  -- from the column of the same name and fails at runtime with 42702. The badge
  -- evaluator hit the identical trap; there it was solved with
  -- `#variable_conflict use_column`, which is the wrong answer here because
  -- this function genuinely means the variable.
  v_reward  jsonb;
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

  update public.referral_redemptions
     set converted_at = now(), rank = n, reward = v_reward
   where id = rec.id;

  insert into public.notifications (user_id, kind, severity, title, body, link, dedup_key)
  values (rec.referrer_id, 'referral', 'info',
          'Someone you referred just subscribed',
          'That is referral number ' || n || '. Your reward: ' || coalesce(v_reward ->> 'label', 'we will be in touch') || '.',
          '/loyalty', 'referral-converted:' || rec.id::text)
  on conflict do nothing;

  -- The legacy counter on the profile is what the older badge rules and the
  -- loyalty page read, so it is kept in step.
  perform set_config('sswx.privileged_write', 'on', true);
  update public.profiles set referrals = coalesce(referrals, 0) + 1 where id = rec.referrer_id;

  return jsonb_build_object('ok', true, 'rank', n, 'reward', v_reward);
end;
$$;

revoke execute on function public.mark_referral_converted(uuid) from public, anon, authenticated;
-- The webhook calls this under the service role, and revoking from PUBLIC takes
-- the implicit grant away from every role — service_role included — so it needs
-- one of its own.
grant execute on function public.mark_referral_converted(uuid) to service_role;

-- ── what a member sees ───────────────────────────────────────────────────────
create or replace function public.my_referral_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_code    text;
  v_pending integer;
  v_conv    integer;
  rungs     jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false); end if;
  select code into v_code from public.referral_codes where user_id = uid;
  select count(*) filter (where converted_at is null),
         count(*) filter (where converted_at is not null)
    into v_pending, v_conv
    from public.referral_redemptions where referrer_id = uid;
  rungs := coalesce((select config -> 'rungs' from public.promos where key = 'referral_ladder'), '[]'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'active', coalesce((select active from public.promos where key = 'referral_ladder'), false),
    'code', v_code,
    'pending', v_pending,
    'converted', v_conv,
    'rungs', rungs,
    'referred_by', (select code from public.referral_redemptions where referee_id = uid),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rr.rank, 'reward', rr.reward, 'fulfilled', rr.fulfilled_at is not null)
                       order by rr.rank)
      from public.referral_redemptions rr
      where rr.referrer_id = uid and rr.converted_at is not null), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.my_referral_summary() from public, anon;
grant execute on function public.my_referral_summary() to authenticated;

-- ── what the owner sees ──────────────────────────────────────────────────────
create or replace function public.admin_referral_overview()
returns table (
  referrer_id uuid, name text, email text,
  pending bigint, converted bigint, unfulfilled bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select rr.referrer_id, p.name, p.email,
           count(*) filter (where rr.converted_at is null)::bigint,
           count(*) filter (where rr.converted_at is not null)::bigint,
           count(*) filter (where rr.converted_at is not null and rr.fulfilled_at is null)::bigint
    from public.referral_redemptions rr
    left join public.profiles p on p.id = rr.referrer_id
    group by rr.referrer_id, p.name, p.email
    order by 5 desc, 4 desc;
end;
$$;

revoke execute on function public.admin_referral_overview() from public, anon;
grant execute on function public.admin_referral_overview() to authenticated;

create or replace function public.admin_fulfil_referral(p_id uuid, p_note text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.referral_redemptions
     set fulfilled_at = now(), fulfilled_by = auth.uid(), note = coalesce(p_note, note)
   where id = p_id and converted_at is not null;
  return found;
end;
$$;

revoke execute on function public.admin_fulfil_referral(uuid, text) from public, anon;
grant execute on function public.admin_fulfil_referral(uuid, text) to authenticated;
