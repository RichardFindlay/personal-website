// A style frame for the homepage's isometric world: one tile of a thermal
// power station drawn as a clean, flat-shaded isometric illustration. Every
// face takes one of its material's three tones (a bright top, a mid face to
// the left, a darker face to the right), with no gradients and no ink lines,
// and every solid casts a soft shadow to the right. Small true parts carry
// the detail: window bands, rooftop plant, banded stacks, transformers behind
// a fence, pylons and their wires, lamps, trees, cars on the road.
//
// Metres. x runs across the tile toward the road (screen right), y along it
// (screen left), z up. The near corner is (150, 240).
// Run: node figures/plant/build.mjs     writes figures/plant/plant.html and plant.svg
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../lib/anatomy/kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 1600, HEIGHT = 1100;
const TILE = { x0: 0, x1: 150, y0: 0, y1: 240 };
const SOIL = 12;   // the earth under the grass, shown on the cut faces

const P = k.fitProjection([[0, 0, -SOIL], [150, 0, -SOIL], [0, 240, -SOIL], [150, 240, -SOIL], [35, 50, 95], [150, 0, 0], [0, 240, 0]], WIDTH, HEIGHT, { pad: 40, azimuth: 45, elevation: 30 });
const at = (p) => k.iso(p, P);
const depth = (p) => k.depthOf(p, P);
const view = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];   // toward the viewer, on the floor

// ── Colour: each material is three flat tones ───────────────────────────────
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const darker = (c, f) => toHex(hex(c).map((v) => v * f));
// a material from its left face's colour: the top brighter, the right face darker
const mat = (left, { top, right } = {}) => ({ left, top: top ?? mix(left, "#ffffff", 0.32), right: right ?? darker(left, 0.78) });
const M = {
  grass: mat("#7fb640", { top: "#94c94e", right: "#6a9c35" }),
  soil: mat("#d8b578", { right: "#c09a5c" }), deep: mat("#b88d55", { right: "#a07a47" }),
  asphalt: mat("#3e3c41", { top: "#4c4a50" }), paving: mat("#cfc9c2", { top: "#dcd7d1" }), gravel: mat("#c9c0b1", { top: "#d6cfc2" }),
  concrete: mat("#d9d5d0", { top: "#ebe8e4" }), white: mat("#ecebea", { top: "#fbfaf9", right: "#cfccc8" }),
  hall: mat("#4a4446", { top: "#958b89", right: "#38333a" }), hallTrim: mat("#5b5456", { top: "#a39a98" }),
  roofKit: mat("#e3e0dc", { top: "#f7f5f2" }), roofKitDark: mat("#8f8784", { top: "#b7b0ad" }),
  tower: mat("#dcd0b6", { top: "#efe6d2", right: "#bfae8c" }), towerRim: mat("#6e6559", { top: "#8c8274" }),
  stackLight: mat("#ebe6dc", { top: "#f6f2ea" }), stackRed: mat("#d24a3c", { top: "#e2675a" }),
  tank: mat("#efe9df", { top: "#fbf8f2", right: "#d2c8b8" }), tankBand: mat("#d24a3c", { top: "#df6255" }),
  orange: mat("#f08a2c", { top: "#f6a75a" }), glassTeal: mat("#5fbdb1", { top: "#86d3c9", right: "#4aa69a" }), glassBlue: mat("#4f72b8", { top: "#7896cf", right: "#3e5d9c" }),
  steel: mat("#9aa1a8", { top: "#c2c8cd" }), darkSteel: mat("#5c6268", { top: "#7d848a" }),
  transformer: mat("#a7aaa3", { top: "#c8cbc4", right: "#8a8d86" }), bushing: mat("#9a6a4a"),
  water: mat("#4cb3e6", { top: "#5cc3f0" }), trunk: mat("#7a5a3a"),
  car: ["#e94f3d", "#f2c230", "#3f7fd0", "#ffffff", "#8a9299", "#2f3338"].map((c) => mat(c, { top: mix(c, "#ffffff", 0.25) })),
};

