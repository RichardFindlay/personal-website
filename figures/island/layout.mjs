// The island's plan, in metres from its centre: x runs east, y south (toward
// the viewer), z up. A square island with rounded corners, after Bruno
// Simon's folio: grass everywhere, wide sandy paths winding between the
// places, ponds and a bay, and the whole GB power system set out across it.
// Highlands with a reservoir and a hydro dam in the north-west; a river from
// the dam across the middle into a bay on the east; the main city north of the
// river and a town south-west of it; every power station wired to them by
// pylons. Pure data and small helpers, shared by the scene and the page.
//
// The camera looks from the south-east, 50° round and 30° up: the south and
// east faces of the slab face the viewer, back is north (-y), screen left is west.

export const DEPTH = 64;        // the slab under the grass
export const TOP = 14;          // the lowland's surface
export const WATER = 10;        // the sea's surface in the bay
export const BED = 4;           // the sea bed

export const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── The outline: a rounded square, as a radius for each bearing ────────────
export const HALF = 310, CORNER = 118;
function outside(x, y) {
  const qx = Math.abs(x) - (HALF - CORNER), qy = Math.abs(y) - (HALF - CORNER);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CORNER;
}
const TABLE = 2048;
const RADII = Array.from({ length: TABLE + 1 }, (_, i) => {
  const t = (i / TABLE) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
  let lo = 0, hi = 600;
  for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (outside(c * m, s * m) < 0) lo = m; else hi = m; }
  return lo * (1 + 0.006 * Math.sin(7 * t + 1.1) + 0.004 * Math.sin(13 * t + 0.4));
});
export function radius(theta) {
  const u = (((theta / (Math.PI * 2)) % 1) + 1) % 1 * TABLE, i = Math.floor(u), f = u - i;
  return RADII[i] * (1 - f) + RADII[i + 1] * f;
}
export const edgeAt = (theta, k = 1) => [Math.cos(theta) * radius(theta) * k, Math.sin(theta) * radius(theta) * k];
export const bearing = (x, y) => Math.atan2(y, x);
export const reach = (x, y) => Math.hypot(x, y) / radius(bearing(x, y));
export const BOUNDS = { x: -HALF - 16, y: -HALF - 16, w: 2 * HALF + 32, d: 2 * HALF + 32 };

// ── The bay on the east: water across the outer part of a sector, its shore
// wandering in coves and spits rather than a clean curve ───────────────────
export const SEA = { from: -0.36, to: 0.74 };
const wobble = (t, k) => 0.5 * Math.sin(3.1 * t + 0.4 + k) + 0.3 * Math.sin(7.3 * t + 1.9 + k) + 0.2 * Math.sin(13.7 * t + 0.2 + k);
export const shoreStart = (t) => 0.6 + 0.07 * wobble(t, 0) - 0.05 * Math.max(0, Math.cos(5 * t + 0.9)) ** 3;   // a deep cove or two
export function seaShare(x, y) {
  const t = bearing(x, y), r = reach(x, y);
  const across = Math.min(t - (SEA.from + 0.03 * wobble(r * 4, 2)), (SEA.to + 0.03 * wobble(r * 4, 5)) - t);
  if (across <= 0) return 0;
  return Math.max(0, Math.min(1, (r - shoreStart(t)) / 0.05)) * Math.min(1, across / 0.1);
}
// how deep the bay is at a point: a basin, deepest in the middle of the sector
// and well out from the shore, cut open at the island's edge
export function basinDepth(x, y) {
  const t = bearing(x, y), r = reach(x, y);
  const across = Math.min(1, Math.max(0, (t - SEA.from) / (SEA.to - SEA.from)));
  const bowl = Math.pow(Math.sin(Math.PI * across), 0.8);
  const s0 = shoreStart(t), out = Math.min(1, Math.max(0, (r - s0) / 0.16));
  return 1.5 + 26 * bowl * out * (2 - out);
}
// ponds and the reservoir: lobed outlines, a radius for each angle round the centre
export const lobed = (a, k) => 1 + 0.22 * Math.sin(3 * a + k) + 0.12 * Math.sin(5 * a + 2 * k) + 0.06 * Math.sin(9 * a + k);
export const PONDS = [{ x: -232, y: 44, r: 20, k: 0.7 }, { x: 60, y: 236, r: 16, k: 2.1 }];

