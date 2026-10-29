// The island's plan, in metres from its centre: x runs east, y south (toward
// the viewer), z up. Its shape follows Richard's sketch: a long slab with
// straight front and back edges, a squarish west end and a big rounded east
// end, the cross-section along the long front face and round the curve.
// Highlands with a reservoir and a hydro dam at the back of the west end; a
// river from the dam to a sea inlet in the curve of the east end; two cities
// either side of the river; every power station wired to them by pylons;
// roads that join the places that need joining. Pure data and small helpers,
// shared by the scene and the page.
//
// The camera looks from the south-east, 58° round as in the sketch: the long
// south face looks at the viewer, back is north (-y), screen left is west.

export const DEPTH = 70;        // the slab under the grass
export const TOP = 14;          // the lowland's surface
export const WATER = 10;        // the sea's surface in the inlet
export const BED = 3;           // the sea bed

export const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── The outline: a rounded box for the west end, an ellipse for the east ────
// The union of the two, measured as a radius for each bearing from the centre
// (the shape is convex, so every bearing meets its edge once).
const WEST = { cx: -100, cy: 0, hw: 230, hh: 196, r: 44 };
const EAST = { cx: 112, cy: 0, rx: 218, ry: 196 };
function outside(x, y) {
  const qx = Math.abs(x - WEST.cx) - (WEST.hw - WEST.r), qy = Math.abs(y - WEST.cy) - (WEST.hh - WEST.r);
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - WEST.r;
  const ell = (Math.hypot((x - EAST.cx) / EAST.rx, (y - EAST.cy) / EAST.ry) - 1) * Math.min(EAST.rx, EAST.ry);
  return Math.min(box, ell);
}
const TABLE = 2048;
const RADII = Array.from({ length: TABLE + 1 }, (_, i) => {
  const t = (i / TABLE) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
  let lo = 0, hi = 600;
  for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (outside(c * m, s * m) < 0) lo = m; else hi = m; }
  // a slight unevenness, so the edge reads as ground rather than a drawing
  return lo * (1 + 0.010 * Math.sin(5 * t + 1.1) + 0.006 * Math.sin(11 * t + 0.4));
});
export function radius(theta) {
  const u = (((theta / (Math.PI * 2)) % 1) + 1) % 1 * TABLE, i = Math.floor(u), f = u - i;
  return RADII[i] * (1 - f) + RADII[i + 1] * f;
}
export const edgeAt = (theta, k = 1) => [Math.cos(theta) * radius(theta) * k, Math.sin(theta) * radius(theta) * k];
export const bearing = (x, y) => Math.atan2(y, x);
export const reach = (x, y) => Math.hypot(x, y) / radius(bearing(x, y));
export const BOUNDS = { x: WEST.cx - WEST.hw - 16, y: -WEST.hh - 16, w: EAST.cx + EAST.rx - (WEST.cx - WEST.hw) + 32, d: 2 * WEST.hh + 32 };

// ── The sea inlet in the curve of the east end ──────────────────────────────
const SEA = { from: -0.42, to: 0.58, start: 0.62 };
export function seaShare(x, y) {
  const t = bearing(x, y), r = reach(x, y);
  const across = Math.min(t - SEA.from, SEA.to - t);
  if (across <= 0) return 0;
  return Math.max(0, Math.min(1, (r - SEA.start) / 0.07)) * Math.min(1, across / 0.12);
}

// ── Highlands, the reservoir and the dam, at the back of the west end ──────
export const HIGHLAND = { x: -214, y: -104, r: 140, h: 32 };
export const RESERVOIR = { x: -226, y: -122, rx: 56, ry: 36, level: 40 };
export const DAM = { x: -166, y: -88, length: 48, top: 44 };

// ── The river: from the foot of the dam, east to the sea ────────────────────
export const RIVER_POINTS = [[-160, -78], [-128, -50], [-86, -26], [-30, -8], [30, 4], [96, 12], [160, 14], [222, 8], [276, 2]];
export const riverWidth = (t) => 14 + 12 * t;
export const riverLevel = (t) => 17 - 7 * Math.min(1, t * 1.08);

// ── The cities: blocks on a wide grid, room between them ───────────────────
// The main city north of the river; the town south-west of it. A block in
// each is a park.
export const CITY_A = { x: -12, y: -112, cols: 4, rows: 3, pitch: 50, park: [0, 2] };
export const CITY_B = { x: -150, y: 102, cols: 3, rows: 3, pitch: 42, park: [2, 0] };
export const SUBURBS = [
  { x: -262, y: 96, w: 56, d: 120 },      // west of the town
  { x: -150, y: 176, w: 120, d: 24 },     // south of the town
  { x: 30, y: -38, w: 120, d: 22 },       // the city's riverside
];

// ── Power ───────────────────────────────────────────────────────────────────
export const NUCLEAR = { towers: [[118, -160], [172, -132]], reactor: [96, -122], hall: { x: 150, y: -96, w: 50, d: 22 } };
export const WIND = [[-296, -50], [-282, -146], [-206, -176], [-296, 46]];
export const OFFSHORE = [[268, -40], [290, 44], [262, 116]];
export const SOLAR = { x: -36, y: 140, cols: 3, rows: 2, w: 26, d: 18, gap: 7 };
export const BATTERY = { x: 136, y: 128, n: 3 };
export const FACTORY = { x: 150, y: 74 };
export const DATA_CENTRE = { x: 128, y: -56, w: 38, d: 22, h: 12 };
export const HARBOUR = { x: 206, y: -42 };
export const GEOTHERMAL = (58 * Math.PI) / 180;   // the bearing of the nearest edge, where the bore is cut

export const SUBSTATIONS = { a: [-128, -176], aEast: [100, -128], b: [-224, 156], shore: [204, -6] };

// ── Roads: each joins two places that need joining ──────────────────────────
export const ROADS = {
  main: [[-150, 34], [-124, 6], [-100, -20], [-80, -46], [-60, -60]],        // the town over the river to the city
  power: [[96, -150], [108, -158], [118, -150]],                               // the city to the power station
  harbour: [[96, -84], [140, -76], [176, -54], [200, -44]],                    // the city to the harbour
  dam: [[-124, -132], [-140, -110], [-148, -86]],                              // the city to the dam's powerhouse
  works: [[-84, 120], [-30, 116], [40, 112], [110, 96], [140, 82]],            // the town past the solar to the gas works
  geo: [[40, 112], [76, 150], [100, 168]],                                     // on to the geothermal plant
};
export const ROAD_WIDTH = 9;

// ── The grid: each line runs from a source to a city, pylon to pylon ────────
export const LINES = {
  nuclear: [[132, -110], [116, -118], [100, -128]],
  hydro: [[-146, -104], [-140, -140], [-128, -176]],
  wind: [[-284, -4], [-262, 58], [-242, 110], [-224, 156]],
  offshore: [[204, -6], [170, -24], [140, -36], [104, -48]],
  link: [[-70, -70], [-92, -2], [-116, 36], [-140, 52]],
};
