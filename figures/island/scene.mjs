// The island as a scene description for Blender, in the manner of Bruno
// Simon's folio: a rounded square of grass with wide sandy paths winding
// between the places, wooden fences and lanterns along them, birch, oak and
// maple trees in summer greens, bushes and flowers, ponds and a bay with foam at the shore,
// and simple flat-coloured buildings in his palette. Highlands with a
// reservoir and a hydro dam; a river to the bay; two cities; every power
// station wired to them by pylons. The slab's cut faces keep their strata. All
// the geometry is decided here from layout.mjs; blender/island.py meshes it,
// bakes its soft shadows and exports. Metres from the island's centre: x east,
// y south (toward the viewer), z up.
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
const gapTo = (line, x, y) => {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
};

// ── Palette: Bruno Simon's own, from his folio's palette texture ────────────
export const PALETTE = {
  grass: "#91ad78", grassLight: "#a4bb86", grassDark: "#7e9a66", lime: "#abae2b", sand: "#ead0a3", dirt: "#a49876",
  wood: "#988165", woodDark: "#574e37", stone: "#c8c2c1", slate: "#575a5e", coal: "#4a413c", mauve: "#7c7691",
  water: "#3dbbe7", cream: "#fff2e8", blush: "#fde6e1", peach: "#eec3af", apricot: "#e49a78", tan: "#b36d45",
  orange: "#f8a658", ember: "#e46202", red: "#ec3f1c", pink: "#ed71a0", violet: "#c365ef", yellow: "#e4a90c", crimson: "#c30e3a",
  layers: { water: "#3dbbe7", grass: "#7e9a66", topsoil: "#574e37", subsoil: "#988165", sediment: "#ead0a3", sandstone: "#e4b98a", mudstone: "#a49876", limestone: "#c8c2c1", granite: "#7c7691" },
  buildings: ["#fff2e8", "#eec3af", "#e49a78", "#91ad78", "#c8c2c1", "#ead0a3", "#fde6e1", "#f8a658"],
  roofs: ["#574e37", "#b36d45", "#575a5e", "#ec3f1c"],
  cars: ["#ec3f1c", "#fff2e8", "#3dbbe7", "#e4a90c", "#c365ef", "#575a5e"],
};

// ── Water bodies and the ground ─────────────────────────────────────────────
const RIVER = catmull(W.RIVER_POINTS, 3);
const RIVER_LEN = (() => { let s = 0; for (let i = 1; i < RIVER.length; i++) s += Math.hypot(RIVER[i][0] - RIVER[i - 1][0], RIVER[i][1] - RIVER[i - 1][1]); return s; })();
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
const reservoir = (x, y) => { const R0 = W.RESERVOIR, a = Math.atan2((y - R0.y) / R0.ry, (x - R0.x) / R0.rx); return (((x - R0.x) / R0.rx) ** 2 + ((y - R0.y) / R0.ry) ** 2) / W.lobed(a, R0.k) ** 2; };
const pondGap = (x, y) => Math.min(...W.PONDS.map((p) => Math.hypot(x - p.x, y - p.y) - p.r * W.lobed(Math.atan2(y - p.y, x - p.x), p.k)));
const inRect = (cx, cy, w, d, x, y, gap = 0) => Math.abs(x - cx) < w / 2 + gap && Math.abs(y - cy) < d / 2 + gap;
const floorOf = (C) => [C.cols * C.pitch + 14, C.rows * C.pitch + 14];
const onFloor = (x, y, gap = 0) => [W.CITY_A, W.CITY_B].some((C) => inRect(C.x, C.y, ...floorOf(C), x, y, gap));
const PATHS = Object.fromEntries(Object.entries(W.PATHS).map(([n, p]) => [n, catmull(p, 3)]));
const pathGap = (x, y) => Math.min(...Object.values(PATHS).map((line) => gapTo(line, x, y)));

function groundZ(x, y, f = W.reach(x, y)) {
  const H = W.HIGHLAND, q = Math.hypot(x - H.x, y - H.y) / H.r;
  const highland = q < 1 ? H.h * (1 - q * q) ** 2 : 0;
  // mountains: steep cones softened at the top, their sides broken by noise
  let mountain = 0;
  for (const m of W.MOUNTAINS) {
    const d = Math.hypot(x - m.x, y - m.y) / m.r;
    if (d >= 1) continue;
    const ridge = 1 + 0.35 * fbm(x / 22, y / 22, 12) * (1 - d);
    mountain += m.h * Math.pow(1 - d, 1.45) * ridge;
  }
  const flat = onFloor(x, y, 10) ? 0 : 1;
  let z = TOP + (highland + mountain) * flat + flat * 1.1 * fbm(x / 46, y / 46, 1);
  const e = reservoir(x, y);
  if (e < 1.5) z = lerp(z, W.RESERVOIR.level - 7 * Math.max(0, 1 - e), smooth(1.5, 1.0, e));
  const pg = pondGap(x, y);
  if (pg < 8) z = lerp(TOP - 2.4, Math.max(z, TOP - 0.2), smooth(-2, 8, pg));
  const r = river(x, y);
  if (r.d < 14) z = r.d < 0 ? r.level - 3 + 1.2 * smooth(-6, 0, r.d) : lerp(r.level + 0.6, z, smooth(0, 14, r.d));
  z -= 2.2 * smooth(0.965, 1, f);
  return lerp(z, WATER - W.basinDepth(x, y) + 0.8 * fbm(x / 25, y / 25, 2), W.seaShare(x, y));
}
function groundColour(x, y, z, slope) {
  if (W.seaShare(x, y) > 0.02 && z < WATER + 0.3) return mix(hex(PALETTE.sand), hex("#246f93"), smooth(WATER - 1.5, WATER - 22, z));
  if (reservoir(x, y) < 1.02 || pondGap(x, y) < 0) return hex("#8fb7b0");
  const r = river(x, y);
  if (r.d < 0.5) return hex(PALETTE.dirt);
  if (r.d < 3.5 || W.seaShare(x, y) > 0.02 || pondGap(x, y) < 3) return hex(PALETTE.sand);
  const rockiness = Math.max(smooth(0.55, 0.9, slope), smooth(TOP + W.ROCK_LINE - 8, TOP + W.ROCK_LINE + 6, z + 5 * fbm(x / 18, y / 18, 13)));
  if (rockiness > 0.5) return mix(mix(hex(PALETTE.stone), hex(PALETTE.mauve), 0.35 + 0.4 * fbm(x / 9, y / 9, 6)), hex("#e8e3dc"), smooth(TOP + 60, TOP + 85, z));
  if (onFloor(x, y, 2) || pathGap(x, y) < W.PATH_WIDTH / 2 + 1.5) return hex(PALETTE.sand);
  const g = mix(hex(PALETTE.grass), hex(PALETTE.grassLight), 0.5 + 0.5 * fbm(x / 30, y / 30, 3));
  return mix(g, hex(PALETTE.grassDark), smooth(TOP + 10, TOP + 30, z) * 0.6);
}
export const ground = (x, y) => groundZ(x, y);