// ── The flat renderer: polygons on the kit's projection, painted back to front ──
const items = [];
const put = (key, svg) => items.push({ key, svg });
const fmt = (pts) => "M" + pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z";
// a face, with a hairline of its own colour so neighbours close without seams
const face = (pts, fill) => `<path d="${fmt(pts)}" fill="${fill}" stroke="${fill}" stroke-width=".6" stroke-linejoin="round"/>`;
// the tone for a face's outward normal: top, or a blend from the left face's tone to the right's
function tone(m, [nx, ny, nz]) {
  if (nz > 0.7) return m.top;
  const t = Math.atan2(ny, nx) / (Math.PI / 2);                  // 0 faces +x (screen right), 1 faces +y (screen left)
  const side = mix(m.right, m.left, Math.min(1, Math.max(0, t)));
  return nz > 0.05 ? mix(side, m.top, nz) : side;
}
const visible = ([nx, ny, nz]) => nx * view[0] * Math.cos(Math.PI / 6) + ny * view[1] * Math.cos(Math.PI / 6) + nz * Math.sin(Math.PI / 6) > 1e-6;

// a prism: a floor outline (clockwise from above, x right and y down the page) extruded from z0 up by h
function prism(ring, z0, h, m, { topFill, key, extra = "" } = {}) {
  const n = ring.length, faces = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n], l = Math.hypot(bx - ax, by - ay) || 1;
    const normal = [-(by - ay) / l, (bx - ax) / l, 0];   // outlines run clockwise seen from above
    if (!visible(normal)) continue;
    const quad = [[ax, ay, z0], [bx, by, z0], [bx, by, z0 + h], [ax, ay, z0 + h]];
    faces.push({ d: depth([(ax + bx) / 2, (ay + by) / 2, z0]), svg: face(quad, tone(m, normal)) });
  }
  faces.sort((a, b) => a.d - b.d);
  const top = face(ring.map(([x, y]) => [x, y, z0 + h]), topFill ?? m.top);
  const cx = ring.reduce((s, p) => s + p[0], 0) / n, cy = ring.reduce((s, p) => s + p[1], 0) / n;
  put(key ?? depth([cx, cy, z0 + h / 2]), faces.map((f) => f.svg).join("") + top + extra);
  return { ring, z0, h };
}
// x0y0 → x0y1 → x1y1 → x1y0: clockwise as seen from above
const box = (x, y, w, d, z0, h, m, opts) => prism([[x, y], [x, y + d], [x + w, y + d], [x + w, y]], z0, h, m, opts);
const circle = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => { const a = -(i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });

