/**
 * The StormSync basemap.
 *
 * This used to be CARTO's dark-matter style with a handful of paint properties
 * hammered over the top at load time. That worked, but it fought the style
 * rather than replacing it: dark-matter draws the land at #0e0e0e, so a
 * translucent risk polygon floated over nothing, and it dashes state lines out
 * of existence at exactly the continental zooms these maps live at.
 *
 * So this is our own style now. Same vector tiles (CARTO's OpenMapTiles-schema
 * source, no key, no quota), same glyph server, but every layer is ours:
 *
 *  · Land is a real slate grey, not near-black, so overlays sit *on* something.
 *  · State lines are solid, cased, and present from zoom 2 — they are the most
 *    important furniture on a weather map and they now read like it.
 *  · Roads, buildings and POIs only appear when they are actually useful. The
 *    stock style ships 93 layers, most of which describe tunnels and house
 *    numbers; this one ships about a third of that, which is a third of the
 *    style parsing on a phone.
 *
 * It is also a style *object* rather than a URL, so MapLibre skips the
 * style.json round trip entirely and starts fetching tiles on the first frame.
 */
import type * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";

/** The map's own palette. Cool greys, so the gold UI stays the only warm thing. */
export const MAP_INK = {
  land: "#242b37",
  landAlt: "#212834",
  park: "#1f2a30",
  water: "#0c1118",
  waterEdge: "#3d4a60",
  river: "#1e2a38",

  county: "#5a6579",
  state: "#b3bed4",
  stateHi: "#ccd5e8",
  country: "#e2e8f6",
  boundaryCase: "#0a0e15",

  motorway: "#3d4759",
  trunk: "#353e50",
  primary: "#303845",
  minor: "#2a3240",
  building: "#2c3441",

  label: "#e6ebf7",
  labelDim: "#9aa7bf",
  labelWater: "#5d6e86",
  labelState: "#cfd7ec",
  halo: "#080c13",
} as const;

const CARTO_ATTRIBUTION =
  '© <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, ' +
  '© <a href="https://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** Font stacks, in the order the CARTO glyph server can actually serve them. */
const FONT = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"];
const FONT_REG = ["Montserrat Regular", "Open Sans Regular", "Noto Sans Regular"];
const FONT_ITALIC = ["Open Sans Italic", "Noto Sans Regular"];

/** `["interpolate", ["linear"], ["zoom"], …]` without the ceremony. */
function byZoom(...pairs: [number, number][]): unknown {
  return ["interpolate", ["linear"], ["zoom"], ...pairs.flat()];
}

/** The same, for colours, which interpolate perfectly well but are not numbers. */
function tintByZoom(...pairs: [number, string][]): unknown {
  return ["interpolate", ["linear"], ["zoom"], ...pairs.flat()];
}

