// The homepage's isometric world in a clean, flat-shaded illustration style:
// the rounded-square island of the GB power system, its faces in three flat
// tones of their material under one light, low-poly faceted mountains, soft
// cast shadows, and a cut-away edge showing the strata and the sea's basin.
// Every solid claims its footprint; the build refuses anything placed inside
// another thing, on a road or in the water, on a slope it cannot stand on, or
// under a power line, and lists what failed.
//
// Metres from the island's centre: x east (screen right and down), y south
// (screen left and down), z up. The viewer is to the south-east.
// Run: node figures/world/build.mjs      writes figures/world/world.svg and preview.html
//      --force                           write it even if the audit finds problems
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as W from "../island/layout.mjs";
import { camera, scene, registry, mat, mix, darker, tone, circle, rectAt, SHADOW, normalOf } from "./flat.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes("--force");
const WIDTH = 2000, HEIGHT = 1500;
const TOP = W.TOP, WATER = W.WATER, DEPTH = 46;

// ── Noise and helpers ───────────────────────────────────────────────────────
const hash = (x, y, s = 0) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x, y, s = 0) => { let t = 0, a = 0.5, n = 0; for (let o = 0; o < 4; o++) { t += a * noise(x, y, s + o * 31); n += a; x *= 2.03; y *= 2.03; a *= 0.5; } return (t / n - 0.5) * 2; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const R = W.seeded(4242);
function catmull(points, step = 3) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)], n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < n; s++) { const t = s / n, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  out.push(points[points.length - 1]);
  return out;
}
const distToLine = (line, x, y) => { let best = Infinity, at = 0, s = 0, total = 0; for (let i = 0; i < line.length - 1; i++) total += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]); for (let i = 0; i < line.length - 1; i++) { const [ax, ay] = line[i], [bx, by] = line[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, l = Math.sqrt(l2), u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), d = Math.hypot(x - ax - u * dx, y - ay - u * dy); if (d < best) { best = d; at = (s + u * l) / total; } s += l; } return { d: best, t: at }; };

// ── The plan ────────────────────────────────────────────────────────────────
// The old island's layout, with what this world needs moved: the west pond
// clear of the town, the factory inland of the bay, the shore substation on
// dry land, the hydro powerhouse beside the river, and lines that end on
// substation gantries rather than on pylons standing in them.
const PONDS = [{ x: -264, y: 26, r: 17, k: 0.7 }, W.PONDS[1]];
const FACTORY = { x: 134, y: 100 };
const SUBSTATIONS = { a: [-98, -204], aEast: [150, -210], b: [-262, 198], shore: [184, -86] };
const NUCLEAR = { towers: [[200, -196], [240, -150]], reactor: [152, -150], hall: W.NUCLEAR.hall };
const WIND = [[-236, -50], [-236, -250], [-150, -266], [-250, -108]];
const LINES = {
  nuclear: [["sub", "aEast"], [112, -226], [62, -224]],
  hydro: [[-104, -150], [-100, -176], ["sub", "a"]],
  wind: [[-274, -60], [-280, 4], [-276, 70], [-268, 136], ["sub", "b"]],
  offshore: [["sub", "shore"], [140, -92]],
  link: [[-96, 52], [-58, 38], [-30, -34]],
};
const PATHS = { ...W.PATHS, harbour: [[104, -96], [140, -66], [180, -52], [194, -32]], works: [[-124, 150], [-40, 164], [44, 174], [112, 172], [134, 128]] };
delete PATHS.power;
// the dam stands at the reservoir's outlet; the river runs from its foot
const DAM = { x: -172, y: -160 };
const RIVER_POINTS = [[-160, -146], ...W.RIVER_POINTS];
const RIVER = catmull(RIVER_POINTS, 3);
const riverAt = (x, y) => { const { d, t } = distToLine(RIVER, x, y); return { d: d - W.riverWidth(t) / 2, t }; };
// roads stop where they meet a city's streets or the nuclear fence
const FENCED = [W.CITY_A, W.CITY_B].map((C) => ({ x0: C.x - (C.cols * C.pitch) / 2 - 8, x1: C.x + (C.cols * C.pitch) / 2 + 8, y0: C.y - (C.rows * C.pitch) / 2 - 8, y1: C.y + (C.rows * C.pitch) / 2 + 8 })).concat([{ x0: 134, x1: 264, y0: -226, y1: -98 }]);
const inside = (x, y) => FENCED.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
const ROADS = {};
for (const [n, p] of Object.entries(PATHS)) { let run = [], k = 0; for (const q of catmull(p, 3)) { if (inside(...q)) { if (run.length > 2) ROADS[`${n}${k++}`] = run; run = []; } else run.push(q); } if (run.length > 2) ROADS[`${n}${k}`] = run; }
const ROAD_W = 12;
const roadGap = (x, y) => Math.min(...Object.values(ROADS).map((l) => distToLine(l, x, y).d)) - ROAD_W / 2;
const reservoirE = (x, y) => { const r = W.RESERVOIR, a = Math.atan2((y - r.y) / r.ry, (x - r.x) / r.rx); return Math.hypot((x - r.x) / r.rx, (y - r.y) / r.ry) / W.lobed(a, r.k); };
const pondGap = (x, y) => Math.min(...PONDS.map((p) => Math.hypot(x - p.x, y - p.y) - p.r * W.lobed(Math.atan2(y - p.y, x - p.x), p.k)));
const inSea = (x, y) => W.seaShare(x, y) > 0.5;
const onLand = (x, y, margin = 0) => W.reach(x, y) < 1 - margin / 300 && !inSea(x, y);
// flat pads for things that stand on the highland
const PADS = [
  { x: -98, y: -204, r: 20, s: 22 },     // the hydro line's substation
  { x: -104, y: -112, r: 16, s: 18 },    // the dam's powerhouse
];
// the knoll by the nuclear hall is gone (the hall stands there); the north-east and south-west peaks step back to the corners
const MOUNTAINS = W.MOUNTAINS.filter((m) => !(m.x === 236 && m.y === -104)).map((m) => (m.x === 262 && m.y === -262 ? { x: 274, y: -278, r: 64, h: 58 } : m.x === -270 && m.y === 250 ? { x: -278, y: 264, r: 46, h: 32 } : m));
function relief(x, y) {
  const H = W.HIGHLAND, q = Math.hypot(x - H.x, y - H.y) / H.r;
  let z = q < 1 ? H.h * (1 - q * q) ** 2 : 0;
  for (const m of MOUNTAINS) { const d = Math.hypot(x - m.x, y - m.y) / m.r; if (d < 1) z += m.h * Math.pow(1 - d, 1.35) * (1 + 0.32 * fbm(x / 26, y / 26, 7) * (1 - d)); }
  // the river's valley through the highland, below the dam
  const r = riverAt(x, y);
  z *= 0.45 + 0.55 * smooth(2, 40, r.d);   // a shallow valley, not a gorge
  // at the two side corners the edge is seen side-on, so a slice through high ground would show its
  // back: there it falls away to the edge instead (the back range and the cut front keep their height)
  const side = 1 - smooth(0.3, 0.75, Math.abs(Math.cos(W.bearing(x, y) - Math.PI / 4)));
  z *= 1 - side * (1 - smooth(0.99, 0.84, W.reach(x, y)));
  // the cities and the nuclear site stand on level ground
  for (const f of FENCED) { const dx = Math.max(f.x0 - x, 0, x - f.x1), dy = Math.max(f.y0 - y, 0, y - f.y1); z *= smooth(0, 14, Math.hypot(dx, dy)); }
  return z;
}
function heightAt(x, y) {
  let z = TOP + relief(x, y);
  // the reservoir: a bowl below its level, ringed by its banks
  const e = reservoirE(x, y);
  if (e < 1.5) z = lerp(z, W.RESERVOIR.level - 8 * Math.max(0, 1 - e), smooth(1.5, 1.0, e));
  for (const p of PADS) { const d = Math.hypot(x - p.x, y - p.y); if (d < p.r + p.s) { p.z ??= TOP + relief(p.x, p.y); z = lerp(z, p.z, 1 - smooth(p.r, p.r + p.s, d)); } }
  return z;
}
PADS.forEach((p) => { p.z = TOP + relief(p.x, p.y); });