// ── The ground as one surface: rings out to the outline, so its edge is exact
const NT = 400, NR = 64;
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
  return { kind: "mesh", group: "ground", verts, vcolours, faces, colour: PALETTE.grass };
}
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
  let s = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const side = (p, t) => {
      const w = W.riverWidth(t) / 2 + 1.6, dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
      return [[p[0] + (dy / n) * w, p[1] - (dx / n) * w, W.riverLevel(t)], [p[0] - (dy / n) * w, p[1] + (dx / n) * w, W.riverLevel(t)]];
    };
    const [a0, a1] = side(a, s / RIVER_LEN), [b0, b1] = side(b, (s + l) / RIVER_LEN);
    const n = verts.length;
    verts.push(a0, a1, b1, b0);
    faces.push([n, n + 3, n + 2, n + 1]);
    s += l;
  }
  const disc = (cx, cy, rx, ry, level, k) => {
    const c = verts.length;
    verts.push([cx, cy, level]);
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, l = W.lobed(a, k); verts.push([cx + Math.cos(a) * rx * l, cy + Math.sin(a) * ry * l, level]); }
    for (let i = 0; i < 64; i++) faces.push([c, c + 1 + i, c + 2 + i]);
  };
  disc(W.RESERVOIR.x, W.RESERVOIR.y, W.RESERVOIR.rx * 1.06, W.RESERVOIR.ry * 1.06, W.RESERVOIR.level, W.RESERVOIR.k);
  for (const p of W.PONDS) disc(p.x, p.y, p.r * 1.06, p.r * 1.06, TOP - 0.9, p.k);
  return { kind: "mesh", group: "water", verts, faces, colour: PALETTE.water, smooth: false };
}
// foam: pale rings a little way out from every shore
function foam() {
  const quads = [];
  const ring = (pts, offsets) => {
    for (const [off, w] of offsets) for (let i = 0; i < pts.length; i++) {
      const [x, y, z, nx, ny] = pts[i], [x2, y2, z2, nx2, ny2] = pts[(i + 1) % pts.length];
      quads.push([[x + nx * off, y + ny * off, z], [x2 + nx2 * off, y2 + ny2 * off, z2], [x2 + nx2 * (off + w), y2 + ny2 * (off + w), z2], [x + nx * (off + w), y + ny * (off + w), z]]);
    }
  };
  // the bay's shore: where the sea begins along each bearing, the normal pointing seaward
  const shore = [];
  for (let i = 0; i <= 140; i++) {
    const t = -0.36 + (1.1 * i) / 140;
    let lo = 0.4, hi = 0.98;
    for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2, [x, y] = W.edgeAt(t, m); if (W.seaShare(x, y) > 0.5) hi = m; else lo = m; }
    const [x, y] = W.edgeAt(t, hi), [x2, y2] = W.edgeAt(t + 0.01, hi);
    const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
    shore.push([x, y, WATER + 0.06, dy / l, -dx / l]);
  }
  for (const [off, w] of [[2.2, 0.9], [6.5, 0.6]]) for (let i = 0; i < shore.length - 1; i++) {
    if (i % 7 === 6) continue;   // broken, like ripples
    const [x, y, z, nx, ny] = shore[i], [x2, y2, z2, nx2, ny2] = shore[i + 1];
    quads.push([[x + nx * off, y + ny * off, z], [x2 + nx2 * off, y2 + ny2 * off, z2], [x2 + nx2 * (off + w), y2 + ny2 * (off + w), z2], [x + nx * (off + w), y + ny * (off + w), z]]);
  }
  const circle = (cx, cy, rx, ry, level, k, n = 72) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, l = W.lobed(a, k), a2 = a + 0.01, l2 = W.lobed(a2, k);
    const x = cx + Math.cos(a) * rx * l, y = cy + Math.sin(a) * ry * l, x2 = cx + Math.cos(a2) * rx * l2, y2 = cy + Math.sin(a2) * ry * l2;
    const dx = x2 - x, dy = y2 - y, m = Math.hypot(dx, dy) || 1;
    return [x, y, level + 0.06, dy / m, -dx / m];   // the normal points inward, into the water
  });
  ring(circle(W.RESERVOIR.x, W.RESERVOIR.y, W.RESERVOIR.rx, W.RESERVOIR.ry, W.RESERVOIR.level, W.RESERVOIR.k), [[1.6, 0.7], [4.6, 0.5]]);
  for (const p of W.PONDS) ring(circle(p.x, p.y, p.r, p.r, TOP - 0.9, p.k, 48), [[1.4, 0.6], [3.6, 0.45]]);
  return { kind: "quads", group: "foam", colour: "#ffffff", quads };
}

// ── The walls: strata round the whole outline ───────────────────────────────
const LAYERS = ["water", "grass", "topsoil", "subsoil", "sediment", "sandstone", "mudstone", "limestone", "granite"];
function column(t) {
  const [x, y] = W.edgeAt(t), sea = W.seaShare(x * 0.999, y * 0.999), top = groundZ(x, y, 1);
  const wet = sea > 0.5, land = wet ? 0 : 1;
  const s = t * 300, n = (len, ph) => fbm(s / len, ph, 17);
  const th = [wet ? WATER - top : 0, (2.6 + 1.2 * n(40, 1)) * land, (4 + 2.5 * n(60, 2)) * land, (7 + 4 * n(90, 3)) * land, wet ? 3 + 1.5 * n(50, 4) : 0];
  const z = [wet ? WATER : top];
  for (const h of th) z.push(z[z.length - 1] - Math.max(0.3, h));
  // the rock's beds heave and dip, and lift where a mountain stands above
  const lift = wet ? -(WATER - top) * 0.55 : Math.max(0, top - TOP - 6) * 0.35;
  const wave = (base, amp, len, ph) => base + lift + amp * Math.sin(s / len + ph) + amp * 0.6 * Math.sin(s / (len * 0.37) + ph * 2.1) + amp * 0.8 * fbm(s / 45, ph, 19);
  z.push(Math.min(z[z.length - 1] - 3, wave(-20, 4, 60, 0.4)));
  z.push(Math.min(z[z.length - 1] - 2, wave(-36, 5, 80, 1.9)));
  z.push(Math.min(z[z.length - 1] - 2, wave(-50, 4, 50, 3.1)));
  z.push(-DEPTH);
  return { x, y, z };
}
function walls() {
  const verts = [], faces = [], vcolours = [];
  const cols = Array.from({ length: NT + 1 }, (_, i) => column((i / NT) * Math.PI * 2));
  const deep = hex("#1b6f94"), shallow = hex(PALETTE.water);
  const push = (p, c) => { verts.push(p); vcolours.push(...c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255))); };
  for (let i = 0; i < NT; i++) {
    const a = cols[i], b = cols[i + 1];
    LAYERS.forEach((name, l) => {
      if (a.z[l] - a.z[l + 1] < 0.02 && b.z[l] - b.z[l + 1] < 0.02) return;
      const n = verts.length;
      if (name === "water") {
        // the cut through the bay: surface blue at the top, darkening to the bed
        const cz = (zz) => mix(shallow, deep, smooth(WATER - 1, WATER - 24, zz));
        push([a.x, a.y, a.z[l]], cz(a.z[l])); push([a.x, a.y, a.z[l + 1]], cz(a.z[l + 1]));
        push([b.x, b.y, b.z[l + 1]], cz(b.z[l + 1])); push([b.x, b.y, b.z[l]], cz(b.z[l]));
      } else {
        const c = hex(PALETTE.layers[name]).map((v) => v * (1 + 0.08 * fbm(i / 6, l * 3, 23)));
        push([a.x, a.y, a.z[l]], c); push([a.x, a.y, a.z[l + 1]], c); push([b.x, b.y, b.z[l + 1]], c); push([b.x, b.y, b.z[l]], c);
      }
      faces.push([n, n + 1, n + 2, n + 3]);
    });
  }
  const c = verts.length, granite = hex(PALETTE.layers.granite);
  push([0, 0, -DEPTH], granite);
  for (let i = 0; i <= NT; i++) push([cols[i % NT].x, cols[i % NT].y, -DEPTH], granite);
  for (let i = 0; i < NT; i++) faces.push([c, c + 2 + i, c + 1 + i]);
  return { kind: "mesh", group: "rock", verts, vcolours, faces, colour: PALETTE.layers.granite, smooth: false };
}

// ── Primitives ──────────────────────────────────────────────────────────────
const prims = [surface(), waters(), foam(), walls()], protos = {}, instances = [];
const P = (kind, spec) => prims.push({ kind, group: "static", ...spec });
const on = (x, y) => groundZ(x, y);
const R = W.seeded(1337);
const pick = (list) => list[Math.floor(R() * list.length)];
const taken = [];
const free = (x, y, r) => taken.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r);
const claim = (x, y, r, soft = false) => taken.push({ x, y, r, soft });
const tall = [];
// everything on the land is drawn well over life size, for a chunky, toy-like
// look: each prototype grows by its own factor when placed
const GROW = { pylon: 1.4, rock: 1.4, fence: 1.6, crate: 1.6, lantern: 1.8, bench: 1.8 };
const grow = (proto) => GROW[proto] ?? 2;
const place = (proto, x, y, rot = 0, scale = 1, z = on(x, y)) => instances.push({ proto, at: [x, y, z], rot, scale: scale * grow(proto) });
const CAR = 2.6;   // the page draws the cars at this size

