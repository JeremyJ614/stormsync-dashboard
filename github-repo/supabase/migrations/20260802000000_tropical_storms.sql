-- StormSync VIP — Tropical Storm History table
-- Apply via: Supabase Dashboard → SQL Editor → paste and run
-- Or: supabase db push (if using Supabase CLI)

CREATE TABLE IF NOT EXISTS public.tropical_storms (
  id                  TEXT PRIMARY KEY,            -- e.g. "AL012026"
  name                TEXT NOT NULL,               -- e.g. "Hurricane Arthur"
  year                INTEGER NOT NULL,
  basin               TEXT NOT NULL DEFAULT 'Atlantic',
  peak_intensity      TEXT,                        -- "Tropical Storm", "Category 1 Hurricane", etc.
  peak_winds          INTEGER NOT NULL DEFAULT 0,  -- knots
  last_advisory_num   TEXT,                        -- e.g. "008"
  final_status        TEXT,                        -- "PTC", "Dissipated", "Active", etc.
  track_points        JSONB NOT NULL DEFAULT '[]', -- [{lat,lon,winds_kt,pressure,timestamp,type}]
  graphics_urls       TEXT[] DEFAULT '{}',         -- NHC graphics image URLs
  final_advisory_text TEXT,
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Row level security (read-only public access)
ALTER TABLE public.tropical_storms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tropical_storms' AND policyname = 'Public read tropical storms'
  ) THEN
    CREATE POLICY "Public read tropical storms"
      ON public.tropical_storms
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- Service role can insert/update/delete (for edge function seeding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tropical_storms' AND policyname = 'Service role write tropical storms'
  ) THEN
    CREATE POLICY "Service role write tropical storms"
      ON public.tropical_storms
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END$$;

-- ── Seed: 2026 Atlantic Season ─────────────────────────────────────────────
-- Post-Tropical Cyclone Arthur (AL01 2026)
INSERT INTO public.tropical_storms (
  id, name, year, basin, peak_intensity, peak_winds,
  last_advisory_num, final_status, track_points, archived_at
) VALUES (
  'AL012026',
  'Post-Tropical Cyclone Arthur',
  2026,
  'Atlantic',
  'Tropical Storm',
  35,
  '008',
  'PTC',
  '[
    {"lat":23.5,"lon":-100.3,"winds_kt":15,"pressure":1011,"timestamp":"2026-06-15T00:00:00Z","type":"DB"},
    {"lat":24.3,"lon":-100.5,"winds_kt":15,"pressure":1011,"timestamp":"2026-06-15T06:00:00Z","type":"DB"},
    {"lat":25.0,"lon":-100.8,"winds_kt":15,"pressure":1011,"timestamp":"2026-06-15T12:00:00Z","type":"DB"},
    {"lat":25.7,"lon":-100.5,"winds_kt":15,"pressure":1011,"timestamp":"2026-06-15T18:00:00Z","type":"DB"},
    {"lat":26.3,"lon":-100.0,"winds_kt":15,"pressure":1009,"timestamp":"2026-06-16T00:00:00Z","type":"DB"},
    {"lat":26.7,"lon":-99.2,"winds_kt":20,"pressure":1007,"timestamp":"2026-06-16T06:00:00Z","type":"DB"},
    {"lat":26.9,"lon":-98.3,"winds_kt":20,"pressure":1007,"timestamp":"2026-06-16T12:00:00Z","type":"LO"},
    {"lat":27.1,"lon":-97.8,"winds_kt":25,"pressure":1005,"timestamp":"2026-06-16T18:00:00Z","type":"LO"},
    {"lat":27.4,"lon":-97.4,"winds_kt":25,"pressure":1004,"timestamp":"2026-06-17T00:00:00Z","type":"LO"},
    {"lat":27.7,"lon":-97.1,"winds_kt":30,"pressure":1003,"timestamp":"2026-06-17T06:00:00Z","type":"LO"},
    {"lat":28.4,"lon":-96.1,"winds_kt":35,"pressure":1001,"timestamp":"2026-06-17T12:00:00Z","type":"TS"},
    {"lat":28.8,"lon":-96.1,"winds_kt":40,"pressure":1001,"timestamp":"2026-06-17T18:00:00Z","type":"TS"},
    {"lat":29.4,"lon":-94.8,"winds_kt":35,"pressure":999,"timestamp":"2026-06-18T00:00:00Z","type":"TS"}
  ]'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  track_points = EXCLUDED.track_points,
  peak_winds = EXCLUDED.peak_winds;