// ── Camera and materials ────────────────────────────────────────────────────
const ext = W.HALF + 6;
const cam = camera([[-ext, -ext, -DEPTH], [ext, -ext, -DEPTH], [-ext, ext, -DEPTH], [ext, ext, -DEPTH], [-262, -262, TOP + 95], [ext, -ext, 0], [-ext, ext, 0]], WIDTH, HEIGHT, { pad: 30 });
const S = scene(cam);
const REG = registry();
const { at, depth } = cam;
const M = {
  grass: mat("#86bd45", { top: "#96cb52", right: "#6e9e38" }), grassDark: mat("#6fa63c", { top: "#7fb544", right: "#5a8a31" }),
  rock: mat("#a9a3a0", { top: "#c7c2bf", right: "#86807e" }), rockDark: mat("#8e8783", { top: "#aaa4a0", right: "#6f6966" }), snow: mat("#e9eef2", { top: "#ffffff", right: "#c9d3db" }),
  sand: mat("#e1c486", { top: "#ecd59e", right: "#c9aa6c" }),
  asphalt: mat("#47454b", { top: "#4f4d54" }), paving: mat("#d4cec7", { top: "#e2ddd7" }), gravel: mat("#c9c0b1", { top: "#d8d1c4" }),
  white: mat("#ecebea", { top: "#fbfaf9", right: "#cdcac5" }), cream: mat("#efe7d8", { top: "#faf5ea", right: "#d3c7b2" }),
  concrete: mat("#d6d2cd", { top: "#e8e5e1", right: "#b7b2ad" }), darkWall: mat("#4b4547", { top: "#978d8b", right: "#38333a" }),
  brick: mat("#c4704f", { top: "#d98f71", right: "#a3583c" }), terracotta: mat("#d98a58", { top: "#e9a77e", right: "#b8703f" }),
  sandWall: mat("#e6d3ad", { top: "#f2e5c8", right: "#c9b48b" }), slateRoof: mat("#5d6168", { top: "#7a7f86", right: "#4a4e55" }),
  redRoof: mat("#c8553d", { top: "#d9715a", right: "#a8432e" }), roofGrey: mat("#a39b98", { top: "#b6afac" }),
  roofKit: mat("#e3e0dc", { top: "#f6f4f1" }),
  glassTeal: mat("#5fbdb1", { top: "#86d3c9", right: "#4aa69a" }), glassBlue: mat("#4f72b8", { top: "#7896cf", right: "#3e5d9c" }), glassSky: mat("#8fc6e6", { top: "#b4dcf2", right: "#6ea8cc" }),
  tower: mat("#dcd0b6", { top: "#efe6d2", right: "#bfae8c" }), towerRim: mat("#6e6559", { top: "#8c8274" }),
  steel: mat("#9aa1a8", { top: "#c2c8cd" }), darkSteel: mat("#5c6268", { top: "#7d848a" }),
  red: mat("#d24a3c", { top: "#e2675a" }), orange: mat("#f08a2c", { top: "#f6a75a" }), yellow: mat("#f2c230", { top: "#f7d660" }),
  pv: mat("#2e4f8f", { top: "#3d63ad", right: "#243f73" }), transformer: mat("#a7aaa3", { top: "#c8cbc4", right: "#8a8d86" }),
  water: { left: "#4cb3e6", top: "#5ec2ef", right: "#3a9fd2" }, wood: mat("#a07a52", { top: "#b8916a" }),
  trunk: "#7a5a3a",
  cars: ["#e94f3d", "#f2c230", "#3f7fd0", "#ffffff", "#8a9299", "#2f3338", "#f08a2c"].map((c) => mat(c, { top: mix(c, "#ffffff", 0.25) })),
};
const shadows = [];
const shadowOf = (ring, h, z = TOP) => { const pts = [...ring, ...ring.map(([x, y]) => [x + SHADOW[0] * h, y + SHADOW[1] * h])]; shadows.push(hullOf(pts).map(([x, y]) => [x, y, z + 0.08])); };
function hullOf(points) { const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); }

// ── Placement: a thing claims its footprint and must meet every rule ────────
const problems = REG.problems;
function check(name, ring, { road = true, water = true, edge = 0.95, flat = 0, river = true } = {}) {
  for (const [x, y] of ring) {
    if (edge && W.reach(x, y) > edge) { problems.push(`${name} is too near the island's edge`); break; }
    if (water && (inSea(x, y) || reservoirE(x, y) < 1.08 || pondGap(x, y) < 2)) { problems.push(`${name} is in the water`); break; }
    if (river && !inSea(x, y) && riverAt(x, y).d < 3) { problems.push(`${name} is in the river`); break; }
    if (road && roadGap(x, y) < 1.5) { problems.push(`${name} is on a road`); break; }
  }
  if (flat) { const hs = [...ring, ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0])].map(([x, y]) => heightAt(x, y)); if (Math.max(...hs) - Math.min(...hs) > flat) problems.push(`${name} stands on a slope (${(Math.max(...hs) - Math.min(...hs)).toFixed(1)} m)`); }
}
const place = (name, ring, z0, z1, opts = {}) => { check(name, ring, opts); REG.claim(name, ring, { z0, z1, group: opts.group, clear: opts.clear ?? 1 }); };
// for scattering: is this spot free of everything and every rule?
function free(ring, { z0 = 0, z1 = 30, clear = 1.5, road = 2, river = 4, slope = 99, edge = 0.94 } = {}) {
  for (const [x, y] of ring) {
    if (W.reach(x, y) > edge || inSea(x, y) || reservoirE(x, y) < 1.15 || pondGap(x, y) < 3) return false;
    if (riverAt(x, y).d < river || roadGap(x, y) < road) return false;
  }
  if (slope < 99) { const hs = ring.map(([x, y]) => heightAt(x, y)); if (Math.max(...hs) - Math.min(...hs) > slope) return false; }
  return REG.fits(ring, { z0, z1, clear });
}