// a body of revolution standing up: [z, r] points; faces toned by their own slope; an optional top
function turned(cx, cy, profile0, m, { segs = 48, top = "cap", topFill, key, bands = [], seam = 0.25 } = {}) {
  // split long runs so bands of colour land where they belong
  const profile = [profile0[0]];
  const cuts = bands.flatMap(([a, b]) => [a, b]);
  for (let i = 1; i < profile0.length; i++) { const [za, ra] = profile0[i - 1], [zb, rb] = profile0[i]; for (const z of cuts.filter((z) => z > za + 1e-6 && z < zb - 1e-6).sort((p, q) => p - q)) profile.push([z, ra + ((rb - ra) * (z - za)) / (zb - za)]); profile.push([zb, rb]); }
  const quads = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [z0, r0] = profile[i], [z1, r1] = profile[i + 1];
    const slope = (r0 - r1) / ((z1 - z0) || 1e-6);                // outward tilt of the surface
    const band = bands.find(([a, b]) => (z0 + z1) / 2 >= a && (z0 + z1) / 2 <= b);
    const mm = band ? band[2] : m;
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
      const nz = slope / Math.hypot(1, slope), nh = 1 / Math.hypot(1, slope);
      const normal = [Math.cos(am) * nh, Math.sin(am) * nh, nz];
      if (!visible(normal)) continue;
      const q = [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z0], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, z0], [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, z1], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, z1]];
      const fill = tone(mm, normal);
      quads.push({ d: depth([cx + Math.cos(am) * (r0 + r1) / 2, cy + Math.sin(am) * (r0 + r1) / 2, (z0 + z1) / 2]), svg: `<path d="${fmt(q)}" fill="${fill}" stroke="${fill}" stroke-width="${seam}"/>` });
    }
  }
  quads.sort((a, b) => a.d - b.d);
  const [zt, rt] = profile[profile.length - 1];
  let cap = "";
  if (top === "cap" && rt > 0.01) cap = face(circle(cx, cy, rt, segs).map(([x, y]) => [x, y, zt]), topFill ?? m.top);
  if (top === "open") cap = face(circle(cx, cy, rt, segs).map(([x, y]) => [x, y, zt]), topFill ?? darker(m.left, 0.55)) + face(circle(cx, cy, rt * 0.93, segs).map(([x, y]) => [x, y, zt]), darker(m.left, 0.42));
  put(key ?? depth([cx, cy, (profile[0][0] + zt) / 2]), quads.map((q) => q.svg).join("") + cap);
}
// a line in space (for lattices, wires, rails)
const line = (pts, colour, w = 1) => `<path d="M${pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L")}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ── Shadows: each solid's outline swept along the light onto the ground ─────
const LIGHT = [0.62, -0.42];   // floor offset per metre of height: toward the screen's right
const shadows = [];
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const shadow = (ring, h, z0 = 0) => shadows.push(hull([...ring, ...ring.map(([x, y]) => [x + LIGHT[0] * (h + z0), y + LIGHT[1] * (h + z0)])]).map(([x, y]) => [x, y, 0.06]));
// most things: draw the solid and its shadow together
const block = (x, y, w, d, z0, h, m, opts) => { shadow([[x, y], [x, y + d], [x + w, y + d], [x + w, y]], h, z0); return box(x, y, w, d, z0, h, m, opts); };

// ── Detail helpers ──────────────────────────────────────────────────────────
// a band of windows along a wall facing +y (screen left) or +x (screen right)
function windowsY(x0, x1, y, z0, z1, m, { pitch = 3.2, gap = 0.5, mullion = true } = {}) {
  let s = face([[x0, y + 0.05, z0], [x1, y + 0.05, z0], [x1, y + 0.05, z1], [x0, y + 0.05, z1]], m.left);
  if (mullion) for (let x = x0 + pitch; x < x1 - 0.1; x += pitch) s += face([[x - gap / 2, y + 0.07, z0], [x + gap / 2, y + 0.07, z0], [x + gap / 2, y + 0.07, z1], [x - gap / 2, y + 0.07, z1]], darker(m.left, 0.75));
  return s;
}
function windowsX(y0, y1, x, z0, z1, m, { pitch = 3.2, gap = 0.5, mullion = true } = {}) {
  let s = face([[x + 0.05, y0, z0], [x + 0.05, y1, z0], [x + 0.05, y1, z1], [x + 0.05, y0, z1]], m.right);
  if (mullion) for (let y = y0 + pitch; y < y1 - 0.1; y += pitch) s += face([[x + 0.07, y - gap / 2, z0], [x + 0.07, y + gap / 2, z0], [x + 0.07, y + gap / 2, z1], [x + 0.07, y - gap / 2, z1]], darker(m.right, 0.75));
  return s;
}
// a rooftop air-handling unit: a box with two fan circles on top
function hvac(x, y, z, w = 3.2, d = 2.2, h = 1.4) {
  box(x, y, w, d, z, h, M.roofKit, { extra: [0.28, 0.72].map((f) => face(circle(x + w * f, y + d / 2, Math.min(w, d) * 0.3, 16).map(([a, b]) => [a, b, z + h + 0.02]), "#9a958f") + face(circle(x + w * f, y + d / 2, Math.min(w, d) * 0.12, 10).map(([a, b]) => [a, b, z + h + 0.03]), "#c9c4be")).join("") });
}
// a round tree: a trunk, a crown in two greens, its shadow on the grass
function tree(x, y, s = 1) {
  const r = 2.4 * s, zc = 4.2 * s;
  shadows.push(circle(x + LIGHT[0] * zc, y + LIGHT[1] * zc, r * 0.9, 16).map(([a, b]) => [a, b, 0.06]));
  const c = at([x, y, zc]), base = at([x, y, 0]), R = (at([x + r, y - r, zc])[0] - at([x, y, zc])[0]) / Math.SQRT1_2 * 0.72;
  put(depth([x, y, zc]), `<path d="M${base[0].toFixed(1)} ${base[1].toFixed(1)}L${c[0].toFixed(1)} ${(c[1] + R * 0.5).toFixed(1)}" stroke="${M.trunk.left}" stroke-width="${Math.max(1, R * 0.22).toFixed(1)}" stroke-linecap="round"/>` +
    `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${R.toFixed(1)}" fill="#5e9e33"/>` +
    `<path d="M${(c[0] - R).toFixed(1)} ${c[1].toFixed(1)}A${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${(c[0] + R * 0.2).toFixed(1)} ${(c[1] - R * 0.98).toFixed(1)}A${(R * 0.9).toFixed(1)} ${(R * 0.9).toFixed(1)} 0 0 0 ${(c[0] - R).toFixed(1)} ${c[1].toFixed(1)}Z" fill="#7cc04a"/>`);
}
// a street lamp: a pole, an arm, a head
function lamp(x, y, toward = -1) {
  const h = 8;
  put(depth([x, y, h / 2]), line([[x, y, 0], [x, y, h], [x + toward * 1.6, y, h + 0.4]], "#6f7479", 1.4) + face([[x + toward * 1.2, y - 0.3, h + 0.3], [x + toward * 2.2, y - 0.3, h + 0.3], [x + toward * 2.2, y + 0.3, h + 0.3], [x + toward * 1.2, y + 0.3, h + 0.3]], "#e9eaeb"));
}
// a car or a bus on the road, heading along y
function car(x, y, colour, dir = 1, { bus = false } = {}) {
  const L = bus ? 11 : 4.4, W = bus ? 2.5 : 1.9, H = bus ? 3.0 : 1.0;
  const y0 = y - L / 2;
  shadows.push([[x, y0], [x, y0 + L], [x + W, y0 + L], [x + W, y0]].map(([a, b]) => [a + LIGHT[0] * 0.6, b + LIGHT[1] * 0.6, 0.07]));
  box(x, y0, W, L, 0.3, H, colour, { extra: bus ? windowsX(y0 + 0.8, y0 + L - 0.8, x + W, 0.3 + H * 0.5, 0.3 + H * 0.85, M.glassTeal, { pitch: 1.6, gap: 0.25 }) + windowsY(x + 0.2, x + W - 0.2, y0 + L, 0.3 + H * 0.5, 0.3 + H * 0.85, M.glassTeal, { mullion: false }) : "" });
  if (!bus) box(x + 0.2, y0 + (dir > 0 ? 1.0 : 1.4), W - 0.4, 2.0, 0.3 + H, 0.7, mat("#cfe6ec", { top: colour.top, right: "#9fbfc8" }), { key: depth([x + W / 2, y, 0.3 + H + 0.35]) });
}
// a fence of thin posts and two rails between points on the ground
function fence(pts, { h = 2.2, step = 3, colour = "#b5b8bb" } = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 0; s < n; s++) {
      const p = [ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n], q = [ax + ((bx - ax) * (s + 1)) / n, ay + ((by - ay) * (s + 1)) / n];
      put(depth([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, h / 2]), line([[p[0], p[1], 0], [p[0], p[1], h]], colour, 1) + line([[p[0], p[1], h], [q[0], q[1], h]], colour, 0.8) + line([[p[0], p[1], h * 0.45], [q[0], q[1], h * 0.45]], colour, 0.6) +
        `<path d="${fmt([[p[0], p[1], 0.1], [q[0], q[1], 0.1], [q[0], q[1], h], [p[0], p[1], h]])}" fill="${colour}" fill-opacity=".12"/>`);
    }
  }
}
// a lattice pylon, its cross-arms along x
function pylon(x, y, H = 34) {
  const half = (z) => 3.2 - (z / H) * 2.3, lv = [0, 7, 14, 21, 26, H], legs = [[1, 1], [1, -1], [-1, -1], [-1, 1]], seg = [];
  for (const [u, v] of legs) seg.push(lv.map((z) => [x + u * half(z), y + v * half(z), z]));
  for (let i = 1; i < lv.length; i++) for (let f = 0; f < 4; f++) {
    const [au, av] = legs[f], [bu, bv] = legs[(f + 1) % 4], z = lv[i], z0 = lv[i - 1];
    seg.push([[x + au * half(z), y + av * half(z), z], [x + bu * half(z), y + bv * half(z), z]], [[x + au * half(z0), y + av * half(z0), z0], [x + bu * half(z), y + bv * half(z), z]]);
  }
  const arms = [];
  for (const [z, w] of [[21, 7], [26, 6], [31, 4.6]]) for (const s of [-1, 1]) arms.push([[x, y + s * half(z), z], [x, y + s * w, z], [x, y + s * w, z - 2.2]], [[x, y + s * half(z), z + 1.5], [x, y + s * w, z]]);
  shadows.push(...[0, 1].map(() => null).filter(Boolean));
  shadows.push(hull([[x - 3, y - 3], [x + 3, y + 3], [x + 3, y - 3], [x - 3, y + 3], [x + LIGHT[0] * H, y + LIGHT[1] * H]]).map(([a, b]) => [a, b, 0.06]));
  put(depth([x, y, H / 2]), [...seg, ...arms].map((s) => line(s, "#4a4f55", 0.9)).join(""));
  return [21, 26, 31].flatMap((z) => [-1, 1].map((s) => [x, y + s * ({ 21: 7, 26: 6, 31: 4.6 })[z], z - 2.2]));
}
// a sagging wire between two points
const wire = (a, b, sag = 0.06) => { const pts = Array.from({ length: 13 }, (_, i) => { const t = i / 12, d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - d * sag * 4 * t * (1 - t)]; }); return line(pts, "#3c4045", 0.55); };
// a puff of steam: soft circles in white and pale grey
function steam(x, y, z, s = 1) {
  const c = at([x, y, z]), R = 26 * s, blobs = [[0, 0, 1], [-0.7, -0.4, 0.75], [0.7, -0.5, 0.8], [0.1, -0.9, 0.85], [-0.3, -1.5, 0.7], [0.5, -1.6, 0.6], [0.1, -2.2, 0.5]];
  put(1e8 + z, blobs.map(([dx, dy, r]) => `<circle cx="${(c[0] + dx * R).toFixed(1)}" cy="${(c[1] + dy * R).toFixed(1)}" r="${(r * R).toFixed(1)}" fill="#dfe3e6"/>`).join("") + blobs.map(([dx, dy, r]) => `<circle cx="${(c[0] + dx * R - r * R * 0.18).toFixed(1)}" cy="${(c[1] + dy * R - r * R * 0.18).toFixed(1)}" r="${(r * R * 0.82).toFixed(1)}" fill="#ffffff"/>`).join(""));
}

