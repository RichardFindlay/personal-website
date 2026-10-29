// The island's plan: where everything stands, in metres. x runs east, y runs
// south (toward the viewer), z up; the land's surface is z = 0. Pure data and
// small helpers, so the build and the page's live script place things alike.

export const TILE = { x: 0, y: 0, w: 1100, d: 760, r: 0 };
export const DEPTH = 150;      // the block's cut faces reach this far down
export const SEA_LEVEL = -3;   // the sea and river lie a little under the land

// Seeded randomness, the same generator the card builds use.
export const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Catmull-Rom through plan points, about `step` metres a sample.
export function smoothLine(points, step = 6) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ── The coast: land to the west of it, the sea to the east ──────────────────
// Its y only ever increases, so coastX(y) is a function: a headland for the
// power stations at the back, a bay, the converter station's point, then the
// shore runs out through the front face.
export const COAST_POINTS = [[930, 0], [952, 44], [938, 110], [958, 172], [930, 236], [884, 282], [902, 340], [888, 410], [866, 462], [884, 526], [910, 592], [890, 652], [858, 712], [842, 760]];
export const COAST = smoothLine(COAST_POINTS, 5);
export function coastX(y) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const [ax, ay] = COAST[i], [bx, by] = COAST[i + 1];
    if (y >= ay && y <= by) return ax + ((bx - ax) * (y - ay)) / ((by - ay) || 1);
  }
  return y < 0 ? COAST[0][0] : COAST[COAST.length - 1][0];
}
export const onLand = (x, y) => x < coastX(y);

// ── The river: from the hills at the back, out through the front face ───────
export const RIVER_POINTS = [[236, 0], [256, 70], [318, 158], [418, 238], [494, 318], [548, 418], [590, 508], [628, 600], [664, 690], [684, 760]];
export const RIVER = smoothLine(RIVER_POINTS, 6);
export const riverWidth = (t) => 14 + 18 * t * t;   // t from 0 at the back to 1 at the front
export function riverAt(y) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, ay] = RIVER[i], [bx, by] = RIVER[i + 1];
    if (y >= ay && y <= by) return ax + ((bx - ax) * (y - ay)) / ((by - ay) || 1);
  }
  return null;
}
// distance from a point to the river's centre line, less its half width
export function fromRiver(x, y) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, ay] = RIVER[i], [bx, by] = RIVER[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy) - riverWidth((i + t) / (RIVER.length - 1)) / 2;
    best = Math.min(best, d);
  }
  return best;
}

// ── Hills: low domes, in metres of radius and height ─────────────────────────
export const HILLS = [
  { x: 712, y: 372, r: 110, h: 42 },  // the wind farm's ridge
  { x: 806, y: 468, r: 74, h: 26 },
  { x: 96, y: 300, r: 92, h: 38 },    // the wooded hill behind the town
  { x: 470, y: 66, r: 70, h: 24 },
];
// the land's height at a point: the sum of the hills' smooth bumps
export const heightAt = (x, y) => HILLS.reduce((z, h) => {
  const q = Math.hypot(x - h.x, y - h.y) / h.r;
  return q >= 1 ? z : z + h.h * (1 - q * q) ** 2;
}, 0);

// ── Roads, as centre lines ────────────────────────────────────────────────────
export const ROADS = {
  // the A road: in from the west edge, through the town, over the river, on to the coast
  main: [[0, 506], [90, 512], [180, 528], [262, 534], [350, 520], [430, 494], [522, 472], [600, 470], [676, 498], [742, 552], [796, 600], [852, 614]],
  // north from the town to the village, round the wooded hill
  north: [[262, 534], [232, 450], [196, 382], [178, 300], [186, 214], [168, 150], [132, 96]],
  // the power stations' road, up the east side of the river
  station: [[676, 498], [636, 420], [612, 330], [616, 252], [652, 194], [700, 166], [756, 196], [790, 210]],
  // down to the geothermal plant and the front
  south: [[180, 528], [168, 600], [150, 672], [128, 716]],
  // the town's loop
  loop: [[262, 534], [300, 600], [372, 628], [430, 588], [430, 494]],
};
export const ROAD_WIDTH = { main: 9, north: 7, station: 7, south: 6, loop: 6 };

// ── Sites, each a plan rectangle {x, y, w, d} ────────────────────────────────
export const SITES = {
  nuclear: { x: 758, y: 24, w: 170, d: 168 },
  gas: { x: 648, y: 44, w: 96, d: 80 },
  geothermal: { x: 52, y: 668, w: 120, d: 72 },
  solar: { x: 712, y: 628, w: 118, d: 118 },
  battery: { x: 742, y: 560, w: 64, d: 46 },
  converter: { x: 818, y: 588, w: 52, d: 40 },
  substation: { x: 214, y: 360, w: 40, d: 30 },
  town: { x: 226, y: 420, w: 220, d: 210 },
  village: { x: 70, y: 62, w: 140, d: 112 },
};

// ── Where people live: the town's and the village's built-up ground ─────────
export const URBAN = {
  town: [[140, 490], [214, 468], [206, 340], [244, 326], [272, 418], [332, 440], [424, 456], [456, 494], [452, 646], [382, 662], [300, 646], [246, 606], [204, 562], [140, 556]],
  village: [[66, 72], [196, 58], [214, 176], [126, 204], [58, 170]],
};
export function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ── Wind: onshore on the ridge, offshore in rows in the sea ──────────────────
// Every rotor faces south-south-west, into the prevailing wind.
export const WIND_FROM = (() => { const a = (200 * Math.PI) / 180; return [Math.sin(a), -Math.cos(a), 0]; })();
export const ONSHORE = [[652, 330], [714, 300], [770, 344], [690, 410], [752, 436], [818, 470]];
export const OFFSHORE = (() => {
  const out = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 2; col++) {
    const x = 1000 + col * 58 + (row % 2) * 26, y = 74 + row * 128;
    if (x < 1080) out.push([x, y]);
  }
  return out;
})();

// ── The grid: the 400 kV line from the power stations to the town ────────────
export const PYLONS = [[750, 222], [690, 236], [560, 214], [436, 196], [330, 232], [246, 300], [234, 352]];
// the interconnector: from the converter station under the sea, out through the east face
export const INTERCONNECTOR = [[862, 612], [920, 618], [990, 626], [1060, 632], [1100, 634]];