-- Remnants of Bertha (AL02 2026)
INSERT INTO public.tropical_storms (
  id, name, year, basin, peak_intensity, peak_winds,
  last_advisory_num, final_status, track_points, archived_at
) VALUES (
  'AL022026',
  'Remnants of Bertha',
  2026,
  'Atlantic',
  'Tropical Depression',
  31,
  '019',
  'PTC',
  '[
    {"lat":25.6,"lon":-83.5,"winds_kt":20,"pressure":1018,"timestamp":"2026-07-17T12:00:00Z","type":"DB"},
    {"lat":25.8,"lon":-83.6,"winds_kt":20,"pressure":1017,"timestamp":"2026-07-17T18:00:00Z","type":"DB"},
    {"lat":26.0,"lon":-83.7,"winds_kt":20,"pressure":1016,"timestamp":"2026-07-18T00:00:00Z","type":"DB"},
    {"lat":26.2,"lon":-84.0,"winds_kt":20,"pressure":1016,"timestamp":"2026-07-18T06:00:00Z","type":"DB"},
    {"lat":26.5,"lon":-84.3,"winds_kt":20,"pressure":1015,"timestamp":"2026-07-18T12:00:00Z","type":"DB"},
    {"lat":26.8,"lon":-84.6,"winds_kt":20,"pressure":1014,"timestamp":"2026-07-18T18:00:00Z","type":"DB"},
    {"lat":27.1,"lon":-84.9,"winds_kt":20,"pressure":1014,"timestamp":"2026-07-19T00:00:00Z","type":"DB"},
    {"lat":27.5,"lon":-85.2,"winds_kt":20,"pressure":1013,"timestamp":"2026-07-19T06:00:00Z","type":"DB"},
    {"lat":27.8,"lon":-85.4,"winds_kt":25,"pressure":1010,"timestamp":"2026-07-19T12:00:00Z","type":"DB"},
    {"lat":28.1,"lon":-85.5,"winds_kt":30,"pressure":1006,"timestamp":"2026-07-20T12:00:00Z","type":"TD"},
    {"lat":28.4,"lon":-85.5,"winds_kt":30,"pressure":1005,"timestamp":"2026-07-20T18:00:00Z","type":"TD"},
    {"lat":28.5,"lon":-86.0,"winds_kt":35,"pressure":1003,"timestamp":"2026-07-21T00:00:00Z","type":"TS"},
    {"lat":28.5,"lon":-86.1,"winds_kt":45,"pressure":998,"timestamp":"2026-07-21T06:00:00Z","type":"TS"},
    {"lat":28.8,"lon":-86.2,"winds_kt":50,"pressure":996,"timestamp":"2026-07-21T12:00:00Z","type":"TS"},
    {"lat":29.3,"lon":-86.8,"winds_kt":50,"pressure":995,"timestamp":"2026-07-21T18:00:00Z","type":"TS"},
    {"lat":29.4,"lon":-87.4,"winds_kt":50,"pressure":996,"timestamp":"2026-07-22T00:00:00Z","type":"TS"},
    {"lat":29.4,"lon":-87.9,"winds_kt":45,"pressure":998,"timestamp":"2026-07-22T06:00:00Z","type":"TS"},
    {"lat":29.6,"lon":-88.5,"winds_kt":45,"pressure":998,"timestamp":"2026-07-22T12:00:00Z","type":"TS"},
    {"lat":29.9,"lon":-89.2,"winds_kt":40,"pressure":1000,"timestamp":"2026-07-22T18:00:00Z","type":"TS"},
    {"lat":29.4,"lon":-90.5,"winds_kt":40,"pressure":1002,"timestamp":"2026-07-23T00:00:00Z","type":"TS"},
    {"lat":28.9,"lon":-91.7,"winds_kt":40,"pressure":1003,"timestamp":"2026-07-23T06:00:00Z","type":"TS"},
    {"lat":29.5,"lon":-92.6,"winds_kt":40,"pressure":1003,"timestamp":"2026-07-23T12:00:00Z","type":"TS"},
    {"lat":29.8,"lon":-93.9,"winds_kt":35,"pressure":1006,"timestamp":"2026-07-23T18:00:00Z","type":"TS"},
    {"lat":30.0,"lon":-95.2,"winds_kt":30,"pressure":1008,"timestamp":"2026-07-24T00:00:00Z","type":"DB"}
  ]'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  track_points = EXCLUDED.track_points,
  peak_winds = EXCLUDED.peak_winds;
