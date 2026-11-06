// The officetea card: a district of offices seen from above at the city
// builder's classic angle, in Office Tea's own colours. Glass towers crowd the
// middle, brick and render mid-rises fill the blocks round them, a park and low
// shops sit at the front, and one terracotta tower with a tea-gold crown stands
// over the rest. Streets run between the blocks with their centre lines and
// crossings; roofs carry plant, tanks and masts. A still drawing; no script.
// One unit is one metre.
// Run: node build.mjs   writes staticfiles/image/thumbnails/officetea/scene-colour.svg
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../staticfiles/image/thumbnails/officetea");
const SCOPE = ".scene-officetea";
const random = ((seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(23);
const pick = (list) => list[Math.floor(random() * list.length)];

// ── The plan: four blocks by four, each cut into four lots, with streets
// between them ────────────────────────────────────────────────────────────────
const BLOCKS = 4, LOT = 19, GAP = 3, PAVE = 2.5, STREET = 11;
const BLOCK = PAVE * 2 + LOT * 2 + GAP;
const PITCH = BLOCK + STREET;
const SIDE = BLOCKS * PITCH + STREET;
const FLOOR = 3.6;

// ── The view: a portrait card, the district bleeding off both sides and the
// bottom, its back corner low enough to leave open sage for the card's words ──
const VIEW = { width: 400, height: 500 };
const P0 = { origin: [0, 0], scale: 1, azimuth: 45, elevation: 30 };
const centre = k.iso([SIDE / 2, SIDE / 2, 0], P0);
const SCALE = 2.15;
const P = { origin: [VIEW.width / 2 - centre[0] * SCALE + 12, 432 - centre[1] * SCALE], scale: SCALE, azimuth: 45, elevation: 30 };
const at = (p) => k.iso(p, P);
const depth = ([x, y]) => k.depthOf([x, y, 0], P);
const f1 = (n) => +n.toFixed(1);
const poly = (pts) => "M" + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join("L") + "Z";
const box = (x, y, w, d) => ({ x, y, w, d, r: 0 });
// Whether a box from z0 to z1 shows on the card at all: anything wholly off it is left out.
const onCard = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return Math.max(...xs) > -4 && Math.min(...xs) < VIEW.width + 4 && Math.max(...ys) > -4 && Math.min(...ys) < VIEW.height + 4;
};
const shows = ({ x, y, w, d }, z0, z1) => onCard(k.boxCorners({ x, y, w, d }, z0, z1).map(at));

// Materials: each sets the kit's tone variables on its group, so a solid takes
// its colour from the group it sits in.
const MATERIALS = {
  cream: { paper: "#f7f5f0", top: "#fdfcf9", shades: ["#b9ae9c", "#cfc6b6", "#e2dbcf", "#efeae1"], edge: "#8f8577", glass: "#9db1c9" },
  stone: { paper: "#e8e4dc", top: "#f0ede7", shades: ["#a9a09a", "#bdb5ad", "#cec8bf", "#ddd8cf"], edge: "#7f7771", glass: "#8ea3bd" },
  terra: { paper: "#b85c45", top: "#c97a62", shades: ["#7f3a2a", "#94462f", "#a8523d", "#b85c45"], edge: "#5e2a1e", glass: "#f3d9b0" },
  navy: { paper: "#3d5187", top: "#6a7fb3", shades: ["#24325a", "#2d3d6c", "#34477b", "#3d5187"], edge: "#18213d", glass: "#8fa6d6" },
  glass: { paper: "#7f97c4", top: "#a9bddf", shades: ["#4c6396", "#5a73a8", "#6a84b8", "#7f97c4"], edge: "#33466f", glass: "#c9d7ef" },
  tea: { paper: "#c28a2a", top: "#dcae55", shades: ["#7f5a17", "#93691d", "#a97922", "#c28a2a"], edge: "#5c400f", glass: "#f6e3b8" },
  sage: { paper: "#4f7a6a", top: "#6f9a88", shades: ["#2f4a40", "#3a5a4e", "#45685b", "#4f7a6a"], edge: "#253b33", glass: "#a8c7b9" },
  leaf: { paper: "#5f8f6c", top: "#86b38f", shades: ["#3a5e45", "#46704f", "#527e5b", "#5f8f6c"], edge: "#2c4733", glass: "#86b38f" },
  bark: { paper: "#6b4f3a", top: "#7d5f48", shades: ["#4a3526", "#57402f", "#614835", "#6b4f3a"], edge: "#3a291d", glass: "#6b4f3a" },
  asphalt: { paper: "#5f6763", top: "#6b7470", shades: ["#3e4542", "#474f4b", "#515955", "#5f6763"], edge: "#353b38", glass: "#6b7470" },
  pave: { paper: "#e8e4dc", top: "#efebe3", shades: ["#b8b1a7", "#c9c2b8", "#d8d3c8", "#e2ddd4"], edge: "#a9a09a", glass: "#e8e4dc" },
  grass: { paper: "#7aa37c", top: "#8db58c", shades: ["#4f7a5c", "#5d8866", "#6b9671", "#7aa37c"], edge: "#3f6448", glass: "#8db58c" },
};
const varsOf = (m) => `--anatomy-paper:${m.paper};--anatomy-top:${m.top};--anatomy-face:${m.paper};${m.shades.map((s, i) => `--anatomy-shade-${i}:${s}`).join(";")};--anatomy-hi:${m.edge};--anatomy-mid:${m.edge};--anatomy-lo:${m.edge};--anatomy-faint:${m.edge}`;
const solid = (paths, material, extra = "") => `<g class="ot-${material}">${k.solidSvg(paths, { tone: "hi", crease: "faint", inner: extra })}</g>`;
const slab = (plan, z, h, material, bevel = 0) => solid(k.slabOf(plan, z, h, P, 1, bevel), material);

// Lines on the two faces the camera sees, +x and +y, at height z across a box.
const faces = ({ x, y, w, d }) => [
  { from: [x + w, y + d], to: [x + w, y], span: d },   // the +x face, read from its near corner
  { from: [x, y + d], to: [x + w, y + d], span: w },   // the +y face
];
const onFace = (face, s, z) => at([face.from[0] + ((face.to[0] - face.from[0]) * s) / face.span, face.from[1] + ((face.to[1] - face.from[1]) * s) / face.span, z]);

// Windows: a grid of panes on each face, one path per face.
function windows(plan, z0, floors, material, { bay = 4, sill = 1.1, head = 2.7, pane = 2.3 } = {}) {
  return faces(plan).map((face) => {
    const bays = Math.max(1, Math.floor((face.span - 1.6) / bay));
    const margin = (face.span - bays * bay) / 2;
    const cells = [];
    for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
      const s0 = margin + b * bay + (bay - pane) / 2, s1 = s0 + pane, zb = z0 + f * FLOOR + sill, zt = z0 + f * FLOOR + head;
      cells.push(poly([onFace(face, s0, zb), onFace(face, s1, zb), onFace(face, s1, zt), onFace(face, s0, zt)]));
    }
    return `<path class="ot-pane" style="fill:${MATERIALS[material].glass}" d="${cells.join("")}"/>`;
  }).join("");
}
// Ribbon windows: one glazed strip a floor on each face, split into panes by
// mullions that run sill to head, so a face is two paths however tall it is.
function ribbons(plan, z0, floors, material, { bay = 3, sill = 1.1, head = 2.7, end = 1.2 } = {}) {
  return faces(plan).map((face) => {
    const strips = [], mullions = [];
    for (let f = 0; f < floors; f++) {
      const zb = z0 + f * FLOOR + sill, zt = z0 + f * FLOOR + head;
      strips.push(poly([onFace(face, end, zb), onFace(face, face.span - end, zb), onFace(face, face.span - end, zt), onFace(face, end, zt)]));
      for (let s = end + bay; s < face.span - end - 0.5; s += bay) mullions.push(k.pathOf([onFace(face, s, zb), onFace(face, s, zt)]));
    }
    return `<path class="ot-pane" style="fill:${MATERIALS[material].glass}" d="${strips.join("")}"/><path class="ot-ribbon" d="${mullions.join("")}"/>`;
  }).join("");
}
// Curtain wall: floor bands and mullions on a glass tower, each line edge to edge of its face.
function curtain(plan, z0, z1, { bay = 3 } = {}) {
  const lines = [];
  for (const face of faces(plan)) {
    for (let z = z0 + FLOOR; z < z1 - 0.5; z += FLOOR) lines.push(k.pathOf([onFace(face, 0, z), onFace(face, face.span, z)]));
    for (let s = bay; s < face.span - 0.5; s += bay) lines.push(k.pathOf([onFace(face, s, z0), onFace(face, s, z1)]));
  }
  return `<path class="ot-mullion" d="${lines.join("")}"/>`;
}
// Roof: a parapet line and the plant that stands on it.
function roof(plan, z, material, tall) {
  const parts = [`<path class="iso-line ot-parapet" d="${k.planOutline(k.insetPlan(plan, 0.9), z, P, 1)}"/>`];
  const { x, y, w, d } = plan;
  const cx = x + w / 2, cy = y + d / 2;
  if (random() < 0.7) parts.push(slab(box(cx - w * 0.22, cy - d * 0.18, w * 0.3, d * 0.24), z, 2.2, "stone"));
  if (random() < 0.45) parts.push(solid(k.cylinder(x + w * 0.74, y + d * 0.72, 1.7, z, 3.4, P, 10), "stone"));
  if (tall) {
    const base = [x + w * 0.3, y + d * 0.68];
    parts.push(`<path class="iso-line ot-mast" d="${k.rise(base, z, z + 9, P)}"/>`, `<circle class="ot-beacon" cx="${f1(at([...base, z + 9])[0])}" cy="${f1(at([...base, z + 9])[1])}" r="0.9"/>`);
  }
  void material;
  return parts.join("");
}