// ── The ground: grass over soil, cut on its two near faces ──────────────────
const T = TILE;
prism([[T.x0, T.y0], [T.x0, T.y1], [T.x1, T.y1], [T.x1, T.y0]], -SOIL, SOIL * 0.45, M.deep, { key: -3e9 });
prism([[T.x0, T.y0], [T.x0, T.y1], [T.x1, T.y1], [T.x1, T.y0]], -SOIL * 0.55, SOIL * 0.55 - 1.2, M.soil, { key: -3e9 + 1 });
prism([[T.x0, T.y0], [T.x0, T.y1], [T.x1, T.y1], [T.x1, T.y0]], -1.2, 1.2, M.grass, { key: -3e9 + 2 });
const ground = (ring, m, h = 0.08, key = 0) => prism(ring, 0, h, m, { key: -2e9 + key });
const groundRect = (x, y, w, d, m, h = 0.08, key = 0) => ground([[x, y], [x, y + d], [x + w, y + d], [x + w, y]], m, h, key);

// the road along the near-right edge: asphalt, kerbs, a dashed centre line
groundRect(126, 0, 18, 240, M.asphalt, 0.12, 1);
groundRect(124.5, 0, 1.5, 240, M.paving, 0.22, 2);
groundRect(144, 0, 1.2, 240, M.paving, 0.22, 2);
put(-2e9 + 3, Array.from({ length: 30 }, (_, i) => face([[134.8, i * 8 + 1, 0.14], [134.8, i * 8 + 5, 0.14], [135.2, i * 8 + 5, 0.14], [135.2, i * 8 + 1, 0.14]], "#e9e6df")).join(""));
// the works' yard, the paving by the buildings, a gravel substation, a car park
groundRect(8, 6, 112, 198, M.asphalt, 0.08, 4);
groundRect(54, 86, 50, 118, M.paving, 0.1, 5);
groundRect(8, 204, 58, 32, M.gravel, 0.1, 5);
groundRect(96, 8, 24, 62, M.asphalt, 0.1, 5);
put(-2e9 + 6, Array.from({ length: 8 }, (_, i) => line([[98, 44 + i * 3.2, 0.12], [104, 44 + i * 3.2, 0.12]], "#e9e6df", 0.8)).join("") + Array.from({ length: 8 }, (_, i) => line([[112, 44 + i * 3.2, 0.12], [118, 44 + i * 3.2, 0.12]], "#e9e6df", 0.8)).join(""));
// grass islands in the yard, and the settling ponds
groundRect(12, 150, 36, 46, M.grass, 0.12, 6);
for (const [x, y] of [[16, 154], [30, 154], [16, 172], [30, 172]]) groundRect(x, y, 12, 15, M.concrete, 0.6, 7), groundRect(x + 0.8, y + 0.8, 10.4, 13.4, M.water, 0.66, 8);
// the access road from the main road into the yard
groundRect(110, 100, 16, 14, M.asphalt, 0.1, 6);

