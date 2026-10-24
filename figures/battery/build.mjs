// The battery post's card: a grid battery plant seen from a mast over one of
// its aisles. Rows of 20 ft battery containers in blocks of four, a power
// conversion skid (inverter, MV transformer, ring main unit) in each block, all
// on one grid: a cable trench and an access track down each aisle, access roads
// between the blocks. The card cuts off the front row and shows three more
// behind it before the rows run off the top and sides. Every container's charge
// lamp and the fans run one real day of the post's Double Dueling DQN agent
// (4 December 2018, from the post's own CSV), one hour every 1.25 s: the plant
// is one battery, dispatched as one. One unit is 10 cm.
// Run: node figures/battery/build.mjs   writes staticfiles/image/thumbnails/battery/
//      scene.svg and scene.js, and figures/battery/preview.html
//      --stills <dir>   also the card held at four hours of the day, check.html and parts.html
//      --sizes          the size of each part of the drawing
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { BATTERY, dayOf, stateAt } from "./model.mjs";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const OUT = join(ROOT, "staticfiles/image/thumbnails/battery");
const SCOPE = ".scene-battery";
const WIDTH = 1400, HEIGHT = 200;
// Left of this the card's white fade is opaque on every card width, so nothing there is drawn.
const VEIL = 260;

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

// ── Site plan (x along the rows, y toward the viewer, z up) ──────────────────
// One grid: every row has the same blocks at the same x, so containers and
// skids line up in columns from the front row back. A block is two containers,
// the PCS skid, two containers; an access road runs between blocks. Each row
// is a container on its gravel bed, its cable trench in front, then an access
// track across the aisle to the next row.
const C = { w: 60.6, d: 24.4, h: 25.9, plinth: 3 };                 // 20 ft containers on concrete sleepers
const PCS = { w: 74, d: 22, skid: 3.2 };
const GAP = 12, GAP_PCS = 14, ROAD = 72, PITCH = 100, TRENCH_DY = 19;
const BED = { back: C.d / 2 + 6, front: TRENCH_DY + 9 };              // the gravel bed, from the row's centre line
const TRACK = { y0: BED.front + 8, y1: PITCH - BED.back - 8 };         // the aisle's track, kerb to kerb
const SLOTS = [0, C.w + GAP, "pcs", 2 * C.w + GAP + 2 * GAP_PCS + PCS.w, 3 * C.w + 2 * GAP + 2 * GAP_PCS + PCS.w];
const BLOCK = 4 * C.w + 2 * GAP + 2 * GAP_PCS + PCS.w;
const PERIOD = BLOCK + ROAD;
const PCS_X = 2 * C.w + GAP + GAP_PCS;
const rowY = (r) => -r * PITCH;

// ── Camera: a mast over the front aisle, looking down the rows ──────────────
// Each part is drawn once in the kit's parallel projection along the camera's
// own axes, then placed where a pinhole camera puts it and scaled by focal /
// distance, so rows shrink into the distance like a photograph's while one
// container drawing serves the whole plant. Ground lines (tracks, trenches,
// beds) are projected point by point, so they converge truly. The camera looks
// nearly square on to the rows, so they run almost level across the card and
// the columns close toward one point just right of the phone card's centre.
const AZ = 87, EL = 34, RAD = Math.PI / 180;
const A = AZ * RAD, E = EL * RAD;
const VIEW = [Math.cos(A) * Math.cos(E), Math.sin(A) * Math.cos(E), Math.sin(E)];
const RIGHT = [Math.sin(A), -Math.cos(A), 0];
const DOWN = [Math.cos(A) * Math.sin(E), Math.sin(A) * Math.sin(E), -Math.cos(E)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// the front row's foot sits just under the card's bottom edge, so the card
// cuts off its sleepers and the bottom of its doors
const FOCAL = 1240, NEAR_SCALE = 1.65;
const TARGET = [PERIOD + PCS_X + PCS.w / 2, rowY(0) + C.d / 2, 0], ON_SCREEN = [1132, 197];
const EYE = TARGET.map((v, i) => v + (VIEW[i] * FOCAL) / NEAR_SCALE);
const distOf = (p) => dot([EYE[0] - p[0], EYE[1] - p[1], EYE[2] - p[2]], VIEW);
const screen = (p) => {
  const d = [p[0] - EYE[0], p[1] - EYE[1], p[2] - EYE[2]], D = distOf(p);
  return [ON_SCREEN[0] + (FOCAL * dot(d, RIGHT)) / D, ON_SCREEN[1] + (FOCAL * dot(d, DOWN)) / D];
};
const scaleAt = (p) => FOCAL / distOf(p);
const NEAR_DIST = distOf(TARGET);

// Parts are drawn at KS px per unit and placed at scaleAt / KS.
const KS = 2;
const P = { origin: [0, 0], scale: KS / Math.sqrt(1.6), azimuth: AZ, elevation: EL };
const f1 = (v) => (Math.round(v * 100) / 100).toString();
const f2 = (v) => (Math.round(v * 1000) / 1000).toString();
const placed = (anchor) => { const [x, y] = screen(anchor); return `translate(${f1(x)} ${f1(y)}) scale(${f2(scaleAt(anchor) / KS)})`; };

// Distance haze: a ladder of tone sets, nearest first, picked per part by its distance.
const HAZE_STEP = 0.1;
const hazeOf = (p) => Math.max(0, Math.min(5, Math.floor((distOf(p) / NEAR_DIST - 1.05) / HAZE_STEP) + 1));
// detail a part earns at its size on screen
const tierOf = (p) => { const s = scaleAt(p); return s > 1.4 ? "near" : s > 1 ? "mid" : "far"; };

const at = (p) => k.iso(p, P);
const path = (pts, closed = false) => k.pathOf(pts.map(at), closed);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts.map(at), style);
const slab = (plan, z, h, steps = 2, bevel = 0) => k.slabOf({ r: 0, ...plan }, z, h, P, steps, bevel);
const depth = (p) => k.depthOf(p, P);
// a rectangle on a face that looks along +y, at that y: x0..x1, z0..z1
const frontRect = (y, x0, x1, z0, z1) => path([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], true);
const frontLine = (y, x0, z0, x1, z1) => path([[x0, y, z0], [x1, y, z1]]);
// a group in the plane of a face that looks along +y: local (x, -z)
const onFront = (y, inner, attrs = "") => `<g class="bt-face" transform="${k.sideMatrix([0, y], 0, P, "left")}"${attrs}>${inner}</g>`;
const onTop = (z, inner, attrs = "") => `<g class="bt-face" transform="${k.topMatrix([0, 0], z, P, "x")}"${attrs}>${inner}</g>`;
const circle = (cx, cy, r, cls, extra = "") => `<circle class="${cls}" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}"${extra}/>`;

