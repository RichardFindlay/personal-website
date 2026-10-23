// The battery post's card: a 10 MW / 20 MWh grid battery site on a concrete
// pad. Four 5 MWh containers in a row, a skid of two 5 MW inverters, a
// metering kiosk and a 33 kV step-up transformer with its cable sealing ends.
// The containers' charge lamps, the inverters' fans and the kiosk's meters run
// one real day of the post's Double Dueling DQN agent (4 December 2018, from
// the post's own CSV), one hour every 1.25 s. One unit is 10 cm.
// Run: node figures/battery/build.mjs   writes staticfiles/image/thumbnails/battery/
//      scene.svg and scene.js, and figures/battery/preview.html
//      --stills <dir>   also the card held at four hours of the day
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

// ── Camera: the long side of the row faces the viewer ───────────────────────
const AZ = 80, EL = 30, KPX = 1.9;
const P0 = { origin: [0, 0], scale: KPX / Math.sqrt(1.6), azimuth: AZ, elevation: EL };

// ── Site plan (x along the row, y toward the viewer, z up) ───────────────────
const C = { w: 60.6, d: 24.4, h: 25.9, plinth: 3, gap: 16 };        // 20 ft containers on concrete sleepers
const CONTAINERS = [0, 1, 2, 3].map((i) => ({ i, x: i * (C.w + C.gap) }));
const FRONT = C.d / 2;
const ROW_END = CONTAINERS[3].x + C.w;
const PCS = { x: -102, w: 78, y: -11, d: 22, skid: 3.2, cab: { w: 31, d: 18, h: 22 } };
const KIOSK = { x: -142, y: -7, w: 28, d: 15, h: 24 };
const TX = { x: -192, y: -11, w: 34, d: 22, base: 3, h: 26 };       // 10 MVA, 33/0.69 kV
const BUND = { x: -206, y: -22, w: 62, d: 48, h: 5, t: 2 };
const SEAL = { x: -220 };                                            // cable sealing end frame
const PAD = { x: -236, y: -30, w: ROW_END + 22 + 236, d: 76, r: 0 };
const TRENCH = { x: -146, y: 15.5, w: ROW_END - 2 + 146, d: 6, r: 0 };
const FENCE_Y = -36;

const anchor = k.iso([ROW_END, FRONT, C.plinth], P0);
const P = { ...P0, origin: [1376 - anchor[0], 166 - anchor[1]] };
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
const f1 = (v) => (Math.round(v * 100) / 100).toString();
const circle = (cx, cy, r, cls, extra = "") => `<circle class="${cls}" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}"${extra}/>`;

// A fan: dark throat, blades that turn, a guard over them. Local face coords.
function fan(cx, cy, r, blades, kind) {
  const blade = (a) => {
    const p = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [a0, a1] = [a - 0.42, a + 0.38];
    const pts = [p(a0, r * 0.28), p(a0 - 0.1, r * 0.92), p(a + 0.05, r * 0.97), p(a1, r * 0.9), p(a1 + 0.08, r * 0.3)];
    return "M" + pts.map((q) => q.map(f1).join(" ")).join("L") + "Z";
  };
  const set = Array.from({ length: blades }, (_, i) => blade((i / blades) * Math.PI * 2)).join("");
  return circle(cx, cy, r, "bt-throat") +
    `<g data-fan="${kind}" data-c="${f1(cx)} ${f1(cy)}"><path class="bt-blade" d="${set}"/>${circle(cx, cy, r * 0.24, "bt-hub")}</g>` +
    circle(cx, cy, r * 0.62, "bt-guard") + circle(cx, cy, r, "bt-guard bt-rim") +
    `<path class="bt-guard" d="M${f1(cx - r)} ${f1(cy)}H${f1(cx + r)}M${f1(cx)} ${f1(cy - r)}V${f1(cy + r)}"/>`;
}