// ── The buildings, by kind ────────────────────────────────────────────────────
function office(plan, floors, material) {
  const h = floors * FLOOR + 0.8;
  const glazing = material === "terra" ? windows(plan, 0, floors, material) : ribbons(plan, 0, floors, material);
  return solid(k.slabOf(plan, 0, h, P, 1), material, glazing) + roof(plan, h, material, false);
}
function tower(plan, floors, material) {
  const h = floors * FLOOR + 1.2;
  return solid(k.slabOf(plan, 0, h, P, 1), material, curtain(plan, 0, h)) + roof(plan, h, material, floors > 22);
}
// The landmark: three setbacks of terracotta, a gold crown and a spire.
function landmark(plan) {
  const parts = [];
  let p = plan, z = 0;
  for (const [floors, inset] of [[13, 0], [9, 2.4], [5, 4.2]]) {
    p = k.insetPlan(plan, inset);
    const h = floors * FLOOR;
    parts.push(solid(k.slabOf(p, z, h, P, 1), "terra", windows(p, z, floors, "terra", { bay: 3 })));
    parts.push(`<path class="iso-line ot-parapet" d="${k.planOutline(k.insetPlan(p, 0.7), z + h, P, 1)}"/>`);
    z += h;
  }
  const crown = k.insetPlan(p, 1.6);
  parts.push(solid(k.slabOf(crown, z, 5, P, 1), "tea", curtain(crown, z, z + 5, { bay: 1.6 })));
  const tip = [crown.x + crown.w / 2, crown.y + crown.d / 2];
  parts.push(solid(k.cylinder(...tip, 0.9, z + 5, 3, P, 14), "tea"));
  parts.push(`<path class="iso-line ot-mast" d="${k.rise(tip, z + 8, z + 22, P)}"/>`);
  const top = at([...tip, z + 22]);
  parts.push(`<circle class="ot-beacon" cx="${f1(top[0])}" cy="${f1(top[1])}" r="1"/>`);
  return parts.join("");
}
// A tree: a trunk and two stacked crowns, like a model railway's.
function tree(x, y, size = 1) {
  return solid(k.cylinder(x, y, 0.45 * size, 0, 2.2 * size, P, 6), "bark") +
    solid(k.cylinder(x, y, 2.3 * size, 2.2 * size, 2.4 * size, P, 12, 0.4), "leaf") +
    solid(k.cylinder(x, y, 1.5 * size, 4.6 * size, 1.8 * size, P, 10, 0.3), "leaf");
}
function park(plan) {
  const parts = [slab(plan, 0, 0.6, "grass", 0.4)];
  const { x, y, w, d } = plan;
  // a path across the lawn, from corner to corner, and a pond in a stone rim
  parts.push(`<path class="ot-walk" d="${poly([[x + 2, y], [x + 4.5, y], [x + w, y + d - 4.5], [x + w, y + d - 2]].map(([px, py]) => at([px, py, 0.6])))}"/>`);
  parts.push(solid(k.cylinder(x + w * 0.28, y + d * 0.7, 3.4, 0.6, 0.5, P, 28), "stone"));
  parts.push(`<path class="ot-pond" d="${k.ring(x + w * 0.28, y + d * 0.7, 2.7, 1.1, P, 28)}"/>`);
  const trees = [[0.75, 0.2], [0.2, 0.25], [0.55, 0.45], [0.82, 0.62], [0.4, 0.88], [0.15, 0.48]];
  return { ground: parts.join(""), trees: trees.map(([tx, ty]) => ({ at: [x + w * tx, y + d * ty], svg: tree(x + w * tx, y + d * ty, 0.9 + random() * 0.3) })) };
}