// Fans: the air conditioners' condensers on the containers and the inverters'
// roof fans. Each kind's blades and guard are drawn
// once about the origin of a face; a fan in place is its dark throat, the blades
// (a <use> the page turns by its own transform, so no shared drawing changes)
// and the guard over them.
const FANS = { hvac: { r: 5, blades: 3, spin: "hvac" }, pcs: { r: 4.7, blades: 5, spin: "pcs" } };
function fanDefs() {
  return Object.entries(FANS).map(([kind, { r, blades }]) => {
    const blade = (a) => {
      const p = (ang, rad) => [rad * Math.cos(ang), rad * Math.sin(ang)];
      const [a0, a1] = [a - 0.42, a + 0.38];
      const pts = [p(a0, r * 0.28), p(a0 - 0.1, r * 0.92), p(a + 0.05, r * 0.97), p(a1, r * 0.9), p(a1 + 0.08, r * 0.3)];
      return "M" + pts.map((q) => q.map(f1).join(" ")).join("L") + "Z";
    };
    const set = Array.from({ length: blades }, (_, i) => blade((i / blades) * Math.PI * 2)).join("");
    return `<g id="bt-fan-${kind}"><path class="bt-blade" d="${set}"/>${circle(0, 0, r * 0.24, "bt-hub")}</g>` +
      `<g id="bt-guard-${kind}">${circle(0, 0, r * 0.62, "bt-guard")}${circle(0, 0, r, "bt-guard bt-rim")}<path class="bt-guard" d="M${f1(-r)} 0H${f1(r)}M0 ${f1(-r)}V${f1(r)}"/></g>`;
  }).join("");
}
let fanPhase = 0;
const fanAt = (cx, cy, kind, throat = true) => {
  fanPhase = (fanPhase + 137) % 360;
  return (throat ? circle(cx, cy, FANS[kind].r, "bt-throat") : "") +
    `<g transform="translate(${f1(cx)} ${f1(cy)})"><use href="#bt-fan-${kind}" data-fan="${FANS[kind].spin}" data-ph="${fanPhase}"/><use href="#bt-guard-${kind}"/></g>`;
};
// where the moving parts sit in the shared drawings, for the overlays placed over each copy
const CX0 = -C.w / 2;
const LAMP = { x0: CX0 + 27.4, x1: CX0 + 35.4, z0: C.plinth + 2.6, z1: C.plinth + 22.6, y: C.d / 2 };
const HVAC_FAN = { y: C.d / 2 + 5, cx: CX0 + 49.5, cy: -(C.plinth + 3 + 11.4) };
const PCS_FANS = { z: 1.4 + PCS.skid + 22 + 2, xs: [-PCS.w / 2 + 12, -PCS.w / 2 + 26] };
const shadow = (x0, x1, y0, y1) => `<path class="bt-shadow" d="${path([[x0, y0, 0], [x1 + 3, y0, 0], [x1 + 3, y1 + 1.5, 0], [x0, y1 + 1.5, 0]], true)}"/>`;

