// The battery post's card: a grid battery plant seen from a mast above its
// front road. Rows of 20 ft battery containers in blocks of four, a power
// conversion skid (inverter, MV transformer, ring main unit) in each block,
// cable trenches down the aisles and access roads between the blocks, all
// receding into haze and off the frame; the 33 kV substation (switchroom,
// step-up transformer in its bund, sealing-end gantry and metering kiosk) sits
// in its own compound on the front road. Every container's charge lamp, the
// fans and the kiosk's meters run one real day of the post's Double Dueling
// DQN agent (4 December 2018, from the post's own CSV), one hour every 1.25 s:
// the plant is one battery, dispatched as one. One unit is 10 cm.
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
const G = await import(join(SKILL, "kit/lathe.mjs"));
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
// A block is two containers, the PCS skid, two containers; an access road runs
// between blocks. Rows are a container and an aisle deep, the aisle carrying
// the row's cable trench. In rows 0 and 1 one block is left out: the
// substation compound stands in its place on the front road.
const C = { w: 60.6, d: 24.4, h: 25.9, plinth: 3 };                 // 20 ft containers on concrete sleepers
const PCS = { w: 74, d: 22, skid: 3.2 };
const GAP = 12, GAP_PCS = 14, ROAD = 72, PITCH = 84, TRENCH_DY = 19;
const SLOTS = [0, C.w + GAP, "pcs", 2 * C.w + GAP + 2 * GAP_PCS + PCS.w, 3 * C.w + 2 * GAP + 2 * GAP_PCS + PCS.w];
const BLOCK = 4 * C.w + 2 * GAP + 2 * GAP_PCS + PCS.w;
const PERIOD = BLOCK + ROAD;
const PCS_X = 2 * C.w + GAP + GAP_PCS;
const rowY = (r) => -r * PITCH;
const SUB = { x: 6, y: rowY(1) - C.d / 2 - 8, w: BLOCK - 12, d: PITCH + C.d / 2 + 8 + 36 }; // the compound's fence line

