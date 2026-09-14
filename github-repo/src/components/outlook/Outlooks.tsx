/**
 * The outlook experience.
 *
 * One of these is mounted per centre — SPC, WPC, CPC, and the seasonal group —
 * and it is the same instrument every time: choose a product, choose a period,
 * read the map. The header states the lead in display weight, because the whole
 * point of an outlook is its one sentence: "Slight Risk", "Up to 2.50 inches",
 * "Leaning warm, to 60%". Everything else on the strip is provenance.
 *
 * Every product is fetched lazily and cached for the session, so opening the
 * group costs one request for the product you land on and nothing for the eight
 * you don't.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, AlertTriangle } from "lucide-react";

import {
  GROUPS, productsIn, loadOutlook, heatRiskSrc,
  type OutlookGroup, type OutlookProduct,
} from "../../lib/outlooks";
import { loadFoliage } from "../../lib/foliage";
import { SegmentedTabs, type Segment } from "../forecast/SegmentedTabs";
import { PeriodRail } from "./PeriodRail";
import { OutlookCanvas } from "./OutlookCanvas";
import { FallColorsMap, FoliageReportView } from "./Foliage";
import { FoliageProgress } from "./FoliageProgress";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

const HOUR = 3_600_000;

/** Products that are not vector polygons from a GIS service. */
const IMAGE_PRODUCTS = new Set(["wpc-heatrisk"]);
const FOLIAGE_PRODUCTS = new Set(["other-foliage", "other-colors", "other-foliage-progress"]);

/* ── chrome ──────────────────────────────────────────────────────────────── */

function clockOf(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString(undefined, {
    weekday: "short", hour: "numeric", minute: "2-digit",
  });
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-[9px] uppercase tracking-[0.2em] shrink-0" style={{ color: ROYAL.dim }}>{label}</span>
      <span className="text-[11px] truncate" style={{ color: ROYAL.text }}>{value}</span>
    </span>
  );
}

function Header({
  product, headline, meta, still,
}: {
  product: OutlookProduct;
  headline: string;
  meta: { label: string; value: string }[];
  still: boolean;
}) {
  return (
    <motion.div
      className="relative rounded-2xl overflow-hidden"
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.18 : 0.4, ease: EASE }}
      style={{
        border: `1px solid ${ROYAL.hairline}`,
        background:
          `radial-gradient(70% 130% at 4% -20%, rgba(217,183,117,0.15), transparent 58%),`
          + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] font-semibold" style={{ color: ROYAL.gold }}>
              {product.source}
            </div>
            <h2
              className="font-black mt-1.5 leading-[1.02] tracking-[-0.01em]"
              style={{ fontFamily: HEADING, color: ROYAL.text, fontSize: "clamp(22px, 4.4vw, 34px)" }}
            >
              {headline}
            </h2>
            <p className="text-[12px] mt-1.5 max-w-[62ch] leading-relaxed" style={{ color: ROYAL.dim }}>
              {product.line}
            </p>
          </div>
          <a
            href={product.href} target="_blank" rel="noopener noreferrer"
            className="ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors hover:bg-white/[0.05]"
            style={{ border: `1px solid ${ROYAL.hairline}`, color: ROYAL.iris }}
          >
            Source <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {meta.length > 0 && (
        <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1"
             style={{ borderTop: `1px solid ${ROYAL.hairline}`, background: "rgba(8,8,18,0.55)" }}>
          {meta.map((m) => <MetaItem key={m.label} {...m} />)}
        </div>
      )}
    </motion.div>
  );
}