// Each lot's building, from the middle of the district out: towers in the
// middle and back, mid-rises round them, low shops and the park at the front.
const lots = [];
for (let bi = 0; bi < BLOCKS; bi++) for (let bj = 0; bj < BLOCKS; bj++) {
  const bx = STREET + bi * PITCH, by = STREET + bj * PITCH;
  for (let li = 0; li < 2; li++) for (let lj = 0; lj < 2; lj++) {
    const x = bx + PAVE + li * (LOT + GAP), y = by + PAVE + lj * (LOT + GAP);
    lots.push({ plan: box(x, y, LOT, LOT), bi, bj, li, lj, i: bi * 2 + li, j: bj * 2 + lj });
  }
}
const towardFront = (lot) => (lot.i + lot.j) / (BLOCKS * 4 - 2); // 0 at the back corner, 1 at the front
const middle = (lot) => Math.hypot(lot.i - 3.5, lot.j - 3.5) / 5;
const LANDMARK = { i: 4, j: 3 };
const PARK = { bi: 2, bj: 3 };
const items = [];
const grounds = [];
for (const lot of lots) {
  const { plan } = lot;
  if (!shows(plan, 0, 140)) continue;
  const key = depth([plan.x + plan.w / 2, plan.y + plan.d / 2]);
  if (lot.bi === PARK.bi && lot.bj === PARK.bj) continue;
  if (lot.i === LANDMARK.i && lot.j === LANDMARK.j) { items.push({ key, svg: landmark(k.insetPlan(plan, 0.5)) }); continue; }
  const centrality = 1 - Math.min(1, middle(lot)), front = towardFront(lot);
  const tall = centrality * (1 - front * 0.55);
  const r = random();
  if (tall > 0.5 && r < 0.75) {
    const floors = Math.round(12 + tall * 14 + random() * 4);
    const shrink = random() < 0.5 ? 1.5 : 3;
    items.push({ key, svg: tower(k.insetPlan(plan, shrink), floors, pick(["glass", "glass", "navy"])) });
  } else if (front > 0.8 && r < 0.6) {
    items.push({ key, svg: office(k.insetPlan(plan, 1), 2 + Math.floor(random() * 2), pick(["cream", "stone", "terra"])) });
  } else {
    const floors = Math.round(4 + tall * 10 + random() * 4);
    items.push({ key, svg: office(k.insetPlan(plan, 0.8), floors, pick(["cream", "terra", "stone", "cream", "sage"])) });
  }
}
// the park's block is one lawn
{
  const bx = STREET + PARK.bi * PITCH, by = STREET + PARK.bj * PITCH;
  const lawn = park(box(bx + PAVE, by + PAVE, LOT * 2 + GAP, LOT * 2 + GAP));
  grounds.push(lawn.ground);
  for (const t of lawn.trees) if (shows(box(t.at[0] - 3, t.at[1] - 3, 6, 6), 0, 7)) items.push({ key: depth(t.at), svg: t.svg });
}
// street trees along the front edges of the pavements
for (let bi = 0; bi < BLOCKS; bi++) for (let bj = 0; bj < BLOCKS; bj++) {
  if (bi === PARK.bi && bj === PARK.bj) continue;
  const bx = STREET + bi * PITCH, by = STREET + bj * PITCH;
  for (const s of [0.18, 0.5, 0.82]) {
    for (const [tx, ty] of [[bx + BLOCK - 1.2, by + BLOCK * s], [bx + BLOCK * s, by + BLOCK - 1.2]]) {
      if (random() < 0.5 && shows(box(tx - 2, ty - 2, 4, 4), 0, 5)) items.push({ key: depth([tx, ty]) + 0.01, svg: tree(tx, ty, 0.6) });
    }
  }
}

