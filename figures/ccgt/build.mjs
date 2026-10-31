// A combined-cycle gas turbine power station with carbon capture, drawn with the
// anatomy kit in its own paint on white: one single-shaft unit the size of
// Keadby 2. Air is drawn down through the filter house into the gas turbine;
// gas burns in its combustors; the hot exhaust runs through the heat-recovery
// steam generator, which raises steam for the steam turbine on the same shaft;
// the generator between them sends power out through the step-up transformer.
// The cooled flue gas then goes to the capture plant: a direct-contact cooler,
// the absorber where an amine solvent takes up the CO2, and the stripper where
// steam taken from the turbine drives it off again, to be compressed and piped
// away for storage. Every number on the page comes from model.mjs.
//
// Units: one world unit is a quarter of a metre; plans below are in metres.
// x runs along the shaft (west to east), y toward the viewer, z up.
// Run: node figures/ccgt/build.mjs     writes figures/ccgt/ccgt.html
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../lib/anatomy/kit/iso-kit.mjs";
import * as G from "../lib/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../lib/anatomy/kit/tube.mjs";
import { kitScript } from "../lib/anatomy/scripts/inline-kit.mjs";
import { C, fullLoad, withCapture } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const U = 4;                                   // world units per metre
const m = (v) => v * U;
const WIDTH = 1500, HEIGHT = 880;

// ── The site, in metres ─────────────────────────────────────────────────────
const AXIS = 7.5;                              // the shaft's height above the deck
const DECK = { x: -6, y: -54, w: 190, d: 82 };
const ST = { lp: [2, 11], hp: [11.5, 17] };    // steam turbine casings, along x
const GEN = [20, 31];                          // the generator
const GT = { plenum: [33, 37], comp: [37, 49], comb: [49, 53.5], turb: [53.5, 59], diff: [59, 68] };
const HRSG = { x0: 72, x1: 112, y0: -9, y1: 9, z1: 30 };
const STACK = { x: 118, y: 0, r: 3.4, h: 62 };
const DCC = { x: 124, y: -30, r: 4.2, h: 28 };
const ABS = { x: 142, y: -34, r: 7, h: 56 };
const STRIP = { x: 162, y: -24, r: 3.6, h: 42 };
const TOWERS = { x0: -2, x1: 46, y0: -46, y1: -32, h: 13 };
const TX = { x: 24, y: 16 };
const GAS = { x: 46, y: 22 };

const corners = [
  [m(DECK.x), m(DECK.y), 0], [m(DECK.x + DECK.w), m(DECK.y), 0], [m(DECK.x), m(DECK.y + DECK.d), 0], [m(DECK.x + DECK.w), m(DECK.y + DECK.d), 0],
  [m(STACK.x), m(STACK.y), m(STACK.h + 4)], [m(ABS.x), m(ABS.y), m(ABS.h + 3)], [m(DECK.x), m(DECK.y), m(-2)],
];
const P = k.fitProjection(corners, WIDTH, HEIGHT, { pad: 24, azimuth: 62, elevation: 28 });
const at = (p) => k.iso(p, P);
const depth = (p) => k.depthOf(p, P);
const M3 = (p) => p.map(m);

// ── Paint: each material its own ladder of tones, as the battery card does ──
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const tint = (c, f) => toHex(hex(c).map((v, i) => v * [f - 0.06 * (1 - f), f, f + 0.06 * (1 - f)][i]));
const paint = (base, inks = {}) => ({
  paper: tint(base, 0.92), face: base, top: mix(base, "#ffffff", 0.35), "lit-top": mix(base, "#ffffff", 0.35), "lit-shade": tint(base, 0.9),
  "shade-3": base, "shade-2": tint(base, 0.92), "shade-1": tint(base, 0.82), "shade-0": tint(base, 0.7),
  hi: tint(base, 0.48), mid: tint(base, 0.6), lo: tint(base, 0.72), faint: tint(base, 0.83), dot: tint(base, 0.35), ...inks,
});
const PAINTS = {
  concrete: paint("#d6d3cc"), gravel: paint("#c9c4b8"), grass: paint("#a8c27a"),
  casing: paint("#a9b2b9"), steel: paint("#8b949b"), dark: paint("#5a636b"), lagging: paint("#d9dde0"),
  generator: paint("#3f6f9e"), exciter: paint("#2f5677"), filter: paint("#c7ced3"),
  hrsg: paint("#c3ccd2"), drum: paint("#98a2aa"), stack: paint("#b9c0c5"),
  ccs: paint("#e2e6e8"), packing: paint("#cdd3d6"), compressor: paint("#7a8a96"),
  tower: paint("#cfd8db"), fan: paint("#4e5960"), water: paint("#6fb3d2"),
  gas: paint("#e3b23c"), rail: paint("#e8b73a"), red: paint("#c9473c"), co2: paint("#7e63ab"),
  transformer: paint("#7d8577"), bushing: paint("#b48a5a"), cw: paint("#4f9a74"), hv: paint("#6c757c"),
};
const paintCss = Object.entries(PAINTS).map(([n, t]) => `.m-${n}{${Object.entries(t).map(([k2, v]) => `--anatomy-${k2}:${v}`).join(";")}}`).join("\n");

// ── Items, painted back to front ────────────────────────────────────────────
const items = [];
const put = (key, material, svg) => items.push({ key, svg: material ? `<g class="m-${material}">${svg}</g>` : svg });
const S = (paths, style = {}) => k.solidSvg(paths, { tone: "hi", crease: "lo", ...style });
const L = (d, style = {}) => k.lineSvg(d, { tone: "lo", ...style });
const D = (points, style = {}) => k.dotsSvg(points, { size: 0.5, tone: "mid", ...style });
const plan = (x, y, w, d, r = 0.3) => ({ x: m(x), y: m(y), w: m(w), d: m(d), r: m(r) });
const poly = (pts) => "M" + pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z";