// ── Detail builders ─────────────────────────────────────────────────────────
const P = S.path;
// windows in bands on the two faces the viewer sees (+y, screen left; +x, screen right)
function windowBands(x, y, w, d, z0, z1, glass, { floor = 4, sill = 1.4, pitch = 3.2, inset = 1.2, frame } = {}) {
  let s = "";
  for (let z = z0 + floor * 0.55; z + sill < z1 - 0.8; z += floor) {
    s += P([[x + inset, y + d + 0.05, z], [x + w - inset, y + d + 0.05, z], [x + w - inset, y + d + 0.05, z + sill], [x + inset, y + d + 0.05, z + sill]], glass.left, 0.3);
    s += P([[x + w + 0.05, y + inset, z], [x + w + 0.05, y + d - inset, z], [x + w + 0.05, y + d - inset, z + sill], [x + w + 0.05, y + inset, z + sill]], glass.right, 0.3);
    if (frame) {
      for (let u = x + inset + pitch; u < x + w - inset - 0.5; u += pitch) s += P([[u - 0.2, y + d + 0.07, z], [u + 0.2, y + d + 0.07, z], [u + 0.2, y + d + 0.07, z + sill], [u - 0.2, y + d + 0.07, z + sill]], frame.left, 0);
      for (let v = y + inset + pitch; v < y + d - inset - 0.5; v += pitch) s += P([[x + w + 0.07, v - 0.2, z], [x + w + 0.07, v + 0.2, z], [x + w + 0.07, v + 0.2, z + sill], [x + w + 0.07, v - 0.2, z + sill]], frame.right, 0);
    }
  }
  return s;
}
// a rooftop air-handling unit with two fans
const hvacSvg = (x, y, z, w = 3, d = 2) => [0.28, 0.72].map((f) => P(circle(x + w * f, y + d / 2, Math.min(w, d) * 0.32, 12).map(([a, b]) => [a, b, z + 0.02]), "#9a958f", 0)).join("");
function hvac(x, y, z, w = 3, d = 2, h = 1.2) { S.box(x, y, w, d, z, h, M.roofKit, { extra: hvacSvg(x, y, z + h, w, d) }); }
// a building: walls, window bands, a parapet, rooftop plant; claims its footprint
function building(name, x, y, w, d, h, wall, glass, { group, roof = M.roofGrey, kit = true, frame, floor = 4, base = TOP, shadow = true } = {}) {
  const ring = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  place(name, ring, base, base + h + 3, { group, flat: 1.2 });
  if (shadow) shadowOf(ring, h, base);
  S.box(x, y, w, d, base, h, wall, { extra: windowBands(x, y, w, d, base, base + h, glass, { floor, frame }) });
  S.box(x - 0.3, y - 0.3, w + 0.6, d + 0.6, base + h, 0.8, roof);
  if (kit && w > 9 && d > 9) {
    const n = Math.max(1, Math.floor(w / 10)), m2 = Math.max(1, Math.floor(d / 10));
    for (let i = 0; i < n; i++) for (let j = 0; j < m2; j++) if ((i + j) % 2 === 0) hvac(x + 2 + i * ((w - 5) / n), y + 2 + j * ((d - 4) / m2), base + h + 0.8);
  }
}
// a house: walls with two windows and a door on the near faces, a gabled roof
function house(x, y, w, d, wall, roof, along = "x") {
  const ring = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]], h = 5;
  place("house", ring, TOP, TOP + h + 4, { flat: 1 });
  shadowOf(ring, h + 2);
  const win = (u0, v, face) => face === "y" ? P([[u0, y + d + 0.05, TOP + 2.3], [u0 + 1.4, y + d + 0.05, TOP + 2.3], [u0 + 1.4, y + d + 0.05, TOP + 3.7], [u0, y + d + 0.05, TOP + 3.7]], M.glassSky.left, 0) : P([[x + w + 0.05, v, TOP + 2.3], [x + w + 0.05, v + 1.4, TOP + 2.3], [x + w + 0.05, v + 1.4, TOP + 3.7], [x + w + 0.05, v, TOP + 3.7]], M.glassSky.right, 0);
  S.box(x, y, w, d, TOP, h, wall, { extra: win(x + 1.2, 0, "y") + win(x + w - 2.6, 0, "y") + win(0, y + 1.5, "x") + P([[x + w / 2 - 0.6, y + d + 0.06, TOP], [x + w / 2 + 0.6, y + d + 0.06, TOP], [x + w / 2 + 0.6, y + d + 0.06, TOP + 2.4], [x + w / 2 - 0.6, y + d + 0.06, TOP + 2.4]], darker(wall.left, 0.6), 0) });
  S.gable(x - 0.5, y - 0.5, w + 1, d + 1, TOP + h, 3.4, roof, along);
}
// trees: a round broadleaf in two greens, or a conifer of stacked cones on the highland
function tree(x, y, s = 1, kind = "round") {
  const z = heightAt(x, y), r = (kind === "round" ? 3.6 : 2.6) * s, hc = (kind === "round" ? 6.5 : 4) * s;
  place("tree", circle(x, y, r * 0.6, 8), z, z + hc + r, { road: false, clear: 0.2 });
  if (Math.abs(z - TOP) < 0.3) shadows.push(circle(x + SHADOW[0] * hc, y + SHADOW[1] * hc, r * 0.85, 14).map(([a, b]) => [a, b, TOP + 0.08]));
  if (kind === "cone") {
    S.turned(x, y, [[z, 0.4 * s], [z + 1.6 * s, 0.4 * s], [z + 1.6 * s, r], [z + 5 * s, r * 0.55], [z + 5 * s, r * 0.8], [z + 8.5 * s, r * 0.3], [z + 8.5 * s, r * 0.5], [z + 11 * s, 0]], M.grassDark, { segs: 10, top: "none", bands: [[z, z + 1.6 * s, mat("#7a5a3a")]] });
    return;
  }
  const c = at([x, y, z + hc]), b = at([x, y, z]), Rr = (at([x + r, y - r, z])[0] - at([x, y, z])[0]) / Math.SQRT2 * 1.3;
  S.strokes(`<path d="M${b[0].toFixed(1)} ${b[1].toFixed(1)}L${c[0].toFixed(1)} ${(c[1] + Rr * 0.4).toFixed(1)}" stroke="${M.trunk}" stroke-width="${Math.max(1, Rr * 0.22).toFixed(1)}" stroke-linecap="round"/>` +
    `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${Rr.toFixed(1)}" fill="#5c9c33"/>` +
    `<path d="M${(c[0] - Rr).toFixed(1)} ${c[1].toFixed(1)}A${Rr.toFixed(1)} ${Rr.toFixed(1)} 0 0 1 ${(c[0] + Rr * 0.2).toFixed(1)} ${(c[1] - Rr * 0.98).toFixed(1)}A${(Rr * 0.9).toFixed(1)} ${(Rr * 0.9).toFixed(1)} 0 0 0 ${(c[0] - Rr).toFixed(1)} ${c[1].toFixed(1)}Z" fill="#7fc24b"/>`,
    [[x - r, y - r, z], [x + r, y + r, z + hc + r]]);
}
// a boulder: a low-poly lump of a few faces
function boulder(x, y, s) {
  const z = heightAt(x, y) - 0.3 * s, n = 7, rnd = W.seeded(Math.round(x * 13 + y * 7)), base = [], ring = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd() * 0.4, r = s * (0.8 + rnd() * 0.4); base.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]); ring.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  const apex = [x + (rnd() - 0.5) * s * 0.4, y + (rnd() - 0.5) * s * 0.4, z + s * (1 + rnd() * 0.5)], mid = base.map(([a, b]) => [x + (a - x) * 0.7, y + (b - y) * 0.7, z + s * (0.55 + rnd() * 0.25)]);
  const faces = [base];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([base[i], base[j], mid[j], mid[i]], [mid[i], mid[j], apex]); }
  if (!REG.fits(ring, { z0: z, z1: z + 2 * s, clear: 0.3 })) return false;
  REG.claim("rock", ring, { z0: z, z1: z + 2 * s, clear: 0.3 });
  S.solid(faces, M.rock);
  return true;
}
// a lattice pylon with three pairs of cross-arms
function pylon(x, y, rot, H = 30) {
  const z = heightAt(x, y), half = (h) => 2.8 - (h / H) * 2, lv = [0, 6, 12, 18, 23, H], legs = [[1, 1], [1, -1], [-1, -1], [-1, 1]], seg = [];
  const T = (u, v, h) => [x + u * Math.cos(rot) - v * Math.sin(rot), y + u * Math.sin(rot) + v * Math.cos(rot), z + h];
  for (const [u, v] of legs) seg.push(lv.map((h) => T(u * half(h), v * half(h), h)));
  for (let i = 1; i < lv.length; i++) for (let f = 0; f < 4; f++) { const [au, av] = legs[f], [bu, bv] = legs[(f + 1) % 4], h = lv[i], h0 = lv[i - 1]; seg.push([T(au * half(h), av * half(h), h), T(bu * half(h), bv * half(h), h)], [T(au * half(h0), av * half(h0), h0), T(bu * half(h), bv * half(h), h)]); }
  const arms = [[18, 6], [23, 5.2], [27.5, 4]], tips = [];
  for (const [h, w] of arms) for (const s of [-1, 1]) { seg.push([T(0, s * half(h), h), T(0, s * w, h), T(0, s * w, h - 1.8)], [T(0, s * half(h), h + 1.3), T(0, s * w, h)]); tips.push(T(0, s * w, h - 1.8)); }
  place("pylon", rectAt(x, y, 6, 6, rot), z, z + H, { road: false, clear: 0.5, group: "pylon" });
  if (Math.abs(z - TOP) < 0.3) shadowOf(rectAt(x, y, 4, 4, rot), H * 0.6);
  S.strokes(seg.map((s) => S.line(s, "#4a4f55", 0.75)).join(""), [T(-3, -6, 0), T(3, 6, H)]);
  return tips;
}
const wire = (a, b, sag = 0.035) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); return S.line(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - d * sag * 4 * t * (1 - t)]; }), "#3c4045", 0.5); };
// a fence round a ring of points
function fence(pts, h = 2.2) {
  let svg = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 3));
    for (let s = 0; s < n; s++) { const p = [ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n], q = [ax + ((bx - ax) * (s + 1)) / n, ay + ((by - ay) * (s + 1)) / n]; svg += S.line([[p[0], p[1], TOP], [p[0], p[1], TOP + h]], "#a9adb1", 0.8) + S.line([[p[0], p[1], TOP + h], [q[0], q[1], TOP + h]], "#a9adb1", 0.6); }
  }
  return svg;
}
// a car, turned to follow its road
function car(x, y, rot, colour, { bus = false } = {}) {
  const L = bus ? 11 : 4.6, Wd = bus ? 2.6 : 2.0, h = bus ? 3 : 1.1, z = heightAt(x, y) + 0.12;
  S.prism(rectAt(x, y, L, Wd, rot), z, h, colour);
  if (!bus) S.prism(rectAt(x - Math.cos(rot) * 0.2, y - Math.sin(rot) * 0.2, 2.3, Wd - 0.3, rot), z + h, 0.75, mat("#bfe0ea", { top: colour.top, right: "#93b8c4" }));
  else S.prism(rectAt(x, y, L - 0.4, Wd + 0.02, rot), z + 1.6, 0.9, mat("#7fc6d8", { top: colour.top }));
}