// ── A battery container, centred on the origin, at the detail its size earns ─
function container(tier) {
  const x = -C.w / 2, z0 = C.plinth, z1 = C.plinth + C.h, y = C.d / 2, out = [];
  const near = tier === "near", mid = tier === "mid";
  const plan = { x, y: -C.d / 2, w: C.w, d: C.d, r: 0.3 };
  out.push(shadow(x - 1, x + C.w, -C.d / 2 - 1, y + 1));
  // three concrete sleepers under it
  for (const sx of [x + 3, x + C.w / 2 - 3.5, x + C.w - 10]) out.push(S(slab({ x: sx, y: -C.d / 2 - 1, w: 7, d: C.d + 2 }, 0, z0), { tone: "lo", crease: near ? "faint" : "none" }));
  const door = { x0: x + 7.5, x1: x + 24.5, z0: z0 + 1.4, z1: z0 + 22.6 };
  const lamp = LAMP;
  const hvac = { x0: x + 43, x1: x + 56, z0: z0 + 3, z1: z0 + 21 };
  const rail = [z0 + 1.4, z1 - 1.4];
  // the box: rails, corner posts and corrugation are under its outline
  let inner = "";
  if (tier !== "far") {
    const lines = [k.sideSeam(plan, rail[0], P, 2), k.sideSeam(plan, rail[1], P, 2)];
    const corr = [];
    for (let cx = x + 3; cx < x + C.w - 2; cx += near ? 2.8 : 5.6) {
      const inDoor = cx > door.x0 - 0.4 && cx < door.x1 + 0.4;
      const inLamp = cx > lamp.x0 - 0.4 && cx < lamp.x1 + 0.4;
      const inHvac = cx > hvac.x0 && cx < hvac.x1;
      if (inDoor) corr.push(frontLine(y, cx, door.z1, cx, rail[1]));
      else if (inLamp) corr.push(frontLine(y, cx, rail[0], cx, lamp.z0), frontLine(y, cx, lamp.z1, cx, rail[1]));
      else if (inHvac) corr.push(frontLine(y, cx, rail[0], cx, hvac.z0), frontLine(y, cx, hvac.z1, cx, rail[1]));
      else corr.push(frontLine(y, cx, rail[0], cx, rail[1]));
    }
    const posts = [frontLine(y, x + 1.6, z0, x + 1.6, z1), frontLine(y, x + C.w - 1.6, z0, x + C.w - 1.6, z1)];
    const end = [path([[x + C.w, y - 1.6, z0], [x + C.w, y - 1.6, z1]]), path([[x + C.w, -y + 1.6, z0], [x + C.w, -y + 1.6, z1]])];
    // up close, the roof's top rails inset round its edge and its shallow ribs between them
    const roof = [];
    if (near) {
      const e = 1.4, ry0 = -C.d / 2 + e, ry1 = C.d / 2 - e;
      roof.push(path([[x + e, ry0, z1], [x + C.w - e, ry0, z1], [x + C.w - e, ry1, z1], [x + e, ry1, z1]], true));
      for (let rx = x + 5; rx < x + C.w - 3; rx += 5) roof.push(path([[rx, ry0, z1], [rx, ry1, z1]]));
    }
    inner = L(corr.join(""), { tone: near ? "lo" : "faint" }) + L(lines.join("") + posts.join("") + end.join(""), { tone: "lo" }) + (near ? L(roof.join(""), { tone: "faint" }) : "");
  }
  out.push(S(slab(plan, z0, C.h, 2, near ? 0.5 : 0), { tone: "hi", crease: tier === "far" ? "none" : "faint", inner }));
  if (near) {
    // ISO corner castings at the front corners, each with its oval twistlock hole,
    // and the forklift pockets in the bottom rail
    const castings = [], holes = [];
    for (const cx of [x, x + C.w - 3.6]) for (const cz of [z0, z1 - 2.6]) {
      castings.push(S(slab({ x: cx, y: y - 2.4, w: 3.6, d: 2.7 }, cz, 2.6, 2, 0.2), { tone: "mid", crease: "none" }));
      holes.push(frontRect(y + 0.3, cx + 0.9, cx + 2.7, cz + 0.8, cz + 1.8));
    }
    out.push(...castings, L(holes.join(""), { tone: "lo" }));
    out.push(L([x + 17.3, x + 43.3].map((fx) => frontRect(y, fx - 3, fx + 3, z0 + 0.25, z0 + 1.15)).join(""), { tone: "lo" }));
  }
  // roof: an exhaust vent and the four lifting castings
  const vent = [x + C.w - 14, -3];
  if (tier !== "far") out.push(S(k.cylinder(vent[0], vent[1], 2.6, z1, 1.8, P, near ? 18 : 10), { tone: "mid", crease: "none" }));
  if (near) {
    out.push(S(k.cylinder(vent[0], vent[1], 3.4, z1 + 1.8, 0.6, P, 20), { tone: "mid" }));
    out.push(S(slab({ x: x + 22, y: -9, w: 12, d: 7 }, z1, 0.5), { tone: "lo" }));
    out.push(D(k.corners(plan, 1.2).map(([cx, cy]) => [cx, cy, z1]), { size: 0.5, tone: "mid" }));
    // the fire system's strobe beacon on the roof's front corner
    out.push(S(k.cylinder(x + 6, y - 5, 1.5, z1, 0.8, P, 16), { tone: "mid", crease: "none" }));
    out.push(S(k.cylinder(x + 6, y - 5, 1, z1 + 0.8, 1.6, P, 14), { tone: "hi", crease: "none" }));
  }
  // the double door: frame and meeting stile; up close, hinges, lock bars, keepers, handles
  const leaf = (door.x1 - door.x0) / 2, m = door.x0 + leaf;
  out.push(L(frontRect(y, door.x0, door.x1, door.z0, door.z1) + frontLine(y, m, door.z0, m, door.z1), { tone: tier === "far" ? "mid" : "lo" }));
  if (near) {
    out.push(L(frontRect(y, door.x0 + 1, m - 1, door.z0 + 1, door.z1 - 1) + frontRect(y, m + 1, door.x1 - 1, door.z0 + 1, door.z1 - 1), { tone: "faint" }));
    const hinge = [];
    for (const hz of [door.z0 + 3, (door.z0 + door.z1) / 2, door.z1 - 3]) for (const hx of [door.x0, door.x1]) hinge.push(frontRect(y + 0.2, hx - 0.6, hx + 0.6, hz - 1, hz + 1));
    out.push(L(hinge.join(""), { tone: "mid" }));
    const bars = [], keep = [], handles = [], knobs = [];
    for (const bx of [m - 2.2, m + 2.2]) {
      bars.push(frontLine(y + 0.4, bx, door.z0 + 1.6, bx, door.z1 - 1.6));
      keep.push(frontRect(y + 0.4, bx - 0.7, bx + 0.7, door.z0 + 0.8, door.z0 + 1.6), frontRect(y + 0.4, bx - 0.7, bx + 0.7, door.z1 - 1.6, door.z1 - 0.8));
      const side = bx < m ? -1 : 1;
      handles.push(frontLine(y + 0.4, bx, door.z0 + 9, bx + side * 2.6, door.z0 + 9));
      knobs.push([bx + side * 2.6, y + 0.4, door.z0 + 9]);
    }
    out.push(L(bars.join(""), { tone: "mid" }), L(keep.join(""), { tone: "lo" }), L(handles.join(""), { tone: "mid" }), D(knobs, { size: 0.45, tone: "mid" }));
    // a battery hazard triangle on the left leaf, the CSC approval plate on the right
    const tx = door.x0 + 3.4, tz = door.z1 - 7.2;
    out.push(L(path([[tx - 1.8, y, tz], [tx + 1.8, y, tz], [tx, y, tz + 3.1]], true), { tone: "mid" }), D([[tx, y, tz + 0.9]], { size: 0.35, tone: "mid" }));
    const csc = { x0: m + 3.4, x1: m + 7, z0: door.z1 - 7.2, z1: door.z1 - 4.4 };
    out.push(L(frontRect(y, csc.x0, csc.x1, csc.z0, csc.z1), { tone: "lo" }));
    out.push(L([csc.z1 - 0.9, csc.z1 - 1.9].map((rz, j) => frontLine(y, csc.x0 + 0.6, rz, csc.x1 - 0.6 - j * 0.9, rz)).join(""), { tone: "faint", free: true }));
  } else if (mid) {
    out.push(L(frontLine(y, m - 2.2, door.z0, m - 2.2, door.z1) + frontLine(y, m + 2.2, door.z0, m + 2.2, door.z1), { tone: "faint" }));
  }
  // the state-of-charge lamp's housing beside the door; its segments are lampSegments()
  out.push(S(slab({ x: lamp.x0, y, w: lamp.x1 - lamp.x0, d: 1.2 }, lamp.z0, lamp.z1 - lamp.z0, 2, near ? 0.3 : 0), { tone: "mid", crease: "none" }));
  if (near) {
    // a rating plate
    const plate = { x0: x + 36.6, x1: x + 41.4, z0: z0 + 15, z1: z0 + 19 };
    out.push(L(frontRect(y, plate.x0, plate.x1, plate.z0, plate.z1), { tone: "lo" }));
    out.push(L([plate.z1 - 1, plate.z1 - 2, plate.z1 - 3].map((rz, j) => frontLine(y, plate.x0 + 0.8, rz, plate.x1 - 0.8 - j * 1.1, rz)).join(""), { tone: "faint", free: true }));
    // the emergency stop: a mushroom button on its box below the plate
    out.push(S(slab({ x: x + 37.2, y, w: 3.6, d: 0.8 }, z0 + 8.6, 3.6, 2, 0.2), { tone: "mid", crease: "none" }));
    out.push(onFront(y + 0.8, circle(x + 39, -(z0 + 10.4), 1.1, "bt-hub")));
    // the air conditioner's condensate drain, down to the gravel
    out.push(S(slab({ x: hvac.x1 - 2.6, y: y + 3, w: 0.9, d: 0.9 }, 0, hvac.z0), { tone: "lo", crease: "none" }));
  }
  // the wall-hung air conditioner: louvres below, a condenser fan behind a guard
  const hy = y + 5, hplan = { x: hvac.x0, y, w: hvac.x1 - hvac.x0, d: 5, r: 0 };
  out.push(S(slab(hplan, hvac.z0, hvac.z1 - hvac.z0, 2, near ? 0.4 : 0), { tone: "mid", crease: near ? "faint" : "none", inner: near ? L(k.sideSeam(hplan, hvac.z1 - 1.2, P, 2), { tone: "faint" }) : "" }));
  const fc = [(hvac.x0 + hvac.x1) / 2, -(hvac.z0 + 11.4)];
  if (near) {
    const louvres = [];
    for (let lz = hvac.z0 + 1.4; lz < hvac.z0 + 5; lz += 1.2) louvres.push(frontRect(hy, hvac.x0 + 1.2, hvac.x1 - 1.2, lz, lz + 0.5));
    out.push(L(louvres.join(""), { tone: "lo" }));
    out.push(onFront(hy, circle(fc[0], fc[1], FANS.hvac.r, "bt-throat")));
    out.push(D([[hvac.x0 + 1, hy, hvac.z1 - 2.2], [hvac.x1 - 1, hy, hvac.z1 - 2.2]], { size: 0.4, tone: "mid" }));
  } else if (mid) {
    out.push(onFront(hy, circle(fc[0], fc[1], 5, "bt-throat") + circle(fc[0], fc[1], 5, "bt-guard bt-rim")));
  }
  // DC cables leave through a trunking box down into the aisle's trench
  if (tier !== "far") out.push(S(slab({ x: x + 2.4, y, w: 4.4, d: TRENCH_DY - y }, 0, z0 + 4, 2, near ? 0.3 : 0), { tone: "mid", crease: "none" }));
  return out.join("");
}

