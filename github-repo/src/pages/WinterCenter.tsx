/**
 * The Winter Center.
 *
 * Five ordered subtabs rather than one long page: the map you look at first,
 * then how much falls where, then what is in effect, then hour by hour for your
 * own location, then the national picture further out.
 *
 * Every source here was probed live before being built against, and the one
 * product that has no public endpoint (Probabilistic WSSI) is named as absent
 * rather than approximated. See src/lib/winter.ts for the survey.
 *
 * Winter products are seasonal and the honest answer for most of the year is
 * "nothing". This module is built to say that out loud rather than show an
 * empty frame, because an empty frame reads as broken software and "no winter
 * alerts anywhere in the country" reads as a working forecast.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Snowflake, Radio } from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { ChaseTabs, type TabDef } from "../components/chase/ChaseTabs";
import {
  StormMapPanel, SnowfallPanel, WinterAlertsPanel, TimelinePanel, OutlookPanel,
} from "../components/winter/WinterPanels";
import { ROYAL, EASE, prefersReducedMotion } from "../lib/royal";
import { useCalm } from "../lib/calm";
import type { Location } from "../hooks/useLocation";

type TabId = "map" | "snowfall" | "alerts" | "timeline" | "outlook";

const TABS: readonly TabDef<TabId>[] = [
  { id: "map", label: "Storm Map", hint: "Impact, snow on the ground, and what is coming" },
  { id: "snowfall", label: "Snowfall", hint: "Five days, city by city" },
  { id: "alerts", label: "Alerts", hint: "What the Weather Service has out" },
  { id: "timeline", label: "Timeline", hint: "Hour by hour where you are" },
  { id: "outlook", label: "Outlook", hint: "National snow and ice probability" },
] as const;

export default function WinterCenter({ location }: { location: Location }) {
  const [tab, setTab] = useState<TabId>("map");
  const { calm, reason } = useCalm(location?.lat, location?.lon);
  const still = prefersReducedMotion() || calm;

  return (
    <ModuleShell
      eyebrow="WPC · NOHRSC · CPC · NWS"
      title="Winter Center"
      subtitle="Winter storm impact, snowfall and what is in effect, from the agencies that issue it."
    >
      {calm && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px] flex items-center gap-2"
             style={{ background: "rgba(255,77,85,0.08)", border: "1px solid rgba(255,77,85,0.3)", color: ROYAL.text }}>
          <Radio className="w-4 h-4 shrink-0" style={{ color: "#ff6b70" }} />
          Animation is paused while {reason ?? "a warning is active for your location"}.
        </div>
      )}

      <ChaseTabs tabs={TABS} active={tab} onChange={setTab} color="#89cff0" still={still} />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
        >
          {tab === "map" && <StormMapPanel location={location} still={still} />}
          {tab === "snowfall" && <SnowfallPanel still={still} />}
          {tab === "alerts" && <WinterAlertsPanel location={location} still={still} />}
          {tab === "timeline" && <TimelinePanel location={location} still={still} />}
          {tab === "outlook" && <OutlookPanel still={still} />}
        </motion.div>
      </AnimatePresence>

      <p className="text-[11px] leading-relaxed px-1 flex gap-2" style={{ color: ROYAL.dim }}>
        <Snowflake className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Winter Storm Severity Index, snow and ice probabilities and the day 4-7 outlook come from the Weather
          Prediction Center; snow on the ground from the National Operational Hydrologic Remote Sensing Center;
          the extended pattern from the Climate Prediction Center; alerts from the National Weather Service. This
          is decision support. Warnings and advisories issued by your local Weather Service office are the ones
          that count.
        </span>
      </p>
    </ModuleShell>
  );
}
