// The card for "Probabilistic Forecasting of Renewable Generation & Wholesale
// Prices with Quantile-Regression": a machined relief model of Great Britain and
// Ireland under the post's ERA5 input grid, with Atlantic depressions turning
// anticlockwise over it. Each half-hour step the grid reads the cloud cover at
// its 55 × 46 cell centres, the field the encoder sees.
// Run: node build.mjs            the card: staticfiles/image/thumbnails/cyclone/scene.svg + scene.js
//                                and preview.html beside this file
//      node build.mjs --at=<s>   the preview frozen at <s> seconds (for captures)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import * as M from "./model.mjs";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../staticfiles/image/thumbnails/cyclone");
const SCOPE = ".scene-cyclone";
const DATA = JSON.parse(readFileSync(join(HERE, "data.json"), "utf8"));
const arg = (name, fallback) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.slice(name.length + 3)) : fallback; };

// ── World and camera ─────────────────────────────────────────────────────────
// One world unit is 3 km. x runs east and y south, so the camera, which looks
// from +x +y, stands south-south-east of the islands: north points up the strip
// and to the right, the Atlantic lies to the left, and a low on its usual track
// from the south-west crosses the strip from left to right.
const U = 3;
const WIDTH = 1400, HEIGHT = 200;
const world = (lon, lat, z = 0) => { const [x, n] = M.km(lon, lat); return [x / U, -n / U, z]; };
const [DW, DN] = world(M.AREA.west, M.AREA.north), [DE, DS] = world(M.AREA.east, M.AREA.south);
const DOMAIN = { x: DW, y: DN, w: DE - DW, d: DS - DN };
const MARGIN = 13;
const PLINTH = { x: DW - MARGIN, y: DN - MARGIN, w: DOMAIN.w + 2 * MARGIN, d: DOMAIN.d + 2 * MARGIN, r: 5 };
const Z = { floor: -11, foot: -8.4, base: -7, land: 2.2, step: 1.3, grid: 9, cloud: 17 };
const TERRACES = [120, 300, 550];
// The plinth's east corner sits near the strip's right end and its south
// corner near the foot; its north corner (open Atlantic) may run off the top.
const VIEW = { scale: arg("scale", 0.8), azimuth: arg("az", 62), elevation: arg("el", 28), right: arg("right", 1392), foot: arg("foot", 197) };
const unit = { origin: [0, 0], scale: VIEW.scale, azimuth: VIEW.azimuth, elevation: VIEW.elevation };
const feet = k.boxCorners(PLINTH, Z.floor, Z.floor).map((p) => k.iso(p, unit));
const P = { ...unit, origin: [VIEW.right - Math.max(...feet.map((p) => p[0])), VIEW.foot - Math.max(...feet.map((p) => p[1]))] };
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const f1 = (v) => Math.round(v * 10) / 10;
const poly = (pts, closed = true) => pts.length ? "M" + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L") + (closed ? "Z" : "") : "";

// ── The chart table: the Atlantic as a graticule on the floor ───────────────
function floor() {
  const lines = [];
  const lon = (deg) => [world(deg, 30, Z.floor), world(deg, 72, Z.floor)];
  const lat = (deg) => [world(-60, deg, Z.floor), world(20, deg, Z.floor)];
  for (let d = -60; d <= 20; d += 2) lines.push(k.segment(...lon(d), P));
  for (let d = 30; d <= 72; d += 2) lines.push(k.segment(...lat(d), P));
  return `<g class="cy-graticule">${L(lines.join(""), { tone: "faint" })}</g>`;
}

