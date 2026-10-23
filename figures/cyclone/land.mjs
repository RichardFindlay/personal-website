// The ground under the storm, seen from straight above: an arid coast with a
// plain, an escarpment cut by wadis, a plateau and a dune sea beyond it, and the
// open sea with its swell. One height field (metres, negative offshore) on a
// 1-unit grid makes all of it, so the terraces, the gorges, the hachures and the
// shelf lines agree. Units are the strip's viewBox units, x right and y down.

const W = 1400, H = 200;
const PAD = 24;
const X0 = -PAD, Y0 = -PAD, NX = W + 2 * PAD + 1, NY = H + 2 * PAD + 1;
// toward the sun, on screen: the light comes from the upper left
const SUN = (() => { const v = [-1, -0.8], l = Math.hypot(...v); return [v[0] / l, v[1] / l]; })();

// ── Noise ───────────────────────────────────────────────────────────────────
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
// centred on 0, roughly in −1..1
function fbm(x, y, octaves = 4, seed = 0) {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) { s += amp * noise(x, y, seed + o * 31); norm += amp; x = x * 2.03 + 17.1; y = y * 2.03 - 9.3; amp *= 0.5; }
  return (s / norm - 0.5) * 2;
}
const random = ((seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(23);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── The coast: a smooth curve, land on its upper right ──────────────────────
const COAST = [[680, -90], [810, -22], [910, 22], [985, 44], [1050, 76], [1094, 110], [1140, 121], [1195, 108], [1250, 120], [1305, 150], [1360, 170], [1408, 214], [1442, 262]];
function catmull(points, step = 2) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step);
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
const CURVE = catmull(COAST);
// signed distance to the coast curve, positive on land
function inland(x, y) {
  let best = Infinity, sign = 1;
  for (let i = 0; i < CURVE.length - 1; i++) {
    const [ax, ay] = CURVE[i], [bx, by] = CURVE[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best) { best = d; sign = dx * (y - ay) - dy * (x - ax) < 0 ? 1 : -1; }
  }
  return best * sign;
}

// ── The height field ────────────────────────────────────────────────────────
const field = (n) => new Float32Array(NX * NY).fill(n);
const idx = (i, j) => j * NX + i;
const S = field(0), E = field(0), Hm = field(0);
// the distance to the smooth curve is smooth, so a 4-unit grid of it, read
// bilinearly, is as good as the exact one and far cheaper
const CG = 4, CX = Math.ceil(NX / CG) + 1, CY = Math.ceil(NY / CG) + 1;
const coarse = new Float32Array(CX * CY);
for (let j = 0; j < CY; j++) for (let i = 0; i < CX; i++) coarse[j * CX + i] = inland(X0 + i * CG, Y0 + j * CG);
const inlandAt = (x, y) => {
  const fx = (x - X0) / CG, fy = (y - Y0) / CG, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const c = (a, b) => coarse[Math.min(CY - 1, b) * CX + Math.min(CX - 1, a)];
  return c(i, j) * (1 - u) * (1 - v) + c(i + 1, j) * u * (1 - v) + c(i, j + 1) * (1 - u) * v + c(i + 1, j + 1) * u * v;
};
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + i, y = Y0 + j;
  // headlands and bays: the coast wanders off the curve at three scales
  const s = inlandAt(x, y) + 11 * fbm(x / 70, y / 70, 3, 1) + 4 * fbm(x / 19, y / 19, 3, 2) + 1.3 * fbm(x / 5, y / 5, 2, 3);
  const edge = 31 + 13 * fbm(x / 95, y / 95, 3, 4) + 5 * fbm(x / 24, y / 24, 3, 5);
  let h;
  if (s < 0) h = s * 11 * (1 + 0.35 * fbm(x / 40, y / 40, 3, 6)) - 3;
  else {
    const plain = 3.1 * Math.min(s, 26) + 18 * (fbm(x / 9, y / 9, 3, 7) + 1) * smooth(0, 6, s);
    const scarp = 640 / (1 + Math.exp(-(s - edge) / 3.6));
    const top = smooth(edge - 4, edge + 10, s);
    const plateau = top * (150 * fbm(x / 48, y / 48, 4, 8) + 22 * fbm(x / 13, y / 13, 2, 9));
    const back = -2.4 * Math.max(0, s - edge - 46);
    h = plain + scarp + plateau + back;
  }
  S[idx(i, j)] = s; E[idx(i, j)] = edge; Hm[idx(i, j)] = h;
}
const sample = (F, x, y) => {
  const fx = Math.min(NX - 1.001, Math.max(0, x - X0)), fy = Math.min(NY - 1.001, Math.max(0, y - Y0));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  return F[idx(i, j)] * (1 - u) * (1 - v) + F[idx(i + 1, j)] * u * (1 - v) + F[idx(i, j + 1)] * (1 - u) * v + F[idx(i + 1, j + 1)] * u * v;
};
const grad = (F, x, y, e = 0.8) => [(sample(F, x + e, y) - sample(F, x - e, y)) / (2 * e), (sample(F, x, y + e) - sample(F, x, y - e)) / (2 * e)];
const norm = ([a, b]) => { const l = Math.hypot(a, b) || 1; return [a / l, b / l]; };