export const STORMSYNC_DARK: StyleSpecification = {
  version: 8,
  name: "StormSync Slate",
  glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "vector",
      url: "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  layers: [
    // ── ground ──────────────────────────────────────────────────────────────
    { id: "background", type: "background", paint: { "background-color": MAP_INK.land } },
    {
      id: "landcover",
      type: "fill",
      source: "carto",
      "source-layer": "landcover",
      filter: ["any", ["==", ["get", "class"], "wood"], ["==", ["get", "class"], "grass"]],
      paint: { "fill-color": MAP_INK.landAlt, "fill-opacity": 0.7 },
    },
    {
      id: "park",
      type: "fill",
      source: "carto",
      "source-layer": "park",
      minzoom: 7,
      paint: { "fill-color": MAP_INK.park, "fill-opacity": 0.55 },
    },

    // ── water ───────────────────────────────────────────────────────────────
    {
      id: "waterway",
      type: "line",
      source: "carto",
      "source-layer": "waterway",
      minzoom: 7,
      paint: {
        "line-color": MAP_INK.river,
        "line-width": byZoom([7, 0.5], [12, 1.2], [16, 3]) as never,
      },
    },
    {
      id: "water",
      type: "fill",
      source: "carto",
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": MAP_INK.water, "fill-antialias": true },
    },
    {
      // The coastline. Dark-matter has none, which is why the Gulf and the
      // Atlantic used to bleed into the land on a phone screen.
      id: "water_outline",
      type: "line",
      source: "carto",
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": MAP_INK.waterEdge,
        "line-opacity": 0.5,
        "line-width": byZoom([2, 0.4], [6, 0.7], [11, 1.1]) as never,
      },
    },

    // ── ways ────────────────────────────────────────────────────────────────
    {
      id: "road_motorway",
      type: "line",
      source: "carto",
      "source-layer": "transportation",
      minzoom: 5,
      filter: ["==", ["get", "class"], "motorway"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.motorway,
        "line-width": byZoom([5, 0.5], [8, 1], [11, 2], [14, 4.5], [18, 18]) as never,
      },
    },
    {
      id: "road_trunk",
      type: "line",
      source: "carto",
      "source-layer": "transportation",
      minzoom: 7,
      filter: ["==", ["get", "class"], "trunk"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.trunk,
        "line-width": byZoom([7, 0.4], [11, 1.4], [14, 3.5], [18, 14]) as never,
      },
    },
    {
      id: "road_primary",
      type: "line",
      source: "carto",
      "source-layer": "transportation",
      minzoom: 9,
      filter: ["==", ["get", "class"], "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.primary,
        "line-width": byZoom([9, 0.4], [13, 1.8], [16, 6], [18, 12]) as never,
      },
    },
    {
      id: "road_secondary",
      type: "line",
      source: "carto",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.minor,
        "line-width": byZoom([12, 0.6], [15, 2.5], [18, 9]) as never,
      },
    },
    {
      id: "road_minor",
      type: "line",
      source: "carto",
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["==", ["get", "class"], "minor"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.minor,
        "line-width": byZoom([14, 0.8], [17, 5], [18, 9]) as never,
      },
    },
    {
      id: "building",
      type: "fill",
      source: "carto",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-color": MAP_INK.building,
        "fill-opacity": byZoom([14, 0], [15.5, 0.65]) as never,
      },
    },

    // ── boundaries ──────────────────────────────────────────────────────────
    // Everything from here up draws over the weather overlays, which are
    // inserted beneath `boundary_county`. That is deliberate: you must be able
    // to see which state a risk area covers.
    {
      id: "boundary_county",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      minzoom: 7,
      filter: ["all", ["==", ["get", "admin_level"], 6], ["==", ["get", "maritime"], 0]],
      paint: {
        "line-color": MAP_INK.county,
        "line-opacity": byZoom([7, 0.35], [10, 0.6]) as never,
        "line-width": byZoom([7, 0.5], [12, 1]) as never,
        "line-dasharray": [2.5, 2],
      },
    },
    {
      // A dark casing so the state line reads over a bright risk polygon just
      // as well as it reads over bare land.
      id: "boundary_state_case",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      minzoom: 2,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["==", ["get", "maritime"], 0]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.boundaryCase,
        "line-opacity": 0.55,
        "line-width": byZoom([2, 1.8], [5, 2.8], [9, 4.2], [13, 5.5]) as never,
      },
    },
    {
      id: "boundary_state",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      minzoom: 2,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["==", ["get", "maritime"], 0]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": tintByZoom([2, MAP_INK.state], [7, MAP_INK.stateHi]) as never,
        "line-opacity": 0.9,
        "line-width": byZoom([2, 0.6], [5, 1.1], [9, 1.7], [13, 2.4]) as never,
      },
    },
    {
      id: "boundary_country_outline",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      minzoom: 0,
      filter: ["all", ["==", ["get", "admin_level"], 2], ["==", ["get", "maritime"], 0]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.boundaryCase,
        "line-opacity": 0.6,
        "line-width": byZoom([1, 2.6], [6, 5], [11, 7]) as never,
      },
    },
    {
      id: "boundary_country_inner",
      type: "line",
      source: "carto",
      "source-layer": "boundary",
      minzoom: 0,
      filter: ["all", ["==", ["get", "admin_level"], 2], ["==", ["get", "maritime"], 0]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_INK.country,
        "line-opacity": 0.92,
        "line-width": byZoom([1, 0.8], [5, 1.5], [10, 2.2]) as never,
      },
    },

    // ── labels ──────────────────────────────────────────────────────────────
    {
      id: "watername_ocean",
      type: "symbol",
      source: "carto",
      "source-layer": "water_name",
      maxzoom: 6,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "class"], "ocean"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_ITALIC,
        "text-size": byZoom([0, 12], [4, 17]) as never,
        "text-letter-spacing": 0.14,
        "text-max-width": 6,
      },
      paint: { "text-color": MAP_INK.labelWater, "text-halo-color": MAP_INK.halo, "text-halo-width": 1 },
    },
    {
      id: "watername_lake",
      type: "symbol",
      source: "carto",
      "source-layer": "water_name",
      minzoom: 6,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "class"], "lake"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_ITALIC,
        "text-size": byZoom([6, 10], [13, 13]) as never,
        "text-max-width": 8,
      },
      paint: { "text-color": MAP_INK.labelWater, "text-halo-color": MAP_INK.halo, "text-halo-width": 1 },
    },
    {
      // City dots at continental zoom, drawn rather than sprited — no sprite
      // sheet to fetch, and the colour is ours.
      id: "place_dot",
      type: "circle",
      source: "carto",
      "source-layer": "place",
      minzoom: 3.5,
      maxzoom: 8,
      filter: ["all", ["==", ["get", "class"], "city"], ["<=", ["get", "rank"], 6]],
      paint: {
        "circle-radius": byZoom([4, 1.6], [7, 2.8]) as never,
        "circle-color": MAP_INK.labelDim,
        "circle-opacity": 0.85,
        "circle-stroke-width": 0.8,
        "circle-stroke-color": MAP_INK.halo,
        "circle-stroke-opacity": 0.7,
      },
    },
    {
      /**
       * A dot for every populated place once you are close enough.
       *
       * Labels collide and the loser is dropped, which is correct — overlapping
       * text is unreadable. But a dropped label used to mean the place vanished
       * entirely, so a map of a metro area showed empty ground between the two
       * or three names that survived. The dot survives the collision, so the
       * town is at least THERE, and its name appears as soon as there is room.
       */
      id: "place_minor_dot",
      type: "circle",
      source: "carto",
      "source-layer": "place",
      minzoom: 8,
      filter: ["in", ["get", "class"], ["literal", ["town", "village", "hamlet", "suburb", "borough", "quarter"]]],
      paint: {
        "circle-radius": byZoom([8, 1.3], [11, 2.2], [14, 3]) as never,
        "circle-color": MAP_INK.labelDim,
        "circle-opacity": 0.7,
        "circle-stroke-width": 0.7,
        "circle-stroke-color": MAP_INK.halo,
        "circle-stroke-opacity": 0.55,
      },
    },
    {
      /**
       * The big names. First in the file on purpose.
       *
       * MapLibre places symbol layers in order and later ones give way to
       * earlier ones, so whichever city layer comes first wins its collisions.
       * The small-town layer used to be declared above this one, which meant a
       * village could push Oklahoma City's label off the map.
       */
      id: "place_city",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 4,
      filter: ["all", ["==", ["get", "class"], "city"], ["<=", ["get", "rank"], 6]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": byZoom([4, 11], [8, 14], [12, 18], [15, 22]) as never,
        "text-max-width": 9,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.05,
        "text-offset": [0, 0.85],
        "text-anchor": "top",
        // Rank ascending, so the more important name is placed first and keeps
        // its spot when two labels want the same pixels.
        "symbol-sort-key": ["get", "rank"] as never,
        "text-padding": 3,
      },
      paint: { "text-color": MAP_INK.label, "text-halo-color": MAP_INK.halo, "text-halo-width": 1.3 },
    },
    {
      /**
       * Everything else called a city, let in as you zoom.
       *
       * The rank scale in these tiles runs past 14, not to 5 — at zoom 7 around
       * Oklahoma the cities present carry ranks from 3 to 14. A flat `rank <= 5`
       * threw away nearly all of them, which is most of why a zoomed-in map
       * showed one or two names.
       */
      id: "place_city_minor",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 6,
      filter: ["all",
        ["==", ["get", "class"], "city"],
        [">", ["get", "rank"], 6],
        ["<=", ["get", "rank"], ["step", ["zoom"], 8, 7, 10, 8, 14, 9, 30]],
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": byZoom([6, 10], [10, 13], [14, 17]) as never,
        "text-max-width": 9,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.04,
        "symbol-sort-key": ["get", "rank"] as never,
        "text-padding": 3,
      },
      paint: { "text-color": MAP_INK.labelDim, "text-halo-color": MAP_INK.halo, "text-halo-width": 1.2 },
    },
    {
      /**
       * Towns, which is what most of a US metro is called in this data.
       *
       * Moore, Edmond, Del City, Bethany and Midwest City are all `town` here.
       * This layer used to start at zoom 9 and STOP at 15, so it was absent
       * exactly where someone zooming into their own county needed it most.
       */
      id: "place_town",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 7,
      filter: ["all",
        ["==", ["get", "class"], "town"],
        ["<=", ["get", "rank"], ["step", ["zoom"], 9, 8, 12, 9, 30]],
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_REG,
        "text-size": byZoom([7, 10], [11, 12.5], [15, 15]) as never,
        "text-max-width": 9,
        "symbol-sort-key": ["get", "rank"] as never,
        "text-padding": 2,
      },
      paint: { "text-color": MAP_INK.labelDim, "text-halo-color": MAP_INK.halo, "text-halo-width": 1.1 },
    },
    {
      /**
       * Villages, hamlets and named suburbs — which had no layer at all.
       *
       * At zoom 9 over Oklahoma a single tile carries 107 villages, 28 towns and
       * six cities. Nothing drew the villages, so nine tenths of the populated
       * places in view were simply not on the map, and zooming further in made
       * it worse rather than better: by zoom 11 the tile is hamlets and suburbs
       * almost entirely.
       */
      id: "place_locality",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 9,
      filter: ["all",
        ["in", ["get", "class"], ["literal", ["village", "hamlet", "suburb", "borough", "quarter"]]],
        ["<=", ["get", "rank"], ["step", ["zoom"], 12, 10, 14, 11, 30]],
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_REG,
        "text-size": byZoom([9, 9.5], [12, 11.5], [15, 13.5]) as never,
        "text-max-width": 8,
        "symbol-sort-key": ["get", "rank"] as never,
        "text-padding": 2,
      },
      paint: { "text-color": MAP_INK.labelDim, "text-halo-color": MAP_INK.halo, "text-halo-width": 1 },
    },
    {
      id: "place_state",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      minzoom: 3.2,
      maxzoom: 9,
      filter: ["all", ["==", ["get", "class"], "state"], ["has", "rank"], ["<=", ["get", "rank"], 6]],
      layout: {
        "text-field": ["get", "name_en"],
        "text-font": FONT,
        "text-size": byZoom([3.2, 9.5], [7, 14]) as never,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.2,
        "text-max-width": 8,
      },
      paint: { "text-color": MAP_INK.labelState, "text-halo-color": MAP_INK.halo, "text-halo-width": 1.4, "text-opacity": 0.85 },
    },
    {
      id: "place_country",
      type: "symbol",
      source: "carto",
      "source-layer": "place",
      maxzoom: 5,
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": ["get", "name_en"],
        "text-font": FONT,
        "text-size": byZoom([2, 11], [6, 15]) as never,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.24,
        "text-max-width": 7,
      },
      paint: { "text-color": MAP_INK.labelDim, "text-halo-color": MAP_INK.halo, "text-halo-width": 1.4, "text-opacity": 0.5 },
    },
    {
      id: "roadname_major",
      type: "symbol",
      source: "carto",
      "source-layer": "transportation_name",
      minzoom: 13,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": FONT_REG,
        "text-size": byZoom([13, 10], [17, 12]) as never,
        "symbol-spacing": 260,
      },
      paint: { "text-color": MAP_INK.labelDim, "text-halo-color": MAP_INK.halo, "text-halo-width": 1, "text-opacity": 0.7 },
    },
  ],
};

/**
 * Kept for the eight maps that call it on `load`. The style no longer needs
 * patching, so all this does now is answer the one question those callers
 * actually asked: which layer should my overlay be inserted *beneath*, so that
 * borders and place names stay on top of it.
 */
export function applyRoyalBasemap(map: maplibregl.Map): string | undefined {
  return (
    (map.getLayer("boundary_county") && "boundary_county") ||
    (map.getLayer("boundary_state_case") && "boundary_state_case") ||
    (map.getLayer("boundary_state") && "boundary_state") ||
    (map.getStyle().layers?.find((l) => l.type === "symbol")?.id as string | undefined)
  ) as string | undefined;
}

/** The old name, so existing imports keep working. */
export const DARK_STYLE = STORMSYNC_DARK;