// ── The plinth ───────────────────────────────────────────────────────────────
function plinth() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLINTH, Z.floor, -Z.floor, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLINTH, 16))) {
    out.push(S(k.cylinder(x, y, 7, Z.floor, 0.9, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.2, Z.floor + 0.9, Z.foot - Z.floor - 0.9, P, 28), { tone: "mid" }));
  }
  const seam = k.sideSeam(PLINTH, Z.base + 1.6, P, 6);
  out.push(S(k.slabOf(PLINTH, Z.base, -Z.base, P, 6, 1.2), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  // the sea inside the requested area, a darker inlay; its edge a groove
  out.push(`<path class="cy-sea" d="${k.onTop(k.ringOf({ ...DOMAIN, r: 0 }, 1), 0, P, true)}"/>`);
  out.push(L(k.planOutline({ ...DOMAIN, r: 0 }, 0, P, 1), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(PLINTH, 3.2), 0, P, 6), { tone: "faint" }));
  // rulers: a tick per grid column on the south margin, per row on the east
  const south = { x: DW, y: DS + 2.4, w: DOMAIN.w, d: 6.2, r: 0.8 };
  const east = { x: DE + 2.4, y: DN, w: 6.2, d: DOMAIN.d, r: 0.8 };
  out.push(S(k.slabOf(south, 0, 0.6, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf(east, 0, 0.6, P, 2), { tone: "lo", crease: "none" }));
  const minor = [], major = [];
  for (let j = 0; j <= M.COLS; j++) {
    const x = j === M.COLS ? DE : world(M.AREA.west + j * M.CELL, 0)[0];
    (j % 4 === 0 ? major : minor).push(k.lineOnTop([x, south.y], [x, south.y + (j % 4 === 0 ? 3.6 : 2)], 0.6, P));
  }
  for (let i = 0; i <= M.ROWS; i++) {
    const y = i === M.ROWS ? DS : world(0, M.AREA.north - i * M.CELL)[1];
    (i % 4 === 0 ? major : minor).push(k.lineOnTop([east.x, y], [east.x + (i % 4 === 0 ? 3.6 : 2), y], 0.6, P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  const screws = k.corners(PLINTH, 6.4);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.9, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

// ── The forecast day on the plinth's south face ─────────────────────────────
// 48 ticks, one per half-hour period the decoder forecasts, a long one every
// six hours, and a lit slider that steps along a slot with the grid.
const FACE = PLINTH.y + PLINTH.d;
const STEP_X = DOMAIN.w / M.STEPS;
const SLOT = { z0: -4.7, z1: -3.3 };
const faceLine = (pts) => k.pathOf(pts.map(([x, z]) => at([x, FACE, z])));
function dayScale() {
  const out = [];
  const minor = [], major = [];
  for (let n = 0; n <= M.STEPS; n++) {
    const x = DW + n * STEP_X, big = n % 12 === 0;
    (big ? major : minor).push(faceLine([[x, 0], [x, big ? -2.6 : -1.4]]));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  // the slot: a closed outline, its floor a shade darker
  const slot = [[DW - 2, SLOT.z1], [DE + 2, SLOT.z1], [DE + 2, SLOT.z0], [DW - 2, SLOT.z0]];
  out.push(`<path class="cy-slot" d="${faceLine(slot)}Z"/>`, L(faceLine(slot) + "Z", { tone: "lo" }));
  // a label plate beyond the scale's east end: three rule lines and two screws
  const plate = { x0: DE + 3.4, x1: PLINTH.x + PLINTH.w - 2.6, z0: -5.6, z1: -1.2 };
  const pp = [[plate.x0, plate.z1], [plate.x1, plate.z1], [plate.x1, plate.z0], [plate.x0, plate.z0]];
  out.push(`<path class="cy-plate" d="${faceLine(pp)}Z"/>`, L(faceLine(pp) + "Z", { tone: "mid" }));
  const rules = [3.4, 2.2, 2.8].map((len, n) => faceLine([[plate.x0 + 1.8, plate.z1 - 1.2 - n], [plate.x0 + 1.8 + len, plate.z1 - 1.2 - n]])).join("");
  out.push(L(rules, { tone: "lo", free: true }));
  out.push(D([at([plate.x0 + 0.8, FACE, (plate.z0 + plate.z1) / 2]), at([plate.x1 - 0.8, FACE, (plate.z0 + plate.z1) / 2])], { size: 0.4 }));
  return out.join("");
}
// The slider, built at step 0; the page moves it by STEP_X a step.
function slider() {
  const plan = { x: DW - 1.5, y: FACE - 0.4, w: 3, d: 1.3, r: 0.4 };
  return `<g class="cy-slider">${S(k.slabOf(plan, SLOT.z0 + 0.1, SLOT.z1 - SLOT.z0 - 0.2, P, 2, 0.2), { tone: "hi", lit: true })}</g>`;
}

// ── The islands: the coastline, raised, and terraces from the terrain ───────
const ringArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function contours(height) {
  const level = height + 0.37; // off the whole metres, so no corner sits exactly on the level
  const { lat0, lon0, step, rows, cols, metres } = DATA.terrain;
  const h = (i, j) => (i < 0 || j < 0 || i >= rows || j >= cols ? 0 : metres[i * cols + j]);
  // smooth once (3 × 3), then march squares over a zero-padded grid
  const sm = (i, j) => { let s = 0, w = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const q = a || b ? (a && b ? 0.5 : 1) : 2; s += q * h(i + a, j + b); w += q; } return s / w; };
  const H = [];
  for (let i = -1; i <= rows; i++) { const row = []; for (let j = -1; j <= cols; j++) row.push(i < 0 || j < 0 || i >= rows || j >= cols ? 0 : sm(i, j)); H.push(row); }
  const pt = (i, j) => [lon0 + (j - 1) * step, lat0 + (i - 1) * step];
  const lerp = (a, b, ha, hb) => { const t = (level - ha) / (hb - ha); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const segs = [];
  for (let i = 0; i < H.length - 1; i++) for (let j = 0; j < H[0].length - 1; j++) {
    const c = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
    const v = c.map(([a, b]) => H[a][b]);
    const p = c.map(([a, b]) => pt(a, b));
    // interpolate each grid edge from its lower corner, so the two cells that
    // share an edge find the very same point
    const e = (n) => { const m = (n + 1) % 4; return n < 2 ? lerp(p[n], p[m], v[n], v[m]) : lerp(p[m], p[n], v[m], v[n]); };
    const idx = v.reduce((s, x, n) => s | ((x >= level ? 1 : 0) << n), 0);
    const centre = (v[0] + v[1] + v[2] + v[3]) / 4 >= level;
    const table = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
      5: centre ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]], 10: centre ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]] };
    // orient every piece with the high ground on its left, so outer rings come
    // out anticlockwise and holes clockwise
    // (a piece across two neighbouring edges cuts off the corner they share,
    // which says which side is high; one across the cell follows the gradient)
    const gx = v[1] + v[2] - v[0] - v[3], gy = v[2] + v[3] - v[0] - v[1];
    for (const [a, b] of table[idx] || []) {
      const s = e(a), t = e(b), d = [t[0] - s[0], t[1] - s[1]];
      const corner = b === (a + 1) % 4 ? b : a === (b + 1) % 4 ? a : -1;
      let highLeft;
      if (corner < 0) highLeft = -d[1] * gx + d[0] * gy >= 0;
      else {
        const k0 = p[corner], cornerLeft = d[0] * (k0[1] - s[1]) - d[1] * (k0[0] - s[0]) > 0;
        highLeft = cornerLeft === v[corner] >= level;
      }
      segs.push(highLeft ? [s, t] : [t, s]);
    }
  }
  const key = ([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`;
  const from = new Map();
  segs.forEach((s, n) => from.set(key(s[0]), n));
  const used = new Set(), rings = [];
  let broken = 0;
  for (let n = 0; n < segs.length; n++) {
    if (used.has(n)) continue;
    const ring = [];
    let m = n;
    while (m !== undefined && !used.has(m)) { used.add(m); ring.push(segs[m][0]); m = from.get(key(segs[m][1])); }
    // only a chain that came back to its start is a ring
    if (m !== n) broken++;
    else if (ring.length > 5) rings.push(ring);
  }
  if (broken) console.warn(`contour ${height} m: ${broken} open chains dropped`);
  return rings;
}
const chaikin = (r, times = 2) => { for (let t = 0; t < times; t++) r = r.flatMap((p, i) => { const q = r[(i + 1) % r.length]; return [[0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]]; }); return r; };
// Ramer–Douglas–Peucker on a closed ring, in world units (0.3 is a quarter pixel)
function simplify(ring, tolerance = 0.3) {
  const keep = new Uint8Array(ring.length);
  const run = (a, b) => {
    const [ax, ay] = ring[a], [bx, by] = ring[b], len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, best = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; run(a, far); run(far, b); }
  };
  const half = ring.length >> 1;
  keep[0] = keep[half] = 1;
  run(0, half);
  ring.push(ring[0]); run(half, ring.length - 1); ring.pop();
  return ring.filter((_, i) => keep[i]);
}
const toFloor = (ring) => simplify(ring.map(([lon, lat]) => world(lon, lat).slice(0, 2)));
const inside = ([x, y], ring) => {
  let odd = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
};
function islands() {
  const items = [];
  for (const ring of DATA.coast) {
    const r = toFloor(ring);
    if (Math.abs(ringArea(r)) < 1.2) continue;
    items.push({ z: 0, ring: r });
  }
  TERRACES.forEach((level, n) => {
    for (const ring of contours(level)) {
      const r = toFloor(chaikin(ring, 1));
      if (Math.abs(ringArea(r)) < 2.5) continue;
      if (ringArea(ring) < 0) continue; // a hole in a terrace: leave the level below showing
      if (!DATA.coast.some((c) => inside(ring[0], c))) continue; // high ground off the islands (France)
      items.push({ z: Z.land + n * Z.step, ring: r });
    }
  });
  // lower levels first; within a level, far before near
  const centre = (r) => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
  items.sort((a, b) => a.z - b.z || k.depthOf([...centre(a.ring), 0], P) - k.depthOf([...centre(b.ring), 0], P));
  // the coast is the bright line; each terrace up is a lighter tint
  return items.map(({ z, ring }) => {
    const level = z === 0 ? 0 : Math.round((z - Z.land) / Z.step) + 1;
    return `<g class="cy-land" data-level="${level}">${S(landPrism(ring, z, level ? Z.step : Z.land), { tone: level ? "mid" : "hi", crease: "lo" })}</g>`;
  }).join("");
}
// The kit's prism, lighter: a prism's top and its facing sides cover all of it,
// so it needs no fill, and each run of facing sides in one shade is one strip.
function landPrism(ring, z, h) {
  const paths = k.extrude(ring, z, h, P, { convex: false });
  const n = ring.length, counter = ringArea(ring) > 0, [vx, vy] = k.towardViewer(P), { sinA, cosA } = k.cameraOf(P);
  const normal = (i) => {
    const [ax, ay] = ring[(i + n) % n], [bx, by] = ring[(i + 1 + n) % n], len = Math.hypot(bx - ax, by - ay) || 1;
    return counter ? [(by - ay) / len, -(bx - ax) / len] : [-(by - ay) / len, (bx - ax) / len];
  };
  // a coast turns every few units; its light is read from the normal averaged
  // over a few edges, so a side keeps one tone along a stretch of shore
  const shade = ring.map((_, i) => {
    const [nx, ny] = normal(i);
    if (nx * vx + ny * vy <= 1e-9) return -1;
    let lit = 0;
    for (let m = -3; m <= 3; m++) { const [mx, my] = normal(i + m); lit += mx * -sinA + my * cosA; }
    return Math.min(3, Math.max(0, Math.floor(((lit / 7 + 1) / 2) * 4)));
  });
  const start = shade.findIndex((s, i) => s !== shade[(i + n - 1) % n]);
  const buckets = [[], [], [], []];
  for (let c = 0, i = Math.max(0, start); c < n; ) {
    const s = shade[i];
    let j = i, len = 0;
    while (len < n && shade[j % n] === s) { j++; len++; }
    if (s >= 0) {
      const idx = Array.from({ length: len + 1 }, (_, m) => (i + m) % n);
      buckets[s].push(poly([...idx.map((m) => at([...ring[m], z + h])), ...idx.reverse().map((m) => at([...ring[m], z]))]));
    }
    c += len;
    i = j % n;
  }
  return { ...paths, fill: "", shades: buckets.map((b) => b.join("")) };
}

// ── The grid frame: four posts and a frame carrying the 0.25° lattice ───────
const POSTS = k.corners({ x: DW - 6.5, y: DN - 6.5, w: DOMAIN.w + 13, d: DOMAIN.d + 13 }, 0);
const BAR = 2.4;
function post([x, y]) {
  return S(k.cylinder(x, y, 3.2, 0, 1.2, P, 24), { tone: "lo" }) +
    S(k.cylinder(x, y, 1.8, 1.2, Z.grid - 1.2, P, 20), { tone: "mid", inner: L(k.sideArc(x, y, 1.8, 3.2, P, 12), { tone: "faint" }) });
}
const bars = {
  north: { x: DW - 6.5 - BAR / 2, y: DN - 6.5 - BAR / 2, w: DOMAIN.w + 13 + BAR, d: BAR, r: 0.6 },
  west: { x: DW - 6.5 - BAR / 2, y: DN - 6.5 - BAR / 2, w: BAR, d: DOMAIN.d + 13 + BAR, r: 0.6 },
  south: { x: DW - 6.5 - BAR / 2, y: DS + 6.5 - BAR / 2, w: DOMAIN.w + 13 + BAR, d: BAR, r: 0.6 },
  east: { x: DE + 6.5 - BAR / 2, y: DN - 6.5 - BAR / 2, w: BAR, d: DOMAIN.d + 13 + BAR, r: 0.6 },
};
const bar = (b) => S(k.slabOf(b, Z.grid, 1.2, P, 2, 0.3), { tone: "mid" });
// Wires at every cell edge, from the frame's inner faces; the domain's own edge
// is a heavier wire.
function lattice() {
  const zg = Z.grid + 0.6, out = [];
  const inner = { w: DW - 6.5 + BAR / 2, e: DE + 6.5 - BAR / 2, n: DN - 6.5 + BAR / 2, s: DS + 6.5 - BAR / 2 };
  const meridians = [], parallels = [];
  for (let j = 0; j <= M.COLS; j++) {
    const x = j === M.COLS ? DE : world(M.AREA.west + j * M.CELL, 0)[0];
    meridians.push(k.segment([x, inner.n, zg], [x, inner.s, zg], P));
  }
  for (let i = 0; i <= M.ROWS; i++) {
    const y = i === M.ROWS ? DS : world(0, M.AREA.north - i * M.CELL)[1];
    parallels.push(k.segment([inner.w, y, zg], [inner.e, y, zg], P));
  }
  out.push(`<g class="cy-wires">${L(meridians.join("") + parallels.join(""), { tone: "lo" })}</g>`);
  return out.join("");
}

// ── The lows' clouds, built once about a low at the origin ──────────────────
// Screen = A·[east km, north km] + b at the cloud deck; the page turns and moves
// each low with A·R(spin)·A⁻¹.
const O = at([0, 0, Z.cloud]);
const ax = at([1 / U, 0, Z.cloud]), ay = at([0, -1 / U, Z.cloud]);
const A = [ax[0] - O[0], ax[1] - O[1], ay[0] - O[0], ay[1] - O[1]]; // columns: east, north
const deck = ([x, n]) => [O[0] + A[0] * x + A[2] * n, O[1] + A[1] * x + A[3] * n];
const polar = (r, phi) => [r * Math.cos(phi), r * Math.sin(phi)];
const random = ((seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(11);
// A cloud edge is ragged: each side of each band wanders by a few sines of its own.
const ragged = (amount) => {
  const p = Array.from({ length: 3 }, () => random() * 2 * Math.PI);
  return (r) => 1 + amount * (0.55 * Math.sin(r / 41 + p[0]) + 0.3 * Math.sin(r / 17 + p[1]) + 0.15 * Math.sin(r / 7 + p[2]));
};
function armBand(arm, scale, r0, r1, { offset = 0, samples = 64, rough = 0.22 } = {}) {
  const left = [], right = [], wl = ragged(rough), wr = ragged(rough);
  for (let s = 0; s <= samples; s++) {
    const r = r0 * Math.pow(r1 / r0, s / samples);
    const w = M.armWidth(arm, r) * scale;
    if (w <= 0.5 && s > 0 && s < samples) continue;
    const phi = M.armAngle(arm, r, 0);
    // across the arm: the spiral's normal, from its tangent d/dr
    const c = polar(r, phi);
    const tangent = [Math.cos(phi) + M.PITCH * Math.sin(phi), Math.sin(phi) - M.PITCH * Math.cos(phi)];
    const len = Math.hypot(...tangent), nx = -tangent[1] / len, ny = tangent[0] / len;
    const o = offset * M.armWidth(arm, r);
    left.push([c[0] + nx * (o + w * wl(r)), c[1] + ny * (o + w * wl(r))]);
    right.push([c[0] + nx * (o - w * wr(r)), c[1] + ny * (o - w * wr(r))]);
  }
  return poly([...left, ...right.reverse()].map(deck));
}
const blob = (centre, r, rough = 0, n = 72) => {
  const w = ragged(rough);
  return poly(Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI, q = r * w(a * 60); return deck([centre[0] + q * Math.cos(a), centre[1] + q * Math.sin(a)]); }));
};
// Nested bands whose opacities stack to the model's profile across an arm,
// exp(−(d/w)²): each layer lifts the cover inside it to the profile's value
// halfway to the next layer in.
const SCALES = [2.0, 1.6, 1.25, 0.95, 0.68, 0.44, 0.22];
const PROFILE = SCALES.map((scale, n) => Math.exp(-(((scale + (SCALES[n + 1] ?? 0)) / 2) ** 2)));
const stacked = (covers) => covers.map((cover, n) => 1 - (1 - cover) / (1 - (n ? covers[n - 1] : 0)));
function lowSvg() {
  const parts = [];
  for (const arm of M.ARMS) {
    const alphas = stacked(PROFILE.map((c) => arm.strength * c));
    SCALES.forEach((scale, n) => parts.push(`<path style="opacity:${alphas[n].toFixed(3)}" d="${armBand(arm, scale, arm.from, arm.to)}"/>`));
    // cirrus streaks along the band: slivers tapering to points
    for (let n = 0; n < 12; n++) {
      const span = arm.to - arm.from, r0 = arm.from + span * (0.05 + 0.4 * random()), r1 = Math.min(arm.to, r0 + span * (0.2 + 0.4 * random()));
      parts.push(`<path style="opacity:${(0.12 + 0.2 * random()).toFixed(2)}" d="${armBand(arm, 0.035 + 0.04 * random(), r0, r1, { offset: (random() - 0.5) * 1.8, samples: 26, rough: 0.5 })}"/>`);
    }
  }
  // the head: a disc of cloud round a clearer centre, stacked the same way
  const HEAD = [[1.6, 0.3, 0.2], [1.25, 0.6, 0.4], [0.95, 0.9, 0.6], [0.7, 1.2, 0.75], [0.48, 1.5, 0.85]];
  const alphas = stacked(HEAD.map((h) => h[2]));
  HEAD.forEach(([outer, hole], n) => parts.push(`<path fill-rule="evenodd" style="opacity:${alphas[n].toFixed(3)}" d="${blob([0, 0], M.CORE.radius * outer, 0.12)}${blob([0, 0], M.CORE.slot * hole, 0.2, 40)}"/>`));
  return parts.join("");
}
const SLOTS = [-3, -2, -1, 0, 1, 2];
// one low drawn once and shown in each slot of the family
const clouds = () => `<defs><g id="cy-low">${lowSvg()}</g></defs><g class="cy-lows">${SLOTS.map((s) => `<use href="#cy-low" data-low="${s}" style="opacity:0"/>`).join("")}</g>`;

// ── The sampled field: lattice cells lit by the cover at their centres ──────
const LEVELS = [0.18, 0.4, 0.62, 0.84];
const cells = () => `<g class="cy-cells">${[0, 1].map((b) => `<g data-buffer="${b}" style="opacity:${b ? 0 : 1}">${LEVELS.map((_, n) => `<path data-level="${n}"/>`).join("")}</g>`).join("")}</g>`;
// the lattice's corner and its two edge vectors on screen, for the page
const G0 = at(world(M.AREA.west, M.AREA.north, Z.grid + 0.6));
const GJ = at(world(M.AREA.west + M.CELL, M.AREA.north, Z.grid + 0.6)), GI = at(world(M.AREA.west, M.AREA.north - M.CELL, Z.grid + 0.6));

// ── Compose, back to front ──────────────────────────────────────────────────
// The frame's north and west bars show their inner faces, so the wires end on
// them and are drawn after; the south and east bars hide theirs and come last.
// The clouds float above everything.
const [NW, NE, SW, SE] = POSTS;
const body = [
  floor(),
  plinth(),
  dayScale(),
  slider(),
  islands(),
  post(NW), post(NE), post(SW),
  bar(bars.north), bar(bars.west),
  cells(),
  lattice(),
  post(SE),
  bar(bars.south), bar(bars.east),
  clouds(),
].join("");

const NAVY = `--anatomy-page:#050f17;--anatomy-card:#081722;--anatomy-paper:#081722;--anatomy-face:#0c1f2d;
--anatomy-shade-0:#040e17;--anatomy-shade-1:#061521;--anatomy-shade-2:#091b29;--anatomy-shade-3:#0c2131;--anatomy-top:#10283a;
--anatomy-lit-top:#163045;--anatomy-lit-shade:#12293b;
--anatomy-hi:#9fb2c2;--anatomy-mid:#5a7184;--anatomy-lo:#2f475a;--anatomy-faint:#1a3041;--anatomy-halo:#01070c;
--anatomy-text:#7f95a7;--anatomy-strong:#c9d6e0;--anatomy-muted:#566d80`;
const EXTRA = `--anatomy-lit:#e8f0f6;--anatomy-dot:#c9d6e0;--anatomy-halo-opacity:.9;--anatomy-weight:.6px;--cy-cloud:#dfe8ef`;
const SCENE_CSS = `.cy-lows use{fill:var(--cy-cloud);stroke:none}
.cy-sea{fill:#071521;stroke:none}
.cy-land{--anatomy-top:#1a3a52;--anatomy-shade-0:#0c2131;--anatomy-shade-1:#10283a;--anatomy-shade-2:#143046;--anatomy-shade-3:#183850}
.cy-land[data-level="1"]{--anatomy-top:#21455f}
.cy-land[data-level="2"]{--anatomy-top:#28506c}
.cy-land[data-level="3"]{--anatomy-top:#305b79}
.cy-cells path{fill:var(--anatomy-hi);stroke:none}
.cy-cells path[data-level="0"]{opacity:.12}
.cy-cells path[data-level="1"]{opacity:.22}
.cy-cells path[data-level="2"]{opacity:.32}
.cy-cells path[data-level="3"]{opacity:.42}
.cy-slot{fill:var(--anatomy-shade-0);stroke:none}
.cy-plate{fill:var(--anatomy-shade-3);stroke:none}
.cy-wires .iso-line{stroke-width:.35;opacity:.8}
.cy-graticule .iso-line{stroke-width:.4}`;
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots|halo)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const css = `${SCOPE}{${NAVY};${EXTRA}}` + [...KIT, ...SCENE_CSS.split("\n")].map(scope).join("");
// Paths of straight segments rewritten in relative steps, which are about half
// as long: the same picture in fewer bytes.
function relative(d) {
  const tokens = d.match(/[MLZ]|-?\d*\.?\d+/g);
  const r = (v) => String(Math.round(v * 10) / 10).replace(/^(-?)0\./, "$1.");
  const join = (a, b) => a + (!a || /[mz]$/.test(a) || b.startsWith("-") ? "" : " ") + b;
  let out = "", cx = 0, cy = 0, sx = 0, sy = 0, move = false;
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (t === "Z") { out += "z"; cx = sx; cy = sy; i++; continue; }
    if (t === "M" || t === "L") { move = t === "M"; i++; continue; }
    const x = +tokens[i], y = +tokens[i + 1];
    i += 2;
    // after an m, further pairs are relative line-tos
    if (move) { out += "m"; sx = x; sy = y; }
    out = join(join(out, r(x - cx)), r(y - cy));
    cx = x; cy = y; move = false;
  }
  return out;
}
const compact = (markup) => markup.replace(/ d="([MLZ0-9.\s-]+)"/g, (_, d) => ` d="${relative(d)}"`);
const svg = compact(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${body}</svg>`);

// ── Live ────────────────────────────────────────────────────────────────────
const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `// Generated by figures/cyclone/build.mjs: turns and moves the lows and steps the
// ERA5 grid in the post card. Edit the build, not this file.
${model}
const A = ${JSON.stringify(A.map((v) => +v.toFixed(5)))}, O = ${JSON.stringify(O.map(f1))};
const G0 = ${JSON.stringify(G0.map((v) => +v.toFixed(3)))}, GJ = ${JSON.stringify(GJ.map((v) => +v.toFixed(3)))}, GI = ${JSON.stringify(GI.map((v) => +v.toFixed(3)))};
const SLIDE = ${JSON.stringify(k.axisVector(P, [STEP_X, 0, 0]).map((v) => +v.toFixed(4)))};
const LEVELS = ${JSON.stringify(LEVELS)};
const SECONDS_PER_STEP = 1;
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const slots = new Map([...svg.querySelectorAll("[data-low]")].map((g) => [Number(g.dataset.low), g]));
const det = A[0] * A[3] - A[2] * A[1];
const inv = [A[3] / det, -A[1] / det, -A[2] / det, A[0] / det];
const r3 = (v) => Math.round(v * 1000) / 1000;
function lows(hours) {
  const seen = new Set();
  for (const low of lowsAt(hours)) {
    const g = slots.get(low.key);
    if (!g) continue;
    seen.add(low.key);
    const c = Math.cos(low.spin) * low.size, s = Math.sin(low.spin) * low.size;
    // A·(size·R)·A⁻¹, then the low's centre on the deck
    const ar = [A[0] * c + A[2] * s, A[1] * c + A[3] * s, -A[0] * s + A[2] * c, -A[1] * s + A[3] * c];
    const m = [ar[0] * inv[0] + ar[2] * inv[1], ar[1] * inv[0] + ar[3] * inv[1], ar[0] * inv[2] + ar[2] * inv[3], ar[1] * inv[2] + ar[3] * inv[3]];
    const to = [O[0] + A[0] * low.at[0] + A[2] * low.at[1], O[1] + A[1] * low.at[0] + A[3] * low.at[1]];
    const e = to[0] - (m[0] * O[0] + m[2] * O[1]), f = to[1] - (m[1] * O[0] + m[3] * O[1]);
    g.setAttribute("transform", "matrix(" + [m[0], m[1], m[2], m[3], e, f].map(r3).join(" ") + ")");
    g.style.opacity = r3(low.life);
  }
  for (const [key, g] of slots) if (!seen.has(key)) g.style.opacity = 0;
}
const buffers = [...svg.querySelectorAll("[data-buffer]")];
const round1 = (v) => Math.round(v * 10) / 10;
function paint(buffer, step) {
  const field = fieldAt(step), d = LEVELS.map(() => []);
  const fx = (AREA.east - AREA.west) / CELL - (COLS - 1), fy = (AREA.north - AREA.south) / CELL - (ROWS - 1);
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
    const v = field[i * COLS + j];
    let n = -1;
    while (n + 1 < LEVELS.length && v >= LEVELS[n + 1]) n++;
    if (n < 0) continue;
    const j1 = j === COLS - 1 ? j + fx : j + 1, i1 = i === ROWS - 1 ? i + fy : i + 1;
    const p = (a, b) => round1(G0[0] + b * (GJ[0] - G0[0]) + a * (GI[0] - G0[0])) + " " + round1(G0[1] + b * (GJ[1] - G0[1]) + a * (GI[1] - G0[1]));
    d[n].push("M" + p(i, j) + "L" + p(i, j1) + "L" + p(i1, j1) + "L" + p(i1, j) + "Z");
  }
  buffer.querySelectorAll("path").forEach((el, n) => el.setAttribute("d", d[n].join("")));
}
// The grid holds each half-hour's field and crossfades to the next in 0.4 s,
// while the slider on the plinth's face moves on one tick.
const slider = svg.querySelector(".cy-slider");
let shown = -1, front = 0, fadeFrom = null, from = 0;
function grid(seconds) {
  const step = Math.floor(seconds / SECONDS_PER_STEP) % STEPS;
  if (step !== shown) {
    if (shown < 0) { paint(buffers[0], step); buffers[0].style.opacity = 1; buffers[1].style.opacity = 0; from = step; }
    else { front ^= 1; paint(buffers[front], step); fadeFrom = seconds; from = shown; }
    shown = step;
  }
  const t = fadeFrom === null ? 1 : Math.min(1, (seconds - fadeFrom) / 0.4), e = t * t * (3 - 2 * t);
  if (fadeFrom !== null) { buffers[front].style.opacity = r3(e); buffers[front ^ 1].style.opacity = r3(1 - e); }
  const along = from + (step - from) * e;
  slider.setAttribute("transform", "translate(" + r3(SLIDE[0] * along) + " " + r3(SLIDE[1] * along) + ")");
}
function draw(seconds) {
  lows(seconds / SECONDS_PER_STEP / 2);
  grid(seconds);
}
const START = ${arg("at", 0)};
const GAP = 1000 / 30 - 2;
let frame = 0, visible = false, t0 = 0, last = -Infinity;
function tick(now) {
  if (!t0) t0 = now - START * 1000;
  if (now - last >= GAP) { last = now; draw(((now - t0) / 1000) % (STEPS * SECONDS_PER_STEP)); }
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
draw(START);
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible && !frame && !still.matches) frame = requestAnimationFrame(tick);
}, { rootMargin: "120px 0px" }).observe(stage);
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "scene.svg"), svg);
writeFileSync(join(OUT, "scene.js"), live);

