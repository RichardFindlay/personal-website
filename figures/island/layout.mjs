// The island's plan: where everything stands, in metres. x runs east, y runs
// south (toward the viewer), z up; the land's surface is about z = 3, the sea's
// z = -3. Pure data and small helpers, shared by the scene and the page.
//
// The composition, as the hero camera sees it from the south-east: a dense city
// in the middle where the river meets a bay, its towers the tallest thing on
// the island; wooded hills behind it to the left with the onshore wind on the
// ridge; the power stations on a raised headland behind it to the right; open
// sea to the right with the offshore farm well out; and a low strip along the
// front (solar, farmland, a village, geothermal) so nothing stands in front of
// the city.

export const TILE = { x: 0, y: 0, w: 1100, d: 820, r: 0 };
export const DEPTH = 110;      // the block's cut faces reach this far down
export const SEA_LEVEL = -3;
export const LAND = 3;

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
const along = (line, y) => {
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    if (y >= ay && y <= by) return ax + ((bx - ax) * (y - ay)) / ((by - ay) || 1);
  }
  return y < line[0][1] ? line[0][0] : line[line.length - 1][0];
};
export function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
export const lineGap = (line, x, y) => {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
};

// ── The coast: land to the west, sea to the east ────────────────────────────
// Its y only increases, so coastX(y) is a function. From the back: the power
// stations' cliffed headland, the bay the river runs into, the port's straight
// quay, a cliffed point, then a beach out through the front face.
export const COAST_POINTS = [[742, 0], [768, 60], [752, 140], [776, 206], [736, 262], [668, 296], [662, 340], [700, 392], [712, 406], [714, 470], [712, 528], [700, 560], [726, 610], [748, 650], [796, 720], [846, 820]];
export const COAST = smoothLine(COAST_POINTS, 5);
export const coastX = (y) => along(COAST, y);
export const onLand = (x, y) => x < coastX(y);
// what kind of shore each stretch is
export const SHORE = (y) => (y < 262 ? "cliff" : y < 392 ? "beach" : y < 540 ? "quay" : y < 660 ? "cliff" : "beach");

// ── The river: down from the hills, through the city into the bay ──────────
export const RIVER_POINTS = [[318, 0], [336, 70], [384, 146], [452, 214], [532, 266], [604, 300], [672, 318]];
export const RIVER = smoothLine(RIVER_POINTS, 5);
export const riverWidth = (t) => 18 + 22 * t * t;
export function fromRiver(x, y) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, ay] = RIVER[i], [bx, by] = RIVER[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy) - riverWidth((i + t) / (RIVER.length - 1)) / 2);
  }
  return best;
}

// ── Relief: wooded hills behind the city, the power stations' plateau ───────
export const HILLS = [
  { x: 150, y: 150, r: 210, h: 66 },  // the ridge the onshore wind stands on
  { x: 360, y: 30, r: 130, h: 34 },
  { x: 90, y: 660, r: 130, h: 16 },   // a soft rise behind the village
];
export const PLATEAU = { poly: [[470, 20], [760, 20], [770, 220], [700, 252], [480, 240]], z: 18 };
export const heightAt = (x, y) => HILLS.reduce((z, h) => {
  const q = Math.hypot(x - h.x, y - h.y) / h.r;
  return q >= 1 ? z : z + h.h * (1 - q * q) ** 2;
}, 0);

// ── The city ────────────────────────────────────────────────────────────────
// A grid of blocks south of the river, a smaller quarter north of it, the
// tallest towers on the waterfront. Heights fall away from the core.
export const CITY = {
  core: [566, 420],
  south: { x0: 250, x1: 700, y0: 318, y1: 652 },
  north: { x0: 400, x1: 600, y0: 214, y1: 262 },
  block: 44, street: 12,
  park: { x: 392, y: 470, w: 56, d: 56 },
  stadium: { x: 352, y: 590, r: 34 },
  port: { x: 640, y: 410, w: 70, d: 120 },
};

// ── Sites ───────────────────────────────────────────────────────────────────
export const SITES = {
  nuclear: { x: 560, y: 28, w: 196, d: 150 },
  gas: { x: 482, y: 120, w: 80, d: 90 },
  solar: { x: 440, y: 688, w: 230, d: 104 },
  battery: { x: 690, y: 664, w: 50, d: 40 },
  converter: { x: 600, y: 580, w: 56, d: 44 },
  substation: { x: 252, y: 300, w: 40, d: 30 },
  geothermal: { x: 40, y: 724, w: 120, d: 70 },
  village: { x: 170, y: 680, w: 150, d: 100 },
};

// ── Roads, as centre lines ───────────────────────────────────────────────────
export const ROADS = {
  // the motorway in from the west, round the back of the city, over the river
  // and up to the power stations
  ring: [[0, 410], [120, 400], [230, 380], [280, 320], [380, 270], [470, 252], [520, 248], [560, 236], [640, 212], [700, 190]],
  // the front road: from the village past the solar farm to the beach
  front: [[0, 650], [110, 640], [200, 664], [330, 660], [430, 668], [560, 676], [690, 652], [760, 640]],
  // up from the front road into the city
  link: [[330, 660], [330, 600], [306, 520], [300, 420], [280, 320]],
  // the geothermal plant's lane
  lane: [[110, 640], [100, 700], [96, 740]],
};
export const ROAD_WIDTH = { ring: 12, front: 8, link: 9, lane: 6 };

// ── Wind: onshore along the ridge, offshore in rows well out to sea ────────
// Every rotor faces south-south-west, into the prevailing wind.
export const WIND_FROM = (() => { const a = (200 * Math.PI) / 180; return [Math.sin(a), -Math.cos(a), 0]; })();
export const ONSHORE = [[60, 120], [140, 70], [226, 104], [110, 196], [196, 220], [272, 170]];
export const OFFSHORE = (() => {
  const out = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
    const x = 880 + col * 92 + (row % 2) * 40, y = 70 + row * 140;
    if (x < 1050 && y < 690) out.push([x, y]);
  }
  return out;
})();

// ── The grid: the 400 kV line from the power stations to the city ────────────
export const PYLONS = [[540, 232], [454, 236], [372, 248], [300, 262], [270, 296]];
// the interconnector: from the converter station out under the sea
export const INTERCONNECTOR = [[656, 600], [720, 598], [820, 590], [960, 584], [1100, 580]];
