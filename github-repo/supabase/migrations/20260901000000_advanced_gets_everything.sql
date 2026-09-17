-- Advanced is "every module", as a rule rather than as a list.
--
-- `enabled_modules` is a snapshot written when somebody buys. For every other
-- tier that is correct — the list IS the product. For Advanced it silently
-- decayed: the tier the Plans page sells as "every module ever made, plus early
-- access to anything new" was showing "not in your plan" for anything shipped
-- after the purchase. Twenty-six Advanced members were sitting on between 33
-- and 39 of the 38 modules on the menu.
--
-- Three parts, so it cannot drift again:
--   1. one definition of "every module", read from the menu itself;
--   2. `modules_for_tier(4)` returns that instead of a hand-kept config list;
--   3. adding a module to the menu grants it to every Advanced member there
--      and then, rather than waiting for someone to notice.

-- ── 1. what "every module" means ─────────────────────────────────────────────
-- The menu is the source of truth. Add-on rows are unioned in so a module that
-- is sold but has not been given a menu row yet is not quietly withheld.
create or replace function private.all_module_paths()
returns text[]
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(array_agg(distinct p), '{}'::text[])
  from (
    select module_id as p from public.nav_modules where not admin_only
    union
    select module_id from public.module_addon_prices
  ) s
  where p is not null;
$$;

-- ── 2. the tier rule ─────────────────────────────────────────────────────────
create or replace function private.modules_for_tier(t int)
returns text[]
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when t >= 4 then private.all_module_paths()
    else coalesce(
      (select array(select jsonb_array_elements_text(value -> ('tier' || t::text)))
         from public.app_config where key = 'tier_modules'),
      array['/', '/faq', '/contact'])
  end;
$$;

-- ── 3. a new module reaches Advanced immediately ─────────────────────────────
create or replace function private.grant_module_to_advanced()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_path text := new.module_id;
begin
  if new.admin_only or v_path is null then return new; end if;

  -- `enabled_modules` is a protected column; this is one of the trusted writers.
  perform set_config('sswx.privileged_write', 'on', true);
  update public.profiles
     set enabled_modules = coalesce(enabled_modules, '{}'::text[]) || v_path
   where tier >= 4
     and not (v_path = any(coalesce(enabled_modules, '{}'::text[])));
  perform set_config('sswx.privileged_write', 'off', true);
  return new;
end;
$$;

drop trigger if exists nav_modules_grant_advanced on public.nav_modules;
create trigger nav_modules_grant_advanced
  after insert on public.nav_modules
  for each row execute function private.grant_module_to_advanced();

-- Un-hiding an existing module counts as adding it.
drop trigger if exists nav_modules_unhide_grant_advanced on public.nav_modules;
create trigger nav_modules_unhide_grant_advanced
  after update of admin_only on public.nav_modules
  for each row
  when (old.admin_only and not new.admin_only)
  execute function private.grant_module_to_advanced();

-- ── the repair, and the button that repeats it ───────────────────────────────
-- Kept as a callable RPC rather than a one-off: the triggers cover new modules,
-- but a module renamed by hand, or a profile edited before this shipped, still
-- wants a way back to the rule without a migration.
create or replace function public.admin_sync_advanced_modules()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_all text[] := private.all_module_paths();
  v_n integer;
begin
  if not private.is_admin() then
    raise exception 'admin only';
  end if;
  perform set_config('sswx.privileged_write', 'on', true);
  with changed as (
    update public.profiles
       set enabled_modules = (
         select coalesce(array_agg(distinct m), '{}'::text[])
         from unnest(coalesce(enabled_modules, '{}'::text[]) || v_all) as m
       )
     where tier >= 4
       and not (coalesce(enabled_modules, '{}'::text[]) @> v_all)
    returning 1
  )
  select count(*) into v_n from changed;
  perform set_config('sswx.privileged_write', 'off', true);
  return v_n;
end;
$$;

revoke all on function public.admin_sync_advanced_modules() from public, anon;
grant execute on function public.admin_sync_advanced_modules() to authenticated;

-- The same rule, reachable from outside the database. The Stripe webhook wrote
-- an Advanced member's module list from `module_addon_prices`, which is the
-- add-on price sheet and not the menu — five modules short on the day somebody
-- paid for "everything".
create or replace function public.tier_module_defaults(t integer)
returns text[]
language sql
stable
security definer
set search_path = public, private
as $$ select private.modules_for_tier(t) $$;

revoke all on function public.tier_module_defaults(integer) from public, anon;
grant execute on function public.tier_module_defaults(integer) to authenticated, service_role;