// ── Highlands, the reservoir and the dam ────────────────────────────────────
export const HIGHLAND = { x: -196, y: -176, r: 150, h: 34 };
// rocky mountains: peaks with steep sides, grey rock above the grass line
export const MOUNTAINS = [
  { x: -262, y: -262, r: 92, h: 74 }, { x: -186, y: -282, r: 70, h: 56 }, { x: -292, y: -176, r: 62, h: 46 },
  { x: 262, y: -262, r: 80, h: 56 }, { x: 196, y: -288, r: 56, h: 40 },
  { x: -270, y: 250, r: 54, h: 30 }, { x: 236, y: -104, r: 34, h: 18 },
];
export const ROCK_LINE = 38;   // above this height the ground is bare rock
export const RESERVOIR = { x: -206, y: -196, rx: 56, ry: 38, level: 42, k: 1.3 };
export const DAM = { x: -152, y: -142, length: 46, top: 46 };

// ── The river: from the foot of the dam, across the middle to the bay ───────
export const RIVER_POINTS = [[-146, -132], [-120, -92], [-92, -34], [-44, 16], [36, 40], [130, 50], [214, 56], [290, 62]];
export const riverWidth = (t) => 14 + 12 * t;
export const riverLevel = (t) => 17 - 7 * Math.min(1, t * 1.08);

// ── The cities ──────────────────────────────────────────────────────────────
export const CITY_A = { x: 24, y: -122, cols: 4, rows: 3, pitch: 44, park: [0, 2] };
export const CITY_B = { x: -170, y: 112, cols: 3, rows: 3, pitch: 40, park: [2, 0] };
export const SUBURBS = [
  { x: -252, y: -24, w: 48, d: 90 },      // west, by the pond
  { x: -140, y: 206, w: 130, d: 26 },     // south of the town
  { x: 70, y: -34, w: 120, d: 22 },       // the city's riverside
];

// ── Power ───────────────────────────────────────────────────────────────────
export const NUCLEAR = { towers: [[186, -214], [238, -168]], reactor: [152, -158], hall: { x: 196, y: -120, w: 50, d: 22 } };
export const WIND = [[-278, -92], [-236, -250], [-150, -266], [-282, -4]];
export const OFFSHORE = [[262, -34], [288, 44], [258, 114]];
export const SOLAR = { x: 8, y: 152, cols: 3, rows: 2, w: 26, d: 18, gap: 7 };
export const BATTERY = { x: 128, y: 160, n: 3 };
export const FACTORY = { x: 176, y: 112 };
export const DATA_CENTRE = { x: 132, y: -68, w: 36, d: 22, h: 11 };
export const JETTY = { x: 196, y: -22, length: 44 };
export const GEOTHERMAL = Math.atan2(HALF, 112);   // the bearing of the front edge where the bore is cut

export const SUBSTATIONS = { a: [-98, -204], aEast: [128, -142], b: [-248, 176], shore: [194, -56] };

// ── Paths: wide sandy tracks, each joining two places ───────────────────────
export const PATHS = {
  main: [[-150, 62], [-120, 30], [-92, -4], [-64, -42], [-46, -62]],              // the town over the river to the city
  power: [[80, -176], [120, -192], [158, -198]],                                   // the city to the power station
  harbour: [[104, -96], [150, -82], [186, -54], [196, -32]],                       // the city to the jetty
  dam: [[-56, -150], [-98, -134], [-130, -124]],                                   // the city to the dam's powerhouse
  works: [[-124, 150], [-40, 164], [44, 174], [112, 176], [150, 146], [172, 128]], // the town past the solar to the works
  geo: [[112, 176], [116, 230], [112, 284]],                                       // on to the geothermal plant
  west: [[-150, 62], [-196, 30], [-236, 2], [-252, -36]],                          // the town out to the village
};
export const PATH_WIDTH = 10;

// ── The grid: each line runs from a source to a city, pylon to pylon ────────
export const LINES = {
  nuclear: [[176, -134], [152, -138], [128, -142]],
  hydro: [[-130, -154], [-114, -180], [-98, -204]],
  wind: [[-270, -56], [-264, 10], [-258, 70], [-252, 124], [-248, 176]],
  offshore: [[194, -56], [166, -64], [140, -72]],
  link: [[-60, -56], [-90, 2], [-122, 44], [-150, 62]],
};
