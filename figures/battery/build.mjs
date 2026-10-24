// The battery post's card: a grid battery plant seen by someone standing on its
// perimeter track. Eye height 1.7 m, ten and a half metres off the outermost row
// and six back from its end, looking along it: the nearest 20 ft battery
// container stands whole at the right of the card, roof to sleepers, its door
// end turned toward you and cut by the card's edge; the next one,
// the row's power conversion skid (inverter, MV transformer, ring main unit)
// and the last two containers recede to the left. Past the near container's
// door end are the ends of the rows behind. Every container's charge lamp and
// the fans run one real day of the post's Double Dueling DQN agent (4 December
// 2018, from the post's own CSV), one hour every 1.25 s: the plant is one
// battery, dispatched as one. Units are metres.
// Run: node figures/battery/build.mjs   writes staticfiles/image/thumbnails/battery/
//      scene.svg and scene.js, and figures/battery/preview.html
//      --stills <dir>   also the card held at four hours of the day
//      --sizes          the size of each part of the drawing
//      --colour         the daylight variant instead: scene-colour.svg, scene-colour.js
//                       and preview-colour.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { BATTERY, dayOf, stateAt } from "./model.mjs";
import { lookFrom, persp } from "./camera.mjs";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const OUT = join(ROOT, "staticfiles/image/thumbnails/battery");
const SCOPE = ".scene-battery";
const WIDTH = 1400, HEIGHT = 200;
// Left of this the card's white fade is opaque on every card width, so nothing there is drawn.
const VEIL = 260;
const COLOUR = process.argv.includes("--colour");
const NAME = COLOUR ? "scene-colour" : "scene";
// a part's material: in daylight each part takes its own paint, in navy every part shares one
const M = (material, svg) => (COLOUR ? `<g class="bt-m-${material}">${svg}</g>` : svg);

// ── The day: the post's CSV, hour by hour ────────────────────────────────────
const DATE = "04/12/2018";
const csv = readFileSync(join(ROOT, "staticfiles/js/Post_3/dqn_battery_timeseries_V2.csv"), "utf8").trim().split("\n").slice(1).map((line) => line.split(","));
const first = csv.findIndex((row) => row[1].startsWith(DATE));
const rows = csv.slice(first, first + 25).map(([, date, price, soc, action]) => ({ date, price: +price, soc: +soc, action: +action }));
const DAY = dayOf(rows.slice(0, 24));
// the model must reproduce the post's record, and the day must close where it opened
rows.forEach((row, h) => {
  const soc = stateAt(DAY, h - 1e-9).soc;
  if (h > 0 && Math.abs(soc - row.soc) > 1e-4) throw new Error(`SoC at ${row.date}: model ${soc}, CSV ${row.soc}`);
});
if (Math.abs(rows[24].soc - rows[0].soc) > 1e-9) throw new Error("the day does not close: the loop would jump");
const SECONDS_PER_HOUR = 1.25;
const STILL_HOUR = 19.5; // reduced motion: the evening peak, discharging at full power

// ── Site plan, in metres (x along the rows, y toward the viewer, z up) ───────
// Each row is one block: two containers, the PCS skid, two containers, all on
// concrete sleepers on a gravel bed, with a cable trench in front of them and
// an access track beyond. Rows are 10 m apart; row 0 is the outermost.
const C = { L: 6.058, W: 2.438, H: 2.591, plinth: 0.3 };          // ISO 20 ft, on sleepers
const Z0 = C.plinth, Z1 = C.plinth + C.H;
const PCS = { L: 7.4, W: 2.2, skid: 0.32 };
const SLOTS = [[0, "c"], [7.26, "c"], [14.72, "pcs"], [23.52, "c"], [30.78, "c"]];
const ROW_END = 36.84, PITCH = 10, ROWS = [0, 1, 2, 3];
const rowY = (r) => -r * PITCH;
const TRENCH = [1.9, 2.5], BED = [-C.W / 2 - 0.6, 2.85], TRACK = [3.5, 7.6]; // from the row's centre line
const FENCE_X = ROW_END + 7;

// ── Camera: a person on the perimeter track ─────────────────────────────────
// A pinhole camera, level (verticals stay vertical), eye at 1.7 m. Placed so the
// near container's front top corner at its door end sits at ANCHOR on the card.
const RAD = Math.PI / 180;
const EYE = [-7.56, 10.74, 1.7], YAW = -45 * RAD, FOCAL = 660, ANCHOR = { at: [0, C.W / 2, Z1], screen: [1320, 14] };
const CAM = (() => {
  const probe = lookFrom(EYE, YAW, 0, FOCAL, 0, 0), [x, y] = persp(ANCHOR.at, probe);
  return lookFrom(EYE, YAW, 0, FOCAL, ANCHOR.screen[0] - x, ANCHOR.screen[1] - y);
})();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
const depthOf = (p) => dot(sub(p, EYE), CAM.fwd);
const P = (p) => persp(p, CAM);
const scaleAt = (p) => FOCAL / depthOf(p);
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const f3 = (v) => (Math.round(v * 1000) / 1000).toString();

// ── Light and haze ───────────────────────────────────────────────────────────
// The sun high over the viewer's left shoulder: fronts catch the most, door ends less.
const LIGHT = unit([-0.35, 0.55, 0.75]);
const band = (n) => { const d = dot(unit(n), LIGHT); return d > 0.5 ? 3 : d > 0.25 ? 2 : d > 0 ? 1 : 0; };
// a ladder of tone sets, nearest first, picked per part by its distance
const hazeOf = (p) => Math.max(0, Math.min(5, Math.floor((depthOf(p) - 9) / 6.5)));

// ── Drawing in perspective ───────────────────────────────────────────────────
const L = (pts, tone = "lo", free) => k.lineSvg(k.pathOf(pts.map(P)), { tone, free });
const Ls = (list, tone = "lo", free) => k.lineSvg(list.map((pts) => k.pathOf(pts.map(P))).join(""), { tone, free });
const poly = (pts) => k.pathOf(pts.map(P), true);
const fill = (cls, list) => `<path class="${cls}" d="${list.map(poly).join("")}"/>`;
const dots = (pts, size, tone) => k.dotsSvg(pts.map(P), { size, tone });
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
// A convex solid from its faces (each an outward-wound polygon with its normal):
// the faces you can see, each in the tone its facing earns, the hull as outline,
// and creases where two seen faces meet.
function solid(faces, style = {}) {
  const seen = faces.filter((f) => dot(f.n, sub(EYE, f.pts[0])) > 1e-9);
  const shades = [[], [], [], []], top = [];
  for (const f of seen) (f.n[2] > 0.9 ? top : shades[band(f.n)]).push(poly(f.pts));
  const key = (p) => p.map((v) => v.toFixed(4)).join(",");
  const edges = new Map();
  for (const f of seen) f.pts.forEach((p, i) => {
    const q = f.pts[(i + 1) % f.pts.length], id = [key(p), key(q)].sort().join("|");
    edges.set(id, edges.has(id) ? [p, q, true] : [p, q, false]);
  });
  const crease = [...edges.values()].filter(([, , shared]) => shared).map(([p, q]) => k.pathOf([P(p), P(q)])).join("");
  const outline = k.pathOf(hull(seen.flatMap((f) => f.pts.map(P))), true);
  return k.solidSvg({ fill: outline, outline, shades: shades.map((s) => s.join("")), top: top.join(""), crease }, { crease: "faint", ...style });
}
// an upright box over x0..x1, y0..y1, z0..z1
function boxFaces([x0, x1], [y0, y1], [z0, z1]) {
  const c = (x, y, z) => [x, y, z];
  return [
    { n: [-1, 0, 0], pts: [c(x0, y1, z0), c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1)] },
    { n: [1, 0, 0], pts: [c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)] },
    { n: [0, -1, 0], pts: [c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)] },
    { n: [0, 1, 0], pts: [c(x1, y1, z0), c(x0, y1, z0), c(x0, y1, z1), c(x1, y1, z1)] },
    { n: [0, 0, -1], pts: [c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0), c(x1, y0, z0)] },
    { n: [0, 0, 1], pts: [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)] },
  ];
}
const box = (xs, ys, zs, style) => solid(boxFaces(xs, ys, zs), style);
// a round rod or drum: a ring about `centre` in the plane of u, v, swept along `axis`
function drumFaces(centre, u, v, r, axis, steps = 14) {
  const ring = Array.from({ length: steps }, (_, i) => { const a = (i / steps) * Math.PI * 2; return add(centre, add(mul(u, r * Math.cos(a)), mul(v, r * Math.sin(a)))); });
  const far = ring.map((p) => add(p, axis));
  const n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  const s = dot(n, axis) > 0 ? 1 : -1;
  const faces = [{ n: mul(n, -s), pts: ring }, { n: mul(n, s), pts: far }];
  ring.forEach((p, i) => { const j = (i + 1) % steps, mid = mul(add(p, ring[j]), 0.5); faces.push({ n: unit(sub(mid, centre)), pts: [p, ring[j], far[j], far[i]] }); });
  return faces;
}
// A face-local affine at a point: maps local (u right, v down) metres onto the
// screen, the way the kit's sideMatrix does. The fans turn inside it.
function faceMatrix(o, u, v) {
  const e = 0.05, [x, y] = P(o), a = P(add(o, mul(u, e))), b = P(add(o, mul(v, e)));
  return `matrix(${[(a[0] - x) / e, (a[1] - y) / e, (b[0] - x) / e, (b[1] - y) / e, x, y].map(f3).join(" ")})`;
}

