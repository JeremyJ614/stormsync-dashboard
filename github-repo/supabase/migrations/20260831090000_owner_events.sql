-- Telling the owner what just happened.
--
-- The app can already push to a phone — that is how members get warnings — but
-- nothing pushed to the *owner*, so a signup, a message through the contact
-- form or somebody paying were all things you found out by going and looking.
--
-- The shape is a queue rather than a direct send. Postgres cannot speak Web
-- Push, and even if it could, an outbound HTTP call inside a trigger would mean
-- a slow push endpoint could hold up somebody's signup. So the events that
-- matter write a row, and an edge function drains the queue and does the
-- pushing. If the pusher is down the events wait for it rather than being lost.

create table if not exists public.owner_events (
  id             uuid primary key default gen_random_uuid(),
  category       text not null check (category in ('signup', 'contact', 'money', 'activity')),
  title          text not null,
  body           text not null,
  link           text,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  dispatched_at  timestamptz
);

create index if not exists owner_events_pending_idx
  on public.owner_events (created_at) where dispatched_at is null;

alter table public.owner_events enable row level security;

-- Only admins read this: it is a running commentary on the membership.
drop policy if exists owner_events_read on public.owner_events;
create policy owner_events_read on public.owner_events
  for select using (private.is_admin());

drop policy if exists owner_events_admin on public.owner_events;
create policy owner_events_admin on public.owner_events
  for all using (private.is_admin()) with check (private.is_admin());

revoke insert, update, delete on public.owner_events from anon, authenticated;

-- Which categories are worth waking somebody for. Public-readable like the rest
-- of app_config's non-secret keys so the admin panel can show it without a
-- round trip through an RPC.
insert into public.app_config (key, value, is_public)
values ('owner_notify',
        jsonb_build_object('signup', true, 'contact', true, 'money', true, 'activity', false),
        true)
on conflict (key) do nothing;

/**
 * Queue one event, if that category is switched on.
 *
 * Deliberately swallows its own failures: every caller is a trigger on
 * something a member was doing, and a notification that cannot be queued must
 * never be the reason a signup or a contact form fails.
 */
create or replace function private.owner_event(
  p_category text,
  p_title    text,
  p_body     text,
  p_link     text default null,
  p_detail   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  on_for_category boolean;
begin
  select coalesce((value ->> p_category)::boolean, false)
    into on_for_category
    from public.app_config where key = 'owner_notify';
  if not coalesce(on_for_category, false) then return; end if;

  insert into public.owner_events (category, title, body, link, detail)
  values (p_category, p_title, p_body, p_link, coalesce(p_detail, '{}'::jsonb));
exception when others then
  -- See the note above. Losing the ping is bad; losing the signup is worse.
  null;
end;
$$;

-- ── the events ───────────────────────────────────────────────────────────────
create or replace function public.tg_owner_event_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.owner_event(
    'signup',
    'New member',
    coalesce(new.name, 'Someone') || ' just joined' ||
      case when new.email is not null then ' (' || new.email || ')' else '' end || '.',
    '/admin',
    jsonb_build_object('user_id', new.id, 'email', new.email));
  return new;
end;
$$;

drop trigger if exists owner_event_signup on public.profiles;
create trigger owner_event_signup
  after insert on public.profiles
  for each row execute function public.tg_owner_event_signup();

create or replace function public.tg_owner_event_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.owner_event(
    'contact',
    case when new.kind = 'emergency' then 'Emergency contact' else 'New message' end,
    coalesce(new.name, 'Someone') || ': ' || left(coalesce(new.message, ''), 140),
    '/admin',
    jsonb_build_object('id', new.id, 'kind', new.kind, 'email', new.email));
  return new;
end;
$$;

drop trigger if exists owner_event_contact on public.contact_submissions;
create trigger owner_event_contact
  after insert on public.contact_submissions
  for each row execute function public.tg_owner_event_contact();

/**
 * Money.
 *
 * Fired from the profile rather than from Stripe, so it covers every route to a
 * paid tier — the webhook, an admin upgrading somebody by hand, a lifetime deal
 * — rather than only the one that happens to go through checkout. A tier that
 * goes down, or a row that changes for any other reason, is not money.
 */
create or replace function public.tg_owner_event_money()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.tier, 1) > coalesce(old.tier, 1) then
    perform private.owner_event(
      'money',
      'Someone upgraded',
      coalesce(new.name, new.email, 'A member') || ' moved from tier ' ||
        coalesce(old.tier, 1) || ' to tier ' || new.tier || '.',
      '/admin',
      jsonb_build_object('user_id', new.id, 'from', old.tier, 'to', new.tier));
  end if;
  return new;
end;
$$;

drop trigger if exists owner_event_money on public.profiles;
create trigger owner_event_money
  after update of tier on public.profiles
  for each row execute function public.tg_owner_event_money();

/** An alert level bought outright is money the tier ladder never sees. */
create or replace function public.tg_owner_event_alert_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'purchased' then
    perform private.owner_event(
      'money',
      'Alert level bought',
      coalesce((select name from public.profiles where id = new.user_id), 'A member') ||
        ' bought alert level ' || new.level || '.',
      '/admin',
      jsonb_build_object('user_id', new.user_id, 'level', new.level));
  end if;
  return new;
end;
$$;

drop trigger if exists owner_event_alert_purchase on public.alert_entitlements;
create trigger owner_event_alert_purchase
  after insert on public.alert_entitlements
  for each row execute function public.tg_owner_event_alert_purchase();

/**
 * General activity.
 *
 * Off by default, and it should stay off unless you want to feel every heartbeat
 * of the app on your phone. A member saving a location is the honest signal of
 * "somebody is actually setting this up and using it", which is what makes it
 * the right one to represent the category.
 */
create or replace function public.tg_owner_event_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.owner_event(
    'activity',
    'Member activity',
    coalesce((select name from public.profiles where id = new.user_id), 'A member') ||
      ' saved ' || coalesce(new.name, 'a location') || '.',
    '/admin',
    jsonb_build_object('user_id', new.user_id));
  return new;
end;
$$;

drop trigger if exists owner_event_activity on public.saved_locations;
create trigger owner_event_activity
  after insert on public.saved_locations
  for each row execute function public.tg_owner_event_activity();

-- ── the drain ────────────────────────────────────────────────────────────────
/** Undispatched events, oldest first, for the pusher. Service role only. */
create or replace function public.owner_events_pending(p_limit integer default 40)
returns setof public.owner_events
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and not private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select * from public.owner_events
    where dispatched_at is null
    order by created_at asc
    limit greatest(p_limit, 1);
end;
$$;

revoke execute on function public.owner_events_pending(integer) from public, anon;
grant execute on function public.owner_events_pending(integer) to authenticated, service_role;