// The charge lamp's segments, ten up close and five far off: a copy laid over
// each container. Each segment's light is the copy's --bt-soc, and the page
// gives every copy the same state of charge: the plant is one battery.
function lampSegments(tier) {
  const n = tier === "far" ? 5 : 10, segH = (LAMP.z1 - LAMP.z0 - 1.6) / n, ly = LAMP.y + 1.2, segs = [];
  for (let s = 0; s < n; s++) {
    const a = LAMP.z0 + 0.8 + s * segH, d = frontRect(ly, LAMP.x0 + 0.8, LAMP.x1 - 0.8, a, a + segH * 0.74);
    segs.push(`<path class="bt-seg-off" d="${d}"/><path class="bt-seg" style="--n:${s}" d="${d}"/>`);
  }
  return `<g style="--segs:${n}">${segs.join("")}</g>`;
}

// ── The power conversion skid: inverter, MV transformer, ring main unit ─────
// Centred on the origin. The inverter's roof fans run with the power it converts.
function pcs(tier) {
  const out = [], near = tier === "near", far = tier === "far";
  const x = -PCS.w / 2, y0 = -PCS.d / 2, fy = PCS.d / 2, zc = 1.4 + PCS.skid;
  out.push(shadow(x, x + PCS.w, y0, fy));
  if (!far) for (const sx of [x + 4, x + PCS.w / 2 - 3, x + PCS.w - 10]) out.push(S(slab({ x: sx, y: y0 - 1, w: 6, d: PCS.d + 2 }, 0, 1.4), { tone: "lo", crease: "none" }));
  const skid = { x, y: y0, w: PCS.w, d: PCS.d, r: 0 };
  out.push(S(slab(skid, far ? 0 : 1.4, far ? zc : PCS.skid), { tone: "mid", crease: "none", inner: near ? L(k.sideSeam(skid, 2.4 + 1.4, P, 2), { tone: "lo" }) : "" }));
  // the inverter: a cabinet of four doors, grilles low, two roof fans
  const inv = { x: x + 3, y: -8, w: 32, d: 16, h: 22 };
  const top = zc + inv.h, ify = inv.y + inv.d;
  const doors = [], grille = [];
  if (!far) for (let n = 0; n < 4; n++) {
    const dx0 = inv.x + 1 + n * 7.5, dx1 = dx0 + 7;
    doors.push(frontRect(ify, dx0, dx1, zc + 1, top - 1.2));
    if (near) for (let gz = zc + 2.4; gz < zc + 6.5; gz += 1.1) grille.push(frontRect(ify, dx0 + 1.2, dx1 - 1.2, gz, gz + 0.45));
  }
  out.push(S(slab(inv, zc, inv.h, 2, near ? 0.5 : 0), { tone: "hi", crease: near ? "faint" : "none", inner: L(doors.join(""), { tone: "lo" }) + L(grille.join(""), { tone: "faint" }) }));
  if (near) {
    // door handles on their two mounting bosses
    const hx = [0, 1, 2, 3].map((n) => inv.x + 6.4 + n * 7.5);
    out.push(L(hx.map((x) => frontLine(ify, x, zc + 10, x, zc + 13)).join(""), { tone: "mid" }));
    out.push(D(hx.flatMap((x) => [[x, ify, zc + 10], [x, ify, zc + 13]]), { size: 0.4, tone: "mid" }));
    out.push(D([[inv.x + 4.8, ify, top - 3], [inv.x + 12.3, ify, top - 3]], { size: 0.4, tone: "hi" }));
  }
  for (const fx of PCS_FANS.xs) {
    out.push(S(k.cylinder(fx, 0, 5.4, top, 2, P, near ? 36 : 14), { tone: "mid", crease: "none" }));
    if (near) out.push(onTop(PCS_FANS.z, circle(fx, 0, FANS.pcs.r, "bt-throat")));
  }
  // the MV transformer: tank, radiator fins toward the viewer, three bushings in a cable box
  const tx = { x: x + 39, y: -7, w: 18, d: 12, h: 17 };
  out.push(S(slab(tx, zc, tx.h, 2, near ? 0.4 : 0), { tone: "mid", crease: "none" }));
  const fins = { x: tx.x + 1.5, y: tx.y + tx.d, w: tx.w - 3, d: 4.5, r: 0 };
  const plates = [];
  if (!far) for (let px = fins.x + 0.9; px < fins.x + fins.w - 0.4; px += near ? 1.2 : 2.4) plates.push(path([[px, fins.y + fins.d, zc + 2.5], [px, fins.y + fins.d, zc + tx.h - 3]]));
  out.push(S(slab(fins, zc + 1.5, tx.h - 3), { tone: "mid", crease: "none", inner: L(plates.join(""), { tone: "lo" }) + (!far ? L(k.sideSeam(fins, zc + 2.5, P, 2) + k.sideSeam(fins, zc + tx.h - 3, P, 2), { tone: "lo" }) : "") }));
  out.push(S(slab({ x: tx.x + 2, y: tx.y + 2, w: tx.w - 4, d: 6 }, zc + tx.h, 3.4, 2, near ? 0.3 : 0), { tone: "mid", crease: "none" }));
  // the ring main unit: a slim cabinet with its mimic panel
  const rmu = { x: x + 60, y: -6, w: 11, d: 13, h: 19 };
  out.push(S(slab(rmu, zc, rmu.h, 2, near ? 0.4 : 0), { tone: "hi", crease: "none", inner: far ? "" : L(frontRect(rmu.y + rmu.d, rmu.x + 1, rmu.x + rmu.w - 1, zc + 1, zc + rmu.h - 1.2), { tone: "lo" }) }));
  if (near) {
    // the mimic: a busbar across the door, a feeder down to its switch
    const ry = rmu.y + rmu.d, mx = rmu.x + rmu.w / 2;
    out.push(L(frontLine(ry, rmu.x + 1, zc + 13, rmu.x + rmu.w - 1, zc + 13) + frontLine(ry, mx, zc + 13, mx, zc + 10.5), { tone: "mid" }));
    out.push(D([[mx, ry, zc + 10.5], [rmu.x + 3, ry, zc + 7], [rmu.x + rmu.w - 3, ry, zc + 7]], { size: 0.5, tone: "mid" }));
  }
  // cables drop to the aisle's trench
  if (!far) out.push(S(slab({ x: x + PCS.w / 2 - 3, y: fy, w: 6, d: TRENCH_DY - fy }, 0, zc + 2, 2, 0.3), { tone: "mid", crease: "none" }));
  return out.join("");
}