// ── Ground: the pad, its joints, the cable trench, a ploughed field ──────────
function ground() {
  const out = [];
  // the field in front of and beside the site: furrows that run off to the left
  for (let y = PAD.y + PAD.d + 10; y < 200; y += 14) {
    const pts = [[PAD.x - 900, y, 0], [PAD.x + PAD.w + 40, y, 0]].map(at);
    out.push(k.fadeLineSvg(pts, { tone: "faint", fade: [700, 260] }));
  }
  out.push(S(slab(PAD, -2, 2), { tone: "lo", crease: "faint" }));
  // expansion joints across the pad, edge to edge
  const joints = [];
  for (let x = PAD.x + 40; x < PAD.x + PAD.w - 10; x += 52) joints.push(path([[x, PAD.y, 0], [x, PAD.y + PAD.d, 0]]));
  out.push(L(joints.join(""), { tone: "faint" }));
  // the trench and its cover slabs
  out.push(S(slab(TRENCH, -0.6, 0.6), { tone: "lo", crease: "faint", flat: true }));
  const covers = [];
  for (let x = TRENCH.x + 9; x < TRENCH.x + TRENCH.w - 2; x += 9) covers.push(path([[x, TRENCH.y, 0], [x, TRENCH.y + TRENCH.d, 0]]));
  out.push(L(covers.join(""), { tone: "lo" }));
  // contact shadows under the row
  const shadow = (x0, x1, y0, y1) => `<path class="bt-shadow" d="${path([[x0, y0, 0], [x1 + 3, y0, 0], [x1 + 3, y1 + 1.5, 0], [x0, y1 + 1.5, 0]], true)}"/>`;
  CONTAINERS.forEach(({ x }) => out.push(shadow(x - 1, x + C.w, -C.d / 2 - 1, FRONT + 1)));
  out.push(shadow(PCS.x, PCS.x + PCS.w, PCS.y, PCS.y + PCS.d), shadow(KIOSK.x, KIOSK.x + KIOSK.w, KIOSK.y, KIOSK.y + KIOSK.d));
  return out.join("");
}

// ── The back fence: posts, two rails, mesh between them ──────────────────────
function fence() {
  const x0 = PAD.x - 420, x1 = x0 + 12 + 30 * Math.floor((PAD.x + PAD.w - x0) / 30), top = 23, bottom = 1, out = [];
  const mesh = [];
  for (let x = x0; x <= x1; x += 4) mesh.push(path([[x, FENCE_Y, bottom], [x, FENCE_Y, top]]));
  out.push(L(mesh.join(""), { tone: "faint" }));
  out.push(k.fadeLineSvg([[x0, FENCE_Y, top], [x1, FENCE_Y, top]].map(at), { tone: "lo", fade: [220, 0] }));
  out.push(k.fadeLineSvg([[x0, FENCE_Y, bottom], [x1, FENCE_Y, bottom]].map(at), { tone: "lo", fade: [220, 0] }));
  for (let x = x0 + 12; x <= x1; x += 30) out.push(S(slab({ x: x - 0.6, y: FENCE_Y - 0.6, w: 1.2, d: 1.2 }, 0, 25.5), { tone: "lo", crease: "none" }));
  return out.join("");
}

