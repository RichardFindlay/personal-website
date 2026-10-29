// The island as a scene description for Blender, in a playful, game-like
// style after the current homepage hero: a floating island with a soft,
// bayed outline and chunky strata on its walls; highlands with a reservoir and
// a hydro dam; a river to the sea; two cities joined by a road and a pylon
// line; every power station wired to them. Toy landmarks with bevelled edges,
// lollipop trees. All the geometry is decided here from layout.mjs;
// blender/island.py meshes it, bakes its soft shadows and exports. Metres from
// the island's centre: x east, y south (toward the viewer), z up.
import * as W from "./layout.mjs";

const { DEPTH, TOP, WATER, BED } = W;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
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
function catmull(points, step = 4) {
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

// ── Palette: the hero's colours, brighter, like a game ──────────────────────
export const PALETTE = {
  grass: ["#69b23c", "#74bd44", "#5fa836", "#7fc44c"], highland: "#5c9f37", sand: "#efdcaa", seabed: "#e2cf9a", seabedDeep: "#58b3c4",
  rock: "#a3a9ad", pavement: "#e6e0d3", asphalt: "#5c6670", marking: "#f7f5ee",
  layers: { water: "#35a9c8", grass: "#5fa836", topsoil: "#7a5638", subsoil: "#a67c50", sediment: "#dcc792", sandstone: "#d6ad70", mudstone: "#9a8f80", limestone: "#e6dcc4", granite: "#b29f92" },
  towers: ["#5f84a8", "#f0e5cc", "#d27a4f", "#8fb08a", "#86c3dc", "#e9c46a", "#b9a3c9"],
  white: "#f6f6f2", steel: "#a3acb4", concrete: "#e2ded5", dam: "#d8d4ca", dark: "#46505a", red: "#d9503f", safety: "#f0b530",
  pv: "#2d4f80", pvLine: "#9fb9d6", brick: "#c8694a", leaf: ["#56ab35", "#63b93c", "#4b9a2e", "#76c64a"],
  trunk: "#8a6444", roofs: ["#d0674a", "#5f6f80", "#b9573f", "#7d8a96"], walls: ["#f4ead6", "#e9d5b9", "#f6f1e7", "#dfc3a3"],
  cars: ["#f4f4f2", "#e05544", "#3f7ac0", "#2ea38f", "#f2bf35", "#30373e"],
};

// ── The river, the reservoir and the ground's height ────────────────────────
const RIVER = catmull(W.RIVER_POINTS, 3);
const RIVER_LEN = (() => { let s = 0; for (let i = 1; i < RIVER.length; i++) s += Math.hypot(RIVER[i][0] - RIVER[i - 1][0], RIVER[i][1] - RIVER[i - 1][1]); return s; })();
// the nearest point of the river: how far outside its banks, how far along it, its level there
function river(x, y) {
  let best = { d: Infinity, t: 0 }, s = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, ay] = RIVER[i], [bx, by] = RIVER[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, l = Math.sqrt(l2);
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const t = (s + u * l) / RIVER_LEN;
    const d = Math.hypot(x - ax - u * dx, y - ay - u * dy) - W.riverWidth(t) / 2;
    if (d < best.d) best = { d, t };
    s += l;
  }
  return { ...best, level: W.riverLevel(best.t) };
}
const inRect = (cx, cy, w, d, x, y, gap = 0) => Math.abs(x - cx) < w / 2 + gap && Math.abs(y - cy) < d / 2 + gap;
const onPlinth = (x, y, gap = 0) => inRect(W.CITY_A.x, W.CITY_A.y, ...W.CITY_A.plinth, x, y, gap) || inRect(W.CITY_B.x, W.CITY_B.y, ...W.CITY_B.plinth, x, y, gap);
const reservoir = (x, y) => ((x - W.RESERVOIR.x) / W.RESERVOIR.rx) ** 2 + ((y - W.RESERVOIR.y) / W.RESERVOIR.ry) ** 2;

function groundZ(x, y, f = W.reach(x, y)) {
  const H = W.HIGHLAND, q = Math.hypot(x - H.x, y - H.y) / H.r;
  const highland = q < 1 ? H.h * (1 - q * q) ** 2 : 0;
  const flat = onPlinth(x, y, 8) ? 0 : 1;
  let z = TOP + highland * flat + flat * 0.9 * fbm(x / 40, y / 40, 1);
  // the reservoir's bowl in the highlands
  const e = reservoir(x, y);
  if (e < 1.5) z = lerp(z, W.RESERVOIR.level - 7 * Math.max(0, 1 - e), smooth(1.5, 1.0, e));
  // the river's valley: a bed below its level, banks easing up to the land
  const r = river(x, y);
  if (r.d < 14) z = r.d < 0 ? r.level - 3 + 1.2 * smooth(-6, 0, r.d) : lerp(r.level + 0.6, z, smooth(0, 14, r.d));
  z -= 2.2 * smooth(0.965, 1, f);                       // the soft lip at the edge
  return lerp(z, BED + 0.8 * fbm(x / 25, y / 25, 2), W.seaShare(x, y));
}
function groundColour(x, y, z, slope) {
  if (W.seaShare(x, y) > 0.02 && z < WATER + 0.3) return mix(hex(PALETTE.seabed), hex(PALETTE.seabedDeep), smooth(WATER - 1, BED + 1, z));
  if (reservoir(x, y) < 1.02) return mix(hex(PALETTE.seabed), hex(PALETTE.seabedDeep), 0.6);
  const r = river(x, y);
  if (r.d < 0.5) return hex(PALETTE.seabed);
  if (r.d < 4 || W.seaShare(x, y) > 0.02) return hex(PALETTE.sand);
  if (slope > 0.75) return mix(hex(PALETTE.rock), hex("#8c9398"), 0.5 + 0.5 * fbm(x / 9, y / 9, 6));
  if (onPlinth(x, y, 2)) return hex(PALETTE.pavement);
  const i = Math.floor((x + 24 * fbm(x / 80, y / 80, 9)) / 70), j = Math.floor((y + 20 * fbm(x / 80, y / 80, 7)) / 56);
  const field = mix(hex(PALETTE.grass[Math.floor(hash(i, j, 5) * PALETTE.grass.length)]), hex("#4f9a2f"), 0.18 * (fbm(x / 14, y / 14, 3) + 0.5));
  return mix(field, hex(PALETTE.highland), smooth(TOP + 8, TOP + 26, z));
}
export const ground = (x, y) => groundZ(x, y);