// ── Paths: sand, raised a touch, with a bridge over the river ───────────────
const pathZ = (x, y) => { const r = river(x, y); return r.d < 6 ? Math.max(on(x, y), r.level + 4.2) : on(x, y); };
function ribbon(line, width, lift, colour, group = "static", zOf = on) {
  const quads = [];
  const side = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [[p[0] - (dy / l) * width / 2, p[1] + (dx / l) * width / 2], [p[0] + (dy / l) * width / 2, p[1] - (dx / l) * width / 2]];
  });
  for (let i = 0; i < line.length - 1; i++) {
    const zi = zOf(...line[i]) + lift, zj = zOf(...line[i + 1]) + lift;
    quads.push([[...side[i][0], zi], [...side[i][1], zi], [...side[i + 1][1], zj], [...side[i + 1][0], zj]]);
  }
  prims.push({ kind: "quads", quads, colour, group });
}
// wooden things along a path: fence modules on one side, lanterns on both, alternating
function dress(line, { fence = true, lanterns = true, every = 70 } = {}) {
  let s = 0, nextLantern = every / 2, nextFence = 0, side = 1;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, rot = Math.atan2(dy, dx);
    const nx = -dy / l, ny = dx / l, off = W.PATH_WIDTH / 2 + 2.6;
    while (nextFence <= s + l) {
      const t = (nextFence - s) / l, x = a[0] + dx * t + nx * off, y = a[1] + dy * t + ny * off;
      if (fence && river(x, y).d > 6 && !onFloor(x, y, 2) && W.reach(x, y) < 0.95) place("fence", x, y, rot, 1);
      nextFence += 4 * grow("fence");
    }
    while (nextLantern <= s + l) {
      const t = (nextLantern - s) / l, x = a[0] + dx * t - nx * off * side * 1.15, y = a[1] + dy * t - ny * off * side * 1.15;
      if (lanterns && river(x, y).d > 6) { place("lantern", x, y, rot, 1); claim(x, y, 3.5); }
      nextLantern += every; side = -side;
    }
    s += l;
  }
}
for (const [name, line] of Object.entries(PATHS)) {
  ribbon(line, W.PATH_WIDTH + 2.4, 0.1, PALETTE.dirt, "static", pathZ);   // a darker trodden edge
  ribbon(line, W.PATH_WIDTH, 0.24, PALETTE.sand, "static", pathZ);
  for (const [x, y] of line) claim(x, y, W.PATH_WIDTH / 2 + 2);
  dress(line, { fence: name === "main" || name === "west" || name === "works" });
  const over = line.filter(([x, y]) => river(x, y).d < 6);
  if (over.length > 1) {
    // a wooden bridge: planks, two beams, posts and a rail each side
    const a = over[0], b = over[over.length - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 8, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, z = pathZ(cx, cy);
    P("rbox", { at: [cx, cy, z - 1.2], size: [len, W.PATH_WIDTH + 1, 1.3], rot: [0, 0, ang], r: 0.3, colour: PALETTE.wood });
    for (let u = -len / 2 + 1, n = 0; u < len / 2; u += 3.6, n++) P("box", { at: [cx + Math.cos(ang) * u, cy + Math.sin(ang) * u, z + 0.1], size: [2.6, W.PATH_WIDTH + 1.2, 0.4], rot: [0, 0, ang], colour: n % 2 ? PALETTE.wood : "#a58d6f" });
    for (const sgn of [-1, 1]) {
      const ox = -Math.sin(ang) * sgn * (W.PATH_WIDTH / 2 + 0.8), oy = Math.cos(ang) * sgn * (W.PATH_WIDTH / 2 + 0.8);
      P("box", { at: [cx + ox, cy + oy, z + 2.6], size: [len, 0.7, 0.7], rot: [0, 0, ang], colour: PALETTE.woodDark });
      for (let u = -len / 2 + 1; u <= len / 2; u += 6) P("box", { at: [cx + Math.cos(ang) * u + ox, cy + Math.sin(ang) * u + oy, z], size: [0.9, 0.9, 3.1], rot: [0, 0, ang], colour: PALETTE.woodDark });
    }
    for (const f of [0.3, 0.7]) P("box", { at: [lerp(a[0], b[0], f), lerp(a[1], b[1], f), river(cx, cy).level - 3], size: [1.2, W.PATH_WIDTH - 1, z - river(cx, cy).level + 1.5], rot: [0, 0, ang], colour: PALETTE.woodDark });
  }
}

// ── Prototypes, instanced by the page ───────────────────────────────────────
// Trees: a trunk and a solid crown that only casts shadow; the page draws the
// leaves as soft cards in each tree's own summer greens.
protos.oak = [
  { kind: "cyl", at: [0, 0, 0], r: 1.1, r2: 0.8, h: 6.5, seg: 8, colour: PALETTE.woodDark },
  { kind: "sphere", at: [0, 0, 11.5], r: 6.6, sub: 2, colour: PALETTE.grass, group: "leaves" },
];
protos.birch = [
  { kind: "cyl", at: [0, 0, 0], r: 0.7, r2: 0.45, h: 9, seg: 8, colour: PALETTE.cream },
  { kind: "sphere", at: [0, 0, 13], r: 5, sub: 2, colour: PALETTE.lime, group: "leaves" },
];
protos.maple = [
  { kind: "cyl", at: [0, 0, 0], r: 0.9, r2: 0.6, h: 5.5, seg: 8, colour: PALETTE.woodDark },
  { kind: "sphere", at: [0, 0, 9.5], r: 6, sub: 2, colour: PALETTE.grassDark, group: "leaves" },
];
protos.bush = [{ kind: "sphere", at: [0, 0, 1.6], r: 2.4, sub: 1, colour: PALETTE.grassDark, group: "leaves" }];
for (const [name, colour] of [["flower_red", PALETTE.red], ["flower_orange", PALETTE.orange], ["flower_white", PALETTE.cream], ["flower_yellow", PALETTE.yellow]]) {
  protos[name] = [0, 1, 2].map((n) => ({ kind: "sphere", at: [Math.cos(n * 2.1) * 1.1, Math.sin(n * 2.1) * 1.1, 1.2 + (n % 2) * 0.3], r: 0.55, sub: 1, colour }));
}
protos.fence = [
  { kind: "box", at: [-2, 0, 0], size: [0.5, 0.5, 2.2], colour: PALETTE.wood },
  { kind: "box", at: [2, 0, 0], size: [0.5, 0.5, 2.2], colour: PALETTE.wood },
  { kind: "box", at: [0, 0, 1.7], size: [4.4, 0.25, 0.3], colour: PALETTE.woodDark },
  { kind: "box", at: [0, 0, 0.8], size: [4.4, 0.25, 0.3], colour: PALETTE.woodDark },
];
protos.lantern = [
  { kind: "cyl", at: [0, 0, 0], r: 0.32, h: 4.6, seg: 8, colour: PALETTE.woodDark },
  { kind: "rbox", at: [0, 0, 4.6], size: [1.6, 1.6, 2.0], r: 0.3, colour: PALETTE.yellow, group: "lights:lantern" },
  { kind: "cyl", at: [0, 0, 6.6], r: 1.25, r2: 0.2, h: 0.9, seg: 6, colour: PALETTE.woodDark },
];
protos.bench = [
  { kind: "box", at: [0, 0, 0.9], size: [3.2, 1.0, 0.25], colour: PALETTE.wood },
  { kind: "box", at: [0, -0.55, 1.15], size: [3.2, 0.2, 0.9], colour: PALETTE.wood },
  { kind: "box", at: [-1.2, 0, 0], size: [0.3, 1.0, 0.9], colour: PALETTE.woodDark },
  { kind: "box", at: [1.2, 0, 0], size: [0.3, 1.0, 0.9], colour: PALETTE.woodDark },
];
protos.stump = [
  { kind: "cyl", at: [0, 0, 0], r: 1.3, r2: 1.1, h: 1.3, seg: 10, colour: PALETTE.wood },
  { kind: "cyl", at: [0, 0, 1.3], r: 1.05, h: 0.06, seg: 10, colour: "#e2c9a0" },
];
protos.logs = [[0, 0, 0.7], [1.5, 0, 0.7], [0.75, 0, 1.95]].map(([lx, ly, lz]) => ({ kind: "cyl", at: [lx, ly + 2.2, lz], r: 0.75, h: 4.4, seg: 10, rot: [Math.PI / 2, 0, 0], colour: lz > 1 ? PALETTE.woodDark : PALETTE.wood }));
protos.signpost = [
  { kind: "box", at: [0, 0, 0], size: [0.45, 0.45, 4.4], colour: PALETTE.woodDark },
  { kind: "box", at: [0.9, 0, 3.4], size: [2.4, 0.22, 0.8], colour: PALETTE.cream },
  { kind: "box", at: [-0.7, 0, 2.4], size: [2.2, 0.22, 0.8], colour: PALETTE.peach },
];
protos.picnic = [
  { kind: "box", at: [0, 0, 1.5], size: [3.6, 1.7, 0.25], colour: PALETTE.wood },
  ...[-1.35, 1.35].map((dy) => ({ kind: "box", at: [0, dy, 0.85], size: [3.6, 0.6, 0.2], colour: PALETTE.wood })),
  ...[-1.4, 1.4].map((dx) => ({ kind: "box", at: [dx, 0, 0], size: [0.3, 3.2, 0.85], colour: PALETTE.woodDark })),
  ...[-1.4, 1.4].map((dx) => ({ kind: "box", at: [dx, 0, 0], size: [0.3, 0.3, 1.5], colour: PALETTE.woodDark })),
];
protos.crate = [{ kind: "rbox", at: [0, 0, 0], size: [2.4, 2.4, 2.4], r: 0.25, colour: PALETTE.tan }, { kind: "box", at: [0, 0, 2.4], size: [2.5, 0.4, 0.1], colour: PALETTE.woodDark }, { kind: "box", at: [0, 0, 2.4], size: [0.4, 2.5, 0.1], colour: PALETTE.woodDark }];
PALETTE.buildings.slice(0, 4).forEach((wall, n) => {
  const roof = PALETTE.roofs[n], w = 12, d = 9, h = 7;
  protos[`house_${n}`] = [
    { kind: "rbox", at: [0, 0, 0], size: [w, d, h], r: 0.5, colour: wall },
    { kind: "gable", at: [0, 0, h], size: [w + 1, d + 1.4, 4.6], colour: roof },
    { kind: "box", at: [w * 0.25, -d * 0.2, h + 1.4], size: [1.4, 1.4, 4], colour: PALETTE.woodDark },
    { kind: "quad", pts: [[-2.2, d / 2 + 0.05, 2.6], [-0.4, d / 2 + 0.05, 2.6], [-0.4, d / 2 + 0.05, 4.8], [-2.2, d / 2 + 0.05, 4.8]], colour: PALETTE.slate, group: "lights:window" },
    { kind: "quad", pts: [[1.6, d / 2 + 0.05, 2.6], [3.4, d / 2 + 0.05, 2.6], [3.4, d / 2 + 0.05, 4.8], [1.6, d / 2 + 0.05, 4.8]], colour: PALETTE.slate, group: "lights:window" },
    { kind: "quad", pts: [[w / 2 + 0.05, -1, 2.6], [w / 2 + 0.05, 1, 2.6], [w / 2 + 0.05, 1, 4.8], [w / 2 + 0.05, -1, 4.8]], colour: PALETTE.slate, group: "lights:window" },
    // white frames round the windows, a flower box under each front one
    ...[-1.3, 2.5].flatMap((cx) => [
      { kind: "box", at: [cx, d / 2 - 0.0, 2.3], size: [2.5, 0.06, 2.8], colour: PALETTE.cream },
      { kind: "box", at: [cx, d / 2 + 0.3, 2.0], size: [2.3, 0.6, 0.45], colour: PALETTE.wood },
      { kind: "sphere", at: [cx - 0.6, d / 2 + 0.3, 2.6], r: 0.36, sub: 1, colour: n % 2 ? PALETTE.red : PALETTE.yellow },
      { kind: "sphere", at: [cx + 0.6, d / 2 + 0.3, 2.6], r: 0.36, sub: 1, colour: n % 2 ? PALETTE.orange : PALETTE.cream },
    ]),
    { kind: "box", at: [w / 2 - 0.0, 0, 2.3], size: [0.06, 2.5, 2.8], colour: PALETTE.cream },
    // the front door and its step
    { kind: "box", at: [-4.3, d / 2 + 0.03, 0], size: [1.7, 0.12, 3.9], colour: PALETTE.woodDark },
    { kind: "sphere", at: [-3.75, d / 2 + 0.12, 1.9], r: 0.12, sub: 1, colour: PALETTE.yellow },
    { kind: "box", at: [-4.3, d / 2 + 0.6, 0], size: [2.6, 1.2, 0.35], colour: PALETTE.stone },
  ];
});
const TREES = ["oak", "oak", "birch", "maple"];
function tree(x, y, kind = pick(TREES), s = 0.8 + R() * 0.45) {
  claim(x, y, 5.5 * s * grow(kind), true);
  place(kind, x, y, R() * 6.28, s);
}
function house(x, y, rot) {
  claim(x, y, 15);
  place(`house_${Math.floor(R() * 4)}`, x, y, rot, 0.9 + R() * 0.2);
}

// ── The cities: flat-coloured blocks on sandy ground, tiled streets ─────────
// Towers get continuous glass bands round each floor, broken by slim mullions
// in the facade's colour; lower blocks get punched windows.
function windows(x, y, w, d, z0, z1, glass, facade, ribbon, floor = 9) {
  const quads = [], fins = [], wh = ribbon ? 5.6 : 5;
  const front = (u0, u1, a, b) => [[x + u0, y + d / 2 + 0.06, a], [x + u1, y + d / 2 + 0.06, a], [x + u1, y + d / 2 + 0.06, b], [x + u0, y + d / 2 + 0.06, b]];
  const side = (u0, u1, a, b) => [[x + w / 2 + 0.06, y + u1, a], [x + w / 2 + 0.06, y + u0, a], [x + w / 2 + 0.06, y + u0, b], [x + w / 2 + 0.06, y + u1, b]];
  let top = z0 + 10;
  for (let zz = z0 + 10; zz + wh < z1 - 2; zz += floor) {
    top = zz + wh;
    if (ribbon) { quads.push(front(-w / 2 + 2, w / 2 - 2, zz, zz + wh), side(-d / 2 + 2, d / 2 - 2, zz, zz + wh)); continue; }
    for (let u = -w / 2 + 3.5; u + 4 < w / 2 - 2.5; u += 7.5) quads.push(front(u, u + 4, zz, zz + wh));
    for (let u = -d / 2 + 3.5; u + 4 < d / 2 - 2.5; u += 7.5) quads.push(side(u, u + 4, zz, zz + wh));
  }
  prims.push({ kind: "quads", quads, colour: glass, group: "lights:window", ref: [x, y, (z0 + z1) / 2] });
  if (!ribbon) return;
  for (let u = -w / 2 + 2 + 4.6; u < w / 2 - 3; u += 4.6) fins.push(front(u - 0.3, u + 0.3, z0 + 9.5, top + 0.5).map(([a, b, c]) => [a, b + 0.05, c]));
  for (let u = -d / 2 + 2 + 4.6; u < d / 2 - 3; u += 4.6) fins.push(side(u - 0.3, u + 0.3, z0 + 9.5, top + 0.5).map(([a, b, c]) => [a + 0.05, b, c]));
  prims.push({ kind: "quads", quads: fins, colour: facade, group: "static", ref: [x, y, (z0 + z1) / 2] });
}
const AWNINGS = [PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.water, PALETTE.grass];
// modern blocks: charcoal to near-black towers with pale glass, the low blocks in lighter greys
const TOWERS = ["#2b2f33", "#3b4045", "#1f2225", "#4a5056"], LOWS = ["#7d848a", "#a3a9ae", "#c9cdd0", "#646b71"];
function block(x, y, w, d, h, colour, roof = PALETTE.woodDark) {
  const ribbon = h > 40;
  const z = TOP;
  P("rbox", { at: [x, y, z], size: [w, d, h], r: 2.0, colour });
  P("rbox", { at: [x, y, z + h], size: [w + 1.6, d + 1.6, 2.0], r: 0.7, colour: roof });
  if (h > 30) P("rbox", { at: [x + w * 0.12, y - d * 0.1, z + h + 2], size: [w * 0.4, d * 0.35, 4.5], r: 0.8, colour: PALETTE.stone });
  windows(x, y, w, d, z, z + h, ribbon ? "#a9c2d0" : "#3d4a54", colour, ribbon);
  // a shopfront round the two faces the viewer sees: glass, an awning, a door
  const fy = y + d / 2 + 0.07, fx = x + w / 2 + 0.07, awning = AWNINGS[Math.floor(hash(Math.round(x), Math.round(y), 5) * AWNINGS.length)];
  prims.push({ kind: "quads", group: "lights:window", colour: "#3f4c55", ref: [x, y, z + 3], quads: [
    [[x - w / 2 + 2.5, fy, z + 1], [x + w / 2 - 2.5, fy, z + 1], [x + w / 2 - 2.5, fy, z + 6], [x - w / 2 + 2.5, fy, z + 6]],
    [[fx, y + d / 2 - 2.5, z + 1], [fx, y - d / 2 + 2.5, z + 1], [fx, y - d / 2 + 2.5, z + 6], [fx, y + d / 2 - 2.5, z + 6]],
  ] });
  P("rbox", { at: [x, y + d / 2 + 1.4, z + 6.4], size: [w - 3, 2.8, 0.8], r: 0.3, colour: awning });
  P("rbox", { at: [x + w / 2 + 1.4, y, z + 6.4], size: [2.8, d - 3, 0.8], r: 0.3, colour: awning });
  P("box", { at: [x - w * 0.18, fy + 0.04, z + 0.2], size: [3, 0.1, 5.2], colour: PALETTE.woodDark });
  // on the roof: air-handling units, and a water tank and mast on the tall ones
  for (const k of [0, 1]) P("rbox", { at: [x - w * 0.28 + k * 5, y + d * 0.22, z + h + 2], size: [3.8, 3.8, 2.4], r: 0.5, colour: k ? PALETTE.stone : PALETTE.cream });
  if (h > 45) {
    P("cyl", { at: [x - w * 0.25, y - d * 0.22, z + h + 2], r: 2.6, h: 5, seg: 14, colour: PALETTE.stone });
    P("cyl", { at: [x - w * 0.25, y - d * 0.22, z + h + 7], r: 2.9, r2: 0.3, h: 1.8, seg: 14, colour: PALETTE.woodDark });
  }
  if (h > 70) {
    P("cyl", { at: [x + w * 0.12, y - d * 0.1, z + h + 6.5], r: 0.4, h: 12, seg: 6, colour: PALETTE.slate });
    P("sphere", { at: [x + w * 0.12, y - d * 0.1, z + h + 18.8], r: 0.9, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
  }
  tall.push([x, y, z + h + 4]);
}
function city(C, heightAt) {
  const [fw, fd] = floorOf(C);
  for (let i = 0; i <= C.cols; i++) P("box", { at: [C.x + (i - C.cols / 2) * C.pitch, C.y, TOP + 0.12], size: [10, fd - 8, 0.1], colour: PALETTE.stone });
  for (let j = 0; j <= C.rows; j++) P("box", { at: [C.x, C.y + (j - C.rows / 2) * C.pitch, TOP + 0.12], size: [fw - 8, 10, 0.1], colour: PALETTE.stone });
  // white dashes down the middle of each street, clear of the junctions
  const dashes = (len, at) => { for (let u = -len / 2 + 4; u < len / 2 - 4; u += 7) if (Math.abs(((u + len / 2) % C.pitch) - C.pitch / 2) < C.pitch / 2 - 8) at(u); };
  for (let i = 0; i <= C.cols; i++) dashes(fd - 8, (u) => P("box", { at: [C.x + (i - C.cols / 2) * C.pitch, C.y + u, TOP + 0.2], size: [0.7, 3.4, 0.06], colour: PALETTE.cream }));
  for (let j = 0; j <= C.rows; j++) dashes(fw - 8, (u) => P("box", { at: [C.x + u, C.y + (j - C.rows / 2) * C.pitch, TOP + 0.2], size: [3.4, 0.7, 0.06], colour: PALETTE.cream }));
  for (let i = 0; i <= C.cols; i++) for (let j = 0; j <= C.rows; j++) {
    const x = C.x + (i - C.cols / 2) * C.pitch + 8.5, y = C.y + (j - C.rows / 2) * C.pitch + 8.5;
    if (hash(i, j, 21) < 0.5) place("lantern", x, y, 0, 0.9, TOP + 0.2);
    else place(hash(i, j, 22) < 0.5 ? "maple" : "birch", x, y, R() * 6.28, 0.42 + R() * 0.1, TOP + 0.2);
  }
  for (let j = 0; j < C.rows; j++) for (let i = 0; i < C.cols; i++) {
    const x = C.x + (i - (C.cols - 1) / 2) * C.pitch, y = C.y + (j - (C.rows - 1) / 2) * C.pitch;
    if (C.park && C.park[0] === i && C.park[1] === j) {
      P("rbox", { at: [x, y, TOP + 0.05], size: [C.pitch - 12, C.pitch - 12, 0.3], r: 0.6, colour: PALETTE.grassLight });
      P("cyl", { at: [x + 6, y + 5, TOP + 0.3], r: 9, h: 0.2, seg: 28, colour: PALETTE.water });
      for (const [dx, dy, k] of [[-14, -14, "maple"], [14, -15, "oak"], [-15, 12, "maple"]]) place(k, x + dx, y + dy, R() * 6.28, 0.42 + R() * 0.1, TOP + 0.35);
      for (const [dx, dy, rot] of [[13, 15, 0], [-4, 17, 0]]) place("bench", x + dx, y + dy, rot, 1, TOP + 0.35);
      continue;
    }
    const [h, kind] = heightAt(i, j);
    const tower = h > 40, colour = (tower ? TOWERS : LOWS)[(i * 3 + j * 5) % 4];
    const roof = tower ? "#16181a" : "#3b4045";
    const bw = C.pitch - 24 - hash(i, j, 4) * 6, bd = C.pitch - 24 - hash(i, j, 6) * 6;
    if (kind === "tower") block(x, y, bw, bd, h, colour, roof);
    else { block(x - 5, y - 5, bw * 0.62, bd * 0.7, h, colour, roof); block(x + bw * 0.3, y + bd * 0.3, bw * 0.38, bd * 0.38, h * 0.55, LOWS[(i + j + 3) % 4], "#3b4045"); }
  }
}
city(W.CITY_A, (i, j) => {
  const back = W.CITY_A.rows - 1 - j, middle = 1 - Math.abs(i - (W.CITY_A.cols - 1) / 2) / 2;
  return [Math.round(30 + back * 24 + middle * 22 + (hash(i, j, 3) - 0.5) * 14), j === W.CITY_A.rows - 1 && hash(i, j, 9) < 0.6 ? "mid" : "tower"];
});
city(W.CITY_B, (i, j) => [Math.round(14 + hash(i, j, 8) * 14 + (i === 1 && j === 1 ? 18 : 0)), i === 1 && j === 1 ? "tower" : "mid"]);
for (const S of W.SUBURBS) {
  for (let y = S.y - S.d / 2 + 10; y <= S.y + S.d / 2; y += 30) for (let x = S.x - S.w / 2 + 10; x <= S.x + S.w / 2; x += 32) {
    const hx = x + (R() - 0.5) * 4, hy = y + (R() - 0.5) * 4;
    if (W.reach(hx, hy) > 0.9 || river(hx, hy).d < 12 || reservoir(hx, hy) < 1.4 || pondGap(hx, hy) < 12 || onFloor(hx, hy, 12) || pathGap(hx, hy) < W.PATH_WIDTH / 2 + 12 || !free(hx, hy, 13)) continue;
    if (R() < 0.8) house(hx, hy, R() < 0.5 ? 0 : Math.PI / 2);
    else tree(hx, hy, "maple", 0.55 + R() * 0.25);
  }
}
{
  const { x, y, w, d, h } = W.DATA_CENTRE, z = on(x, y);
  P("rbox", { at: [x, y, z], size: [w, d, h], r: 0.8, colour: PALETTE.cream });
  P("box", { at: [x, y + d / 2 + 0.05, z + h * 0.45], size: [w - 6, 0.1, 2.8], colour: PALETTE.water, group: "lights:led" });
  for (let i = 0; i < 3; i++) P("cyl", { at: [x - w / 2 + 10 + i * 15, y, z + h], r: 4.6, h: 1.6, seg: 18, colour: PALETTE.slate });
  claim(x, y, 32);
}

// ── Hydro: the dam across the valley, its spillway, the powerhouse below ───
const spray = [];
{
  const D = W.DAM, [ax, ay] = W.RIVER_POINTS[0], [bx, by] = W.RIVER_POINTS[1];
  const ang = Math.atan2(by - ay, bx - ax), c = Math.cos(ang), s = Math.sin(ang);
  const foot = river(D.x, D.y).level - 3;
  P("rbox", { at: [D.x, D.y, foot], size: [12, D.length, D.top - foot], rot: [0, 0, ang], r: 1, colour: PALETTE.stone });
  P("rbox", { at: [D.x - c * 1.5, D.y - s * 1.5, D.top], size: [8, D.length + 4, 1.4], rot: [0, 0, ang], r: 0.4, colour: PALETTE.cream });
  for (const k of [-1, 0, 1]) {
    const gx = D.x - s * k * 10, gy = D.y + c * k * 10;
    P("rbox", { at: [gx + c * 2, gy + s * 2, D.top - 1], size: [3, 2, 5], rot: [0, 0, ang], r: 0.3, colour: PALETTE.slate });
    const top = [gx + c * 6, gy + s * 6, D.top - 3], low = [gx + c * 16, gy + s * 16, river(gx + c * 16, gy + s * 16).level + 0.2];
    const off = [-s * 3.2, c * 3.2];
    prims.push({ kind: "quads", group: "foam", colour: "#ffffff", quads: [[[top[0] - off[0], top[1] - off[1], top[2]], [top[0] + off[0], top[1] + off[1], top[2]], [low[0] + off[0], low[1] + off[1], low[2]], [low[0] - off[0], low[1] - off[1], low[2]]]] });
    spray.push([low[0], low[1], low[2] + 1]);
  }
  const px = D.x + c * 18 + s * 24, py = D.y + s * 18 - c * 24, pz = on(px, py);
  P("rbox", { at: [px, py, pz], size: [28, 20, 14], rot: [0, 0, ang], r: 1.6, colour: PALETTE.peach });
  P("gable", { at: [px, py, pz + 14], size: [21, 29, 5], rot: [0, 0, ang + Math.PI / 2], colour: PALETTE.woodDark });
  for (const k of [-3, 3]) P("tube", { points: [[D.x + s * (22 + k * 0.3), D.y - c * (22 + k * 0.3), D.top - 6], [px - c * 9 + s * k, py - s * 9 - c * k, pz + 6]], r: 1.4, colour: PALETTE.slate });
  claim(D.x, D.y, 30); claim(px, py, 20);
  tall.push([D.x, D.y, D.top + 10]);
}

// ── Wind on the highland rim, offshore in the bay ───────────────────────────
const AX = (() => { const l = Math.hypot(0.42, 0.91); return [0.42 / l, 0.91 / l, 0]; })();
const yaw = Math.atan2(AX[1], AX[0]);
const rotors = [];
function turbine(x, y, { base = on(x, y), hub = 96, R: rad = 46, offshore = false } = {}) {
  if (offshore) {
    const bed = on(x, y) - 2;
    P("cyl", { at: [x, y, bed], r: 4.8, h: WATER + 4 - bed, seg: 16, colour: PALETTE.yellow });
    P("cyl", { at: [x, y, WATER + 3], r: 8.5, h: 1.6, seg: 18, colour: PALETTE.yellow });
    base = WATER + 4.2;
  }
  P("cyl", { at: [x, y, base], r: 4.6, r2: 2.8, h: hub - 3, seg: 16, colour: PALETTE.cream });
  P("rbox", { at: [x - AX[0] * 3, y - AX[1] * 3, base + hub - 3.4], size: [16, 6.4, 6.4], rot: [0, 0, yaw], r: 2, colour: PALETTE.cream });
  rotors.push({ at: [x + AX[0] * 7, y + AX[1] * 7, base + hub], axis: AX, R: rad, phase: R() * Math.PI * 2, rpm: 10 + R() * 3 });
  P("sphere", { at: [x - AX[0] * 9, y - AX[1] * 9, base + hub + 3.6], r: 1.3, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
  claim(x, y, 14);
  tall.push([x, y, base + hub + rad]);
}
for (const [x, y] of W.WIND) turbine(x, y);
for (const [x, y] of W.OFFSHORE) turbine(x, y, { hub: 76, R: 38, offshore: true });

// ── The nuclear station ─────────────────────────────────────────────────────
const steam = [];
{
  for (const [x, y] of W.NUCLEAR.towers) {
    const z = on(x, y), rt = 17, st = 52, c = 38, H = 72;
    const profile = Array.from({ length: 13 }, (_, i) => { const t = (H * i) / 12; return [t, rt * Math.sqrt(1 + ((t - st) / c) ** 2)]; });
    P("lathe", { at: [x, y, z], profile, seg: 40, colour: PALETTE.stone, open: true, wall: 0.9 });
    P("cyl", { at: [x, y, z], r: profile[0][1] + 0.5, h: 2.6, seg: 40, colour: PALETTE.mauve });
    steam.push([x, y, z + H]);
    claim(x, y, 30);
    tall.push([x, y, z + H + 30]);
  }
  const [rx, ry] = W.NUCLEAR.reactor, rz = on(rx, ry);
  P("cyl", { at: [rx, ry, rz], r: 16, h: 20, seg: 32, colour: PALETTE.stone });
  P("sphere", { at: [rx, ry, rz + 20], r: 16, sub: 3, colour: PALETTE.cream, hemi: true });
  claim(rx, ry, 20);
  const hall = W.NUCLEAR.hall, hz = on(hall.x, hall.y);
  P("rbox", { at: [hall.x, hall.y, hz], size: [hall.w, hall.d, 20], r: 2, colour: PALETTE.peach });
  P("gable", { at: [hall.x, hall.y, hz + 20], size: [hall.w + 1.5, hall.d + 1.5, 4.5], colour: PALETTE.woodDark });
  prims.push({ kind: "quads", group: "lights:glow", colour: "#ffcf7a", ref: [hall.x, hall.y, hz + 8], quads: [-0.25, 0.25].map((f) => [[hall.x + hall.w * f - 5, hall.y + hall.d / 2 + 0.06, hz], [hall.x + hall.w * f + 5, hall.y + hall.d / 2 + 0.06, hz], [hall.x + hall.w * f + 5, hall.y + hall.d / 2 + 0.06, hz + 11], [hall.x + hall.w * f - 5, hall.y + hall.d / 2 + 0.06, hz + 11]]) });
  claim(hall.x, hall.y, 28);
}

// ── Solar, the battery and the gas works along the front ────────────────────
{
  const S = W.SOLAR, tilt = 0.42, lift = 5.5;
  for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) {
    const x = S.x + c * (S.w + S.gap), y = S.y + r * (S.d + S.gap * 1.6), z = on(x, y);
    P("rbox", { at: [x, y, z + lift], size: [S.w, S.d, 1.6], rot: [-tilt, 0, 0], r: 0.7, colour: PALETTE.slate });
    const quads = [], ct = Math.cos(tilt), st = Math.sin(tilt);
    const onPanel = (u, v) => [x + u, y + v * ct + 1.6 * st, z + lift + 1.6 * ct + 0.08 - v * st];
    for (let u = -S.w / 2 + 6.3; u < S.w / 2 - 2; u += 6.3) quads.push([onPanel(u - 0.35, -S.d / 2 + 1.2), onPanel(u + 0.35, -S.d / 2 + 1.2), onPanel(u + 0.35, S.d / 2 - 1.2), onPanel(u - 0.35, S.d / 2 - 1.2)]);
    for (let v = -S.d / 2 + 6; v < S.d / 2 - 2; v += 6) quads.push([onPanel(-S.w / 2 + 1.2, v - 0.35), onPanel(S.w / 2 - 1.2, v - 0.35), onPanel(S.w / 2 - 1.2, v + 0.35), onPanel(-S.w / 2 + 1.2, v + 0.35)]);
    prims.push({ kind: "quads", quads: quads.map((q) => q.reverse()), colour: "#8fd3f0", group: "static", ref: [x, y, z - 20] });
    for (const lx of [-S.w / 2 + 3.5, 0, S.w / 2 - 3.5]) P("rbox", { at: [x + lx, y, z], size: [1.6, 1.6, lift + 0.4], r: 0.3, colour: PALETTE.wood });
    claim(x, y, 24);
  }
  // a fence round the field, a gate on the south side, and the inverter by it
  const x0 = S.x - S.w / 2 - 6, x1 = S.x + (S.cols - 1) * (S.w + S.gap) + S.w / 2 + 6;
  const y0 = S.y - S.d / 2 - 6, y1 = S.y + (S.rows - 1) * (S.d + S.gap * 1.6) + S.d / 2 + 6, step = 4.4 * grow("fence");
  for (let u = x0 + step / 2; u < x1; u += step) { place("fence", u, y0, 0, 1); if (Math.abs(u - (x0 + x1) / 2) > step) place("fence", u, y1, 0, 1); }
  for (let v = y0 + step / 2; v < y1; v += step) { place("fence", x0, v, Math.PI / 2, 1); place("fence", x1, v, Math.PI / 2, 1); }
  const ix = (x0 + x1) / 2 + step * 1.6, iy = y1 - 6, iz = on(ix, iy);
  P("rbox", { at: [ix, iy, iz], size: [8, 5, 6], r: 0.8, colour: PALETTE.cream });
  P("box", { at: [ix + 2, iy + 2.56, iz + 4.4], size: [1.6, 0.1, 0.7], colour: "#3ee07f", group: "lights:led" });
}
{
  const B = W.BATTERY;
  for (let n = 0; n < B.n; n++) {
    const x = B.x + n * 22, y = B.y, z = on(x, y);
    P("rbox", { at: [x, y, z], size: [17, 28, 15], r: 2.2, colour: PALETTE.cream });
    P("rbox", { at: [x, y + 14.05, z + 3], size: [11, 0.4, 3.6], r: 0.5, colour: PALETTE.grass });
    P("box", { at: [x, y + 14.1, z + 10.5], size: [4.4, 0.1, 1.8], colour: "#3ee07f", group: "lights:led" });
    claim(x, y, 18);
  }
}
const smoke = [];
{
  const { x, y } = W.FACTORY, z = on(x, y);
  P("rbox", { at: [x, y, z], size: [45, 32, 19], r: 2, colour: PALETTE.tan });
  for (let i = 0; i < 3; i++) P("gable", { at: [x - 15 + i * 15, y, z + 19], size: [15, 32, 6.5], colour: PALETTE.woodDark });
  P("cyl", { at: [x - 16, y - 10, z], r: 5, r2: 4, h: 56, seg: 18, colour: PALETTE.cream });
  for (const b of [38, 48]) P("cyl", { at: [x - 16, y - 10, z + b], r: 4.45, h: 4, seg: 18, colour: PALETTE.red });
  P("cyl", { at: [x - 16, y - 10, z + 56], r: 3.4, h: 0.3, seg: 18, colour: "#ffb35c", group: "lights:glow" });
  for (const [dx, dy] of [[29, 10], [34, 4], [29, 3]]) place("crate", x + dx, y + dy, R(), 1);
  smoke.push([x - 16, y - 10, z + 57]);
  claim(x, y, 36);
  tall.push([x - 16, y - 10, z + 84]);
}

// ── The jetty into the bay, crates and boats ────────────────────────────────
{
  const J = W.JETTY, z = WATER + 1.6;
  for (let u = 0, n = 0; u < J.length; u += 3.4, n++) P("box", { at: [J.x + u, J.y, z], size: [3.1, 12, 0.5], colour: n % 2 ? PALETTE.wood : "#a58d6f" });
  for (let u = 3; u < J.length; u += 10) for (const sgn of [-1, 1]) { const bed = on(J.x + u, J.y + sgn * 5.4) - 1; P("cyl", { at: [J.x + u, J.y + sgn * 5.4, bed], r: 0.8, h: z - bed + 2.2, seg: 8, colour: PALETTE.woodDark }); }
  for (const [dx, dy] of [[8, 2.6], [12.4, 2.4], [8, -2.4]]) place("crate", J.x + dx, J.y + dy, R(), 0.9, z + 0.3);
  place("lantern", J.x + J.length - 3, J.y + 4, 0, 0.9, z + 0.3);
  const boat = (x, y, ang, len, sail) => {
    P("rbox", { at: [x, y, WATER - 1.2], size: [len, len * 0.38, 3.8], rot: [0, 0, ang], r: 1.3, colour: sail ? PALETTE.cream : PALETTE.red });
    if (sail) P("cyl", { at: [x, y, WATER + 2.6], r: 5.6, r2: 0.05, h: 23, seg: 3, rot: [0, 0, ang], colour: PALETTE.cream });
    else P("rbox", { at: [x - Math.cos(ang) * 4, y - Math.sin(ang) * 4, WATER + 2.6], size: [8, 6.4, 5], rot: [0, 0, ang], r: 1, colour: PALETTE.cream });
  };
  boat(J.x + J.length + 10, J.y + 12, 0.1, 20, false);
  boat(246, 80, 0.7, 18, true);
}

// ── Geothermal at the front edge: a drilling rig over the bore, the plant
// behind it with its condensers steaming, and the bore itself down the cut face
// to a glowing pocket of hot rock, hot water up in red and cold back down in blue
let bore;
const vapour = [];
{
  const t = W.GEOTHERMAL, [ex, ey] = W.edgeAt(t), [px, py] = W.edgeAt(t, 0.84), [wx, wy] = W.edgeAt(t, 0.95);
  const z = on(px, py), wz = on(wx, wy);
  const HOT = PALETTE.red, COLD = "#2f8fd0";
  // the plant: a long hall with a stepped roof, warm windows and a red band
  P("rbox", { at: [px, py, z], size: [54, 34, 21], r: 2.2, colour: PALETTE.cream });
  P("rbox", { at: [px, py, z + 21], size: [56, 36, 2.2], r: 0.8, colour: PALETTE.slate });
  P("rbox", { at: [px + 9, py - 3, z + 23], size: [24, 18, 8], r: 1.4, colour: PALETTE.slate });
  P("box", { at: [px, py + 17.06, z + 15.5], size: [54, 0.1, 2.8], colour: HOT });
  prims.push({ kind: "quads", group: "lights:glow", colour: "#ffcf7a", ref: [px, py, z + 6], quads: [-18, -6, 6, 18].map((u) => [[px + u - 3.5, py + 17.08, z + 4], [px + u + 3.5, py + 17.08, z + 4], [px + u + 3.5, py + 17.08, z + 11], [px + u - 3.5, py + 17.08, z + 11]]) });
  // two squat condensers beside it, each with a plume
  for (const dy of [-11, 11]) {
    const cx = px - 44, cy = py + dy * 1.15, cz = on(cx, cy);
    P("cyl", { at: [cx, cy, cz], r: 10.5, r2: 8.8, h: 26, seg: 28, colour: PALETTE.stone });
    P("cyl", { at: [cx, cy, cz + 18], r: 9.5, h: 3.5, seg: 28, colour: PALETTE.orange });
    P("cyl", { at: [cx, cy, cz + 26], r: 7.8, h: 0.3, seg: 28, colour: PALETTE.slate });
    vapour.push([cx, cy, cz + 27]);
    claim(cx, cy, 13);
  }
  // the rig over the well: an orange lattice tower on a yellow pad, a beacon on top
  const legs = [[1, 1], [1, -1], [-1, -1], [-1, 1]], H = 48, half = (h) => 7.5 - (h / H) * 5.5, levels = [0, 8, 16, 24, 32, 40, H], bars = [];
  for (const [u, v] of legs) for (let j = 0; j < levels.length - 1; j++) bars.push([[wx + u * half(levels[j]), wy + v * half(levels[j]), wz + levels[j]], [wx + u * half(levels[j + 1]), wy + v * half(levels[j + 1]), wz + levels[j + 1]]]);
  for (let j = 1; j < levels.length; j++) for (let f = 0; f < 4; f++) {
    const [au, av] = legs[f], [bu, bv] = legs[(f + 1) % 4], h0 = levels[j - 1], h1 = levels[j];
    bars.push([[wx + au * half(h1), wy + av * half(h1), wz + h1], [wx + bu * half(h1), wy + bv * half(h1), wz + h1]], [[wx + au * half(h0), wy + av * half(h0), wz + h0], [wx + bu * half(h1), wy + bv * half(h1), wz + h1]]);
  }
  P("rbox", { at: [wx, wy, wz - 0.4], size: [20, 20, 2], r: 0.8, colour: PALETTE.yellow });
  P("bars", { bars, r: 0.55, colour: PALETTE.ember });
  P("rbox", { at: [wx, wy, wz + H], size: [6, 6, 2.4], r: 0.6, colour: PALETTE.ember });
  P("sphere", { at: [wx, wy, wz + H + 3.4], r: 1.4, sub: 1, colour: PALETTE.red, group: "lights:beacon" });
  P("cyl", { at: [wx, wy, wz + 1.6], r: 3, h: 6, seg: 14, colour: PALETTE.slate });
  tall.push([wx, wy, wz + H + 8]);
  claim(wx, wy, 13);
  // the pipes: hot up from the well to the plant in red, cold back in blue, on low stands
  for (const [side, colour] of [[-3.2, HOT], [3.2, COLD]]) {
    const a = [wx + side, wy - 4, wz + 4], b = [px + side * 2, py + 17.5, z + 4];
    P("tube", { points: [a, [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5), wz + 8], b], r: 1.4, colour, seg: 10 });
    // and from the well down to the cut face, then down the wall to the hot rock
    const top = [ex + side * 1.6, ey + 2.4, TOP - 1.4];
    P("tube", { points: [[wx + side, wy + 4, wz + 3], top], r: 1.6, colour, seg: 10 });
    P("tube", { points: [top, [top[0], top[1], -50]], r: 2, colour, seg: 10 });
  }
  // the hot rock: a glowing lens on the cut face where the bore ends, a dark rim round it
  const lens = (rx, rz, off, colour, group) => {
    const quads = [], n = 28, cz = -54;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const wob = (a) => 1 + 0.12 * Math.sin(3 * a + 1) + 0.07 * Math.sin(7 * a);
      const pt = (a) => [ex + Math.cos(a) * rx * wob(a), ey + off, Math.max(-DEPTH + 0.6, cz + Math.sin(a) * rz * wob(a))];
      quads.push([[ex, ey + off, cz], pt(a0), pt(a1), pt(a1)]);
    }
    prims.push({ kind: "quads", quads, colour, group, ref: [ex, ey, cz] });
  };
  lens(42, 11, 0.5, PALETTE.ember, "static");
  lens(30, 7, 0.7, "#ffb35c", "lights:magma");
  bore = [ex, ey + 1.6, -54];
  claim(px, py, 34);
}

// ── Substations, where each line comes down at a city ──────────────────────
for (const [x, y] of Object.values(W.SUBSTATIONS)) {
  const z = on(x, y);
  P("rbox", { at: [x, y, z - 0.6], size: [28, 22, 1.4], r: 0.6, colour: PALETTE.sand });
  for (const dx of [-6.5, 6.5]) P("rbox", { at: [x + dx, y, z + 0.8], size: [8, 9, 8], r: 1, colour: PALETTE.slate });
  for (let k = -1.5; k <= 1.5; k++) place("fence", x + k * 4.4 * grow("fence"), y - 12, 0, 1);
  claim(x, y, 18);
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
  protos.pylon = [{ kind: "bars", bars, r: 0.3, colour: PALETTE.slate }, { kind: "sphere", at: [0, 0, PEAK + 0.6], r: 0.7, sub: 1, colour: PALETTE.red, group: "lights:beacon" }];
}
const lines = [];
for (const pts of Object.values(W.LINES)) {
  const tips = pts.map(([x, y], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const rot = Math.atan2(b[1] - a[1], b[0] - a[0]), z0 = on(x, y), c = Math.cos(rot), s = Math.sin(rot);
    place("pylon", x, y, rot, 1, z0);
    claim(x, y, 9);
    const k = grow("pylon");
    return ARMS.flatMap((arm) => [-1, 1].map((side) => [x - s * side * arm.w * k, y + c * side * arm.w * k, z0 + (arm.z - 2.6) * k]));
  });
  const wire0 = [];
  for (let i = 0; i < tips.length - 1; i++) for (let c = 0; c < tips[i].length; c++) {
    const a = tips[i][c], b = tips[i + 1][c], sag = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.05;
    const wire = Array.from({ length: 9 }, (_, n) => { const t = n / 8; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]; });
    P("tube", { points: wire, r: 0.32, colour: PALETTE.coal, seg: 4 });
    if (c === 2) wire0.push(...(i ? wire.slice(1) : wire));
  }
  lines.push(wire0.map((p) => p.map((v) => Math.round(v * 100) / 100)));
}

// ── Trees, bushes and flowers: woods on the highland, the rest scattered ────
const rocky = (x, y) => on(x, y) > TOP + W.ROCK_LINE - 4 || Math.hypot(on(x + 2, y) - on(x - 2, y), on(x, y + 2) - on(x, y - 2)) / 4 > 0.55;
const open = (x, y, gap) => !rocky(x, y) && W.seaShare(x, y) === 0 && reservoir(x, y) > 1.25 && river(x, y).d > 5 && pondGap(x, y) > 4 && !onFloor(x, y, 3) && pathGap(x, y) > W.PATH_WIDTH / 2 + gap && W.reach(x, y) < 0.95;
for (let n = 0, tries = 0; n < 30 && tries < 4000; tries++) {
  const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 150, x = W.HIGHLAND.x + Math.cos(a) * d, y = W.HIGHLAND.y + Math.sin(a) * d;
  if (!open(x, y, 6) || !free(x, y, 8)) continue;
  tree(x, y, R() < 0.35 ? "birch" : "oak"); n++;
}
// birches along the river, cherries along the main path
for (let i = 3; i < RIVER.length - 3; i += 6) {
  const [x, y] = RIVER[i], [x2, y2] = RIVER[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
  for (const side of [-1, 1]) {
    if (R() < 0.45) continue;
    const off = 24 + R() * 8, tx = x - (dy / l) * off * side, ty = y + (dx / l) * off * side;
    if (open(tx, ty, 6) && free(tx, ty, 8)) tree(tx, ty, "birch", 0.75 + R() * 0.3);
  }
}
for (const [x, y] of PATHS.main.filter((_, i) => i % 9 === 4)) {
  const tx = x + 18, ty = y + 14;
  if (open(tx, ty, 4) && free(tx, ty, 6)) tree(tx, ty, "maple", 0.75 + R() * 0.25);
}
for (let n = 0, tries = 0; n < 55 && tries < 8000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.92, [x, y] = W.edgeAt(t, f);
  if (!open(x, y, 6) || !free(x, y, 10)) continue;
  tree(x, y); n++;
}
for (let n = 0, tries = 0; n < 70 && tries < 8000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.93, [x, y] = W.edgeAt(t, f);
  if (!open(x, y, 2) || !free(x, y, 5)) continue;
  claim(x, y, 5, true);
  place("bush", x, y, R() * 6.28, 0.7 + R() * 0.5); n++;
}
for (let n = 0, tries = 0; n < 90 && tries < 8000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.93, [x, y] = W.edgeAt(t, f);
  if (!open(x, y, -2) || !free(x, y, 2.4)) continue;
  claim(x, y, 2.4, true);
  place(pick(["flower_red", "flower_orange", "flower_white", "flower_yellow"]), x, y, R() * 6.28, 0.8 + R() * 0.5); n++;
}
// benches and a picnic table by each pond; lily pads on it and reeds round its edge
for (const p of W.PONDS) {
  for (const a of [0.8, 2.4]) { const x = p.x + Math.cos(a) * (p.r + 9), y = p.y + Math.sin(a) * (p.r + 9); if (free(x, y, 3)) place("bench", x, y, a + Math.PI / 2, 1); }
  { const a = 4.1, x = p.x + Math.cos(a) * (p.r + 12), y = p.y + Math.sin(a) * (p.r + 12); if (free(x, y, 5)) { place("picnic", x, y, a, 1); claim(x, y, 5); } }
  for (let k = 0; k < 7; k++) {
    const a = R() * Math.PI * 2, f = 0.35 + R() * 0.45, l = W.lobed(a, p.k), x = p.x + Math.cos(a) * p.r * l * f, y = p.y + Math.sin(a) * p.r * l * f;
    P("cyl", { at: [x, y, TOP - 0.85], r: 1.2 + R() * 1.1, h: 0.08, seg: 10, colour: k % 2 ? PALETTE.grassDark : "#6f9a52" });
    if (k % 3 === 0) P("sphere", { at: [x + 0.4, y, TOP - 0.6], r: 0.42, sub: 1, colour: k % 2 ? PALETTE.cream : PALETTE.yellow });
  }
  for (let k = 0; k < 9; k++) {
    const a = 1.4 + k * 0.42 + R() * 0.2, l = W.lobed(a, p.k), x = p.x + Math.cos(a) * p.r * l * 0.98, y = p.y + Math.sin(a) * p.r * l * 0.98;
    for (let m = 0; m < 3; m++) P("cyl", { at: [x + (R() - 0.5) * 1.6, y + (R() - 0.5) * 1.6, TOP - 1.2], r: 0.22, r2: 0.08, h: 3.4 + R() * 2.4, seg: 5, colour: m === 1 ? PALETTE.lime : PALETTE.grassDark });
  }
}
// stumps and log piles in the woods, a signpost a little way along each path
for (let n = 0, tries = 0; n < 14 && tries < 3000; tries++) {
  const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 150, x = W.HIGHLAND.x + Math.cos(a) * d, y = W.HIGHLAND.y + Math.sin(a) * d;
  if (!open(x, y, 3) || !free(x, y, 4)) continue;
  claim(x, y, 4, true);
  place(n % 3 ? "stump" : "logs", x, y, R() * 6.28, 0.8 + R() * 0.3); n++;
}
for (const line of Object.values(PATHS)) {
  const i = Math.min(line.length - 2, 5), [x, y] = line[i], [x2, y2] = line[i + 1], l = Math.hypot(x2 - x, y2 - y) || 1;
  const sx = x - ((y2 - y) / l) * (W.PATH_WIDTH / 2 + 4), sy = y + ((x2 - x) / l) * (W.PATH_WIDTH / 2 + 4);
  if (river(sx, sy).d > 6 && !onFloor(sx, sy, 2) && free(sx, sy, 2)) { place("signpost", sx, sy, Math.atan2(y2 - y, x2 - x), 1); claim(sx, sy, 3); }
}

// ── Rocks: on the mountains, at the shore, and a few in the fields ─────────
protos.rock = [{ kind: "sphere", at: [0, 0, 0.3], r: 1, sub: 2, colour: PALETTE.stone, jitter: 0.3 }, { kind: "sphere", at: [0.9, 0.5, 0.1], r: 0.6, sub: 1, colour: PALETTE.mauve, jitter: 0.3 }];
for (let n = 0, tries = 0; n < 110 && tries < 9000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.96, [x, y] = W.edgeAt(t, f);
  const z = on(x, y), slope = Math.hypot(on(x + 2, y) - on(x - 2, y), on(x, y + 2) - on(x, y - 2)) / 4;
  const rocky = z > TOP + W.ROCK_LINE - 6 || slope > 0.5, shore = W.seaShare(x, y) > 0 && z > WATER - 1.5 && z < WATER + 1.5;
  if (!(rocky || shore) || !free(x, y, 3) || onFloor(x, y, 2) || pathGap(x, y) < 12) continue;
  claim(x, y, 4, true);
  place("rock", x, y, R() * 6.28, (shore ? 1.4 : 2.2) + R() * (shore ? 2.4 : 4.5), z - 0.6); n++;
}
for (let n = 0, tries = 0; n < 16 && tries < 4000; tries++) {
  const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.9, [x, y] = W.edgeAt(t, f);
  if (!open(x, y, 3) || !free(x, y, 5)) continue;
  claim(x, y, 5, true);
  place("rock", x, y, R() * 6.28, 1.6 + R() * 2.2, on(x, y) - 0.5); n++;
}

// ── Cars on the paths: the page drives them ─────────────────────────────────
const cars = [];
for (const [name, line] of Object.entries(PATHS)) {
  const n = Math.max(1, Math.round(line.length / 40));
  for (let k = 0; k < n; k++) cars.push({ road: name, at: (k + R() * 0.5) / n, forward: R() < 0.5, speed: 11 + R() * 5, colour: PALETTE.cars[cars.length % PALETTE.cars.length] });
}
protos.car = [
  { kind: "rbox", at: [0, 0, 0.5], size: [5.6, 2.8, 1.7], r: 0.6, colour: "#ffffff", group: "paint:body" },
  { kind: "rbox", at: [-0.4, 0, 2.1], size: [3, 2.5, 1.2], r: 0.45, colour: PALETTE.slate },
  ...[[-1.8, 1.3], [1.8, 1.3], [-1.8, -1.3], [1.8, -1.3]].map(([dx, dy]) => ({ kind: "cyl", at: [dx, dy, 0.6], r: 0.65, h: 0.5, seg: 10, rot: [Math.PI / 2, 0, 0], colour: PALETTE.coal })),
  { kind: "box", at: [2.82, 0.8, 1.1], size: [0.06, 0.6, 0.35], colour: "#fff6cf", group: "lights:head" },
  { kind: "box", at: [2.82, -0.8, 1.1], size: [0.06, 0.6, 0.35], colour: "#fff6cf", group: "lights:head" },
];

// ── Where grass grows: a grid of the ground's height, a mask and its colour ─
const GRASS_STEP = 3;
function grassGrid() {
  const { x: x0, y: y0, w, d } = W.BOUNDS, nx = Math.ceil(w / GRASS_STEP) + 1, ny = Math.ceil(d / GRASS_STEP) + 1;
  const heights = new Int16Array(nx * ny), mask = new Uint8Array(nx * ny), colour = new Uint8Array(nx * ny * 3);
  const built = taken.filter((t) => !t.soft);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * GRASS_STEP, y = y0 + j * GRASS_STEP, n = j * nx + i;
    const f = W.reach(x, y);
    if (f > 0.985) continue;
    const z = groundZ(x, y, f);
    heights[n] = Math.round(z * 10);
    const slope = Math.hypot(groundZ(x + 2, y) - groundZ(x - 2, y), groundZ(x, y + 2) - groundZ(x, y - 2)) / 4;
    colour.set(groundColour(x, y, z, slope).map((v) => Math.round(v * 255)), n * 3);
    const grassy = W.seaShare(x, y) === 0 && reservoir(x, y) > 1.1 && river(x, y).d > 3.5 && pondGap(x, y) > 3 && slope < 0.55 && z < TOP + W.ROCK_LINE - 2 && !onFloor(x, y, 2) &&
      pathGap(x, y) > W.PATH_WIDTH / 2 + 1.5 && built.every((t) => Math.hypot(t.x - x, t.y - y) > t.r * 0.85);
    mask[n] = grassy ? 255 : 0;
  }
  return { x0, y0, step: GRASS_STEP, nx, ny, heights, mask, colour };
}

export function scene() {
  const r1 = (p) => p.map((v) => Math.round(v * 100) / 100);
  return {
    tile: W.BOUNDS, depth: DEPTH, seaLevel: WATER,
    prims, protos, instances, rotors, cars, steam, smoke, spray, lines,
    roads: Object.fromEntries(Object.entries(PATHS).map(([n, l]) => [n, l.map(([x, y]) => r1([x, y, pathZ(x, y) + 0.3]))])),
    roadWidth: Object.fromEntries(Object.keys(PATHS).map((n) => [n, W.PATH_WIDTH])),
    tall, bore, vapour, carScale: CAR,
    grass: grassGrid(),
  };
}
