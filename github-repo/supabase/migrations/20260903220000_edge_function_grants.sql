-- StormSync VIP — the edge functions need their RPCs named explicitly.
--
-- Six functions the edge functions call were only ever executable because
-- EXECUTE had been left with PUBLIC, and `service_role` picked it up from
-- there. The migration that created each one revokes from PUBLIC and then
-- grants to `authenticated` — never to `service_role` — so re-asserting those
-- revokes in 20260903200000 took the edge functions' access away with them.
--
-- This is not a regression introduced by that replay so much as one it
-- exposed: applying these migrations in order to an empty database would have
-- produced exactly the same broken state. The storage sweep and the Stripe
-- webhook were relying on a grant nobody had written down.
--
-- So write it down. `service_role` is the identity the edge functions run as,
-- and these six are the RPCs they call:
--
--   next_model_map_orphans / register_model_map_orphans /
--   mark_model_map_orphans_swept / stale_model_map_objects / prune_model_runs
--     the model-map storage sweep, which is what keeps the project inside its
--     storage quota. Silently losing it would have shown up weeks later as a
--     bill rather than as an error.
--   redeem_coupon
--     called by stripe-webhook once a checkout completes. Losing it would mean
--     a coupon could be used any number of times.
--
-- Granted to service_role ONLY. None of these should be reachable from a
-- browser by anybody, admin included — they are maintenance, and the app has
-- no UI that calls them.
grant execute on function public.next_model_map_orphans(integer)        to service_role;
grant execute on function public.register_model_map_orphans(text[])     to service_role;
grant execute on function public.mark_model_map_orphans_swept(text[])   to service_role;
grant execute on function public.stale_model_map_objects(integer)       to service_role;
grant execute on function public.prune_model_runs(integer)              to service_role;
grant execute on function public.redeem_coupon(text)                    to service_role;

-- Every RPC the edge functions call, and whether the identity they run as can
-- call it. All six columns must read true.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role,
       has_function_privilege('anon', p.oid, 'EXECUTE')         as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'admin_set_user_tier', 'alert_levels_for', 'chase_year_context',
  'mark_model_map_orphans_swept', 'mark_referral_converted',
  'next_model_map_orphans', 'owner_events_pending', 'prune_model_runs',
  'prune_orphan_model_runs', 'record_push_ack', 'redeem_coupon',
  'register_model_map_orphans', 'stale_model_map_objects',
  'tier_module_defaults', 'validate_coupon')
order by 2, 1;