// ── Wadis: where the rain would run ─────────────────────────────────────────
// Priority-flood the field inward from the sea and the grid's edge: each cell
// drains to the cell that reached it, so every hollow spills over its lowest
// rim and every path ends at the sea or off the edge. The area each cell drains
// picks out the channels, which therefore join into connected trees.
const N = NX * NY;
const recv = new Int32Array(N).fill(-1), order = new Int32Array(N), acc = new Float32Array(N);
{
  const level = new Float32Array(N), done = new Uint8Array(N), heap = new Int32Array(N);
  let size = 0, filled = 0;
  const less = (a, b) => level[heap[a]] < level[heap[b]];
  const swap = (a, b) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; };
  const push = (k) => { let i = size++; heap[i] = k; while (i && less(i, (i - 1) >> 1)) { swap(i, (i - 1) >> 1); i = (i - 1) >> 1; } };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    for (let i = 0; ; ) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < size && less(l, m)) m = l; if (r < size && less(r, m)) m = r; if (m === i) break; swap(i, m); i = m; }
    return top;
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = idx(i, j);
    if (Hm[k] <= 0 || i === 0 || j === 0 || i === NX - 1 || j === NY - 1) { done[k] = 1; level[k] = Hm[k]; push(k); }
  }
  while (size) {
    const k = pop(), i = k % NX, j = (k / NX) | 0;
    order[filled++] = k;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if ((!di && !dj) || a < 0 || b < 0 || a >= NX || b >= NY) continue;
      const n = idx(a, b);
      if (done[n]) continue;
      done[n] = 1;
      level[n] = Math.max(Hm[n], level[k] + 0.01 * (1 + random()));
      recv[n] = k;
      push(n);
    }
  }
  for (let n = 0; n < N; n++) acc[n] = Hm[n] > 0 ? 1 : 0;
  for (let n = filled - 1; n >= 0; n--) { const k = order[n]; if (recv[k] >= 0) acc[recv[k]] += acc[k]; }
}
// a channel: enough ground draining through it, short of the sand sea
const SOURCE = 70;
const sandy = (k) => S[k] > E[k] + 108;
const isChannel = (k) => Hm[k] > 0 && acc[k] >= SOURCE && !sandy(k);
const wadis = [];
const taken = new Set();
const cell = (x, y) => idx(Math.round(x - X0), Math.round(y - Y0));
{
  const fed = new Uint8Array(N), seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (isChannel(k) && recv[k] >= 0) fed[recv[k]] = 1;
  const heads = [];
  for (let k = 0; k < N; k++) if (isChannel(k) && !fed[k]) heads.push(k);
  // the biggest trees first, so each trunk is traced from its longest branch
  heads.sort((a, b) => acc[b] - acc[a]);
  const xy = (k) => [X0 + (k % NX), Y0 + ((k / NX) | 0)];
  for (const head of heads) {
    const cells = [];
    let k = head, end = "edge";
    while (k >= 0) {
      cells.push(k);
      if (seen[k] && cells.length > 1) { end = "join"; break; }
      seen[k] = 1;
      const r = recv[k];
      if (r < 0) break;
      if (Hm[r] <= 0) { cells.push(r); end = "sea"; break; }
      if (sandy(r)) { end = "sand"; break; }
      k = r;
    }
    if (cells.length < 6) continue;
    for (const c of cells) taken.add(c);
    wadis.push({ pts: cells.map(xy), acc: cells.map((c) => acc[c]), end });
  }
}
// carve the channels: a gorge where much drains, a shallow bed near the head.
// The cut is the deepest of the stamps, not their sum, so each is one trough.
{
  const CUT = new Float32Array(N);
  for (const { pts, acc: a } of wadis) pts.forEach(([x, y], n) => {
    const depth = Math.min(240, 12 + 7 * Math.sqrt(a[n])), sigma = Math.min(3.2, 1.2 + 0.05 * Math.sqrt(a[n])), r = 2.2 * sigma;
    for (let j = Math.floor(y - r - Y0); j <= Math.ceil(y + r - Y0); j++) for (let i = Math.floor(x - r - X0); i <= Math.ceil(x + r - X0); i++) {
      if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
      const d = Math.hypot(X0 + i - x, Y0 + j - y);
      if (d > r) continue;
      const k = idx(i, j);
      CUT[k] = Math.max(CUT[k], depth * Math.exp(-((d / sigma) ** 2)));
    }
  });
  for (let k = 0; k < N; k++) if (Hm[k] > 0 && CUT[k] > 0) Hm[k] = Math.max(1, Hm[k] - CUT[k]);
}

