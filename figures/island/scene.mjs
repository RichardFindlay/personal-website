// The island as a scene description for Blender: the terrain's heights and
// colours, the cut faces with their rock, and every building, tree, turbine and
// pylon as simple primitives. All the geometry is decided here, from layout.mjs;
// blender/island.py only turns it into meshes, bakes the soft shadows and
// exports. Units are metres: x east, y south (toward the viewer), z up.
import * as W from "./layout.mjs";

const { TILE, DEPTH, SEA_LEVEL, LAND, CITY } = W;
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

// ── Palette: bright daylight, a white and glass city in lush country ────────
export const PALETTE = {
  grass: ["#5eb233", "#6abd3c", "#56a730", "#77c444", "#8cc449", "#b7c25a"],
  pavement: "#d9d5cc", pad: "#d4d1c8", sand: "#ecdcab", wetsand: "#d6c491", rock: "#97a0a7", rockDark: "#79838b",
  quay: "#b9b6ae", seabed: "#dccb98", seabedDeep: "#5f9ea6", bank: "#bba97c",
  asphalt: "#6f757c", marking: "#f3f3ee",
  layers: { grass: "#6fb043", topsoil: "#6e5238", subsoil: "#a07a52", sediment: "#d8c69a", sandstone: "#cfa86f", mudstone: "#8f877a", limestone: "#e1d8c2", granite: "#ab998e", water: "#2f9cc0" },
  render: "#f1ece2", brick: "#c27a58", stone: "#e3dccd", slate: "#5f6d78", tile: "#b5603f",
  glass: ["#8fbcd6", "#a9cde2", "#7fa9c4", "#b9d6e4"], glassDark: "#5d86a3", windows: "#9fc3d9",
  towerTone: ["#eef2f5", "#dde6ec", "#f3efe6", "#cfdbe3"],
  concrete: "#e0dcd3", hall: "#a9bccb", steel: "#9aa4ac", white: "#f4f6f7", safety: "#e7b52d", dark: "#4b545c",
  pv: "#2c4870", container: ["#cf4b3c", "#3f72a8", "#e8b730", "#2e9486", "#e9ecee", "#8a5a9c"],
  leaf: ["#4fa52f", "#5cb636", "#3f9228", "#72c746"], trunk: "#7a5b40",
  red: "#cf4b3c", boat: "#f6f6f3", pitch: "#5fb845", hull: "#2f4a66",
  cars: ["#f2f3f4", "#d0483d", "#3f72a8", "#2e9486", "#e8b730", "#2f353b"],
};

// ── Where the city stands ───────────────────────────────────────────────────
const inRect = (r, x, y, gap = 0) => x > r.x0 - gap && x < r.x1 + gap && y > r.y0 - gap && y < r.y1 + gap;
const inCity = (x, y) => inRect(CITY.south, x, y) || inRect(CITY.north, x, y);

// ── The ground's height ──────────────────────────────────────────────────────
const PAD_NAMES = ["nuclear", "gas", "geothermal", "battery", "converter", "substation", "solar"];
const PADS = PAD_NAMES.map((n) => ({ ...W.SITES[n], name: n, z: 0 }));
function rawLand(x, y) {
  const hills = W.heightAt(x, y);
  // the plateau the power stations stand on, its edge eased over 30 m
  let plateau = 0;
  if (W.inside(W.PLATEAU.poly, x, y)) {
    let edge = Infinity;
    const poly = W.PLATEAU.poly;
    for (let i = 0; i < poly.length; i++) edge = Math.min(edge, W.lineGap([poly[i], poly[(i + 1) % poly.length]], x, y));
    plateau = W.PLATEAU.z * smooth(0, 30, edge);
  }
  const flat = inCity(x, y) ? 0.15 : 1;
  return LAND + hills * flat + plateau + 0.8 * fbm(x / 70, y / 70, 1) * flat;
}
for (const p of PADS) p.z = rawLand(p.x + p.w / 2, p.y + p.d / 2);
function groundZ(x, y) {
  const d = W.coastX(y) - x, shore = W.SHORE(y);
  let z;
  if (d >= 0) {
    z = rawLand(x, y);
    if (shore === "cliff") z += 6 * smooth(0, 6, d) * (1 - smooth(40, 120, d)) * (0.7 + 0.3 * fbm(x / 20, y / 20, 4));
    if (shore === "beach") z = lerp(SEA_LEVEL - 0.6, z, smooth(0, 28, d));
  } else {
    z = SEA_LEVEL - Math.min(24, 1.5 + 0.12 * -d + (shore === "beach" ? 0 : 5)) + 0.8 * fbm(x / 30, y / 30, 2);
  }
  const r = W.fromRiver(x, y);
  if (r < 10 && d > 0) z = r < 0 ? SEA_LEVEL - 3 + 0.8 * smooth(-8, 0, r) : lerp(SEA_LEVEL + 0.6, z, smooth(0, 10, r));
  for (const s of PADS) if (x > s.x - 8 && x < s.x + s.w + 8 && y > s.y - 8 && y < s.y + s.d + 8) {
    const e = Math.min(x - s.x + 8, s.x + s.w + 8 - x, y - s.y + 8, s.y + s.d + 8 - y);
    z = lerp(z, s.z, smooth(0, 8, e));
  }
  return z;
}
export const ground = groundZ;