// ── Cooling towers: hyperbolic shells on a ring of legs, steam at the top ───
function coolingTower(cx, cy, H = 72, rt = 15) {
  const st = H * 0.78, c = H * 0.42, r = (z) => rt * 0.86 * Math.sqrt(1 + ((z - st) / c) ** 2);
  // the legs: a ring of raking columns under the shell
  const legs = [];
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; legs.push({ a, d: depth([cx + Math.cos(a) * r(3), cy + Math.sin(a) * r(3), 2]) }); }
  shadow(circle(cx, cy, r(0), 24), H);
  turned(cx, cy, [[0, r(3) + 1.2], [0.6, r(3) + 1.2]], M.concrete, { key: depth([cx, cy, 0]) - 2 });
  const back = legs.filter((l) => l.d < depth([cx, cy, 2])), front = legs.filter((l) => l.d >= depth([cx, cy, 2]));
  const legSvg = (list) => list.map(({ a }) => line([[cx + Math.cos(a + 0.05) * (r(3) + 0.6), cy + Math.sin(a + 0.05) * (r(3) + 0.6), 0.6], [cx + Math.cos(a) * r(3), cy + Math.sin(a) * r(3), 3.2]], "#8c8377", 1.6)).join("");
  put(depth([cx, cy, 0]) - 1, legSvg(back));
  const prof = Array.from({ length: 22 }, (_, i) => { const z = 3 + ((H - 3) * i) / 21; return [z, r(z)]; });
  turned(cx, cy, prof, M.tower, { segs: 64, top: "open", topFill: "#c9bda5", bands: [[3, 5, M.towerRim]], key: depth([cx, cy, H / 2]) });
  put(depth([cx, cy, H / 2]) + 0.5, legSvg(front));
  // the shell's lift seams and a dark access door ring near the base
  put(depth([cx, cy, H / 2]) + 0.6, [0.3, 0.55].map((f) => { const z = 3 + (H - 3) * f; return line(Array.from({ length: 25 }, (_, i) => { const a = Math.PI * (-0.25 + (i / 24) * 1.5); return [cx + Math.cos(a) * r(z) * 1.002, cy + Math.sin(a) * r(z) * 1.002, z]; }).filter((p) => visible([p[0] - cx, p[1] - cy, 0])), "#cbbd9f", 0.7); }).join(""));
  steam(cx, cy, H + 2, 1.15);
}
coolingTower(34, 46, 74, 15);
coolingTower(40, 108, 66, 14);

