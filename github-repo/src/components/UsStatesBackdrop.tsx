import { US_STATES, US_STATE_LABELS } from "../lib/usAlbers";

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
