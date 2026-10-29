// The island as a scene description for Blender, in a playful, game-like
// style after the current homepage hero: a floating island with a soft,
// bayed outline and chunky strata on its walls; a few big toy landmarks with
// bevelled edges; lollipop trees; glowing circuit traces carrying energy to the
// city. All the geometry is decided here from layout.mjs; blender/island.py
// meshes it, bakes its soft shadows and exports. Metres from the island's
// centre: x east, y south (toward the viewer), z up.
import * as W from "./layout.mjs";

const { DEPTH, TOP, WATER, BED } = W;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
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

// ── Palette: the hero's colours, brighter, like a game ──────────────────────
export const PALETTE = {
  grass: ["#69b23c", "#74bd44", "#5fa836", "#7fc44c"], sand: "#efdcaa", seabed: "#e2cf9a", seabedDeep: "#58b3c4",
  pavement: "#e3ddd0", asphalt: "#5c6670", marking: "#f7f5ee",
  layers: { water: "#35a9c8", grass: "#5fa836", topsoil: "#7a5638", subsoil: "#a67c50", sediment: "#dcc792", sandstone: "#d6ad70", mudstone: "#9a8f80", limestone: "#e6dcc4", granite: "#b29f92" },
  towers: { slate: "#5f84a8", cream: "#f0e5cc", terracotta: "#d27a4f", sage: "#8fb08a", glass: "#86c3dc" },
  white: "#f6f6f2", steel: "#a3acb4", concrete: "#e2ded5", dark: "#46505a", red: "#d9503f", safety: "#f0b530",
  pv: "#2d4f80", pvLine: "#9fb9d6", brick: "#c8694a", trace: "#46e0e6", leaf: ["#56ab35", "#63b93c", "#4b9a2e", "#76c64a"],
  trunk: "#8a6444", cloud: "#ffffff", cars: ["#f4f4f2", "#e05544", "#3f7ac0", "#2ea38f", "#f2bf35", "#30373e"],
};

// ── The ground's height and colour ──────────────────────────────────────────
function groundZ(x, y, f = W.reach(x, y)) {
  const q = Math.hypot(x - W.HILL.x, y - W.HILL.y) / W.HILL.r;
  const hill = q < 1 ? W.HILL.h * (1 - q * q) ** 2 : 0;
  const city = Math.max(Math.abs(x - W.CITY.x), Math.abs(y - W.CITY.y)) < 62 ? 1 : 0;
  let z = TOP + hill + (1 - city) * 0.9 * fbm(x / 40, y / 40, 1);
  z -= 2.2 * smooth(0.965, 1, f);                       // the soft lip at the edge
  const sea = W.seaShare(x, y);
  return lerp(z, BED + 0.8 * fbm(x / 25, y / 25, 2), sea);
}
function groundColour(x, y, z) {
  const sea = W.seaShare(x, y);
  if (z < WATER - 0.4) return mix(hex(PALETTE.seabed), hex(PALETTE.seabedDeep), smooth(WATER - 1, BED + 1, z));
  if (sea > 0.02 || z < WATER + 1.4) return hex(PALETTE.sand);
  if (Math.max(Math.abs(x - W.CITY.x), Math.abs(y - W.CITY.y)) < 58) return hex(PALETTE.pavement);
  const i = Math.floor((x + 24 * fbm(x / 80, y / 80, 9)) / 70), j = Math.floor((y + 20 * fbm(x / 80, y / 80, 7)) / 56);
  return mix(hex(PALETTE.grass[Math.floor(hash(i, j, 5) * PALETTE.grass.length)]), hex("#4f9a2f"), 0.18 * (fbm(x / 14, y / 14, 3) + 0.5));
}
export const ground = (x, y) => groundZ(x, y);