// ── Camera: a mast above the front road, looking down the rows ─────────────
// Each part is drawn once in the kit's parallel projection along the camera's
// own axes, then placed where a pinhole camera puts it and scaled by focal /
// distance, so rows shrink and close up into the distance like a photograph's
// while one container drawing serves the whole plant. Ground lines (roads,
// trenches, pads) are projected point by point, so they converge truly.
const AZ = 77, EL = 24, RAD = Math.PI / 180;
const A = AZ * RAD, E = EL * RAD;
const VIEW = [Math.cos(A) * Math.cos(E), Math.sin(A) * Math.cos(E), Math.sin(E)];
const RIGHT = [Math.sin(A), -Math.cos(A), 0];
const DOWN = [Math.cos(A) * Math.sin(E), Math.sin(A) * Math.sin(E), -Math.cos(E)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const FOCAL = 520, NEAR_SCALE = 1.55;
const TARGET = [PERIOD + 150, rowY(0), 0], ON_SCREEN = [1120, 150];
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
const HAZE_STEP = 0.32;
const hazeOf = (p) => Math.max(0, Math.min(5, Math.floor((distOf(p) / NEAR_DIST - 1.12) / HAZE_STEP) + 1));
// detail a part earns at its size on screen
const tierOf = (p) => { const s = scaleAt(p); return s > 1.02 ? "near" : s > 0.7 ? "mid" : "far"; };

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

// Fans: the air conditioners' condensers on the containers, the inverters' roof
// fans and the switchroom's air handler. Each kind's blades and guard are drawn
// once about the origin of a face; a fan in place is its dark throat, the blades
// (a <use> the page turns by its own transform, so no shared drawing changes)
// and the guard over them.
const FANS = { hvac: { r: 5, blades: 3, spin: "hvac" }, pcs: { r: 4.7, blades: 5, spin: "pcs" }, roof: { r: 3.6, blades: 5, spin: "pcs" } };
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
    const roof = [];
    if (near) for (let rx = x + 10; rx < x + C.w - 4; rx += 10) roof.push(path([[rx, -C.d / 2, z1], [rx, C.d / 2, z1]]));
    inner = L(corr.join(""), { tone: near ? "lo" : "faint" }) + L(lines.join("") + posts.join("") + end.join(""), { tone: "lo" }) + (near ? L(roof.join(""), { tone: "faint" }) : "");
  }
  out.push(S(slab(plan, z0, C.h, 2, near ? 0.5 : 0), { tone: "hi", crease: tier === "far" ? "none" : "faint", inner }));
  // roof: an exhaust vent and the four lifting castings
  const vent = [x + C.w - 14, -3];
  if (tier !== "far") out.push(S(k.cylinder(vent[0], vent[1], 2.6, z1, 1.8, P, near ? 18 : 10), { tone: "mid", crease: "none" }));
  if (near) {
    out.push(S(k.cylinder(vent[0], vent[1], 3.4, z1 + 1.8, 0.6, P, 20), { tone: "mid" }));
    out.push(S(slab({ x: x + 22, y: -9, w: 12, d: 7 }, z1, 0.5), { tone: "lo" }));
    out.push(D(k.corners(plan, 1.2).map(([cx, cy]) => [cx, cy, z1]), { size: 0.5, tone: "mid" }));
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

// ── The substation compound, its origin at the fence's back-left corner ──────
// The 33 kV switchroom, the 10 MVA step-up transformer in its bund, the
// sealing-end gantry where the grid cable comes up, and the metering kiosk
// by the gate, whose screen traces the day's price and whose meter swings
// between import and export.
const SW = { x: 14, y: 10, w: 104, d: 30, h: 30 };
const BUND = { x: 132, y: 44, w: 62, d: 48, h: 5, t: 2 };
const TX = { x: BUND.x + 14, y: BUND.y + 11, w: 34, d: 22, base: 3, h: 26 };
const SEAL = { x: BUND.x + BUND.w + 34, y: BUND.y + 22 };
const KIOSK = { x: SUB.w - 66, y: SUB.d - 15, w: 28, d: 15, h: 24 };
const WIN = { x0: KIOSK.x + 3, x1: KIOSK.x + 17, z0: 10, z1: 18 };
const DIAL = { x: KIOSK.x + 22.5, z: 14, r: 3.4 };
const traceAt = (h) => {
  const ps = DAY.map((d) => d.price), lo = Math.min(...ps), hi = Math.max(...ps);
  const i = Math.max(0, Math.min(23, Math.floor(h))), j = Math.min(23, i + 1), f = Math.min(1, Math.max(0, h - i));
  const p = ps[i] + (ps[j] - ps[i]) * f;
  return [WIN.x0 + 1 + ((WIN.x1 - WIN.x0 - 2) * h) / 24, -(WIN.z0 + 1.2 + ((WIN.z1 - WIN.z0 - 2.4) * (p - lo)) / (hi - lo))];
};
function kiosk() {
  const out = [], fy = KIOSK.y + KIOSK.d;
  out.push(shadow(KIOSK.x - 1, KIOSK.x + KIOSK.w, KIOSK.y - 1, fy + 1));
  out.push(S(slab({ x: KIOSK.x - 1, y: KIOSK.y - 1, w: KIOSK.w + 2, d: KIOSK.d + 2 }, 0, 1.5), { tone: "lo" }));
  const doorline = frontRect(fy, KIOSK.x + 1.2, KIOSK.x + KIOSK.w - 1.2, 2.5, KIOSK.h - 1.5);
  out.push(S(slab(KIOSK, 1.5, KIOSK.h - 1.5, 2, 0.4), { tone: "mid", inner: L(doorline, { tone: "lo" }) }));
  out.push(S(slab({ x: KIOSK.x - 1.2, y: KIOSK.y - 1.2, w: KIOSK.w + 2.4, d: KIOSK.d + 2.4 }, KIOSK.h, 1.4, 2, 0.4), { tone: "mid" }));
  // the meter window, recessed: screen, grid, the day's price trace and a cursor
  const trace = Array.from({ length: 97 }, (_, n) => traceAt(n / 4));
  const local = (pts) => "M" + pts.map((q) => q.map(f1).join(" ")).join("L");
  const grid = [6, 12, 18].map((h) => { const gx = traceAt(h)[0]; return `M${f1(gx)} ${f1(-WIN.z1 + 0.6)}V${f1(-WIN.z0 - 0.6)}`; }).join("");
  out.push(onFront(fy, `<rect class="bt-screen" x="${f1(WIN.x0)}" y="${f1(-WIN.z1)}" width="${f1(WIN.x1 - WIN.x0)}" height="${f1(WIN.z1 - WIN.z0)}"/>` +
    `<path class="bt-grid" d="${grid}"/><path class="bt-trace" d="${local(trace)}"/>` +
    `<path class="bt-cursor-line" d="M0 ${f1(-WIN.z1 + 0.6)}V${f1(-WIN.z0 - 0.6)}"/><circle class="bt-cursor-dot" cx="0" cy="0" r="0.55"/>`));
  out.push(L(frontRect(fy, WIN.x0, WIN.x1, WIN.z0, WIN.z1), { tone: "mid" }));
  // the meter: a centre-zero dial, import left, export right
  const ticks = [];
  for (let n = -5; n <= 5; n++) {
    const a = (n / 5) * (50 * Math.PI / 180), len = n % 5 === 0 ? 1.1 : 0.6;
    ticks.push(`M${f1(DIAL.x + Math.sin(a) * (DIAL.r - 0.4))} ${f1(-DIAL.z - Math.cos(a) * (DIAL.r - 0.4))}L${f1(DIAL.x + Math.sin(a) * (DIAL.r - 0.4 - len))} ${f1(-DIAL.z - Math.cos(a) * (DIAL.r - 0.4 - len))}`);
  }
  out.push(onFront(fy, circle(DIAL.x, -DIAL.z, DIAL.r, "bt-dial") + `<path class="bt-tick" d="${ticks.join("")}"/>` +
    `<path class="bt-needle" data-c="${f1(DIAL.x)} ${f1(-DIAL.z + 1.2)}" d="M${f1(DIAL.x)} ${f1(-DIAL.z + 1.2)}V${f1(-DIAL.z - DIAL.r + 0.9)}"/>` +
    circle(DIAL.x, -DIAL.z + 1.2, 0.5, "bt-pivot")));
  out.push(L([0, 1, 2].map((n) => frontRect(fy, KIOSK.x + 4, KIOSK.x + 14, 4 + n * 1.3, 4.5 + n * 1.3)).join(""), { tone: "faint" }));
  out.push(D([[KIOSK.x + KIOSK.w - 3, fy, 7]], { size: 0.5, tone: "mid" }));
  return { key: depth([KIOSK.x + KIOSK.w / 2, KIOSK.y + KIOSK.d / 2, 0]), svg: out.join("") };
}
function switchroom() {
  const out = [], fy = SW.y + SW.d, top = SW.h;
  out.push(shadow(SW.x - 1, SW.x + SW.w, SW.y - 1, fy + 1));
  const doors = [], vents = [];
  for (const dx of [SW.x + 10, SW.x + 52]) doors.push(frontRect(fy, dx, dx + 12, 1.2, 22), frontLine(fy, dx + 6, 1.2, dx + 6, 22));
  for (const vx of [SW.x + 30, SW.x + 72, SW.x + 86]) vents.push(...[0, 1, 2, 3].map((n) => frontRect(fy, vx, vx + 8, 4 + n * 1.4, 4.6 + n * 1.4)));
  const panels = [];
  for (let px = SW.x + 8; px < SW.x + SW.w - 2; px += 8) if (!(px > SW.x + 9 && px < SW.x + 23) && !(px > SW.x + 51 && px < SW.x + 65)) panels.push(frontLine(fy, px, 1.2, px, top - 3));
  const sw = { ...SW, r: 0 };
  out.push(S(slab(sw, 0, top, 2, 0.5), { tone: "hi", inner: L(k.sideSeam(sw, top - 3, P, 2) + k.sideSeam(sw, 1.2, P, 2), { tone: "lo" }) + L(panels.join(""), { tone: "faint" }) + L(doors.join(""), { tone: "lo" }) + L(vents.join(""), { tone: "faint" }) }));
  // parapet capping and the roof's air-handling unit
  out.push(S(slab({ x: SW.x - 0.8, y: SW.y - 0.8, w: SW.w + 1.6, d: SW.d + 1.6 }, top, 1.4, 2, 0.4), { tone: "mid" }));
  out.push(S(slab({ x: SW.x + 70, y: SW.y + 8, w: 22, d: 12 }, top + 1.4, 6, 2, 0.4), { tone: "mid" }));
  out.push(onTop(top + 7.4, fanAt(SW.x + 76, SW.y + 14, "roof") + fanAt(SW.x + 86, SW.y + 14, "roof")));
  // door canopies, handles, a sign plate
  for (const dx of [SW.x + 10, SW.x + 52]) {
    out.push(S(slab({ x: dx - 1.5, y: fy, w: 15, d: 3 }, 23, 0.8, 2, 0.2), { tone: "mid" }));
    out.push(D([[dx + 4.6, fy, 11], [dx + 7.4, fy, 11]], { size: 0.4, tone: "mid" }));
  }
  out.push(L(frontRect(fy, SW.x + 30, SW.x + 40, 16, 21), { tone: "lo" }));
  out.push(L([20, 18.6, 17.2].map((z, j) => frontLine(fy, SW.x + 31.5, z, SW.x + 38.5 - j * 1.6, z)).join(""), { tone: "faint", free: true }));
  return { key: depth([SW.x + SW.w / 2, SW.y + SW.d / 2, 0]), svg: out.join("") };
}
function porcelain(cx, cy, z, sheds, r0, r1) {
  // flange, the porcelain core, then its sheds bottom up
  const out = [S(k.cylinder(cx, cy, r1 + 0.6, z, 0.9, P, 16), { tone: "mid" }), S(k.cylinder(cx, cy, r0, z + 0.9, sheds * 1.5, P, 8), { tone: "hi", crease: "none" })];
  let h = z + 0.9;
  for (let s = 0; s < sheds; s++) {
    out.push(S(k.cylinder(cx, cy, r1, h + 1.1, 0.4, P, 10), { tone: "hi" }));
    h += 1.5;
  }
  out.push(S(k.cylinder(cx, cy, r0 * 0.8, h, 1.2, P, 12), { tone: "mid" }));
  return { svg: out.join(""), top: [cx, cy, h + 1.2] };
}
function transformer() {
  const out = [], z0 = TX.base, z1 = TX.base + TX.h;
  const wall = (plan) => S(slab(plan, 0, BUND.h, 2, 0.3), { tone: "lo" });
  out.push(wall({ x: BUND.x, y: BUND.y, w: BUND.w, d: BUND.t }), wall({ x: BUND.x, y: BUND.y + BUND.t, w: BUND.t, d: BUND.d - BUND.t * 2 }));
  const gravel = [];
  for (let gx = BUND.x + 3; gx < BUND.x + BUND.w - 2; gx += 6) for (let gy = BUND.y + 3; gy < BUND.y + BUND.d - 2; gy += 6) gravel.push([gx + ((gy * 7) % 1.6), gy, 0.4]);
  out.push(D(gravel, { size: 0.3, tone: "faint" }));
  for (const ry of [TX.y + 4, TX.y + TX.d - 7]) out.push(S(slab({ x: TX.x - 2, y: ry, w: TX.w + 4, d: 3 }, 0, z0), { tone: "lo" }));
  const tank = { x: TX.x, y: TX.y, w: TX.w, d: TX.d };
  const stiff = [TX.x + 8, TX.x + TX.w - 8].map((sx) => path([[sx, TX.y + TX.d, z0], [sx, TX.y + TX.d, z1]])).join("");
  out.push(S(slab(tank, z0, TX.h, 2, 0.4), { tone: "mid", inner: L(stiff, { tone: "faint" }) }));
  out.push(S(slab({ x: TX.x - 0.8, y: TX.y - 0.8, w: TX.w + 1.6, d: TX.d + 1.6 }, z1, 1.2, 2, 0.4), { tone: "mid" }));
  out.push(D(Array.from({ length: 9 }, (_, n) => [TX.x + 1.5 + n * 3.9, TX.y + TX.d + 0.3, z1 + 1.2]), { size: 0.35, tone: "lo" }));
  // the LV cable box on the end wall toward the switchroom
  out.push(S(slab({ x: TX.x - 4, y: TX.y + 4, w: 4, d: 14 }, z0 + 4, 16, 2, 0.4), { tone: "mid" }));
  // conservator on its brackets, with a sight glass on the end
  const zt = z1 + 1.2;
  for (const bx of [TX.x + 6, TX.x + 20]) out.push(S(slab({ x: bx, y: TX.y + 3, w: 1.4, d: 3 }, zt, 4.2), { tone: "lo" }));
  const consF = G.frameAlong([TX.x + 3, TX.y + 4.5, zt + 8], [1, 0, 0]);
  out.push(S(G.disc(0, 22, 4.2, consF, P), { tone: "mid" }));
  out.push(L(G.arcOf(consF, 11, 4.2, P), { tone: "faint" }));
  out.push(L(G.circleOf(consF, 22, 1.6, P), { tone: "lo" }));
  out.push(S(k.cylinder(TX.x + 13, TX.y + 4.5, 0.8, zt, 3.6, P, 10), { tone: "mid" }));
  // radiator banks: plates on edge, seen end on
  for (const bx of [TX.x + 2, TX.x + 18]) {
    const bank = { x: bx, y: TX.y + TX.d, w: 14, d: 7, r: 0 };
    const plates = [], tops = [];
    for (let px = bx + 0.9; px < bx + 14 - 0.5; px += 1.6) {
      plates.push(path([[px, bank.y + 7, z0 + 4.2], [px, bank.y + 7, z1 - 3.2]]));
      tops.push(path([[px, bank.y, z1 - 2], [px, bank.y + 7, z1 - 2]]));
    }
    const headers = k.sideSeam(bank, z0 + 4.2, P, 2) + k.sideSeam(bank, z1 - 3.2, P, 2);
    out.push(S(slab(bank, z0 + 3, TX.h - 5), { tone: "mid", inner: L(plates.join(""), { tone: "lo" }) + L(headers, { tone: "lo" }) }));
    out.push(L(tops.join(""), { tone: "lo" }));
  }
  out.push(S(k.cylinder(TX.x + 31, TX.y + TX.d + 0.8, 0.9, z0 + 1, 1.6, P, 12), { tone: "mid" }));
  const hv = [TX.x + 10, TX.x + 18, TX.x + 26].map((bx) => porcelain(bx, TX.y + 15, zt, 4, 0.9, 1.9));
  hv.forEach((b) => out.push(b.svg));
  out.push(wall({ x: BUND.x + BUND.w - BUND.t, y: BUND.y + BUND.t, w: BUND.t, d: BUND.d - BUND.t * 2 }), wall({ x: BUND.x, y: BUND.y + BUND.d - BUND.t, w: BUND.w, d: BUND.t }));
  return { key: depth([TX.x + TX.w / 2, TX.y + TX.d / 2, 0]), svg: out.join(""), hv };
}
// the gantry stands beside the bund, its three sealing ends in a row across y
function sealingEnds(hv) {
  const out = [], beam = 30, ys = [SEAL.y - 7, SEAL.y, SEAL.y + 7];
  const posts = [SEAL.y - 11, SEAL.y + 11].map((py) => S(slab({ x: SEAL.x - 1, y: py - 1, w: 2, d: 2 }, 0, beam), { tone: "mid" }));
  out.push(posts[0]);
  out.push(S(slab({ x: SEAL.x - 1.4, y: SEAL.y - 13, w: 2.8, d: 26 }, beam, 2, 2, 0.3), { tone: "mid" }));
  const ends = ys.map((py) => porcelain(SEAL.x, py, beam + 2, 3, 0.8, 1.7));
  ends.forEach((e) => out.push(e.svg));
  out.push(posts[1]);
  // the grid cables come up the near post in their guard
  out.push(S(slab({ x: SEAL.x + 1, y: SEAL.y + 9, w: 2, d: 3 }, 0, beam, 2), { tone: "lo" }));
  const jumpers = ends.map((e, n) => {
    const a = e.top, b = hv[n].top, pts = [];
    for (let s = 0; s <= 16; s++) { const t = s / 16; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * Math.sin(Math.PI * t)]); }
    return path(pts);
  });
  return {
    key: depth([SEAL.x, SEAL.y, 0]),
    svg: out.join(""),
    jumpers: L(jumpers.join(""), { tone: "mid" }) + D([...ends.map((e) => e.top), ...hv.map((b) => b.top)], { size: 0.5, tone: "hi" }),
  };
}
// palisade fence round the compound: pales on every side, a double gate beside the kiosk
function compoundFence(side) {
  const out = [], top = 24, x0 = 0, x1 = SUB.w, y0 = 0, y1 = SUB.d;
  const rails = (pts) => L(path(pts.map(([x, y]) => [x, y, top - 2])) + path(pts.map(([x, y]) => [x, y, 3])), { tone: "lo" });
  if (side === "back") {
    out.push(rails([[x0, y1], [x0, y0], [x1, y0], [x1, y1]]));
    const pales = [];
    for (let x = x0 + 5; x < x1; x += 5) pales.push(path([[x, y0, 3], [x, y0, top - 2]]));
    for (let y = y0 + 5; y < y1; y += 5) pales.push(path([[x0, y, 3], [x0, y, top - 2]]), path([[x1, y, 3], [x1, y, top - 2]]));
    out.push(L(pales.join(""), { tone: "faint" }));
    return out.join("");
  }
  const gate = [KIOSK.x - 50, KIOSK.x - 14];
  const pales = [];
  // the kiosk is set into the fence line, its door to the road; the rails stop at its sides
  for (let x = x0 + 4; x < x1; x += 4) if ((x < gate[0] - 1 || x > gate[1] + 1) && (x < KIOSK.x - 2 || x > KIOSK.x + KIOSK.w + 2)) pales.push(path([[x, y1, 3], [x, y1, top - 2]]));
  out.push(L(pales.join(""), { tone: "faint" }));
  const runs = [[x0, gate[0]], [gate[1], KIOSK.x + 1], [KIOSK.x + KIOSK.w - 1, x1]]; // tucked under the kiosk, drawn after the fence
  out.push(L(runs.map(([a, b]) => path([[a, y1, top - 2], [b, y1, top - 2]]) + path([[a, y1, 3], [b, y1, 3]])).join(""), { tone: "lo" }));
  const gm = (gate[0] + gate[1]) / 2;
  out.push(L(frontRect(y1, gate[0] + 1, gm - 0.5, 1.5, top - 3) + frontRect(y1, gm + 0.5, gate[1] - 1, 1.5, top - 3) + path([[gate[0] + 1, y1, 1.5], [gm - 0.5, y1, top - 3]]) + path([[gm + 0.5, y1, top - 3], [gate[1] - 1, y1, 1.5]]), { tone: "lo" }));
  for (const px of [x0, gate[0], gate[1], x1]) out.push(S(slab({ x: px - 0.8, y: y1 - 0.8, w: 1.6, d: 1.6 }, 0, top + 1), { tone: "mid", crease: "none" }));
  return out.join("");
}
function substation() {
  const tx = transformer(), se = sealingEnds(tx.hv);
  const items = [switchroom(), tx, se].sort((a, b) => a.key - b.key);
  // an LV cable trench from the switchroom to the transformer
  const trench = S(slab({ x: SW.x + SW.w, y: TX.y + 8, w: TX.x - SW.x - SW.w - 4, d: 5 }, -0.4, 0.4), { tone: "lo", crease: "faint", flat: true });
  return compoundFence("back") + trench + items.map((it) => it.svg).join("") + se.jumpers + compoundFence("front") + kiosk().svg;
}