// ── Fans: the containers' air conditioners and the inverter's door fans ─────
// Each kind's blades and guard are drawn once, in metres about the origin; a fan
// in place is its dark throat, the blades (a <use> the page turns) and the guard,
// in the face's own plane.
const FANS = { hvac: { r: 0.4, blades: 5 }, pcs: { r: 0.27, blades: 7 } };
const circle = (cx, cy, r, cls) => `<circle class="${cls}" cx="${f3(cx)}" cy="${f3(cy)}" r="${f3(r)}"/>`;
function fanDefs() {
  return Object.entries(FANS).map(([kind, { r, blades }]) => {
    const blade = (a) => {
      const p = (ang, rad) => [rad * Math.cos(ang), rad * Math.sin(ang)];
      const [a0, a1] = [a - 0.36, a + 0.3];
      const pts = [p(a0, r * 0.26), p(a0 - 0.12, r * 0.9), p(a + 0.02, r * 0.96), p(a1, r * 0.88), p(a1 + 0.1, r * 0.28)];
      return "M" + pts.map((q) => q.map(f3).join(" ")).join("L") + "Z";
    };
    const set = Array.from({ length: blades }, (_, i) => blade((i / blades) * Math.PI * 2)).join("");
    const rings = [0.38, 0.68].map((t) => circle(0, 0, r * t, "bt-guard")).join("");
    const spokes = [0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2 + Math.PI / 4; return `M${f3(r * 0.12 * Math.cos(a))} ${f3(r * 0.12 * Math.sin(a))}L${f3(r * Math.cos(a))} ${f3(r * Math.sin(a))}`; }).join("");
    return `<g id="bt-fan-${kind}"><path class="bt-blade" d="${set}"/>${circle(0, 0, r * 0.22, "bt-hub")}</g>` +
      `<g id="bt-guard-${kind}">${rings}<path class="bt-guard" d="${spokes}"/>${circle(0, 0, r * 0.12, "bt-guard")}${circle(0, 0, r, "bt-guard bt-rim")}</g>`;
  }).join("");
}
let fanPhase = 0;
function fan(kind, o, u, v) {
  fanPhase = (fanPhase + 137) % 360;
  return `<g class="bt-face" transform="${faceMatrix(o, u, v)}">${circle(0, 0, FANS[kind].r, "bt-throat")}<use href="#bt-fan-${kind}" data-fan="${kind}" data-ph="${fanPhase}"/><use href="#bt-guard-${kind}"/></g>`;
}

// The charge lamp: a column of segments behind a window, lit from the bottom up
// to the plant's state of charge. Every lamp shows the same charge.
function lamp(F, s0, s1, t0, t1, w, n, steps) {
  const h = (t1 - t0) / n, segs = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + i * h, q = [F(s0, a + h * 0.12, w), F(s1, a + h * 0.12, w), F(s1, a + h * 0.88, w), F(s0, a + h * 0.88, w)];
    segs.push(`<path class="bt-seg-off" d="${poly(q)}"/><path class="bt-seg" style="--n:${i}" d="${poly(q)}"/>`);
  }
  return `<g class="bt-lamp" data-steps="${steps}" style="--segs:${n}">${segs.join("")}</g>`;
}

