// The island as a scene description for Blender: the terrain's heights and
// colours, the cut faces with their rock, and every building, tree, turbine and
// pylon as simple primitives. All the geometry is decided here, from layout.mjs;
// blender/island.py only turns it into meshes, bakes the soft shadows and
// exports. Units are metres: x east, y south (toward the viewer), z up.
import * as W from "./layout.mjs";

const { TILE, DEPTH, SEA_LEVEL } = W;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// value noise, as the cyclone card's land uses
const hash = (x, y, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function noise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed = 0) => { let s = 0, amp = 0.5, n = 0; for (let o = 0; o < 4; o++) { s += amp * noise(x, y, seed + o * 31); n += amp; x *= 2.03; y *= 2.03; amp *= 0.5; } return (s / n - 0.5) * 2; };

// ── Palette: a bright, soft daylight toy ─────────────────────────────────────
export const PALETTE = {
  grass: ["#7cbf4a", "#86c853", "#71b443", "#93cf5c", "#a6cf5e", "#c9cf6e"],
  urban: "#9fc47e", pad: "#d4d1c8", sand: "#e8d8a8", wetsand: "#d2c08f", rock: "#9aa2a8", rockDark: "#7d868d",
  seabed: "#dccb98", seabedDeep: "#6fa4a8", bank: "#b9a77a",
  asphalt: "#7c8187", marking: "#f3f3ee",
  layers: { grass: "#6fb043", topsoil: "#6e5238", subsoil: "#a07a52", sediment: "#d8c69a", sandstone: "#cfa86f", mudstone: "#8f877a", limestone: "#e1d8c2", granite: "#ab998e", water: "#2f9cc0" },
  render: "#f1ece2", brick: "#c27a58", stone: "#dcd2bf", slate: "#5f6d78", tile: "#b5603f", glass: "#9fc3d9",
  concrete: "#dedad1", hall: "#a9bccb", steel: "#9aa4ac", white: "#f4f6f7", safety: "#e7b52d", dark: "#4b545c",
  pv: "#2c4870", pvFrame: "#c9d2da", container: "#eef1f3", leaf: ["#5fae3c", "#6cbd44", "#4f9e34", "#7dc94f"], trunk: "#7a5b40",
  red: "#cf4b3c", boat: "#f6f6f3", pitch: "#6fbf4c",
  cars: ["#f2f3f4", "#d0483d", "#3f72a8", "#2e9486", "#e8b730", "#2f353b"],
};

// ── The ground's height ──────────────────────────────────────────────────────
// Land a few metres above the sea, the hills on it, the headlands raised into
// rocky cliffs, beaches where the coast is low, the river cut down to the sea.
const cliffiness = (y) => Math.max(1 - smooth(200, 270, y), smooth(520, 560, y) * (1 - smooth(668, 712, y)));
const LAND = 2;
function groundZ(x, y) {
  const d = W.coastX(y) - x;
  const c = cliffiness(y);
  let z;
  if (d >= 0) {
    const raise = c * (7 + 3 * fbm(x / 40, y / 40, 4)) * (1 - smooth(50, 150, d));
    z = LAND + W.heightAt(x, y) + 0.7 * fbm(x / 70, y / 70, 1) + raise;
    if (c < 0.5) z = lerp(SEA_LEVEL - 0.6, z, smooth(0, 22, d)); // a beach shelving into the sea
  } else {
    // the seabed falls away; under a cliff it starts deeper and rougher
    z = SEA_LEVEL - Math.min(22, 1.2 + 0.13 * -d + c * 5) + 0.8 * fbm(x / 30, y / 30, 2);
  }
  const r = W.fromRiver(x, y);
  if (r < 9 && d > 0) z = r < 0 ? SEA_LEVEL - 2.4 + 0.6 * smooth(-6, 0, r) : lerp(SEA_LEVEL + 0.4, z, smooth(0, 9, r));
  // the pads the stations stand on are levelled
  for (const s of PADS) if (x > s.x - 6 && x < s.x + s.w + 6 && y > s.y - 6 && y < s.y + s.d + 6) {
    const e = Math.min(x - s.x + 6, s.x + s.w + 6 - x, y - s.y + 6, s.y + s.d + 6 - y);
    z = lerp(z, s.z, smooth(0, 6, e));
  }
  return z;
}
const PAD_NAMES = ["nuclear", "gas", "geothermal", "battery", "converter", "substation", "solar"];
const PADS = PAD_NAMES.map((n) => ({ ...W.SITES[n], name: n, z: 0 }));
for (const p of PADS) p.z = LAND + W.heightAt(p.x + p.w / 2, p.y + p.d / 2) + (p.name === "nuclear" ? 6 : p.name === "converter" ? 5 : 0);
export const ground = (x, y) => groundZ(x, y);