// ── A battery container ──────────────────────────────────────────────────────
function container({ i, x }) {
  const z0 = C.plinth, z1 = C.plinth + C.h, y = FRONT, out = [];
  const plan = { x, y: -C.d / 2, w: C.w, d: C.d, r: 0.3 };
  // three concrete sleepers under it
  for (const sx of [x + 3, x + C.w / 2 - 3.5, x + C.w - 10]) out.push(S(slab({ x: sx, y: -C.d / 2 - 1, w: 7, d: C.d + 2 }, 0, z0), { tone: "lo" }));
  // the box: rails, corner posts and corrugation are under its outline
  const door = { x0: x + 8.5, x1: x + 25.5, z0: z0 + 1.4, z1: z0 + 22.6 };
  const lamp = { x0: x + 29, x1: x + 33.2, z0: z0 + 4, z1: z0 + 21 };
  const hvac = { x0: x + 43, x1: x + 56, z0: z0 + 3, z1: z0 + 21 };
  const rail = [z0 + 1.4, z1 - 1.4];
  const lines = [k.sideSeam(plan, rail[0], P, 2), k.sideSeam(plan, rail[1], P, 2)];
  const corr = [];
  for (let cx = x + 3; cx < x + C.w - 2; cx += 2.8) {
    const inDoor = cx > door.x0 - 0.4 && cx < door.x1 + 0.4;
    const inLamp = cx > lamp.x0 - 0.4 && cx < lamp.x1 + 0.4;
    const inHvac = cx > hvac.x0 && cx < hvac.x1;
    if (inDoor) corr.push(frontLine(y, cx, door.z1, cx, rail[1]));
    else if (inLamp) { corr.push(frontLine(y, cx, rail[0], cx, lamp.z0), frontLine(y, cx, lamp.z1, cx, rail[1])); }
    else if (inHvac) { corr.push(frontLine(y, cx, rail[0], cx, hvac.z0), frontLine(y, cx, hvac.z1, cx, rail[1])); }
    else corr.push(frontLine(y, cx, rail[0], cx, rail[1]));
  }
  const posts = [frontLine(y, x + 1.6, z0, x + 1.6, z1), frontLine(y, x + C.w - 1.6, z0, x + C.w - 1.6, z1)];
  // the end wall: its corner post and a gland plate
  const end = [path([[x + C.w, y - 1.6, z0], [x + C.w, y - 1.6, z1]]), path([[x + C.w, -y + 1.6, z0], [x + C.w, -y + 1.6, z1]])];
  // roof panel joints, edge to edge
  const roof = [];
  for (let rx = x + 10; rx < x + C.w - 4; rx += 10) roof.push(path([[rx, -C.d / 2, z1], [rx, C.d / 2, z1]]));
  out.push(S(slab(plan, z0, C.h, 2, 0.5), {
    tone: "hi",
    inner: L(corr.join(""), { tone: "lo" }) + L(lines.join("") + posts.join("") + end.join(""), { tone: "lo" }) + L(roof.join(""), { tone: "faint" }),
  }));
  // roof: an exhaust vent and the four lifting castings
  const vent = [x + C.w - 14, -3];
  out.push(S(k.cylinder(vent[0], vent[1], 2.2, z1, 1.6, P, 18), { tone: "mid" }));
  out.push(S(k.cylinder(vent[0], vent[1], 3, z1 + 1.6, 0.6, P, 20), { tone: "mid" }));
  out.push(S(slab({ x: x + 22, y: -9, w: 12, d: 7 }, z1, 0.5), { tone: "lo" }));
  out.push(D(k.corners(plan, 1.2).map(([cx, cy]) => [cx, cy, z1]), { size: 0.5, tone: "mid" }));
  // the double door: frame, meeting stile, hinges, lock bars with keepers and handles
  const leaf = (door.x1 - door.x0) / 2, mid = door.x0 + leaf;
  out.push(L(frontRect(y, door.x0, door.x1, door.z0, door.z1) + frontLine(y, mid, door.z0, mid, door.z1), { tone: "lo" }));
  out.push(L(frontRect(y, door.x0 + 1, mid - 1, door.z0 + 1, door.z1 - 1) + frontRect(y, mid + 1, door.x1 - 1, door.z0 + 1, door.z1 - 1), { tone: "faint" }));
  const hinge = [];
  for (const hz of [door.z0 + 3, (door.z0 + door.z1) / 2, door.z1 - 3]) for (const hx of [door.x0, door.x1]) hinge.push(frontRect(y + 0.2, hx - 0.6, hx + 0.6, hz - 1, hz + 1));
  out.push(L(hinge.join(""), { tone: "mid" }));
  const bars = [], keep = [], handles = [], knobs = [];
  for (const bx of [mid - 2.2, mid + 2.2]) {
    bars.push(frontLine(y + 0.4, bx, door.z0 + 1.6, bx, door.z1 - 1.6));
    keep.push(frontRect(y + 0.4, bx - 0.7, bx + 0.7, door.z0 + 0.8, door.z0 + 1.6), frontRect(y + 0.4, bx - 0.7, bx + 0.7, door.z1 - 1.6, door.z1 - 0.8));
    const side = bx < mid ? -1 : 1;
    handles.push(frontLine(y + 0.4, bx, door.z0 + 9, bx + side * 2.6, door.z0 + 9));
    knobs.push([bx + side * 2.6, y + 0.4, door.z0 + 9]);
  }
  out.push(L(bars.join(""), { tone: "mid" }), L(keep.join(""), { tone: "lo" }), L(handles.join(""), { tone: "mid" }), D(knobs, { size: 0.45, tone: "mid" }));
  // the state-of-charge lamp: ten segments in a small housing beside the door
  out.push(S(slab({ x: lamp.x0, y, w: lamp.x1 - lamp.x0, d: 1.2 }, lamp.z0, lamp.z1 - lamp.z0, 2, 0.3), { tone: "mid" }));
  const ly = y + 1.2, segs = [];
  const segH = (lamp.z1 - lamp.z0 - 1.6) / 10;
  for (let s = 0; s < 10; s++) {
    const a = lamp.z0 + 0.8 + s * segH, b = a + segH * 0.72;
    const d = frontRect(ly, lamp.x0 + 0.7, lamp.x1 - 0.7, a, b);
    segs.push(`<path class="bt-seg-off" d="${d}"/><path class="bt-seg" data-seg="${s}" d="${d}"/>`);
  }
  out.push(`<g data-lamp="${i}">${segs.join("")}</g>`);
  // a rating plate
  const plate = { x0: x + 35.5, x1: x + 41, z0: z0 + 15, z1: z0 + 19 };
  out.push(L(frontRect(y, plate.x0, plate.x1, plate.z0, plate.z1), { tone: "lo" }));
  out.push(L([plate.z1 - 1, plate.z1 - 2, plate.z1 - 3].map((rz, j) => frontLine(y, plate.x0 + 0.8, rz, plate.x1 - 0.8 - j * 1.1, rz)).join(""), { tone: "faint", free: true }));
  // the wall-hung air conditioner: louvres below, a condenser fan behind a guard
  const hy = y + 5;
  out.push(S(slab({ x: hvac.x0, y, w: hvac.x1 - hvac.x0, d: 5 }, hvac.z0, hvac.z1 - hvac.z0, 2, 0.4), { tone: "mid", inner: L(k.sideSeam({ x: hvac.x0, y, w: hvac.x1 - hvac.x0, d: 5, r: 0 }, hvac.z1 - 1.2, P, 2), { tone: "faint" }) }));
  const louvres = [];
  for (let lz = hvac.z0 + 1.4; lz < hvac.z0 + 5; lz += 1.2) louvres.push(frontRect(hy, hvac.x0 + 1.2, hvac.x1 - 1.2, lz, lz + 0.5));
  out.push(L(louvres.join(""), { tone: "lo" }));
  const fc = [(hvac.x0 + hvac.x1) / 2, -(hvac.z0 + 11.4)];
  out.push(onFront(hy, fan(fc[0], fc[1], 5, 3, "hvac")));
  out.push(D([[hvac.x0 + 1, hy, hvac.z1 - 2.2], [hvac.x1 - 1, hy, hvac.z1 - 2.2]], { size: 0.4, tone: "mid" }));
  // DC cables leave through a trunking box down into the trench
  out.push(S(slab({ x: x + 2.4, y, w: 4.4, d: TRENCH.y - y }, 0, z0 + 4, 2, 0.3), { tone: "mid" }));
  return { key: depth([x + C.w / 2, 0, 0]), svg: out.join("") };
}