// ── A battery container ──────────────────────────────────────────────────────
// x0 is its door end, yr its row's centre line. Long front (toward the track),
// from the door end: the charge lamp, the wall-hung air conditioner, rating plate
// and emergency stop, a personnel door, the DC cable entry. The door end carries
// the ISO cargo doors. The fan and the lamp sit nearest the card's right edge,
// where the white fade is thinnest. Detail follows its size on the card.
function container(x0, yr, tier) {
  const fy = yr + C.W / 2, by = yr - C.W / 2, x1 = x0 + C.L;
  const near = tier === "near", far = tier === "far";
  const F = (s, t, w = 0) => [x0 + s, fy + w, Z0 + t];   // front, s from the door end
  const E = (e, t, w = 0) => [x0 - w, fy - e, Z0 + t];   // door end, e from the front corner
  const out = [];
  // the gravel under it in its own shade, seen through the gap over the sleepers
  out.push(fill("bt-under", [[[x0 - 0.05, by - 0.05, 0], [x1 + 0.05, by - 0.05, 0], [x1 + 0.05, fy + 0.12, 0], [x0 - 0.05, fy + 0.12, 0]]]));
  // the strobe beacon of its fire system on the roof, behind the front edge
  if (!far) {
    out.push(M("trim", solid(drumFaces([x0 + 0.45, fy - 0.35, Z1], [1, 0, 0], [0, 1, 0], 0.09, [0, 0, 0.07], 12), { tone: "mid", crease: "none" })));
    out.push(M("amber", solid(drumFaces([x0 + 0.45, fy - 0.35, Z1 + 0.07], [1, 0, 0], [0, 1, 0], 0.065, [0, 0, 0.13], 12), { tone: "hi", crease: "none" })));
    out.push(M("white", solid(boxFaces([x1 - 1.3, x1 - 0.9], [yr - 0.2, yr + 0.2], [Z1, Z1 + 0.3]), { tone: "mid" })));
  }
  // three concrete sleepers
  for (const s of [0.2, C.L / 2 - 0.35, C.L - 0.9]) out.push(M("concrete", box([x0 + s, x0 + s + 0.7], [by - 0.1, fy + 0.1], [0, Z0], { tone: "lo", crease: near ? "faint" : "none" })));
  // the box, with its rails, posts and corrugation under the outline
  const inner = [];
  const RAIL = [0.16, C.H - 0.16], POST = 0.15;
  // far off the door end has no corner posts to stop on, so its rails run to the outline
  const railLine = (t) => [E(far ? C.W : C.W - POST, t), E(0, t), F(0, t), F(C.L, t)];
  if (!far) {
    // corrugation: trapezoid ribs 0.27 m apart, the flank turned from the light in shade
    const n = 21, pitch = (C.L - 2 * POST) / n, shadeA = [], shadeB = [], crest = [];
    for (let i = 0; i < n; i++) {
      const s = POST + i * pitch, d = 0.036, q = pitch / 4;
      const flank = (sa, wa, sb, wb) => [F(sa, RAIL[0], wa), F(sb, RAIL[0], wb), F(sb, RAIL[1], wb), F(sa, RAIL[1], wa)];
      shadeA.push(flank(s + q, 0, s + 2 * q, -d));
      shadeB.push(flank(s + 3 * q, -d, s + 4 * q, 0));
      if (near) crest.push([F(s + q, RAIL[0]), F(s + q, RAIL[1])]);
      else if (i % 2 === 0) crest.push([F(s + q, RAIL[0]), F(s + q, RAIL[1])]);
    }
    const bA = band([0.46, 0.89, 0]), bB = band([-0.46, 0.89, 0]);
    inner.push(fill(`iso-shade" data-shade="${bA}`, shadeA), fill(`iso-shade" data-shade="${bB}`, shadeB));
    inner.push(Ls(crest, near ? "lo" : "faint"));
    // the door end's cargo doors: two leaves of pressed ribs on four lock bars
    const ribs = [];
    for (const [e0, e1] of [[POST, C.W / 2 - 0.01], [C.W / 2 + 0.01, C.W - POST]]) for (const t of [0.55, 0.95, 1.35, 1.75, 2.15]) ribs.push([E(e0, t), E(e1, t)]);
    inner.push(Ls(ribs, "faint"));
    inner.push(Ls([[E(C.W / 2, RAIL[0]), E(C.W / 2, RAIL[1])], [E(POST, RAIL[0]), E(POST, RAIL[1])], [E(C.W - POST, RAIL[0]), E(C.W - POST, RAIL[1])]], "lo"));
  }
  inner.push(Ls([railLine(RAIL[0]), railLine(RAIL[1]), [F(POST, RAIL[0]), F(POST, RAIL[1])], [F(C.L - POST, RAIL[0]), F(C.L - POST, RAIL[1])]], far ? "faint" : "lo"));
  if (near) {
    // the rails' lips cast a thin shadow on the panels below them
    inner.push(fill(`iso-shade" data-shade="0`, [[F(POST, RAIL[1]), F(C.L - POST, RAIL[1]), F(C.L - POST, RAIL[1] - 0.035), F(POST, RAIL[1] - 0.035)]]));
    // forklift pockets in the bottom rail
    inner.push(fill("bt-pocket", [C.L / 2 - 1.2, C.L / 2 + 0.85].map((s) => [F(s, 0.025), F(s + 0.355, 0.025), F(s + 0.355, 0.13), F(s, 0.13)])));
    inner.push(Ls([C.L / 2 - 1.2, C.L / 2 + 0.85].map((s) => [F(s, 0.025), F(s + 0.355, 0.025), F(s + 0.355, 0.13), F(s, 0.13), F(s, 0.025)]), "lo"));
  }
  out.push(M("white", box([x0, x1], [by, fy], [Z0, Z1], { tone: far ? "mid" : "hi", crease: far ? "none" : "faint", inner: inner.join("") })));
  if (!far) {
    // ISO corner castings, each with its oval twistlock hole on both faces
    const cast = [];
    for (const t of [0, C.H - 0.118]) {
      cast.push(box([x0 - 0.004, x0 + 0.178], [fy - 0.162, fy + 0.004], [Z0 + t, Z0 + t + 0.118], { tone: "mid", crease: "none" }));
      cast.push(box([x1 - 0.178, x1 + 0.004], [fy - 0.162, fy + 0.004], [Z0 + t, Z0 + t + 0.118], { tone: "mid", crease: "none" }));
      cast.push(box([x0 - 0.004, x0 + 0.178], [by - 0.004, by + 0.162], [Z0 + t, Z0 + t + 0.118], { tone: "mid", crease: "none" }));
    }
    out.push(M("trim", cast.join("")));
    if (near) {
      const holes = [];
      for (const t of [0.03, C.H - 0.088]) {
        holes.push([F(0.04, t, 0.005), F(0.14, t, 0.005), F(0.14, t + 0.055, 0.005), F(0.04, t + 0.055, 0.005)]);
        holes.push([F(C.L - 0.14, t, 0.005), F(C.L - 0.04, t, 0.005), F(C.L - 0.04, t + 0.055, 0.005), F(C.L - 0.14, t + 0.055, 0.005)]);
        holes.push([E(0.035, t, 0.005), E(0.125, t, 0.005), E(0.125, t + 0.055, 0.005), E(0.035, t + 0.055, 0.005)]);
      }
      out.push(fill("bt-pocket", holes));
    }
  }
  // the door end's lock bars, keepers, cam handles and hinges
  if (!far) {
    const bars = [0.42, 0.82, 1.62, 2.02].map((e) => e * (C.W / 2.44));
    out.push(M("white", Ls(bars.map((e) => (near ? [E(e, RAIL[0] + 0.06, 0.03), E(e, RAIL[1] - 0.06, 0.03)] : [E(e, RAIL[0]), E(e, RAIL[1])])), "mid")));
    if (near) {
      out.push(M("trim", fill("bt-keeper", bars.flatMap((e) => [RAIL[0] + 0.03, RAIL[1] - 0.09].map((t) => [E(e - 0.03, t, 0.035), E(e + 0.03, t, 0.035), E(e + 0.03, t + 0.06, 0.035), E(e - 0.03, t + 0.06, 0.035)])))));
      out.push(M("white", Ls(bars.map((e, i) => [E(e, 1.0, 0.03), E(e + (i % 2 ? 0.16 : -0.16) * (i < 2 ? 1 : -1), 1.0, 0.03)]), "mid")));
      out.push(M("trim", fill("bt-keeper", [POST + 0.005, C.W - POST - 0.06].flatMap((e) => [0.35, 1.2, 2.05].map((t) => [E(e, t, 0.02), E(e + 0.055, t, 0.02), E(e + 0.055, t + 0.12, 0.02), E(e, t + 0.12, 0.02)])))));
      // the CSC safety approval plate on the left leaf
      if (COLOUR) out.push(M("plate", fill(`iso-shade" data-shade="3`, [[E(0.3, 1.55, 0.005), E(0.62, 1.55, 0.005), E(0.62, 1.75, 0.005), E(0.3, 1.75, 0.005)]])));
      out.push(M("white", L([E(0.3, 1.55, 0.005), E(0.62, 1.55, 0.005), E(0.62, 1.75, 0.005), E(0.3, 1.75, 0.005), E(0.3, 1.55, 0.005)], "lo")));
    }
  }
  // ── what is fixed to the front, far end first ──
  const fit = [];
  // DC cable entry: a gland box low on the front, three glands, cables down to the trench
  if (!far) {
    const g0 = 5.3, g1 = 5.72;
    fit.push({ s: g0, svg: () => {
      const svg = [];
      if (near) {
        // cables: each leaves its gland, bends out and drops through the trench cover's open slot
        for (const [i, s] of [g0 + 0.09, g0 + 0.225, g0 + 0.36].entries()) {
          const r = 0.028, pts = [];
          for (let j = 0; j <= 10; j++) {
            const u = j / 10, w = 0.09 + (TRENCH[0] - C.W / 2 + 0.25 + i * 0.06) * (1 - Math.cos((u * Math.PI) / 2)), t = 0.08 - (0.08 + Z0) * Math.sin((u * Math.PI) / 2);
            pts.push(F(s, t, w));
          }
          svg.push(M("cable", tube(pts, r)));
        }
      }
      svg.push(M("trim", box([x0 + g0, x0 + g1], [fy, fy + 0.18], [Z0 + 0.12, Z0 + 0.5], { tone: "mid", crease: near ? "faint" : "none", inner: near ? L([F(g1, 0.42, 0.18), F(g0, 0.42, 0.18), F(g0, 0.42, 0)], "faint") : "" })));
      if (near) for (const s of [g0 + 0.09, g0 + 0.225, g0 + 0.36]) svg.push(M("steel", solid(drumFaces([x0 + s, fy + 0.09, Z0 + 0.12], [1, 0, 0], [0, 1, 0], 0.042, [0, 0, -0.06], 10), { tone: "mid", crease: "none" })));
      return svg.join("");
    } });
  }
  // the personnel door: two leaves in a frame, seals, hinges, lever handles, a hazard sign
  const D = { s0: 3.45, s1: 5.13, t0: 0.16, t1: 2.3 };
  fit.push({ s: D.s0, svg: () => {
    const svg = [];
    const m = (D.s0 + D.s1) / 2;
    const leafIn = (a, b) => [F(a, D.t0 + 0.05, 0.03), F(b, D.t0 + 0.05, 0.03), F(b, D.t1 - 0.05, 0.03), F(a, D.t1 - 0.05, 0.03), F(a, D.t0 + 0.05, 0.03)];
    svg.push(M("white", box([x0 + D.s0, x0 + D.s1], [fy, fy + 0.03], [Z0 + D.t0, Z0 + D.t1], { tone: far ? "faint" : "lo", crease: "none",
      inner: far ? "" : Ls([[F(m, D.t0, 0.03), F(m, D.t1, 0.03)]], "lo") + (near ? Ls([leafIn(D.s0 + 0.05, m - 0.02), leafIn(m + 0.02, D.s1 - 0.05)], "faint") : "") })));
    if (near) {
      const hinges = [];
      for (const s of [D.s0 + 0.005, D.s1 - 0.045]) for (const t of [0.4, 1.25, 2.0]) hinges.push(box([x0 + s, x0 + s + 0.04], [fy + 0.03, fy + 0.06], [Z0 + t, Z0 + t + 0.12], { tone: "mid", crease: "none" }));
      svg.push(M("trim", hinges.join("")));
      // lever handles, each on its rose
      svg.push(M("steel", Ls([[F(m - 0.08, 1.05, 0.06), F(m - 0.26, 1.05, 0.06)], [F(m + 0.08, 1.05, 0.06), F(m + 0.26, 1.05, 0.06)]], "mid") +
        dots([F(m - 0.08, 1.05, 0.06), F(m + 0.08, 1.05, 0.06)], 0.55, "mid")));
      // battery hazard triangle, with its mark
      const tc = [m - 0.42, 1.72];
      const sign = [F(tc[0] - 0.13, tc[1], 0.031), F(tc[0] + 0.13, tc[1], 0.031), F(tc[0], tc[1] + 0.23, 0.031)];
      svg.push(M("sign", (COLOUR ? fill(`iso-shade" data-shade="3`, [sign]) : "") + L([...sign, sign[0]], "mid") +
        dots([F(tc[0], tc[1] + 0.07, 0.031)], 0.45, COLOUR ? "hi" : "mid")));
    }
    return svg.join("");
  } });
  // the wall-hung air conditioner: louvres low, a condenser fan behind its guard,
  // a condensate tray under it and the tray's drain to the gravel
  const H = { s0: 0.82, s1: 2.17, t0: 0.38, t1: 2.15, w: 0.42 };
  fit.push({ s: H.s0, svg: () => {
    const svg = [];
    const hf = (s, t) => F(s, t, H.w);
    if (!far) {
      svg.push(M("trim", box([x0 + H.s1 - 0.12, x0 + H.s1 - 0.08], [fy + H.w - 0.17, fy + H.w - 0.13], [0, Z0 + H.t0 - 0.06], { tone: "lo", crease: "none" }) +
        box([x0 + H.s0 - 0.03, x0 + H.s1 + 0.03], [fy, fy + H.w + 0.04], [Z0 + H.t0 - 0.06, Z0 + H.t0], { tone: "mid", crease: "none" })));
    }
    const louvres = [];
    if (!far) for (let t = H.t0 + 0.12; t < H.t0 + 0.62; t += near ? 0.09 : 0.18) louvres.push([hf(H.s0 + 0.1, t), hf(H.s1 - 0.1, t), hf(H.s1 - 0.1, t + 0.035), hf(H.s0 + 0.1, t + 0.035)]);
    const lid = [F(H.s0, H.t1 - 0.12, 0), F(H.s0, H.t1 - 0.12, H.w), F(H.s1, H.t1 - 0.12, H.w)];
    const ac = [];
    ac.push(box([x0 + H.s0, x0 + H.s1], [fy, fy + H.w], [Z0 + H.t0, Z0 + H.t1], { tone: far ? "mid" : "hi",
      inner: far ? "" : fill("bt-pocket", louvres) + (near ? Ls(louvres.map((q) => [...q, q[0]]), "lo") : "") + L(lid, "faint") }));
    const fc = hf((H.s0 + H.s1) / 2, H.t0 + 1.12);
    if (far) ac.push(M("fan", `<g class="bt-face" transform="${faceMatrix(fc, [1, 0, 0], [0, 0, -1])}">${circle(0, 0, FANS.hvac.r, "bt-throat")}${circle(0, 0, FANS.hvac.r, "bt-guard bt-rim")}</g>`));
    else ac.push(M("fan", fan("hvac", fc, [1, 0, 0], [0, 0, -1])));
    if (near) ac.push(dots([hf(H.s0 + 0.07, H.t1 - 0.06), hf(H.s1 - 0.07, H.t1 - 0.06), hf(H.s0 + 0.07, H.t0 + 0.06), hf(H.s1 - 0.07, H.t0 + 0.06)], 0.5, "mid"));
    svg.push(M("hvac", ac.join("")));
    return svg.join("");
  } });
  // the rating plate, and the emergency stop on its box below
  const PL = 2.55;
  if (!far) fit.push({ s: PL, svg: () => {
    const svg = [];
    svg.push(M("plate", box([x0 + PL, x0 + PL + 0.43], [fy, fy + 0.012], [Z0 + 1.48, Z0 + 1.82], { tone: "lo", crease: "none",
      inner: near ? Ls([1.74, 1.66, 1.58].map((t, j) => [F(PL + 0.05, t, 0.012), F(PL + 0.38 - j * 0.07, t, 0.012)]), "faint", "both") : "" })));
    svg.push(M("yellow", box([x0 + PL + 0.05, x0 + PL + 0.38], [fy, fy + 0.1], [Z0 + 0.92, Z0 + 1.25], { tone: "mid", crease: near ? "faint" : "none" })));
    if (near) svg.push(M("red", solid(drumFaces(F(PL + 0.215, 1.085, 0.1), [1, 0, 0], [0, 0, 1], 0.075, [0, 0.05, 0], 14), { tone: "hi", crease: "none" })));
    return svg.join("");
  } });
  // the charge lamp in its housing, at the door end
  const LP = { s0: 0.24, s1: 0.62, t0: 0.42, t1: 2.12, w: 0.07 };
  fit.push({ s: LP.s0, svg: () =>
    M("panel", box([x0 + LP.s0, x0 + LP.s1], [fy, fy + LP.w], [Z0 + LP.t0, Z0 + LP.t1], { tone: "mid", crease: far ? "none" : "faint" }) +
    lamp(F, LP.s0 + 0.06, LP.s1 - 0.06, LP.t0 + 0.08, LP.t1 - 0.08, LP.w, far ? 5 : 10, { near: 60, mid: 30, far: 10 }[tier])) });
  // an earth strap from the far bottom casting down to its rod in the gravel
  if (near) fit.push({ s: C.L - 0.1, svg: () => M("earth", L([F(C.L - 0.09, 0, 0.004), F(C.L - 0.09, -0.06, 0.15), F(C.L - 0.09, -Z0, 0.32)], "mid") + dots([F(C.L - 0.09, -Z0, 0.32)], 0.7, "mid")) });
  fit.sort((a, b) => b.s - a.s);
  out.push(...fit.map((f) => f.svg()));
  return out.join("");
}