function box(material, x, y, z, w, d, h, { r = 0.3, bevel = 0.6, steps = 4, key, inner = "", tone } = {}) {
  const paths = k.slabOf(plan(x, y, w, d, r), m(z), m(h), P, steps, bevel);
  put(key ?? depth(M3([x + w / 2, y + d / 2, z + h / 2])), material, S(paths, { inner, tone }));
}
function post(material, x, y, z, r, h, { key, steps = 24, inner = "" } = {}) {
  put(key ?? depth(M3([x, y, z + h / 2])), material, S(k.cylinder(m(x), m(y), m(r), m(z), m(h), P, steps), { inner }));
}
// a turned body on the shaft line or any horizontal axis along x
const alongX = (x, y, z) => G.frameOf(M3([x, y, z]), [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const alongY = (x, y, z) => G.frameOf(M3([x, y, z]), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const upright = (x, y, z) => G.frameOf(M3([x, y, z]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
function turned(material, F, profile, { key, inner = "", smooth = "auto" } = {}) {
  const paths = G.solidOf(profile.map(([s, r, f]) => (f ? [m(s), m(r), 1] : [m(s), m(r)])), F, P, { smooth });
  const mid = profile[Math.floor(profile.length / 2)][0];
  put(key ?? depth(G.pointOf(F, m(mid), 0, 0)), material, S(paths, { inner }));
}
// a pipe along metre waypoints, filleted, each chunk at its own depth; `flow` is a class for the moving dashes
function pipe(material, pts, r, { flow, bend = 2.2, maxLength = 40, bias = 0 } = {}) {
  const route = G.fillet(pts.map(M3), m(Math.max(r * bend, 0.8)), 7, { P, tube: m(r) });
  const pieces = tubePieces(route, m(r), P, { maxLength: m(maxLength) / U * 1.2 + 20 });
  for (const piece of pieces) {
    let svg = tubeSvg(piece);
    if (flow) svg += `<path class="flow flow-${flow}" d="M${piece.points.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L")}"/>`;
    put(depth(piece.mid) + bias, material, svg);
  }
  return route;
}

// ── The ground: a concrete deck in gravel, kerbs and drains ─────────────────
{
  const g = plan(DECK.x - 6, DECK.y - 6, DECK.w + 12, DECK.d + 12, 3);
  put(-1e9, null, `<path class="iso-halo" d="${k.haloOf(g, m(-2), m(2), P)}" style="filter:blur(6px)"/>`);
  put(-1e9 + 1, "grass", S(k.slabOf(g, m(-2.4), m(1.6), P, 8, 0), { tone: "mid" }));
  put(-1e9 + 2, "gravel", S(k.slabOf(plan(DECK.x - 2, DECK.y - 2, DECK.w + 4, DECK.d + 4, 2), m(-0.8), m(0.8), P, 6, 0.4), { tone: "mid" }));
  // the power island's slab and the capture plant's
  put(-1e9 + 3, "concrete", S(k.slabOf(plan(-4, -14, 126, 42, 1), 0, m(0.5), P, 4, 0.5), { tone: "mid", inner: L(k.planOutline(plan(-3, -13, 124, 40, 1), m(0.5), P, 4), { tone: "faint" }) }));
  put(-1e9 + 4, "concrete", S(k.slabOf(plan(116, -48, 60, 36, 1), 0, m(0.5), P, 4, 0.5), { tone: "mid" }));
  put(-1e9 + 5, "concrete", S(k.slabOf(plan(-4, -50, 54, 22, 1), 0, m(0.5), P, 4, 0.5), { tone: "mid" }));
  // roads: an access road along the front and between the blocks
  put(-1e9 + 6, "dark", S(k.slabOf(plan(DECK.x, 22, DECK.w, 5, 0.5), 0, m(0.12), P, 3, 0), { tone: "lo", crease: "none" }));
  put(-1e9 + 7, "dark", S(k.slabOf(plan(112, -50, 4, 72, 0.5), 0, m(0.12), P, 3, 0), { tone: "lo", crease: "none" }));
  put(-1e9 + 8, "dark", L(k.lineOnTop([m(DECK.x + 2), m(24.5)], [m(DECK.x + DECK.w - 2), m(24.5)], m(0.13), P), { tone: "faint", dashed: true }));
}

// ── Cooling: a row of mechanical-draught cells behind the steam turbine ─────
{
  const { x0, x1, y0, y1, h } = TOWERS, n = 4, cw = (x1 - x0) / n;
  box("tower", x0, y0, 0.5, x1 - x0, y1 - y0, h - 0.5, { r: 0.4, bevel: 0.8, inner: [0.25, 0.5, 0.75].map((f) => L(k.segment(M3([x0 + (x1 - x0) * f, y1, 0.6]), M3([x0 + (x1 - x0) * f, y1, h]), P), { tone: "lo" })).join("") });
  for (let i = 0; i < n; i++) {
    const cx = x0 + cw * (i + 0.5), cy = (y0 + y1) / 2;
    // louvres along the face
    for (let z = 1.5; z < h * 0.45; z += 0.9) put(depth(M3([cx, y1 + 0.1, z])), "tower", L(k.segment(M3([cx - cw / 2 + 1, y1 + 0.05, z]), M3([cx + cw / 2 - 1, y1 + 0.05, z]), P), { tone: "mid" }));
    // the fan stack and its fan
    const F = upright(cx, cy, h);
    turned("tower", F, [[0, 4.6], [3.2, 4.2, 1], [4.4, 4.5]], { key: depth(M3([cx, cy, h + 2])) });
    put(depth(M3([cx, cy, h + 4.6])) + 1, "fan", `<path class="fan-pit" d="${G.circleOf(F, m(4.4), m(4.2), P, 48)}"/>` +
      `<g class="fan" data-cx="${at(M3([cx, cy, h + 3.6]))[0].toFixed(1)}" data-cy="${at(M3([cx, cy, h + 3.6]))[1].toFixed(1)}">${[0, 1, 2, 3, 4, 5].map((b) => {
        const a = (b / 6) * Math.PI * 2;
        return `<path d="M${at(M3([cx, cy, h + 3.6])).join(" ")}L${at(M3([cx + Math.cos(a) * 3.8, cy + Math.sin(a) * 3.8, h + 3.6])).join(" ")}"/>`;
      }).join("")}</g>` + `<g class="vapour" data-at="${at(M3([cx, cy, h + 5])).map((v) => v.toFixed(1)).join(",")}"></g>`);
  }
  // the basin's rail
  put(depth(M3([(x0 + x1) / 2, y1 + 1, 1])), "rail", L(k.segment(M3([x0, y1 + 0.6, h + 1]), M3([x1, y1 + 0.6, h + 1]), P), { tone: "hi" }));
}

// ── The turbine deck: the table the shaft line sits on ──────────────────────
{
  box("concrete", 0, -6, 0.5, 70, 12, 4, { r: 0.4, bevel: 0.8, inner: [10, 20, 30, 40, 50, 60].map((x) => L(k.segment(M3([x, 6, 0.6]), M3([x, 6, 4.4]), P), { tone: "faint" })).join("") });
  // columns under the deck are hidden by it; a stair to the deck at the front
  for (let i = 0; i < 6; i++) box("rail", 64 + i * 0.9, 6, 0.5 + i * 0.66, 0.9, 2.2, 0.2, { bevel: 0, key: depth(M3([64, 7.5, 2])) + i });
}

// ── Steam turbine, condenser and clutch ─────────────────────────────────────
{
  // the condenser beneath the LP turbine, cooling water in and out
  box("casing", 1.5, -5.5, 0.5, 10, 11, 4.4, { r: 0.5, key: depth(M3([6, 0, 1])) });
  // LP casing: a broad box with a rounded hood
  box("lagging", ST.lp[0], -3.6, 4.5, ST.lp[1] - ST.lp[0], 7.2, 3.0, { r: 0.6, bevel: 0.8 });
  turned("lagging", alongX(ST.lp[0], 0, AXIS), [[0, 3.2], [0.4, 3.5, 1], [ST.lp[1] - ST.lp[0] - 0.4, 3.5, 1], [ST.lp[1] - ST.lp[0], 3.2]]);
  // HP/IP casing: a barrel tapering to its bearing
  turned("lagging", alongX(ST.hp[0], 0, AXIS), [[0, 2.2], [0.5, 2.9], [3.5, 3.0, 1], [5.0, 2.5], [5.5, 1.6]]);
  // the crossover pipe from the IP exhaust down into the LP casing
  pipe("lagging", [[14.5, 0, AXIS + 2.4], [14.5, 0, AXIS + 5.6], [6.5, 0, AXIS + 5.6], [6.5, 0, AXIS + 3.3]], 0.9, { flow: "steam" });
  // bearing pedestals and the shaft through to the clutch
  for (const x of [1.2, 11.2, 17.6]) box("dark", x - 0.7, -1.4, 4.5, 1.4, 2.8, 2.6, { r: 0.2 });
  turned("steel", alongX(17, 0, AXIS), [[0, 0.5], [3, 0.5]]);
  // the self-synchronising clutch between steam turbine and generator
  turned("dark", alongX(18.2, 0, AXIS), [[0, 0.9], [1.2, 0.9]]);
}

// ── Generator, exciter and the bus to the transformer ───────────────────────
{
  const [g0, g1] = GEN;
  box("dark", g0 - 0.4, -3.4, 4.5, g1 - g0 + 0.8, 6.8, 1.0, { r: 0.3 });
  turned("generator", alongX(g0, 0, AXIS), [[0, 1.6], [0.6, 2.9], [1.2, 3.1, 1], [g1 - g0 - 1.2, 3.1, 1], [g1 - g0 - 0.6, 2.9], [g1 - g0, 1.6]],
    { inner: "" });
  // cooler housings on top
  box("generator", g0 + 2.5, -1.6, AXIS + 2.9, 6, 3.2, 1.3, { r: 0.4 });
  // the isolated-phase bus: three ducts from the terminal box to the transformer
  box("exciter", g0 + 3, 2.4, 4.5, 3.2, 2, 1.6, { r: 0.3 });
  for (const dx of [-0.9, 0, 0.9]) pipe("hv", [[g0 + 4.6 + dx, 3.6, 5.4], [g0 + 4.6 + dx, 9, 5.4], [g0 + 4.6 + dx, TX.y - 2.6, 5.4]], 0.32);
}

// ── Gas turbine: intake plenum, compressor, combustors, turbine, diffuser ───
{
  const { plenum, comp, comb, turb, diff } = GT;
  // the bearing pedestal and the plenum where the air turns into the bell-mouth
  box("casing", plenum[0], -3.6, 4.5, plenum[1] - plenum[0], 7.2, 6.4, { r: 0.4, bevel: 0.7 });
  // compressor: a casing tapering as the air is squeezed, its flanges as seams
  const cF = alongX(comp[0], 0, AXIS), cl = comp[1] - comp[0];
  const cr = (s) => 2.5 - 0.8 * (s / cl);
  const cProfile = Array.from({ length: 9 }, (_, i) => { const s = (cl * i) / 8; return [m(s), m(cr(s))]; });
  const cPaths = G.solidOf(cProfile, cF, P, { smooth: { slope: () => -0.8 / cl } });
  const seams = [0.2, 0.42, 0.62, 0.8].map((f) => L(G.arcOf(cF, m(cl * f), m(cr(cl * f)), P, { slope: -0.8 / cl }), { tone: "lo" })).join("");
  put(depth(G.pointOf(cF, m(cl / 2), 0, 0)), "casing", S(cPaths, { inner: seams }));
  // combustor section: a ring of cans round a barrel, the gas manifold round them
  const bF = alongX(comb[0], 0, AXIS), bl = comb[1] - comb[0];
  turned("steel", bF, [[0, 2.0], [0.3, 2.7], [bl - 0.3, 2.7], [bl, 2.0]], { key: depth(G.pointOf(bF, m(bl / 2), 0, 0)) });
  const cans = 12;
  for (let i = 0; i < cans; i++) {
    const a = (i / cans) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a), R = 2.9;
    const base = [comb[0] + 0.6, ca * R, AXIS + sa * R];
    const F = G.frameOf(M3(base), [1, 0, 0], [0, ca, sa], [0, -sa, ca]);
    // each can leans out along the casing: a short turned body
    const paths = G.solidOf([[0, m(0.62)], [m(0.4), m(0.7)], [m(bl - 1.2), m(0.7)], [m(bl - 0.8), m(0.5)]], F, P);
    put(depth(M3([comb[0] + bl / 2, ca * R, AXIS + sa * R])), "dark", S(paths));
  }
  // the fuel manifold ring
  pipe("gas", G.arcPoints(G.frameOf(M3([comb[0] + 0.5, 0, AXIS]), [1, 0, 0], [0, 1, 0], [0, 0, 1]), 0, m(3.7), 0, Math.PI * 2, 48).map((p) => p.map((v) => v / U)), 0.22, { maxLength: 6 });
  // turbine: the casing widening as the gas expands
  const tF = alongX(turb[0], 0, AXIS), tl = turb[1] - turb[0];
  turned("steel", tF, [[0, 2.3], [tl * 0.5, 2.6, 1], [tl, 2.95]], { inner: "" });
  put(depth(G.pointOf(tF, m(tl / 2), 0, 0)) + 0.5, "steel", L([0.3, 0.65].map((f) => G.arcOf(tF, m(tl * f), m(2.3 + 0.65 * f), P, { slope: 0.65 / tl })).join(""), { tone: "lo" }));
  // the exhaust diffuser, a cone opening into the HRSG's duct
  const dF = alongX(diff[0], 0, AXIS), dl = diff[1] - diff[0];
  const dr = (s) => 3.0 + 1.6 * (s / dl);
  turned("casing", dF, Array.from({ length: 7 }, (_, i) => { const s = (dl * i) / 6; return [s, dr(s)]; }), { smooth: { slope: () => 1.6 / dl } });
  for (const x of [plenum[1] + 0.4, turb[1] - 1, diff[1] - 1]) box("dark", x - 0.7, -2.2, 4.5, 1.4, 4.4, AXIS - 4.5 - 2.2, { r: 0.2 });
  // the exhaust duct: a rectangular transition up to the HRSG's inlet
  const duct = [[68, -4.6, AXIS - 4.6], [72, -8.6, 1]];
  box("hrsg", duct[0][0], -5.2, 2.3, duct[1][0] - duct[0][0], 10.4, 10.4, { r: 0.4, bevel: 0.6 });
  box("hrsg", 70, -8.8, 1, 2.4, 17.6, 22, { r: 0.3, bevel: 0.6 });
}

// ── Filter house: air drawn in through the filters, down into the plenum ────
{
  const fx = 28, fy = -22, fw = 14, fd = 12, fz = 11, fh = 10;
  // the steel frame it stands on
  for (const [x, y] of [[fx + 0.5, fy + 0.5], [fx + fw - 0.5, fy + 0.5], [fx + 0.5, fy + fd - 0.5], [fx + fw - 0.5, fy + fd - 0.5]])
    box("steel", x - 0.35, y - 0.35, 4.5, 0.7, 0.7, fz - 4.5, { r: 0.1, bevel: 0 });
  // the inlet duct down to the plenum
  box("filter", 33.2, fy + fd - 0.2, 10.9, 3.6, -fy - fd + 2.6, 3.4, { r: 0.3, bevel: 0.6 });
  // the house: weather hoods on the front face over the filter bank
  const hoods = [];
  for (let z = fz + 0.8; z < fz + fh - 0.6; z += 1.5) hoods.push(L(k.segment(M3([fx + 0.4, fy + fd + 0.05, z]), M3([fx + fw - 0.4, fy + fd + 0.05, z]), P), { tone: "mid" }));
  for (let x = fx + 2; x < fx + fw - 1; x += 2.4) hoods.push(L(k.segment(M3([x, fy + fd + 0.05, fz + 0.4]), M3([x, fy + fd + 0.05, fz + fh - 0.4]), P), { tone: "faint" }));
  box("filter", fx, fy, fz, fw, fd, fh, { r: 0.4, bevel: 0.8, inner: hoods.join("") });
  put(depth(M3([fx + fw / 2, fy + fd + 1, fz + fh])), "filter", `<path class="flow flow-air" d="M${at(M3([fx + fw / 2, fy + fd + 3, fz + fh / 2])).join(" ")}L${at(M3([fx + fw / 2, fy + fd, fz + fh / 2])).join(" ")}"/>`);
  // a walkway with yellow rails along the front
  box("steel", fx - 0.5, fy + fd, fz - 0.3, fw + 1, 1.4, 0.3, { r: 0.1, bevel: 0 });
  put(depth(M3([fx + fw / 2, fy + fd + 1.4, fz + 1])), "rail", L(k.segment(M3([fx - 0.5, fy + fd + 1.35, fz + 1.1]), M3([fx + fw + 0.5, fy + fd + 1.35, fz + 1.1]), P), { tone: "hi" }));
}

// ── The HRSG: casing, cutaway into its three tube banks, drums on top ───────
{
  const { x0, x1, y0, y1, z1 } = HRSG;
  // the casing, ribbed with stiffeners; the front panel cut away to show the banks
  const ribs = [];
  for (let x = x0 + 3; x < x1; x += 3.2) ribs.push(L(k.segment(M3([x, y1 + 0.05, 0.6]), M3([x, y1 + 0.05, z1 - 0.2]), P), { tone: "lo" }));
  box("hrsg", x0, y0, 0.5, x1 - x0, y1 - y0, z1 - 0.5, { r: 0.4, bevel: 1, inner: ribs.join("") });
  // the cutaway window: the hot gas passage and the tube banks across it
  const wx0 = x0 + 3, wx1 = x1 - 4, wz0 = 6, wz1 = z1 - 5, fy = y1 + 0.08;
  const win = [[wx0, fy, wz0], [wx1, fy, wz0], [wx1, fy, wz1], [wx0, fy, wz1]].map(M3);
  const banks = [
    { x: [wx0 + 1.5, wx0 + 9], colour: "#d2523f", name: "hp" },      // HP superheater and evaporator, hottest gas
    { x: [wx0 + 11, wx0 + 19], colour: "#e2863f", name: "ip" },
    { x: [wx0 + 21, wx0 + 29], colour: "#e7b14a", name: "lp" },
    { x: [wx0 + 30, wx1 - 1.5], colour: "#7fb0cf", name: "eco" },     // the economiser: feedwater, coolest gas
  ];
  let window = `<path class="hrsg-gas" d="${poly([[wx0, fy, wz0], [wx1, fy, wz0], [wx1, fy, wz1], [wx0, fy, wz1]].map(M3))}"/>`;
  for (const b of banks) for (let x = b.x[0]; x <= b.x[1]; x += 0.7) window += `<path class="tube" stroke="${b.colour}" d="M${at(M3([x, fy, wz0 + 0.4])).join(" ")}L${at(M3([x, fy, wz1 - 0.4])).join(" ")}"/>`;
  window += `<path class="hrsg-frame" d="${poly([[wx0, fy, wz0], [wx1, fy, wz0], [wx1, fy, wz1], [wx0, fy, wz1]].map(M3))}"/>`;
  window += `<path class="flow flow-exhaust" d="M${at(M3([wx0 + 0.5, fy, (wz0 + wz1) / 2])).join(" ")}L${at(M3([wx1 - 0.5, fy, (wz0 + wz1) / 2])).join(" ")}"/>`;
  put(depth(M3([(x0 + x1) / 2, y1, z1 / 2])) + 2, null, window);
  // the drums: HP, IP and LP, lying across the casing on saddles
  [[x0 + 7, 1.25], [x0 + 18, 1.0], [x0 + 28, 0.9]].forEach(([x, r]) => {
    box("dark", x - 0.6, y0 + 3, z1, 1.2, y1 - y0 - 6, 0.6, { r: 0.1, bevel: 0 });
    turned("drum", alongY(x, y0 + 2, z1 + 0.6 + r), [[0, r * 0.7], [0.4, r, 1], [y1 - y0 - 4.4, r, 1], [y1 - y0 - 4, r * 0.7]]);
  });
  // the roof's platform rail and a stair tower at the east end
  put(depth(M3([(x0 + x1) / 2, y1, z1 + 1])), "rail", L(k.segment(M3([x0 + 0.5, y1 - 0.3, z1 + 1.1]), M3([x1 - 0.5, y1 - 0.3, z1 + 1.1]), P), { tone: "hi" }));
  box("steel", x1 + 0.2, y1 - 4, 0.5, 2.6, 3.6, z1 + 0.6, { r: 0.1, bevel: 0.4, inner: Array.from({ length: 10 }, (_, i) => L(k.segment(M3([x1 + 0.2, y1 - 0.4, 2 + i * 2.9]), M3([x1 + 2.8, y1 - 0.4, 3.4 + i * 2.9]), P), { tone: "hi" })).join("") });
  // the outlet duct to the stack and on to the capture plant
  box("hrsg", x1 - 0.5, -3.5, z1 - 9, STACK.x - x1 - 2.5, 7, 6, { r: 0.4 });
}

// ── The stack: the bypass, with a sampling platform ─────────────────────────
{
  const { x, y, r, h } = STACK;
  post("concrete", x, y, 0.5, r + 0.6, 1.2, { key: depth(M3([x, y + r, h / 2])) - 2, steps: 48 });
  turned("stack", upright(x, y, 1.7), [[0, r], [h - 1.7, r * 0.92]], { key: depth(M3([x, y + r, h / 2])) });
  put(depth(M3([x, y + r, h / 2])) + 1, "stack", L([20, 40].map((z) => G.arcOf(upright(x, y, 0.5), m(z), m(r - 0.08 * z / h * r), P)).join(""), { tone: "lo" }));
  turned("steel", upright(x, y, 34), [[0, r + 1.4], [0.4, r + 1.4]], { key: depth(M3([x, y + r, h / 2])) - 1 });
  put(depth(M3([x, y + r + 1.5, 35])), "rail", L(G.arcOf(upright(x, y, 35.2), 0, m(r + 1.3), P), { tone: "hi" }));
  put(depth(M3([x, y, h + 1])) + 5, null, `<g class="plume plume-stack" data-at="${at(M3([x, y, h + 0.5])).map((v) => v.toFixed(1)).join(",")}"></g>`);
}

// ── Carbon capture: cooler, absorber, stripper, compressor and export ───────
{
  // the flue gas duct from the HRSG outlet to the direct-contact cooler
  pipe("hrsg", [[HRSG.x1 + 3, -2, HRSG.z1 - 6], [HRSG.x1 + 3, DCC.y + 5, HRSG.z1 - 6], [DCC.x - 5, DCC.y + 5, HRSG.z1 - 6], [DCC.x - 5, DCC.y, 22], [DCC.x - DCC.r, DCC.y, 22]], 2.2, { flow: "flue", bend: 1.6 });
  // the direct-contact cooler
  post("concrete", DCC.x, DCC.y, 0.5, DCC.r + 0.5, 0.8, { key: depth(M3([DCC.x, DCC.y + DCC.r, DCC.h / 2])) - 2, steps: 48 });
  turned("ccs", upright(DCC.x, DCC.y, 1.3), [[0, DCC.r], [DCC.h - 2, DCC.r], [DCC.h, DCC.r * 0.6, 1], [DCC.h + 0.6, 0.6]], { key: depth(M3([DCC.x, DCC.y + DCC.r, DCC.h / 2])) });
  // the cooler to the absorber's foot, with its booster fan
  pipe("hrsg", [[DCC.x + DCC.r, DCC.y, 6], [ABS.x - ABS.r, ABS.y + 0.0, 6]], 1.9, { flow: "flue" });
  box("compressor", 131, -32.5, 0.5, 4.4, 5, 4, { r: 0.6 });
  // the absorber: a tall column, its packed beds as bands, a water wash at the top
  const aF = upright(ABS.x, ABS.y, 0.5);
  post("concrete", ABS.x, ABS.y, 0.5, ABS.r + 0.5, 0.8, { key: depth(M3([ABS.x, ABS.y + ABS.r, ABS.h / 2])) - 2, steps: 64 });
  turned("ccs", aF, [[0.8, ABS.r], [ABS.h - 3, ABS.r], [ABS.h - 0.8, ABS.r * 0.55, 1], [ABS.h, 1.2], [ABS.h + 3, 1.0]], { key: depth(M3([ABS.x, ABS.y + ABS.r, ABS.h / 2])) });
  put(depth(M3([ABS.x, ABS.y + ABS.r, ABS.h / 2])) + 1, "packing", L([12, 22, 32, 42, 49].map((z) => G.arcOf(aF, m(z), m(ABS.r), P)).join(""), { tone: "lo" }) +
    [16, 26, 36].map((z) => `<path class="bed" d="${G.arcOf(aF, m(z), m(ABS.r + 0.02), P)}"/>`).join(""));
  // platforms and rails round it, a ladder up the front
  for (const z of [14, 28, 42]) {
    turned("steel", upright(ABS.x, ABS.y, z), [[0, ABS.r + 1.3], [0.35, ABS.r + 1.3]], { key: depth(M3([ABS.x, ABS.y + ABS.r, ABS.h / 2])) - 1 });
    put(depth(M3([ABS.x, ABS.y + ABS.r + 1.3, z + 1])), "rail", L(G.arcOf(upright(ABS.x, ABS.y, z + 1.1), 0, m(ABS.r + 1.2), P), { tone: "hi" }));
  }
  put(depth(M3([ABS.x, ABS.y + ABS.r + 0.5, 20])) + 2, "rail", L(k.segment(M3([ABS.x + 1.2, ABS.y + ABS.r + 0.4, 0.5]), M3([ABS.x + 1.2, ABS.y + ABS.r + 0.4, 50]), P), { tone: "hi" }) +
    L(k.segment(M3([ABS.x + 2.2, ABS.y + ABS.r + 0.2, 0.5]), M3([ABS.x + 2.2, ABS.y + ABS.r + 0.2, 50]), P), { tone: "hi" }));
  put(depth(M3([ABS.x, ABS.y, ABS.h + 4])) + 5, null, `<g class="plume plume-absorber" data-at="${at(M3([ABS.x, ABS.y, ABS.h + 3])).map((v) => v.toFixed(1)).join(",")}"></g>`);
  // rich solvent to the stripper, lean back: two lines on a low rack
  pipe("red", [[ABS.x + 2, ABS.y + ABS.r - 1, 2.5], [ABS.x + 2, ABS.y + ABS.r + 3, 2.5], [STRIP.x - 6, ABS.y + ABS.r + 3, 2.5], [STRIP.x - 6, STRIP.y, 2.5], [STRIP.x - 6, STRIP.y, 30], [STRIP.x - STRIP.r, STRIP.y, 30]], 0.45, { flow: "rich" });
  pipe("water", [[STRIP.x - STRIP.r, STRIP.y + 1.5, 2], [STRIP.x - 8, STRIP.y + 1.5, 2], [STRIP.x - 8, ABS.y - 3, 2], [ABS.x + ABS.r + 0.2, ABS.y - 3, 2], [ABS.x + ABS.r + 0.2, ABS.y - 3, 48], [ABS.x + 1, ABS.y - 3, 48]], 0.45, { flow: "lean" });
  // the lean/rich cross exchanger: a plate pack on a skid
  box("steel", 150, -20, 0.5, 4, 2.4, 3.2, { r: 0.3, inner: [0.6, 1.2, 1.8, 2.4, 3.0].map((dx) => L(k.segment(M3([150 + dx + 0.4, -17.6, 0.8]), M3([150 + dx + 0.4, -17.6, 3.4]), P), { tone: "lo" })).join("") });
  // the stripper and its reboiler, heated by steam taken from the turbine
  post("concrete", STRIP.x, STRIP.y, 0.5, STRIP.r + 0.5, 0.8, { key: depth(M3([STRIP.x, STRIP.y + STRIP.r, STRIP.h / 2])) - 2, steps: 48 });
  turned("ccs", upright(STRIP.x, STRIP.y, 0.5), [[0.8, STRIP.r], [STRIP.h - 2, STRIP.r], [STRIP.h, STRIP.r * 0.5, 1], [STRIP.h + 0.8, 0.5]], { key: depth(M3([STRIP.x, STRIP.y + STRIP.r, STRIP.h / 2])) });
  for (const z of [16, 32]) {
    turned("steel", upright(STRIP.x, STRIP.y, z), [[0, STRIP.r + 1.1], [0.3, STRIP.r + 1.1]], { key: depth(M3([STRIP.x, STRIP.y + STRIP.r, STRIP.h / 2])) - 1 });
    put(depth(M3([STRIP.x, STRIP.y + STRIP.r + 1.1, z + 1])), "rail", L(G.arcOf(upright(STRIP.x, STRIP.y, z + 1.1), 0, m(STRIP.r + 1.0), P), { tone: "hi" }));
  }
  turned("steel", alongX(STRIP.x - 2, STRIP.y + 7, 2.6), [[0, 1.6], [0.4, 1.9, 1], [6.6, 1.9, 1], [7, 1.6]], { key: depth(M3([STRIP.x + 1, STRIP.y + 7 + 1.9, 2.6])) });
  for (const x of [STRIP.x - 1, STRIP.x + 3.6]) box("dark", x - 0.4, STRIP.y + 5.8, 0.5, 0.8, 2.4, 1, { r: 0.1, bevel: 0 });
  // CO2 off the stripper's top, down to the compressor house and away by pipeline
  pipe("co2", [[STRIP.x, STRIP.y, STRIP.h + 1.2], [STRIP.x, STRIP.y, STRIP.h + 3], [STRIP.x + 6, STRIP.y, STRIP.h + 3], [STRIP.x + 6, STRIP.y, 6], [STRIP.x + 6, -8, 6]], 0.5, { flow: "co2" });
  box("compressor", STRIP.x + 1, -8, 0.5, 11, 8, 7, { r: 0.4, bevel: 0.8, inner: [2, 4, 6, 8].map((dx) => L(k.segment(M3([STRIP.x + 1 + dx, 0.05, 1]), M3([STRIP.x + 1 + dx, 0.05, 6.5]), P), { tone: "lo" })).join("") });
  pipe("co2", [[STRIP.x + 9, 0, 1.6], [STRIP.x + 9, 20, 1.6], [DECK.x + DECK.w + 4, 20, 1.6]], 0.55, { flow: "co2" });
}

// ── Steam and water: drums to turbine on the rack, steam to the reboiler ────
{
  // HP steam (hot, lagged) from the HP drum's superheater to the HP casing
  pipe("lagging", [[HRSG.x0 + 7, HRSG.y0 + 3.5, HRSG.z1 + 2.2], [HRSG.x0 + 7, -12, HRSG.z1 + 2.2], [HRSG.x0 + 7, -12, 15], [14, -12, 15], [14, -12, AXIS + 3], [14, -3.2, AXIS + 3]], 0.55, { flow: "steam" });
  // IP / reheat and LP lines alongside
  pipe("lagging", [[HRSG.x0 + 18, HRSG.y0 + 3.2, HRSG.z1 + 1.8], [HRSG.x0 + 18, -13.4, HRSG.z1 + 1.8], [HRSG.x0 + 18, -13.4, 13.6], [12.4, -13.4, 13.6], [12.4, -13.4, AXIS + 2.6], [12.4, -3.4, AXIS + 2.6]], 0.45, { flow: "steam" });
  pipe("lagging", [[HRSG.x0 + 28, HRSG.y0 + 3.1, HRSG.z1 + 1.6], [HRSG.x0 + 28, -14.8, HRSG.z1 + 1.6], [HRSG.x0 + 28, -14.8, 12.2], [8, -14.8, 12.2], [8, -14.8, AXIS + 4.4], [8, -4.7, AXIS + 4.4]], 0.5, { flow: "steam" });
  // the pipe rack carrying them
  for (let x = 12; x < HRSG.x0 + 30; x += 8) box("steel", x - 0.25, -16, 0.5, 0.5, 4.5, 11.2, { r: 0.05, bevel: 0, key: depth(M3([x, -16, 6])) - 2 });
  // condensate back from the condenser to the HRSG's economiser
  pipe("water", [[11.5, 4.2, 2.2], [24, 4.2, 2.2], [24, 10, 2.2], [HRSG.x0 + 2, 10, 2.2], [HRSG.x0 + 2, HRSG.y1 + 0.2, 2.2]], 0.35, { flow: "water" });
  // steam taken from the IP/LP crossover to the stripper's reboiler: the capture plant's heat
  pipe("lagging", [[6.5, -1, AXIS + 5.6], [6.5, -18.4, AXIS + 5.6], [6.5, -18.4, 16.6], [STRIP.x - 3, -18.4, 16.6], [STRIP.x - 3, -18.4, 2.6], [STRIP.x - 3, STRIP.y + 6, 2.6]], 0.42, { flow: "extract" });
  // cooling water between the condenser and the cells
  pipe("cw", [[3, -5.6, 2], [3, -30, 2], [3, TOWERS.y1 + 0.4, 2]], 0.9, { flow: "cw" });
  pipe("cw", [[9, -5.6, 2.2], [9, -24, 2.2], [20, -24, 2.2], [20, TOWERS.y1 + 0.4, 2.2]], 0.9, { flow: "cw" });
}

// ── Gas in: the pipeline, the metering skid and the line to the manifold ───
{
  box("concrete", GAS.x - 4, GAS.y - 3, 0.5, 9, 5, 0.4, { r: 0.2, bevel: 0 });
  box("gas", GAS.x - 3, GAS.y - 2, 0.9, 3, 2.6, 2, { r: 0.4 });
  box("gas", GAS.x + 1, GAS.y - 2, 0.9, 3, 2.6, 2, { r: 0.4 });
  pipe("gas", [[DECK.x - 2, GAS.y + 1.5, 1.4], [GAS.x - 4, GAS.y + 1.5, 1.4], [GAS.x + 4.5, GAS.y + 1.5, 1.4], [GAS.x + 4.5, GAS.y - 6, 1.4], [GT.comb[0] + 0.5, GAS.y - 6, 1.4], [GT.comb[0] + 0.5, 5, 1.4], [GT.comb[0] + 0.5, 4.6, AXIS - 3]], 0.4, { flow: "gas" });
}

// ── Power out: the step-up transformer and the line to the grid ─────────────
{
  const { x, y } = TX;
  box("concrete", x - 6, y - 3, 0.5, 12, 7, 0.6, { r: 0.2, bevel: 0 });
  box("transformer", x - 4, y - 2.2, 1.1, 8, 4.6, 5.6, { r: 0.4, bevel: 0.6 });
  // radiator banks on its front face
  for (let i = 0; i < 6; i++) box("transformer", x - 3.6 + i * 1.3, y + 2.4, 1.6, 0.9, 1.2, 4.2, { r: 0.1, bevel: 0, key: depth(M3([x, y + 3.2, 3])) + i * 0.1 });
  // conservator tank and bushings
  turned("transformer", alongX(x - 3, y - 1.2, 8.2), [[0, 0.7], [6, 0.7]], { key: depth(M3([x, y - 1.2, 8.2])) });
  for (const dx of [-1.6, 0, 1.6]) {
    turned("bushing", upright(x + dx, y + 0.8, 6.7), [[0, 0.45], [2.6, 0.25], [3.2, 0.3]], { key: depth(M3([x + dx, y + 0.8, 8])) });
  }
  // the line gantry at the edge of the site, conductors swagged to it
  for (const gx of [x - 4, x + 4]) box("hv", gx - 0.3, y + 6, 0.5, 0.6, 0.6, 14, { r: 0.1, bevel: 0 });
  box("hv", x - 4.3, y + 6, 14, 8.6, 0.6, 0.6, { r: 0.1, bevel: 0 });
  put(depth(M3([x, y + 4, 12])), null, [-1.6, 0, 1.6].map((dx) => `<path class="conductor" d="M${at(M3([x + dx, y + 0.8, 9.9])).join(" ")}Q${at(M3([x + dx, y + 3.5, 10.5])).join(" ")} ${at(M3([x + dx, y + 6.3, 13.8])).join(" ")}"/>`).join("") +
    [-1.6, 0, 1.6].map((dx) => `<path class="flow flow-power" d="M${at(M3([x + dx, y + 0.8, 9.9])).join(" ")}Q${at(M3([x + dx, y + 3.5, 10.5])).join(" ")} ${at(M3([x + dx, y + 6.3, 13.8])).join(" ")}"/>`).join(""));
}

// ── The control building, its car park and the gatehouse ────────────────────
{
  const bx = 124, by = 4, bw = 24, bd = 12, bh = 8;
  const glazing = [2.6, 5.6].map((z) => `<path class="glass" d="${poly([[bx + 1, by + bd + 0.06, z], [bx + bw - 1, by + bd + 0.06, z], [bx + bw - 1, by + bd + 0.06, z + 1.8], [bx + 1, by + bd + 0.06, z + 1.8]].map(M3))}"/>` +
    `<path class="glass" d="${poly([[bx + bw + 0.06, by + bd - 1, z], [bx + bw + 0.06, by + 1, z], [bx + bw + 0.06, by + 1, z + 1.8], [bx + bw + 0.06, by + bd - 1, z + 1.8]].map(M3))}"/>`).join("");
  box("ccs", bx, by, 0.5, bw, bd, bh, { r: 0.4, bevel: 0.8, inner: glazing });
  box("dark", bx + 3, by + 2, bh + 0.5, 6, 4, 1.4, { r: 0.3 });
  box("dark", bx + 12, by + 3, bh + 0.5, 3, 3, 1.2, { r: 0.3 });
  // the car park and a few cars
  box("dark", 152, 4, 0.5, 22, 14, 0.12, { r: 0.4, bevel: 0, tone: "lo" });
  const CARS = ["#c9473c", "#e6e8ea", "#3f6f9e", "#2f3337", "#e6e8ea", "#9aa3aa"];
  CARS.forEach((c, i) => {
    const x = 154 + i * 3.4, y = i % 2 ? 6 : 13;
    put(depth(M3([x + 1, y + 2, 0.8])), null, `<g style="--anatomy-paper:${c};--anatomy-face:${c};--anatomy-top:${mix(c, "#ffffff", 0.3)};--anatomy-shade-3:${c};--anatomy-shade-2:${tint(c, 0.9)};--anatomy-shade-1:${tint(c, 0.8)};--anatomy-shade-0:${tint(c, 0.68)};--anatomy-hi:${tint(c, 0.45)};--anatomy-lo:${tint(c, 0.7)}">` +
      S(k.slabOf(plan(x, y, 1.9, 4.4, 0.6), m(0.62), m(1.0), P, 4, 0)) + S(k.slabOf(plan(x + 0.2, y + 1.1, 1.5, 2.2, 0.5), m(1.62), m(0.6), P, 4, 0)) + "</g>");
  });
  // the gatehouse at the site entrance, by the road
  box("ccs", 178, 18.5, 0.5, 4, 3, 3, { r: 0.3, inner: `<path class="glass" d="${poly([[178.4, 21.56, 1.6], [181.6, 21.56, 1.6], [181.6, 21.56, 2.8], [178.4, 21.56, 2.8]].map(M3))}"/>` });
  box("rail", 172, 20.8, 1.4, 6, 0.3, 0.3, { r: 0.1, bevel: 0 });
}

// ── Numbers on the drawing, keyed to the steps under it ─────────────────────
{
  const marks = [
    [1, [35, -16, 23]],                    // the filter house
    [2, [GT.comb[0] + 2, 3.5, AXIS + 4]],  // the combustors
    [3, [HRSG.x0 + 20, HRSG.y1, HRSG.z1 + 5]],
    [4, [9, 0, AXIS + 7]],                 // the steam turbine
    [5, [TX.x, TX.y + 1, 12]],             // generator and transformer
    [6, [ABS.x, ABS.y + ABS.r, ABS.h + 2]],
  ];
  for (const [n, p] of marks) {
    const [x, y] = at(M3(p));
    put(1e9 + n, null, `<g class="mark"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${n}</text></g>`);
  }
}

// ── The flame: a glow behind the combustor cans, sized by the firing ────────
{
  const c = at(M3([GT.comb[0] + 2, 3.2, AXIS + 0.4]));
  put(depth(M3([GT.comb[0] + 2, 4, AXIS])) + 3, null, `<ellipse class="flame" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="16" ry="11"/>`);
}

items.sort((a, b) => a.key - b.key);
const body = items.map((i) => i.svg).join("");

// ── The page ────────────────────────────────────────────────────────────────
const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const iso = fullLoad(), cap = withCapture(iso);
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: "A combined-cycle gas turbine power station with carbon capture: air and gas burn in the gas turbine, its hot exhaust raises steam for a steam turbine on the same shaft, and the cooled flue gas passes through an absorber that takes out its carbon dioxide for storage.", body, className: "ccgt" });

const FLOWS = [
  ["air", "#7fb9e6", "Air in"], ["gas", "#e3a72f", "Natural gas"], ["exhaust", "#e0633a", "Hot exhaust"],
  ["steam", "#d24a4a", "Steam"], ["water", "#3f88c5", "Condensate and lean solvent"], ["cw", "#4f9a74", "Cooling water"],
  ["flue", "#9a8f86", "Cooled flue gas"], ["rich", "#b0563a", "CO₂-rich solvent"], ["extract", "#e07b6a", "Steam to the reboiler"],
  ["co2", "#7e63ab", "CO₂ to storage"], ["power", "#f2c230", "Power to the grid"],
];
const flowCss = FLOWS.map(([n, c]) => `.flow-${n}{stroke:${c}}`).join("\n");
const legend = `<ul class="ccgt-keys">${FLOWS.filter(([n]) => n !== "lean").map(([n, c, label]) => `<li><span style="background:${c}"></span>${label}</li>`).join("")}</ul>`;
const controls = `<div class="ccgt-controls">
  <label>Load <input type="range" id="load" min="40" max="100" value="100" step="1"><output id="load-out">100 %</output></label>
  <label>Air temperature <input type="range" id="ambient" min="-5" max="35" value="15" step="1"><output id="ambient-out">15 °C</output></label>
  <label class="toggle"><input type="checkbox" id="capture" checked> Carbon capture</label>
</div>`;
const readout = `<dl class="ccgt-readout">
  <div><dt>Sent out</dt><dd id="r-net">${cap.mw.net.toFixed(0)} MW</dd></div>
  <div><dt>Gas turbine</dt><dd id="r-gas">${iso.mw.gas.toFixed(0)} MW</dd></div>
  <div><dt>Steam turbine</dt><dd id="r-steam">${iso.mw.steam.toFixed(0)} MW</dd></div>
  <div><dt>Efficiency</dt><dd id="r-eff">${(cap.eff.combined * 100).toFixed(1)} %</dd></div>
  <div><dt>Exhaust</dt><dd id="r-exh">${(iso.t.exhaust - C).toFixed(0)} °C</dd></div>
  <div><dt>CO₂</dt><dd id="r-co2">${(cap.co2 * 1000).toFixed(0)} g/kWh</dd></div>
</dl>`;
const steps = `<ol class="ccgt-steps">
  <li><b>Air.</b> The gas turbine's compressor pulls about 1.2 tonnes of air a second in through the filter house and squeezes it to about 23 times atmospheric pressure.</li>
  <li><b>Gas turbine.</b> Gas burns in the ring of combustors at about 1,480 °C, and the hot gas spins the turbine, which turns the compressor and the generator.</li>
  <li><b>Heat recovery.</b> The exhaust leaves at over 600 °C and flows through the HRSG's tube banks, hottest first, boiling water at three pressures.</li>
  <li><b>Steam turbine.</b> The steam drives a second turbine on the same shaft, then condenses under vacuum, cooled by the fans of the cooling cells.</li>
  <li><b>Generator.</b> One generator at 3,000 rpm; the transformer steps its output up for the grid. Two thirds comes from gas, a third from steam, from the same fuel.</li>
  <li><b>Carbon capture.</b> The flue gas is cooled, then rises through the absorber where an amine solvent takes up about 95 % of its CO₂. In the stripper, steam from the turbine drives it off again; it is compressed and piped away to be stored under the sea.</li>
</ol>`;

const css = `
body.iso{--anatomy-page:#ffffff;--anatomy-card:#ffffff;background:#fff}
.iso-page{width:min(1500px,100% - 32px);margin:32px auto 64px}
.ccgt-head{display:flex;justify-content:space-between;align-items:baseline;font:12px/1.4 var(--anatomy-mono);color:#57575a;margin:0 4px 8px}
.ccgt-head b{color:#18181a;font-weight:600}
${paintCss}
.ccgt .iso-halo{fill:#8a8a80;opacity:.25}
.flow{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-dasharray:3 9;animation:flow var(--speed,1.6s) linear infinite;opacity:.95}
.flow-exhaust{stroke-width:3;stroke-dasharray:6 14}
.flow-power{stroke-width:1.4}
${flowCss}
@keyframes flow{to{stroke-dashoffset:-24}}
.hrsg-gas{fill:#3a2c27}
.hrsg-frame{fill:none;stroke:#5c656c;stroke-width:1}
.tube{stroke-width:.9;opacity:.9}
.fan-pit{fill:#353c41}
.fan path{stroke:#9aa4ab;stroke-width:1.6;stroke-linecap:round}
.conductor{fill:none;stroke:#555c62;stroke-width:.8}
.bed{fill:none;stroke:#b9c1c5;stroke-width:3;opacity:.6}
.flame{fill:url(#flame);opacity:calc(var(--flame,1) * .85)}
.puff{fill:#e9eef1;stroke:none}
.glass{fill:#5f7f99;stroke:#3f5568;stroke-width:.4}
.mark circle{fill:#18181a;stroke:#fff;stroke-width:2}
.mark text{fill:#fff;font:600 12px var(--anatomy-mono);text-anchor:middle}
.ccgt-steps li::marker{font-weight:600}
.ccgt-panel{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;margin:16px 4px 0;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#3a3a3e}
.ccgt-controls{display:flex;flex-wrap:wrap;gap:20px 28px;align-items:center}
.ccgt-controls label{display:flex;gap:10px;align-items:center;font:12px var(--anatomy-mono)}
.ccgt-controls output{min-width:52px;color:#18181a}
.ccgt-readout{display:grid;grid-template-columns:repeat(6,auto);gap:4px 22px;margin:0;font:12px var(--anatomy-mono)}
.ccgt-readout dt{color:#8c8c90}.ccgt-readout dd{margin:0;color:#18181a;font-size:15px}
.ccgt-keys{display:flex;flex-wrap:wrap;gap:6px 18px;list-style:none;padding:0;margin:14px 4px 0;font:12px var(--anatomy-mono);color:#57575a}
.ccgt-keys span{display:inline-block;width:18px;height:3px;border-radius:2px;margin-right:7px;vertical-align:middle}
.ccgt-steps{columns:3 300px;column-gap:32px;margin:20px 4px 0;padding-left:18px;font:13px/1.6 ui-sans-serif,system-ui,sans-serif;color:#3a3a3e}
.ccgt-steps li{break-inside:avoid;margin:0 0 10px}
[data-capture="off"] .flow-flue,[data-capture="off"] .flow-rich,[data-capture="off"] .flow-lean,[data-capture="off"] .flow-extract,[data-capture="off"] .flow-co2{opacity:0}
@media (prefers-reduced-motion:reduce){.flow{animation:none}}
@media (max-width:900px){.ccgt-panel{grid-template-columns:1fr}.ccgt-readout{grid-template-columns:repeat(3,auto)}}
`;
const defs = `<svg width="0" height="0" style="position:absolute"><defs><radialGradient id="flame"><stop offset="0" stop-color="#fff2b0"/><stop offset=".45" stop-color="#ffa340" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient></defs></svg>`;

const live = `
${model}
const root = document.querySelector('.ccgt-root');
const $ = (id) => document.getElementById(id);
const svg = root.querySelector('svg.ccgt');
const NS = 'http://www.w3.org/2000/svg';
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
// plumes: a few soft puffs above each outlet, rising and fading; vapour over the cells
const plumes = [...svg.querySelectorAll('.plume, .vapour')].map((g) => {
  const [x, y] = g.dataset.at.split(',').map(Number);
  const big = g.classList.contains('plume');
  const puffs = Array.from({ length: big ? 7 : 4 }, (_, i) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'puff'); g.appendChild(c); return { c, age: i / (big ? 7 : 4) }; });
  return { g, x, y, big, puffs, strength: 1 };
});
function puffs(dt) {
  for (const p of plumes) for (const f of p.puffs) {
    f.age = (f.age + dt / (p.big ? 9 : 6)) % 1;
    const a = f.age, r = (p.big ? 7 : 5) + a * (p.big ? 26 : 16);
    f.c.setAttribute('cx', (p.x + a * (p.big ? 50 : 22)).toFixed(1));
    f.c.setAttribute('cy', (p.y - a * (p.big ? 90 : 50)).toFixed(1));
    f.c.setAttribute('r', r.toFixed(1));
    f.c.setAttribute('opacity', (p.strength * Math.min(1, a * 6) * (1 - a) * 0.85).toFixed(2));
  }
}
// the cooling fans turn
const fans = [...svg.querySelectorAll('.fan')].map((g) => ({ g, cx: +g.dataset.cx, cy: +g.dataset.cy }));
let fanAngle = 0;
function update() {
  const load = +$('load').value / 100, ambient = +$('ambient').value + C, capture = $('capture').checked;
  const point = atLoad(load, ambient);
  const shown = capture ? withCapture(point) : point;
  $('load-out').value = Math.round(load * 100) + ' %';
  $('ambient-out').value = $('ambient').value + ' °C';
  $('r-net').textContent = shown.mw.net.toFixed(0) + ' MW';
  $('r-gas').textContent = point.mw.gas.toFixed(0) + ' MW';
  $('r-steam').textContent = point.mw.steam.toFixed(0) + ' MW';
  $('r-eff').textContent = (shown.eff.combined * 100).toFixed(1) + ' %';
  $('r-exh').textContent = (point.t.exhaust - C).toFixed(0) + ' °C';
  $('r-co2').textContent = (shown.co2 * 1000).toFixed(0) + ' g/kWh';
  root.dataset.capture = capture ? 'on' : 'off';
  // flows run faster the more passes through them
  const full = fullLoad(ambient).air;
  root.style.setProperty('--speed', (1.6 / Math.max(0.35, point.air / full)).toFixed(2) + 's');
  root.style.setProperty('--flame', (0.45 + 0.55 * (point.t.firing - UNIT.firingMin) / (UNIT.firing - UNIT.firingMin)).toFixed(2));
  for (const p of plumes) {
    if (p.g.classList.contains('plume-stack')) p.strength = capture ? 0.08 : 0.55;
    else if (p.g.classList.contains('plume-absorber')) p.strength = capture ? 0.7 : 0;
    else p.strength = 0.5 + 0.4 * load;
  }
  fanSpeed = 0.6 + 2.4 * load;
}
let fanSpeed = 3;
for (const id of ['load', 'ambient', 'capture']) $(id).addEventListener('input', update);
update();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  puffs(dt);
  fanAngle += dt * fanSpeed;
  for (const f of fans) f.g.setAttribute('transform', 'rotate(' + (fanAngle * 57.3).toFixed(1) + ' ' + f.cx + ' ' + f.cy + ') ');
  if (!still) requestAnimationFrame(frame);
}
puffs(0.01);
requestAnimationFrame(frame);
`;

const html = k.pageHtml({
  title: "How a CCGT power station works",
  theme: "light",
  width: 1500,
  body: `<style>${css}</style>${defs}<div class="ccgt-root" data-capture="on">
<div class="ccgt-head"><span><b>Fig. 1</b>  A combined-cycle gas turbine power station with carbon capture</span><span>One single-shaft unit · about 850 MW · model, not to scale in detail</span></div>
${svg}
<div class="ccgt-panel">${controls}${readout}</div>
${legend}
${steps}
</div>`,
  script: live,
});
writeFileSync(join(HERE, "ccgt.html"), html);
console.log(`ccgt.html ${(html.length / 1024).toFixed(0)} KB · ${items.length} items`);