// field colours: a jittered grid of soft greens, a hay meadow here and there
function fieldColour(x, y) {
  const CW = 58, CD = 44;
  const i = Math.floor((x + 20 * fbm(x / 90, y / 90, 9)) / CW), j = Math.floor((y + 16 * fbm(x / 90, y / 90, 7)) / CD);
  const pick = hash(i, j, 5);
  const base = hex(PALETTE.grass[Math.floor(pick * PALETTE.grass.length)]);
  return mix(base, hex("#5c9a38"), 0.12 * (fbm(x / 12, y / 12, 3) + 0.5));
}

function groundColour(x, y, z, slope) {
  const d = W.coastX(y) - x;
  if (d < 0 && z < SEA_LEVEL) return mix(hex(PALETTE.seabed), hex(PALETTE.seabedDeep), smooth(SEA_LEVEL - 1, SEA_LEVEL - 14, z));
  if (slope > 0.9) return mix(hex(PALETTE.rock), hex(PALETTE.rockDark), 0.5 + 0.5 * fbm(x / 9, y / 9, 6));
  if (z < SEA_LEVEL + 1.4) return hex(PALETTE.wetsand);
  if (d < 26 && cliffiness(y) < 0.5) return hex(PALETTE.sand);
  if (W.fromRiver(x, y) < 3) return hex(PALETTE.bank);
  for (const s of PADS) if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.d) return hex(s.name === "solar" ? PALETTE.grass[3] : PALETTE.pad);
  for (const poly of Object.values(W.URBAN)) if (W.inside(poly, x, y)) return mix(hex(PALETTE.urban), fieldColour(x, y), 0.25);
  return fieldColour(x, y);
}

// ── The terrain grid ────────────────────────────────────────────────────────
export const STEP = 5;
export function terrain() {
  const nx = Math.round(TILE.w / STEP) + 1, ny = Math.round(TILE.d / STEP) + 1;
  const heights = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = groundZ(i * STEP, j * STEP);
  const colours = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const z = heights[j * nx + i];
    const zx = heights[j * nx + Math.min(nx - 1, i + 1)] - heights[j * nx + Math.max(0, i - 1)];
    const zy = heights[Math.min(ny - 1, j + 1) * nx + i] - heights[Math.max(0, j - 1) * nx + i];
    const slope = Math.hypot(zx, zy) / (2 * STEP);
    colours.push(...groundColour(i * STEP, j * STEP, z, slope).map((v) => Math.round(v * 255)));
  }
  return { nx, ny, step: STEP, heights: [...heights].map((v) => Math.round(v * 100) / 100), colours };
}

// ── The cut faces: the rock under each edge ─────────────────────────────────
const LAYERS = ["water", "grass", "topsoil", "subsoil", "sediment", "sandstone", "mudstone", "limestone", "granite"];
function column(x, y, s) {
  const top = groundZ(x, y);
  const wet = top < SEA_LEVEL;
  const surface = wet ? SEA_LEVEL : top;
  const land = wet ? 0 : 1;
  const t = [wet ? SEA_LEVEL - top : 0, 2.5 * land, 7 * land, 12 * land, wet ? 8 : 0];
  const z = [surface];
  for (const h of t) z.push(z[z.length - 1] - h);
  const wave = (base, amp, len, ph) => base + amp * Math.sin(s / len + ph) + amp * 0.4 * Math.sin(s / (len * 0.37) + ph * 2.3);
  z.push(Math.min(z[z.length - 1] - 4, wave(-50, 5, 80, 0.4)));
  z.push(wave(-78, 6, 110, 1.9));
  z.push(wave(-103, 5, 70, 3.1));
  z.push(-DEPTH);
  return z;
}
export function sides() {
  // all four edges, each sampled on the terrain grid so its top meets the ground
  const corners = [[0, TILE.d], [TILE.w, TILE.d], [TILE.w, 0], [0, 0]];
  const edges = [];
  let s = 0;
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e], [bx, by] = corners[(e + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay), n = Math.round(len / STEP);
    const samples = [];
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
      samples.push({ x, y, z: column(x, y, s + (len * i) / n).map((v) => Math.round(v * 100) / 100) });
    }
    s += len;
    edges.push(samples);
  }
  return { layers: LAYERS, colours: LAYERS.map((l) => PALETTE.layers[l]), edges };
}

// ── Primitives ──────────────────────────────────────────────────────────────
const prims = [], protos = {}, instances = [];
const P = (kind, spec) => prims.push({ kind, group: "static", ...spec });
const on = (x, y) => groundZ(x, y);
const R = W.seeded(41);