// A cable: a round section swept along a polyline, as a filled band between its
// two edges, closed at both ends so its outline ends on itself.
function tube(pts, r) {
  const scr = pts.map(P), sc = pts.map(scaleAt);
  const left = [], right = [];
  scr.forEach((p, i) => {
    const a = scr[Math.max(0, i - 1)], b = scr[Math.min(scr.length - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...t) || 1, n = [-t[1] / len, t[0] / len], h = r * sc[i];
    left.push([p[0] + n[0] * h, p[1] + n[1] * h]); right.push([p[0] - n[0] * h, p[1] - n[1] * h]);
  });
  const d = k.pathOf([...left, ...right.reverse()], true);
  return `<path class="bt-cable" d="${d}"/>`;
}

// ── The power conversion skid ────────────────────────────────────────────────
// The inverter's door fans run with the power it converts.
function pcs(x0, yr, tier) {
  const out = [], near = tier !== "far", fy = yr + PCS.W / 2, by = yr - PCS.W / 2, zc = PCS.skid;
  out.push(fill("bt-under", [[[x0, by, 0], [x0 + PCS.L, by, 0], [x0 + PCS.L, fy + 0.1, 0], [x0, fy + 0.1, 0]]]));
  out.push(M("steel", box([x0, x0 + PCS.L], [by, fy], [0.05, zc], { tone: "lo", crease: "none", inner: L([[x0, by, 0.2], [x0, fy, 0.2], [x0 + PCS.L, fy, 0.2]], "faint") })));
  // far end first: the RMU: a slim cabinet with its mimic panel
  const rmu = { x: x0 + 6.0, x1: x0 + 7.1, y0: yr - 0.6, y1: yr + 0.75, h: 1.95 };
  out.push(M("rmu", box([rmu.x, rmu.x1], [rmu.y0, rmu.y1], [zc, zc + rmu.h], { tone: "hi", inner: near ? L([[rmu.x + 0.08, rmu.y1, zc + 0.08], [rmu.x1 - 0.08, rmu.y1, zc + 0.08], [rmu.x1 - 0.08, rmu.y1, zc + rmu.h - 0.1], [rmu.x + 0.08, rmu.y1, zc + rmu.h - 0.1], [rmu.x + 0.08, rmu.y1, zc + 0.08]], "lo") + L([[rmu.x + 0.15, rmu.y1, zc + 1.4], [rmu.x1 - 0.15, rmu.y1, zc + 1.4]], "mid") : "" })));
  // the MV transformer: tank, radiator fins toward the track, its cable box on top
  const tx = { x: x0 + 3.85, x1: x0 + 5.65, y0: yr - 0.7, y1: yr + 0.45, h: 1.7 };
  out.push(M("tx", box([tx.x + 0.25, tx.x1 - 0.25], [tx.y0 + 0.2, tx.y1 - 0.2], [zc + tx.h, zc + tx.h + 0.32], { tone: "mid", crease: "none" }) +
    box([tx.x, tx.x1], [tx.y0, tx.y1], [zc, zc + tx.h], { tone: "mid", crease: "none" })));
  const fins = [];
  if (near) for (let x = tx.x + 0.12; x < tx.x1 - 0.1; x += 0.12) fins.push([[x, tx.y1 + 0.42, zc + 0.2], [x, tx.y1 + 0.42, zc + tx.h - 0.3]]);
  out.push(M("tx", box([tx.x + 0.08, tx.x1 - 0.08], [tx.y1, tx.y1 + 0.42], [zc + 0.15, zc + tx.h - 0.25], { tone: "mid", crease: "none", inner: Ls(fins, "lo") })));
  // the inverter: a cabinet of four doors, grilles low, two fans high in the doors
  const inv = { x: x0 + 0.3, x1: x0 + 3.5, y0: yr - 0.8, y1: yr + 0.8, h: 2.2 };
  const doors = [], grille = [];
  for (let n = 0; n < 4; n++) {
    const a = inv.x + 0.06 + n * 0.785, b = a + 0.735;
    doors.push([[a, inv.y1, zc + 0.08], [b, inv.y1, zc + 0.08], [b, inv.y1, zc + inv.h - 0.1], [a, inv.y1, zc + inv.h - 0.1], [a, inv.y1, zc + 0.08]]);
    if (near) for (let t = 0.22; t < 0.62; t += 0.1) grille.push([[a + 0.12, inv.y1, zc + t], [b - 0.12, inv.y1, zc + t], [b - 0.12, inv.y1, zc + t + 0.04], [a + 0.12, inv.y1, zc + t + 0.04]]);
  }
  const cabinet = [box([inv.x, inv.x1], [inv.y0, inv.y1], [zc, zc + inv.h], { tone: "hi", inner: Ls(doors, "lo") + (grille.length ? fill("bt-pocket", grille) : "") })];
  for (const n of [1, 2]) {
    const c = [inv.x + 0.06 + n * 0.785 + 0.3675, inv.y1, zc + 1.6];
    cabinet.push(M("fan", near ? fan("pcs", c, [1, 0, 0], [0, 0, -1]) : `<g class="bt-face" transform="${faceMatrix(c, [1, 0, 0], [0, 0, -1])}">${circle(0, 0, FANS.pcs.r, "bt-throat")}</g>`));
  }
  if (near) cabinet.push(dots([0, 1, 2, 3].map((n) => [inv.x + 0.06 + n * 0.785 + 0.62, inv.y1, zc + 1.05]), 0.5, "mid"));
  out.push(M("inverter", cabinet.join("")));
  // cables down from the skid into the trench
  out.push(M("steel", box([x0 + 2.9, x0 + 3.3], [fy, yr + TRENCH[0] + 0.05], [0, zc + 0.12], { tone: "mid", crease: "none" })));
  return out.join("");
}

// ── Ground: projected point by point, cut at a near plane ────────────────────
const NEAR = 1.2;
function clipNear(pts) {
  const out = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], dp = depthOf(p) - NEAR, dq = depthOf(q) - NEAR;
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) out.push(add(p, mul(sub(q, p), dp / (dp - dq))));
  });
  return out;
}
const groundPoly = (pts) => { const c = clipNear(pts); return c.length > 2 ? k.pathOf(c.map(P), true) : ""; };
const offFrame = ([x, y]) => x < -1 || x > WIDTH + 1 || y < -1 || y > HEIGHT + 1;
// a ground line; an end the frame cuts off is marked free: the card crops it there
function groundLine(a, b, tone) {
  const c = clipNear([a, b]);
  if (c.length < 2) return "";
  const [p, q] = [c[0], c[c.length - 1]].map(P);
  if (Math.max(p[0], q[0]) < VEIL || Math.min(p[0], q[0]) > WIDTH || Math.min(p[1], q[1]) > HEIGHT) return "";
  const free = [offFrame(p) && "start", offFrame(q) && "end"].filter(Boolean);
  return k.lineSvg(k.pathOf([p, q]), { tone, free: free.length === 2 ? "both" : free[0] });
}
function ground() {
  const out = [], X0 = -1.2, X1 = ROW_END + 1.2;
  // the paved yard: the tracks, the cross road at the rows' ends, out to the fence
  out.push(`<path class="bt-pave" d="${groundPoly([[-9, 16, 0], [FENCE_X, 16, 0], [FENCE_X, -40, 0], [-9, -40, 0]])}"/>`);
  for (const r of ROWS) {
    const y = rowY(r), h = hazeOf([0, y, 0]);
    const g = [];
    // the row's gravel bed with its kerb, and the trench along its front
    g.push(`<path class="bt-bed" d="${groundPoly([[X0, y + BED[0], 0], [X1, y + BED[0], 0], [X1, y + BED[1], 0], [X0, y + BED[1], 0]])}"/>`);
    const t0 = y + TRENCH[0], t1 = y + TRENCH[1];
    g.push(`<path class="bt-trench" d="${groundPoly([[X0 + 0.3, t0, 0], [X1 - 0.3, t0, 0], [X1 - 0.3, t1, 0], [X0 + 0.3, t1, 0]])}"/>`);
    g.push(groundLine([X0, y + BED[0], 0], [X1, y + BED[0], 0], "lo"), groundLine([X0, y + BED[1], 0], [X1, y + BED[1], 0], "lo"));
    g.push(groundLine([X0, y + BED[0], 0], [X0, y + BED[1], 0], "lo"), groundLine([X1, y + BED[0], 0], [X1, y + BED[1], 0], "lo"));
    g.push(groundLine([X0 + 0.3, t0, 0], [X1 - 0.3, t0, 0], "lo"), groundLine([X0 + 0.3, t1, 0], [X1 - 0.3, t1, 0], "lo"));
    g.push(groundLine([X0 + 0.3, t0, 0], [X0 + 0.3, t1, 0], "lo"), groundLine([X1 - 0.3, t0, 0], [X1 - 0.3, t1, 0], "lo"));
    // the trench covers' joints, kerb to kerb; the near ones lifted where cables drop in
    const joints = [];
    for (let x = X0 + 0.3 + 0.6; x < X1 - 0.4; x += 0.6) joints.push(groundLine([x, t0, 0], [x, t1, 0], "faint"));
    g.push(...joints);
    // the track's slab joints, from the bed's kerb across to the far kerb
    const ty0 = y + TRACK[0], ty1 = y + TRACK[1];
    g.push(groundLine([X0, ty0, 0], [X1, ty0, 0], "faint"), groundLine([X0, ty1, 0], [X1, ty1, 0], "faint"));
    g.push(groundLine([X0, ty0, 0], [X0, ty1, 0], "faint"), groundLine([X1, ty0, 0], [X1, ty1, 0], "faint"));
    for (let x = X0 + 4; x < X1; x += 4) g.push(groundLine([x, ty0, 0], [x, ty1, 0], "faint"));
    out.push(`<g class="bt-h${h}">${g.join("")}</g>`);
  }
  // gravel on the near bed, each stone as big as its distance allows
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stones = new Map();
  for (const [y0, y1] of [[C.W / 2 + 0.1, TRENCH[0] - 0.05], [TRENCH[1] + 0.05, BED[1] - 0.05]]) for (let i = 0; i < 520; i++) {
    const p = [X0 + rand() * 22, y0 + rand() * (y1 - y0), 0], size = Math.min(1, Math.round(0.013 * scaleAt(p) * 10) / 10);
    if (size < 0.3) continue;
    const [sx, sy] = P(p);
    if (sx < VEIL || sx > WIDTH || sy > HEIGHT) continue;
    stones.set(size, [...(stones.get(size) || []), p]);
  }
  for (const [size, pts] of stones) out.push(dots(pts, size, "faint"));
  // open slots in the near trench where the containers' cables go down
  const slots = [];
  for (const [sx, kind] of SLOTS) if (kind === "c") slots.push(groundPoly([[sx + C.L - 1.0, TRENCH[0], 0.002], [sx + C.L - 0.3, TRENCH[0], 0.002], [sx + C.L - 0.3, TRENCH[1], 0.002], [sx + C.L - 1.0, TRENCH[1], 0.002]]));
  out.push(`<path class="bt-slot" d="${slots.join("")}"/>`);
  out.push(Ls(SLOTS.filter(([, kind]) => kind === "c").map(([sx]) => [[sx + C.L - 1.0, TRENCH[0], 0.002], [sx + C.L - 0.3, TRENCH[0], 0.002], [sx + C.L - 0.3, TRENCH[1], 0.002], [sx + C.L - 1.0, TRENCH[1], 0.002], [sx + C.L - 1.0, TRENCH[0], 0.002]]), "lo"));
  return out.join("");
}

