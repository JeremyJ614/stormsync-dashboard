-- Admins can adjust the shared points ledger.
--
-- `game_points` carried a read policy and nothing else, so the Forecast Game
-- and Trivia could write through their own paths but an administrator had no
-- way to correct a score — no grant, no deduction, no fixing a bad round.
--
-- Adjustments are ordinary ledger rows (source 'admin'), never edits to an
-- existing award, so the history stays auditable.
create policy "game_points admin write"
  on public.game_points
  for all
  using (private.is_admin())
  with check (private.is_admin());