// ── The ground as one surface: rings out to the outline, so its edge is exact
const NT = 300, NR = 50;
const ringF = (k) => 0.02 + 0.98 * (1 - Math.pow(1 - k / NR, 1.4));
function surface() {
  const verts = [], vcolours = [], faces = [];
  for (let k = 0; k <= NR; k++) for (let i = 0; i < NT; i++) {
    const t = (i / NT) * Math.PI * 2, f = ringF(k), [x, y] = W.edgeAt(t, f);
    const z = groundZ(x, y, f);
    const slope = Math.hypot(groundZ(x + 2, y) - groundZ(x - 2, y), groundZ(x, y + 2) - groundZ(x, y - 2)) / 4;
    verts.push([x, y, z].map((v) => Math.round(v * 100) / 100));
    vcolours.push(...groundColour(x, y, z, slope).map((v) => Math.round(v * 255)));
  }
  const at = (k, i) => k * NT + (i % NT);
  for (let k = 0; k < NR; k++) for (let i = 0; i < NT; i++) faces.push([at(k, i), at(k + 1, i), at(k + 1, i + 1), at(k, i + 1)]);
  const c = verts.length;
  verts.push([0, 0, groundZ(0, 0)]);
  vcolours.push(...groundColour(0, 0, groundZ(0, 0), 0).map((v) => Math.round(v * 255)));
  for (let i = 0; i < NT; i++) faces.push([c, at(0, i), at(0, i + 1)]);
  return { kind: "mesh", group: "ground", verts, vcolours, faces, colour: PALETTE.grass[0] };
}
// the water: the inlet's sea, the river's ribbon falling to it, the reservoir
function waters() {
  const verts = [], faces = [];
  const idx = new Map();
  const vert = (k, i) => {
    const key = k * NT + (i % NT);
    if (!idx.has(key)) { const [x, y] = W.edgeAt(((i % NT) / NT) * Math.PI * 2, ringF(k)); idx.set(key, verts.length); verts.push([x, y, WATER]); }
    return idx.get(key);
  };
  for (let k = 0; k < NR; k++) for (let i = 0; i < NT; i++) {
    const [x, y] = W.edgeAt(((i + 0.5) / NT) * Math.PI * 2, ringF(k + 0.5));
    if (W.seaShare(x, y) > 0) faces.push([vert(k, i), vert(k + 1, i), vert(k + 1, i + 1), vert(k, i + 1)]);
  }
  // the river, a little wider than its bed so it meets the banks
  let s = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const side = (p, t) => {
      const w = W.riverWidth(t) / 2 + 1.6, dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
      return [[p[0] + (dy / n) * w, p[1] - (dx / n) * w, W.riverLevel(t)], [p[0] - (dy / n) * w, p[1] + (dx / n) * w, W.riverLevel(t)]];
    };
    const ta = s / RIVER_LEN, tb = (s + l) / RIVER_LEN;
    const [a0, a1] = side(a, ta), [b0, b1] = side(b, tb);
    const n = verts.length;
    verts.push(a0, a1, b1, b0);
    faces.push([n, n + 3, n + 2, n + 1]);
    s += l;
  }
  // the reservoir
  const R0 = W.RESERVOIR, c = verts.length;
  verts.push([R0.x, R0.y, R0.level]);
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; verts.push([R0.x + Math.cos(a) * R0.rx * 1.08, R0.y + Math.sin(a) * R0.ry * 1.08, R0.level]); }
  for (let i = 0; i < 48; i++) faces.push([c, c + 1 + i, c + 2 + i]);
  return { kind: "mesh", group: "water", verts, faces, colour: "#35a9c8", smooth: false };
}