// ── Far off: the horizon and the plant's end fence ───────────────────────────
function distance() {
  const out = [];
  const [hx, hy] = [VEIL, CAM.cy];
  out.push(k.lineSvg(`M${hx} ${f1(hy)}H${WIDTH}`, { tone: "faint", free: "both" }));
  // the fence across the rows' far end: posts, a top rail, two tension wires
  const posts = [], y0 = -36, y1 = 15;
  for (let y = y0; y <= y1; y += 3) posts.push([[FENCE_X, y, 0], [FENCE_X, y, 2.4]]);
  out.push(`<g class="bt-h5">${Ls(posts, "lo")}${Ls([[[FENCE_X, y0, 2.4], [FENCE_X, y1, 2.4]], [[FENCE_X, y0, 0.15], [FENCE_X, y1, 0.15]], [[FENCE_X, y0, 0], [FENCE_X, y1, 0]]], "lo")}${Ls([[[FENCE_X, y0, 0.9], [FENCE_X, y1, 0.9]], [[FENCE_X, y0, 1.7], [FENCE_X, y1, 1.7]]], "faint")}</g>`);
  return out.join("");
}

// ── Compose: far to near ─────────────────────────────────────────────────────
const objects = [];
for (const r of ROWS) for (const [sx, kind] of SLOTS) {
  const y = rowY(r), isPcs = kind === "pcs";
  const plan = isPcs ? [sx, sx + PCS.L, y - PCS.W / 2, y + TRENCH[0]] : [sx, sx + C.L, y - C.W / 2, y + TRENCH[1]];
  const centre = [(plan[0] + plan[1]) / 2, y, 1.4], s = scaleAt(centre);
  // on the card: all it draws (shape), and the body that hides what is behind it (screen)
  const silhouette = (xs, ys, z1) => hull(xs.flatMap((x) => ys.flatMap((yy) => [P([x, yy, 0]), P([x, yy, z1])])));
  const shape = silhouette(plan.slice(0, 2), plan.slice(2, 4), 3.3);
  const half = isPcs ? PCS.W / 2 : C.W / 2, screen = silhouette(plan.slice(0, 2), [y - half, y + half], isPcs ? 2.3 : Z1);
  const xs = shape.map((p) => p[0]), ys = shape.map((p) => p[1]);
  const bbox = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (bbox[1] < VEIL || bbox[0] > WIDTH || bbox[2] > HEIGHT) continue;
  const tier = s > 40 ? "near" : s > 25 ? "mid" : "far";
  objects.push({ plan, bbox, shape, screen, tier, draw: () => `<g class="bt-h${hazeOf(centre)}">${(isPcs ? pcs : container)(sx, y, tier)}</g>` });
}
// Painter's order: for two plans that overlap on the card, a plane between them
// (x first, else y) says which is nearer. Then a depth-first topological sort.
function nearer(a, b) {
  const [ax0, ax1, ay0, ay1] = a.plan, [bx0, bx1, by0, by1] = b.plan;
  if (ax1 <= bx0 || bx1 <= ax0) { const x = ax1 <= bx0 ? (ax1 + bx0) / 2 : (bx1 + ax0) / 2; return (EYE[0] < x) === (ax1 <= bx0) ? a : b; }
  const y = ay1 <= by0 ? (ay1 + by0) / 2 : (by1 + ay0) / 2;
  return (EYE[1] < y) === (ay1 <= by0) ? a : b;
}
const overlaps = (a, b) => a.bbox[0] < b.bbox[1] && b.bbox[0] < a.bbox[1] && a.bbox[2] < b.bbox[3] && b.bbox[2] < a.bbox[3];
const behind = new Map(objects.map((o) => [o, []]));
for (const a of objects) for (const b of objects) if (a !== b && overlaps(a, b) && nearer(a, b) === a) behind.get(a).push(b);
const painted = [], state = new Map();
const visit = (o) => {
  if (state.get(o) === 2) return;
  if (state.get(o) === 1) throw new Error("painter's order has a cycle");
  state.set(o, 1); behind.get(o).forEach(visit); state.set(o, 2); painted.push(o);
};
objects.forEach(visit);
// A unit wholly behind nearer bodies is left out: sample its shape on a 2-unit
// grid, clipped to the card, against the nearer bodies' outlines.
const inside = (poly, [x, y]) => poly.every((p, i) => { const q = poly[(i + 1) % poly.length]; return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) >= -1e-6; });
const hidden = new Set();
painted.forEach((o, i) => {
  const nearerBodies = painted.slice(i + 1).map((n) => n.screen);
  const samples = [];
  for (let x = Math.max(VEIL, o.bbox[0]); x <= Math.min(WIDTH, o.bbox[1]); x += 2) for (let y = Math.max(0, o.bbox[2]); y <= Math.min(HEIGHT, o.bbox[3]); y += 2) if (inside(o.shape, [x, y])) samples.push([x, y]);
  if (samples.every((p) => nearerBodies.some((b) => inside(b, p)))) hidden.add(o);
});
const shown = painted.filter((o) => !hidden.has(o)).map((o) => ({ ...o, svg: o.draw() }));
const parts = { defs: `<defs>${fanDefs()}</defs>`, distance: distance(), ground: ground(), plant: shown.map((o) => o.svg).join("") };
const body = parts.defs + parts.distance + parts.ground + `<g class="bt-weight">${parts.plant}</g>`;
if (process.argv.includes("--sizes")) {
  console.log(Object.entries(parts).map(([n, v]) => `${n} ${(v.length / 1024).toFixed(1)}`).join(" · "));
  console.log(`horizon ${f1(CAM.cy)} · ` + shown.map((o) => `${o.tier}@${o.plan.slice(0, 3).map(f1)} x${Math.round(o.bbox[0])}..${Math.round(o.bbox[1])} ${(o.svg.length / 1024).toFixed(1)}K`).join(" · "));
}