// ── The turbine hall and boiler house ───────────────────────────────────────
{
  const x = 62, y = 112, w = 34, d = 58, h = 20;
  block(x, y, w, d, 0, h, M.hall, {
    extra: windowsY(x + 3, x + w - 3, y + d, 5, 8.5, M.glassTeal) + windowsY(x + 3, x + w - 3, y + d, 12, 15.5, M.glassTeal) +
      windowsX(y + 3, y + d - 3, x + w, 6, 16, M.glassTeal, { pitch: 3.6 }),
  });
  block(x - 0.6, y - 0.6, w + 1.2, d + 1.2, h, 0.8, M.hallTrim);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) hvac(x + 4 + i * 7, y + 5 + j * 7.4, h + 0.8);
  // stair towers at the ends, and a lower annex with a roller door
  block(x + w, y + 8, 6, 8, 0, h + 4, M.hall, { extra: windowsX(y + 9, y + 15, x + w + 6, 2, h + 2, M.glassTeal, { pitch: 99 }) });
  block(x + 8, y + d, 16, 10, 0, 10, M.hall, { extra: face([[x + 13, y + d + 10.06, 0.2], [x + 19, y + d + 10.06, 0.2], [x + 19, y + d + 10.06, 6], [x + 13, y + d + 10.06, 6]], "#7d7577") + windowsY(x + 9, x + 23, y + d + 10, 7, 9, M.glassTeal) });
  // the boiler house behind, taller, with its banded stacks
  const bx = 58, by = 84, bw = 30, bd = 26, bh = 34;
  block(bx, by, bw, bd, 0, bh, M.hall, { extra: windowsY(bx + 3, bx + bw - 3, by + bd, 26, 30, M.glassTeal) + windowsX(by + 3, by + bd - 3, bx + bw, 24, 31, M.glassTeal) });
  block(bx - 0.5, by - 0.5, bw + 1, bd + 1, bh, 0.8, M.hallTrim);
  block(bx + 6, by + 6, 18, 14, bh + 0.8, 4, M.hallTrim);
  for (const [sx, sy] of [[bx + 8, by + 4], [bx + 20, by + 4]]) {
    const H = 96, bands = [];
    for (let z = 58; z < H; z += 7) bands.push([z, z + 3.5, M.stackRed]);
    shadow(circle(sx, sy, 2.4, 16), H);
    turned(sx, sy, [[bh, 2.6], [H, 2.1]], M.stackLight, { segs: 32, top: "open", bands, key: depth([sx, sy, bh]) + 30 });
    turned(sx, sy, [[H - 12, 2.9], [H - 11.2, 2.9]], M.darkSteel, { segs: 32, key: depth([sx, sy, H - 12]) + 30 });
  }
  // a pipe bridge from the hall over the yard to the cooling towers
  block(48, 126, 14, 2.4, 10, 2.2, M.steel, { extra: Array.from({ length: 6 }, (_, i) => line([[48 + i * 2.6, 128.4, 10], [48 + i * 2.6 + 1.3, 128.4, 12.2]], "#7d848a", 0.6)).join("") });
  for (const px of [50, 56]) block(px, 126.4, 1, 1.6, 0, 10, M.darkSteel);
}

