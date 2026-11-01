// A small renderer for flat-shaded isometric illustration: convex solids,
// bodies of revolution and terrain facets, each face one flat colour taken
// from its material by how it faces one fixed light, drawn as SVG paths in a
// painter's order that comes from how the things stand relative to each
// other (not from their centres), plus a registry of footprints that refuses
// any two things placed inside each other.
//
// Metres: x and y on the ground, z up. The camera is the anatomy kit's
// isometric projection: 45° round, 30° up, the viewer toward +x +y.
import * as k from "../lib/anatomy/kit/iso-kit.mjs";

// ── Colour ──────────────────────────────────────────────────────────────────
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
export const darker = (c, f) => toHex(hex(c).map((v) => v * f));
// a material: the colour of a face turned to the left (+y), with a brighter top and a darker right (+x) face
export const mat = (left, { top, right } = {}) => ({ left, top: top ?? mix(left, "#ffffff", 0.3), right: right ?? darker(left, 0.76) });
// one light from the upper left of the picture: tops brightest, faces to the left mid, faces to the right darkest
const LIGHT = (() => { const v = [-0.3, 0.55, 0.78], l = Math.hypot(...v); return v.map((c) => c / l); })();
const STOPS = [-0.3, 0.55, 0.78];
export function tone(m, n) {
  const s = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  if (s <= STOPS[0]) return m.right;
  if (s <= STOPS[1]) return mix(m.right, m.left, (s - STOPS[0]) / (STOPS[1] - STOPS[0]));
  if (s <= STOPS[2]) return mix(m.left, m.top, (s - STOPS[1]) / (STOPS[2] - STOPS[1]));
  return m.top;
}
// the direction a shadow falls on the ground, per metre of height (the light's horizontal part, reversed)
export const SHADOW = [0.6, -0.4];

// ── The camera ──────────────────────────────────────────────────────────────
export function camera(points, width, height, opts = {}) {
  const P = k.fitProjection(points, width, height, { azimuth: 45, elevation: 30, ...opts });
  const a = Math.PI / 4, e = Math.PI / 6;
  return { P, at: (p) => k.iso(p, P), depth: (p) => k.depthOf(p, P), view: [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)] };
}

// ── Geometry ────────────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
// a polygon's normal by Newell's method
export function normalOf(poly) {
  const n = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
  return unit(n);
}
const centroid = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
export const boundsOf = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])), z0: Math.min(...pts.map((p) => p[2])), z1: Math.max(...pts.map((p) => p[2])) });
export const circle = (cx, cy, r, n = 32, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
// a rectangle on the ground turned by `rot` about its centre
export const rectAt = (cx, cy, w, d, rot = 0) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [cx + u * Math.cos(rot) - v * Math.sin(rot), cy + u * Math.sin(rot) + v * Math.cos(rot)]);

