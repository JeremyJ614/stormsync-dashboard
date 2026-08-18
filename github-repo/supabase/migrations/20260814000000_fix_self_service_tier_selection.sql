-- FIX: members could not select the Free tier or claim a promo spot.
--
-- protect_profile_columns() blocks any change to tier / enabled_modules unless
-- private.is_admin(). That is correct for a direct client write, but it also
-- fired for our own SECURITY DEFINER RPCs, which legitimately set those columns
-- for the member themselves. Result: "not allowed to modify protected profile
-- fields" on the Free tier button, and the same failure on the promo claim.
--
-- current_user cannot distinguish the two cases here, because the trigger is
-- itself SECURITY DEFINER owned by postgres and therefore always reports
-- 'postgres' whoever triggered it. So the trusted RPCs now raise an explicit
-- transaction-local flag that the trigger honours. It is set with is_local=true,
-- so it cannot outlive the statement's transaction, and PostgREST gives clients
-- no way to set an arbitrary GUC - only these functions can turn it on.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Raised only by our own trusted, member-facing RPCs (see below).
  if coalesce(current_setting('sswx.privileged_write', true), '') = 'on' then
    return new;
  end if;

  if not private.is_admin() then
    if new.tier is distinct from old.tier
       or new.is_admin is distinct from old.is_admin
       or new.enabled_modules is distinct from old.enabled_modules
       or new.referrals is distinct from old.referrals
       or new.badges is distinct from old.badges
       or new.joined_at is distinct from old.joined_at then
      raise exception 'not allowed to modify protected profile fields';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.self_select_free_tier(p_chosen_module text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;
  if p_chosen_module = '/warnings' then
    return jsonb_build_object('ok', false, 'error', 'Warning Center is not available on the Free tier');
  end if;
  if not exists (select 1 from public.module_addon_prices where module_id = p_chosen_module) then
    return jsonb_build_object('ok', false, 'error', 'Unknown module');
  end if;

  perform set_config('sswx.privileged_write', 'on', true);   -- transaction-local
  update public.profiles
     set tier = 1,
         enabled_modules = array[p_chosen_module],
         billing_type = 'none',
         subscription_status = 'inactive',
         addon_modules = '{}'
   where id = uid;

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.claim_free_advanced_promo()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  got boolean;
  all_modules text[];
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  select public.claim_promo_spot() into got;
  if not got then
    return jsonb_build_object('ok', false, 'error', 'All free spots have been claimed');
  end if;

  select array_agg(module_id) into all_modules from public.module_addon_prices;

  perform set_config('sswx.privileged_write', 'on', true);   -- transaction-local
  update public.profiles
     set tier = 4,
         enabled_modules = coalesce(all_modules, '{}'),
         billing_type = 'lifetime',
         subscription_status = 'active',
         addon_modules = '{}'
   where id = uid;

  return jsonb_build_object('ok', true);
end;
$function$;