// ── The ground: the cut faces, the sea, the land, water and roads ───────────
const NT = 480;
const edgePts = Array.from({ length: NT }, (_, i) => { const t = (i / NT) * Math.PI * 2; return { t, p: W.edgeAt(t) }; });
const STRATA = [["grass", 1.4, "#76ac3d"], ["topsoil", 3, "#6d4f3a"], ["subsoil", 6, "#9c7652"], ["sand", 9, "#dcbb7e"], ["mud", 9, "#b48a5c"], ["lime", 8, "#d2cab8"], ["granite", 99, "#8e8a99"]];
{
  // the cut: strata down the visible faces, the sea's water band where the bay meets the edge
  const faces = [];
  for (let i = 0; i < NT; i++) {
    const a = edgePts[i], b = edgePts[(i + 1) % NT], dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], l = Math.hypot(dx, dy), n = [dy / l, -dx / l, 0];
    if (n[0] * cam.view[0] + n[1] * cam.view[1] <= 0) continue;
    const col = (p, t) => {
      const [x, y] = [p[0] * 0.999, p[1] * 0.999], wet = inSea(x, y), floor = wet ? WATER - W.basinDepth(x, y) : heightAt(x, y);
      return { wet, floor, wave: 2.5 * Math.sin(t * 7) + 1.5 * fbm(t * 9, 1, 3) };
    };
    const ca = col(a.p, a.t), cb = col(b.p, b.t);
    // the layers as depths below each column's top, with the beds heaving gently
    const levels = (c) => {
      const out = [c.wet ? WATER : c.floor];
      if (c.wet) { out.push(c.floor, c.floor - 1, c.floor - 3.5); }   // as many levels as a dry column: water, silt, sand, then the beds
      else { out.push(c.floor - 1.4, c.floor - 4.4, c.floor - 10.4); }
      for (const base of [-4, -14, -26]) out.push(Math.min(out[out.length - 1] - 1.5, base + c.wave + (c.wet ? -3 : Math.max(0, (c.floor - TOP) * 0.3))));
      out.push(-DEPTH);
      return out;
    };
    const la = levels(ca), lb = levels(cb);
    for (let k = 0; k < la.length - 1; k++) {
      let colour;
      if (ca.wet && cb.wet) colour = k === 0 ? null : ["#c9b48b", "#dcbb7e", "#b48a5c", "#d2cab8", "#a49a8c", "#8e8a99"][k - 1] ?? "#8e8a99";
      else colour = [STRATA[0][2], STRATA[1][2], STRATA[2][2], STRATA[3][2], STRATA[4][2], STRATA[5][2], STRATA[6][2]][k];
      const quad = [[a.p[0], a.p[1], la[k]], [b.p[0], b.p[1], lb[k]], [b.p[0], b.p[1], lb[k + 1]], [a.p[0], a.p[1], la[k + 1]]];
      if (ca.wet && cb.wet && k === 0) {
        // the water's cut: three bands, deeper blue with depth
        const top0 = WATER, f0 = Math.min(la[1], lb[1]);
        for (const [z0, z1, c] of [[top0, top0 - 3, "#4cb3e6"], [top0 - 3, top0 - 10, "#3297cf"], [top0 - 10, f0 - 20, "#2179b4"]]) {
          const q = [[a.p[0], a.p[1], Math.max(z1, la[1])], [b.p[0], b.p[1], Math.max(z1, lb[1])], [b.p[0], b.p[1], Math.min(z0, WATER)], [a.p[0], a.p[1], Math.min(z0, WATER)]];
          if (q[3][2] > q[0][2] || q[2][2] > q[1][2]) faces.push(P(q, tone(mat(c), n), 0.6));
        }
        continue;
      }
      if (!colour) continue;
      faces.push(P(quad, tone(mat(colour), n), 0.6));
    }
  }
  S.ground.push(faces.join(""));
}
// the shoreline: where the land meets the bay along each bearing in the sea's sector
const shore = [];
for (let i = 0; i <= 160; i++) {
  const t = W.SEA.from - 0.06 + ((W.SEA.to - W.SEA.from + 0.12) * i) / 160;
  let lo = 0.3, hi = 1.0;
  for (let n = 0; n < 32; n++) { const m = (lo + hi) / 2, [x, y] = W.edgeAt(t, m); if (inSea(x, y)) hi = m; else lo = m; }
  if (hi < 0.999) shore.push({ t, p: W.edgeAt(t, lo) });
}
{
  // the sea: from the shoreline out to the edge
  const seaRing = [...shore.map((s) => [...s.p, WATER]), ...[...shore].reverse().map((s) => [...W.edgeAt(s.t), WATER])];
  S.ground.push(P(seaRing, M.water.top, 0.6));
  // the beach and the low cliff from the land down to the water, on the faces turned to the viewer
  let beach = "";
  for (let i = 0; i < shore.length - 1; i++) {
    const a = shore[i].p, b = shore[i + 1].p, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, n = [-dy / l, dx / l, 0];
    if (n[0] * cam.view[0] + n[1] * cam.view[1] > 0) beach += P([[a[0], a[1], TOP], [b[0], b[1], TOP], [b[0], b[1], WATER], [a[0], a[1], WATER]], tone(M.sand, n), 0.6);
  }
  // foam: two broken lines a little way out
  let foam = "";
  for (const off of [3, 8]) for (let i = 0; i < shore.length - 1; i += 1) { if (i % 6 === 5) continue; const pa = W.edgeAt(shore[i].t, Math.min(0.998, W.reach(...shore[i].p) + off / 300)), pb = W.edgeAt(shore[i + 1].t, Math.min(0.998, W.reach(...shore[i + 1].p) + off / 300)); foam += S.line([[...pa, WATER + 0.05], [...pb, WATER + 0.05]], "#ffffff", off === 3 ? 1.1 : 0.7, ' stroke-opacity=".85"'); }
  S.ground.push(beach + foam);
}
{
  // the land's flat top: the outline round the island except across the bay, where it follows the shoreline
  const ring = [];
  for (const e of edgePts) { const [x, y] = e.p; if (!inSea(x * 0.999, y * 0.999)) ring.push([x, y, TOP]); else if (ring.length && ring[ring.length - 1] !== "SHORE") ring.push("SHORE"); }
  const idx = ring.indexOf("SHORE"), landRing = ring.slice(0, idx).concat(shore.map((s) => [...s.p, TOP])).concat(ring.slice(idx + 1));
  const clean = landRing.filter((p) => p !== "SHORE");
  S.ground.push(P(clean, M.grass.top, 0.6));
  // the grass's texture: faint mowing stripes would be noise; a few darker meadow patches instead
  for (let i = 0; i < 16; i++) { const t = R() * Math.PI * 2, f = 0.3 + R() * 0.55, [x, y] = W.edgeAt(t, f); if (!onLand(x, y, 20) || relief(x, y) > 0.3) continue; S.ground.push(P(circle(x, y, 18 + R() * 20, 18).map(([a, b]) => [a, b, TOP + 0.02]), "#8fc54c", 0)); }
}

// ── Relief: faceted terrain wherever the ground rises off the plain ─────────
const STEP = 7;
{
  const jitter = (i, j) => [(hash(i, j, 1) - 0.5) * STEP * 0.5, (hash(i, j, 2) - 0.5) * STEP * 0.5];
  const vert = (i, j) => {
    let x = i * STEP, y = j * STEP;
    const [jx, jy] = jitter(i, j); x += jx; y += jy;
    if (W.reach(x, y) >= 1) { const [ex, ey] = W.edgeAt(W.bearing(x, y)); x = ex; y = ey; }
    return [x, y, heightAt(x, y)];
  };
  const material = (tri) => {
    const z = Math.max(...tri.map((p) => p[2])), n = normalOf(tri), slope = Math.sqrt(1 - Math.min(1, Math.abs(n[2])) ** 2) / Math.max(0.05, Math.abs(n[2]));
    if (z > TOP + 66) return M.snow;
    if (z > TOP + W.ROCK_LINE + 4 * fbm(tri[0][0] / 30, tri[0][1] / 30, 9) || (slope > 0.9 && z > TOP + 16)) return z > TOP + 52 ? M.rockDark : M.rock;
    return z > TOP + 18 ? M.grassDark : M.grass;
  };
  const lim = Math.ceil((W.HALF + 4) / STEP);
  for (let i = -lim; i < lim; i++) for (let j = -lim; j < lim; j++) {
    const cx = (i + 0.5) * STEP, cy = (j + 0.5) * STEP;
    if (W.reach(cx, cy) > 1.06) continue;
    const q = [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)];
    if (q.some(([x, y]) => inSea(x * 0.999, y * 0.999))) continue;
    if (Math.max(...q.map((p) => p[2])) < TOP + 0.25) continue;
    for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
      // under the reservoir: the water hides it
      if (tri.every(([x, y, z]) => z < W.RESERVOIR.level + 0.2 && reservoirE(x, y) < 1.3)) continue;
      S.facet(tri, material(tri));
    }
  }
  // the reservoir's surface, its shore foam
  const r = W.RESERVOIR, lake = Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2, l = W.lobed(a, r.k); return [r.x + Math.cos(a) * r.rx * l, r.y + Math.sin(a) * r.ry * l, r.level]; });
  S.decal(P(lake, M.water.top, 0.6) + S.line([...lake.map(([x, y, z]) => [r.x + (x - r.x) * 0.93, r.y + (y - r.y) * 0.93, z + 0.05]), [r.x + (lake[0][0] - r.x) * 0.93, r.y + (lake[0][1] - r.y) * 0.93, r.level + 0.05]], "#ffffff", 0.7, ' stroke-opacity=".7" stroke-dasharray="6 5"'), lake);
}

