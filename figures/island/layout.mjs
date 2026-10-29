// The island's plan, in metres from its centre: x runs east, y south (toward
// the viewer), z up. A floating island in the spirit of the current homepage
// hero, pushed toward a game: a soft-cornered, bayed outline; a sea inlet on
// the east for the offshore turbines; a few big, toy-like landmarks; lollipop
// trees; glowing circuit traces carrying energy to the city. Pure data and
// small helpers, shared by the scene and the page.

export const DEPTH = 70;        // the slab under the grass
export const TOP = 14;          // the land's surface
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
// how far a point is across the island, 0 at the centre and 1 at the edge
export const reach = (x, y) => Math.hypot(x, y) / radius(bearing(x, y));
export const inside = (x, y, margin = 0) => Math.hypot(x, y) < radius(bearing(x, y)) - margin;
export const BOUNDS = { x: -RX - 20, y: -RY - 20, w: 2 * RX + 40, d: 2 * RY + 40 };

// ── The sea inlet on the east: water across the outer half of a sector ─────
const SEA = { from: -0.72, to: 0.62, start: 0.5 };
export function seaShare(x, y) {
  const t = bearing(x, y), r = reach(x, y);
  const across = Math.min(t - SEA.from, SEA.to - t);
  if (across <= 0) return 0;
  const side = Math.min(1, across / 0.16);
  return Math.max(0, Math.min(1, (r - SEA.start) / 0.08)) * side;
}

// ── Landmarks, in plan ──────────────────────────────────────────────────────
// The camera looks from the south-east at 45°: back is north-west (-x, -y),
// front south-east (+x, +y), screen left south-west (-x, +y).
export const CITY = { x: -50, y: -60, towers: [
  // [dx, dy, w, d, h, colour]
  [-34, -34, 26, 26, 96, "slate"], [0, -38, 24, 24, 120, "cream"], [34, -32, 26, 26, 78, "terracotta"],
  [-38, 0, 24, 26, 68, "terracotta"], [-2, 0, 28, 28, 150, "glass"], [34, 2, 24, 24, 88, "sage"],
  [-34, 36, 26, 24, 52, "sage"], [0, 36, 24, 24, 72, "slate"], [34, 34, 26, 26, 46, "cream"],
] };
export const DATA_CENTRE = { x: 70, y: -120, w: 46, d: 30, h: 12 };
export const WIND = [[-205, -20], [-175, 52], [-232, 72]];
export const HILL = { x: -200, y: 30, r: 120, h: 16 };
export const NUCLEAR = { towers: [[110, -170], [168, -128]], reactor: [70, -178], hall: { x: 120, y: -98, w: 52, d: 26 } };
export const OFFSHORE = [[232, -46], [262, 30], [226, 104]];
export const SOLAR = { x: -150, y: 110, cols: 3, rows: 2, w: 30, d: 20, gap: 8 };
export const BATTERY = { x: -24, y: 150, n: 4 };
export const FACTORY = { x: 70, y: 110 };
export const POND = { x: -130, y: -110, r: 22 };
export const GEOTHERMAL = Math.PI / 4;   // the bearing of the near edge, where the bore is cut
export const ROAD = [[-130, -10], [-110, 60], [-40, 80], [40, 70], [110, 40], [130, -40], [100, -80], [40, -10], [-30, 40], [-110, 40], [-130, -10]];
export const PYLONS = [[120, -60], [70, -40], [20, -36]];
// circuit traces: right-angled runs from each source to the city, like a board
export const TRACES = [
  [[-150, 90], [-150, 60], [-90, 60], [-90, -20], [-75, -20]],          // solar to the city
  [[-24, 140], [-24, 100], [10, 100], [10, 2], [-20, 2]],               // battery to the city
  [[-180, 40], [-120, 40], [-120, -40], [-80, -40]],                    // wind to the city
  [[70, -110], [70, -80], [0, -80], [0, -70]],                          // data centre to the city
  [[200, 40], [150, 40], [150, 0], [60, 0], [60, -40], [-20, -40]],     // offshore to the city
];