function fieldColour(x, y) {
  const CW = 62, CD = 46;
  const i = Math.floor((x + 20 * fbm(x / 90, y / 90, 9)) / CW), j = Math.floor((y + 16 * fbm(x / 90, y / 90, 7)) / CD);
  const base = hex(PALETTE.grass[Math.floor(hash(i, j, 5) * PALETTE.grass.length)]);
  return mix(base, hex("#4f8f30"), 0.14 * (fbm(x / 12, y / 12, 3) + 0.5));
}
function groundColour(x, y, z, slope) {
  const d = W.coastX(y) - x, shore = W.SHORE(y);
  if (d < 0 && z < SEA_LEVEL) return mix(hex(PALETTE.seabed), hex(PALETTE.seabedDeep), smooth(SEA_LEVEL - 1, SEA_LEVEL - 14, z));
  if (shore === "quay" && d < 70 && d > -1) return hex(PALETTE.quay);
  if (slope > 0.85) return mix(hex(PALETTE.rock), hex(PALETTE.rockDark), 0.5 + 0.5 * fbm(x / 9, y / 9, 6));
  if (z < SEA_LEVEL + 1.4) return hex(PALETTE.wetsand);
  if (d < 30 && shore === "beach") return hex(PALETTE.sand);
  if (W.fromRiver(x, y) < 3) return hex(PALETTE.bank);
  const park = CITY.park;
  if (x > park.x && x < park.x + park.w && y > park.y && y < park.y + park.d) return hex("#6cbd44");
  if (inCity(x, y)) return mix(hex(PALETTE.pavement), hex("#c8c3b8"), 0.3 * (fbm(x / 20, y / 20, 8) + 0.5));
  for (const s of PADS) if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.d) return hex(s.name === "solar" ? "#7dbf4a" : PALETTE.pad);
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
    colours.push(...groundColour(i * STEP, j * STEP, z, Math.hypot(zx, zy) / (2 * STEP)).map((v) => Math.round(v * 255)));
  }
  return { nx, ny, step: STEP, heights: [...heights].map((v) => Math.round(v * 100) / 100), colours };
}

// ── The cut faces: the rock under each edge ─────────────────────────────────
const LAYERS = ["water", "grass", "topsoil", "subsoil", "sediment", "sandstone", "mudstone", "limestone", "granite"];
function column(x, y, s) {
  const top = groundZ(x, y), wet = top < SEA_LEVEL, land = wet ? 0 : 1;
  const t = [wet ? SEA_LEVEL - top : 0, 2.5 * land, 6 * land, 10 * land, wet ? 7 : 0];
  const z = [wet ? SEA_LEVEL : top];
  for (const h of t) z.push(z[z.length - 1] - h);
  const wave = (base, amp, len, ph) => base + amp * Math.sin(s / len + ph) + amp * 0.4 * Math.sin(s / (len * 0.37) + ph * 2.3);
  z.push(Math.min(z[z.length - 1] - 4, wave(-42, 4, 80, 0.4)));
  z.push(wave(-64, 5, 110, 1.9));
  z.push(wave(-84, 4, 70, 3.1));
  z.push(-DEPTH);
  return z;
}
export function sides() {
  const corners = [[0, TILE.d], [TILE.w, TILE.d], [TILE.w, 0], [0, 0]];
  const edges = [];
  let s = 0;
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e], [bx, by] = corners[(e + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay), n = Math.round(len / STEP), samples = [];
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
const pick = (list) => list[Math.floor(R() * list.length)];

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
    quads.push([pts[i][0], pts[i][1], pts[i + 1][1], pts[i + 1][0]].map(([x, y]) => [x, y, Math.max(on(x, y), LAND - 0.5) + lift]));
  }
  prims.push({ kind: "quads", quads, colour, group });
}
const ROADS = Object.fromEntries(Object.entries(W.ROADS).map(([n, p]) => [n, W.smoothLine(p, 4)]));
for (const [name, line] of Object.entries(ROADS)) {
  ribbon(line, W.ROAD_WIDTH[name], 0.3, PALETTE.asphalt);
  if (W.ROAD_WIDTH[name] >= 8) ribbon(line, 0.5, 0.38, PALETTE.marking, "static", 1);
}
// where a road crosses the river it is a bridge: a deck and two parapets
function bridges(line, width) {
  let span = [];
  const flush = () => {
    if (span.length > 1) {
      const a = span[0], b = span[span.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 8;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      P("box", { at: [cx, cy, LAND - 1.6], size: [len, width + 2, 1.9], rot: [0, 0, ang], colour: PALETTE.concrete });
      P("box", { at: [cx, cy, LAND + 0.3], size: [len, width, 0.12], rot: [0, 0, ang], colour: PALETTE.asphalt });
      for (const side of [-1, 1]) P("box", { at: [cx - Math.sin(ang) * side * (width / 2 + 0.6), cy + Math.cos(ang) * side * (width / 2 + 0.6), LAND + 0.3], size: [len, 0.5, 1.1], rot: [0, 0, ang], colour: PALETTE.concrete });
    }
    span = [];
  };
  for (const p of line) { if (W.fromRiver(p[0], p[1]) < 4) span.push(p); else flush(); }
  flush();
}

// keep-clear test for scattering
const nearRoad = (x, y, gap) => Object.entries(ROADS).some(([n, line]) => W.lineGap(line, x, y) < W.ROAD_WIDTH[n] / 2 + gap);
const inSite = (x, y, gap) => PADS.some((s) => x > s.x - gap && x < s.x + s.w + gap && y > s.y - gap && y < s.y + s.d + gap);
const clear = (x, y, gap = 6) => W.onLand(x + 14, y) && W.fromRiver(x, y) > gap && !nearRoad(x, y, gap) && !inSite(x, y, gap) && !inCity(x, y);
const placed = [];
const free = (x, y, r) => placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r);