// ── The ground as one surface: rings out to the outline, so its edge is exact
const NT = 288, NR = 44;
const ringF = (k) => 0.02 + 0.98 * (1 - Math.pow(1 - k / NR, 1.5));
function surface() {
  const verts = [], vcolours = [], faces = [];
  for (let k = 0; k <= NR; k++) for (let i = 0; i < NT; i++) {
    const t = (i / NT) * Math.PI * 2, f = ringF(k), [x, y] = W.edgeAt(t, f);
    const z = groundZ(x, y, f);
    verts.push([x, y, z].map((v) => Math.round(v * 100) / 100));
    vcolours.push(...groundColour(x, y, z).map((v) => Math.round(v * 255)));
  }
  const at = (k, i) => k * NT + (i % NT);
  for (let k = 0; k < NR; k++) for (let i = 0; i < NT; i++) faces.push([at(k, i), at(k + 1, i), at(k + 1, i + 1), at(k, i + 1)]);
  // the centre: a fan over the first ring
  const c = verts.length;
  verts.push([0, 0, groundZ(0, 0)]);
  vcolours.push(...groundColour(0, 0, groundZ(0, 0)).map((v) => Math.round(v * 255)));
  for (let i = 0; i < NT; i++) faces.push([c, at(0, i), at(0, i + 1)]);
  return { kind: "mesh", group: "ground", verts, vcolours, faces, colour: PALETTE.grass[0] };
}
// the sea's surface over the inlet
function seaSurface() {
  const verts = [], faces = [];
  const idx = new Map();
  const vert = (k, i) => {
    const key = k * NT + (i % NT);
    if (!idx.has(key)) { const [x, y] = W.edgeAt(((i % NT) / NT) * Math.PI * 2, ringF(k)); idx.set(key, verts.length); verts.push([x, y, WATER]); }
    return idx.get(key);
  };
  for (let k = 0; k < NR; k++) for (let i = 0; i < NT; i++) {
    const [x, y] = W.edgeAt(((i + 0.5) / NT) * Math.PI * 2, ringF(k + 0.5));
    if (W.seaShare(x, y) <= 0) continue;
    faces.push([vert(k, i), vert(k + 1, i), vert(k + 1, i + 1), vert(k, i + 1)]);
  }
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
      // wound so the face looks outward
      verts.push([a.x, a.y, a.z[l]], [a.x, a.y, a.z[l + 1]], [b.x, b.y, b.z[l + 1]], [b.x, b.y, b.z[l]]);
      faces.push([n, n + 1, n + 2, n + 3]);
      fcolours.push(PALETTE.layers[name]);
    });
  }
  // the underside, a fan wound to look down
  const c = verts.length;
  verts.push([0, 0, -DEPTH]);
  for (let i = 0; i <= NT; i++) verts.push([cols[i % NT].x, cols[i % NT].y, -DEPTH]);
  for (let i = 0; i < NT; i++) { faces.push([c, c + 2 + i, c + 1 + i]); fcolours.push(PALETTE.layers.granite); }
  return { kind: "mesh", group: "rock", verts, faces, fcolours, colour: PALETTE.layers.granite, smooth: false };
}

// ── Primitives ──────────────────────────────────────────────────────────────
const prims = [surface(), seaSurface(), walls()], protos = {}, instances = [];
const P = (kind, spec) => prims.push({ kind, group: "static", ...spec });
const on = (x, y) => groundZ(x, y);
const R = W.seeded(77);
const taken = [];
const free = (x, y, r) => taken.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r);
const claim = (x, y, r) => taken.push({ x, y, r });

