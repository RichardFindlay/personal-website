// The island's plan, in metres from its centre: x runs east, y south (toward
// the viewer), z up. A floating island in the spirit of the current homepage
// hero, pushed toward a game: a soft-cornered, bayed outline; highlands with a
// reservoir and a hydro dam; a river from the dam to a sea inlet on the east;
// two cities either side of the river; the power stations each wired to them
// by pylons; roads that join the places that need joining. Pure data and
// small helpers, shared by the scene and the page.
//
// The camera looks from the south-east at 45°: back is north-west (-x, -y),
// front south-east (+x, +y), screen left south-west (-x, +y).

export const DEPTH = 70;        // the slab under the grass
export const TOP = 14;          // the lowland's surface
export const WATER = 10;        // the sea's surface in the inlet
export const BED = 3;           // the sea bed

export const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── The outline: a squircle with gentle bays, as a radius for each bearing ──
const RX = 300, RY = 238, N = 5;
export function radius(theta) {
  const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
  const squircle = 1 / Math.pow(Math.pow(c / RX, N) + Math.pow(s / RY, N), 1 / N);
  const bays = 1 + 0.045 * Math.cos(3 * theta + 0.7) + 0.035 * Math.cos(5 * theta + 2.1) + 0.022 * Math.cos(8 * theta + 0.4);
  return squircle * bays;
}
export const edgeAt = (theta, k = 1) => [Math.cos(theta) * radius(theta) * k, Math.sin(theta) * radius(theta) * k];
export const bearing = (x, y) => Math.atan2(y, x);
export const reach = (x, y) => Math.hypot(x, y) / radius(bearing(x, y));
export const BOUNDS = { x: -RX - 20, y: -RY - 20, w: 2 * RX + 40, d: 2 * RY + 40 };

// ── The sea inlet on the east: water across the outer half of a sector ─────
const SEA = { from: -0.52, to: 0.62, start: 0.52 };
export function seaShare(x, y) {
  const t = bearing(x, y), r = reach(x, y);
  const across = Math.min(t - SEA.from, SEA.to - t);
  if (across <= 0) return 0;
  return Math.max(0, Math.min(1, (r - SEA.start) / 0.08)) * Math.min(1, across / 0.14);
}

// ── Highlands, the reservoir and the dam ────────────────────────────────────
export const HIGHLAND = { x: -190, y: -112, r: 140, h: 32 };
export const RESERVOIR = { x: -200, y: -126, rx: 58, ry: 40, level: 40 };
export const DAM = { x: -142, y: -86, length: 50, top: 44 };   // across the valley, facing the flow

// ── The river: from the foot of the dam to the sea ──────────────────────────
export const RIVER_POINTS = [[-136, -76], [-104, -46], [-66, -18], [-20, 2], [36, 16], [96, 24], [150, 20], [210, 12]];
export const riverWidth = (t) => 14 + 12 * t;
export const riverLevel = (t) => 17 - 7 * Math.min(1, t * 1.1);   // falls from the dam to the sea

// ── The cities ──────────────────────────────────────────────────────────────
// The main city north of the river: towers on a grid of blocks, the tallest in
// the middle. The second town south of it: mid-rise blocks and a few towers.
export const CITY_A = { x: 10, y: -98, cols: 4, rows: 3, pitch: 32, plinth: [136, 104] };
export const CITY_B = { x: -104, y: 96, cols: 3, rows: 3, pitch: 30, plinth: [104, 96] };
export const SUBURBS = [
  { x: -40, y: -168, w: 120, d: 40 },     // behind the main city
  { x: -170, y: 60, w: 50, d: 90 },       // west of the town
  { x: -60, y: 156, w: 90, d: 46 },       // south of the town
];

// ── Power ───────────────────────────────────────────────────────────────────
export const NUCLEAR = { towers: [[112, -178], [158, -150]], reactor: [96, -136], hall: { x: 150, y: -108, w: 50, d: 24 } };
export const WIND = [[-246, -28], [-250, -104], [-196, -182], [-118, -200]];
export const OFFSHORE = [[236, -40], [264, 34], [230, 104]];
export const SOLAR = { x: 16, y: 150, cols: 3, rows: 2, w: 26, d: 18, gap: 7 };
export const BATTERY = { x: 120, y: 150, n: 3 };
export const FACTORY = { x: 112, y: 92 };
export const DATA_CENTRE = { x: 96, y: -60, w: 40, d: 26, h: 12 };
export const HARBOUR = { x: 178, y: -36 };
export const GEOTHERMAL = Math.PI / 4;   // the bearing of the near edge, where the bore is cut

// substations, where a line comes down at a city's edge
export const SUBSTATIONS = { a: [-62, -138], aEast: [86, -126], b: [-150, 132], shore: [176, -8] };

// ── Roads: each joins two places that need joining ──────────────────────────
export const ROADS = {
  // the main road: from the town over the river to the city
  main: [[-104, 50], [-80, 22], [-46, 0], [-26, -18], [-10, -46]],
  // the city to the power station
  power: [[60, -122], [86, -150], [104, -160]],
  // the city to the harbour
  harbour: [[72, -76], [118, -58], [160, -44], [176, -38]],
  // up from the city to the dam's powerhouse
  dam: [[-56, -98], [-92, -88], [-120, -74]],
  // the town to the solar farm, the battery and the gas station
  works: [[-50, 108], [0, 124], [60, 128], [104, 120], [116, 104]],
  // on to the geothermal plant at the near edge
  geo: [[104, 120], [140, 150], [168, 178]],
};
export const ROAD_WIDTH = 9;

// ── The grid: each line runs from a source to a city, pylon to pylon ────────
export const LINES = {
  nuclear: [[124, -122], [104, -118], [86, -126]],                 // to the city's east substation
  hydro: [[-110, -98], [-86, -122], [-62, -138]],                  // the powerhouse up to the city
  wind: [[-226, 14], [-196, 64], [-170, 108], [-150, 132]],        // the ridge down to the town
  offshore: [[176, -8], [140, -24], [118, -40], [96, -52]],        // the shore to the data centre's side of the city
  link: [[-36, -40], [-56, 20], [-84, 56], [-104, 60]],            // the city to the town, over the river
};