// ── Styles, scoped to the card's element ─────────────────────────────────────
const TOKENS = {
  page: "#050f17", card: "#081722", paper: "#081722", face: "#0c1f2d",
  "shade-0": "#040e17", "shade-1": "#061521", "shade-2": "#091b29", "shade-3": "#0c2131", top: "#10283a",
  "lit-top": "#163045", "lit-shade": "#12293b",
  hi: "#9fb2c2", mid: "#5a7184", lo: "#2f475a", faint: "#1a3041", halo: "#01070c",
  text: "#7f95a7", strong: "#c9d6e0", muted: "#566d80",
};
const NAVY = Object.entries(TOKENS).map(([n, v]) => `--anatomy-${n}:${v}`).join(";");
const SITE = { lit: "#eef5fa", dot: "#9fb2c2", lamp: "#eef5fa", "lamp-off": "#10283a", bed: "#06131d", pave: "#0a1a26", under: "#030b12" };
const HAZE = "#0d2131";
const mix = (a, b, t) => "#" + [0, 1, 2].map((i) => {
  const ca = parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16), cb = parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16);
  return Math.round(ca + (cb - ca) * t).toString(16).padStart(2, "0");
}).join("");
// each step of haze pulls lines and faces toward the haze colour; the lamps keep the most
const LADDER = [1, 2, 3, 4, 5].map((n) => {
  const t = Math.min(0.92, n * 0.15);
  const lines = ["hi", "mid", "lo", "faint"].map((n2) => `--anatomy-${n2}:${mix(TOKENS[n2], HAZE, t)}`);
  const faces = ["paper", "face", "shade-0", "shade-1", "shade-2", "shade-3", "top"].map((n2) => `--anatomy-${n2}:${mix(TOKENS[n2], HAZE, Math.min(1, t * 1.15))}`);
  const site = [`--bt-lamp:${mix(SITE.lamp, HAZE, t * 0.5)}`, `--bt-lamp-off:${mix(SITE["lamp-off"], HAZE, t)}`, `--bt-bed:${mix(SITE.bed, HAZE, t * 0.6)}`, `--bt-under:${mix(SITE.under, HAZE, t * 0.6)}`];
  return `.bt-h${n}{${[...lines, ...faces, ...site].join(";")}}`;
});
const SCENE_CSS = `.bt-weight{--anatomy-weight:.7px}
.bt-face *{vector-effect:non-scaling-stroke}
.bt-pave{fill:var(--bt-pave);stroke:none}
.bt-bed{fill:var(--bt-bed);stroke:none}
.bt-trench{fill:var(--anatomy-shade-3);stroke:none}
.bt-slot,.bt-pocket{fill:var(--anatomy-shade-0);stroke:none}
.bt-under{fill:var(--bt-under);stroke:none}
.bt-keeper{fill:var(--anatomy-shade-3);stroke:var(--anatomy-mid);stroke-width:.4px;stroke-linejoin:round}
.bt-cable{fill:var(--anatomy-shade-1);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linejoin:round}
.bt-seg-off{fill:var(--bt-lamp-off);stroke:none}
.bt-seg{fill:var(--bt-lamp);stroke:none;opacity:clamp(0,calc(var(--bt-soc,0) * var(--segs) - var(--n)),1)}
.bt-throat{fill:var(--anatomy-shade-0);stroke:none}
.bt-blade{fill:var(--anatomy-shade-3);stroke:var(--anatomy-lo);stroke-width:.4px;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.bt-hub{fill:var(--anatomy-top);stroke:var(--anatomy-mid);stroke-width:.4px;vector-effect:non-scaling-stroke}
.bt-guard{fill:none;stroke:var(--anatomy-mid);stroke-width:.45px;vector-effect:non-scaling-stroke}
.bt-rim{stroke-width:.6px}
${LADDER.join("\n")}`;
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots|face-text)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const siteVars = Object.entries(SITE).map(([n, v]) => (n === "lit" || n === "dot" ? `--anatomy-${n}:${v}` : `--bt-${n}:${v}`)).join(";");
// <use> clones (the fans) sit in their own shadow tree, which the scope's
// descendant selectors cannot reach, so the fan rules are written unscoped.
const UNSCOPED = /^\.bt-(blade|hub|guard|rim)/;
const sceneRules = SCENE_CSS.split("\n");
const navyCss = `${SCOPE}{${NAVY};${siteVars};--anatomy-weight:.6px}` + KIT.map(scope).join("") +
  sceneRules.map((rule) => (UNSCOPED.test(rule) || rule.startsWith(".bt-h") ? rule : scope(rule))).join("");