// ── Water and roads on the plain, and their draped parts on the highland ────
function ribbon(line, width, fill, lift = 0.05, edge = null) {
  const sides = line.map((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [[p[0] - (dy / l) * width / 2, p[1] + (dx / l) * width / 2], [p[0] + (dy / l) * width / 2, p[1] - (dx / l) * width / 2]]; });
  for (let i = 0; i < line.length - 1; i++) {
    const quad = [sides[i][0], sides[i][1], sides[i + 1][1], sides[i + 1][0]].map(([x, y]) => [x, y, heightAt(x, y) + lift]);
    const flat = quad.every((p) => Math.abs(p[2] - TOP - lift) < 0.05);
    if (flat) S.ground.push(P(quad, fill, 0.6)); else S.decal(P(quad, fill, 0.6), quad);
  }
}
// ponds with a sandy rim
for (const p of PONDS) {
  const ring = (k) => Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2, l = W.lobed(a, p.k); return [p.x + Math.cos(a) * (p.r * l + k), p.y + Math.sin(a) * (p.r * l + k), TOP + 0.04]; });
  S.ground.push(P(ring(3), M.sand.top, 0.6) + P(ring(0), M.water.top, 0.6) + S.line([...ring(-2.5), ring(-2.5)[0]], "#ffffff", 0.6, ' stroke-opacity=".7" stroke-dasharray="5 4"'));
}
// the river: sandy banks, then the water
{
  const banks = [], water = [];
  for (let i = 0; i < RIVER.length; i++) { const t = i / (RIVER.length - 1); banks.push(W.riverWidth(t) + 6); water.push(W.riverWidth(t)); }
  const strip = (widths, fill, lift) => {
    const sides = RIVER.map((p, i) => { const a = RIVER[Math.max(0, i - 1)], b = RIVER[Math.min(RIVER.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = widths[i] / 2; return [[p[0] - (dy / l) * w, p[1] + (dx / l) * w], [p[0] + (dy / l) * w, p[1] - (dx / l) * w]]; });
    for (let i = 0; i < RIVER.length - 1; i++) {
      const quad = [sides[i][0], sides[i][1], sides[i + 1][1], sides[i + 1][0]];
      if (quad.some(([x, y]) => inSea(x, y))) continue;
      const q = quad.map(([x, y]) => [x, y, heightAt(x, y) + lift]);
      if (q.every((p) => Math.abs(p[2] - TOP - lift) < 0.05)) S.ground.push(P(q, fill, 0.8)); else S.decal(P(q, fill, 0.8), q);
    }
  };
  strip(banks, M.sand.top, 0.03);
  strip(water, M.water.top, 0.06);
}
// roads: asphalt with a dashed centre line, kerbs of paving
for (const line of Object.values(ROADS)) {
  ribbon(line, ROAD_W + 2, M.paving.top, 0.07);
  ribbon(line, ROAD_W, M.asphalt.top, 0.09);
  let s = 0, dash = "";
  for (let i = 0; i < line.length - 1; i++) { const [ax, ay] = line[i], [bx, by] = line[i + 1], l = Math.hypot(bx - ax, by - ay); if (Math.floor(s / 6) % 2 === 0) dash += S.line([[ax, ay, heightAt(ax, ay) + 0.12], [bx, by, heightAt(bx, by) + 0.12]], "#ece8de", 0.7); s += l; }
  S.ground.push(dash);
}

// ── Cities: blocks of offices and flats on a grid of streets ────────────────
const STREET = 12;
function city(C, name, heightAt2) {
  const fw = C.cols * C.pitch, fd = C.rows * C.pitch, x0 = C.x - fw / 2, y0 = C.y - fd / 2;
  // the streets round and between the blocks
  const st = [];
  for (let i = 0; i <= C.cols; i++) st.push([[x0 + i * C.pitch - STREET / 2, y0 - STREET / 2], [x0 + i * C.pitch + STREET / 2, y0 - STREET / 2], [x0 + i * C.pitch + STREET / 2, y0 + fd + STREET / 2], [x0 + i * C.pitch - STREET / 2, y0 + fd + STREET / 2]]);
  for (let j = 0; j <= C.rows; j++) st.push([[x0 - STREET / 2, y0 + j * C.pitch - STREET / 2], [x0 + fw + STREET / 2, y0 + j * C.pitch - STREET / 2], [x0 + fw + STREET / 2, y0 + j * C.pitch + STREET / 2], [x0 - STREET / 2, y0 + j * C.pitch + STREET / 2]]);
  S.ground.push(P([[x0 - STREET / 2 - 2, y0 - STREET / 2 - 2, TOP + 0.05], [x0 + fw + STREET / 2 + 2, y0 - STREET / 2 - 2, TOP + 0.05], [x0 + fw + STREET / 2 + 2, y0 + fd + STREET / 2 + 2, TOP + 0.05], [x0 - STREET / 2 - 2, y0 + fd + STREET / 2 + 2, TOP + 0.05]], M.paving.top, 0.6));
  S.ground.push(st.map((r) => P(r.map(([x, y]) => [x, y, TOP + 0.08]), M.asphalt.top, 0.6)).join(""));
  // dashed lines down each street and zebra crossings at the junctions
  let marks = "";
  for (let i = 0; i <= C.cols; i++) for (let v = y0; v < y0 + fd; v += 7) if ((v - y0) % C.pitch > 10 && (v - y0) % C.pitch < C.pitch - 12) marks += S.line([[x0 + i * C.pitch, v, TOP + 0.1], [x0 + i * C.pitch, v + 3.2, TOP + 0.1]], "#ece8de", 0.7);
  for (let j = 0; j <= C.rows; j++) for (let u = x0; u < x0 + fw; u += 7) if ((u - x0) % C.pitch > 10 && (u - x0) % C.pitch < C.pitch - 12) marks += S.line([[u, y0 + j * C.pitch, TOP + 0.1], [u + 3.2, y0 + j * C.pitch, TOP + 0.1]], "#ece8de", 0.7);
  S.ground.push(marks);
  for (let i = 0; i < C.cols; i++) for (let j = 0; j < C.rows; j++) {
    const bx = x0 + i * C.pitch + STREET / 2 + 2, by = y0 + j * C.pitch + STREET / 2 + 2, L = C.pitch - STREET - 4;
    if (C.park && C.park[0] === i && C.park[1] === j) {
      S.ground.push(P([[bx, by, TOP + 0.1], [bx + L, by, TOP + 0.1], [bx + L, by + L, TOP + 0.1], [bx, by + L, TOP + 0.1]], M.grass.top, 0.6) + P(circle(bx + L * 0.55, by + L * 0.5, L * 0.18, 24).map(([a, b]) => [a, b, TOP + 0.14]), M.water.top, 0.4) +
        S.line([[bx + 2, by + L * 0.5, TOP + 0.12], [bx + L - 2, by + L * 0.5, TOP + 0.12]], M.sand.top, 2.2) + S.line([[bx + L * 0.5, by + 2, TOP + 0.12], [bx + L * 0.5, by + L - 2, TOP + 0.12]], M.sand.top, 2.2));
      continue;
    }
    const [h, style] = heightAt2(i, j), g = `${name}-${i}-${j}`;
    const pal = [[M.white, M.glassBlue, M.slateRoof], [M.cream, M.glassTeal, M.roofGrey], [M.sandWall, M.glassBlue, M.roofGrey], [M.brick, M.glassSky, M.slateRoof], [M.terracotta, M.glassTeal, M.roofGrey]];
    const [wall, glass, roof] = pal[(i * 2 + j * 3) % pal.length];
    if (style === "tower") {
      building(`${g} tower`, bx + L * 0.18, by + L * 0.18, L * 0.56, L * 0.56, h, wall, glass, { group: g, roof, frame: darker(wall.left, 0.9) === wall.left ? null : wall });
      building(`${g} podium`, bx, by + L * 0.78, L, L * 0.22, 6, M.concrete, M.glassTeal, { group: g, kit: false });
    } else {
      building(`${g} block A`, bx, by, L * 0.58, L * 0.62, h, wall, glass, { group: g, roof });
      building(`${g} block B`, bx + L * 0.66, by + L * 0.3, L * 0.34, L * 0.7, h * 0.6, pal[(i + j + 2) % pal.length][0], pal[(i + j + 2) % pal.length][1], { group: g });
    }
  }
  st.forEach((r, k2) => REG.claim(`${name} street`, r, { z0: TOP, z1: TOP + 0.2, clear: 0, group: "street" }));
}
city(W.CITY_A, "city", (i, j) => [Math.round(34 + (1 - j) * 22 + (i === 1 ? 26 : 0) + hash(i, j, 3) * 10), i === 1 || j === 0 ? "tower" : "mid"]);
city(W.CITY_B, "town", (i, j) => [Math.round(14 + hash(i, j, 8) * 10 + (i === 0 && j === 1 ? 10 : 0)), "mid"]);

// ── Nuclear: cooling towers, the reactor, the turbine hall, a fence ─────────
function coolingTower(cx, cy, H, rt, name) {
  const st = H * 0.8, c = H * 0.62, r = (z) => rt * 0.9 * Math.sqrt(1 + ((z - st) / c) ** 2), base = TOP;
  place(name, circle(cx, cy, r(3) + 1.5, 20), base, base + H, { flat: 1.5 });
  shadowOf(circle(cx, cy, r(0) * 0.9, 20), H * 0.85);
  const prof = Array.from({ length: 18 }, (_, i) => { const z = 3 + ((H - 3) * i) / 17; return [base + z, r(z)]; });
  // a ring of raking legs under the shell, then the shell
  const legs = Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return S.line([[cx + Math.cos(a + 0.06) * (r(3) + 0.8), cy + Math.sin(a + 0.06) * (r(3) + 0.8), base + 0.4], [cx + Math.cos(a) * r(3), cy + Math.sin(a) * r(3), base + 3.2]], "#8c8377", 1.2); }).join("");
  S.turned(cx, cy, [[base, r(3) + 1.6], [base + 0.5, r(3) + 1.6]], M.concrete, { segs: 48 });
  S.turned(cx, cy, prof, M.tower, { segs: 56, top: "open", bands: [[base + 3, base + 5, M.towerRim]], extra: legs });
}
{
  const N = NUCLEAR, fenceRing = [[136, -224], [262, -224], [262, -100], [136, -100]];
  S.ground.push(P(fenceRing.map(([x, y]) => [x, y, TOP + 0.06]), M.paving.top, 0.6));
  coolingTower(N.towers[0][0], N.towers[0][1], 68, 18, "cooling tower 1");
  coolingTower(N.towers[1][0], N.towers[1][1], 62, 16, "cooling tower 2");
  const [rx, ry] = N.reactor;
  place("reactor", circle(rx, ry, 15, 20), TOP, TOP + 36, { flat: 1 });
  shadowOf(circle(rx, ry, 14, 20), 30);
  S.turned(rx, ry, [[TOP, 15], [TOP + 20, 15], [TOP + 22, 14.2], [TOP + 26, 12.4], [TOP + 30, 9], [TOP + 33, 4.5], [TOP + 34.2, 0]], M.cream, { segs: 48, bands: [[TOP + 17, TOP + 19, M.red]] });
  const h = N.hall;
  building("turbine hall", h.x - h.w / 2, h.y - h.d / 2, h.w, h.d, 18, M.darkWall, M.glassTeal, { roof: M.roofGrey });
  building("control building", 138, -116, 22, 12, 9, M.white, M.glassBlue, { roof: M.orange, kit: false });
  S.strokes(fence([...fenceRing, fenceRing[0]]), fenceRing.map(([x, y]) => [x, y, TOP]).concat([[136, -238, TOP + 2.2]]));
}