// ── The inverter skid ────────────────────────────────────────────────────────
function inverters() {
  const out = [];
  for (const sx of [PCS.x + 4, PCS.x + PCS.w / 2 - 3, PCS.x + PCS.w - 10]) out.push(S(slab({ x: sx, y: PCS.y - 1, w: 6, d: PCS.d + 2 }, 0, 1.4), { tone: "lo" }));
  const skid = { x: PCS.x, y: PCS.y, w: PCS.w, d: PCS.d };
  out.push(S(slab(skid, 1.4, PCS.skid - 1.4 + 1.4), { tone: "mid", inner: L(k.sideSeam({ ...skid, r: 0 }, 2.4, P, 2), { tone: "lo" }) }));
  const zc = 1.4 + PCS.skid;
  [PCS.x + 5, PCS.x + PCS.w - 5 - PCS.cab.w].forEach((cx) => {
    const cab = { x: cx, y: -PCS.cab.d / 2, w: PCS.cab.w, d: PCS.cab.d };
    const fy = PCS.cab.d / 2, top = zc + PCS.cab.h;
    const doors = [], grille = [];
    const m = cx + PCS.cab.w / 2;
    doors.push(frontRect(fy, cx + 1.2, m - 0.4, zc + 1, top - 1.2), frontRect(fy, m + 0.4, cx + PCS.cab.w - 1.2, zc + 1, top - 1.2));
    for (let gz = zc + 2.4; gz < zc + 7; gz += 1.1) {
      grille.push(frontRect(fy, cx + 3, m - 2, gz, gz + 0.45), frontRect(fy, m + 2, cx + PCS.cab.w - 3, gz, gz + 0.45));
    }
    out.push(S(slab(cab, zc, PCS.cab.h, 2, 0.5), { tone: "hi", inner: L(doors.join(""), { tone: "lo" }) + L(grille.join(""), { tone: "faint" }) }));
    // door handles and the status lamps
    out.push(L(frontLine(fy, m - 2.2, zc + 12, m - 2.2, zc + 15) + frontLine(fy, m + 2.2, zc + 12, m + 2.2, zc + 15), { tone: "mid" }));
    out.push(D([[m - 2.2, fy, zc + 12], [m - 2.2, fy, zc + 15], [m + 2.2, fy, zc + 12], [m + 2.2, fy, zc + 15]], { size: 0.35, tone: "mid" }));
    // the roof fan in its hood
    const fx = m, fyy = 0;
    out.push(S(k.cylinder(fx, fyy, 6.4, top, 2.2, P, 40), { tone: "mid" }));
    out.push(onTop(top + 2.2, fan(fx, fyy, 5.6, 5, "pcs")));
    out.push(D([[cx + 2, -PCS.cab.d / 2 + 2, top], [cx + PCS.cab.w - 2, -PCS.cab.d / 2 + 2, top], [cx + 2, PCS.cab.d / 2 - 2, top], [cx + PCS.cab.w - 2, PCS.cab.d / 2 - 2, top]], { size: 0.45, tone: "lo" }));
  });
  // AC and DC cables drop into the trench
  out.push(S(slab({ x: PCS.x + PCS.w / 2 - 3, y: PCS.y + PCS.d, w: 6, d: TRENCH.y - PCS.y - PCS.d }, 0, zc + 3, 2, 0.3), { tone: "mid" }));
  return { key: depth([PCS.x + PCS.w / 2, 0, 0]), svg: out.join("") };
}