// a ribbon laid on the ground, `width` wide, `lift` above it
function ribbon(line, width, lift, colour, group = "static", dash = 0) {
  const quads = [];
  const side = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [[p[0] - (dy / l) * width / 2, p[1] + (dx / l) * width / 2], [p[0] + (dy / l) * width / 2, p[1] - (dx / l) * width / 2]];
  });
  for (let i = 0; i < line.length - 1; i++) {
    if (dash && i % 2) continue;
    quads.push([side[i][0], side[i][1], side[i + 1][1], side[i + 1][0]].map(([x, y]) => [x, y, on(x, y) + lift]));
  }
  prims.push({ kind: "quads", quads, colour, group });
}
const resample = (pts, step) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 0; s < n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};
const smoothLoop = (pts, step = 4) => {
  const ring = pts.slice(0, -1), n0 = ring.length, out = [];
  for (let i = 0; i < n0; i++) {
    const p0 = ring[(i - 1 + n0) % n0], p1 = ring[i], p2 = ring[(i + 1) % n0], p3 = ring[(i + 2) % n0];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(out[0]);
  return out;
};

// ── The road loop ────────────────────────────────────────────────────────────
const ROAD = smoothLoop(W.ROAD, 4);
ribbon(ROAD, 9, 0.35, PALETTE.asphalt);
ribbon(ROAD, 0.6, 0.45, PALETTE.marking, "static", 1);
for (const [x, y] of ROAD) claim(x, y, 6);

// ── Circuit traces: glowing runs from each source to the city ──────────────
const TRACES = W.TRACES.map((t) => resample(t, 3));
for (const t of TRACES) {
  ribbon(t, 2.8, 0.5, PALETTE.trace, "lights:trace");
  for (const [x, y] of [t[0], t[t.length - 1]]) P("rbox", { at: [x, y, on(x, y) + 0.2], size: [5, 5, 0.8], r: 0.4, colour: PALETTE.dark });
  for (const [x, y] of t) claim(x, y, 3);
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
protos.cloud = [
  { kind: "sphere", at: [0, 0, 0], r: 14, sub: 2, colour: PALETTE.cloud },
  { kind: "sphere", at: [15, 4, -3], r: 10, sub: 2, colour: PALETTE.cloud },
  { kind: "sphere", at: [-15, -2, -3], r: 10, sub: 2, colour: PALETTE.cloud },
  { kind: "sphere", at: [5, -10, 3], r: 9, sub: 2, colour: PALETTE.cloud },
];
function tree(x, y, s = 0.8 + R() * 0.45) {
  claim(x, y, 6 * s);
  instances.push({ proto: R() < 0.2 ? "tree_tall" : "tree_round", at: [x, y, on(x, y)], rot: R() * 6.28, scale: s });
}

// ── The city: chunky towers on a plinth, windows in a grid ──────────────────
const tall = [];
{
  const { x: cx, y: cy } = W.CITY;
  P("rbox", { at: [cx, cy, TOP - 1], size: [116, 116, 2.6], r: 1.2, colour: PALETTE.pavement });
  claim(cx, cy, 82);
  for (const [dx, dy, w, d, h, tone] of W.CITY.towers) {
    const x = cx + dx, y = cy + dy, z = TOP + 1.6, colour = PALETTE.towers[tone];
    P("rbox", { at: [x, y, z], size: [w, d, h], r: 1.4, colour });
    P("rbox", { at: [x, y, z + h], size: [w * 0.5, d * 0.45, 3.2], r: 0.6, colour: PALETTE.steel });
    if (h > 100) { P("cyl", { at: [x, y, z + h + 3.2], r: 0.8, r2: 0.25, h: 20, seg: 6, colour: PALETTE.steel }); P("sphere", { at: [x, y, z + h + 23.5], r: 1.1, sub: 1, colour: PALETTE.red, group: "lights:beacon" }); }
    tall.push([x, y, z + h + 24]);
    // windows on the two faces the camera sees: a grid, darker than the wall
    const quads = [];
    for (let zz = z + 5; zz + 4 < z + h - 2; zz += 6) {
      for (let u = -w / 2 + 3.2; u + 2.4 < w / 2 - 2; u += 4.8) quads.push([[x + u, y + d / 2 + 0.06, zz], [x + u + 2.6, y + d / 2 + 0.06, zz], [x + u + 2.6, y + d / 2 + 0.06, zz + 3.4], [x + u, y + d / 2 + 0.06, zz + 3.4]]);
      for (let u = -d / 2 + 3.2; u + 2.4 < d / 2 - 2; u += 4.8) quads.push([[x + w / 2 + 0.06, y + u + 2.6, zz], [x + w / 2 + 0.06, y + u, zz], [x + w / 2 + 0.06, y + u, zz + 3.4], [x + w / 2 + 0.06, y + u + 2.6, zz + 3.4]]);
    }
    const win = mix(hex(colour), [0.12, 0.17, 0.24], 0.55).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    prims.push({ kind: "quads", quads, colour: `#${win}`, group: "lights:window", ref: [x, y, z + h / 2] });
  }
}
// the data centre, its roof fans, and the pixels it sends up
const pixels = [];
{
  const { x, y, w, d, h } = W.DATA_CENTRE, z = on(x, y);
  P("rbox", { at: [x, y, z], size: [w, d, h], r: 1, colour: PALETTE.white });
  P("box", { at: [x, y + d / 2 + 0.05, z + h * 0.45], size: [w - 4, 0.1, 2.2], colour: PALETTE.trace, group: "lights:trace" });
  for (let i = 0; i < 4; i++) P("cyl", { at: [x - w / 2 + 7 + i * 10.5, y, z + h], r: 3.4, h: 1.2, seg: 16, colour: PALETTE.dark });
  claim(x, y, 32);
  pixels.push([x, y, z + h + 2]);
}

// ── Wind on the hill ────────────────────────────────────────────────────────
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

// ── The nuclear station: two cooling towers, the reactor, the turbine hall ──
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
  P("cyl", { at: [rx, ry, rz], r: 14, h: 18, seg: 32, colour: PALETTE.concrete });
  P("sphere", { at: [rx, ry, rz + 18], r: 14, sub: 3, colour: "#eeebe4", hemi: true });
  claim(rx, ry, 18);
  const hall = W.NUCLEAR.hall, hz = on(hall.x, hall.y);
  P("rbox", { at: [hall.x, hall.y, hz], size: [hall.w, hall.d, 18], r: 1.2, colour: PALETTE.towers.slate });
  P("gable", { at: [hall.x, hall.y, hz + 18], size: [hall.w, hall.d, 3], colour: "#d6dee6" });
  prims.push({ kind: "quads", group: "lights:glow", colour: "#ffcf7a", ref: [hall.x, hall.y, hz + 8], quads: [-0.25, 0.25].map((f) => [[hall.x + hall.w * f - 3.5, hall.y + hall.d / 2 + 0.06, hz], [hall.x + hall.w * f + 3.5, hall.y + hall.d / 2 + 0.06, hz], [hall.x + hall.w * f + 3.5, hall.y + hall.d / 2 + 0.06, hz + 8], [hall.x + hall.w * f - 3.5, hall.y + hall.d / 2 + 0.06, hz + 8]]) });
  claim(hall.x, hall.y, 30);
}

// ── Solar: big tilted panels on legs, cells drawn on them ───────────────────
{
  const S = W.SOLAR, tilt = 0.42;
  for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) {
    const x = S.x + c * (S.w + S.gap), y = S.y + r * (S.d + S.gap * 1.6), z = on(x, y);
    P("rbox", { at: [x, y, z + 3.4], size: [S.w, S.d, 0.8], rot: [-tilt, 0, 0], r: 0.35, colour: PALETTE.pv });
    // the cell grid, laid on the panel's face
    const quads = [], ct = Math.cos(tilt), st = Math.sin(tilt);
    const onPanel = (u, v) => [x + u, y + v * ct, z + 3.4 + 0.85 - v * st];
    for (let u = -S.w / 2 + 3.6; u < S.w / 2 - 1; u += 3.6) quads.push([onPanel(u - 0.15, -S.d / 2 + 0.6), onPanel(u + 0.15, -S.d / 2 + 0.6), onPanel(u + 0.15, S.d / 2 - 0.6), onPanel(u - 0.15, S.d / 2 - 0.6)]);
    for (let v = -S.d / 2 + 4; v < S.d / 2 - 1; v += 4) quads.push([onPanel(-S.w / 2 + 0.6, v - 0.15), onPanel(S.w / 2 - 0.6, v - 0.15), onPanel(S.w / 2 - 0.6, v + 0.15), onPanel(-S.w / 2 + 0.6, v + 0.15)]);
    prims.push({ kind: "quads", quads, colour: PALETTE.pvLine, group: "static", ref: [x, y, z - 20] });
    for (const [lx, ly] of [[-S.w / 2 + 2, 0], [S.w / 2 - 2, 0]]) P("cyl", { at: [x + lx, y + ly, z], r: 0.6, h: 3.6, seg: 8, colour: PALETTE.steel });
    claim(x, y, 18);
  }
}