// ── Hydro: the dam across the valley, the spillway, the powerhouse below ────
{
  const D = DAM, [ax, ay] = RIVER_POINTS[0], [bx, by] = RIVER_POINTS[1], ang = Math.atan2(by - ay, bx - ax);
  const across = [-Math.sin(ang), Math.cos(ang)], along = [Math.cos(ang), Math.sin(ang)];
  const half = 34, thick = 9, top = W.RESERVOIR.level + 3;
  const ring = [[D.x - across[0] * half - along[0] * thick / 2, D.y - across[1] * half - along[1] * thick / 2], [D.x + across[0] * half - along[0] * thick / 2, D.y + across[1] * half - along[1] * thick / 2], [D.x + across[0] * half + along[0] * thick / 2, D.y + across[1] * half + along[1] * thick / 2], [D.x - across[0] * half + along[0] * thick / 2, D.y - across[1] * half + along[1] * thick / 2]];
  const foot = Math.min(...ring.map(([x, y]) => heightAt(x, y))) - 1;
  place("dam", ring, foot, top, { road: false, river: false, water: false, edge: 0.95 });
  S.prism(ring, foot, top - foot, M.concrete);
  // the walkway on its crest with a railing, and the spillway's white water down its face
  const crest = ring.map(([x, y]) => [x, y]);
  S.decal(S.line([[D.x - across[0] * half + along[0] * 3.2, D.y - across[1] * half + along[1] * 3.2, top + 1], [D.x + across[0] * half + along[0] * 3.2, D.y + across[1] * half + along[1] * 3.2, top + 1]], "#9aa1a8", 0.8), crest.map(([x, y]) => [x, y, top + 1.1]));
  // the powerhouse on its pad below the dam, the penstocks down to it
  const ph = PADS[1];
  building("powerhouse", ph.x - 10, ph.y - 7, 20, 14, 10, M.white, M.glassBlue, { base: ph.z, roof: M.slateRoof, shadow: false });
}

// ── Wind on the highland rim; offshore in the bay ───────────────────────────
const WIND_DIR = Math.PI * 0.18;   // the rotors face the south-east breeze, three-quarters to the viewer
function turbine(x, y, { hub = 62, R: rad = 30, offshore = false, name = "wind turbine" } = {}) {
  const base = offshore ? WATER : heightAt(x, y);
  place(name, circle(x, y, 3.5, 12), base, base + hub + rad, { road: false, water: !offshore, river: true, edge: 0.98, clear: 4 });
  if (offshore) { S.turned(x, y, [[WATER - 2, 3.4], [WATER + 6, 3.4]], M.yellow, { segs: 20 }); S.turned(x, y, [[WATER + 6, 5.5], [WATER + 7, 5.5]], M.yellow, { segs: 20 }); }
  const z0 = offshore ? WATER + 7 : base;
  S.turned(x, y, [[z0, 2.6], [base + hub - 1, 1.5]], M.white, { segs: 16 });
  const d = [Math.cos(WIND_DIR), Math.sin(WIND_DIR)], hubPt = [x + d[0] * 3.2, y + d[1] * 3.2, base + hub];
  S.prism(rectAt(x - d[0] * 1.5, y - d[1] * 1.5, 9, 3.6, WIND_DIR), base + hub - 1.8, 3.6, M.white);
  // the rotor: three blades in the plane facing the wind, and the hub's nose
  const u = [-d[1], d[0], 0], w = [0, 0, 1], phase = hash(Math.round(x), Math.round(y), 5) * Math.PI * 2;
  let blades = "";
  const pts = [];
  for (let b = 0; b < 3; b++) {
    const a = phase + (b / 3) * Math.PI * 2, dir = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)], side = [u[0] * -Math.sin(a) + w[0] * Math.cos(a), u[1] * -Math.sin(a) + w[1] * Math.cos(a), -Math.sin(a) * u[2] + Math.cos(a) * w[2]];
    const P3 = (r, s) => [hubPt[0] + dir[0] * r + side[0] * s, hubPt[1] + dir[1] * r + side[1] * s, hubPt[2] + dir[2] * r + side[2] * s];
    const blade = [P3(1, -0.9), P3(rad * 0.25, -1.6), P3(rad, -0.3), P3(rad, 0.15), P3(rad * 0.25, 0.7), P3(1, 0.9)];
    blades += P(blade, b === 0 ? "#f4f5f6" : b === 1 ? "#e6e8ea" : "#d7dadd", 0.4);
    pts.push(...blade);
  }
  S.solid([[...[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; return [hubPt[0] + u[0] * Math.cos(a) * 1.6, hubPt[1] + u[1] * Math.cos(a) * 1.6, hubPt[2] + Math.sin(a) * 1.6]; })], [...[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; return [hubPt[0] + d[0] * 2 + u[0] * Math.cos(a) * 0.6, hubPt[1] + d[1] * 2 + u[1] * Math.cos(a) * 0.6, hubPt[2] + Math.sin(a) * 0.6]; })]].flatMap((ring, i, all) => i ? [ring, ...ring.map((p, k) => [all[0][k], all[0][(k + 1) % 6], ring[(k + 1) % 6], p])] : [ring]), M.white, { extra: blades });
  if (!offshore && Math.abs(base - TOP) < 0.3) shadowOf(circle(x, y, 2.5, 8), hub * 0.7);
}
for (const [x, y] of WIND) turbine(x, y);
for (const [x, y] of W.OFFSHORE) turbine(x, y, { offshore: true, hub: 56, R: 28, name: "offshore turbine" });