// ── The walls: chunky strata round the whole outline ────────────────────────
const LAYERS = ["water", "grass", "topsoil", "subsoil", "sediment", "sandstone", "mudstone", "limestone", "granite"];
function column(t) {
  const [x, y] = W.edgeAt(t), sea = W.seaShare(x * 0.999, y * 0.999), top = groundZ(x, y, 1);
  const wet = sea > 0.5, land = wet ? 0 : 1;
  const th = [wet ? WATER - top : 0, 2.5 * land, 5 * land, 8 * land, wet ? 5 : 0];
  const z = [wet ? WATER : top];
  for (const h of th) z.push(z[z.length - 1] - h);
  const s = t * 300;
  const wave = (base, amp, len, ph) => base + amp * Math.sin(s / len + ph) + amp * 0.45 * Math.sin(s / (len * 0.4) + ph * 2.1);
  z.push(Math.min(z[z.length - 1] - 3, wave(-24, 3, 60, 0.4)));
  z.push(wave(-40, 4, 80, 1.9));
  z.push(wave(-55, 3, 50, 3.1));
  z.push(-DEPTH);
  return { x, y, z };
}
function walls() {
  const verts = [], faces = [], fcolours = [];
  const cols = Array.from({ length: NT + 1 }, (_, i) => column((i / NT) * Math.PI * 2));
  for (let i = 0; i < NT; i++) {
    const a = cols[i], b = cols[i + 1];
    LAYERS.forEach((name, l) => {
      if (a.z[l] - a.z[l + 1] < 0.02 && b.z[l] - b.z[l + 1] < 0.02) return;
      const n = verts.length;
      verts.push([a.x, a.y, a.z[l]], [a.x, a.y, a.z[l + 1]], [b.x, b.y, b.z[l + 1]], [b.x, b.y, b.z[l]]);
      faces.push([n, n + 1, n + 2, n + 3]);
      fcolours.push(PALETTE.layers[name]);
    });
  }
  const c = verts.length;
  verts.push([0, 0, -DEPTH]);
  for (let i = 0; i <= NT; i++) verts.push([cols[i % NT].x, cols[i % NT].y, -DEPTH]);
  for (let i = 0; i < NT; i++) { faces.push([c, c + 2 + i, c + 1 + i]); fcolours.push(PALETTE.layers.granite); }
  return { kind: "mesh", group: "rock", verts, faces, fcolours, colour: PALETTE.layers.granite, smooth: false };
}

// ── Primitives ──────────────────────────────────────────────────────────────
const prims = [surface(), waters(), walls()], protos = {}, instances = [];
const P = (kind, spec) => prims.push({ kind, group: "static", ...spec });
const on = (x, y) => groundZ(x, y);
const R = W.seeded(91);
const pick = (list) => list[Math.floor(R() * list.length)];
const taken = [];
const free = (x, y, r) => taken.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r);
const claim = (x, y, r) => taken.push({ x, y, r });
const tall = [];

