-- Requests for a paid alert level.
--
-- Why this exists rather than a Stripe line item: the `stripe-checkout` and
-- `stripe-webhook` functions are deployed and running, but their source is not
-- in this repository, so the checkout payload cannot be extended without
-- rewriting live billing from scratch. Rather than pretend a card was charged,
-- a member asking for a paid level files a request, the admin sees it on the
-- Alerts tab, and granting it is one click.
--
-- When the checkout source is recovered this table becomes the audit trail for
-- the same flow rather than the mechanism, and nothing in the member-facing UI
-- has to change shape.
--
-- Deliberately NOT part of alert_entitlements: a row in that table confers
-- access, and a request must not.
create table if not exists public.alert_level_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  level       integer not null check (level between 1 and 5),
  -- What we quoted them, captured at request time so a later price change
  -- cannot silently move the number they agreed to.
  quoted_price numeric(10,2),
  tier_at_request integer,
  status      text not null default 'open' check (status in ('open', 'granted', 'declined', 'withdrawn')),
  note        text,
  handled_by  uuid references auth.users (id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists alert_requests_open_idx on public.alert_level_requests (status, created_at desc);
create unique index if not exists alert_requests_one_open
  on public.alert_level_requests (user_id, level) where status = 'open';

alter table public.alert_level_requests enable row level security;

drop policy if exists alert_req_read on public.alert_level_requests;
create policy alert_req_read on public.alert_level_requests
  for select using (private.is_admin() or user_id = auth.uid());

drop policy if exists alert_req_admin on public.alert_level_requests;
create policy alert_req_admin on public.alert_level_requests
  for all using (private.is_admin()) with check (private.is_admin());

revoke insert, update, delete on public.alert_level_requests from anon, authenticated;

/**
 * Ask for a level.
 *
 * The price is looked up server-side rather than taken from the caller: a
 * client that can name its own price is a client that will eventually name
 * zero. A level the member already holds is refused rather than duplicated.
 */
create or replace function public.request_alert_level(p_level integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier  integer;
  v_price numeric(10,2);
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_level < 1 or p_level > 5 then raise exception 'level must be 1-5'; end if;

  if public.has_alert_level(auth.uid(), p_level) then
    return 'already_held';
  end if;

  select coalesce(tier, 1) into v_tier from public.profiles where id = auth.uid();
  select case v_tier when 1 then free_price when 2 then basic_price when 3 then vip_price else null end
    into v_price
  from public.alert_level_prices where level = p_level;

  if v_price is null then
    -- No price on file for this tier means it is not for sale to them, which is
    -- a configuration answer, not a customer-facing error.
    return 'not_for_sale';
  end if;

  insert into public.alert_level_requests (user_id, level, quoted_price, tier_at_request)
  values (auth.uid(), p_level, v_price, v_tier)
  on conflict (user_id, level) where status = 'open' do nothing;

  return 'requested';
end;
$$;

revoke execute on function public.request_alert_level(integer) from public, anon;
grant execute on function public.request_alert_level(integer) to authenticated;

/** Withdraw one's own open request. */
create or replace function public.withdraw_alert_request(p_level integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.alert_level_requests
     set status = 'withdrawn', handled_at = now()
   where user_id = auth.uid() and level = p_level and status = 'open';
end;
$$;

revoke execute on function public.withdraw_alert_request(integer) from public, anon;
grant execute on function public.withdraw_alert_request(integer) to authenticated;

/** Approve or decline, from the admin panel. Approving grants the level. */
create or replace function public.admin_handle_alert_request(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.alert_level_requests;
begin
  if not private.is_admin() then raise exception 'admin only'; end if;

  select * into r from public.alert_level_requests where id = p_id and status = 'open';
  if not found then raise exception 'no open request with that id'; end if;

  if p_approve then
    insert into public.alert_entitlements (user_id, level, source, note, granted_by)
    values (r.user_id, r.level, 'purchased', p_note, auth.uid())
    on conflict (user_id, level) do update
      set source = 'purchased', note = excluded.note, granted_by = excluded.granted_by;
  end if;

  update public.alert_level_requests
     set status = case when p_approve then 'granted' else 'declined' end,
         note = coalesce(p_note, note), handled_by = auth.uid(), handled_at = now()
   where id = p_id;
end;
$$;

revoke execute on function public.admin_handle_alert_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_handle_alert_request(uuid, boolean, text) to authenticated;

/** Open requests, with who made them. */
create or replace function public.admin_alert_requests()
returns table (
  id uuid, user_id uuid, name text, email text, tier integer,
  level integer, quoted_price numeric, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.user_id, p.name, p.email, coalesce(p.tier, 1),
         r.level, r.quoted_price, r.created_at
  from public.alert_level_requests r
  join public.profiles p on p.id = r.user_id
  where private.is_admin() and r.status = 'open'
  order by r.created_at;
$$;

revoke execute on function public.admin_alert_requests() from public, anon;
grant execute on function public.admin_alert_requests() to authenticated;

/** The caller's own open requests, so the UI can show "asked for" state. */
create or replace function public.my_alert_requests()
returns table (level integer, quoted_price numeric, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select level, quoted_price, created_at
  from public.alert_level_requests
  where user_id = auth.uid() and status = 'open'
  order by level;
$$;

revoke execute on function public.my_alert_requests() from public, anon;
grant execute on function public.my_alert_requests() to authenticated;
