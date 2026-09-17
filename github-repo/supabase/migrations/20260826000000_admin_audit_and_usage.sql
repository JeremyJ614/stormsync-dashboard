-- Admin panel: audit log + module usage analytics.
--
-- Two tables the admin panel needs and the schema did not have. Both are
-- deliberately narrow: the audit log records who did what to whom, and the
-- usage table records one counter per member per module per day rather than a
-- row per page view, which keeps it bounded at members x modules x days.

-- ── audit log ────────────────────────────────────────────────────────────────
create table if not exists public.admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users (id) on delete set null,
  actor_email  text,
  action       text not null,
  target_type  text,
  target_id    text,
  target_label text,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_actor_idx   on public.admin_audit (actor_id, created_at desc);
create index if not exists admin_audit_action_idx  on public.admin_audit (action, created_at desc);
create index if not exists admin_audit_target_idx  on public.admin_audit (target_type, target_id);

alter table public.admin_audit enable row level security;

drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit
  for select using (private.is_admin());

drop policy if exists admin_audit_insert on public.admin_audit;
create policy admin_audit_insert on public.admin_audit
  for insert with check (private.is_admin() and actor_id = auth.uid());

-- There is deliberately no update or delete policy. An audit log that its own
-- subjects can edit is not an audit log; append-only is the whole property.

-- ── module usage ─────────────────────────────────────────────────────────────
create table if not exists public.module_views (
  user_id   uuid not null references auth.users (id) on delete cascade,
  module_id text not null,
  day       date not null default (now() at time zone 'utc')::date,
  views     integer not null default 0,
  last_seen timestamptz not null default now(),
  primary key (user_id, module_id, day)
);

create index if not exists module_views_day_idx    on public.module_views (day desc);
create index if not exists module_views_module_idx on public.module_views (module_id, day desc);

alter table public.module_views enable row level security;

drop policy if exists module_views_read on public.module_views;
create policy module_views_read on public.module_views
  for select using (private.is_admin() or user_id = auth.uid());

-- Writes go through record_module_view() below, never straight from a client.
revoke insert, update, delete on public.module_views from anon, authenticated;

-- ── writing a view ───────────────────────────────────────────────────────────
create or replace function public.record_module_view(p_module text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_module is null or p_module = '' then
    return;
  end if;
  insert into public.module_views (user_id, module_id, day, views, last_seen)
  values (auth.uid(), left(p_module, 120), (now() at time zone 'utc')::date, 1, now())
  on conflict (user_id, module_id, day)
  do update set views = public.module_views.views + 1, last_seen = now();
end;
$$;

revoke execute on function public.record_module_view(text) from public, anon;
grant execute on function public.record_module_view(text) to authenticated;

-- ── reading usage, aggregated server-side ────────────────────────────────────
create or replace function public.admin_module_usage(p_days integer default 30)
returns table (module_id text, views bigint, uniques bigint, last_seen timestamptz)
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
    select v.module_id,
           sum(v.views)::bigint,
           count(distinct v.user_id)::bigint,
           max(v.last_seen)
    from public.module_views v
    where v.day >= ((now() at time zone 'utc')::date - greatest(p_days, 1))
    group by v.module_id
    order by 2 desc;
end;
$$;

revoke execute on function public.admin_module_usage(integer) from public, anon;
grant execute on function public.admin_module_usage(integer) to authenticated;

create or replace function public.admin_usage_by_day(p_days integer default 30)
returns table (day date, views bigint, uniques bigint)
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
    select v.day,
           sum(v.views)::bigint,
           count(distinct v.user_id)::bigint
    from public.module_views v
    where v.day >= ((now() at time zone 'utc')::date - greatest(p_days, 1))
    group by v.day
    order by v.day;
end;
$$;

revoke execute on function public.admin_usage_by_day(integer) from public, anon;
grant execute on function public.admin_usage_by_day(integer) to authenticated;