// ── The battery: chunky blocks with charge lamps ────────────────────────────
{
  const B = W.BATTERY;
  for (let n = 0; n < B.n; n++) {
    const x = B.x + n * 13, y = B.y, z = on(x, y);
    P("rbox", { at: [x, y, z], size: [10, 18, 9], r: 1.2, colour: PALETTE.white });
    P("rbox", { at: [x, y + 9.05, z + 2], size: [7, 0.2, 2], r: 0.3, colour: PALETTE.towers.sage });
    P("box", { at: [x, y + 9.1, z + 6.4], size: [2.4, 0.1, 0.9], colour: "#3ee07f", group: "lights:led" });
    claim(x, y, 12);
  }
}

// ── The gas station: a brick hall with a striped chimney, smoke from the top ─
const smoke = [];
{
  const { x, y } = W.FACTORY, z = on(x, y);
  P("rbox", { at: [x, y, z], size: [34, 24, 14], r: 1, colour: PALETTE.brick });
  for (let i = 0; i < 3; i++) P("gable", { at: [x - 11 + i * 11, y, z + 14], size: [11, 24, 4.5], colour: "#b65a3f" });
  P("rbox", { at: [x + 24, y - 4, z], size: [12, 14, 9], r: 0.8, colour: PALETTE.towers.slate });
  P("cyl", { at: [x - 12, y - 8, z], r: 3.2, r2: 2.6, h: 44, seg: 18, colour: PALETTE.white });
  for (const b of [30, 38]) P("cyl", { at: [x - 12, y - 8, z + b], r: 2.85, h: 3, seg: 18, colour: PALETTE.red });
  P("cyl", { at: [x - 12, y - 8, z + 44], r: 2.2, h: 0.3, seg: 18, colour: "#ffb35c", group: "lights:glow" });
  const quads = [];
  for (let u = -14; u < 14; u += 5) quads.push([[x + u, y + 12.06, z + 5], [x + u + 3, y + 12.06, z + 5], [x + u + 3, y + 12.06, z + 9], [x + u, y + 12.06, z + 9]]);
  prims.push({ kind: "quads", quads, colour: "#5a3b30", group: "lights:window", ref: [x, y, z + 7] });
  smoke.push([x - 12, y - 8, z + 45]);
  claim(x, y, 30);
  tall.push([x - 12, y - 8, z + 70]);
}

