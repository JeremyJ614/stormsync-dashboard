-- StormSync VIP — coupon codes could not be checked from the browser at all.
--
-- 20260903130000 added `validate_coupon(p_code, p_tier, p_user default null)`
-- so a code minted as somebody's raffle prize could be recognised as theirs.
-- It did not remove the two-argument version it was replacing, and both remain
-- callable, so a PostgREST call carrying only p_code and p_tier — which is
-- exactly what `checkCoupon` in `src/lib/plans.ts` sends — matches both and is
-- refused before it reaches either:
--
--   300 PGRST203: Could not choose the best candidate function between
--     public.validate_coupon(p_code => text, p_tier => text),
--     public.validate_coupon(p_code => text, p_tier => text, p_user => uuid)
--
-- Every coupon typed into the Plans page has been failing on that since. The
-- edge function was unaffected — it passes all three arguments, so it resolves
-- — which is why checkout kept working and only the UI was broken.
--
-- Dropping the old signature rather than renaming the new one: `p_user` has a
-- default, so the three-argument form answers a two-argument call correctly on
-- its own, and it handles a null p_user the right way already — an owned code
-- is refused rather than quietly honoured, so a prize code pasted into a group
-- chat is no use to a signed-out stranger.
drop function if exists public.validate_coupon(text, text);

-- Re-assert the surviving function's grants: `drop function` cannot touch them,
-- but stating them here means this file describes the whole end state. anon
-- keeps it because the Plans page supports signing up while signed out.
revoke execute on function public.validate_coupon(text, text, uuid) from public;
grant  execute on function public.validate_coupon(text, text, uuid) to anon, authenticated, service_role;

select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as remaining
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'validate_coupon';
