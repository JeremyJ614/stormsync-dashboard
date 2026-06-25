import { useState } from "react";
import { useNWSPoints, useNWSDiscussion, useOpenMeteo } from "../hooks/useWeatherQuery";
import { useDailyBrief } from "../hooks/useDailyBrief";
import type { Location } from "../hooks/useLocation";
import { CardSkeleton } from "../components/WeatherSkeleton";
import { MessageSquare, Sparkles, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { WMO_DESCRIPTIONS } from "../config";
import { cToF, msToMph } from "../utils/weatherCalc";

interface Props { location: Location }

// A personalized, plain-language breakdown of the viewer's OWN forecast, built
// from their local Open-Meteo data (no AI call) — this is the part that "directly
// breaks down the forecast for the person reading it" (P-03).
function buildLocalBreakdown(city: string, weather: ReturnType<typeof useOpenMeteo>["data"]): string[] | null {
  const daily = weather?.daily;
  const cur = weather?.current;
  const hourly = weather?.hourly;
  if (!daily?.time || !daily.temperature_2m_max) return null;
  const num = (a: (number | string)[] | undefined, i: number) => Number(a?.[i] ?? 0);
  const f = (v: number) => Math.round(cToF(v));
  const mph = (v: number) => Math.round(msToMph(v));
  const days = (daily.time as string[]).slice(0, 4);
  if (days.length < 2) return null;
  const hi = (i: number) => f(num(daily.temperature_2m_max, i));
  const lo = (i: number) => f(num(daily.temperature_2m_min, i));
  const pop = (i: number) => Math.round(num(daily.precipitation_probability_max, i));
  const windMax = (i: number) => mph(num(daily.wind_speed_10m_max, i));
  const gust = (i: number) => mph(num(daily.wind_gusts_10m_max, i));
  const code = (i: number) => num(daily.weather_code, i);
  const dayName = (i: number) => i === 0 ? "today" : i === 1 ? "tomorrow" : new Date(days[i]).toLocaleDateString("en-US", { weekday: "long" });
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const paras: string[] = [];

  // 1) Today
  const curT = cur ? f(Number(cur.temperature_2m)) : hi(0);
  const curDesc = cur ? (WMO_DESCRIPTIONS[Number(cur.weather_code) ?? 0] ?? "").toLowerCase() : "";
  const todayDesc = (WMO_DESCRIPTIONS[code(0)] ?? "mixed skies").toLowerCase();
  const p0 = pop(0);
  const rainTip = p0 >= 60 ? " Carry rain gear — measurable rain is likely." : p0 >= 30 ? " A passing shower is possible, but most of the day should stay dry." : " Expect a dry day overall.";
  const windTip = gust(0) >= 35 ? ` Winds will be breezy, gusting near ${gust(0)} mph.` : windMax(0) >= 15 ? ` Winds run around ${windMax(0)} mph.` : "";
  paras.push(`Right now in ${city} it's ${curT}°F${curDesc ? ` and ${curDesc}` : ""}. Through ${dayName(0)}, look for a high near ${hi(0)}°F and a low around ${lo(0)}°F with ${todayDesc}, and about a ${p0}% chance of precipitation.${rainTip}${windTip}`);

  // 2) Next few days trend
  const trend = hi(Math.min(2, days.length - 1)) - hi(0);
  const trendWord = trend >= 6 ? `warming up — highs climb toward ${hi(days.length - 1)}°F by ${dayName(days.length - 1)}`
    : trend <= -6 ? `cooling down — highs ease to around ${hi(days.length - 1)}°F by ${dayName(days.length - 1)}`
    : `holding fairly steady in the ${Math.round(hi(Math.min(2, days.length - 1)) / 10) * 10}s`;
  let wi = 1;
  for (let i = 2; i < days.length; i++) if (pop(i) > pop(wi)) wi = i;
  const wet = pop(wi) >= 30 ? ` ${cap(dayName(wi))} looks like the wettest day with about a ${pop(wi)}% rain chance.` : " The next few days look mostly dry.";
  paras.push(`Looking ahead, temperatures are ${trendWord}.${wet}`);

  // 3) Thunderstorm potential from local CAPE
  const capeArr = (hourly?.cape as (number | string)[] | undefined) ?? [];
  const maxCape = capeArr.slice(0, 36).reduce((m, v) => Math.max(m, Number(v) || 0), 0);
  if (maxCape >= 1500) paras.push(`There's real thunderstorm fuel around — instability (CAPE) peaks near ${Math.round(maxCape)} J/kg over the next day and a half, so a few storms could turn strong if they fire. Keep an eye on the SPC Outlook and Warning Center if skies darken.`);
  else if (maxCape >= 700) paras.push(`Modest thunderstorm energy is in place (CAPE up to ~${Math.round(maxCape)} J/kg), so a storm or two is possible, but no organized severe threat stands out locally.`);

  // 4) Bottom line
  const bl = p0 >= 50 ? "Plan for wet weather today" : trend >= 6 ? "Enjoy the warming trend" : trend <= -6 ? "Bundle up as it cools off" : "A fairly quiet stretch of weather is ahead";
  paras.push(`Bottom line: ${bl} around ${city}. For your local NWS office's full technical reasoning, see the Technical tab.`);

  return paras;
}

export default function ForecastDiscussion({ location }: Props) {
  const { data: nwsPoints } = useNWSPoints(location);
  const office = nwsPoints?.properties?.cwa;
  const { data: discussion, isLoading } = useNWSDiscussion(office);
  const { data: brief, isLoading: briefLoading } = useDailyBrief();
  const { data: weather } = useOpenMeteo(location);
  const [tab, setTab] = useState<"raw" | "friendly">("raw");

  const plain = brief?.content.discussion_plain?.trim();
  const local = buildLocalBreakdown(location.name, weather);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Forecast Discussion</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · NWS Office: {office ?? "loading…"}</p>

      {isLoading && <CardSkeleton rows={8} />}

      {!isLoading && !discussion && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
          No forecast discussion available for {office ?? "this location"}.
        </div>
      )}

      {!isLoading && discussion && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setTab("raw")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "raw" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:border-primary/40"}`}
            >
              Technical · Local
            </button>
            <button
              onClick={() => setTab("friendly")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "friendly" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:border-primary/40"}`}
            >
              Plain Language
            </button>
          </div>

          {tab === "raw" && discussion.issuanceTime && (
            <div className="text-xs text-muted-foreground">
              Issued: {(() => { try { return format(parseISO(discussion.issuanceTime), "MMM d, yyyy h:mm a"); } catch { return discussion.issuanceTime; } })()}
            </div>
          )}

          {tab === "raw" && (
            <div className="bg-card border border-border rounded-xl p-4">
              <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground overflow-x-auto">
                {discussion.productText}
              </pre>
            </div>
          )}

          {/* Plain-language tab: the nightly SSWX Storm Engine national discussion
              (one shared AI artifact — no per-request call). */}
          {tab === "friendly" && (
            <>
              {/* Personalized breakdown of the viewer's own local forecast. */}
              {local && (
                <div className="glass rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-primary">Your Local Breakdown — {location.name}</h3>
                  </div>
                  <div className="space-y-3 text-sm leading-relaxed">
                    {local.map((p, i) => <p key={i} className={i === local.length - 1 ? "text-foreground font-medium" : "text-foreground/90"}>{p}</p>)}
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Built from your local forecast data · Updates with your location.</div>
                </div>
              )}

              {briefLoading && <CardSkeleton rows={5} />}

              {!briefLoading && plain && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-primary">National Picture — SSWX Plain-Language Discussion</h3>
                    {brief?.generatedAt && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {(() => { try { return format(parseISO(brief.generatedAt!), "MMM d · h:mm a"); } catch { return ""; } })()}
                      </span>
                    )}
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{plain}</div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    SSWX nightly national discussion · Generated by AI · Not official NWS guidance · For your local technical detail, see the Technical tab.
                  </div>
                </div>
              )}

              {!briefLoading && !plain && (
                <div className="bg-card border border-border rounded-xl p-6 text-center">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 text-primary opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    The plain-language discussion is written by the nightly SSWX Storm Engine and refreshes each morning. Check back shortly — today's edition isn't ready yet.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