// ── The metering kiosk: a price trace and a centre-zero MW meter ─────────────
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
    `<g class="bt-cursor"><path class="bt-cursor-line" d="M0 ${f1(-WIN.z1 + 0.6)}V${f1(-WIN.z0 - 0.6)}"/><circle class="bt-cursor-dot" cx="0" cy="0" r="0.55"/></g>`));
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
  // vent and a lock
  out.push(L([0, 1, 2].map((n) => frontRect(fy, KIOSK.x + 4, KIOSK.x + 14, 4 + n * 1.3, 4.5 + n * 1.3)).join(""), { tone: "faint" }));
  out.push(D([[KIOSK.x + KIOSK.w - 3, fy, 7]], { size: 0.5, tone: "mid" }));
  return { key: depth([KIOSK.x + KIOSK.w / 2, 0, 0]), svg: out.join("") };
}

// ── The step-up transformer in its bund, and the sealing-end frame ───────────
function porcelain(cx, cy, z, sheds, r0, r1) {
  const out = [S(k.cylinder(cx, cy, r1 + 0.6, z, 0.9, P, 20), { tone: "mid" })];
  let h = z + 0.9;
  for (let s = 0; s < sheds; s++) {
    out.push(S(k.cylinder(cx, cy, r0, h, 1.1, P, 10), { tone: "hi", crease: "none" }));
    out.push(S(k.cylinder(cx, cy, r1, h + 1.1, 0.4, P, 12), { tone: "hi" }));
    h += 1.5;
  }
  out.push(S(k.cylinder(cx, cy, r0 * 0.8, h, 1.2, P, 12), { tone: "mid" }));
  return { svg: out.join(""), top: [cx, cy, h + 1.2] };
}
function transformer() {
  const out = [], z0 = TX.base, z1 = TX.base + TX.h;
  // bund walls behind, then the gravel floor
  const wall = (plan) => S(slab(plan, 0, BUND.h, 2, 0.3), { tone: "lo" });
  out.push(wall({ x: BUND.x, y: BUND.y, w: BUND.w, d: BUND.t }), wall({ x: BUND.x, y: BUND.y + BUND.t, w: BUND.t, d: BUND.d - BUND.t * 2 }));
  const gravel = [];
  for (let gx = BUND.x + 3; gx < BUND.x + BUND.w - 2; gx += 3.4) for (let gy = BUND.y + 3; gy < BUND.y + BUND.d - 2; gy += 3.4) gravel.push([gx + ((gy * 7) % 1.3), gy, 0.4]);
  out.push(D(gravel, { size: 0.3, tone: "faint" }));
  // rails, tank, lid
  for (const ry of [TX.y + 4, TX.y + TX.d - 7]) out.push(S(slab({ x: TX.x - 2, y: ry, w: TX.w + 4, d: 3 }, 0, z0), { tone: "lo" }));
  const tank = { x: TX.x, y: TX.y, w: TX.w, d: TX.d };
  const stiff = [TX.x + 8, TX.x + TX.w - 8].map((sx) => path([[sx, TX.y + TX.d, z0], [sx, TX.y + TX.d, z1]])).join("");
  out.push(S(slab(tank, z0, TX.h, 2, 0.4), { tone: "mid", inner: L(stiff, { tone: "faint" }) }));
  out.push(S(slab({ x: TX.x - 0.8, y: TX.y - 0.8, w: TX.w + 1.6, d: TX.d + 1.6 }, z1, 1.2, 2, 0.4), { tone: "mid" }));
  out.push(D(Array.from({ length: 9 }, (_, n) => [TX.x + 1.5 + n * 3.9, TX.y + TX.d + 0.3, z1 + 1.2]), { size: 0.35, tone: "lo" }));
  // the LV cable box on the end wall, toward the inverters
  out.push(S(slab({ x: TX.x + TX.w, y: TX.y + 4, w: 4, d: 14 }, z0 + 4, 16, 2, 0.4), { tone: "mid" }));
  out.push(S(slab({ x: TX.x + TX.w, y: TX.y + 8, w: 3, d: 6 }, 0, z0 + 4, 2), { tone: "lo" }));
  // conservator on its brackets, with a sight glass on the end
  const zt = z1 + 1.2;
  for (const bx of [TX.x + 6, TX.x + 20]) out.push(S(slab({ x: bx, y: TX.y + 3, w: 1.4, d: 3 }, zt, 4.2), { tone: "lo" }));
  const consF = G.frameAlong([TX.x + 3, TX.y + 4.5, zt + 8], [1, 0, 0]);
  out.push(S(G.disc(0, 22, 4.2, consF, P), { tone: "mid" }));
  out.push(L(G.arcOf(consF, 11, 4.2, P) , { tone: "faint" }));
  out.push(L(G.circleOf(consF, 22, 1.6, P), { tone: "lo" }));
  // the Buchholz pipe from the conservator to the lid
  out.push(S(k.cylinder(TX.x + 13, TX.y + 4.5, 0.8, zt, 3.6, P, 10), { tone: "mid" }));
  // radiator banks: plates on edge, seen end on
  for (const bx of [TX.x + 2, TX.x + 18]) {
    const bank = { x: bx, y: TX.y + TX.d, w: 14, d: 7, r: 0 };
    const plates = [], tops = [];
    for (let px = bx + 0.9; px < bx + 14 - 0.5; px += 1.2) {
      plates.push(path([[px, bank.y + 7, z0 + 4.2], [px, bank.y + 7, z1 - 3.2]]));
      tops.push(path([[px, bank.y, z1 - 2], [px, bank.y + 7, z1 - 2]]));
    }
    const headers = k.sideSeam(bank, z0 + 4.2, P, 2) + k.sideSeam(bank, z1 - 3.2, P, 2);
    out.push(S(slab(bank, z0 + 3, TX.h - 5), { tone: "mid", inner: L(plates.join(""), { tone: "lo" }) + L(headers, { tone: "lo" }) }));
    out.push(L(tops.join(""), { tone: "lo" }));
  }
  // rating plate and a drain valve
  out.push(L(frontRect(TX.y + TX.d, TX.x + 16.4, TX.x + 17.6, z0 + 8, z0 + 14), { tone: "lo" }));
  out.push(S(k.cylinder(TX.x + 31, TX.y + TX.d + 0.8, 0.9, z0 + 1, 1.6, P, 12), { tone: "mid" }));
  // three 33 kV bushings and the jumpers to the sealing ends
  const hv = [TX.x + 8, TX.x + 16, TX.x + 24].map((bx) => porcelain(bx, TX.y + 15, zt, 5, 0.9, 1.9));
  hv.forEach((b) => out.push(b.svg));
  // bund walls in front
  out.push(wall({ x: BUND.x + BUND.w - BUND.t, y: BUND.y + BUND.t, w: BUND.t, d: BUND.d - BUND.t * 2 }), wall({ x: BUND.x, y: BUND.y + BUND.d - BUND.t, w: BUND.w, d: BUND.t }));
  return { key: depth([TX.x + TX.w / 2, 0, 0]), svg: out.join(""), hv };
}
function sealingEnds(hv) {
  const out = [], beam = 30;
  const posts = [-6, 12].map((py) => S(slab({ x: SEAL.x - 1, y: py - 1, w: 2, d: 2 }, 0, beam), { tone: "mid" }));
  out.push(posts[0]);
  out.push(S(slab({ x: SEAL.x - 1.4, y: -9, w: 2.8, d: 24 }, beam, 2, 2, 0.3), { tone: "mid" }));
  const ends = [-4, 3, 10].map((py) => porcelain(SEAL.x, py, beam + 2, 4, 0.8, 1.7));
  ends.forEach((e) => out.push(e.svg));
  // cables down the near post
  out.push(posts[1]);
  out.push(S(slab({ x: SEAL.x + 1, y: 10, w: 2, d: 3 }, 0, beam, 2), { tone: "lo" }));
  const jumpers = ends.map((e, n) => {
    const a = e.top, b = hv[n].top, pts = [];
    for (let s = 0; s <= 16; s++) { const t = s / 16; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * Math.sin(Math.PI * t)]); }
    return path(pts);
  });
  return { key: depth([SEAL.x, 0, 0]) - 0.1, svg: out.join(""), jumpers: L(jumpers.join(""), { tone: "mid" }) + D([...ends.map((e) => e.top), ...hv.map((b) => b.top)], { size: 0.5, tone: "hi" }) };
}

