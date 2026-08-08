-- P-5.3 follow-up: per-report detail for the season-stats ledger.
--
-- `daily_report_counts` stored per-day COUNTS only, so "top tornado state",
-- "largest hail" and "peak wind gust" were unanswerable. SPC's storm-report
-- CSVs already carry State / Size / Speed / Location, so the Storm Engine now
-- records them per day.
--
-- Applied to the live project on 2026-08-08; kept here so the schema is
-- reproducible from the repo.

alter table public.daily_report_counts
  add column if not exists top_state           text,
  add column if not exists top_state_tornadoes integer,
  -- inches. SPC ships hail Size in HUNDREDTHS of an inch (100 = 1.00"),
  -- converted on write by the engine.
  add column if not exists max_hail_in         numeric(5,2),
  add column if not exists max_hail_place      text,
  -- knots, as reported. Many wind rows are damage-only and carry the literal
  -- string "UNK" (191 of 229 rows on 2026-08-07) - those are skipped, not zeroed.
  add column if not exists max_gust_kt         integer,
  add column if not exists max_gust_place      text,
  -- Backfill marker. Rows written before this migration have it NULL, which is
  -- how the engine finds work without re-fetching every day's CSVs every run.
  add column if not exists details_at          timestamptz;

-- Per-day {state: tornado_report_count}.
--
-- top_state alone CANNOT answer the yearly "highest tornado count by state":
-- a state that is never #1 on any single day still accumulates across a season
-- and would be undercounted. Storing the full per-day map makes the yearly
-- rollup exact.
alter table public.daily_report_counts
  add column if not exists state_tornadoes jsonb not null default '{}'::jsonb;

-- Partial index over the backfill queue only - it empties out and stays empty,
-- so indexing the whole table would be waste.
create index if not exists daily_report_counts_details_pending
  on public.daily_report_counts (report_date)
  where details_at is null;