// ── Ground: projected point by point, so it converges ───────────────────────
const sp = (pts, closed = false) => k.pathOf(pts.map(screen), closed);
const rowsOf = [];
for (let r = 0; r < 14; r++) {
  const y = rowY(r), blocks = [];
  for (let b = -8; b <= 3; b++) if (!(r <= 1 && b === 0)) blocks.push(b);
  rowsOf.push({ r, y, blocks });
}
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
// crops the line there, it does not stop. `fade` fades the far end into the haze.
function groundLine(a0, b0, tone, fade = 0) {
  const ends = clipNear(a0, b0);
  if (!ends || !spans(a0, b0)) return "";
  const [p, q] = ends.map(screen);
  const free = new Set([offFrame(p) && "start", (offFrame(q) || fade) && "end"].filter(Boolean));
  const flag = free.size === 2 ? "both" : [...free][0];
  if (!fade) return L(k.pathOf([p, q]), { tone, free: flag });
  return k.fadeLineSvg([p, q], { tone, fade: [0, Math.hypot(q[0] - p[0], q[1] - p[1]) * fade] }).replace(/data-free="\w+"/, `data-free="${flag}"`);
}
function ground() {
  const out = [], hazeLines = new Map();
  const add = (level, tone, d) => { const key = `${level}|${tone}`; hazeLines.set(key, (hazeLines.get(key) || "") + d); };
  for (const { y, blocks } of rowsOf) {
    for (const b of blocks) {
      const x0 = b * PERIOD, x1 = x0 + BLOCK;
      const mid = [x0 + BLOCK / 2, y, 0];
      if (!spans([x0, y, 0], [x1, y, 0]) || Math.min(distOf([x1 + 4, y + TRENCH_DY + 9, 0]), distOf([x0 - 4, y + TRENCH_DY + 9, 0])) < MIN_DIST) continue;
      const h = hazeOf(mid);
      // the row's gravel bed
      out.push(`<path class="bt-bed bt-h${h}" d="${sp([[x0 - 4, y - C.d / 2 - 6, 0], [x1 + 4, y - C.d / 2 - 6, 0], [x1 + 4, y + TRENCH_DY + 9, 0], [x0 - 4, y + TRENCH_DY + 9, 0]], true)}"/>`);
      // the trench down the aisle, kerb to kerb across the block, and its cover joints
      const t0 = y + TRENCH_DY, t1 = t0 + 6;
      out.push(`<g class="bt-h${h}">${groundLine([x0 - 10, t0, 0], [x1 + 10, t0, 0], "lo")}${groundLine([x0 - 10, t1, 0], [x1 + 10, t1, 0], "lo")}</g>`);
      if (scaleAt(mid) > 0.8) {
        const joints = [];
        for (let jx = x0 + 9; jx < x1 - 2; jx += 9) joints.push(sp([[jx, t0, 0], [jx, t1, 0]]));
        add(h, "faint", joints.join(""));
      }
    }
  }
  // the access roads between blocks from the front road back, each with a trench
  // down its side that gathers the rows' cables
  for (let b = -8; b <= 3; b++) {
    const rx0 = b * PERIOD + BLOCK + 10, rx1 = rx0 + ROAD - 20;
    const front = TRENCH_DY + 22, back = rowY(13);
    for (const [x, tone] of [[rx0, "lo"], [rx1, "lo"], [rx1 + 2, "faint"], [rx1 + 6, "faint"]]) out.push(groundLine([x, front, 0], [x, back, 0], tone, 0.75));
  }
  // the perimeter road in front of the plant
  for (const yy of [TRENCH_DY + 22, TRENCH_DY + 82]) out.push(groundLine([-8 * PERIOD, yy, 0], [4 * PERIOD, yy, 0], "lo"));
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
// lamp's segments over every container, the fans over the near ones.
const placedParts = [];
for (const { y, blocks } of rowsOf) for (const b of blocks) for (const slot of SLOTS) {
  const isPcs = slot === "pcs";
  const anchor = [b * PERIOD + (isPcs ? PCS_X + PCS.w / 2 : slot + C.w / 2), y, 0];
  const [sx, sy] = screen(anchor), s = scaleAt(anchor);
  if (s < 0.3 || sx + 50 * s < VEIL || sx > WIDTH + 80 * s || sy < -10 || sy > HEIGHT + 60 * s) continue;
  const tier = tierOf(anchor), haze = `bt-h${hazeOf(anchor)}`, at = placed(anchor);
  let svg = `<use href="#bt-${isPcs ? "p" : "c"}-${tier}" class="${haze}" transform="${at}"/>`;
  if (!isPcs) svg += `<use href="#bt-l-${tier}" class="bt-lamp ${haze}" data-steps="${{ near: 50, mid: 30, far: 10 }[tier]}" transform="${at}"/>`;
  if (tier === "near") {
    const fans = isPcs ? onTop(PCS_FANS.z, PCS_FANS.xs.map((fx) => fanAt(fx, 0, "pcs", false)).join("")) : onFront(HVAC_FAN.y, fanAt(HVAC_FAN.cx, HVAC_FAN.cy, "hvac", false));
    svg += `<g transform="${at}">${fans}</g>`;
  }
  placedParts.push({ d: distOf(anchor), svg });
}
const SUB_ANCHOR = [SUB.x + SUB.w / 2, SUB.y + SUB.d / 2, 0];
const subOrigin = [SUB.x - SUB_ANCHOR[0], SUB.y - SUB_ANCHOR[1], 0];
const subSvg = substation();
// the compound is drawn about its own corner; shift it so its centre is the anchor
const subShift = at(subOrigin);
placedParts.push({ d: distOf([SUB.x + SUB.w, rowY(0), 0]) - 1, svg: `<g class="bt-h0" transform="${placed(SUB_ANCHOR)}"><g transform="translate(${f1(subShift[0])} ${f1(subShift[1])})">${subSvg}</g></g>` });
placedParts.sort((a, b) => b.d - a.d);
const parts = { defs: `<defs>${defs}</defs>`, ground: ground(), plant: placedParts.map((p) => p.svg).join("") };
const body = parts.defs + parts.ground + `<g class="bt-weight">${parts.plant}</g>`;
if (process.argv.includes("--sizes")) {
  console.log(Object.entries(parts).map(([n, v]) => `${n} ${(v.length / 1024).toFixed(1)}`).join(" · "));
  for (const r of [0, 2]) console.log(`row ${r}: ` + [-1, 0, 1, 2].map((b) => {
    const a = screen([b * PERIOD, rowY(r), 0]), z = screen([b * PERIOD + BLOCK, rowY(r), 0]);
    return `block ${b} x ${Math.round(a[0])}..${Math.round(z[0])} y ${Math.round(z[1])} @${scaleAt([b * PERIOD, rowY(r), 0]).toFixed(2)}`;
  }).join(" · "));
  console.log(`substation front x ${screen([SUB.x, SUB.y + SUB.d, 0]).map(Math.round)} .. ${screen([SUB.x + SUB.w, SUB.y + SUB.d, 0]).map(Math.round)}`);
  const tx = transformer(), se = sealingEnds(tx.hv);
  console.log(Object.entries({ switchroom: switchroom().svg, transformer: tx.svg, gantry: se.svg + se.jumpers, kiosk: kiosk().svg, fence: compoundFence("back") + compoundFence("front") }).map(([n, v]) => `${n} ${(v.length / 1024).toFixed(1)}`).join(" · "));
  console.log(TIERS.map((t) => `container ${t} ${(container(t).length / 1024).toFixed(1)} · pcs ${t} ${(pcs(t).length / 1024).toFixed(1)}`).join(" · "), `· substation ${(subSvg.length / 1024).toFixed(1)} · ${placedParts.length} placed`);
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
const SITE = { lit: "#eef5fa", dot: "#9fb2c2", lamp: "#eef5fa", "lamp-off": "#10283a", screen: "#050d14" };
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
  const lamp = [`--bt-lamp:${mix(SITE.lamp, HAZE, t * 0.55)}`, `--bt-lamp-off:${mix(SITE["lamp-off"], HAZE, t)}`, `--bt-bed:${mix("#071520", HAZE, t)}`];
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
.bt-screen{fill:var(--bt-screen);stroke:none}
.bt-grid{fill:none;stroke:var(--anatomy-faint);stroke-width:.4px}
.bt-trace{fill:none;stroke:var(--anatomy-hi);stroke-width:.5px;stroke-linejoin:round;stroke-linecap:round}
.bt-cursor-line{fill:none;stroke:var(--anatomy-lo);stroke-width:.4px}
.bt-cursor-dot{fill:var(--anatomy-hi);stroke:none}
.bt-dial{fill:var(--anatomy-top);stroke:var(--anatomy-mid);stroke-width:.5px}
.bt-tick{fill:none;stroke:var(--anatomy-mid);stroke-width:.4px}
.bt-needle{fill:none;stroke:var(--anatomy-hi);stroke-width:.6px;stroke-linecap:round}
.bt-pivot{fill:var(--anatomy-mid);stroke:none}
${LADDER.join("\n")}`;
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots|face-text)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const siteVars = Object.entries(SITE).map(([n, v]) => (n === "lit" || n === "dot" ? `--anatomy-${n}:${v}` : `--bt-${n}:${v}`)).join(";");
const css = `${SCOPE}{${NAVY};${siteVars};--bt-bed:#071520;--anatomy-weight:.6px}` + KIT.map(scope).join("") + KIT.map((rule) => rule.replace(/\.iso-/g, ".bt-iso-")).join("") + SCENE_CSS.replace(/\n/g, "");
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${body}</svg>`;

// ── Live: one day of trading, on a loop ──────────────────────────────────────
// Every lamp in the plant shows the one state of charge, the fans turn with the
// power, and the kiosk's meters show the price and the flow at its terminals.
const live = `
${readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "")}
const DAY = ${JSON.stringify(DAY)};
const TRACE = ${JSON.stringify({ x0: WIN.x0 + 1, w: WIN.x1 - WIN.x0 - 2, z0: WIN.z0 + 1.2, h: WIN.z1 - WIN.z0 - 2.4 })};
const PRICES = DAY.map((d) => d.price), LO = Math.min(...PRICES), HI = Math.max(...PRICES);
const SPH = ${SECONDS_PER_HOUR}, STILL_HOUR = ${STILL_HOUR};
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
// each lamp is restyled only when its own size can show the change: 50 steps of
// charge up close, 10 far off, so the far rows cost little while the plant moves
const lamps = [...svg.querySelectorAll(".bt-lamp")].map((el) => ({ el, steps: +el.dataset.steps, shown: -1 }));
const fans = [...svg.querySelectorAll("[data-fan]")].map((el) => ({ el, kind: el.dataset.fan, ph: +el.dataset.ph }));
const needle = svg.querySelector(".bt-needle"), cursorLine = svg.querySelector(".bt-cursor-line"), cursorDot = svg.querySelector(".bt-cursor-dot");
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
  needle.setAttribute("transform", "rotate(" + ((power / ${BATTERY.mw}) * 50).toFixed(1) + " " + needle.dataset.c + ")");
  const h = s.t, i = Math.min(23, Math.floor(h)), j = Math.min(23, i + 1), f = h - Math.floor(h);
  const p = PRICES[i] + (PRICES[j] - PRICES[i]) * f;
  const cx = (TRACE.x0 + TRACE.w * h / 24).toFixed(2);
  cursorLine.setAttribute("transform", "translate(" + cx + " 0)");
  cursorDot.setAttribute("transform", "translate(" + cx + " " + (-(TRACE.z0 + TRACE.h * (p - LO) / (HI - LO))).toFixed(2) + ")");
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
  const row = Object.entries(DRAWINGS).map(([, svg], n) => `<g transform="translate(${70 + n * 150} 120) scale(1.1)">${svg}</g>`).join("") +
    `<g transform="translate(980 90) scale(0.55)"><g transform="translate(${f1(-at([SUB.w / 2, SUB.d / 2, 0])[0])} ${f1(-at([SUB.w / 2, SUB.d / 2, 0])[1])})">${subSvg}</g></g>`;
  writeFileSync(join(dir, "parts.html"), preview(STILL_HOUR, markup.replace(/<defs>.*<\/svg>$/, `<g class="bt-weight">${row}</g></svg>`)).replace(".card::after{", ".card-block{display:none}.card::after{display:none;"));
}
console.log(`scene.svg ${(markup.length / 1024).toFixed(1)} KB · scene.js ${(live.length / 1024).toFixed(1)} KB · ${DATE}: SoC ${rows[0].soc} → ${Math.max(...rows.map((r) => r.soc))} → ${rows[24].soc}, prices £${Math.min(...DAY.map((d) => d.price))}–£${Math.max(...DAY.map((d) => d.price))}/MWh`);
