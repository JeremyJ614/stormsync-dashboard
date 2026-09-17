-- StormSync VIP — five functions anon had no business calling.
--
-- The replay in 20260903200000 restored every revoke the migrations already
-- declared. These five were never declared, so it could not help them, and
-- each was reachable by an unauthenticated caller.
--
-- check_emergency_pin — the worst of them. It is
--   select exists (select 1 from app_config where key='emergency_pin' and value = candidate)
-- with no check on who is asking, which makes it a PIN oracle: a four-digit
-- code is a few thousand requests, and on the other side of it is the direct
-- line meant for somebody watching a wall cloud. The comment above its caller
-- in `useAuth.ts` already states it is "granted to authenticated and not to
-- anon" — this makes that true. It stays available to members, because the
-- vault is theirs to open.
--
-- redeem_coupon — `update coupons set used_count = used_count + 1`, no caller
-- check. Anybody could have burned a code's remaining uses by calling it in a
-- loop until the coupon stopped working, without ever holding it. Its only
-- caller is the stripe-webhook edge function, which runs as service_role, so
-- it needs no browser-facing grant at all.
--
-- my_benefits and the three claim_* functions all gate on auth.uid() already,
-- so anon got nothing from them. Closed anyway: a function that is useless to
-- anon should not be callable by anon, and the next person to edit one should
-- not have the caller check be the only thing standing between a member's
-- prizes and the open internet.
--
-- NOT closed, deliberately: validate_coupon. The Plans page supports signing
-- up while signed out — `joining = !authLoading && !user` — so a prospective
-- member typing a code has no session yet. The exposure is that codes can be
-- guessed; the three-argument form already refuses a code owned by somebody
-- else, so a guessed code cannot be used to spend another member's prize.
revoke execute on function public.check_emergency_pin(text) from public, anon;
grant  execute on function public.check_emergency_pin(text) to authenticated;

revoke execute on function public.redeem_coupon(text) from public, anon, authenticated;

revoke execute on function public.my_benefits() from public, anon;
grant  execute on function public.my_benefits() to authenticated;

revoke execute on function public.claim_module_credit(uuid, text[]) from public, anon;
grant  execute on function public.claim_module_credit(uuid, text[]) to authenticated;

revoke execute on function public.claim_points_steal(uuid) from public, anon;
grant  execute on function public.claim_points_steal(uuid) to authenticated;

revoke execute on function public.claim_points_wipe(uuid) from public, anon;
grant  execute on function public.claim_points_wipe(uuid) to authenticated;

select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('check_emergency_pin', 'redeem_coupon', 'my_benefits',
                    'claim_module_credit', 'claim_points_steal', 'claim_points_wipe')
order by 1;
