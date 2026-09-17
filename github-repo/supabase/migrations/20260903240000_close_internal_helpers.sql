-- StormSync VIP — three internal helpers anon could still call.
--
-- Each is SECURITY DEFINER with no check on who is asking, and each is reached
-- from a browser only through a caller that does check:
--
--   claim_promo_spot         `update promo_counter set claimed = claimed + 1`.
--                            Called by claim_free_advanced_promo, which reads
--                            auth.uid() first. On its own it is a button an
--                            unauthenticated stranger could press in a loop
--                            until the free-Advanced promotion was exhausted
--                            without a single account being created.
--   pick_raffle_prize        the weighted draw itself. Called by
--                            admin_run_raffle, which gates on is_admin.
--   seal_leaderboard_period  freezes a month or a year and records its
--                            champion. Called by seal_due_leaderboards, which
--                            seals only periods that have actually ended.
--                            Reachable directly, it let anybody seal a live
--                            period early and fix the standings as they stood.
--
-- Revoking from anon AND authenticated is safe for all three: a SECURITY
-- DEFINER function runs with its owner's privileges, so the three callers
-- above keep their access no matter what the calling role holds. Verified
-- below rather than asserted — the check asks whether each function's owner
-- can still execute it.
revoke execute on function public.claim_promo_spot()                     from public, anon, authenticated;
revoke execute on function public.pick_raffle_prize(text)                from public, anon, authenticated;
revoke execute on function public.seal_leaderboard_period(text, date)    from public, anon, authenticated;

select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       pg_get_userbyid(p.proowner)                               as owner,
       has_function_privilege(pg_get_userbyid(p.proowner), p.oid, 'EXECUTE') as owner_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_promo_spot', 'pick_raffle_prize', 'seal_leaderboard_period')
order by 1;