// ── The ground: one asphalt plate, the blocks' pavements on it, and the
// streets' centre lines and crossings ─────────────────────────────────────────
const groundSvg = [slab(box(0, 0, SIDE, SIDE), -3, 3, "asphalt")];
for (let bi = 0; bi < BLOCKS; bi++) for (let bj = 0; bj < BLOCKS; bj++) {
  const pavement = box(STREET + bi * PITCH, STREET + bj * PITCH, BLOCK, BLOCK);
  if (shows(pavement, 0, 0.5)) groundSvg.push(slab(pavement, 0, 0.5, "pave", 0.3));
}
const marks = [];
for (let n = 0; n <= BLOCKS; n++) {
  const c = n * PITCH + STREET / 2;
  for (let m = 0; m < BLOCKS; m++) {
    const a = STREET + m * PITCH + 2.5, b = STREET + m * PITCH + BLOCK - 2.5;
    // a dashed centre line between the crossings, each dash a closed bar on the road
    for (let s = a + 1; s < b - 3; s += 5) {
      marks.push(poly([[c - 0.2, s], [c + 0.2, s], [c + 0.2, s + 2.6], [c - 0.2, s + 2.6]].map(([x, y]) => at([x, y, 0]))));
      marks.push(poly([[s, c - 0.2], [s, c + 0.2], [s + 2.6, c + 0.2], [s + 2.6, c - 0.2]].map(([x, y]) => at([x, y, 0]))));
    }
    // zebra crossings at each end of the block, across the street
    for (const end of [STREET + m * PITCH + 0.6, STREET + m * PITCH + BLOCK - 2.6]) {
      for (let z = c - STREET / 2 + 1; z < c + STREET / 2 - 1; z += 1.6) {
        marks.push(poly([[z, end], [z + 0.8, end], [z + 0.8, end + 2], [z, end + 2]].map(([x, y]) => at([x, y, 0]))));
        marks.push(poly([[end, z], [end, z + 0.8], [end + 2, z + 0.8], [end + 2, z]].map(([x, y]) => at([x, y, 0]))));
      }
    }
  }
}
groundSvg.push(`<path class="ot-marks" d="${marks.filter((d) => onCard(d.slice(1, -1).split("L").map((pt) => pt.split(" ").map(Number)))).join("")}"/>`);