// ── Solar, battery, factory, data centre, jetty ─────────────────────────────
{
  const Sl = W.SOLAR, tilt = 0.5;
  for (let r = 0; r < Sl.rows; r++) for (let c = 0; c < Sl.cols; c++) {
    const x0 = Sl.x + c * (Sl.w + Sl.gap) - Sl.w / 2, y0 = Sl.y + r * (Sl.d + Sl.gap * 1.6) - Sl.d / 2;
    place("solar array", [[x0, y0], [x0 + Sl.w, y0], [x0 + Sl.w, y0 + Sl.d], [x0, y0 + Sl.d]], TOP, TOP + 4, { flat: 1, group: "solar" });
    // rows of panels across the array, each tilted toward the south
    for (let yy = y0 + 1.5; yy < y0 + Sl.d - 1; yy += 4.2) {
      const zf = TOP + 1, zb = TOP + 1 + 2.6 * Math.sin(tilt), yb = yy + 2.6 * Math.cos(tilt);
      const panel = [[[x0 + 1, yb, zb], [x0 + Sl.w - 1, yb, zb], [x0 + Sl.w - 1, yy + 2.6, zf], [x0 + 1, yy + 2.6, zf]], [[x0 + 1, yb, zb - 0.15], [x0 + Sl.w - 1, yb, zb - 0.15], [x0 + Sl.w - 1, yy + 2.6, zf - 0.15], [x0 + 1, yy + 2.6, zf - 0.15]]];
      const cells = Array.from({ length: Math.floor((Sl.w - 2) / 2.2) }, (_, k) => S.line([[x0 + 1 + (k + 1) * 2.2, yb, zb + 0.02], [x0 + 1 + (k + 1) * 2.2, yy + 2.6, zf + 0.02]], "#7d9ad0", 0.4)).join("");
      S.solid([panel[0], panel[1], [panel[0][0], panel[0][1], panel[1][1], panel[1][0]], [panel[0][2], panel[0][3], panel[1][3], panel[1][2]], [panel[0][1], panel[0][2], panel[1][2], panel[1][1]], [panel[0][3], panel[0][0], panel[1][0], panel[1][3]]], M.pv, { extra: cells });
      shadows.push([[x0 + 1, yb, TOP + 0.08], [x0 + Sl.w - 1, yb, TOP + 0.08], [x0 + Sl.w - 1 + SHADOW[0] * 1.5, yb + SHADOW[1] * 1.5 + 1, TOP + 0.08], [x0 + 1 + SHADOW[0] * 1.5, yb + SHADOW[1] * 1.5 + 1, TOP + 0.08]]);
    }
  }
  const Sx0 = Sl.x - Sl.w / 2 - 3, Sx1 = Sl.x + (Sl.cols - 1) * (Sl.w + Sl.gap) + Sl.w / 2 + 3, Sy0 = Sl.y - Sl.d / 2 - 3, Sy1 = Sl.y + (Sl.rows - 1) * (Sl.d + Sl.gap * 1.6) + Sl.d / 2 + 3;
  S.strokes(fence([[Sx0, Sy0], [Sx1, Sy0], [Sx1, Sy1], [Sx0, Sy1], [Sx0, Sy0]], 1.8), [[Sx0, Sy0, TOP], [Sx1, Sy1, TOP + 1.8]]);
}
{
  const B = W.BATTERY;
  for (let n = 0; n < B.n; n++) for (let row = 0; row < 2; row++) {
    const x = B.x + n * 8 - 10, y = B.y - 12 + row * 9, ring = [[x, y], [x + 6, y], [x + 6, y + 2.6 * 2.2], [x, y + 2.6 * 2.2]];
    place("battery container", ring, TOP, TOP + 3, { flat: 1, group: "battery" });
    shadowOf(ring, 2.9);
    S.box(x, y, 6, 2.6 * 2.2, TOP, 2.9, M.white, { extra: P([[x + 6.05, y + 1, TOP + 2.1], [x + 6.05, y + 4.6, TOP + 2.1], [x + 6.05, y + 4.6, TOP + 2.4], [x + 6.05, y + 1, TOP + 2.4]], "#3ee07f", 0) });
  }
}
{
  const { x, y } = FACTORY, w = 36, d = 26;
  place("factory", [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]], TOP, TOP + 12, { flat: 1, group: "factory" });
  shadowOf([[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]], 11);
  S.box(x - w / 2, y - d / 2, w, d, TOP, 8, M.brick, { extra: windowBands(x - w / 2, y - d / 2, w, d, TOP, TOP + 8, M.glassSky, { floor: 8 }) });
  for (let i = 0; i < 4; i++) S.gable(x - w / 2 + i * (w / 4), y - d / 2, w / 4, d, TOP + 8, 3.2, M.slateRoof, "y");
  const cx = x - w / 2 + 5, cy = y - d / 2 - 5;
  place("factory chimney", circle(cx, cy, 2.2, 10), TOP, TOP + 36, { flat: 1, group: "factory" });
  shadowOf(circle(cx, cy, 2, 10), 30);
  S.turned(cx, cy, [[TOP, 2.4], [TOP + 36, 1.8]], M.brick, { segs: 20, top: "open", bands: [[TOP + 28, TOP + 30, M.white], [TOP + 32, TOP + 34, M.white]] });
}
{
  const { x, y, w, d } = W.DATA_CENTRE;
  building("data centre", x - w / 2, y - d / 2, w, d, 12, M.white, M.glassSky, { kit: false, roof: M.roofKit });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) S.box(x - w / 2 + 3 + i * 7.5, y - d / 2 + 4 + j * 8, 5, 4, TOP + 12.8, 1.2, M.roofKit, { extra: P(circle(x - w / 2 + 5.5 + i * 7.5, y - d / 2 + 6 + j * 8, 1.4, 12).map(([a, b]) => [a, b, TOP + 14.02]), "#8a8580", 0) });
}
{
  const J = W.JETTY;
  // the jetty runs from the shore out over the water: find where the land ends along it
  let start = J.x; while (start < J.x + 60 && !inSea(start, J.y)) start += 0.5;
  const x0 = start - 6, x1 = start + J.length;
  S.box(x0, J.y - 4, x1 - x0, 8, WATER + 1.8, 0.6, M.wood);
  for (let u = x0 + 4; u < x1; u += 8) for (const s of [-1, 1]) S.turned(u, J.y + s * 3.4, [[WATER - 1, 0.45], [WATER + 1.8, 0.45]], M.wood, { segs: 8 });
  REG.claim("jetty", [[x0, J.y - 4], [x1, J.y - 4], [x1, J.y + 4], [x0, J.y + 4]], { z0: WATER, z1: WATER + 3, clear: 0 });
  const boat = (bx, by, ang, len, colour) => { S.prism(rectAt(bx, by, len, len * 0.36, ang), WATER - 0.4, 1.8, colour); S.prism(rectAt(bx - Math.cos(ang) * len * 0.12, by - Math.sin(ang) * len * 0.12, len * 0.35, len * 0.26, ang), WATER + 1.4, 1.8, M.white); };
  boat(x1 - 4, J.y + 9, 0, 14, M.red);
  boat(x1 + 18, J.y - 16, 0.6, 12, M.white);
}

// ── Geothermal at the front edge, its bore down the cut face ────────────────
{
  const t = W.GEOTHERMAL, [px, py] = W.edgeAt(t, 0.84), [wx, wy] = W.edgeAt(t, 0.94), [ex, ey] = W.edgeAt(t, 1);
  building("geothermal plant", px - 13, py - 8, 26, 16, 10, M.white, M.glassTeal, { roof: M.orange });
  for (const dx of [-6, 6]) { const cx = px + dx, cy = py - 16; place("geothermal cooler", circle(cx, cy, 5.5, 14), TOP, TOP + 12, { flat: 1, group: "geo" }); shadowOf(circle(cx, cy, 5, 14), 10); S.turned(cx, cy, [[TOP, 5.5], [TOP + 10, 4.6], [TOP + 12, 4.6]], M.concrete, { segs: 28, top: "open" }); }
  place("wellhead", rectAt(wx, wy, 6, 6), TOP, TOP + 14, { flat: 1, edge: 0.99, road: false });
  S.box(wx - 3, wy - 3, 6, 6, TOP, 0.8, M.yellow);
  S.strokes([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => S.line([[wx + u * 2.4, wy + v * 2.4, TOP + 0.8], [wx + u * 0.5, wy + v * 0.5, TOP + 14]], "#f08a2c", 1.1)).join("") + S.line([[wx - 1.8, wy - 1.8, TOP + 6], [wx + 1.8, wy - 1.8, TOP + 6], [wx + 1.8, wy + 1.8, TOP + 6], [wx - 1.8, wy + 1.8, TOP + 6], [wx - 1.8, wy - 1.8, TOP + 6]], "#f08a2c", 0.8), [[wx - 3, wy - 3, TOP], [wx + 3, wy + 3, TOP + 14]]);
  S.strokes(S.line([[wx, wy, TOP + 1.2], [px + 2, py + 8, TOP + 1.2]], "#c9473c", 1.4) + S.line([[wx + 1, wy, TOP + 1.2], [px + 4, py + 8, TOP + 1.2]], "#3f7fd0", 1.4), [[px, py, TOP], [wx + 1, wy, TOP + 1.4]]);
  // the bore down the cut face to a pocket of hot rock
  const out = [Math.cos(t) * 0.4, Math.sin(t) * 0.4];
  const lens = (rx, rz, colour, off) => P(Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2, w = 1 + 0.1 * Math.sin(3 * a + 1); return [ex + out[0] * off + Math.cos(t + Math.PI / 2) * Math.cos(a) * rx * w, ey + out[1] * off + Math.sin(t + Math.PI / 2) * Math.cos(a) * rx * w, -24 + Math.sin(a) * rz * w]; }), colour, 0);
  S.ground.push(S.line([[ex + out[0], ey + out[1], TOP - 1], [ex + out[0], ey + out[1], -18]], "#4a413c", 2.2) + lens(44, 12, "#c2461f", 1) + lens(34, 8.5, "#f08a2c", 1.1) + lens(20, 4.5, "#ffd27a", 1.2));
}

