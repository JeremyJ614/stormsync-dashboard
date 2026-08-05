# VIP Forecasts and Alerts — StormSync Media

A premium severe weather intelligence platform. Currently features the **Weather History** module — an interactive map for exploring past tornado tracks, damage surveys, and NWS warning polygons.

## Run & Operate

- `pnpm --filter @workspace/weather-history run dev` — run the Weather History frontend (served at `/`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, path `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS (dark mode)
- Map: MapLibre GL JS with CARTO dark basemap (no API key required)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/weather-history/` — Weather History React+Vite frontend (served at `/`)
- `artifacts/weather-history/src/components/WeatherHistoryMap.tsx` — main map component (MapLibre, IEM, NOAA DAT APIs)
- `artifacts/api-server/` — Express API server (served at `/api`)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle DB schema

## Product

**Weather History Module** — Explore past tornado tracks, damage surveys, and NWS warning records on an interactive dark-mode map.

- **TORNADO HISTORY mode**: Fetches tornado tracks, damage points, and damage areas from NOAA Damage Assessment Toolkit (DAT) API. Color-coded by EF rating (EF0=green → EF5=purple).
- **WARNING HISTORY mode**: Fetches NWS warning polygons from Iowa Environmental Mesonet (IEM) GeoJSON API. Color-coded by phenomenon (Tornado=red, Severe T-Store=yellow, etc.).
- Date range picker with quick-select buttons (7D, 30D, 90D, 6M, 1Y, 2Y–5Y, and year shortcuts 2021–2026).
- Layer toggles for Tornado Tracks, Damage Points, Damage Areas.
- Warning type filter: All Warnings / Tornado Warnings / Severe T-Store.
- Feature count badge, click-to-popup popups with event details.

## Architecture decisions

- **MapLibre GL JS** chosen over Mapbox GL JS — free, no API key required, identical API surface.
- **CARTO dark basemap** (`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`) — free, no token needed.
- **IEM GeoJSON API** for NWS warning polygon history (past year covered).
- **NOAA DAT ArcGIS FeatureServer** for tornado tracks (FeatureServer/1), damage points (FeatureServer/0), and damage areas (FeatureServer/2).
- Layers are added/removed imperatively via MapLibre sources — React state drives data fetch, map handles rendering.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- MapLibre GL JS requires WebGL2. The Replit in-editor preview sandbox does not support WebGL2, so the map area appears blank there. It works correctly in any modern desktop browser.
- IEM API date format: ISO 8601 (`2026-07-29T00:00:00Z`). NOAA DAT format: `YYYY-MM-DD HH:mm:ss`.
- NOAA DAT queries can be slow / large for multi-year date ranges — the UI shows a "large dataset" warning.
- Do not run `pnpm dev` or `pnpm run dev` at the workspace root — use workflows or `--filter` flags.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