// ── Roads, with a bridge wherever one crosses the river ─────────────────────
const ROADS = Object.fromEntries(Object.entries(W.ROADS).map(([n, p]) => [n, catmull(p, 3)]));
const roadZ = (x, y) => { const r = river(x, y); return r.d < 5 ? Math.max(on(x, y), r.level + 4) : on(x, y); };
function ribbon(line, width, lift, colour, group = "static", dash = 0, zOf = on) {
  const quads = [];
  const side = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [[p[0] - (dy / l) * width / 2, p[1] + (dx / l) * width / 2], [p[0] + (dy / l) * width / 2, p[1] - (dx / l) * width / 2]];
  });
  for (let i = 0; i < line.length - 1; i++) {
    if (dash && i % 2) continue;
    const zi = zOf(...line[i]) + lift, zj = zOf(...line[i + 1]) + lift;
    quads.push([[...side[i][0], zi], [...side[i][1], zi], [...side[i + 1][1], zj], [...side[i + 1][0], zj]]);
  }
  prims.push({ kind: "quads", quads, colour, group });
}
for (const line of Object.values(ROADS)) {
  ribbon(line, W.ROAD_WIDTH, 0.35, PALETTE.asphalt, "static", 0, roadZ);
  ribbon(line, 0.6, 0.45, PALETTE.marking, "static", 1, roadZ);
  for (const [x, y] of line) claim(x, y, W.ROAD_WIDTH / 2 + 2);
  // the bridge: a deck under the road and parapets either side, over the water
  const over = line.filter(([x, y]) => river(x, y).d < 5);
  if (over.length > 1) {
    const a = over[0], b = over[over.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 6, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, z = roadZ(cx, cy);
    P("rbox", { at: [cx, cy, z - 2.2], size: [len, W.ROAD_WIDTH + 2, 2.5], rot: [0, 0, ang], r: 0.5, colour: PALETTE.concrete });
    for (const sgn of [-1, 1]) P("rbox", { at: [cx - Math.sin(ang) * sgn * (W.ROAD_WIDTH / 2 + 0.7), cy + Math.cos(ang) * sgn * (W.ROAD_WIDTH / 2 + 0.7), z + 0.3], size: [len, 0.8, 1.4], rot: [0, 0, ang], r: 0.3, colour: PALETTE.concrete });
    for (const f of [0.3, 0.7]) P("rbox", { at: [lerp(a[0], b[0], f), lerp(a[1], b[1], f), river(cx, cy).level - 3], size: [3, W.ROAD_WIDTH, z - river(cx, cy).level + 1], rot: [0, 0, ang], r: 0.4, colour: PALETTE.concrete });
  }
}

// ── Prototypes, instanced by the page ───────────────────────────────────────
protos.tree_round = [
  { kind: "cyl", at: [0, 0, 0], r: 0.9, r2: 0.7, h: 6, seg: 8, colour: PALETTE.trunk },
  { kind: "sphere", at: [0, 0, 11], r: 6.4, sub: 2, colour: PALETTE.leaf[1] },
];
protos.tree_tall = [
  { kind: "cyl", at: [0, 0, 0], r: 0.8, r2: 0.6, h: 4, seg: 8, colour: PALETTE.trunk },
  { kind: "lathe", at: [0, 0, 3], profile: [[0, 5.5], [5, 4.6], [10, 2.8], [14, 0]], seg: 10, colour: PALETTE.leaf[2] },
];
// little houses with pitched roofs, four paints
PALETTE.walls.forEach((wall, n) => {
  const roof = PALETTE.roofs[n], w = 12, d = 9, h = 7;
  protos[`house_${n}`] = [
    { kind: "rbox", at: [0, 0, 0], size: [w, d, h], r: 0.6, colour: wall },
    { kind: "gable", at: [0, 0, h], size: [w + 1, d + 1.4, 4.6], colour: roof },
    { kind: "box", at: [w * 0.25, -d * 0.2, h + 1.4], size: [1.4, 1.4, 4], colour: PALETTE.brick },
    { kind: "quad", pts: [[-2.2, d / 2 + 0.05, 2.6], [-0.4, d / 2 + 0.05, 2.6], [-0.4, d / 2 + 0.05, 4.8], [-2.2, d / 2 + 0.05, 4.8]], colour: "#4d6274", group: "lights:window" },
    { kind: "quad", pts: [[1.6, d / 2 + 0.05, 2.6], [3.4, d / 2 + 0.05, 2.6], [3.4, d / 2 + 0.05, 4.8], [1.6, d / 2 + 0.05, 4.8]], colour: "#4d6274", group: "lights:window" },
    { kind: "quad", pts: [[w / 2 + 0.05, -1, 2.6], [w / 2 + 0.05, 1, 2.6], [w / 2 + 0.05, 1, 4.8], [w / 2 + 0.05, -1, 4.8]], colour: "#4d6274", group: "lights:window" },
  ];
});
function tree(x, y, s = 0.8 + R() * 0.45) {
  claim(x, y, 6 * s);
  instances.push({ proto: R() < 0.2 ? "tree_tall" : "tree_round", at: [x, y, on(x, y)], rot: R() * 6.28, scale: s });
}
function house(x, y, rot) {
  claim(x, y, 8);
  instances.push({ proto: `house_${Math.floor(R() * 4)}`, at: [x, y, on(x, y)], rot, scale: 0.9 + R() * 0.2 });
}

// ── The cities: chunky blocks on plinths, streets between, windows in grids ─
function windows(x, y, w, d, z0, z1, colour, floor = 6) {
  const quads = [];
  for (let zz = z0 + 4.5; zz + 4 < z1 - 1.5; zz += floor) {
    for (let u = -w / 2 + 3; u + 2.4 < w / 2 - 2; u += 4.6) quads.push([[x + u, y + d / 2 + 0.06, zz], [x + u + 2.5, y + d / 2 + 0.06, zz], [x + u + 2.5, y + d / 2 + 0.06, zz + 3.3], [x + u, y + d / 2 + 0.06, zz + 3.3]]);
    for (let u = -d / 2 + 3; u + 2.4 < d / 2 - 2; u += 4.6) quads.push([[x + w / 2 + 0.06, y + u + 2.5, zz], [x + w / 2 + 0.06, y + u, zz], [x + w / 2 + 0.06, y + u, zz + 3.3], [x + w / 2 + 0.06, y + u + 2.5, zz + 3.3]]);
  }
  prims.push({ kind: "quads", quads, colour: toHex(mix(hex(colour), [0.12, 0.17, 0.24], 0.55)), group: "lights:window", ref: [x, y, (z0 + z1) / 2] });
}
function block(x, y, w, d, h, colour, crown = true) {
  const z = TOP + 1.6;
  P("rbox", { at: [x, y, z], size: [w, d, h], r: 1.3, colour });
  if (crown) P("rbox", { at: [x + w * 0.1, y - d * 0.1, z + h], size: [w * 0.45, d * 0.4, 3], r: 0.5, colour: PALETTE.steel });
  windows(x, y, w, d, z, z + h, colour);
  tall.push([x, y, z + h + 4]);
}
function city(C, heightAt) {
  const [pw, pd] = C.plinth;
  P("rbox", { at: [C.x, C.y, TOP - 1], size: [pw, pd, 2.6], r: 1.4, colour: PALETTE.pavement });
  // the streets across the plinth, between the blocks
  for (let i = 0; i <= C.cols; i++) P("box", { at: [C.x + (i - C.cols / 2) * C.pitch, C.y, TOP + 1.62], size: [5, pd - 4, 0.06], colour: PALETTE.asphalt });
  for (let j = 0; j <= C.rows; j++) P("box", { at: [C.x, C.y + (j - C.rows / 2) * C.pitch, TOP + 1.62], size: [pw - 4, 5, 0.06], colour: PALETTE.asphalt });
  for (let j = 0; j < C.rows; j++) for (let i = 0; i < C.cols; i++) {
    const x = C.x + (i - (C.cols - 1) / 2) * C.pitch, y = C.y + (j - (C.rows - 1) / 2) * C.pitch;
    const [h, kind] = heightAt(i, j);
    const colour = PALETTE.towers[(i * 3 + j * 5) % PALETTE.towers.length];
    if (kind === "tower") {
      block(x, y, C.pitch - 9, C.pitch - 9, h, colour);
      if (h > 110) { P("cyl", { at: [x, y, TOP + 1.6 + h + 3], r: 0.8, r2: 0.25, h: 20, seg: 6, colour: PALETTE.steel }); P("sphere", { at: [x, y, TOP + 1.6 + h + 23.5], r: 1.1, sub: 1, colour: PALETTE.red, group: "lights:beacon" }); tall.push([x, y, TOP + h + 30]); }
    } else {
      // a mid-rise pair with a little yard between
      block(x - 5, y - 4, C.pitch - 16, C.pitch - 15, h, colour);
      block(x + 7, y + 7, 11, 11, h * 0.6, PALETTE.towers[(i + j + 2) % PALETTE.towers.length], false);
    }
  }
  claim(C.x, C.y, Math.hypot(pw, pd) / 2 + 2);
}
city(W.CITY_A, (i, j) => {
  const d = Math.hypot(i - (W.CITY_A.cols - 1) / 2, j - (W.CITY_A.rows - 1) / 2);
  return [Math.round(150 - d * 44 + (hash(i, j, 3) - 0.5) * 26), "tower"];
});
city(W.CITY_B, (i, j) => {
  const d = Math.hypot(i - 1, j - 1);
  return d < 0.5 ? [72, "tower"] : [Math.round(30 + hash(i, j, 8) * 22), d < 1.2 ? "tower" : "mid"];
});
// suburbs: houses along little lanes, gardens between
for (const S of W.SUBURBS) {
  for (let y = S.y - S.d / 2 + 6; y <= S.y + S.d / 2; y += 16) for (let x = S.x - S.w / 2 + 6; x <= S.x + S.w / 2; x += 17) {
    const hx = x + (R() - 0.5) * 3, hy = y + (R() - 0.5) * 3;
    if (W.reach(hx, hy) > 0.9 || river(hx, hy).d < 6 || reservoir(hx, hy) < 1.4 || !free(hx, hy, 7)) continue;
    if (R() < 0.82) house(hx, hy, R() < 0.5 ? 0 : Math.PI / 2);
    else tree(hx, hy, 0.6 + R() * 0.3);
  }
}

// the data centre beside the main city, and the pixels it sends up
const pixels = [];
{
  const { x, y, w, d, h } = W.DATA_CENTRE, z = on(x, y);
  P("rbox", { at: [x, y, z], size: [w, d, h], r: 1, colour: PALETTE.white });
  P("box", { at: [x, y + d / 2 + 0.05, z + h * 0.45], size: [w - 4, 0.1, 2], colour: "#46e0e6", group: "lights:led" });
  for (let i = 0; i < 3; i++) P("cyl", { at: [x - w / 2 + 8 + i * 12, y, z + h], r: 3.4, h: 1.2, seg: 16, colour: PALETTE.dark });
  claim(x, y, 26);
  pixels.push([x, y, z + h + 2]);
}

// ── Hydro: the dam across the valley, its spillway, the powerhouse below ───
const spray = [];
{
  const D = W.DAM, [ax, ay] = W.RIVER_POINTS[0], [bx, by] = W.RIVER_POINTS[1];
  const ang = Math.atan2(by - ay, bx - ax), c = Math.cos(ang), s = Math.sin(ang);
  const foot = river(D.x, D.y).level - 3;
  // the wall, thick at the foot, its crest a road
  P("rbox", { at: [D.x, D.y, foot], size: [12, D.length, D.top - foot], rot: [0, 0, ang], r: 1, colour: PALETTE.dam });
  P("rbox", { at: [D.x - c * 1.5, D.y - s * 1.5, D.top], size: [8, D.length + 4, 1.4], rot: [0, 0, ang], r: 0.4, colour: PALETTE.concrete });
  // three spillway gates, white water pouring down the downstream face
  for (const k of [-1, 0, 1]) {
    const gx = D.x - s * k * 10, gy = D.y + c * k * 10;
    P("rbox", { at: [gx + c * 2, gy + s * 2, D.top - 1], size: [3, 2, 5], rot: [0, 0, ang], r: 0.3, colour: PALETTE.steel });
    const top = [gx + c * 6, gy + s * 6, D.top - 3], low = [gx + c * 16, gy + s * 16, river(gx + c * 16, gy + s * 16).level + 0.2];
    const off = [-s * 3.2, c * 3.2];
    prims.push({ kind: "quads", group: "foam", colour: "#ffffff", quads: [[[top[0] - off[0], top[1] - off[1], top[2]], [top[0] + off[0], top[1] + off[1], top[2]], [low[0] + off[0], low[1] + off[1], low[2]], [low[0] - off[0], low[1] - off[1], low[2]]]] });
    spray.push([low[0], low[1], low[2] + 1]);
  }
  // the powerhouse on the bank, two penstocks down to it
  const px = D.x + c * 18 + s * 24, py = D.y + s * 18 - c * 24, pz = on(px, py);
  P("rbox", { at: [px, py, pz], size: [20, 14, 10], rot: [0, 0, ang], r: 1, colour: PALETTE.towers[0] });
  P("gable", { at: [px, py, pz + 10], size: [14, 20, 3], rot: [0, 0, ang + Math.PI / 2], colour: "#d6dee6" });
  for (const k of [-3, 3]) P("tube", { points: [[D.x + s * (22 + k * 0.3), D.y - c * (22 + k * 0.3), D.top - 6], [px - c * 9 + s * k, py - s * 9 - c * k, pz + 6]], r: 1.4, colour: PALETTE.steel });
  claim(D.x, D.y, 30); claim(px, py, 14);
  tall.push([D.x, D.y, D.top + 10]);
}

// ── Wind on the highland rim ────────────────────────────────────────────────
// the rotors face south-south-east, toward the viewer, so the blades read as full discs
const AX = (() => { const l = Math.hypot(0.42, 0.91); return [0.42 / l, 0.91 / l, 0]; })();
const yaw = Math.atan2(AX[1], AX[0]);
const rotors = [];
function turbine(x, y, { base = on(x, y), hub = 82, R: rad = 40, offshore = false } = {}) {
  if (offshore) {
    P("cyl", { at: [x, y, BED - 1], r: 3.6, h: WATER + 4 - BED, seg: 16, colour: PALETTE.safety });
    P("cyl", { at: [x, y, WATER + 3], r: 6.5, h: 1.2, seg: 18, colour: PALETTE.safety });
    base = WATER + 4.2;
  }
  P("cyl", { at: [x, y, base], r: 3.6, r2: 2.1, h: hub - 2, seg: 16, colour: PALETTE.white });
  P("rbox", { at: [x - AX[0] * 2, y - AX[1] * 2, base + hub - 2.4], size: [12, 4.6, 4.6], rot: [0, 0, yaw], r: 1.4, colour: PALETTE.white });
  rotors.push({ at: [x + AX[0] * 5, y + AX[1] * 5, base + hub], axis: AX, R: rad, phase: R() * Math.PI * 2, rpm: 10 + R() * 3 });
  P("sphere", { at: [x - AX[0] * 7, y - AX[1] * 7, base + hub + 2.6], r: 0.9, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
  claim(x, y, 14);
  tall.push([x, y, base + hub + rad]);
}
for (const [x, y] of W.WIND) turbine(x, y);
for (const [x, y] of W.OFFSHORE) turbine(x, y, { hub: 68, R: 34, offshore: true });

// ── The nuclear station ─────────────────────────────────────────────────────
const steam = [];
{
  for (const [x, y] of W.NUCLEAR.towers) {
    const z = on(x, y), rt = 15, st = 46, c = 34, H = 62;
    const profile = Array.from({ length: 13 }, (_, i) => { const t = (H * i) / 12; return [t, rt * Math.sqrt(1 + ((t - st) / c) ** 2)]; });
    P("lathe", { at: [x, y, z], profile, seg: 40, colour: PALETTE.concrete, open: true, wall: 0.9 });
    P("cyl", { at: [x, y, z], r: profile[0][1] + 0.5, h: 2.6, seg: 40, colour: "#9a9d97" });
    steam.push([x, y, z + H]);
    claim(x, y, 30);
    tall.push([x, y, z + H + 30]);
  }
  const [rx, ry] = W.NUCLEAR.reactor, rz = on(rx, ry);
  P("cyl", { at: [rx, ry, rz], r: 13, h: 17, seg: 32, colour: PALETTE.concrete });
  P("sphere", { at: [rx, ry, rz + 17], r: 13, sub: 3, colour: "#eeebe4", hemi: true });
  claim(rx, ry, 17);
  const hall = W.NUCLEAR.hall, hz = on(hall.x, hall.y);
  P("rbox", { at: [hall.x, hall.y, hz], size: [hall.w, hall.d, 17], r: 1.2, colour: PALETTE.towers[0] });
  P("gable", { at: [hall.x, hall.y, hz + 17], size: [hall.w, hall.d, 3], colour: "#d6dee6" });
  prims.push({ kind: "quads", group: "lights:glow", colour: "#ffcf7a", ref: [hall.x, hall.y, hz + 8], quads: [-0.25, 0.25].map((f) => [[hall.x + hall.w * f - 3.5, hall.y + hall.d / 2 + 0.06, hz], [hall.x + hall.w * f + 3.5, hall.y + hall.d / 2 + 0.06, hz], [hall.x + hall.w * f + 3.5, hall.y + hall.d / 2 + 0.06, hz + 8], [hall.x + hall.w * f - 3.5, hall.y + hall.d / 2 + 0.06, hz + 8]]) });
  claim(hall.x, hall.y, 28);
}

// ── Solar, the battery and the gas station along the front ──────────────────
{
  const S = W.SOLAR, tilt = 0.42;
  for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) {
    const x = S.x + c * (S.w + S.gap), y = S.y + r * (S.d + S.gap * 1.6), z = on(x, y);
    P("rbox", { at: [x, y, z + 3.2], size: [S.w, S.d, 0.8], rot: [-tilt, 0, 0], r: 0.35, colour: PALETTE.pv });
    const quads = [], ct = Math.cos(tilt), st = Math.sin(tilt);
    const onPanel = (u, v) => [x + u, y + v * ct, z + 3.2 + 0.85 - v * st];
    for (let u = -S.w / 2 + 3.4; u < S.w / 2 - 1; u += 3.4) quads.push([onPanel(u - 0.15, -S.d / 2 + 0.6), onPanel(u + 0.15, -S.d / 2 + 0.6), onPanel(u + 0.15, S.d / 2 - 0.6), onPanel(u - 0.15, S.d / 2 - 0.6)]);
    for (let v = -S.d / 2 + 3.8; v < S.d / 2 - 1; v += 3.8) quads.push([onPanel(-S.w / 2 + 0.6, v - 0.15), onPanel(S.w / 2 - 0.6, v - 0.15), onPanel(S.w / 2 - 0.6, v + 0.15), onPanel(-S.w / 2 + 0.6, v + 0.15)]);
    prims.push({ kind: "quads", quads, colour: PALETTE.pvLine, group: "static", ref: [x, y, z - 20] });
    for (const lx of [-S.w / 2 + 2, S.w / 2 - 2]) P("cyl", { at: [x + lx, y, z], r: 0.6, h: 3.4, seg: 8, colour: PALETTE.steel });
    claim(x, y, 17);
  }
}
{
  const B = W.BATTERY;
  for (let n = 0; n < B.n; n++) {
    const x = B.x + n * 13, y = B.y, z = on(x, y);
    P("rbox", { at: [x, y, z], size: [10, 18, 9], r: 1.2, colour: PALETTE.white });
    P("rbox", { at: [x, y + 9.05, z + 2], size: [7, 0.2, 2], r: 0.3, colour: PALETTE.towers[3] });
    P("box", { at: [x, y + 9.1, z + 6.4], size: [2.4, 0.1, 0.9], colour: "#3ee07f", group: "lights:led" });
    claim(x, y, 12);
  }
}
const smoke = [];
{
  const { x, y } = W.FACTORY, z = on(x, y);
  P("rbox", { at: [x, y, z], size: [30, 22, 13], r: 1, colour: PALETTE.brick });
  for (let i = 0; i < 3; i++) P("gable", { at: [x - 10 + i * 10, y, z + 13], size: [10, 22, 4.2], colour: "#b65a3f" });
  P("cyl", { at: [x - 11, y - 7, z], r: 3.2, r2: 2.6, h: 42, seg: 18, colour: PALETTE.white });
  for (const b of [28, 36]) P("cyl", { at: [x - 11, y - 7, z + b], r: 2.85, h: 3, seg: 18, colour: PALETTE.red });
  P("cyl", { at: [x - 11, y - 7, z + 42], r: 2.2, h: 0.3, seg: 18, colour: "#ffb35c", group: "lights:glow" });
  smoke.push([x - 11, y - 7, z + 43]);
  claim(x, y, 26);
  tall.push([x - 11, y - 7, z + 68]);
}

// ── The harbour on the inlet: a quay and two boats alongside ───────────────
{
  const { x, y } = W.HARBOUR, z = on(x, y);
  P("rbox", { at: [x + 8, y, WATER - 1], size: [26, 40, z - WATER + 2.2], r: 0.8, colour: PALETTE.concrete });
  P("rbox", { at: [x + 26, y - 8, WATER - 0.8], size: [14, 5.4, 2.6], rot: [0, 0, Math.PI / 2], r: 0.8, colour: PALETTE.white });
  P("rbox", { at: [x + 26, y - 8, WATER + 1.8], size: [4, 3.6, 3], r: 0.6, colour: PALETTE.red });
  P("rbox", { at: [x + 27, y + 10, WATER - 0.8], size: [11, 4.4, 2.4], rot: [0, 0, Math.PI / 2], r: 0.8, colour: PALETTE.white });
  P("cyl", { at: [x + 27, y + 10, WATER + 1.6], r: 3.2, r2: 0.05, h: 13, seg: 3, colour: "#fbfbf9" });
  claim(x + 8, y, 24);
}

// ── Geothermal at the near edge, its bore down the wall ────────────────────
let bore;
{
  const t = W.GEOTHERMAL, [ex, ey] = W.edgeAt(t), [px, py] = W.edgeAt(t, 0.86);
  const z = on(px, py);
  P("rbox", { at: [px, py, z], size: [22, 16, 9], r: 1, colour: PALETTE.towers[1] });
  P("rbox", { at: [px - 4, py - 3, z + 9], size: [10, 8, 4], r: 0.6, colour: PALETTE.steel });
  const [wx, wy] = W.edgeAt(t, 0.97);
  P("rbox", { at: [wx, wy, on(wx, wy)], size: [6, 6, 1.2], r: 0.4, colour: PALETTE.safety });
  P("cyl", { at: [wx, wy, on(wx, wy) + 1.2], r: 1.4, h: 5, seg: 12, colour: PALETTE.steel });
  P("tube", { points: [[wx, wy, on(wx, wy) + 5], [px + 6, py + 6, z + 5]], r: 0.9, colour: "#c6cdd2" });
  const out = [Math.cos(t) * 0.6, Math.sin(t) * 0.6];
  P("tube", { points: [[ex + out[0], ey + out[1], TOP - 2.2], [ex + out[0], ey + out[1], -60]], r: 1.1, colour: "#55606a" });
  bore = [ex + out[0] * 1.4, ey + out[1] * 1.4, -62];
  claim(px, py, 18);
}

// ── Substations, where each line comes down at a city ──────────────────────
for (const [x, y] of Object.values(W.SUBSTATIONS)) {
  const z = on(x, y);
  P("rbox", { at: [x, y, z - 0.6], size: [18, 14, 1.2], r: 0.4, colour: "#cfcabe" });
  for (const dx of [-4, 4]) P("rbox", { at: [x + dx, y, z + 0.6], size: [5, 6, 5], r: 0.6, colour: PALETTE.dark });
  claim(x, y, 12);
}

// ── Pylons: one lattice prototype, the lines from source to city ────────────
const ARMS = [{ z: 26, w: 7.5 }, { z: 32, w: 6.5 }], PEAK = 38;
{
  const half = (z) => (z < 22 ? 4.2 - (z / 22) * 2.8 : 1.4 - ((z - 22) / (PEAK - 22)) * 1.0);
  const c4 = [[1, 1], [1, -1], [-1, -1], [-1, 1]], levels = [0, 7, 14, 22, 28, 34, PEAK], bars = [];
  for (const [u, v] of c4) for (let j = 0; j < levels.length - 1; j++) bars.push([[u * half(levels[j]), v * half(levels[j]), levels[j]], [u * half(levels[j + 1]), v * half(levels[j + 1]), levels[j + 1]]]);
  for (let j = 1; j < levels.length; j++) for (let f = 0; f < 4; f++) {
    const [au, av] = c4[f], [bu, bv] = c4[(f + 1) % 4], zz = levels[j], z0 = levels[j - 1];
    bars.push([[au * half(zz), av * half(zz), zz], [bu * half(zz), bv * half(zz), zz]], [[au * half(z0), av * half(z0), z0], [bu * half(zz), bv * half(zz), zz]]);
  }
  for (const arm of ARMS) for (const side of [-1, 1]) bars.push([[0.8, side * half(arm.z), arm.z], [0, side * arm.w, arm.z]], [[-0.8, side * half(arm.z), arm.z], [0, side * arm.w, arm.z]], [[0, side * arm.w, arm.z], [0, side * arm.w, arm.z - 2.6]]);
  protos.pylon = [{ kind: "bars", bars, r: 0.3, colour: "#8f9aa3" }, { kind: "sphere", at: [0, 0, PEAK + 0.6], r: 0.7, sub: 1, colour: PALETTE.red, group: "lights:beacon" }];
}
const lines = [];
for (const pts of Object.values(W.LINES)) {
  const tips = pts.map(([x, y], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const rot = Math.atan2(b[1] - a[1], b[0] - a[0]), z0 = on(x, y), c = Math.cos(rot), s = Math.sin(rot);
    instances.push({ proto: "pylon", at: [x, y, z0], rot, scale: 1 });
    claim(x, y, 7);
    return ARMS.flatMap((arm) => [-1, 1].map((side) => [x - s * side * arm.w, y + c * side * arm.w, z0 + arm.z - 2.6]));
  });
  const wire0 = [];
  for (let i = 0; i < tips.length - 1; i++) for (let c = 0; c < tips[i].length; c++) {
    const a = tips[i][c], b = tips[i + 1][c], sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.05;
    const wire = Array.from({ length: 9 }, (_, n) => { const t = n / 8; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]; });
    P("tube", { points: wire, r: 0.22, colour: "#5f6a72", seg: 4 });
    if (c === 2) wire0.push(...(i ? wire.slice(1) : wire));
  }
  lines.push(wire0.map((p) => p.map((v) => Math.round(v * 100) / 100)));
}

// ── Trees: on the highlands, along the river, between everything ────────────
for (let n = 0, tries = 0; n < 190 && tries < 8000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.94, [x, y] = W.edgeAt(t, f);
  if (W.seaShare(x, y) > 0 || reservoir(x, y) < 1.25 || river(x, y).d < 5 || onPlinth(x, y, 3) || !free(x, y, 6)) continue;
  tree(x, y); n++;
}

// ── Cars on the roads: the page drives them ─────────────────────────────────
const cars = [];
for (const [name, line] of Object.entries(ROADS)) {
  const n = Math.max(1, Math.round(line.length / 22));
  for (let k = 0; k < n; k++) cars.push({ road: name, at: (k + R() * 0.5) / n, forward: R() < 0.5, speed: 12 + R() * 6, colour: PALETTE.cars[cars.length % PALETTE.cars.length] });
}
protos.car = [
  { kind: "rbox", at: [0, 0, 0.4], size: [5.6, 2.6, 1.6], r: 0.6, colour: "#ffffff", group: "paint:body" },
  { kind: "rbox", at: [-0.4, 0, 1.9], size: [3, 2.3, 1.1], r: 0.45, colour: "#9fd0e6" },
  { kind: "box", at: [2.82, 0.75, 1.0], size: [0.06, 0.6, 0.35], colour: "#fff6cf", group: "lights:head" },
  { kind: "box", at: [2.82, -0.75, 1.0], size: [0.06, 0.6, 0.35], colour: "#fff6cf", group: "lights:head" },
];

export function scene() {
  const r1 = (p) => p.map((v) => Math.round(v * 100) / 100);
  return {
    tile: W.BOUNDS, depth: DEPTH, seaLevel: WATER,
    prims, protos, instances, rotors, cars, steam, smoke, pixels, spray, lines,
    roads: Object.fromEntries(Object.entries(ROADS).map(([n, l]) => [n, l.map(([x, y]) => r1([x, y, roadZ(x, y) + 0.4]))])),
    roadWidth: Object.fromEntries(Object.keys(ROADS).map((n) => [n, W.ROAD_WIDTH])),
    tall, bore,
  };
}
