-- P-6.1 billing reconciliation.
--
-- The module registry drifted from `module_addon_prices` across Phases 1-5.
-- Verified by diffing ALL_MODULES (minus alwaysOn / adminOnly / HIDDEN_MODULES)
-- against the table: 1 missing, 2 stale. After this, both sides are 28/28.
--
-- Applied to the live project on 2026-08-08.

-- 1) /skygazing was deleted in P-1.2 (merged into Aurora & Star Gazing).
--    /chasing became admin-only in P-1.3 and must never be purchasable - an
--    adminOnly module appearing in the add-on list would let a member buy
--    something they can never see.
delete from public.module_addon_prices where module_id in ('/skygazing', '/chasing');

-- 2) The Aurora merge renamed the module everywhere except in billing, where it
--    was still "Aurora Forecast".
update public.module_addon_prices
   set label = 'Aurora & Star Gazing', updated_at = now()
 where module_id = '/aurora';

-- 3) Daily Trivia (P-5.2) was new and unpriced. It shares one points ledger and
--    one leaderboard with the Forecast Game, which is free at every tier, so it
--    is priced identically - gating half of a single feature would be odd.
insert into public.module_addon_prices (module_id, label, free_price, basic_price, vip_price)
values ('/trivia', 'Daily Trivia', 0.00, 0.00, 0.00)
on conflict (module_id) do update
  set label = excluded.label, updated_at = now();