// ── Daylight: each part in its own paint, haze toward the horizon's blue ─────
const SKY = { top: "#6f9fca", horizon: "#cfe1ef" };
// a colour darkened by f, cooler the deeper the shade (shadows take the sky's blue)
const tint = (c, f) => "#" + [f - 0.1 * (1 - f), f, f + 0.1 * (1 - f)].map((g, i) =>
  Math.round(Math.min(255, parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16) * g)).toString(16).padStart(2, "0")).join("");
// a paint: faces by facing (shade-3 meets the sun, the top lighter still) and inks
// for outlines and detail lines 16–45% darker than the sunlit face
const paint = (base, inks = {}) => ({
  paper: tint(base, 0.91), top: mix(base, "#ffffff", 0.4), "shade-3": base, "shade-2": tint(base, 0.91), "shade-1": tint(base, 0.8), "shade-0": tint(base, 0.67),
  hi: tint(base, 0.55), mid: tint(base, 0.64), lo: tint(base, 0.74), faint: tint(base, 0.84), dot: tint(base, 0.35), ...inks,
});
const PAINTS = {
  ground: paint("#cbc8c1", { hi: "#5f5c57", mid: "#6d6a64", lo: "#85827a", faint: "#a09d96", dot: "#3f3b35" }),
  white: paint("#f2f4f5"), trim: paint("#b6bdc3"), steel: paint("#7f878e"), concrete: paint("#cfcdc6"),
  cable: paint("#3a3f44"), plate: paint("#c8cdd1"), panel: paint("#3d464d"), earth: paint("#9cbf4a"),
  yellow: paint("#e3b23c"), amber: paint("#e8a23a"), red: paint("#d2493f"),
  sign: paint("#e3b23c", { hi: "#1d1d1b", mid: "#242421", lo: "#2c2b27", faint: "#3a3833", dot: "#141412" }),
  hvac: paint("#d5dade"), fan: paint("#4b545c", { "shade-0": "#22282d", mid: "#a3abb2", lo: "#2a3035", top: "#6b747c" }),
  inverter: paint("#b9c4bc"), rmu: paint("#5d8a6b"), tx: paint("#8d969d"),
};
const DAY_SITE = { lamp: "#4fbf6a", "lamp-off": "#2e3a33", bed: "#a59d91", under: "#706a61", trench: "#8f9499", hole: "#33383c" };
const INKS = new Set(["hi", "mid", "lo", "faint", "dot"]);
const hazeVars = (tokens, t) => Object.entries(tokens).map(([n, v]) => `--anatomy-${n}:${mix(v, SKY.horizon, INKS.has(n) ? t : Math.min(1, t * 1.15))}`).join(";");
const siteHaze = (t) => Object.entries({ lamp: 0.5, "lamp-off": 1, bed: 0.6, under: 0.6, trench: 0.6, hole: 1 }).map(([n, w]) => `--bt-${n}:${mix(DAY_SITE[n], SKY.horizon, t * w)}`).join(";");
const DAY_LADDER = [1, 2, 3, 4, 5].flatMap((n) => {
  const t = Math.min(0.92, n * 0.15);
  return [`.bt-h${n}{${hazeVars(PAINTS.ground, t)};${siteHaze(t)}}`, ...Object.entries(PAINTS).map(([m, tokens]) => `.bt-h${n} .bt-m-${m}{${hazeVars(tokens, t)}}`)];
});
const dayCss = `${SCOPE}{${hazeVars(PAINTS.ground, 0)};${Object.entries(DAY_SITE).map(([n, v]) => `--bt-${n}:${v}`).join(";")};--anatomy-lit:#ffffff;--anatomy-weight:.6px}` +
  KIT.map(scope).join("") +
  sceneRules.filter((rule) => !rule.startsWith(".bt-h")).map((rule) => (UNSCOPED.test(rule) ? rule : scope(rule))).join("") +
  [".bt-pave{fill:url(#bt-pave)}", ".bt-trench{fill:var(--bt-trench)}", ".bt-slot,.bt-pocket{fill:var(--bt-hole)}"].map(scope).join("") +
  Object.entries(PAINTS).map(([m, tokens]) => `.bt-m-${m}{${hazeVars(tokens, 0)}}`).join("") + DAY_LADDER.join("");