// ── Tanks: two big ones with red bands, a cluster of small white ones ───────
for (const [tx, ty] of [[100, 92], [100, 128]]) {
  const r = 7.5, h = 17;
  shadow(circle(tx, ty, r, 24), h + 2);
  turned(tx, ty, [[0, r], [h, r], [h + 1.2, r * 0.82], [h + 2, r * 0.45], [h + 2.3, 0]], M.tank, { segs: 56, bands: [[3.5, 4.6, M.tankBand], [12, 13.1, M.tankBand]] });
  // the access stair spiralling up the near side
  put(depth([tx, ty, h / 2]) + 0.4, line(Array.from({ length: 30 }, (_, i) => { const a = 0.3 + (i / 29) * 1.4; return [tx + Math.cos(a) * (r + 0.5), ty + Math.sin(a) * (r + 0.5), 0.5 + (i / 29) * (h - 0.5)]; }), "#9a6a4a", 1.1));
}
for (const [tx, ty] of [[18, 214], [27, 208], [27, 220]]) { shadow(circle(tx, ty, 3.6, 16), 9); turned(tx, ty, [[0, 3.6], [8, 3.6], [8.8, 2.6], [9.2, 0]], M.tank, { segs: 36 }); }

// ── The substation, the transformers, the line out over the pylons ──────────
{
  fence([[36, 206], [36, 236], [64, 236], [64, 206], [36, 206]]);
  const tops = [];
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 8, y = 213;
    block(x, y, 5, 4, 0, 4, M.transformer, { extra: Array.from({ length: 5 }, (_, j) => face([[x + 0.5 + j, y + 4.06, 0.6], [x + 0.8 + j, y + 4.06, 0.6], [x + 0.8 + j, y + 4.06, 3.4], [x + 0.5 + j, y + 4.06, 3.4]], "#8a8d86")).join("") });
    for (const dx of [1.2, 2.5, 3.8]) put(depth([x + dx, y + 2, 5]), line([[x + dx, y + 2, 4], [x + dx, y + 2, 6.2]], M.bushing.left, 2.2) + line([[x + dx, y + 2, 4.6], [x + dx, y + 2, 4.7]], "#c99a6f", 3));
    tops.push(...[1.2, 2.5, 3.8].map((dx) => [x + dx, y + 2, 6.2]));
  }
  // a gantry of steel posts and beams carrying the busbars
  for (const gx of [39, 61]) put(depth([gx, 228, 6]), line([[gx, 226, 0], [gx, 226, 12]], "#6f757a", 1.6) + line([[gx, 230, 0], [gx, 230, 12]], "#6f757a", 1.6) + line([[gx, 226, 12], [gx, 230, 12]], "#6f757a", 1.4));
  put(depth([50, 228, 12]), line([[39, 226, 12], [61, 226, 12]], "#6f757a", 1.4) + line([[39, 230, 12], [61, 230, 12]], "#6f757a", 1.4));
  const arms = pylon(80, 228, 34), arms2 = pylon(115, 224, 34);
  put(depth([90, 226, 25]), [0, 1, 2, 3, 4, 5].map((i) => wire([39 + i * 4, 228, 12], arms[i], 0.04)).join("") + arms.map((p, i) => wire(p, arms2[i])).join("") + arms2.map((p) => wire(p, [p[0] + 40, p[1] + 26, p[2] - 4])).join(""));
  put(depth([50, 220, 8]), tops.map((p, i) => wire(p, [39 + (i % 6) * 4, 228, 12], 0.02)).join(""));
}

