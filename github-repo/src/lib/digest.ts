/**
 * The daily brief, assembled for one member.
 *
 * Same content the push and email digest carry, rendered in the app so a member
 * can read it without waiting for a notification and can see exactly what they
 * are signing up for before they turn it on.
 *
 * Every section is built from data the app already fetches for other reasons,
 * so the card costs one extra query at most and can never disagree with the
 * module it summarises.
 */
import { supabase } from "./supabase";
import { fetchOpenMeteo, fetchNWSAlerts, type NWSAlertFeature } from "../utils/weatherApi";
import { fetchDispersal, bandOf, DISPERSAL_BAND } from "./pollen";
import { isCalmEvent } from "./calm";

export type SectionKey =
  | "conditions" | "today" | "alerts" | "severe" | "pollen" | "sun" | "pressure";

export const SECTIONS: { key: SectionKey; label: string; blurb: string }[] = [
  { key: "conditions", label: "Right now",        blurb: "Temperature, what it feels like, wind." },
  { key: "today",      label: "Today's numbers",  blurb: "High, low, and the chance of rain." },
  { key: "alerts",     label: "Active alerts",    blurb: "Anything the Weather Service has out for you." },
  { key: "severe",     label: "Severe outlook",   blurb: "Whether storms are on the table." },
  { key: "pollen",     label: "Pollen",           blurb: "How readily pollen is moving around." },
  { key: "sun",        label: "Sun times",        blurb: "Sunrise and sunset." },
  { key: "pressure",   label: "Barometer",        blurb: "Rising, steady or falling." },
];

export interface DigestSection {
  key: SectionKey;
  label: string;
  value: string;
  detail?: string;
  tone?: string;
}

export interface DigestPrefs {
  hour: number;
  sections: SectionKey[];
}

export const DEFAULT_PREFS: DigestPrefs = {
  hour: 6,
  sections: ["conditions", "today", "alerts", "severe"],
};

export async function getDigestPrefs(): Promise<DigestPrefs> {
  const { data } = await supabase
    .from("notification_prefs")
    .select("digest_hour,digest_sections")
    .maybeSingle();
  if (!data) return DEFAULT_PREFS;
  const sections = (data.digest_sections as string[] | null) ?? DEFAULT_PREFS.sections;
  return {
    hour: typeof data.digest_hour === "number" ? data.digest_hour : DEFAULT_PREFS.hour,
    sections: sections.filter((s): s is SectionKey => SECTIONS.some((x) => x.key === s)),
  };
}

export async function saveDigestPrefs(prefs: DigestPrefs): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: uid, digest_hour: prefs.hour, digest_sections: prefs.sections },
            { onConflict: "user_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

const f = (n: number) => Math.round(n);

/**
 * Build the sections the member asked for, in the order they asked for them.
 *
 * A section that has no data is dropped rather than rendered empty — a brief
 * with a blank line in it reads as broken, and the whole point of a digest is
 * that it is short enough to trust at a glance.
 */
export async function buildDigest(
  lat: number, lon: number, wanted: SectionKey[],
): Promise<DigestSection[]> {
  const need = new Set(wanted);
  const [wx, alerts, pollen] = await Promise.all([
    fetchOpenMeteo(lat, lon).catch(() => null),
    need.has("alerts") || need.has("severe") ? fetchNWSAlerts(lat, lon).catch(() => []) : Promise.resolve([]),
    need.has("pollen") ? fetchDispersal(lat, lon).catch(() => []) : Promise.resolve([]),
  ]);

  const out = new Map<SectionKey, DigestSection>();
  const cur = wx?.current;
  const daily = wx?.daily;
  const hourly = wx?.hourly;

  if (need.has("conditions") && cur) {
    const t = f(cToF(cur.temperature_2m));
    const feels = f(cToF(cur.apparent_temperature));
    out.set("conditions", {
      key: "conditions", label: "Right now",
      value: `${t}°`,
      detail: `Feels like ${feels}°. Wind ${f(cur.wind_speed_10m * 2.237)} mph.`,
    });
  }

  if (need.has("today") && daily) {
    const hi = f(cToF(Number(daily.temperature_2m_max?.[0] ?? 0)));
    const lo = f(cToF(Number(daily.temperature_2m_min?.[0] ?? 0)));
    const pop = Number(daily.precipitation_probability_max?.[0] ?? 0);
    out.set("today", {
      key: "today", label: "Today",
      value: `${hi}° / ${lo}°`,
      detail: pop > 0 ? `${pop}% chance of precipitation.` : "No precipitation expected.",
    });
  }

  if (need.has("alerts")) {
    const live = (alerts as NWSAlertFeature[]).filter((a) => a.properties.messageType !== "Cancel");
    const worst = live.find((a) => isCalmEvent(a.properties.event)) ?? live[0];
    out.set("alerts", {
      key: "alerts", label: "Active alerts",
      value: live.length === 0 ? "None" : `${live.length}`,
      detail: worst?.properties.event ?? "Nothing in effect for your location.",
      tone: worst ? (isCalmEvent(worst.properties.event) ? "#e2373c" : "#e8bb4d") : undefined,
    });
  }

  if (need.has("severe") && hourly) {
    // CAPE is already on the hourly payload; the peak over today is the
    // honest one-line answer to "are storms on the table".
    const cape = (hourly.cape as number[] | undefined) ?? [];
    const peak = cape.length ? Math.max(...cape.slice(0, 24)) : 0;
    out.set("severe", {
      key: "severe", label: "Severe outlook",
      value: peak >= 2500 ? "Loaded" : peak >= 1000 ? "Some fuel" : "Quiet",
      detail: peak > 0 ? `Peak instability near ${f(peak)} J/kg today.` : "Little instability today.",
      tone: peak >= 2500 ? "#e2373c" : peak >= 1000 ? "#e8bb4d" : undefined,
    });
  }

  if (need.has("pollen") && pollen.length) {
    const nowP = pollen[0];
    const peak = Math.max(...pollen.slice(0, 24).map((h) => h.score));
    const band = DISPERSAL_BAND[bandOf(peak)];
    out.set("pollen", {
      key: "pollen", label: "Pollen",
      value: band.label,
      detail: `Dispersal peaks at ${peak} of 100 today. ${f(nowP.humidity)}% humidity now.`,
      tone: band.color,
    });
  }

  if (need.has("sun") && daily) {
    const rise = String(daily.sunrise?.[0] ?? "");
    const set = String(daily.sunset?.[0] ?? "");
    if (rise && set) {
      const t = (iso: string) =>
        new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      out.set("sun", {
        key: "sun", label: "Sun",
        value: `${t(rise)} → ${t(set)}`,
        detail: "Sunrise to sunset.",
      });
    }
  }

  if (need.has("pressure") && hourly) {
    const mb = (hourly.surface_pressure as number[] | undefined) ?? [];
    if (mb.length > 6) {
      const delta = mb[6] - mb[0];
      out.set("pressure", {
        key: "pressure", label: "Barometer",
        value: delta <= -1.5 ? "Falling" : delta >= 1.5 ? "Rising" : "Steady",
        detail: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} mb over the next six hours.`,
        tone: delta <= -3 ? "#e2373c" : undefined,
      });
    }
  }

  // Return in the member's chosen order, dropping anything with no data.
  return wanted.map((k) => out.get(k)).filter((s): s is DigestSection => !!s);
}

const cToF = (c: number) => (c * 9) / 5 + 32;

/** "6 AM" rather than "06:00" — this is read, not parsed. */
export function hourLabel(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}