// ── Compose ──────────────────────────────────────────────────────────────────
const tx = transformer();
const se = sealingEnds(tx.hv);
const items = [se, tx, kiosk(), inverters(), ...CONTAINERS.map(container)].sort((a, b) => a.key - b.key);
const parts = { ground: ground(), fence: fence(), ...Object.fromEntries(items.map((it, n) => [`item${n}`, it.svg])), jumpers: se.jumpers };
const body = Object.values(parts).join("");
if (process.argv.includes("--sizes")) console.log(Object.entries(parts).map(([n, v]) => `${n} ${(v.length / 1024).toFixed(1)}`).join(" · "));

// ── Styles, scoped to the card's element ─────────────────────────────────────
const NAVY = `--anatomy-page:#050f17;--anatomy-card:#081722;--anatomy-paper:#081722;--anatomy-face:#0c1f2d;
--anatomy-shade-0:#040e17;--anatomy-shade-1:#061521;--anatomy-shade-2:#091b29;--anatomy-shade-3:#0c2131;--anatomy-top:#10283a;
--anatomy-lit-top:#163045;--anatomy-lit-shade:#12293b;
--anatomy-hi:#9fb2c2;--anatomy-mid:#5a7184;--anatomy-lo:#2f475a;--anatomy-faint:#1a3041;--anatomy-halo:#01070c;
--anatomy-text:#7f95a7;--anatomy-strong:#c9d6e0;--anatomy-muted:#566d80`;
const SITE = `--anatomy-lit:#eef5fa;--anatomy-dot:#9fb2c2;--bt-lamp:#eef5fa;--bt-lamp-off:#10283a;--bt-screen:#050d14`;
const SCENE_CSS = `.bt-face *{vector-effect:non-scaling-stroke}
.bt-shadow{fill:var(--anatomy-shade-0);opacity:.7}
.bt-seg-off{fill:var(--bt-lamp-off);stroke:none}
.bt-seg{fill:var(--bt-lamp);stroke:none;opacity:0}
.bt-throat{fill:var(--anatomy-shade-0);stroke:none}
.bt-blade{fill:var(--anatomy-shade-3);stroke:var(--anatomy-lo);stroke-width:.4px;stroke-linejoin:round}
.bt-hub{fill:var(--anatomy-top);stroke:var(--anatomy-mid);stroke-width:.4px}
.bt-guard{fill:none;stroke:var(--anatomy-mid);stroke-width:.45px}
.bt-rim{stroke-width:.6px}
.bt-screen{fill:var(--bt-screen);stroke:none}
.bt-grid{fill:none;stroke:var(--anatomy-faint);stroke-width:.4px}
.bt-trace{fill:none;stroke:var(--anatomy-hi);stroke-width:.5px;stroke-linejoin:round;stroke-linecap:round}
.bt-cursor-line{fill:none;stroke:var(--anatomy-lo);stroke-width:.4px}
.bt-cursor-dot{fill:var(--anatomy-hi);stroke:none}
.bt-dial{fill:var(--anatomy-top);stroke:var(--anatomy-mid);stroke-width:.5px}
.bt-tick{fill:none;stroke:var(--anatomy-mid);stroke-width:.4px}
.bt-needle{fill:none;stroke:var(--anatomy-hi);stroke-width:.6px;stroke-linecap:round}
.bt-pivot{fill:var(--anatomy-mid);stroke:none}`;
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots|face-text)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const css = `${SCOPE}{${NAVY};${SITE};--anatomy-weight:.6px}` + [...KIT, ...SCENE_CSS.split("\n")].map(scope).join("");
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${body}</svg>`;

// ── Live: one day of trading, on a loop ──────────────────────────────────────
const live = `
${readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "")}
const DAY = ${JSON.stringify(DAY)};
const TRACE = ${JSON.stringify({ x0: WIN.x0 + 1, w: WIN.x1 - WIN.x0 - 2, z0: WIN.z0 + 1.2, h: WIN.z1 - WIN.z0 - 2.4 })};
const PRICES = DAY.map((d) => d.price), LO = Math.min(...PRICES), HI = Math.max(...PRICES);
const SPH = ${SECONDS_PER_HOUR}, STILL_HOUR = ${STILL_HOUR};
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const lamps = [...svg.querySelectorAll("[data-lamp]")].map((g) => [...g.querySelectorAll(".bt-seg")]);
const fans = [...svg.querySelectorAll("[data-fan]")].map((el) => ({ el, kind: el.dataset.fan, c: el.dataset.c, angle: Math.random() * 360 }));
const needle = svg.querySelector(".bt-needle"), cursor = svg.querySelector(".bt-cursor");
// fans: the containers' air conditioners tick over and work harder with the
// current; the inverters' fans run with the power they convert and coast to rest
const REV = { hvac: [0.25, 1.1], pcs: [0, 1.4] };
let power = 0, spin = { hvac: REV.hvac[0], pcs: 0 };
function draw(hours, dt) {
  const s = stateAt(DAY, hours);
  const ease = dt === null ? 1 : 1 - Math.exp(-dt / 0.45);
  power += (s.mw - power) * ease;
  const load = Math.abs(power) / ${BATTERY.mw};
  for (const kind of ["hvac", "pcs"]) {
    const target = REV[kind][0] + REV[kind][1] * load;
    spin[kind] += (target - spin[kind]) * (dt === null ? 1 : 1 - Math.exp(-dt / (kind === "pcs" ? 0.9 : 1.6)));
  }
  for (const f of fans) {
    f.angle = (f.angle + spin[f.kind] * 360 * (dt || 0)) % 360;
    f.el.setAttribute("transform", "rotate(" + f.angle.toFixed(1) + " " + f.c + ")");
  }
  const lit = s.soc * 10;
  for (const segs of lamps) segs.forEach((el, i) => { const v = Math.max(0, Math.min(1, lit - i)).toFixed(2); if (el.style.opacity !== v) el.style.opacity = v; });
  needle.setAttribute("transform", "rotate(" + ((power / ${BATTERY.mw}) * 50).toFixed(1) + " " + needle.dataset.c + ")");
  const h = s.t, i = Math.min(23, Math.floor(h)), j = Math.min(23, i + 1), f = h - Math.floor(h);
  const p = PRICES[i] + (PRICES[j] - PRICES[i]) * f;
  cursor.setAttribute("transform", "translate(" + (TRACE.x0 + TRACE.w * h / 24).toFixed(2) + " " + (-(TRACE.z0 + TRACE.h * (p - LO) / (HI - LO))).toFixed(2) + ")");
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
const preview = (hour) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Battery card</title><style>
body{margin:0;padding:24px 15px;background:#fff;font-family:"Quicksand",system-ui,sans-serif}
.wrap{max-width:1110px;margin:0 auto}
.card{position:relative;height:160px;border:1px solid rgba(0,0,0,.125);border-radius:.25rem;overflow:hidden;background:#081722;display:flex}
.scene-battery{position:absolute;inset:0}
.scene-battery svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,0.2),white 80%)}
.card-block{position:relative;z-index:2;margin:auto 15px;max-width:640px}
h2{color:#717171;font-weight:500;font-size:1.6rem;margin:0 0 .4rem;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:1rem;margin:0 0 .3rem}.text{color:#000;font-size:.95rem;margin:0}
</style></head><body><div class="wrap"><div class="card"><div class="scene-battery"${hour === undefined ? "" : ` data-hour="${hour}"`} aria-hidden="true">${markup}</div>
<div class="card-block"><h2>Deep Reinforcement Learning for Grid Scale Lithium-ion Battery Optimisation</h2><p class="date">Oct 10, 2022</p><p class="text">Wholesale arbitrage with DQN agents, benchmarked against MILP</p></div></div></div>
<script type="module">${live.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview());
// --stills <dir>: the card held at chosen hours, for captures
const stills = process.argv.indexOf("--stills");
if (stills > 0) {
  const dir = process.argv[stills + 1];
  mkdirSync(dir, { recursive: true });
  for (const h of [5.5, 10.5, 15, 19.5]) writeFileSync(join(dir, `preview-${String(h).replace(".", "_")}.html`), preview(h));
}
console.log(`scene.svg ${(markup.length / 1024).toFixed(1)} KB · scene.js ${(live.length / 1024).toFixed(1)} KB · ${DATE}: SoC ${rows[0].soc} → ${Math.max(...rows.map((r) => r.soc))} → ${rows[24].soc}, prices £${Math.min(...DAY.map((d) => d.price))}–£${Math.max(...DAY.map((d) => d.price))}/MWh`);