// ribbons: roads and their markings, laid just over the ground
function ribbon(line, width, lift, colour, group = "static", dash = 0) {
  const pts = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = width / 2;
    const [x, y] = line[i];
    pts.push([[x - (dy / l) * w, y + (dx / l) * w], [x + (dy / l) * w, y - (dx / l) * w]]);
  }
  const quads = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (dash && i % 2) continue;
    const q = [pts[i][0], pts[i][1], pts[i + 1][1], pts[i + 1][0]].map(([x, y]) => [x, y, Math.max(on(x, y), SEA_LEVEL + 0.6) + lift]);
    quads.push(q);
  }
  prims.push({ kind: "quads", quads, colour, group });
}
const ROADS = Object.fromEntries(Object.entries(W.ROADS).map(([n, p]) => [n, W.smoothLine(p, 4)]));
for (const [name, line] of Object.entries(ROADS)) {
  ribbon(line, W.ROAD_WIDTH[name] + 1.2, 0.25, PALETTE.asphalt);
  if (W.ROAD_WIDTH[name] >= 7) ribbon(line, 0.45, 0.32, PALETTE.marking, "static", 1);
}

// keep-clear test for scattering houses and trees
const nearRoad = (x, y, gap) => Object.entries(ROADS).some(([n, line]) => line.some(([px, py]) => Math.hypot(px - x, py - y) < W.ROAD_WIDTH[n] / 2 + gap));
const inSite = (x, y, gap) => PADS.some((s) => x > s.x - gap && x < s.x + s.w + gap && y > s.y - gap && y < s.y + s.d + gap);
const clear = (x, y, gap = 6) => W.onLand(x + 14, y) && W.fromRiver(x, y) > gap && !nearRoad(x, y, gap) && !inSite(x, y, gap);

// ── Prototypes, instanced by the page ───────────────────────────────────────
// Trees: a round broadleaf of two or three leaf balls, and a tall poplar.
protos.tree_round = [
  { kind: "cyl", at: [0, 0, 0], r: 0.5, r2: 0.35, h: 4, seg: 6, colour: PALETTE.trunk },
  { kind: "sphere", at: [0, 0, 6.5], r: 4.2, sub: 2, colour: PALETTE.leaf[1], jitter: 0.5 },
  { kind: "sphere", at: [1.8, 0.8, 8.4], r: 2.8, sub: 1, colour: PALETTE.leaf[3], jitter: 0.4 },
  { kind: "sphere", at: [-1.6, -1.0, 7.9], r: 2.6, sub: 1, colour: PALETTE.leaf[0], jitter: 0.4 },
];
protos.tree_tall = [
  { kind: "cyl", at: [0, 0, 0], r: 0.4, r2: 0.3, h: 3, seg: 6, colour: PALETTE.trunk },
  { kind: "lathe", at: [0, 0, 2.5], profile: [[0, 0.5], [1.5, 2.4], [5, 2.8], [9, 2.2], [12, 1.1], [13.4, 0]], seg: 8, colour: PALETTE.leaf[2], jitter: 0.3 },
];
// Houses: walls, a gable roof along the long side, windows that light at night,
// a chimney. Four paints.
const house = (walls, roof) => {
  const w = 11, d = 8, h = 6, rise = 3.6;
  const wins = [];
  for (const f of [-0.28, 0.28]) {
    wins.push({ kind: "quad", pts: [[f * w - 0.9, d / 2 + 0.03, 2.4], [f * w + 0.9, d / 2 + 0.03, 2.4], [f * w + 0.9, d / 2 + 0.03, 4.0], [f * w - 0.9, d / 2 + 0.03, 4.0]], colour: PALETTE.glass, group: "lights:window" });
    wins.push({ kind: "quad", pts: [[f * w - 0.9, -d / 2 - 0.03, 4.0], [f * w + 0.9, -d / 2 - 0.03, 4.0], [f * w + 0.9, -d / 2 - 0.03, 2.4], [f * w - 0.9, -d / 2 - 0.03, 2.4]], colour: PALETTE.glass, group: "lights:window" });
  }
  wins.push({ kind: "quad", pts: [[w / 2 + 0.03, -0.9, 2.4], [w / 2 + 0.03, 0.9, 2.4], [w / 2 + 0.03, 0.9, 4.0], [w / 2 + 0.03, -0.9, 4.0]], colour: PALETTE.glass, group: "lights:window" });
  return [
    { kind: "box", at: [0, 0, 0], size: [w, d, h], colour: walls },
    { kind: "gable", at: [0, 0, h], size: [w + 0.8, d + 1.0, rise], colour: roof },
    { kind: "box", at: [w * 0.28, -d * 0.15, h + 1], size: [1.1, 1.1, 3.6], colour: walls === PALETTE.render ? PALETTE.brick : walls },
    ...wins,
  ];
};
protos.house_render_slate = house(PALETTE.render, PALETTE.slate);
protos.house_render_tile = house(PALETTE.render, PALETTE.tile);
protos.house_brick_slate = house(PALETTE.brick, PALETTE.slate);
protos.house_brick_tile = house(PALETTE.brick, PALETTE.tile);
const HOUSES = Object.keys(protos).filter((k) => k.startsWith("house"));
const placed = [];
const free = (x, y, r) => placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r);
function placeHouse(x, y, rot) {
  placed.push({ x, y, r: 7.5 });
  instances.push({ proto: HOUSES[Math.floor(R() * HOUSES.length)], at: [x, y, on(x, y)], rot, scale: 0.9 + R() * 0.2 });
}
function placeTree(x, y, s = 0.8 + R() * 0.5) {
  placed.push({ x, y, r: 4 * s });
  instances.push({ proto: R() < 0.22 ? "tree_tall" : "tree_round", at: [x, y, on(x, y)], rot: R() * Math.PI * 2, scale: s });
}