// ── Preview: the card as the homepage draws it ──────────────────────────────
const TITLE = "Probabilistic Forecasting of Renewable Generation &amp; Wholesale Prices with Quantile-Regression";
const preview = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cyclone card</title>
<style>
body{margin:0;background:#fff;font-family:Quicksand,system-ui,sans-serif}
.wrap{max-width:1140px;margin:24px auto;padding:0 15px}
.card{position:relative;height:160px;overflow:hidden;border:1px solid rgba(0,0,0,.125);border-radius:4px;background:#081722;display:flex}
.scene-cyclone{position:absolute;inset:0}
.scene-cyclone svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,.2),white 80%)}
.raw .card::after,.raw .block{display:none}
.block{position:relative;z-index:2;margin:auto 15px}
h2{color:#717171;font-weight:500;font-size:2rem;margin:0 0 .4rem;text-decoration:underline;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:1rem;margin:0 0 .3rem}
.text{color:#000;font-size:1rem;margin:0}
</style></head><body><div class="wrap"><div class="card iso-plate"><div class="scene-cyclone" aria-hidden="true">${svg}</div>
<div class="block"><h2>${TITLE}</h2><p class="date">Jun 15, 2022</p><p class="text">With the 2022 UK energy security strategy anticipating to further accelerate the development of offshore wind capacity to 50GW by 2030, alongside solar capacity potentially</p></div></div></div>
<script>if (location.search.includes("raw")) document.body.classList.add("raw");</script>
<script type="module">${live}</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview);
console.log("scene.svg", (svg.length / 1024).toFixed(0) + " KB · scene.js", (live.length / 1024).toFixed(0) + " KB · scale", P.scale.toFixed(3), "· plinth x", [at([PLINTH.x, PLINTH.y + PLINTH.d, 0])[0], at([PLINTH.x + PLINTH.w, PLINTH.y, 0])[0]].map(f1).join("–"));