// ── Prototypes, instanced by the page ───────────────────────────────────────
protos.tree_round = [
  { kind: "cyl", at: [0, 0, 0], r: 0.6, r2: 0.4, h: 4.5, seg: 6, colour: PALETTE.trunk },
  { kind: "sphere", at: [0, 0, 7.5], r: 4.8, sub: 2, colour: PALETTE.leaf[1], jitter: 0.5 },
  { kind: "sphere", at: [2, 0.9, 9.6], r: 3.2, sub: 1, colour: PALETTE.leaf[3], jitter: 0.4 },
  { kind: "sphere", at: [-1.8, -1.1, 9.0], r: 3.0, sub: 1, colour: PALETTE.leaf[0], jitter: 0.4 },
];
protos.tree_tall = [
  { kind: "cyl", at: [0, 0, 0], r: 0.45, r2: 0.3, h: 3, seg: 6, colour: PALETTE.trunk },
  { kind: "lathe", at: [0, 0, 2.5], profile: [[0, 0.5], [1.8, 2.8], [6, 3.2], [10.5, 2.5], [14, 1.2], [15.6, 0]], seg: 8, colour: PALETTE.leaf[2], jitter: 0.3 },
];
const house = (walls, roof) => {
  const w = 11, d = 8, h = 6, rise = 3.6, wins = [];
  for (const f of [-0.28, 0.28]) {
    wins.push({ kind: "quad", pts: [[f * w - 0.9, d / 2 + 0.03, 2.4], [f * w + 0.9, d / 2 + 0.03, 2.4], [f * w + 0.9, d / 2 + 0.03, 4.0], [f * w - 0.9, d / 2 + 0.03, 4.0]], colour: PALETTE.windows, group: "lights:window" });
    wins.push({ kind: "quad", pts: [[f * w - 0.9, -d / 2 - 0.03, 4.0], [f * w + 0.9, -d / 2 - 0.03, 4.0], [f * w + 0.9, -d / 2 - 0.03, 2.4], [f * w - 0.9, -d / 2 - 0.03, 2.4]], colour: PALETTE.windows, group: "lights:window" });
  }
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
function placeHouse(x, y, rot) {
  placed.push({ x, y, r: 7.5 });
  instances.push({ proto: pick(HOUSES), at: [x, y, on(x, y)], rot, scale: 0.9 + R() * 0.2 });
}
function placeTree(x, y, s = 0.8 + R() * 0.5) {
  placed.push({ x, y, r: 4 * s });
  instances.push({ proto: R() < 0.22 ? "tree_tall" : "tree_round", at: [x, y, on(x, y)], rot: R() * Math.PI * 2, scale: s });
}

// ── The city ────────────────────────────────────────────────────────────────
// Window bands on the two faces the camera sees, floor by floor, for the night.
function windowBands(x, y, w, d, z0, z1, floor = 3.4) {
  const quads = [];
  for (let z = z0 + 1.2; z + 1.4 < z1; z += floor) {
    quads.push([[x - w / 2 + 0.8, y + d / 2 + 0.05, z], [x + w / 2 - 0.8, y + d / 2 + 0.05, z], [x + w / 2 - 0.8, y + d / 2 + 0.05, z + 1.5], [x - w / 2 + 0.8, y + d / 2 + 0.05, z + 1.5]]);
    quads.push([[x + w / 2 + 0.05, y + d / 2 - 0.8, z], [x + w / 2 + 0.05, y - d / 2 + 0.8, z], [x + w / 2 + 0.05, y - d / 2 + 0.8, z + 1.5], [x + w / 2 + 0.05, y + d / 2 - 0.8, z + 1.5]]);
  }
  prims.push({ kind: "quads", quads, colour: PALETTE.windows, group: "lights:window", ref: [x, y, (z0 + z1) / 2] });
}
// a glass tower: a podium, a shaft that steps back once or twice, a crown
function tower(x, y, w, d, h) {
  const z = LAND, glass = pick(PALETTE.glass), tone = pick(PALETTE.towerTone);
  P("box", { at: [x, y, z], size: [w + 8, d + 8, 9], colour: tone });
  const steps = h > 120 ? 3 : h > 70 ? 2 : 1;
  let zz = z + 9, ww = w, dd = d;
  for (let s = 0; s < steps; s++) {
    const hh = (h - 9) * (s === steps - 1 ? 1 - (steps - 1) * 0.3 : 0.3) * (steps === 1 ? 1 : 1);
    const seg = s === steps - 1 ? z + h - zz : (h - 9) * (s === 0 ? 0.55 : 0.25);
    P("box", { at: [x, y, zz], size: [ww, dd, seg], colour: glass });
    // spandrel bands every few floors, in the tower's own tone
    for (let b = zz + 13.6; b < zz + seg - 2; b += 13.6) P("box", { at: [x, y, b], size: [ww + 0.25, dd + 0.25, 0.7], colour: tone });
    windowBands(x, y, ww, dd, zz, zz + seg);
    zz += seg; ww *= 0.78; dd *= 0.78;
    void hh;
  }
  P("box", { at: [x, y, zz], size: [ww * 1.1, dd * 1.1, 1.2], colour: tone });
  if (h > 140) P("cyl", { at: [x, y, zz + 1.2], r: 0.7, r2: 0.2, h: 18, seg: 6, colour: PALETTE.steel });
  if (h > 140) P("sphere", { at: [x, y, zz + 19.5], r: 0.8, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
  placed.push({ x, y, r: Math.max(w, d) / 2 + 6 });
}
function midrise(x, y, w, d, h) {
  const tone = R() < 0.3 ? pick(PALETTE.glass) : pick([PALETTE.stone, PALETTE.render, "#e9e2d4", "#d8dde2", PALETTE.brick]);
  P("box", { at: [x, y, LAND], size: [w, d, h], colour: tone });
  P("box", { at: [x, y, LAND + h], size: [w + 0.5, d + 0.5, 0.9], colour: PALETTE.concrete });
  if (R() < 0.6) P("box", { at: [x + w * 0.15, y - d * 0.1, LAND + h + 0.9], size: [w * 0.35, d * 0.3, 2.4], colour: PALETTE.steel });
  windowBands(x, y, w, d, LAND, LAND + h, 3.2);
  placed.push({ x, y, r: Math.max(w, d) / 2 + 2 });
}
function terrace(x, y, w, d, h, along) {
  const tone = pick([PALETTE.brick, PALETTE.render, "#d9c7a8", PALETTE.stone]);
  P("box", { at: [x, y, LAND], size: along ? [w, d, h] : [d, w, h], colour: tone });
  P("gable", { at: [x, y, LAND + h], size: along ? [w + 0.6, d + 0.8, 3.2] : [d + 0.6, w + 0.8, 3.2], rot: along ? undefined : [0, 0, Math.PI / 2], colour: pick([PALETTE.slate, PALETTE.tile]) });
  windowBands(x, y, along ? w : d, along ? d : w, LAND, LAND + h, 3);
  placed.push({ x, y, r: Math.max(w, d) / 2 + 1 });
}
const [CX, CY] = CITY.core;
const pitch = CITY.block + CITY.street;
const stadium = CITY.stadium, park = CITY.park, port = CITY.port;
const reserved = (x, y, gap) => (x > park.x - gap && x < park.x + park.w + gap && y > park.y - gap && y < park.y + park.d + gap) ||
  Math.hypot(x - stadium.x, y - stadium.y) < stadium.r + 10 + gap || (x > port.x - gap && x < port.x + port.w + gap && y > port.y - gap && y < port.y + port.d + gap) || inSite(x, y, gap);
const blockOk = (x, y, half) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].every(([u, v]) => {
  const px = x + u * half, py = y + v * half;
  return W.coastX(py) - px > 10 && W.fromRiver(px, py) > 8 && !nearRoad(px, py, 3) && !reserved(px, py, 2);
});
function cityBlocks(area) {
  const streetLines = { x: new Set(), y: new Set() };
  for (let y = area.y0 + CITY.street / 2; y + CITY.block <= area.y1; y += pitch) for (let x = area.x0 + CITY.street / 2; x + CITY.block <= area.x1; x += pitch) {
    const bx = x + CITY.block / 2, by = y + CITY.block / 2;
    if (!blockOk(bx, by, CITY.block / 2)) continue;
    streetLines.x.add(y - CITY.street / 2); streetLines.x.add(y + CITY.block + CITY.street / 2);
    streetLines.y.add(x - CITY.street / 2); streetLines.y.add(x + CITY.block + CITY.street / 2);
    const dist = Math.hypot(bx - CX, by - CY);
    if (dist < 112) {
      // the core: one or two towers, the tallest nearest the water
      const h = 200 - dist * 0.85 + (R() - 0.5) * 34;
      if (R() < 0.45) { tower(bx - 9, by - 9, 16, 16, h); tower(bx + 11, by + 11, 13, 13, h * 0.62); }
      else tower(bx, by, 20 + R() * 6, 18 + R() * 6, h);
    } else if (dist < 215) {
      // the middle ring: mid-rise blocks round a courtyard
      const hh = 22 + (215 - dist) * 0.34 + R() * 10;
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (R() < 0.85) midrise(bx + u * 10.5, by + v * 10.5, 17 + R() * 3, 17 + R() * 3, hh * (0.75 + R() * 0.45));
    } else {
      // the edges: terraces with gardens
      const along = R() < 0.5;
      for (const v of [-1, 1]) terrace(bx + (along ? 0 : v * 12), by + (along ? v * 12 : 0), 34, 10, 9 + R() * 4, along);
      if (R() < 0.6) placeTree(bx + (R() - 0.5) * 10, by + (R() - 0.5) * 10, 0.6 + R() * 0.3);
    }
  }
  // the streets between the blocks, cut where they would run into the water
  const streets = [];
  const run = (pts) => {
    let seg = [];
    for (const p of pts) {
      const ok = W.coastX(p[1]) - p[0] > 4 && !reserved(p[0], p[1], -2);
      if (ok) seg.push(p); else { if (seg.length > 1) streets.push(seg); seg = []; }
    }
    if (seg.length > 1) streets.push(seg);
  };
  for (const y of streetLines.x) { const pts = []; for (let x = area.x0; x <= area.x1; x += 4) pts.push([x, y]); run(pts); }
  for (const x of streetLines.y) { const pts = []; for (let y = area.y0; y <= area.y1; y += 4) pts.push([x, y]); run(pts); }
  for (const s of streets) {
    const land = [];
    for (const p of s) { if (W.fromRiver(p[0], p[1]) > 2) land.push(p); else { if (land.length > 1) ribbon(land, CITY.street - 2, 0.3, PALETTE.asphalt); land.length = 0; } }
    if (land.length > 1) ribbon(land, CITY.street - 2, 0.3, PALETTE.asphalt);
    bridges(s, CITY.street - 2);
  }
  return streets;
}
const CITY_STREETS = [...cityBlocks(CITY.south), ...cityBlocks(CITY.north)];
for (const [name, line] of Object.entries(ROADS)) bridges(line, W.ROAD_WIDTH[name]);

// the park: lawns, trees and a pond
for (let n = 0; n < 26; n++) {
  const x = park.x + 5 + R() * (park.w - 10), y = park.y + 5 + R() * (park.d - 10);
  if (Math.hypot(x - park.x - park.w * 0.6, y - park.y - park.d * 0.55) < 11) continue;
  if (free(x, y, 3)) placeTree(x, y, 0.7 + R() * 0.4);
}
P("cyl", { at: [park.x + park.w * 0.6, park.y + park.d * 0.55, LAND - 0.3], r: 9, h: 0.5, seg: 24, colour: "#5fb8d4" });
// the stadium: a bowl of stands round a pitch, a roof ring over them
{
  const { x, y, r } = stadium;
  P("lathe", { at: [x, y, LAND], profile: [[0, r], [14, r + 3], [16, r + 3], [16, r - 2], [4, r - 10], [4, 0]], seg: 40, colour: PALETTE.concrete });
  P("box", { at: [x, y, LAND + 4], size: [r * 1.15, r * 0.75, 0.3], colour: PALETTE.pitch });
  P("lathe", { at: [x, y, LAND + 17], profile: [[0, r + 4], [1.2, r + 4], [1.2, r - 6], [0, r - 6]], seg: 40, colour: PALETTE.white });
  placed.push({ x, y, r: r + 8 });
}
// the port: a container yard, gantry cranes on the quay, a ship alongside
{
  const { x, y, w, d } = port;
  P("box", { at: [x + w / 2, y + d / 2, LAND - 0.2], size: [w, d, 0.3], colour: PALETTE.quay });
  for (let row = 0; row < 4; row++) for (let n = 0; n < 6; n++) {
    const cx = x + 10 + row * 9, cy = y + 12 + n * 17, stack = 1 + Math.floor(R() * 3);
    for (let k = 0; k < stack; k++) P("box", { at: [cx, cy, LAND + k * 2.6], size: [2.5, 12, 2.6], colour: pick(PALETTE.container) });
  }
  const qx = W.coastX(y + d / 2) - 4;
  for (const cy of [y + 22, y + 58, y + 94]) {
    for (const side of [-1, 1]) P("box", { at: [qx, cy + side * 6, LAND], size: [1.2, 1.2, 32], colour: PALETTE.red });
    P("box", { at: [qx + 8, cy, LAND + 32], size: [46, 3, 2.4], colour: PALETTE.red });
    P("box", { at: [qx - 4, cy, LAND + 34.4], size: [8, 4, 3], colour: PALETTE.white });
  }
  // the ship
  const sx = qx + 24, sy = y + d / 2;
  P("box", { at: [sx, sy, SEA_LEVEL - 4], size: [22, 110, 10], colour: PALETTE.hull });
  P("box", { at: [sx, sy, SEA_LEVEL + 6], size: [22.2, 110.2, 1.2], colour: PALETTE.red });
  for (let n = 0; n < 7; n++) for (let k = 0; k < 2; k++) P("box", { at: [sx, sy - 44 + n * 12, SEA_LEVEL + 7.2 + k * 2.6], size: [18, 11.5, 2.6], colour: pick(PALETTE.container) });
  P("box", { at: [sx, sy + 46, SEA_LEVEL + 7.2], size: [18, 10, 14], colour: PALETTE.white });
  P("box", { at: [sx, sy + 47, SEA_LEVEL + 21], size: [8, 4, 6], colour: PALETTE.dark });
}

// ── The village on the front road, round its church ─────────────────────────
{
  const v = W.SITES.village;
  P("box", { at: [v.x + 70, v.y + 40, on(v.x + 70, v.y + 40)], size: [17, 9, 8], colour: PALETTE.stone });
  P("gable", { at: [v.x + 70, v.y + 40, on(v.x + 70, v.y + 40) + 8], size: [17.6, 10, 5], colour: PALETTE.slate });
  P("box", { at: [v.x + 82, v.y + 40, on(v.x + 82, v.y + 40)], size: [6.5, 6.5, 19], colour: PALETTE.stone });
  P("cyl", { at: [v.x + 82, v.y + 40, on(v.x + 82, v.y + 40) + 19], r: 4.4, r2: 0.05, h: 13, seg: 4, rot: [0, 0, Math.PI / 4], colour: PALETTE.slate });
  placed.push({ x: v.x + 76, y: v.y + 40, r: 20 });
  for (let n = 0; n < 60; n++) {
    const x = v.x + R() * v.w, y = v.y + R() * v.d;
    if (free(x, y, 7.5) && W.onLand(x + 10, y) && !nearRoad(x, y, 5) && !inSite(x, y, 4)) placeHouse(x, y, R() < 0.5 ? 0 : Math.PI / 2);
  }
}

// ── Woods on the hills, trees along the river and the field edges ──────────
const wood = (cx, cy, rad, count) => {
  for (let n = 0, tries = 0; n < count && tries < count * 10; tries++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
    if (!clear(x, y, 4) || !free(x, y, 3)) continue;
    placeTree(x, y); n++;
  }
};
wood(70, 250, 70, 90);
wood(300, 120, 80, 110);
wood(40, 40, 50, 40);
wood(420, 60, 50, 50);
wood(220, 300, 40, 30);
wood(30, 520, 40, 30);
wood(380, 760, 40, 26);
for (let i = 2; i < W.RIVER.length - 2; i += 2) {
  const [x, y] = W.RIVER[i], [x2, y2] = W.RIVER[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
  for (const side of [-1, 1]) {
    if (R() < 0.35) continue;
    const off = 16 + R() * 6, tx = x - (dy / l) * off * side, ty = y + (dx / l) * off * side;
    if (clear(tx, ty, 3) && free(tx, ty, 3)) placeTree(tx, ty, 0.8 + R() * 0.4);
  }
}
for (let n = 0; n < 260; n++) {
  const x = 10 + R() * 760, y = 10 + R() * 800;
  if (clear(x, y, 6) && free(x, y, 5)) placeTree(x, y, 0.7 + R() * 0.5);
}

// ── Wind turbines: onshore on the ridge, offshore well out ──────────────────
const AX = W.WIND_FROM, yawOf = Math.atan2(AX[1], AX[0]);
const rotors = [];
function turbine(x, y, { base = on(x, y), hub = 84, R: rad = 46, tower = [2.8, 1.6], offshore = false } = {}) {
  if (offshore) {
    P("cyl", { at: [x, y, SEA_LEVEL - 4], r: 3.8, h: base - SEA_LEVEL + 4, seg: 16, colour: PALETTE.safety });
    P("cyl", { at: [x, y, base], r: 7, h: 1, seg: 16, colour: PALETTE.safety });
  }
  const top = base + hub;
  P("cyl", { at: [x, y, base], r: tower[0], r2: tower[1], h: hub - 1.8, seg: 14, colour: PALETTE.white });
  P("box", { at: [x - AX[0] * 2, y - AX[1] * 2, top - 2], size: [12, 4.2, 4], rot: [0, 0, yawOf], colour: PALETTE.white });
  rotors.push({ at: [x + AX[0] * 5, y + AX[1] * 5, top], axis: AX, R: rad, phase: R() * Math.PI * 2, rpm: 8 + R() * 4 });
  P("sphere", { at: [x - AX[0] * 7.5, y - AX[1] * 7.5, top + 2.5], r: 0.8, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
}
for (const [x, y] of W.ONSHORE) turbine(x, y);
for (const [x, y] of W.OFFSHORE) turbine(x, y, { base: 16, hub: 108, R: 60, tower: [3.4, 2.1], offshore: true });

// ── The power stations on the headland ──────────────────────────────────────
const steam = [];
{
  const s = W.SITES.nuclear, z = PADS.find((p) => p.name === "nuclear").z;
  const coolingTower = (x, y) => {
    const rt = 19, st = 82, c = 66, H = 112;
    const profile = Array.from({ length: 17 }, (_, i) => { const t = (H * i) / 16; return [t, rt * Math.sqrt(1 + ((t - st) / c) ** 2)]; });
    P("lathe", { at: [x, y, z], profile, seg: 40, colour: PALETTE.concrete, open: true, wall: 0.8 });
    P("cyl", { at: [x, y, z], r: profile[0][1] + 0.4, h: 3.4, seg: 40, colour: "#8d918c" });
    steam.push([x, y, z + H]);
  };
  coolingTower(s.x + 46, s.y + 40);
  coolingTower(s.x + 126, s.y + 34);
  P("cyl", { at: [s.x + 70, s.y + 116, z], r: 20, h: 32, seg: 32, colour: PALETTE.concrete });
  P("sphere", { at: [s.x + 70, s.y + 116, z + 32], r: 20, sub: 3, colour: "#e8e5de", hemi: true });
  const hall = { x: s.x + 100, y: s.y + 96, w: 84, d: 36 };
  P("box", { at: [hall.x + hall.w / 2, hall.y + hall.d / 2, z], size: [hall.w, hall.d, 26], colour: PALETTE.hall });
  P("gable", { at: [hall.x + hall.w / 2, hall.y + hall.d / 2, z + 26], size: [hall.w + 0.6, hall.d + 0.6, 3.6], colour: "#c7d3dc" });
  prims.push({ kind: "quads", group: "lights:glow", colour: "#ffcf7a", ref: [hall.x + hall.w / 2, hall.y + hall.d / 2, z + 10], quads: [0.2, 0.5, 0.8].map((f) => [[hall.x + hall.w * f - 3.5, hall.y + hall.d + 0.06, z], [hall.x + hall.w * f + 3.5, hall.y + hall.d + 0.06, z], [hall.x + hall.w * f + 3.5, hall.y + hall.d + 0.06, z + 9], [hall.x + hall.w * f - 3.5, hall.y + hall.d + 0.06, z + 9]]) });
  for (const tx of [s.x + 110, s.x + 128, s.x + 146]) P("box", { at: [tx, s.y + 144, z], size: [9, 7, 6], colour: PALETTE.dark });
}
{
  const s = W.SITES.gas, z = PADS.find((p) => p.name === "gas").z;
  P("box", { at: [s.x + 26, s.y + 46, z], size: [42, 34, 18], colour: PALETTE.hall });
  P("gable", { at: [s.x + 26, s.y + 46, z + 18], size: [42.6, 34.6, 3], colour: "#c7d3dc" });
  for (const y of [s.y + 22, s.y + 66]) {
    P("box", { at: [s.x + 60, y, z], size: [18, 16, 30], colour: PALETTE.steel });
    P("cyl", { at: [s.x + 74, y, z], r: 3.8, r2: 3.1, h: 70, seg: 18, colour: PALETTE.concrete });
    P("cyl", { at: [s.x + 74, y, z + 64], r: 3.25, h: 1.4, seg: 18, colour: PALETTE.red });
    P("cyl", { at: [s.x + 74, y, z + 70], r: 2.6, h: 0.3, seg: 18, colour: "#ffb35c", group: "lights:glow" });
  }
}
{
  const s = W.SITES.substation, z = PADS.find((p) => p.name === "substation").z;
  for (const tx of [s.x + 10, s.x + 26]) P("box", { at: [tx, s.y + 12, z], size: [8, 6, 5], colour: PALETTE.dark });
  P("box", { at: [s.x + 20, s.y + 25, z], size: [16, 6, 4], colour: PALETTE.render });
}

// ── The front: solar, the battery, the converter and geothermal ────────────
{
  const s = W.SITES.solar, z = PADS.find((p) => p.name === "solar").z, tilt = (25 * Math.PI) / 180;
  for (let y0 = s.y + 8; y0 < s.y + s.d - 6; y0 += 9.5) for (let x0 = s.x + 6; x0 + 18 < s.x + s.w - 2; x0 += 21) {
    P("box", { at: [x0 + 9, y0 + 2, z + 1.2], size: [18, 4.4, 0.18], rot: [-tilt, 0, 0], colour: PALETTE.pv });
    for (const px of [x0 + 2, x0 + 16]) P("box", { at: [px, y0 + 2, z], size: [0.25, 0.25, 1.4], colour: PALETTE.steel });
  }
}
{
  const s = W.SITES.battery, z = PADS.find((p) => p.name === "battery").z;
  for (let row = 0; row < 2; row++) for (let n = 0; n < 3; n++) {
    const x = s.x + 9 + n * 14.5, y = s.y + 9 + row * 16;
    P("box", { at: [x, y, z], size: [12, 2.9, 2.9], colour: "#eef1f3" });
    P("box", { at: [x + 5, y + 1.48, z + 2.2], size: [0.7, 0.05, 0.4], colour: "#38c172", group: "lights:led" });
  }
}
{
  const s = W.SITES.converter, z = PADS.find((p) => p.name === "converter").z;
  P("box", { at: [s.x + 24, s.y + 20, z], size: [38, 26, 16], colour: PALETTE.hall });
  P("box", { at: [s.x + 24, s.y + 20, z + 16], size: [38.6, 26.6, 0.8], colour: "#c7d3dc" });
  const route = W.smoothLine(W.INTERCONNECTOR, 8).map(([x, y]) => [x, y, Math.max(on(x, y), SEA_LEVEL - 24) + 0.6]);
  route[0][2] = z;
  P("tube", { points: route, r: 0.9, colour: "#30373d" });
}
const bore = { x: 90, y: TILE.d };
{
  const s = W.SITES.geothermal, z = PADS.find((p) => p.name === "geothermal").z;
  P("box", { at: [s.x + 76, s.y + 24, z], size: [40, 24, 12], colour: PALETTE.hall });
  P("box", { at: [s.x + 30, s.y + 20, z], size: [34, 18, 8], colour: PALETTE.steel });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) P("cyl", { at: [s.x + 17.5 + i * 8.3, s.y + 15.5 + j * 9, z + 8], r: 3.4, h: 0.6, seg: 16, colour: PALETTE.dark });
  P("box", { at: [bore.x, bore.y - 6, z], size: [8, 6, 1], colour: PALETTE.safety });
  P("cyl", { at: [bore.x, bore.y - 6, z + 1], r: 1.3, h: 6, seg: 12, colour: PALETTE.steel });
  P("tube", { points: [[bore.x, bore.y - 6, z + 6], [bore.x, s.y + 48, z + 6], [s.x + 56, s.y + 48, z + 6]], r: 0.8, colour: "#c3cacf" });
  P("tube", { points: [[bore.x, bore.y + 0.4, z], [bore.x, bore.y + 0.4, -92]], r: 1.1, colour: "#59636b" });
}

// ── Boats ───────────────────────────────────────────────────────────────────
{
  const boat = (x, y, ang, len, sail) => {
    P("box", { at: [x, y, SEA_LEVEL - 0.4], size: [len, len * 0.34, 1.8], rot: [0, 0, ang], colour: PALETTE.boat });
    if (sail) P("cyl", { at: [x, y, SEA_LEVEL + 1.4], r: 2.8, r2: 0.05, h: 12, seg: 3, rot: [0, 0, ang], colour: "#fbfbf9" });
    else P("box", { at: [x - Math.cos(ang) * 2.4, y - Math.sin(ang) * 2.4, SEA_LEVEL + 1.4], size: [5, 4, 2.4], rot: [0, 0, ang], colour: PALETTE.white });
  };
  boat(860, 330, 0.6, 10, true);
  boat(820, 720, -0.3, 9, true);
  boat(1000, 470, -0.9, 18, false);
}

// ── Pylons and the line ─────────────────────────────────────────────────────
const ARMS = [{ z: 30, w: 9 }, { z: 36.5, w: 8 }, { z: 43, w: 6.5 }], PEAK = 49;
{
  const half = (z) => (z < 28 ? 5 - (z / 28) * 3.4 : 1.6 - ((z - 28) / (PEAK - 28)) * 1.2);
  const c4 = [[1, 1], [1, -1], [-1, -1], [-1, 1]], levels = [0, 7, 14, 21, 28, 34, 40, 46, PEAK], bars = [];
  for (const [u, v] of c4) for (let j = 0; j < levels.length - 1; j++) bars.push([[u * half(levels[j]), v * half(levels[j]), levels[j]], [u * half(levels[j + 1]), v * half(levels[j + 1]), levels[j + 1]]]);
  for (let j = 1; j < levels.length; j++) for (let f = 0; f < 4; f++) {
    const [au, av] = c4[f], [bu, bv] = c4[(f + 1) % 4], z = levels[j], z0 = levels[j - 1];
    bars.push([[au * half(z), av * half(z), z], [bu * half(z), bv * half(z), z]], [[au * half(z0), av * half(z0), z0], [bu * half(z), bv * half(z), z]]);
  }
  for (const arm of ARMS) for (const side of [-1, 1]) {
    bars.push([[0.9, side * half(arm.z), arm.z], [0, side * arm.w, arm.z]], [[-0.9, side * half(arm.z), arm.z], [0, side * arm.w, arm.z]]);
    bars.push([[0, side * arm.w, arm.z], [0, side * half(arm.z + 2.5), arm.z + 2.5]], [[0, side * arm.w, arm.z], [0, side * arm.w, arm.z - 3]]);
  }
  protos.pylon = [{ kind: "bars", bars, r: 0.18, colour: "#8a959d" }, { kind: "sphere", at: [0, 0, PEAK + 0.6], r: 0.6, sub: 1, colour: PALETTE.red, group: "lights:beacon" }];
}
const pylonTips = [];
W.PYLONS.forEach(([x, y], i) => {
  const a = W.PYLONS[Math.max(0, i - 1)], b = W.PYLONS[Math.min(W.PYLONS.length - 1, i + 1)];
  const rot = Math.atan2(b[1] - a[1], b[0] - a[0]), z0 = on(x, y), c = Math.cos(rot), s = Math.sin(rot);
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

// ── Boulders under the cliffs ───────────────────────────────────────────────
protos.rock = [{ kind: "sphere", at: [0, 0, 0.4], r: 1, sub: 1, colour: PALETTE.rock, jitter: 0.28 }];
for (let y = 6; y < TILE.d; y += 4) {
  if (W.SHORE(y) !== "cliff") continue;
  for (let n = 0; n < 2; n++) {
    const x = W.coastX(y) + 1 + R() * 9;
    if (x < TILE.w - 4) instances.push({ proto: "rock", at: [x, y + R() * 3, SEA_LEVEL - 1.2], rot: R() * 6.3, scale: 1.6 + R() * 3.2 });
  }
}

// ── Cars on the main roads and the city's streets; the page drives them ────
const cars = [];
const CAR_COUNT = { ring: 12, front: 6, link: 5, lane: 1 };
for (const [name, count] of Object.entries(CAR_COUNT)) for (let n = 0; n < count; n++) {
  cars.push({ road: name, at: (n + R() * 0.6) / count, forward: R() < 0.5, speed: 10 + R() * 6, colour: PALETTE.cars[cars.length % PALETTE.cars.length] });
}
const streetRoads = {};
CITY_STREETS.filter((s) => s.length > 12).slice(0, 14).forEach((s, i) => {
  const name = `street${i}`;
  streetRoads[name] = s;
  for (let n = 0; n < 2; n++) cars.push({ road: name, at: R(), forward: R() < 0.5, speed: 7 + R() * 4, colour: PALETTE.cars[cars.length % PALETTE.cars.length] });
});
protos.car = [
  { kind: "box", at: [0, 0, 0.35], size: [4.4, 1.9, 1.0], colour: "#ffffff", group: "paint:body" },
  { kind: "box", at: [-0.3, 0, 1.35], size: [2.4, 1.7, 0.65], colour: PALETTE.windows },
  { kind: "box", at: [2.22, 0.55, 0.8], size: [0.05, 0.4, 0.25], colour: "#fff6cf", group: "lights:head" },
  { kind: "box", at: [2.22, -0.55, 0.8], size: [0.05, 0.4, 0.25], colour: "#fff6cf", group: "lights:head" },
];

// ── Sheep on the hill pastures ──────────────────────────────────────────────
protos.sheep = [{ kind: "sphere", at: [0, 0, 1], r: 1, sub: 1, colour: "#fbfbf6" }, { kind: "sphere", at: [0.9, 0, 1.1], r: 0.45, sub: 1, colour: "#3d3a36" }];
for (let n = 0; n < 40; n++) {
  const x = 20 + R() * 260, y = 420 + R() * 200;
  if (clear(x, y, 3) && free(x, y, 1.5)) instances.push({ proto: "sheep", at: [x, y, on(x, y)], rot: R() * 6.3, scale: 1 });
}

const roadsOut = { ...ROADS, ...streetRoads };
const widthsOut = { ...W.ROAD_WIDTH, ...Object.fromEntries(Object.keys(streetRoads).map((n) => [n, CITY.street - 2])) };
export function scene() {
  return {
    tile: TILE, depth: DEPTH, seaLevel: SEA_LEVEL,
    terrain: terrain(), sides: sides(),
    prims, protos, instances, rotors, cars, steam,
    // the tallest points, so the camera frames them; where the bore meets the hot rock
    tall: [[CX, CY, 210], [W.SITES.nuclear.x + 46, W.SITES.nuclear.y + 40, 140], [1040, 70, 190], [60, 120, 200]],
    bore: [bore.x, bore.y, -92],
    roads: Object.fromEntries(Object.entries(roadsOut).map(([n, l]) => [n, l.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round((Math.max(on(x, y), LAND - 0.5) + 0.3) * 100) / 100])])),
    roadWidth: widthsOut,
  };
}