function Waiting({ height }: { height: number }) {
  return (
    <div className="w-full rounded-2xl grid place-items-center"
         style={{ height, background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="flex items-center gap-2.5 text-[12px]" style={{ color: ROYAL.dim }}>
        <motion.span
          className="w-2 h-2 rounded-full"
          style={{ background: ROYAL.gold }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        Asking the centre for the current issuance…
      </div>
    </div>
  );
}

function Trouble({ product, message, height }: { product: OutlookProduct; message: string; height: number }) {
  return (
    <div className="w-full rounded-2xl grid place-items-center px-6 text-center"
         style={{ height, background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>
      <div>
        <AlertTriangle className="w-5 h-5 mx-auto mb-2" style={{ color: ROYAL.gold }} />
        <div className="text-sm font-semibold" style={{ color: ROYAL.text }}>
          {product.source} did not answer
        </div>
        <div className="text-[11px] mt-1 max-w-[42ch] mx-auto" style={{ color: ROYAL.dim }}>
          {message}. Nothing is substituted for it — the product is either the centre's or it is not shown.
        </div>
        <a href={product.href} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold"
           style={{ color: ROYAL.iris }}>
          Open it at the source <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

/* ── the group ───────────────────────────────────────────────────────────── */

const MAP_H_PX = 470;

export function Outlooks({ group, still }: { group: OutlookGroup; still: boolean }) {
  const products = useMemo(() => productsIn(group), [group]);
  const [pid, setPid] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === pid) ?? products[0];

  // Per-product, so switching away and back keeps the period you were on.
  const [periods, setPeriods] = useState<Record<string, string>>({});
  const view = periods[product.id] ?? product.views[0]?.id ?? "";
  const setView = useCallback(
    (v: string) => setPeriods((p) => ({ ...p, [product.id]: v })),
    [product.id],
  );

  const segments = useMemo<Segment<string>[]>(
    () => products.map((p) => ({ id: p.id, label: p.label })), [products],
  );

  const isImage = IMAGE_PRODUCTS.has(product.id);
  const isFoliage = FOLIAGE_PRODUCTS.has(product.id);

  const vector = useQuery({
    queryKey: ["outlook", product.id, view],
    queryFn: () => loadOutlook(product.id, view),
    enabled: !isImage && !isFoliage && !!view,
    staleTime: 10 * 60_000,
    gcTime: HOUR,
    retry: 1,
  });

  const foliage = useQuery({
    queryKey: ["foliage"],
    queryFn: () => loadFoliage(),
    enabled: isFoliage,
    staleTime: 6 * HOUR,
    gcTime: 12 * HOUR,
    retry: 1,
  });

  const rail = (
    <PeriodRail
      views={product.views}
      value={view}
      onChange={setView}
      layoutId={`period-${product.id}`}
      still={still}
      label={`${product.label} period`}
    />
  );

  /* header content differs per kind, so it is assembled here rather than in
     three near-identical branches below. */
  let headline = product.label;
  let meta: { label: string; value: string }[] = [];

  if (isFoliage && foliage.data) {
    const f = foliage.data;
    headline = product.id === "other-colors"
      ? `${f.total} sites have turned`
      : product.id === "other-foliage-progress"
        ? `${f.seasonLabel}, scrubbed day by day`
        : f.states[0]
          ? `${f.states[0].state} is furthest along`
          : "Nothing has turned yet";
    meta = [
      { label: "Season", value: f.current ? `${f.seasonLabel}, in progress` : `${f.seasonLabel}, completed` },
      { label: "Since", value: f.seasonStart },
      { label: "States", value: String(f.statesReporting) },
      { label: "Basis", value: "observations, not a forecast" },
    ];
  } else if (isImage) {
    headline = `Day ${view}`;
    meta = [
      { label: "Product", value: "NWS HeatRisk" },
      { label: "Form", value: "WPC's published graphic" },
      { label: "Days", value: "counted from the current issuance" },
    ];
  } else if (vector.data) {
    headline = vector.data.headline ?? product.label;
    meta = [
      vector.data.issued ? { label: "Issued", value: clockOf(vector.data.issued) } : null,
      vector.data.valid
        ? { label: "Valid", value: vector.data.valid.includes("T") ? clockOf(vector.data.valid) : vector.data.valid }
        : null,
      vector.data.expires ? { label: "Until", value: clockOf(vector.data.expires) } : null,
      vector.data.forecaster ? { label: "Forecaster", value: vector.data.forecaster } : null,
    ].filter((m): m is { label: string; value: string } => m !== null);
  }

  return (
    <div className="space-y-3">
      {products.length > 1 && (
        <SegmentedTabs
          segments={segments}
          value={product.id}
          onChange={setPid}
          layoutId={`outlook-products-${group}`}
          label={`${GROUPS.find((g) => g.id === group)?.blurb ?? ""} products`}
        />
      )}

      <Header product={product} headline={headline} meta={meta} still={still} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${product.id}-${view}`}
          initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: still ? 0.14 : 0.26, ease: EASE }}
        >
          {isFoliage ? (
            foliage.isPending ? <Waiting height={MAP_H_PX} />
            : foliage.isError ? <Trouble product={product} height={MAP_H_PX}
                                         message={(foliage.error as Error)?.message ?? "the request failed"} />
            : product.id === "other-colors"
              ? <FallColorsMap report={foliage.data!} still={still} height={MAP_H_PX} />
            : product.id === "other-foliage-progress"
              ? <FoliageProgress report={foliage.data!} still={still} height={MAP_H_PX} />
              : <FoliageReportView report={foliage.data!} still={still} />
          ) : isImage ? (
            <div className="relative rounded-2xl overflow-hidden"
                 style={{ background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>
              <img
                key={view}
                src={heatRiskSrc(view)}
                alt={`NWS HeatRisk, day ${view}`}
                className="w-full h-auto block"
                loading="lazy"
              />
              <div className="absolute top-3 right-3 z-10">{rail}</div>
            </div>
          ) : vector.isPending ? (
            <Waiting height={MAP_H_PX} />
          ) : vector.isError ? (
            <Trouble product={product} height={MAP_H_PX}
                     message={(vector.error as Error)?.message ?? "the request failed"} />
          ) : (
            <OutlookCanvas
              frame={vector.data!}
              still={still}
              height={MAP_H_PX}
              topRight={rail}
              ariaLabel={`${product.label}, ${product.views.find((v) => v.id === view)?.label ?? ""}`}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default Outlooks;