// ── Contours: marching squares, oriented so nonzero fill keeps the holes ────
function contours(level) {
  const v = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NY ? -1e5 : Hm[idx(i, j)]);
  const segs = [];
  const lerp = (a, b, ha, hb) => { const t = (level - ha) / (hb - ha); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const table = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
  for (let j = -1; j < NY; j++) for (let i = -1; i < NX; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const h = c.map(([a, b]) => v(a, b));
    const p = c.map(([a, b]) => [X0 + a, Y0 + b]);
    const e = (n) => { const m = (n + 1) % 4; return n < 2 ? lerp(p[n], p[m], h[n], h[m]) : lerp(p[m], p[n], h[m], h[n]); };
    const id = h.reduce((s, x, n) => s | ((x >= level ? 1 : 0) << n), 0);
    const centre = (h[0] + h[1] + h[2] + h[3]) / 4 >= level;
    const pairs = table[id] || (id === 5 ? (centre ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]]) : id === 10 ? (centre ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]]) : []);
    const gx = h[1] + h[2] - h[0] - h[3], gy = h[2] + h[3] - h[0] - h[1];
    for (const [a, b] of pairs) {
      const s = e(a), t = e(b), d = [t[0] - s[0], t[1] - s[1]];
      const corner = b === (a + 1) % 4 ? b : a === (b + 1) % 4 ? a : -1;
      let highLeft;
      if (corner < 0) highLeft = -d[1] * gx + d[0] * gy >= 0;
      else { const k0 = p[corner]; highLeft = (d[0] * (k0[1] - s[1]) - d[1] * (k0[0] - s[0]) > 0) === h[corner] >= level; }
      segs.push(highLeft ? [s, t] : [t, s]);
    }
  }
  const key = ([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`;
  const from = new Map();
  segs.forEach((s, n) => from.set(key(s[0]), n));
  const used = new Set(), rings = [];
  for (let n = 0; n < segs.length; n++) {
    if (used.has(n)) continue;
    const ring = [];
    let m = n;
    while (m !== undefined && !used.has(m)) { used.add(m); ring.push(segs[m][0]); m = from.get(key(segs[m][1])); }
    if (m === n && ring.length > 4) rings.push(ring);
  }
  return rings;
}
const area = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const chaikin = (r) => r.flatMap((p, i) => { const q = r[(i + 1) % r.length]; return [[0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]]; });
function simplify(ring, tol) {
  const keep = new Uint8Array(ring.length);
  const run = (a, b) => {
    const [ax, ay] = ring[a], [bx, by] = ring[b % ring.length], len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, best = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len; if (d > best) { best = d; far = i; } }
    if (far >= 0) { keep[far] = 1; run(a, far); run(far, b); }
  };
  const half = ring.length >> 1;
  keep[0] = keep[half] = 1;
  run(0, half); run(half, ring.length);
  return ring.filter((_, i) => keep[i]);
}
const f1 = (v) => Math.round(v * 10) / 10;
const poly = (pts, closed = true) => "M" + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L") + (closed ? "Z" : "");
const ringsPath = (level, { tol = 0.35, min = 3 } = {}) => contours(level)
  .filter((r) => Math.abs(area(r)) >= min)
  .map((r) => poly(simplify(chaikin(r), tol))).join("");

// ── Terraces, lit on the sun side and shadowed on the other (Tanaka) ────────
const SEA_LEVELS = [-900, -260, -70];
const LAND_LEVELS = [0, 45, 130, 250, 380, 510, 640, 770];
function terraces() {
  const defs = [], shelf = [], body = [];
  SEA_LEVELS.forEach((level, n) => {
    defs.push(`<path id="cy-s${n}" d="${ringsPath(level, { tol: 0.5, min: 12 })}"/>`);
    shelf.push(`<use href="#cy-s${n}" class="cy-shelf" data-n="${n}"/>`);
  });
  const shade = [0.55, 0.65], rim = [-0.45, -0.5];
  LAND_LEVELS.forEach((level, n) => {
    defs.push(`<path id="cy-t${n}" d="${ringsPath(level, { min: n ? 2.5 : 1.2 })}"/>`);
    body.push(`<use href="#cy-t${n}" class="cy-dark" transform="translate(${shade})"/>`,
      `<use href="#cy-t${n}" class="cy-rim" transform="translate(${rim})"/>`,
      `<use href="#cy-t${n}" class="cy-terrace" data-n="${n}"/>`);
  });
  return { defs: defs.join(""), shelf: shelf.join(""), body: body.join("") };
}

// ── Strokes: the coast, the surf line just off it, index contours ───────────
function lines() {
  const coast = ringsPath(0, { min: 1.2, tol: 0.3 });
  const surf = ringsPath(-14, { min: 3, tol: 0.3 });
  const index = ringsPath(510, { min: 2.5, tol: 0.4 });
  return `<path class="iso-line cy-surf" d="${surf}"/><path class="iso-line cy-index" d="${index}"/><path class="iso-line cy-coast" d="${coast}"/>`;
}

// A tapering ribbon along a polyline, closed so it needs no line ends.
function ribbon(pts, width) {
  const left = [], right = [];
  pts.forEach((p, n) => {
    const a = pts[Math.max(0, n - 1)], b = pts[Math.min(pts.length - 1, n + 1)];
    const [tx, ty] = norm([b[0] - a[0], b[1] - a[1]]), w = width(n / (pts.length - 1), n);
    left.push([p[0] - ty * w, p[1] + tx * w]);
    right.push([p[0] + ty * w, p[1] - tx * w]);
  });
  return poly([...left, ...right.reverse()]);
}
function simplifyOpen(pts, tol) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const run = (a, b) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, best = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len; if (d > best) { best = d; far = i; } }
    if (far >= 0) { keep[far] = 1; run(a, far); run(far, b); }
  };
  run(0, pts.length - 1);
  // keep a point every few units too, so the taper has stations to grow along
  return pts.filter((_, i) => keep[i] || i % 8 === 0);
}
const chaikinOpen = (r) => [r[0], ...r.slice(0, -1).flatMap((p, i) => { const q = r[i + 1]; return [p.map((v, k) => 0.75 * v + 0.25 * q[k]), p.map((v, k) => 0.25 * v + 0.75 * q[k])]; }), r[r.length - 1]];
const thin = (pts, step) => pts.filter((_, n) => n % step === 0 || n === pts.length - 1);

function wadiSvg() {
  const beds = [], fans = [];
  for (const { pts, acc: a, end } of wadis) {
    // the grid's eight directions, rounded off into a bed
    const raw = pts.map((p, n) => [...p, a[n]]);
    const mean = raw.map((p, n) => {
      if (n === 0 || n === raw.length - 1) return p;
      const w = raw.slice(Math.max(0, n - 3), n + 4);
      return [w.reduce((s, q) => s + q[0], 0) / w.length, w.reduce((s, q) => s + q[1], 0) / w.length, p[2]];
    });
    const p = simplifyOpen(chaikinOpen(chaikinOpen(mean)), 0.15);
    const width = (n) => Math.min(1.1, 0.14 + 0.036 * Math.sqrt(p[n][2]));
    // taper in from the head; one that runs into the sand dies out there
    const grow = (t, n) => width(n) * smooth(0, 4 / p.length, t) * (end === "sand" ? 1 - smooth(0.6, 1, t) : 1);
    beds.push(ribbon(p, grow));
    if (end === "sea" && a[a.length - 2] > 220) {
      // a gravel fan where a large wadi reaches the shore
      const [x, y] = pts[pts.length - 1];
      const [gx, gy] = norm(grad(S, x, y));
      const fan = Array.from({ length: 13 }, (_, i) => { const a = Math.atan2(-gy, -gx) + (i / 12 - 0.5) * 1.6, r = i === 0 || i === 12 ? 0.6 : 3.2; return [x + gx * 2.4 + Math.cos(a) * r, y + gy * 2.4 + Math.sin(a) * r]; });
      fans.push(poly(fan));
    }
  }
  return `<path class="cy-fan" d="${fans.join("")}"/><path class="cy-wadi" d="${beds.join("")}"/>`;
}

// ── Hachures: tapered strokes down the scarp face, lit or shaded by aspect ──
function hachures() {
  const lit = [], dark = [];
  for (let n = 0; n < 14000; n++) {
    const x = 680 + random() * 745, y = -10 + random() * 220;
    const s = sample(S, x, y), e = sample(E, x, y);
    if (Math.abs(s - (e + 3.5)) > 0.6) continue;
    const g = grad(Hm, x, y), slope = Math.hypot(...g);
    if (slope < 18) continue;
    if (taken.has(cell(x, y))) continue;
    const pts = [[x, y]];
    let px = x, py = y;
    for (let k = 0; k < 14; k++) {
      const d = norm(grad(Hm, px, py));
      px -= d[0] * 0.55; py -= d[1] * 0.55;
      pts.push([px, py]);
      if (sample(Hm, px, py) < 140) break;
    }
    if (pts.length < 5) continue;
    const [dx, dy] = norm(g);
    // a face that falls away from the sun is in shadow
    const facing = -(dx * SUN[0] + dy * SUN[1]);
    (facing > 0 ? lit : dark).push(ribbon(pts, (t) => 0.32 * (1 - t) + 0.04));
  }
  return `<path class="cy-hach-dark" d="${dark.join("")}"/><path class="cy-hach-lit" d="${lit.join("")}"/>`;
}

// ── Dunes: linear ridges in the interior, each a lit crest on a shaded flank ─
function dunes() {
  const lit = [], dark = [];
  const dir = norm([0.95, -0.31]), across = [-dir[1], dir[0]];
  const off = across[0] * SUN[0] + across[1] * SUN[1] > 0 ? 1 : -1;
  for (let k = -80; k < 80; k++) {
    const base = [1250 + across[0] * k * 3.6, 40 + across[1] * k * 3.6];
    let run = [];
    const flush = () => {
      if (run.length > 8) {
        const crest = thin(run, 2);
        lit.push(ribbon(crest.map(([x, y]) => [x + across[0] * off * 0.35, y + across[1] * off * 0.35]), (t) => 0.42 * Math.sin(Math.PI * t) ** 0.6));
        dark.push(ribbon(crest.map(([x, y]) => [x - across[0] * off * 0.5, y - across[1] * off * 0.5]), (t) => 0.55 * Math.sin(Math.PI * t) ** 0.6));
      }
      run = [];
    };
    for (let t = -420; t <= 420; t += 1.6) {
      const wob = 0.9 * Math.sin(t / 9 + k * 1.7) + 0.8 * fbm(t / 20, k * 0.37, 2, 12);
      const x = base[0] + dir[0] * t + across[0] * wob, y = base[1] + dir[1] * t + across[1] * wob;
      if (x < 1000 || x > 1430 || y < -12 || y > 212) { flush(); continue; }
      const s = sample(S, x, y), e = sample(E, x, y);
      const sand = s - e - 100 + 16 * fbm(x / 40, y / 40, 2, 13);
      const breakup = fbm(t / 14, k * 0.61, 2, 14);
      if (sand > 0 && breakup > -0.2 && !taken.has(cell(x, y))) run.push([x, y]);
      else flush();
      if (run.length > 30) flush();
    }
    flush();
  }
  return `<path class="cy-dune-dark" d="${dark.join("")}"/><path class="cy-dune-lit" d="${lit.join("")}"/>`;
}

// ── The sea: swell crests as small crescents, brighter in the glint ─────────
function swell() {
  const levels = [[], [], []];
  const crest = norm([0.88, 0.47]); // crests run with the coast
  const step = 7.4;
  for (let gy = -4; gy < H + 4; gy += step * 0.62) for (let gx = 640; gx < 1420; gx += step) {
    const x = gx + (random() - 0.5) * step * 1.4 + ((gy / step) % 2) * step * 0.5, y = gy + (random() - 0.5) * step * 0.9;
    const s = sample(S, x, y);
    if (s > -6) continue;
    // thinning out toward the left, where the card fades to white anyway
    if (random() > smooth(640, 1000, x) * 0.8 + 0.2) continue;
    const glint = 0.5 + 0.5 * fbm(x / 120, y / 60, 3, 20) + 0.25 * smooth(-30, -8, s);
    const len = 1.6 + random() * 3.4, bow = 0.3 + random() * 0.4, w = 0.24 + random() * 0.22;
    const a = Math.atan2(crest[1], crest[0]) + (random() - 0.5) * 0.5;
    const [cx, cy] = [Math.cos(a), Math.sin(a)], [nx, ny] = [-cy, cx];
    const p0 = [x - cx * len, y - cy * len], p1 = [x + cx * len, y + cy * len];
    const c0 = [x + nx * bow * 2, y + ny * bow * 2], c1 = [x + nx * (bow * 2 - w * 2), y + ny * (bow * 2 - w * 2)];
    const r = (v) => String(f1(v)).replace(/^(-?)0\./, "$1.");
    const rel = (q, o) => `${r(q[0] - o[0])} ${r(q[1] - o[1])}`.replace(" -", "-");
    levels[glint > 0.85 ? 2 : glint > 0.6 ? 1 : 0].push(`M${f1(p0[0])} ${f1(p0[1])}q${rel(c0, p0)} ${rel(p1, p0)}q${rel(c1, p1)} ${rel(p0, p1)}z`);
  }
  return levels.map((d, n) => `<path class="cy-swell" data-n="${n}" d="${d.join("")}"/>`).join("");
}

export function landSvg() {
  const t = terraces();
  return {
    defs: t.defs,
    body: [`<rect class="cy-sea" x="-10" y="-10" width="${W + 20}" height="${H + 20}"/>`, t.shelf, swell(), t.body, wadiSvg(), hachures(), dunes(), lines()].join(""),
    stats: { wadis: wadis.reduce((o, w) => ({ ...o, [w.end]: (o[w.end] || 0) + 1 }), {}) },
  };
}