items.sort((a, b) => a.key - b.key);

// ── Styles, scoped to the card ────────────────────────────────────────────────
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid)/.test(line));
const scope = (rule) => rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(","));
const css = `${SCOPE}{--anatomy-weight:.45px}` + [
  ...KIT,
  ...Object.entries(MATERIALS).map(([name, m]) => `.ot-${name}{${varsOf(m)}}`),
  ".ot-pane{stroke:none;opacity:.9}",
  ".ot-mullion{fill:none;stroke:rgba(255,255,255,.38);stroke-width:.35}",
  ".ot-ribbon{fill:none;stroke:rgba(0,0,0,.18);stroke-width:.35}",
  ".iso-line.ot-parapet{stroke:rgba(0,0,0,.22);stroke-width:.4}",
  ".iso-line.ot-mast{stroke:#4a4440;stroke-width:.55}",
  ".ot-beacon{fill:#e0675e}",
  ".ot-marks{fill:#f7f5f0;opacity:.85}",
  ".ot-walk{fill:#e8e4dc}",
  ".ot-pond{fill:#7fa7c8;stroke:#5e87ab;stroke-width:.35}",
].map(scope).join("");

const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.width} ${VIEW.height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><style>${css}</style>` +
  `<rect x="-100" y="-100" width="${VIEW.width + 200}" height="${VIEW.height + 200}" fill="#4f7a6a"/>` +
  groundSvg.join("") + grounds.join("") + items.map((it) => it.svg).join("") + `</svg>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "scene-colour.svg"), markup);

// ── The preview: the card as the homepage draws it ───────────────────────────
const preview = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>officetea card</title>
<style>body{margin:0;padding:24px;background:#bccbd0;font-family:Inter,system-ui,sans-serif}.card{position:relative;width:400px;aspect-ratio:4/5;overflow:hidden;border-radius:6px;background:#4f7a6a}
${SCOPE}{position:absolute;inset:0}${SCOPE} svg{display:block;width:100%;height:100%}
.text{position:relative;padding:20px 22px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:6px}.label{font:11px/1 monospace;letter-spacing:.08em;opacity:.82}.title{font-size:22px;font-weight:600}.blurb{font-size:13px;opacity:.88}</style></head><body>
<div class="card"><div class="${SCOPE.slice(1)}" aria-hidden="true">${markup}</div><div class="text"><span class="label">OFFICETEA.CO</span><span class="title">officetea</span><span class="blurb">Anonymous stories from inside toxic workplaces</span></div></div>
</body></html>`;
writeFileSync(join(HERE, "preview-colour.html"), preview);
console.log(`scene-colour.svg ${(markup.length / 1024).toFixed(0)} KB · ${items.length} items`);
