/**
 * Shared treatment for the CARTO dark basemap.
 *
 * Two problems the stock style causes for outlook maps, both fixed here so the
 * SPC, thunderstorm-probability and any future map behave identically:
 *
 *  1. The landmass is drawn by the `background` layer at near-black, so a
 *     translucent risk area appears to float over nothing.
 *  2. State lines are faded out at continental zooms — exactly the zoom these
 *     maps are used at — so the country has no internal structure.
 *
 * It also returns the layer that overlays should be inserted *beneath*, so
 * boundaries and place names draw on top of a filled polygon instead of being
 * buried by it.
 */
import type maplibregl from "maplibre-gl";

export function applyRoyalBasemap(map: maplibregl.Map): string | undefined {
  const setPaint = (layer: string, prop: string, value: unknown) => {
    if (!map.getLayer(layer)) return;
    try { map.setPaintProperty(layer, prop, value as never); } catch { /* style drift */ }
  };

  // Lift the land out of near-black; push water darker so coastlines read.
  setPaint("background", "background-color", "#1a2029");
  setPaint("water", "fill-color", "#0c1017");

  const forceVisible = (layer: string, color: string, width: number, opacity: number) => {
    if (!map.getLayer(layer)) return;
    try {
      map.setLayerZoomRange(layer, 0, 24);
      map.setLayoutProperty(layer, "visibility", "visible");
      map.setPaintProperty(layer, "line-color", color as never);
      map.setPaintProperty(layer, "line-width", width as never);
      map.setPaintProperty(layer, "line-opacity", opacity as never);
    } catch { /* style drift — skip rather than break the map */ }
  };
  forceVisible("boundary_state", "#8592ad", 0.8, 0.75);
  forceVisible("boundary_country_outline", "#b6c1d8", 1.1, 0.95);
  forceVisible("boundary_country_inner", "#b6c1d8", 1.0, 0.9);

  // Labels are deliberately left on their own zoom ranges. Forcing them all to
  // zoom 0 puts every state name and mid-size city on a continental view at the
  // size they were designed for close-up — the map ends up crowded rather than
  // informative. The stock ranges already surface the few large places that
  // belong at this scale, and more appear as you zoom.

  // Insert overlays below the first boundary layer so borders and labels stay
  // on top of whatever is drawn.
  return (
    (map.getLayer("boundary_county") && "boundary_county") ||
    (map.getLayer("boundary_state") && "boundary_state") ||
    map.getStyle().layers?.find((l) => l.type === "symbol")?.id
  ) as string | undefined;
}
