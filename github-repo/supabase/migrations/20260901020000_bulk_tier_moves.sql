-- Moving people between tiers, several at a time.
--
-- `admin_set_user_tier` handles one person and always rewrites their modules to
-- the tier's defaults. That is right for a sale and wrong for a correction: an
-- admin who hand-picked somebody's modules and then nudges their tier should not
-- silently lose the picks. And doing thirty of them meant thirty round trips,
-- any of which could fail halfway and leave the set half-moved.
--
-- One call, one transaction, and a switch for whether the modules follow.

create or replace function public.admin_bulk_set_tier(
  p_ids uuid[],
  p_tier integer,
  p_keep_modules boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_n integer;
begin
  if not private.is_admin() then
    raise exception 'admin only';
  end if;
  if p_tier < 1 or p_tier > 4 then
    raise exception 'invalid tier %', p_tier;
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  perform set_config('sswx.privileged_write', 'on', true);

  if p_keep_modules then
    -- The tier's own modules are added, never removed: raising somebody's tier
    -- should not be able to take away a module they already had.
    update public.profiles p
       set tier = p_tier,
           enabled_modules = (
             select coalesce(array_agg(distinct m), '{}'::text[])
             from unnest(coalesce(p.enabled_modules, '{}'::text[]) || private.modules_for_tier(p_tier)) as m
           )
     where p.id = any(p_ids);
  else
    update public.profiles p
       set tier = p_tier,
           enabled_modules = private.modules_for_tier(p_tier)
     where p.id = any(p_ids);
  end if;

  get diagnostics v_n = row_count;
  perform set_config('sswx.privileged_write', 'off', true);
  return v_n;
end;
$$;

revoke all on function public.admin_bulk_set_tier(uuid[], integer, boolean) from public, anon;
grant execute on function public.admin_bulk_set_tier(uuid[], integer, boolean) to authenticated;
