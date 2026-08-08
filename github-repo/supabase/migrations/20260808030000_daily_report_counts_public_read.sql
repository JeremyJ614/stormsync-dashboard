-- BUG FIX: "Season So Far" was permanently empty on the client.
--
-- daily_report_counts had RLS ENABLED but NOT A SINGLE POLICY. Under Postgres
-- RLS that denies everything to anon/authenticated. The Storm Engine writes via
-- the service role, which bypasses RLS, so the table filled correctly and looked
-- perfectly healthy from the SQL editor - but every browser read returned an
-- empty array with no error. Nothing was ever wrong with the data.
--
-- These are aggregate national storm-report counts derived from public SPC
-- files; there is nothing user-specific to protect. Read-only for everyone;
-- writes stay service-role only (no INSERT/UPDATE policy is granted).
create policy "daily_report_counts public read"
  on public.daily_report_counts
  for select
  using (true);
