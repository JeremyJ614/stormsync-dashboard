import { useId } from "react";
import { US_STATES, US_STATE_LABELS, US_NATION_PATH } from "../lib/usAlbers";

// Shared dark-but-readable US backdrop for the albers SVG maps (SPC static,
// probability, chase scan, MD). Lighter state borders + small state abbreviations
// so members can tell where the risk is — without going to a light theme.
export function UsStatesBackdrop({ labels = true }: { labels?: boolean }) {
  return (
    <>
      {US_STATES.map((s, i) => <path key={i} d={s.d} fill="#161d2e" stroke="#4a5a7e" strokeWidth={0.9} />)}
      {labels && <UsStateLabels />}
    </>
  );
}

/**
 * Keeps an overlay inside the country.
 *
 * SPC's outlook polygons are smooth contours drawn over a forecast domain that
 * is larger than the United States, so a risk area along the northern plains
 * genuinely carries on past 49°N. On the interactive map that is unremarkable —
 * there is a basemap under it and Canada is visibly Canada. On these SVG maps
 * there is nothing north of the border to draw it on, so the same polygon reads
 * as a risk area sitting in empty space, which is the "leaking into Canada"
 * everybody reports.
 *
 * A mask rather than a clip path, and stroked as well as filled: the stroke adds
 * about six pixels of margin all the way round the coast, so an outlook that
 * legitimately covers the Gulf or the near Atlantic still shows its offshore
 * edge instead of being shaved off at the shoreline.
 *
 * Usage: `const id = useUsMask()` … `<UsNationMask id={id} />` then
 * `<g mask={`url(#${id})`}>`.
 */
export function UsNationMask({ id, margin = 12 }: { id: string; margin?: number }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse">
      <path d={US_NATION_PATH} fill="#fff" stroke="#fff" strokeWidth={margin}
            strokeLinejoin="round" strokeLinecap="round" />
    </mask>
  );
}

/** A stable, collision-free id for the mask above. */
export function useUsMaskId(): string {
  return `us-mask-${useId().replace(/:/g, "")}`;
}

// Just the state abbreviation labels — render ON TOP of any risk overlay so they
// stay legible. Outlined for contrast on both dark base and bright risk fills.
export function UsStateLabels() {
  return (
    <>
      {US_STATE_LABELS.map((l) => (
        <text key={l.abbr} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
          fill="#e6ecf7" fillOpacity={0.92} fontSize={12} fontWeight={700}
          fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none" }}
          stroke="#0a0e1a" strokeWidth={1.4} paintOrder="stroke">{l.abbr}</text>
      ))}
    </>
  );
}