// ── The town: high street blocks, the church, the supermarket, then houses ──
function block(x, y, w, d, storeys, colour, roof = PALETTE.concrete) {
  const h = storeys * 3.3, z = on(x + w / 2, y + d / 2);
  placed.push({ x: x + w / 2, y: y + d / 2, r: Math.max(w, d) / 2 + 3 });
  P("box", { at: [x + w / 2, y + d / 2, z], size: [w, d, h], colour });
  P("box", { at: [x + w / 2, y + d / 2, z + h], size: [w + 0.6, d + 0.6, 0.8], colour: roof });
  P("box", { at: [x + w * 0.6, y + d * 0.4, z + h + 0.8], size: [w * 0.3, d * 0.3, 2], colour: PALETTE.steel });
  const quads = [];
  for (let s = 0; s < storeys; s++) {
    const z0 = z + s * 3.3 + 1.1, z1 = z0 + 1.4;
    for (let u = 1.6; u < w - 1.5; u += 2.8) quads.push([[x + u, y + d + 0.04, z0], [x + u + 1.6, y + d + 0.04, z0], [x + u + 1.6, y + d + 0.04, z1], [x + u, y + d + 0.04, z1]]);
    for (let u = 1.6; u < d - 1.5; u += 2.8) quads.push([[x + w + 0.04, y + u + 1.6, z0], [x + w + 0.04, y + u, z0], [x + w + 0.04, y + u, z1], [x + w + 0.04, y + u + 1.6, z1]]);
  }
  prims.push({ kind: "quads", quads, colour: PALETTE.glass, group: "lights:window" });
}
block(318, 476, 22, 15, 5, PALETTE.stone);
block(347, 468, 17, 13, 4, PALETTE.glass);
block(372, 474, 15, 19, 6, PALETTE.hall);
block(294, 500, 15, 11, 3, PALETTE.brick);
function church(x, y, k = 1) {
  const z = on(x, y);
  placed.push({ x, y, r: 20 * k });
  P("box", { at: [x - 7 * k, y, z], size: [17 * k, 9 * k, 8 * k], colour: PALETTE.stone });
  P("gable", { at: [x - 7 * k, y, z + 8 * k], size: [17.6 * k, 10 * k, 5 * k], colour: PALETTE.slate });
  P("box", { at: [x + 5 * k, y, z], size: [6.5 * k, 6.5 * k, 19 * k], colour: PALETTE.stone });
  P("cyl", { at: [x + 5 * k, y, z + 19 * k], r: 4.4 * k, r2: 0.05, h: 13 * k, seg: 4, rot: [0, 0, Math.PI / 4], colour: PALETTE.slate });
}
church(286, 452);
church(132, 116, 0.8);
{
  const x = 392, y = 600, w = 34, d = 22, z = on(x + w / 2, y + d / 2);
  placed.push({ x: x + w / 2, y: y + d / 2, r: 24 });
  P("box", { at: [x + w / 2, y + d / 2, z], size: [w, d, 7], colour: PALETTE.hall });
  for (let u = 4; u < w - 3; u += 4.2) P("box", { at: [x + u, y + d / 2, z + 7], size: [2.8, d - 6, 0.5], rot: [0.25, 0, 0], colour: PALETTE.pv });
  P("box", { at: [x + w / 2, y + d + 9, z], size: [w + 6, 15, 0.12], colour: "#a7aaad" });
}
// a football pitch
{
  const p = { x: 452, y: 546, w: 40, d: 26 }, z = on(p.x + 20, p.y + 13);
  placed.push({ x: p.x + 20, y: p.y + 13, r: 24 });
  P("box", { at: [p.x + p.w / 2, p.y + p.d / 2, z], size: [p.w, p.d, 0.15], colour: PALETTE.pitch });
  P("box", { at: [p.x + p.w / 2, p.y + p.d / 2, z + 0.15], size: [0.4, p.d - 2, 0.05], colour: PALETTE.marking });
  for (const gx of [p.x + 1.2, p.x + p.w - 1.2]) P("box", { at: [gx, p.y + p.d / 2, z], size: [0.6, 5, 2.2], colour: PALETTE.white });
}
// houses along the streets, gables along the road
function street(line, from, to, gap = 13) {
  for (let i = from; i < Math.min(to, line.length - 2); i += Math.max(1, Math.round(gap / 4))) {
    const [x, y] = line[i], [x2, y2] = line[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
    for (const side of [-1, 1]) {
      if (R() < 0.25) continue;
      const off = 13 + R() * 3, hx = x - (dy / l) * off * side, hy = y + (dx / l) * off * side;
      if (free(hx, hy, 7) && clear(hx, hy, 5)) placeHouse(hx, hy, Math.atan2(dy, dx));
    }
  }
}
street(ROADS.main, 30, 80, 13);
street(ROADS.loop, 0, ROADS.loop.length, 13);
street(ROADS.north, 0, 40, 14);
street(ROADS.north, 50, ROADS.north.length, 13);
street(ROADS.south, 0, 18, 15);
for (const [name, poly] of Object.entries(W.URBAN)) {
  const step = name === "town" ? 17 : 19, xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  for (let y = Math.min(...ys) + 6; y < Math.max(...ys); y += step) for (let x = Math.min(...xs) + 6; x < Math.max(...xs); x += step) {
    const hx = x + (R() - 0.5) * 5, hy = y + (R() - 0.5) * 5;
    if (!W.inside(poly, hx, hy) || R() < 0.15) continue;
    if (free(hx, hy, 7.5) && clear(hx, hy, 5)) placeHouse(hx, hy, R() < 0.5 ? 0 : Math.PI / 2);
    else if (R() < 0.4 && free(hx + 5, hy + 5, 3) && clear(hx + 5, hy + 5, 3)) placeTree(hx + 5, hy + 5, 0.6 + R() * 0.3);
  }
}

// ── Woods, river trees and hedgerow trees ───────────────────────────────────
const wood = (cx, cy, rad, count) => {
  for (let n = 0, tries = 0; n < count && tries < count * 10; tries++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
    if (!clear(x, y, 4) || !free(x, y, 3)) continue;
    placeTree(x, y); n++;
  }
};
wood(84, 296, 66, 70);
wood(470, 58, 48, 26);
wood(560, 600, 36, 18);
wood(36, 640, 30, 12);
wood(520, 150, 26, 10);
for (let i = 3; i < W.RIVER.length - 3; i += 2) {
  const [x, y] = W.RIVER[i], [x2, y2] = W.RIVER[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
  for (const side of [-1, 1]) {
    if (R() < 0.4) continue;
    const off = 14 + R() * 6, tx = x - (dy / l) * off * side, ty = y + (dx / l) * off * side;
    if (clear(tx, ty, 3) && free(tx, ty, 3)) placeTree(tx, ty, 0.7 + R() * 0.4);
  }
}
// scattered field trees, as on a hedgerow
for (let n = 0; n < 140; n++) {
  const x = 20 + R() * 840, y = 20 + R() * 720;
  if (clear(x, y, 6) && free(x, y, 5) && !Object.values(W.URBAN).some((p) => W.inside(p, x, y))) placeTree(x, y, 0.7 + R() * 0.5);
}

// ── Wind turbines: tower, nacelle, and a rotor the page turns ──────────────
const AX = W.WIND_FROM;
const yawOf = Math.atan2(AX[1], AX[0]);
const rotors = [];
function turbine(x, y, { base = on(x, y), hub = 72, R: rad = 40, tower = [2.4, 1.4], offshore = false } = {}) {
  if (offshore) {
    P("cyl", { at: [x, y, SEA_LEVEL - 4], r: 3.4, h: base - SEA_LEVEL + 4, seg: 16, colour: PALETTE.safety });
    P("cyl", { at: [x, y, base], r: 6.5, h: 0.9, seg: 16, colour: PALETTE.safety });
  }
  const top = base + hub;
  P("cyl", { at: [x, y, base], r: tower[0], r2: tower[1], h: hub - 1.5, seg: 14, colour: PALETTE.white });
  P("box", { at: [x - AX[0] * 2, y - AX[1] * 2, top - 1.8], size: [11, 3.8, 3.6], rot: [0, 0, yawOf], colour: PALETTE.white });
  const hubAt = [x + AX[0] * 4.6, y + AX[1] * 4.6, top];
  rotors.push({ at: hubAt, axis: AX, R: rad, phase: R() * Math.PI * 2, rpm: 9 + R() * 4 });
  P("sphere", { at: [x - AX[0] * 7, y - AX[1] * 7, top + 2.3], r: 0.7, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
}
for (const [x, y] of W.ONSHORE) turbine(x, y);
for (const [x, y] of W.OFFSHORE) turbine(x, y, { base: 14, hub: 100, R: 54, tower: [3.2, 2.0], offshore: true });

// ── The nuclear station ─────────────────────────────────────────────────────
const NZ = PADS.find((p) => p.name === "nuclear").z;
const steam = [];
{
  const tower = (x, y) => {
    const rt = 17, st = 72, c = 58.4, H = 96;
    const profile = Array.from({ length: 17 }, (_, i) => { const s = (H * i) / 16; return [s, rt * Math.sqrt(1 + ((s - st) / c) ** 2)]; });
    P("lathe", { at: [x, y, NZ], profile, seg: 40, colour: PALETTE.concrete, open: true, wall: 0.8 });
    // the ring of raking legs at the foot, a dark gap under the shell
    P("cyl", { at: [x, y, NZ], r: 27.3, h: 3.2, seg: 40, colour: "#8d918c" });
    steam.push([x, y, NZ + H]);
  };
  tower(798, 66);
  tower(870, 56);
  P("cyl", { at: [812, 150, NZ], r: 18, h: 30, seg: 32, colour: PALETTE.concrete });
  P("sphere", { at: [812, 150, NZ + 30], r: 18, sub: 3, colour: "#e6e3dc", hemi: true });
  const hall = { x: 838, y: 126, w: 74, d: 34 };
  P("box", { at: [hall.x + hall.w / 2, hall.y + hall.d / 2, NZ], size: [hall.w, hall.d, 24], colour: PALETTE.hall });
  P("gable", { at: [hall.x + hall.w / 2, hall.y + hall.d / 2, NZ + 24], size: [hall.w + 0.6, hall.d + 0.6, 3.5], colour: "#c7d3dc" });
  prims.push({ kind: "quads", group: "lights:glow", colour: "#ffcf7a", quads: [0.2, 0.5, 0.8].map((f) => [[hall.x + hall.w * f - 3, hall.y + hall.d + 0.05, NZ], [hall.x + hall.w * f + 3, hall.y + hall.d + 0.05, NZ], [hall.x + hall.w * f + 3, hall.y + hall.d + 0.05, NZ + 8], [hall.x + hall.w * f - 3, hall.y + hall.d + 0.05, NZ + 8]]) });
  P("box", { at: [779, 171, NZ], size: [22, 14, 10], colour: PALETTE.render });
  for (const tx of [846, 862, 878]) P("box", { at: [tx, 178, NZ], size: [8, 6, 5.5], colour: PALETTE.dark });
}

// ── The gas station ─────────────────────────────────────────────────────────
{
  const s = W.SITES.gas, z = PADS.find((p) => p.name === "gas").z;
  P("box", { at: [s.x + 29, s.y + 44, z], size: [46, 32, 18], colour: PALETTE.hall });
  P("gable", { at: [s.x + 29, s.y + 44, z + 18], size: [46.6, 32.6, 3], colour: "#c7d3dc" });
  for (const y of [s.y + 20, s.y + 58]) {
    P("box", { at: [s.x + 69, y, z], size: [22, 16, 30], colour: PALETTE.steel });
    P("cyl", { at: [s.x + 87, y, z], r: 3.8, r2: 3.1, h: 66, seg: 18, colour: PALETTE.concrete });
    P("cyl", { at: [s.x + 87, y, z + 60], r: 3.25, h: 1.4, seg: 18, colour: PALETTE.red });
    P("cyl", { at: [s.x + 87, y, z + 66], r: 2.6, h: 0.3, seg: 18, colour: "#ffb35c", group: "lights:glow" });
  }
  P("box", { at: [s.x + 23, s.y + 70, z + 1], size: [30, 3, 1.4], colour: PALETTE.safety });
}

// ── Geothermal: the plant, its fan deck, and the well at the very edge ─────
const bore = { x: 120, y: TILE.d };
{
  const s = W.SITES.geothermal, z = PADS.find((p) => p.name === "geothermal").z;
  P("box", { at: [s.x + 70, s.y + 22, z], size: [40, 24, 12], colour: PALETTE.hall });
  P("box", { at: [s.x + 25, s.y + 17, z], size: [34, 18, 8], colour: PALETTE.steel });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) P("cyl", { at: [s.x + 12.5 + i * 8.3, s.y + 12.5 + j * 9, z + 8], r: 3.4, h: 0.6, seg: 16, colour: PALETTE.dark });
  P("box", { at: [bore.x, bore.y - 4, z], size: [8, 6, 1], colour: PALETTE.safety });
  P("cyl", { at: [bore.x, bore.y - 4, z + 1], r: 1.3, h: 6, seg: 12, colour: PALETTE.steel });
  P("tube", { points: [[bore.x, bore.y - 4, z + 6], [bore.x, s.y + 46, z + 6], [s.x + 52, s.y + 46, z + 6]], r: 0.8, colour: "#c3cacf" });
  // the bore down the cut face to the hot granite
  P("tube", { points: [[bore.x, bore.y + 0.4, z], [bore.x, bore.y + 0.4, -128]], r: 1.1, colour: "#59636b" });
  P("disc", { at: [bore.x, bore.y + 0.5, -130], r: 34, ry: 15, colour: "#ff8a3d", group: "lights:heat" });
}

// ── Solar: tilted tables in rows facing south ───────────────────────────────
{
  const s = W.SITES.solar, z = PADS.find((p) => p.name === "solar").z;
  const tilt = (25 * Math.PI) / 180;
  for (let y0 = s.y + 8; y0 < s.y + s.d - 6; y0 += 9.5) for (let x0 = s.x + 6; x0 + 18 < s.x + s.w - 2; x0 += 21) {
    P("box", { at: [x0 + 9, y0 + 2, z + 1.2], size: [18, 4.4, 0.18], rot: [-tilt, 0, 0], colour: PALETTE.pv });
    for (const px of [x0 + 2, x0 + 16]) P("box", { at: [px, y0 + 2, z], size: [0.25, 0.25, 1.4], colour: PALETTE.steel });
  }
}

// ── The battery: containers in rows with charge lamps ──────────────────────
{
  const s = W.SITES.battery, z = PADS.find((p) => p.name === "battery").z;
  for (let row = 0; row < 2; row++) for (let n = 0; n < 4; n++) {
    const x = s.x + 10 + n * 14.5, y = s.y + 8 + row * 18;
    P("box", { at: [x, y, z], size: [12, 2.9, 2.9], colour: PALETTE.container });
    P("box", { at: [x + 5, y + 1.48, z + 2.2], size: [0.7, 0.05, 0.4], colour: "#38c172", group: "lights:led" });
  }
  P("box", { at: [s.x + 56, s.y + 40, z], size: [8, 7, 4.5], colour: PALETTE.dark });
}

// ── The converter station and the interconnector ───────────────────────────
{
  const s = W.SITES.converter, z = PADS.find((p) => p.name === "converter").z;
  P("box", { at: [s.x + 25, s.y + 18, z], size: [38, 24, 16], colour: PALETTE.hall });
  P("box", { at: [s.x + 25, s.y + 18, z + 16], size: [38.6, 24.6, 0.8], colour: "#c7d3dc" });
  const route = W.smoothLine(W.INTERCONNECTOR, 8).map(([x, y]) => [x, y, Math.max(on(x, y), SEA_LEVEL - 20) + 0.6]);
  route[0][2] = z;
  P("tube", { points: route, r: 0.9, colour: "#30373d" });
}

// ── The substation where the line comes down ────────────────────────────────
{
  const s = W.SITES.substation, z = PADS.find((p) => p.name === "substation").z;
  for (const tx of [s.x + 10, s.x + 26]) P("box", { at: [tx, s.y + 12, z], size: [8, 6, 5], colour: PALETTE.dark });
  P("box", { at: [s.x + 20, s.y + 25, z], size: [16, 6, 4], colour: PALETTE.render });
}

// ── The lighthouse on the headland ──────────────────────────────────────────
{
  const x = 936, y = 176, z = on(x, y);
  P("cyl", { at: [x, y, z], r: 3.2, r2: 2.5, h: 17, seg: 16, colour: PALETTE.white });
  for (const b of [4, 10]) P("cyl", { at: [x, y, z + b], r: 3.1 - b * 0.04, h: 3, seg: 16, colour: PALETTE.red });
  P("cyl", { at: [x, y, z + 17], r: 3.4, h: 0.6, seg: 16, colour: PALETTE.dark });
  P("cyl", { at: [x, y, z + 17.6], r: 1.9, h: 2.6, seg: 12, colour: "#f3e3a0", group: "lights:lamp" });
  P("cyl", { at: [x, y, z + 20.2], r: 2.3, r2: 0.2, h: 1.8, seg: 12, colour: PALETTE.red });
}

// ── Boats ───────────────────────────────────────────────────────────────────
{
  const boat = (x, y, ang, len, sail) => {
    P("box", { at: [x, y, SEA_LEVEL - 0.3], size: [len, len * 0.36, 1.6], rot: [0, 0, ang], colour: PALETTE.boat });
    if (sail) P("cyl", { at: [x, y, SEA_LEVEL + 1.3], r: 2.6, r2: 0.05, h: 11, seg: 3, rot: [0, 0, ang], colour: "#fbfbf9" });
    else P("box", { at: [x - Math.cos(ang) * 2, y - Math.sin(ang) * 2, SEA_LEVEL + 1.3], size: [4, 3.4, 2.2], rot: [0, 0, ang], colour: PALETTE.white });
  };
  boat(1010, 330, 0.65, 9, true);
  boat(990, 520, -0.9, 15, false);
}

// ── Pylons and the line ─────────────────────────────────────────────────────
// One lattice tower as a prototype, turned along the line at each site.
const ARMS = [{ z: 30, w: 9 }, { z: 36.5, w: 8 }, { z: 43, w: 6.5 }], PEAK = 49;
{
  const half = (z) => (z < 28 ? 5 - (z / 28) * 3.4 : 1.6 - ((z - 28) / (PEAK - 28)) * 1.2);
  const c4 = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const levels = [0, 7, 14, 21, 28, 34, 40, 46, PEAK];
  const bars = [];
  for (const [u, v] of c4) for (let j = 0; j < levels.length - 1; j++) bars.push([[u * half(levels[j]), v * half(levels[j]), levels[j]], [u * half(levels[j + 1]), v * half(levels[j + 1]), levels[j + 1]]]);
  for (let j = 1; j < levels.length; j++) for (let f = 0; f < 4; f++) {
    const [au, av] = c4[f], [bu, bv] = c4[(f + 1) % 4], z = levels[j], z0 = levels[j - 1];
    bars.push([[au * half(z), av * half(z), z], [bu * half(z), bv * half(z), z]]);
    bars.push([[au * half(z0), av * half(z0), z0], [bu * half(z), bv * half(z), z]]);
  }
  for (const arm of ARMS) for (const side of [-1, 1]) {
    bars.push([[0.9, side * half(arm.z), arm.z], [0, side * arm.w, arm.z]], [[-0.9, side * half(arm.z), arm.z], [0, side * arm.w, arm.z]]);
    bars.push([[0, side * arm.w, arm.z], [0, side * half(arm.z + 2.5), arm.z + 2.5]]);
    bars.push([[0, side * arm.w, arm.z], [0, side * arm.w, arm.z - 3]]);
  }
  protos.pylon = [{ kind: "bars", bars, r: 0.18, colour: "#8a959d" }, { kind: "sphere", at: [0, 0, PEAK + 0.6], r: 0.6, sub: 1, colour: PALETTE.red, group: "lights:beacon" }];
}
const pylonTips = [];
W.PYLONS.forEach(([x, y], i) => {
  const a = W.PYLONS[Math.max(0, i - 1)], b = W.PYLONS[Math.min(W.PYLONS.length - 1, i + 1)];
  const rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const z0 = on(x, y), c = Math.cos(rot), s = Math.sin(rot);
  instances.push({ proto: "pylon", at: [x, y, z0], rot, scale: 1 });
  const tips = [];
  for (const arm of ARMS) for (const side of [-1, 1]) tips.push([x - s * side * arm.w, y + c * side * arm.w, z0 + arm.z - 3]);
  tips.push([x, y, z0 + PEAK]);
  pylonTips.push(tips);
});
for (let i = 0; i < pylonTips.length - 1; i++) for (let c = 0; c < pylonTips[i].length; c++) {
  const a = pylonTips[i][c], b = pylonTips[i + 1][c], sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.045;
  const pts = Array.from({ length: 11 }, (_, n) => { const t = n / 10; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]; });
  P("tube", { points: pts, r: 0.16, colour: "#5f6a72", seg: 4 });
}

// ── Cars: electric, on the left of the road; the page drives them ──────────
const cars = [];
const CAR_COUNT = { main: 8, north: 4, station: 3, loop: 3, south: 2 };
for (const [name, count] of Object.entries(CAR_COUNT)) for (let n = 0; n < count; n++) {
  cars.push({ road: name, at: (n + R() * 0.6) / count, forward: R() < 0.5, speed: 9 + R() * 5, colour: PALETTE.cars[cars.length % PALETTE.cars.length] });
}
protos.car = [
  { kind: "box", at: [0, 0, 0.35], size: [4.4, 1.9, 1.0], colour: "#ffffff", group: "paint:body" },
  { kind: "box", at: [-0.3, 0, 1.35], size: [2.4, 1.7, 0.65], colour: PALETTE.glass },
  { kind: "box", at: [2.22, 0.55, 0.8], size: [0.05, 0.4, 0.25], colour: "#fff6cf", group: "lights:head" },
  { kind: "box", at: [2.22, -0.55, 0.8], size: [0.05, 0.4, 0.25], colour: "#fff6cf", group: "lights:head" },
];

// ── Sheep in the western pastures ───────────────────────────────────────────
protos.sheep = [{ kind: "sphere", at: [0, 0, 1], r: 1, sub: 1, colour: "#fbfbf6" }, { kind: "sphere", at: [0.9, 0, 1.1], r: 0.45, sub: 1, colour: "#3d3a36" }];
for (let n = 0; n < 40; n++) {
  const x = 30 + R() * 160, y = 400 + R() * 240;
  if (clear(x, y, 3) && free(x, y, 1.5)) instances.push({ proto: "sheep", at: [x, y, on(x, y)], rot: R() * 6.3, scale: 1 });
}

export function scene() {
  return {
    tile: TILE, depth: DEPTH, seaLevel: SEA_LEVEL,
    terrain: terrain(), sides: sides(),
    prims, protos, instances,
    rotors, cars, steam, roads: Object.fromEntries(Object.entries(ROADS).map(([n, l]) => [n, l.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(Math.max(on(x, y), SEA_LEVEL + 0.6) * 100) / 100])])),
    roadWidth: W.ROAD_WIDTH,
  };
}