// ── Substations and the lines between them ──────────────────────────────────
function substation(x, y, name, base = TOP) {
  const ring = [[x - 14, y - 11], [x + 14, y - 11], [x + 14, y + 11], [x - 14, y + 11]];
  place(name, ring, base, base + 10, { flat: 1.2, group: name, road: true });
  const ground = ring.map(([a, b]) => [a, b, base + 0.06]);
  if (Math.abs(base - TOP) < 0.3) S.ground.push(P(ground, M.gravel.top, 0.6)); else S.decal(P(ground, M.gravel.top, 0.6), ground);
  for (const dx of [-7, 0, 7]) {
    S.box(x + dx - 2.4, y - 2, 4.8, 4, base, 3.6, M.transformer, { extra: Array.from({ length: 4 }, (_, j) => P([[x + dx - 1.8 + j * 1.1, y + 2.06, base + 0.5], [x + dx - 1.4 + j * 1.1, y + 2.06, base + 0.5], [x + dx - 1.4 + j * 1.1, y + 2.06, base + 3.1], [x + dx - 1.8 + j * 1.1, y + 2.06, base + 3.1]], "#8a8d86", 0)).join("") });
    S.strokes([-1.4, 0, 1.4].map((u) => S.line([[x + dx + u, y, base + 3.6], [x + dx + u, y, base + 5.6]], "#9a6a4a", 1.6)).join(""), [[x + dx - 1.5, y - 0.5, base + 3.6], [x + dx + 1.5, y + 0.5, base + 5.6]]);
  }
  S.strokes(fence([...ring, ring[0]].map(([a, b]) => [a, b])), ring.map(([a, b]) => [a, b, base]).concat([[x, y, base + 2.2]]));
  if (Math.abs(base - TOP) < 0.3) shadowOf([[x - 10, y - 3], [x + 10, y - 3], [x + 10, y + 3], [x - 10, y + 3]], 4);
}
const SUBS = Object.fromEntries(Object.entries(SUBSTATIONS).map(([k2, [x, y]]) => [k2, { x, y }]));
for (const [k2, s] of Object.entries(SUBS)) { s.z = heightAt(s.x, s.y); substation(s.x, s.y, `substation ${k2}`, s.z); }
// the gantry at the back of a substation: two portal frames carrying a beam, six landing points for a line
function gantry(sb) {
  const { x, y, z } = sb, ys = y - 8, posts = [x - 11, x + 11];
  S.strokes(posts.map((px) => S.line([[px, ys, z], [px, ys, z + 13]], "#6f757a", 1.2)).join("") + S.line([[x - 11, ys, z + 13], [x + 11, ys, z + 13]], "#6f757a", 1.1) + S.line([[x - 11, ys, z + 10], [x + 11, ys, z + 10]], "#6f757a", 0.9), [[x - 11, ys - 0.5, z], [x + 11, ys + 0.5, z + 13]]);
  return [-6, 6].flatMap((dx) => [13, 13, 10].map((h, i) => [x + dx + (i - 1) * 2.4, ys, z + h - 0.4]));
}
const wires = [];
for (const [name, raw] of Object.entries(LINES)) {
  let prev = null;
  const pts = raw.map((p) => (p[0] === "sub" ? [SUBS[p[1]].x, SUBS[p[1]].y - 8, p[1]] : p));
  pts.forEach(([x, y, sub], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const tips = sub ? gantry(SUBS[sub]) : pylon(x, y, rot);
    if (prev) for (let c = 0; c < tips.length; c++) wires.push([prev[c], tips[c]]);
    prev = tips;
  });
}
// the gap between a segment and a convex ring on the ground (0 if they cross)
function segToRing([a, b], ring) {
  const inRing = ([x, y]) => ring.every((p, i) => { const q = ring[(i + 1) % ring.length]; return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) >= 0; }) || ring.every((p, i) => { const q = ring[(i + 1) % ring.length]; return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) <= 0; });
  if (inRing(a) || inRing(b)) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; best = Math.min(best, distToLine([a, b], ...p).d, distToLine([p, q], a[0], a[1]).d, distToLine([p, q], b[0], b[1]).d); const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]), d3 = (q[0] - p[0]) * (a[1] - p[1]) - (q[1] - p[1]) * (a[0] - p[0]), d4 = (q[0] - p[0]) * (b[1] - p[1]) - (q[1] - p[1]) * (b[0] - p[0]); if (d1 * d2 < 0 && d3 * d4 < 0) return 0; }
  return best;
}
// wires must clear everything tall along their way
for (const [a, b] of wires) {
  const zMin = Math.min(a[2], b[2]) - 6;
  for (const t of REG.things) {
    if (t.group === "pylon" || t.name.startsWith("substation") || t.z1 < zMin) continue;
    if (segToRing([a, b], t.ring) < 3) { problems.push(`a power line passes through ${t.name}`); break; }
  }
}
// each span in short pieces, so a line behind a tower passes behind it
for (const [a, b] of wires) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(d / 10)), sag = 0.035;
  const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - d * sag * 4 * t * (1 - t)];
  for (let i = 0; i < n; i++) { const p = pt(i / n), q = pt((i + 1) / n); S.strokes(S.line([p, q], "#3c4045", 0.5), [p, q]); }
}

// ── Suburbs: houses in gardens ──────────────────────────────────────────────
for (const sb of W.SUBURBS) for (let y = sb.y - sb.d / 2 + 6; y <= sb.y + sb.d / 2 - 4; y += 15) for (let x = sb.x - sb.w / 2 + 6; x <= sb.x + sb.w / 2 - 6; x += 16) {
  const w = 9 + R() * 2, d = 8 + R() * 1.5, ring = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  if (!free(ring, { z1: TOP + 10, clear: 2.5, road: 3, river: 5, slope: 0.6 })) continue;
  const k = Math.floor(R() * 4);
  house(x, y, w, d, [M.white, M.cream, M.sandWall, M.brick][k], [M.redRoof, M.slateRoof, M.redRoof, M.slateRoof][k], R() < 0.5 ? "x" : "y");
}

// ── Trees, rocks, lamps and traffic: only where there is room ───────────────
{
  // conifers on the highland, broadleaves on the plain, a line along the roads
  let n = 0;
  for (let tries = 0; tries < 9000 && n < 260; tries++) {
    const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.93, [x, y] = W.edgeAt(t, f), z = heightAt(x, y), up = z > TOP + 3;
    if (z > TOP + W.ROCK_LINE - 4) continue;
    const s = 0.8 + R() * 0.5, ring = circle(x, y, (up ? 2.6 : 3.6) * s * 0.9, 8);
    if (!free(ring, { z0: z, z1: z + 12, clear: 0.6, road: 2.5, river: 4, slope: up ? 3 : 0.4 })) continue;
    tree(x, y, s, up ? "cone" : "round"); n++;
  }
  let m = 0;
  for (let tries = 0; tries < 6000 && m < 120; tries++) {
    const t = R() * Math.PI * 2, f = Math.sqrt(R()) * 0.97, [x, y] = W.edgeAt(t, f), z = heightAt(x, y);
    if (z < TOP + 20) continue;
    if (W.reach(x, y) > 0.97 || reservoirE(x, y) < 1.2 || riverAt(x, y).d < 3) continue;
    if (boulder(x, y, 1.5 + R() * 2.5)) m++;
  }
}
for (const [name, line] of Object.entries(ROADS)) {
  // a few cars on each road, keeping left
  const n = Math.max(1, Math.round(line.length / 45));
  for (let k = 0; k < n; k++) {
    const i = Math.floor(((k + 0.3 + R() * 0.4) / n) * (line.length - 2)), [ax, ay] = line[i], [bx, by] = line[i + 1], rot = Math.atan2(by - ay, bx - ax), side = R() < 0.5 ? 1 : -1;
    const x = ax - Math.sin(rot) * side * 2.6, y = ay + Math.cos(rot) * side * 2.6;
    if (riverAt(x, y).d < 4) continue;
    car(x, y, side > 0 ? rot : rot + Math.PI, M.cars[(k + name.length) % M.cars.length]);
  }
}
for (const C of [W.CITY_A, W.CITY_B]) {
  const x0 = C.x - (C.cols * C.pitch) / 2, y0 = C.y - (C.rows * C.pitch) / 2;
  for (let i = 0; i <= C.cols; i++) for (let k = 0; k < C.rows; k++) { const y = y0 + k * C.pitch + C.pitch * (0.3 + hash(i, k, 4) * 0.4); car(x0 + i * C.pitch + (hash(i, k, 6) < 0.5 ? -2.6 : 2.6), y, Math.PI / 2 * (hash(i, k, 6) < 0.5 ? 1 : -1), M.cars[(i + k * 3) % M.cars.length]); }
}

// ── Shadows under everything, then the page ─────────────────────────────────
S.ground.push(`<g fill="#1d2430" fill-opacity=".15">${shadows.map((s) => `<path d="${S.fmt(s)}"/>`).join("")}</g>`);
const uniq = [...new Set(problems)];
console.log(`${S.items.length} items · ${REG.things.length} footprints · ${uniq.length} problems`);
for (const p of uniq.slice(0, 60)) console.log("  " + p);
if (uniq.length && !FORCE) { console.error("the world has things placed into each other: fix them, or pass --force to look"); process.exit(1); }
const { body, cycles } = S.svg();
if (cycles) console.log(`painter's order: ${cycles} cycles broken by depth`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="An isometric island of the GB power system: mountains with a reservoir and a hydro dam, a river to a bay with offshore wind, two cities, a nuclear station, solar, batteries, a factory, a data centre, a geothermal plant at the cut edge, and the pylons joining them."><g>${body}</g></svg>`;
writeFileSync(join(HERE, "world.svg"), svg);
writeFileSync(join(HERE, "preview.html"), `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>World</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body>${svg}</body></html>`);
console.log(`world.svg ${(svg.length / 1024).toFixed(0)} KB`);