// ── Ground: projected point by point, so it converges ───────────────────────
const sp = (pts, closed = false) => k.pathOf(pts.map(screen), closed);
const ROWS = 7, BLOCKS = [-6, 4];
const blockRange = Array.from({ length: BLOCKS[1] - BLOCKS[0] + 1 }, (_, i) => BLOCKS[0] + i);
// a ground line cut where it passes too close under the camera, far below the
// frame, where its projection would run off toward infinity
const MIN_DIST = 150;
const clipNear = (a, b) => {
  const [da, db] = [distOf(a), distOf(b)];
  if (da >= MIN_DIST && db >= MIN_DIST) return [a, b];
  if (da < MIN_DIST && db < MIN_DIST) return null;
  const t = (MIN_DIST - da) / (db - da), cut = a.map((v, i) => v + (b[i] - v) * t);
  return da < MIN_DIST ? [cut, b] : [a, cut];
};
// whether a ground line between two world points crosses the frame
const spans = (a0, b0) => {
  const ends = clipNear(a0, b0);
  if (!ends) return false;
  const [a, b] = ends;
  const [p, q] = [screen(a), screen(b)];
  return Math.max(p[0], q[0]) > VEIL && Math.min(p[0], q[0]) < WIDTH + 20 && Math.max(p[1], q[1]) > -20 && Math.min(p[1], q[1]) < HEIGHT + 20;
};
const offFrame = ([x, y]) => x < 0 || x > WIDTH || y < 0 || y > HEIGHT;
// A ground line, projected. An end the frame cuts off is marked free: the card
// crops the line there, it does not stop.
function groundLine(a0, b0, tone) {
  const ends = clipNear(a0, b0);
  if (!ends || !spans(a0, b0)) return "";
  const [p, q] = ends.map(screen);
  const free = [offFrame(p) && "start", offFrame(q) && "end"].filter(Boolean);
  return L(k.pathOf([p, q]), { tone, free: free.length === 2 ? "both" : free[0] });
}
// a block's patch of the aisle in front of row y: everything between its access roads
function aisle(b, y, out, add) {
  const x0 = b * PERIOD, x1 = x0 + BLOCK, e0 = x0 - 10, e1 = x1 + 10;
  const mid = [x0 + BLOCK / 2, y, 0];
  if (!spans([e0, y + TRACK.y1, 0], [e1, y - BED.back, 0]) && !spans([e0, y - BED.back, 0], [e1, y + TRACK.y1, 0])) return;
  const h = hazeOf(mid);
  // the row's gravel bed and the aisle's track
  out.push(`<path class="bt-bed bt-h${h}" d="${sp([[x0 - 4, y - BED.back, 0], [x1 + 4, y - BED.back, 0], [x1 + 4, y + BED.front, 0], [x0 - 4, y + BED.front, 0]], true)}"/>`);
  out.push(`<path class="bt-track bt-h${h}" d="${sp([[e0, y + TRACK.y0, 0], [e1, y + TRACK.y0, 0], [e1, y + TRACK.y1, 0], [e0, y + TRACK.y1, 0]], true)}"/>`);
  // the trench and the track's kerbs, each from access road to access road
  const t0 = y + TRENCH_DY, t1 = t0 + 6;
  const [k0, k1, k2, k3] = [t0, t1, y + TRACK.y0, y + TRACK.y1].map((ly) => groundLine([e0, ly, 0], [e1, ly, 0], "lo"));
  out.push(`<g class="bt-h${h}">${k0}${k1}${k2}${k3}</g>`);
  // the trench's cover joints and the track's slab joints, kerb to kerb, where both kerbs are drawn
  const joints = [];
  if (k0 && k1) for (let jx = x0 + 9; jx < x1 - 2; jx += 9) joints.push(sp([[jx, t0, 0], [jx, t1, 0]]));
  if (k2 && k3) for (let jx = e0 + 40; jx < e1 - 10; jx += 40) joints.push(sp([[jx, y + TRACK.y0, 0], [jx, y + TRACK.y1, 0]]));
  add(h, "faint", joints.join(""));
}
function ground() {
  const out = [], hazeLines = new Map();
  const add = (level, tone, d) => { const key = `${level}|${tone}`; hazeLines.set(key, (hazeLines.get(key) || "") + d); };
  for (let r = ROWS - 1; r >= 0; r--) for (const b of blockRange) aisle(b, rowY(r), out, add);
  // the access roads between blocks, each with a trench down its side that
  // gathers the rows' cables; the card cuts them off front and back
  for (const b of blockRange) {
    const rx0 = b * PERIOD + BLOCK + 10, rx1 = rx0 + ROAD - 20;
    const front = rowY(0) + PITCH, back = rowY(ROWS);
    for (const [x, tone] of [[rx0, "lo"], [rx1, "lo"], [rx1 + 2, "faint"], [rx1 + 6, "faint"]]) out.push(groundLine([x, front, 0], [x, back, 0], tone));
  }
  for (const [key, d] of hazeLines) { const [level, tone] = key.split("|"); out.push(`<g class="bt-h${level}">${L(d, { tone })}</g>`); }
  return out.join("");
}