// ── The scene ───────────────────────────────────────────────────────────────
export function scene(cam) {
  const { at, depth, view } = cam;
  const fmt = (pts) => "M" + pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z";
  const path = (pts, fill, seam = 0.5) => `<path d="${fmt(pts)}" fill="${fill}"${seam ? ` stroke="${fill}" stroke-width="${seam}" stroke-linejoin="round"` : ""}/>`;
  const line = (pts, colour, w = 1, extra = "") => `<path d="M${pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L")}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const ground = [];      // drawn first, in the order given: the land, water, roads, shadows
  const items = [];       // sorted: { svg, b (plan and height bounds), s (screen bounds), key, kind }
  const top = [];         // drawn last: wires
  const screenOf = (pts) => { const q = pts.map(at); return { x0: Math.min(...q.map((p) => p[0])), x1: Math.max(...q.map((p) => p[0])), y0: Math.min(...q.map((p) => p[1])), y1: Math.max(...q.map((p) => p[1])) }; };
  const add = (svg, pts, kind = "solid") => { const b = boundsOf(pts); items.push({ svg, b, s: screenOf(pts), key: depth([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.z0]), kind }); };

  // a convex solid from its faces (each a list of 3D points); faces turned away are dropped
  function solid(faces, m, { extra = "", kind } = {}) {
    const all = faces.flat(), c = centroid(all), out = [];
    for (const f of faces) {
      let n = normalOf(f);
      if (dot(n, sub(centroid(f), c)) < 0) n = n.map((v) => -v);
      if (dot(n, view) <= 1e-6) continue;
      out.push({ d: depth(centroid(f)), svg: path(f, typeof m === "function" ? m(f, n) : tone(m, n)) });
    }
    out.sort((a, b) => a.d - b.d);
    add(out.map((o) => o.svg).join("") + extra, all, kind);
  }
  // a prism: a convex outline on the ground extruded from z0 to z0 + h
  const prismFaces = (ring, z0, h) => [ring.map(([x, y]) => [x, y, z0]), ring.map(([x, y]) => [x, y, z0 + h]), ...ring.map((p, i) => { const q = ring[(i + 1) % ring.length]; return [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z0 + h], [p[0], p[1], z0 + h]]; })];
  const prism = (ring, z0, h, m, opts) => solid(prismFaces(ring, z0, h), m, opts);
  const box = (x, y, w, d, z0, h, m, opts) => prism([[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z0, h, m, opts);
  // a gabled roof over a rectangle, its ridge along x or y
  function gable(x, y, w, d, z0, h, m, along = "x", opts) {
    const faces = along === "x"
      ? [[[x, y, z0], [x + w, y, z0], [x + w, y + d / 2, z0 + h], [x, y + d / 2, z0 + h]], [[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d / 2, z0 + h], [x, y + d / 2, z0 + h]], [[x, y, z0], [x, y + d, z0], [x, y + d / 2, z0 + h]], [[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d / 2, z0 + h]], [[x, y, z0], [x + w, y, z0], [x + w, y + d, z0], [x, y + d, z0]]]
      : [[[x, y, z0], [x, y + d, z0], [x + w / 2, y + d, z0 + h], [x + w / 2, y, z0 + h]], [[x + w, y, z0], [x + w, y + d, z0], [x + w / 2, y + d, z0 + h], [x + w / 2, y, z0 + h]], [[x, y, z0], [x + w, y, z0], [x + w / 2, y, z0 + h]], [[x, y + d, z0], [x + w, y + d, z0], [x + w / 2, y + d, z0 + h]], [[x, y, z0], [x + w, y, z0], [x + w, y + d, z0], [x, y + d, z0]]];
    solid(faces, m, opts);
  }
  // a body of revolution standing up: [z, r] points, optional bands of other materials, an open or capped top
  function turned(cx, cy, profile0, m, { segs = 40, top: cap = "cap", topFill, bands = [], extra = "" } = {}) {
    const cuts = bands.flatMap(([a, b]) => [a, b]), profile = [profile0[0]];
    for (let i = 1; i < profile0.length; i++) { const [za, ra] = profile0[i - 1], [zb, rb] = profile0[i]; for (const z of cuts.filter((z) => z > za + 1e-6 && z < zb - 1e-6).sort((p, q) => p - q)) profile.push([z, ra + ((rb - ra) * (z - za)) / (zb - za)]); profile.push([zb, rb]); }
    const quads = [], pts = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const [z0, r0] = profile[i], [z1, r1] = profile[i + 1];
      const band = bands.find(([a, b]) => (z0 + z1) / 2 >= a && (z0 + z1) / 2 <= b), mm = band ? band[2] : m;
      const slope = (r0 - r1) / ((z1 - z0) || 1e-6), nz = slope / Math.hypot(1, slope), nh = 1 / Math.hypot(1, slope);
      for (let j = 0; j < segs; j++) {
        const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2, n = [Math.cos(am) * nh, Math.sin(am) * nh, nz];
        const q = [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z0], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, z0], [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, z1], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, z1]];
        pts.push(q[0], q[2]);
        if (dot(n, view) <= 1e-6) continue;
        quads.push({ d: depth(centroid(q)), svg: path(q, tone(mm, n), 0.3) });
      }
    }
    quads.sort((a, b) => a.d - b.d);
    const [zt, rt] = profile[profile.length - 1];
    let lid = "";
    if (cap === "cap" && rt > 0.01) lid = path(circle(cx, cy, rt, segs).map(([x, y]) => [x, y, zt]), topFill ?? m.top);
    if (cap === "open") lid = path(circle(cx, cy, rt, segs).map(([x, y]) => [x, y, zt]), darker(m.left, 0.62)) + path(circle(cx, cy, rt * 0.94, segs).map(([x, y]) => [x, y, zt]), darker(m.left, 0.45));
    add(quads.map((q) => q.svg).join("") + lid + extra, pts);
  }
  // a terrain facet: a triangle coloured by its own normal
  function facet(tri, m) {
    let n = normalOf(tri);
    if (n[2] < 0) n = n.map((v) => -v);
    if (dot(n, view) <= 1e-6) return;
    add(path(tri, tone(m, n), 0.6), tri, "terrain");
  }
  // flat things lying on a surface that is part of the sorted world (water on the highland, a road up a slope)
  const decal = (svg, pts) => add(svg, pts, "decal");
  // a free-standing drawing in space: lattices, rails, poles
  const strokes = (svg, pts) => add(svg, pts, "strokes");

  // ── The painter's order ───────────────────────────────────────────────────
  // A is drawn before B when A lies wholly behind B along x or along y (the
  // viewer is toward +x +y); when their plans overlap, the lower goes first;
  // terrain and decals go under what stands on them. Only pairs whose screen
  // boxes overlap are compared; a cycle is broken by depth.
  function order() {
    const n = items.length, eps = 0.05;
    const before = (A, B) => {
      const a = A.b, b = B.b;
      if (a.x1 <= b.x0 + eps) return true; if (b.x1 <= a.x0 + eps) return false;
      if (a.y1 <= b.y0 + eps) return true; if (b.y1 <= a.y0 + eps) return false;
      const flatA = A.kind === "terrain" || A.kind === "decal", flatB = B.kind === "terrain" || B.kind === "decal";
      if (A.kind === "decal" && B.kind === "terrain") return false;
      if (B.kind === "decal" && A.kind === "terrain") return true;
      if (flatA && !flatB) return true; if (flatB && !flatA) return false;
      if (a.z1 <= b.z0 + eps) return true; if (b.z1 <= a.z0 + eps) return false;
      return A.key < B.key;
    };
    // screen grid buckets for the overlap test
    const cell = 40, grid = new Map();
    items.forEach((it, i) => { for (let gx = Math.floor(it.s.x0 / cell); gx <= Math.floor(it.s.x1 / cell); gx++) for (let gy = Math.floor(it.s.y0 / cell); gy <= Math.floor(it.s.y1 / cell); gy++) { const key = gx + "," + gy; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); } });
    const succ = Array.from({ length: n }, () => new Set()), indeg = new Array(n).fill(0), seen = new Set();
    for (const list of grid.values()) for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const i = list[p], j = list[q], pair = i < j ? i * n + j : j * n + i;
      if (seen.has(pair)) continue; seen.add(pair);
      const A = items[i], B = items[j];
      if (A.s.x1 <= B.s.x0 || B.s.x1 <= A.s.x0 || A.s.y1 <= B.s.y0 || B.s.y1 <= A.s.y0) continue;
      const [u, v] = before(A, B) ? [i, j] : [j, i];
      if (!succ[u].has(v)) { succ[u].add(v); indeg[v]++; }
    }
    // Kahn's algorithm, taking the furthest ready item first; when stuck, release the furthest remaining
    const done = new Array(n).fill(false), out = [];
    const ready = items.map((_, i) => i).filter((i) => indeg[i] === 0).sort((a, b) => items[b].key - items[a].key);
    const pushReady = (i) => { let lo = 0, hi = ready.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (items[ready[mid]].key > items[i].key) lo = mid + 1; else hi = mid; } ready.splice(lo, 0, i); };
    let cycles = 0;
    while (out.length < n) {
      let i;
      if (ready.length) i = ready.pop();
      else { cycles++; i = items.map((_, j) => j).filter((j) => !done[j]).reduce((a, b) => (items[a].key < items[b].key ? a : b)); }
      if (done[i]) continue;
      done[i] = true; out.push(i);
      for (const v of succ[i]) if (!done[v] && --indeg[v] === 0) pushReady(v);
    }
    return { order: out, cycles };
  }
  function svg() { const { order: o, cycles } = order(); return { body: ground.join("") + o.map((i) => items[i].svg).join("") + top.join(""), cycles, count: items.length }; }
  return { at, depth, fmt, path, line, ground, top, items, solid, prism, prismFaces, box, gable, turned, facet, decal, strokes, svg };
}

// ── The registry: every solid's footprint, and the rules nothing may break ──
export function registry() {
  const things = [], problems = [];
  // a footprint is a convex ring on the ground; `group` lets the parts of one thing touch; `clear` is the gap kept round it
  function overlap(a, b) {
    // separating axis test on two convex rings
    for (const ring of [a, b]) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], nx = -(q[1] - p[1]), ny = q[0] - p[0];
      const proj = (r) => r.map(([x, y]) => x * nx + y * ny);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
    return true;
  }
  const grow = (ring, by) => { const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]); return ring.map(([x, y]) => { const dx = x - c[0], dy = y - c[1], l = Math.hypot(dx, dy) || 1; return [x + (dx / l) * by, y + (dy / l) * by]; }); };
  function fits(ring, { z0 = 0, z1 = 1, group = null, clear = 1 } = {}) {
    const g = grow(ring, clear);
    return things.every((t) => (group && t.group === group) || z1 <= t.z0 || t.z1 <= z0 || !overlap(g, t.ring));
  }
  function claim(name, ring, { z0 = 0, z1 = 1, group = null, clear = 1 } = {}) {
    const g = grow(ring, clear);
    for (const t of things) if (!(group && t.group === group) && !(z1 <= t.z0 || t.z1 <= z0) && overlap(g, t.ring)) problems.push(`${name} overlaps ${t.name}`);
    things.push({ name, ring, z0, z1, group });
  }
  return { things, problems, fits, claim, overlap, grow };
}