// the sky down to the horizon, and the fields beyond the plant's fence below it
function daylight() {
  const h = f1(CAM.cy), grad = (id, y0, y1, a, b) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  return `<defs>${grad("bt-sky", 0, h, SKY.top, SKY.horizon)}${grad("bt-field", h, HEIGHT, mix("#8fb35a", SKY.horizon, 0.55), mix("#8fb35a", SKY.horizon, 0.2))}${grad("bt-pave", h, HEIGHT, mix("#cbc8c1", SKY.horizon, 0.6), "#cbc8c1")}</defs>` +
    `<rect fill="url(#bt-sky)" width="${WIDTH}" height="${h}"/><rect fill="url(#bt-field)" y="${h}" width="${WIDTH}" height="${f1(HEIGHT - CAM.cy)}"/>`;
}
const css = COLOUR ? dayCss : navyCss;
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${COLOUR ? daylight() : ""}${body}</svg>`;

// ── Live: one day of trading, on a loop ──────────────────────────────────────
// Every lamp in the plant shows the one state of charge and the fans turn with
// the power.
const live = `
${readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "")}
const DAY = ${JSON.stringify(DAY)};
const SPH = ${SECONDS_PER_HOUR}, STILL_HOUR = ${STILL_HOUR};
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
// each lamp is restyled only when its own size can show the change: 60 steps of
// charge up close, 10 far off, so the far lamps cost little while the plant moves
const lamps = [...svg.querySelectorAll(".bt-lamp")].map((el) => ({ el, steps: +el.dataset.steps, shown: -1 }));
const fans = [...svg.querySelectorAll("[data-fan]")].map((el) => ({ el, kind: el.dataset.fan, ph: +el.dataset.ph }));
// fans: the containers' air conditioners tick over and work harder with the
// current; the inverter's fans run with the power it converts and coast to rest
const REV = { hvac: [0.25, 1.1], pcs: [0, 1.4] };
let power = 0, spin = { hvac: REV.hvac[0], pcs: 0 }, angle = { hvac: 0, pcs: 0 };
function draw(hours, dt) {
  const s = stateAt(DAY, hours);
  const ease = dt === null ? 1 : 1 - Math.exp(-dt / 0.45);
  power += (s.mw - power) * ease;
  const load = Math.abs(power) / ${BATTERY.mw};
  for (const kind of ["hvac", "pcs"]) {
    const target = REV[kind][0] + REV[kind][1] * load;
    spin[kind] += (target - spin[kind]) * (dt === null ? 1 : 1 - Math.exp(-dt / (kind === "pcs" ? 0.9 : 1.6)));
    angle[kind] = (angle[kind] + spin[kind] * 360 * (dt || 0)) % 360;
  }
  for (const lamp of lamps) {
    const q = Math.round(s.soc * lamp.steps);
    if (q !== lamp.shown) { lamp.el.style.setProperty("--bt-soc", (q / lamp.steps).toFixed(3)); lamp.shown = q; }
  }
  for (const f of fans) f.el.setAttribute("transform", "rotate(" + ((angle[f.kind] + f.ph) % 360).toFixed(1) + ")");
}
const fixed = stage.dataset.hour;
const GAP = ${Math.round(1000 / 30) - 2};
let frame = 0, visible = false, last = -Infinity, clock = 0, prev = 0;
function tick(now) {
  if (now - last >= GAP) {
    const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
    prev = now; last = now; clock += dt;
    draw(clock / SPH, dt);
  }
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
draw(fixed !== undefined ? +fixed : still.matches ? STILL_HOUR : 0, null);
if (fixed === undefined) new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (!visible) prev = 0;
  if (visible && !frame && !still.matches) frame = requestAnimationFrame(tick);
}, { rootMargin: "120px 0px" }).observe(stage);
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${NAME}.svg`), markup);
writeFileSync(join(OUT, `${NAME}.js`), `// Generated by figures/battery/build.mjs: runs one day of the post's DQN\n// battery on its card. Edit the build, not this file.\n${live}`);

// ── Preview: the card as the homepage draws it ───────────────────────────────
const preview = (hour, svg = markup) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Battery card</title><style>
body{margin:0;padding:24px 15px;background:#fff;font-family:"Quicksand",system-ui,sans-serif}
.wrap{max-width:1110px;margin:0 auto}
.card{position:relative;height:160px;border:1px solid rgba(0,0,0,.125);border-radius:.25rem;overflow:hidden;background:${COLOUR ? SKY.horizon : "#081722"};display:flex}
.scene-battery{position:absolute;inset:0}
.scene-battery svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,0.2),white 80%)}
.card-block{position:relative;z-index:2;margin:auto 15px;max-width:640px}
h2{color:#717171;font-weight:500;font-size:1.6rem;margin:0 0 .4rem;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:1rem;margin:0 0 .3rem}.text{color:#000;font-size:.95rem;margin:0}
</style></head><body><div class="wrap"><div class="card"><div class="scene-battery"${hour === undefined ? "" : ` data-hour="${hour}"`} aria-hidden="true">${svg}</div>
<div class="card-block"><h2>Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation</h2><p class="date">Oct 10, 2022</p><p class="text">Wholesale arbitrage with DQN agents, benchmarked against MILP</p></div></div></div>
<script type="module">${live.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
writeFileSync(join(HERE, COLOUR ? "preview-colour.html" : "preview.html"), preview());
// --stills <dir>: the card held at chosen hours, for captures, and bare.html,
// the scene without the fade or the title, for close-ups and the line check
const stills = process.argv.indexOf("--stills");
if (stills > 0) {
  const dir = process.argv[stills + 1];
  mkdirSync(dir, { recursive: true });
  for (const h of [5.5, 10.5, 15, 19.5]) writeFileSync(join(dir, `preview-${String(h).replace(".", "_")}.html`), preview(h));
  writeFileSync(join(dir, "bare.html"), preview(STILL_HOUR).replace(".card::after{", ".card-block{display:none}.card::after{display:none;"));
}
console.log(`${NAME}.svg ${(markup.length / 1024).toFixed(1)} KB · ${NAME}.js ${(live.length / 1024).toFixed(1)} KB · ${DATE}: SoC ${rows[0].soc} → ${Math.max(...rows.map((r) => r.soc))} → ${rows[24].soc}, prices £${Math.min(...DAY.map((d) => d.price))}–£${Math.max(...DAY.map((d) => d.price))}/MWh`);