// ── Compose: shared drawings in <defs>, placed far to near ───────────────────
const TIERS = ["near", "mid", "far"];
// A <use> clone sits in its own shadow tree, which the scope's descendant
// selectors cannot reach, so the shared drawings carry the kit's classes renamed
// bt-iso-* and those rules (unique to this card) are written unscoped.
const own = (svg) => svg.replace(/class="iso-/g, 'class="bt-iso-').replace(/ iso-(crease|bevel|edge)/g, " bt-iso-$1");
const DRAWINGS = Object.fromEntries(TIERS.flatMap((t) => [[`bt-c-${t}`, container(t)], [`bt-l-${t}`, lampSegments(t)], [`bt-p-${t}`, pcs(t)]]));
const defs = Object.entries(DRAWINGS).map(([id, svg]) => `<g id="${id}">${own(svg)}</g>`).join("") + fanDefs();
// Each copy is followed by what moves on it, in the same painter's slot: the
// lamp's segments over every container, the fans over all but the far ones.
const placedParts = [];
for (let r = 0; r < ROWS; r++) for (const b of blockRange) for (const slot of SLOTS) {
  const isPcs = slot === "pcs";
  const anchor = [b * PERIOD + (isPcs ? PCS_X + PCS.w / 2 : slot + C.w / 2), rowY(r), 0];
  const [sx, sy] = screen(anchor), s = scaleAt(anchor);
  if (sx + 50 * s < VEIL || sx - 50 * s > WIDTH || sy < -2 || sy - 40 * s > HEIGHT) continue;
  const tier = tierOf(anchor), haze = `bt-h${hazeOf(anchor)}`, at = placed(anchor);
  let svg = `<use href="#bt-${isPcs ? "p" : "c"}-${tier}" class="${haze}" transform="${at}"/>`;
  if (!isPcs) svg += `<use href="#bt-l-${tier}" class="bt-lamp ${haze}" data-steps="${{ near: 50, mid: 30, far: 10 }[tier]}" transform="${at}"/>`;
  if (tier !== "far") {
    const fans = isPcs ? onTop(PCS_FANS.z, PCS_FANS.xs.map((fx) => fanAt(fx, 0, "pcs", false)).join("")) : onFront(HVAC_FAN.y, fanAt(HVAC_FAN.cx, HVAC_FAN.cy, "hvac", false));
    svg += `<g class="${haze}" transform="${at}">${fans}</g>`;
  }
  placedParts.push({ d: distOf(anchor), svg });
}
placedParts.sort((a, b) => b.d - a.d);
const parts = { defs: `<defs>${defs}</defs>`, ground: ground(), plant: placedParts.map((p) => p.svg).join("") };
const body = parts.defs + parts.ground + `<g class="bt-weight">${parts.plant}</g>`;
if (process.argv.includes("--sizes")) {
  console.log(Object.entries(parts).map(([n, v]) => `${n} ${(v.length / 1024).toFixed(1)}`).join(" · "));
  for (let r = 0; r < 5; r++) console.log(`row ${r} h${hazeOf([0, rowY(r), 0])}: ` + [0, 1, 2].map((b) => {
    const a = screen([b * PERIOD, rowY(r) + C.d / 2, 0]), z = screen([b * PERIOD + BLOCK, rowY(r) + C.d / 2, 0]), top = screen([b * PERIOD + BLOCK, rowY(r) - C.d / 2, C.plinth + C.h]);
    return `block ${b} x ${Math.round(a[0])}..${Math.round(z[0])} foot ${Math.round(a[1])}..${Math.round(z[1])} top ${Math.round(top[1])} @${scaleAt([b * PERIOD + BLOCK, rowY(r), 0]).toFixed(2)} ${tierOf([b * PERIOD + BLOCK, rowY(r), 0])}`;
  }).join(" · "));
  console.log(TIERS.map((t) => `container ${t} ${(container(t).length / 1024).toFixed(1)} · pcs ${t} ${(pcs(t).length / 1024).toFixed(1)}`).join(" · "), `· ${placedParts.length} placed`);
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
const SITE = { lit: "#eef5fa", dot: "#9fb2c2", lamp: "#eef5fa", "lamp-off": "#10283a", bed: "#071520", track: "#0b1c29" };
const HAZE = "#0d2131";
const mix = (a, b, t) => "#" + [0, 1, 2].map((i) => {
  const ca = parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16), cb = parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16);
  return Math.round(ca + (cb - ca) * t).toString(16).padStart(2, "0");
}).join("");
// each step of haze pulls lines and faces toward the haze colour; the lamps keep the most
const LADDER = [1, 2, 3, 4, 5].map((n) => {
  const t = Math.min(0.92, n * 0.17);
  const lines = ["hi", "mid", "lo", "faint"].map((n2) => `--anatomy-${n2}:${mix(TOKENS[n2], HAZE, t)}`);
  const faces = ["paper", "face", "shade-0", "shade-1", "shade-2", "shade-3", "top"].map((n2) => `--anatomy-${n2}:${mix(TOKENS[n2], HAZE, Math.min(1, t * 1.15))}`);
  const lamp = [`--bt-lamp:${mix(SITE.lamp, HAZE, t * 0.55)}`, `--bt-lamp-off:${mix(SITE["lamp-off"], HAZE, t)}`, `--bt-bed:${mix(SITE.bed, HAZE, t)}`, `--bt-track:${mix(SITE.track, HAZE, t)}`];
  return `.bt-h${n}{${[...lines, ...faces, ...lamp].join(";")}}`;
});
const SCENE_CSS = `.bt-weight{--anatomy-weight:${f2(0.6 * KS / NEAR_SCALE)}px}
.bt-face *{vector-effect:non-scaling-stroke}
.bt-shadow{fill:var(--anatomy-shade-0);opacity:.7}
.bt-bed{fill:var(--bt-bed);stroke:none}
.bt-seg-off{fill:var(--bt-lamp-off);stroke:none}
.bt-seg{fill:var(--bt-lamp);stroke:none;opacity:clamp(0,calc(var(--bt-soc,0) * var(--segs) - var(--n)),1)}
.bt-throat{fill:var(--anatomy-shade-0);stroke:none}
.bt-blade{fill:var(--anatomy-shade-3);stroke:var(--anatomy-lo);stroke-width:.4px;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.bt-hub{fill:var(--anatomy-top);stroke:var(--anatomy-mid);stroke-width:.4px;vector-effect:non-scaling-stroke}
.bt-guard{fill:none;stroke:var(--anatomy-mid);stroke-width:.45px;vector-effect:non-scaling-stroke}
.bt-rim{stroke-width:.6px}
.bt-track{fill:var(--bt-track);stroke:none}
${LADDER.join("\n")}`;
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots|face-text)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const siteVars = Object.entries(SITE).map(([n, v]) => (n === "lit" || n === "dot" ? `--anatomy-${n}:${v}` : `--bt-${n}:${v}`)).join(";");
const css = `${SCOPE}{${NAVY};${siteVars};--anatomy-weight:.6px}` + KIT.map(scope).join("") + KIT.map((rule) => rule.replace(/\.iso-/g, ".bt-iso-")).join("") + SCENE_CSS.replace(/\n/g, "");
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${body}</svg>`;

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
// each lamp is restyled only when its own size can show the change: 50 steps of
// charge up close, 10 far off, so the far rows cost little while the plant moves
const lamps = [...svg.querySelectorAll(".bt-lamp")].map((el) => ({ el, steps: +el.dataset.steps, shown: -1 }));
const fans = [...svg.querySelectorAll("[data-fan]")].map((el) => ({ el, kind: el.dataset.fan, ph: +el.dataset.ph }));
// fans: the containers' air conditioners tick over and work harder with the
// current; the inverters' fans run with the power they convert and coast to rest
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
writeFileSync(join(OUT, "scene.svg"), markup);
writeFileSync(join(OUT, "scene.js"), `// Generated by figures/battery/build.mjs: runs one day of the post's DQN\n// battery on its card. Edit the build, not this file.\n${live}`);

