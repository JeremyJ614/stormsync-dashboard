/**
 * Fall colour, from the national phenology record.
 *
 * There is no federal fall-foliage forecast. The maps that circulate every
 * September are commercial and modelled, and this module will not reproduce one
 * — what it shows instead is the observational record: the USA National
 * Phenology Network's `getSiteLevelData`, which reports, for each monitored
 * site and species, the date the *first* coloured leaves or needles were
 * recorded this season.
 *
 * First-colour is the right signal for a foliage report. The alternative — every
 * standing observation of colour — is an order of magnitude more data (a
 * megabyte a week against forty kilobytes for the whole season) and answers a
 * duller question, because a site that turned in August is still reporting
 * colour in November. What a person wants to know is where the turn has reached,
 * and that is an onset date.
 */

const NPN = "https://services.usanpn.org/npn_portal/observations/getSiteLevelData.json";

/** 498 Colored leaves; 499 Colored needles. */
const LEAVES = 498;
const NEEDLES = 499;

export interface FoliageSite {
  id: string;
  lat: number;
  lon: number;
  state: string;
  species: string;
  needles: boolean;
  /** Onset, as a calendar date. */
  date: string;
  doy: number;
  daysAgo: number;
}

export interface FoliageState {
  state: string;
  sites: number;
  species: number;
  /** Median onset across the state's sites. */
  medianDate: string;
  medianDoy: number;
  /** Days since that median onset, for tinting. */
  medianDaysAgo: number;
  firstDate: string;
  /** Sites whose first colour was recorded in the last fortnight. */
  recent: number;
}

export interface FoliageWeek {
  start: string;
  label: string;
  sites: number;
}

export interface FoliageReport {
  seasonStart: string;
  seasonEnd: string;
  /** False when the current date is outside a fall season and the last one is shown. */
  current: boolean;
  seasonLabel: string;
  sites: FoliageSite[];
  states: FoliageState[];
  species: { name: string; sites: number }[];
  weeks: FoliageWeek[];
  total: number;
  statesReporting: number;
}

interface Row {
  site_id: number;
  latitude: number;
  longitude: number;
  state: string;
  common_name: string;
  phenophase_id: number;
  mean_first_yes_year: number;
  mean_first_yes_doy: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MS_DAY = 86_400_000;

/**
 * Which fall the report is about.
 *
 * August through February is the season in progress (the record runs on past
 * the last leaf, and a January visitor is still interested in the autumn just
 * gone). March through July there is no fall to report, so the last completed
 * one is shown and said to be.
 */
export function foliageSeason(now = new Date()): { start: string; end: string; current: boolean; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  if (m >= 7) return { start: `${y}-08-01`, end: iso(now), current: true, label: `${y}` };
  if (m <= 1) return { start: `${y - 1}-08-01`, end: iso(now), current: true, label: `${y - 1}` };
  return { start: `${y - 1}-08-01`, end: `${y - 1}-12-31`, current: false, label: `${y - 1}` };
}

function dateFromDoy(year: number, doy: number): Date {
  return new Date(Date.UTC(year, 0, doy));
}

function median(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

export async function loadFoliage(now = new Date()): Promise<FoliageReport> {
  const season = foliageSeason(now);
  const url = `${NPN}?start_date=${season.start}&end_date=${season.end}`
    + `&request_src=sswx&phenophase_id%5B0%5D=${LEAVES}&phenophase_id%5B1%5D=${NEEDLES}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} from the phenology network`);
  const rows = await r.json() as Row[];

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const sites: FoliageSite[] = [];
  for (const row of rows) {
    const doy = Number(row.mean_first_yes_doy);
    const year = Number(row.mean_first_yes_year);
    // -9999 is the network's null. A record with no onset date is a site that
    // reported only "no colour", and has nothing to say here.
    if (!Number.isFinite(doy) || doy <= 0 || year <= 0) continue;
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue;
    const when = dateFromDoy(year, doy);
    sites.push({
      id: `${row.site_id}-${row.common_name}-${row.phenophase_id}`,
      lat: row.latitude,
      lon: row.longitude,
      state: row.state && row.state !== "-9999" ? row.state : "",
      species: row.common_name || "unidentified",
      needles: Number(row.phenophase_id) === NEEDLES,
      date: iso(when),
      doy,
      daysAgo: Math.max(0, Math.round((today - when.getTime()) / MS_DAY)),
    });
  }
  sites.sort((a, b) => b.doy - a.doy);

  // ── by state ──────────────────────────────────────────────────────────────
  const byState = new Map<string, FoliageSite[]>();
  for (const s of sites) {
    if (!s.state) continue;
    const got = byState.get(s.state);
    if (got) got.push(s); else byState.set(s.state, [s]);
  }
  const states: FoliageState[] = [...byState.entries()].map(([state, ss]) => {
    const doys = ss.map((s) => s.doy);
    const med = median(doys);
    const first = Math.min(...doys);
    const year = Number(rows[0]?.mean_first_yes_year) || now.getUTCFullYear();
    return {
      state,
      sites: ss.length,
      species: new Set(ss.map((s) => s.species)).size,
      medianDoy: med,
      medianDate: shortDate(dateFromDoy(year, med)),
      medianDaysAgo: Math.max(0, Math.round((today - dateFromDoy(year, med).getTime()) / MS_DAY)),
      firstDate: shortDate(dateFromDoy(year, first)),
      recent: ss.filter((s) => s.daysAgo <= 14).length,
    };
  }).sort((a, b) => b.sites - a.sites || a.medianDoy - b.medianDoy);

  // ── by species ────────────────────────────────────────────────────────────
  const bySpecies = new Map<string, number>();
  for (const s of sites) bySpecies.set(s.species, (bySpecies.get(s.species) ?? 0) + 1);
  const species = [...bySpecies.entries()]
    .map(([name, n]) => ({ name, sites: n }))
    .sort((a, b) => b.sites - a.sites)
    .slice(0, 8);

  // ── onset by week ─────────────────────────────────────────────────────────
  // Bins are seven days from the season's own start rather than calendar weeks,
  // so the first bar is never a stub.
  const start = new Date(`${season.start}T00:00:00Z`).getTime();
  const bins = new Map<number, number>();
  for (const s of sites) {
    const t = new Date(`${s.date}T00:00:00Z`).getTime();
    const b = Math.max(0, Math.floor((t - start) / (7 * MS_DAY)));
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const lastBin = bins.size ? Math.max(...bins.keys()) : 0;
  const weeks: FoliageWeek[] = [];
  for (let b = 0; b <= lastBin; b++) {
    const from = new Date(start + b * 7 * MS_DAY);
    weeks.push({ start: iso(from), label: shortDate(from), sites: bins.get(b) ?? 0 });
  }

  return {
    seasonStart: season.start,
    seasonEnd: season.end,
    current: season.current,
    seasonLabel: season.label,
    sites,
    states,
    species,
    weeks,
    total: sites.length,
    statesReporting: states.length,
  };
}

/**
 * Onset age to a leaf colour.
 *
 * Green where nothing has turned, through the yellows and oranges of a site
 * that turned a few weeks ago, to the deep red of the earliest. The ramp is
 * continuous so the map reads as a progression rather than as four classes.
 */
export function leafColour(daysAgo: number): string {
  const t = Math.max(0, Math.min(1, daysAgo / 42));
  // 74° (yellow-green) → 8° (deep red), darkening as it goes.
  const h = 74 - t * 66;
  const s = 62 + t * 26;
  const l = 58 - t * 16;
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}