// ── The office, its car park, the gatehouse ─────────────────────────────────
{
  const x = 98, y = 10, w = 20, d = 30;
  block(x, y, w, d, 0, 12, M.white, { extra: windowsX(y + 2, y + d - 2, x + w, 2.5, 5, M.glassBlue, { pitch: 2.4, gap: 0.3 }) + windowsX(y + 2, y + d - 2, x + w, 7, 9.5, M.glassBlue, { pitch: 2.4, gap: 0.3 }) + windowsY(x + 2, x + w - 2, y + d, 2.5, 9.5, M.glassBlue, { pitch: 2.4 }) });
  block(x - 0.3, y - 0.3, w + 0.6, d + 0.6, 12, 0.7, M.orange);
  block(x + 4, y + 4, 7, 5, 12.7, 2.4, M.roofKitDark);
  hvac(x + 12, y + 14, 12.7); hvac(x + 12, y + 20, 12.7);
  block(x + 2, y + d, 8, 4, 0, 4, M.orange, { extra: windowsY(x + 3, x + 9, y + d + 4, 0.4, 3.2, M.glassBlue, { pitch: 2 }) });
  const cols = [1, 2, 0, 4, 3, 5, 1, 3, 0, 2];
  cols.forEach((c, i) => { const side = i % 2, k2 = Math.floor(i / 2); car(side ? 112.5 : 99.5, 46 + k2 * 6.4 + (side ? 1.6 : 0), M.car[c], 1); });
  block(118, 104, 4, 5, 0, 3.2, M.white, { extra: windowsX(104.5, 108.5, 122, 1.2, 2.6, M.glassBlue, { mullion: false }) });
  put(depth([122, 112, 1.2]), line([[121, 110, 1.1], [127, 110, 1.1]], "#e94f3d", 1.6) + line([[123, 110, 1.1], [124, 110, 1.1]], "#ffffff", 1.6));
}

// ── Plant around the yard: a gas skid, a pipe rack, a sprinkle of trees ─────
for (let i = 0; i < 5; i++) block(70 + i * 5, 74, 3, 4, 0, 2.4, M.white, { extra: face([[70 + i * 5 + 3.06, 75, 0.5], [70 + i * 5 + 3.06, 77, 0.5], [70 + i * 5 + 3.06, 77, 1.8], [70 + i * 5 + 3.06, 75, 1.8]], M.orange.right) });
for (let y = 20; y < 76; y += 9) block(62, y, 1, 1, 0, 6, M.darkSteel);
put(depth([62, 48, 6]), line([[62.5, 20, 6.2], [62.5, 74, 6.2]], "#7d848a", 2.4) + line([[62.5, 20, 6.9], [62.5, 74, 6.9]], "#a7aeb4", 1.6));
const TREES = [];
for (let y = 6; y < 234; y += 9) TREES.push([147.5, y + 2, 0.9]);
for (let x = 10; x < 116; x += 11) TREES.push([x, 2.5, 0.85]);
for (let y = 10; y < 200; y += 12) TREES.push([3.5, y, 0.95]);
for (const [x, y] of [[14, 140], [24, 142], [44, 150], [44, 166], [44, 184], [70, 180], [76, 182], [102, 160], [110, 176], [92, 186], [102, 194], [84, 196]]) TREES.push([x, y, 1]);
TREES.forEach(([x, y, s]) => tree(x, y, s));
for (let y = 8; y < 236; y += 22) lamp(124.6, y, 1);

// ── Traffic on the road ─────────────────────────────────────────────────────
const LANE = [128.4, 137.4];
[[0, 18, 0], [1, 52, 2], [0, 84, 3], [1, 120, 1], [0, 150, 4], [1, 176, 0], [0, 208, 5], [1, 230, 3]].forEach(([l, y, c]) => car(LANE[l] + 1, y, M.car[c], l ? -1 : 1));
car(LANE[1] + 0.6, 92, M.car[1], -1, { bus: true });

// ── The page ────────────────────────────────────────────────────────────────
items.sort((a, b) => a.key - b.key);
const ground0 = items.filter((i) => i.key < -1e9), rest = items.filter((i) => i.key >= -1e9);
const shadowSvg = `<g fill="#1d2430" fill-opacity=".16">${shadows.map((s) => `<path d="${fmt(s)}"/>`).join("")}</g>`;
const body = ground0.map((i) => i.svg).join("") + shadowSvg + rest.map((i) => i.svg).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="An isometric illustration of a thermal power station: two cooling towers, a turbine hall with banded stacks, tanks, a substation and pylons, an office and car park, and a road with traffic."><g shape-rendering="geometricPrecision">${body}</g></svg>`;
writeFileSync(join(HERE, "plant.svg"), svg);
writeFileSync(join(HERE, "plant.html"), `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Power station</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto;max-width:1600px;margin:0 auto}</style></head><body>${svg}</body></html>`);
console.log(`plant.svg ${(svg.length / 1024).toFixed(0)} KB · ${items.length} items · ${shadows.length} shadows`);