// ── The pond ────────────────────────────────────────────────────────────────
P("cyl", { at: [W.POND.x, W.POND.y, on(W.POND.x, W.POND.y) - 0.2], r: W.POND.r, h: 0.5, seg: 32, colour: "#4cc0d6" });
claim(W.POND.x, W.POND.y, W.POND.r + 4);

// ── Geothermal at the near edge, its bore down the wall ────────────────────
let bore;
{
  const t = W.GEOTHERMAL, [ex, ey] = W.edgeAt(t), [px, py] = W.edgeAt(t, 0.86);
  const z = on(px, py);
  P("rbox", { at: [px, py, z], size: [22, 16, 9], r: 1, colour: PALETTE.towers.cream });
  P("rbox", { at: [px - 4, py - 3, z + 9], size: [10, 8, 4], r: 0.6, colour: PALETTE.steel });
  const [wx, wy] = W.edgeAt(t, 0.97);
  P("rbox", { at: [wx, wy, on(wx, wy)], size: [6, 6, 1.2], r: 0.4, colour: PALETTE.safety });
  P("cyl", { at: [wx, wy, on(wx, wy) + 1.2], r: 1.4, h: 5, seg: 12, colour: PALETTE.steel });
  P("tube", { points: [[wx, wy, on(wx, wy) + 5], [px + 6, py + 6, z + 5]], r: 0.9, colour: "#c6cdd2" });
  // the bore on the wall: a pipe from the lip down into the granite
  const out = [Math.cos(t) * 0.6, Math.sin(t) * 0.6];
  P("tube", { points: [[ex + out[0], ey + out[1], TOP - 2.2], [ex + out[0], ey + out[1], -60]], r: 1.1, colour: "#55606a" });
  bore = [ex + out[0] * 1.4, ey + out[1] * 1.4, -62];
  claim(px, py, 18);
}