// ── Preview: the card as the homepage draws it ───────────────────────────────
const preview = (hour, svg = markup) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Battery card</title><style>
body{margin:0;padding:24px 15px;background:#fff;font-family:"Quicksand",system-ui,sans-serif}
.wrap{max-width:1110px;margin:0 auto}
.card{position:relative;height:160px;border:1px solid rgba(0,0,0,.125);border-radius:.25rem;overflow:hidden;background:#081722;display:flex}
.scene-battery{position:absolute;inset:0}
.scene-battery svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,0.2),white 80%)}
.card-block{position:relative;z-index:2;margin:auto 15px;max-width:640px}
h2{color:#717171;font-weight:500;font-size:1.6rem;margin:0 0 .4rem;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:1rem;margin:0 0 .3rem}.text{color:#000;font-size:.95rem;margin:0}
</style></head><body><div class="wrap"><div class="card"><div class="scene-battery"${hour === undefined ? "" : ` data-hour="${hour}"`} aria-hidden="true">${svg}</div>
<div class="card-block"><h2>Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation</h2><p class="date">Oct 10, 2022</p><p class="text">Wholesale arbitrage with DQN agents, benchmarked against MILP</p></div></div></div>
<script type="module">${live.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview());
// --stills <dir>: the card held at chosen hours, for captures, and check.html,
// the same card with every <use> drawn in place, since the line check skips <defs>
const stills = process.argv.indexOf("--stills");
if (stills > 0) {
  const dir = process.argv[stills + 1];
  mkdirSync(dir, { recursive: true });
  for (const h of [5.5, 10.5, 15, 19.5]) writeFileSync(join(dir, `preview-${String(h).replace(".", "_")}.html`), preview(h));
  const inline = markup.replace(/<use href="#(bt-[clp]-\w+)" ([^>]*)\/>/g, (_, id, attrs) => `<g ${attrs}>${DRAWINGS[id]}</g>`);
  writeFileSync(join(dir, "check.html"), preview(STILL_HOUR, inline));
  // parts.html: each shared drawing on its own, large, for close-ups
  const row = Object.entries(DRAWINGS).map(([, svg], n) => `<g transform="translate(${110 + n * 150} 120) scale(1.1)">${svg}</g>`).join("");
  writeFileSync(join(dir, "parts.html"), preview(STILL_HOUR, markup.replace(/<defs>.*<\/svg>$/, `<g class="bt-weight">${row}</g></svg>`)).replace(".card::after{", ".card-block{display:none}.card::after{display:none;"));
}
console.log(`scene.svg ${(markup.length / 1024).toFixed(1)} KB · scene.js ${(live.length / 1024).toFixed(1)} KB · ${DATE}: SoC ${rows[0].soc} → ${Math.max(...rows.map((r) => r.soc))} → ${rows[24].soc}, prices £${Math.min(...DAY.map((d) => d.price))}–£${Math.max(...DAY.map((d) => d.price))}/MWh`);