// ── Pylons from the power station to the city ───────────────────────────────
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
{
  const tips = W.PYLONS.map(([x, y], i) => {
    const a = W.PYLONS[Math.max(0, i - 1)], b = W.PYLONS[Math.min(W.PYLONS.length - 1, i + 1)];
    const rot = Math.atan2(b[1] - a[1], b[0] - a[0]), z0 = on(x, y), c = Math.cos(rot), s = Math.sin(rot);
    instances.push({ proto: "pylon", at: [x, y, z0], rot, scale: 1 });
    claim(x, y, 8);
    return ARMS.flatMap((arm) => [-1, 1].map((side) => [x - s * side * arm.w, y + c * side * arm.w, z0 + arm.z - 2.6]));
  });
  for (let i = 0; i < tips.length - 1; i++) for (let c = 0; c < tips[i].length; c++) {
    const a = tips[i][c], b = tips[i + 1][c], sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.05;
    P("tube", { points: Array.from({ length: 9 }, (_, n) => { const t = n / 8; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]; }), r: 0.22, colour: "#5f6a72", seg: 4 });
  }
}

// ── Boats in the inlet ──────────────────────────────────────────────────────
{
  const boat = (x, y, ang, len, sail) => {
    P("rbox", { at: [x, y, WATER - 0.8], size: [len, len * 0.38, 2.4], rot: [0, 0, ang], r: 0.8, colour: PALETTE.white });
    if (sail) P("cyl", { at: [x, y, WATER + 1.6], r: 3.4, r2: 0.05, h: 14, seg: 3, rot: [0, 0, ang], colour: "#fbfbf9" });
    else P("rbox", { at: [x - Math.cos(ang) * 2.5, y - Math.sin(ang) * 2.5, WATER + 1.6], size: [5, 4, 3], rot: [0, 0, ang], r: 0.6, colour: PALETTE.red });
  };
  boat(200, 0, 0.9, 12, true);
  boat(240, 140, -0.4, 14, false);
}

// ── Trees: on the hill, round the pond, along the edges, between landmarks ──
for (let n = 0, tries = 0; n < 150 && tries < 5000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.93, [x, y] = W.edgeAt(t, f);
  if (W.seaShare(x, y) > 0 || on(x, y) < WATER + 2 || !free(x, y, 6)) continue;
  tree(x, y); n++;
}

// ── Clouds drifting over the island, clear of the tallest tower ─────────────
const clouds = [[-150, -150, 175], [160, 40, 160], [-60, 170, 150], [260, -200, 185]].map(([x, y, z]) => ({ at: [x, y, z], scale: 0.9 + R() * 0.5, rot: R() * 6.28 }));

// ── Cars on the loop: the page drives them ──────────────────────────────────
const cars = Array.from({ length: 9 }, (_, n) => ({ road: "loop", at: n / 9 + R() * 0.05, forward: n % 2 === 0, speed: 14 + R() * 6, colour: PALETTE.cars[n % PALETTE.cars.length] }));
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
    prims, protos, instances, rotors, cars, steam, smoke, pixels, clouds,
    roads: { loop: ROAD.map(([x, y]) => r1([x, y, on(x, y) + 0.4])) }, roadWidth: { loop: 9 },
    traces: TRACES.map((t) => t.map(([x, y]) => r1([x, y, on(x, y) + 0.9]))),
    tall, bore,
  };
}
