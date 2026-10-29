// The homepage's island: one tile of the GB power system, cut from the ground
// like a diorama, with the rock under it on show. Generation, the grid, towns
// and the sea, drawn with the anatomy kit in true isometric projection (no
// perspective), in the same family as the blog cards. One unit is a metre.
// Run: node figures/island/build.mjs           writes staticfiles/image/island/island.svg
//                                              and island.js, and preview.html beside this file
//      node figures/island/build.mjs --check   also renders preview.html to check.png
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import * as W from "./layout.mjs";

// the anatomy skill: the copy vendored in figures/lib first, else the installed one
const VENDORED = join(dirname(fileURLToPath(import.meta.url)), "../lib/anatomy");
const SKILL = existsSync(join(VENDORED, "kit/iso-kit.mjs")) ? VENDORED : join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const G = await import(join(SKILL, "kit/lathe.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const OUT = join(ROOT, "staticfiles/image/island");
const SCOPE = ".island-scene";
const { makeParts } = await import(join(HERE, "parts.mjs"));
// the wake card's rotor, which takes a parallel view as readily as its own perspective
const { makeRotor } = await import(join(HERE, "../wake/rotor.mjs"));

// ── The camera ──────────────────────────────────────────────────────────────
// The kit's parallel projection, turned to 60° so the long south face with its
// cross-section looks at the viewer and the east face, the sea's, turns away.
// The frame is the hero's 1440 × 900 with room above the island for the sun.
const WIDTH = 1440, HEIGHT = 900;
const VIEW = { azimuth: 60, elevation: 30, pad: 70, headroom: 150 };
const { TILE, DEPTH, SEA_LEVEL } = W;
const EXTREMES = [...k.boxCorners(TILE, -DEPTH, 0), [850, 80, 120], [1030, 74, 128]];
const P = k.fitProjection(EXTREMES, WIDTH, HEIGHT, VIEW);
const at = (p) => k.iso(p, P);
const flat = (pts, z = 0) => pts.map(([x, y]) => at([x, y, z]));
const path = (pts, closed = false) => k.pathOf(pts, closed);
const { sinA, cosA } = k.cameraOf(P);
const TOWARD = [cosA, sinA];                      // the floor direction to the viewer
const LIGHT = [-sinA, cosA];                      // the kit's light, on the floor
const random = W.seeded(11);
// the ground follows the hills: a plan line split into short steps, each at its height
function densify(pts, closed = false, step = 8) {
  const out = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < m; j++) out.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m]);
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}
const drape = (pts, closed = false) => densify(pts, closed).map(([x, y]) => at([x, y, W.heightAt(x, y)]));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── The ground under any point: one column of layers ─────────────────────────
// Top to bottom: water (sea or river), grass, topsoil, subsoil, the sea's sand,
// then the rock: sandstone, mudstone, limestone and granite. A layer that isn't
// there has no thickness, so the faces need no special cases at the coast.
const LAYERS = ["water", "grass", "topsoil", "subsoil", "sediment", "sandstone", "mudstone", "limestone", "granite"];
function column(x, y, s) {
  const inland = W.coastX(y) - x;
  const land = smooth(-4, 36, inland);
  const sea = 1 - land;
  // the river's channel where it leaves through the front face
  const river = Math.max(0, -W.fromRiver(x, y) / 16);
  const top = SEA_LEVEL * Math.max(sea, Math.min(1, river * 4)) + W.heightAt(x, y) * land;
  const water = sea * Math.min(24, 4 + 0.13 * Math.max(0, -inland)) + Math.min(1, river) * 7;
  const soil = land * (1 - Math.min(1, river * 2));
  const t = [water, 2.5 * soil, 7 * soil, 12 * soil, 9 * sea + 3 * Math.min(1, river)];
  const z = [top];
  for (const h of t) z.push(z[z.length - 1] - h);
  // the rock's bedding planes undulate gently along the cut
  const wave = (base, amp, len, ph) => base + amp * Math.sin(s / len + ph) + amp * 0.4 * Math.sin(s / (len * 0.37) + ph * 2.3);
  z.push(Math.min(z[z.length - 1] - 4, wave(-50, 5, 80, 0.4)));
  z.push(wave(-78, 6, 110, 1.9));
  z.push(wave(-103, 5, 70, 3.1));
  z.push(-DEPTH);
  return z; // z[i] is the top of LAYERS[i], z[i + 1] its bottom
}

// ── The cut faces: the run of the tile's outline that faces the viewer ───────
const RING = k.ringOf(TILE, 10);
const facing = RING.map((a, i) => {
  const b = RING[(i + 1) % RING.length], n = [b[1] - a[1], -(b[0] - a[0])], l = Math.hypot(n[0], n[1]) || 1;
  // roundedPlan winds clockwise on screen (y down), so this normal points out
  return { a, b, n: [n[0] / l, n[1] / l], seen: (n[0] * TOWARD[0] + n[1] * TOWARD[1]) / l > 1e-9 };
});
const firstSeen = facing.findIndex((f, i) => f.seen && !facing[(i + facing.length - 1) % facing.length].seen);
const RUN = [];
for (let i = firstSeen; facing[i % facing.length].seen; i++) RUN.push(facing[i % facing.length]);
// samples along the run every few metres, with the arc length and the facing
const SAMPLES = [];
{
  let s = 0;
  for (const f of RUN) {
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), n = Math.max(1, Math.ceil(len / 6));
    for (let i = 0; i < n; i++) SAMPLES.push({ x: f.a[0] + ((f.b[0] - f.a[0]) * i) / n, y: f.a[1] + ((f.b[1] - f.a[1]) * i) / n, s: s + (len * i) / n, f });
    s += len;
  }
  const last = RUN[RUN.length - 1];
  SAMPLES.push({ x: last.b[0], y: last.b[1], s, f: last });
}
const COLUMNS = SAMPLES.map((p) => column(p.x, p.y, p.s));

// Grain in the rock: a small tile of specks over each layer's colour, so the
// sandstone, limestone and granite read as stone without a dot per grain.
const GRAIN = {
  sandstone: { colour: "#c9a36d", speck: "#7a5c3c", opacity: 0.35, size: 9, count: 7, r: [0.35, 0.6] },
  limestone: { colour: "#ddd3bd", speck: "#9b8f78", opacity: 0.5, size: 14, count: 4, r: [0.5, 0.9] },
  granite: { colour: "#a9978c", speck: "#f1e6dc", opacity: 0.6, size: 7, count: 6, r: [0.35, 0.7] },
};
const grainDefs = Object.entries(GRAIN).map(([name, g]) => {
  const r = W.seeded(name.length * 97);
  const specks = Array.from({ length: g.count }, () => `<circle cx="${(r() * g.size).toFixed(1)}" cy="${(r() * g.size).toFixed(1)}" r="${(g.r[0] + r() * (g.r[1] - g.r[0])).toFixed(2)}"/>`).join("");
  const dark = name === "granite" ? `<circle cx="${(r() * g.size).toFixed(1)}" cy="${(r() * g.size).toFixed(1)}" r=".45" fill="#5d4f47" opacity=".5"/>` : "";
  return `<pattern id="il-grain-${name}" width="${g.size}" height="${g.size}" patternUnits="userSpaceOnUse" patternTransform="rotate(${r() * 40 - 20})"><rect width="${g.size}" height="${g.size}" fill="${g.colour}"/><g fill="${g.speck}" opacity="${g.opacity}">${specks}</g>${dark}</pattern>`;
}).join("");

function faces() {
  const out = [];
  // each layer is one band from the top line to the bottom line along the run
  LAYERS.forEach((name, i) => {
    const top = SAMPLES.map((p, j) => at([p.x, p.y, COLUMNS[j][i]]));
    const bottom = SAMPLES.map((p, j) => at([p.x, p.y, COLUMNS[j][i + 1]]));
    if (COLUMNS.every((c) => c[i] - c[i + 1] < 0.05)) return;
    out.push(`<path class="il-layer" data-layer="${name}"${GRAIN[name] ? ` fill="url(#il-grain-${name})"` : ""} d="${path([...top, ...bottom.reverse()], true)}"/>`);
  });
  // texture in the rock comes from the layer's pattern fill (see GRAIN below)
  // bedding planes: lines that follow the mudstone's top, edge to edge
  const mi = LAYERS.indexOf("mudstone");
  const beds = [0.25, 0.5, 0.75].map((f) => path(SAMPLES.map((p, j) => at([p.x, p.y, COLUMNS[j][mi] + (COLUMNS[j][mi + 1] - COLUMNS[j][mi]) * f + 0.8 * Math.sin(p.s / 23 + f * 9)]))));
  out.push(`<path class="il-bed" d="${beds.join("")}"/>`);
  // the boundaries between layers, faint, and the sea's lit surface
  const seams = LAYERS.slice(1).map((_, n) => {
    const i = n + 1;
    const runs = [];
    let run = [];
    SAMPLES.forEach((p, j) => {
      const thick = COLUMNS[j][i - 1] - COLUMNS[j][i] > 0.05 && COLUMNS[j][i] - COLUMNS[j][i + 1] > 0.05;
      if (thick) run.push(at([p.x, p.y, COLUMNS[j][i]]));
      else { if (run.length > 1) runs.push(run); run = []; }
    });
    if (run.length > 1) runs.push(run);
    return runs.map((r) => path(r)).join("");
  }).join("");
  out.push(k.lineSvg(seams, { tone: "faint", className: "il-seam" }));
  // light by facing, in the kit's four bands: one sheet per run of a band
  let band = null, from = 0;
  const sheets = [[], [], [], []];
  const bandOf = (f) => Math.min(3, Math.max(0, Math.floor(((f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + 1) / 2) * 4)));
  SAMPLES.forEach((p, j) => {
    const b = bandOf(p.f);
    if (band === null) band = b;
    if (b !== band || j === SAMPLES.length - 1) {
      const span = SAMPLES.slice(from, j + 1);
      const top = span.map((q) => at([q.x, q.y, COLUMNS[SAMPLES.indexOf(q)][0]]));
      const bottom = span.map((q) => at([q.x, q.y, -DEPTH]));
      sheets[band].push(path([...top, ...bottom.reverse()], true));
      band = b; from = j;
    }
  });
  out.push(sheets.map((d, b) => (d.length ? `<path class="il-face-shade" data-shade="${b}" d="${d.join("")}"/>` : "")).join(""));
  // the face's outline: down each end, along the foot
  const first = SAMPLES[0], last = SAMPLES[SAMPLES.length - 1];
  const edge = path([at([first.x, first.y, COLUMNS[0][0]]), at([first.x, first.y, -DEPTH])]) + path(SAMPLES.map((p) => at([p.x, p.y, -DEPTH]))) + path([at([last.x, last.y, -DEPTH]), at([last.x, last.y, COLUMNS[COLUMNS.length - 1][0]])]);
  out.push(k.lineSvg(edge, { tone: "mid" }));
  return out.join("");
}

// ── The top: the sea over the whole tile, the land over that ─────────────────
const COAST_SEA = W.COAST.map(([x, y]) => [x, y]);
// the land: the coast, then the tile's outline round the west side back to it
const LAND = (() => {
  const west = RING.filter(([x, y]) => x < W.coastX(y) - 1);
  // roundedPlan starts at the north-east corner and runs clockwise; after the
  // coast reaches the south edge, carry on round the south-west and north-west corners
  const south = west.filter(([, y]) => y > TILE.d / 2), north = west.filter(([, y]) => y <= TILE.d / 2);
  return [...COAST_SEA, ...south, ...north];
})();

function top() {
  const out = [];
  const sea = flat(RING, SEA_LEVEL);
  out.push(`<path class="il-sea" d="${path(sea, true)}"/>`);
  // shallows: a lighter band along the shore
  const shallow = [...W.COAST.map(([x, y]) => [x + 2, y]), ...W.COAST.map(([x, y]) => [x + 34 + 8 * Math.sin(y / 40), y]).reverse()];
  out.push(`<path class="il-shallow" d="${path(flat(shallow, SEA_LEVEL), true)}"/>`);
  out.push(`<path class="il-land" d="${path(flat(LAND), true)}"/>`);
  return out.join("");
}

// Fields: a jittered grid over the land, each a crop, divided by hedges.
function fields() {
  const CW = 52, CD = 40, cols = Math.ceil(TILE.w / CW) + 1, rows = Math.ceil(TILE.d / CD) + 1;
  const jitter = (i, j) => {
    const r = W.seeded(i * 131 + j * 977 + 5);
    return [i * CW + (i && i < cols ? (r() - 0.5) * 22 : 0), j * CD + (j && j < rows ? (r() - 0.5) * 18 : 0)];
  };
  const V = [];
  for (let j = 0; j <= rows; j++) { V.push([]); for (let i = 0; i <= cols; i++) V[j].push(jitter(i, j)); }
  const crops = { pasture: [], grass: [], wheat: [], barley: [], rape: [], plough: [] };
  const choose = (r) => (r < 0.32 ? "pasture" : r < 0.55 ? "grass" : r < 0.7 ? "wheat" : r < 0.82 ? "barley" : r < 0.88 ? "rape" : "plough");
  const rows3 = [];
  const hedges = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cell = [V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]];
    const cx = cell.reduce((s, p) => s + p[0], 0) / 4, cy = cell.reduce((s, p) => s + p[1], 0) / 4;
    if (!W.onLand(cx - 10, cy)) continue;
    const crop = choose(W.seeded(i * 71 + j * 313)());
    crops[crop].push(path(drape(cell, true), true));
    // crop rows in the arable fields, edge to edge across the field
    if (crop === "wheat" || crop === "barley" || crop === "plough") {
      const [a, b, c, d] = cell;
      for (let f = 0.14; f < 0.95; f += 0.16) rows3.push(path(drape([[a[0] + (d[0] - a[0]) * f, a[1] + (d[1] - a[1]) * f], [b[0] + (c[0] - b[0]) * f, b[1] + (c[1] - b[1]) * f]])));
    }
    hedges.push(path(drape([cell[1], cell[2], cell[3]])));
  }
  const clip = `<clipPath id="il-land-clip"><path d="${path(flat(LAND), true)}"/></clipPath>`;
  return `<defs>${clip}</defs><g clip-path="url(#il-land-clip)">` +
    Object.entries(crops).map(([crop, ds]) => `<path class="il-field" data-crop="${crop}" d="${ds.join("")}"/>`).join("") +
    `<path class="il-furrow" d="${rows3.join("")}"/><path class="il-hedge" d="${hedges.join("")}"/></g>`;
}

// A ribbon either side of a centre line, `width(t)` wide.
function ribbon(line, width, z = 0) {
  const left = [], right = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = width(i / (line.length - 1)) / 2;
    left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
    right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
  });
  return { left, right, outline: [...left, ...right.reverse()] };
}

function river() {
  const r = ribbon(W.RIVER, W.riverWidth);
  const banks = path(flat(r.left)) + path(flat(r.right));
  return `<path class="il-river" d="${path(flat(r.outline, SEA_LEVEL), true)}"/>` +
    `<path class="il-bank" d="${path(flat(r.outline, 0), true)}"/>` + k.lineSvg(banks, { tone: "lo", className: "il-bank-line" });
}

const ROAD_LINES = Object.fromEntries(Object.entries(W.ROADS).map(([name, pts]) => [name, W.smoothLine(pts, 5)]));
function roads() {
  const body = [], marks = [];
  for (const [name, line] of Object.entries(ROAD_LINES)) {
    const r = ribbon(line, () => W.ROAD_WIDTH[name]);
    body.push(path(drape(r.outline, true), true));
    if (W.ROAD_WIDTH[name] >= 7) marks.push(path(drape(line)));
  }
  return `<path class="il-road" d="${body.join("")}"/><path class="il-road-mark" d="${marks.join("")}"/>`;
}

// The shore: a beach along the coast, the low cliff where the land steps down
// to the sea, and the surf.
function shore() {
  const beach = [...W.COAST, ...W.COAST.map(([x, y]) => [x - 10 - 4 * Math.sin(y / 31), y]).reverse()];
  const cliffs = [];
  for (let i = 0; i < W.COAST.length - 1; i++) {
    const [ax, ay] = W.COAST[i], [bx, by] = W.COAST[i + 1];
    const n = [by - ay, -(bx - ax)]; // the coast runs south, so this points out to sea
    if (n[0] * TOWARD[0] + n[1] * TOWARD[1] <= 0) continue;
    cliffs.push(path([at([ax, ay, 0]), at([bx, by, 0]), at([bx, by, SEA_LEVEL]), at([ax, ay, SEA_LEVEL])], true));
  }
  const surf = W.COAST.map(([x, y]) => [x + 5 + 1.5 * Math.sin(y / 9), y]);
  return `<path class="il-beach" d="${path(flat(beach), true)}"/><path class="il-cliff" d="${cliffs.join("")}"/>` +
    `<path class="il-surf" d="${path(flat(surf, SEA_LEVEL))}"/>`;
}

// The top's outline: the tile's rim at the height of whatever meets it.
function rim() {
  const pts = RING.map(([x, y], i) => {
    const s = 0;
    return at([x, y, column(x, y, s)[0]]);
  });
  return k.lineSvg(path(pts, true), { tone: "mid", className: "il-rim" });
}

// ── Everything that stands on the ground, painted back to front ──────────────
const parts = makeParts({ k, G, W, P, at, flat, path, ribbon, drape, roads: ROAD_LINES, random: W.seeded(29), makeRotor });

// ── Styles ──────────────────────────────────────────────────────────────────
// The daylight palette of the cards' colour versions: white steel, a deep sea
// under a hazy sky. Each material shades by facing with the white's own ratios,
// as the wake card's ancillary parts do.
const DAYLIGHT = `--anatomy-paper:#f2f4f5;--anatomy-face:#f2f4f5;
--anatomy-shade-0:#8592a0;--anatomy-shade-1:#a6b1bc;--anatomy-shade-2:#c6cfd7;--anatomy-shade-3:#dde3e8;--anatomy-top:#f7f9fa;
--anatomy-hi:#4f5d6a;--anatomy-mid:#6f7c88;--anatomy-lo:#929ea9;--anatomy-faint:#b4bec7;--anatomy-lit:#f5b301;--anatomy-dot:#56646f`;
const SCENE_CSS = [
  `.il-layer[data-layer="water"]{fill:#3d79aa}`,
  `.il-layer[data-layer="grass"]{fill:#7ea65a}`,
  `.il-layer[data-layer="topsoil"]{fill:#6f5238}`,
  `.il-layer[data-layer="subsoil"]{fill:#9e7a52}`,
  `.il-layer[data-layer="sediment"]{fill:#d4c193}`,
  `.il-layer[data-layer="sandstone"]{fill:#c9a36d}`,
  `.il-layer[data-layer="mudstone"]{fill:#8e8679}`,
  `.il-layer[data-layer="limestone"]{fill:#ddd3bd}`,
  `.il-layer[data-layer="granite"]{fill:#a9978c}`,
  `.il-bed{fill:none;stroke:#6f685e;stroke-width:.5;opacity:.55}`,
  `.il-face-shade{stroke:none;fill:#14212c}`,
  `.il-face-shade[data-shade="0"]{opacity:.3}`, `.il-face-shade[data-shade="1"]{opacity:.2}`, `.il-face-shade[data-shade="2"]{opacity:.1}`, `.il-face-shade[data-shade="3"]{opacity:0}`,
  `.il-sea{fill:url(#il-sea-g)}`,
  `.il-shallow{fill:#7fb2d6;opacity:.55}`,
  `.il-land{fill:#93b56c}`,
  `.il-field[data-crop="pasture"]{fill:#8db365}`, `.il-field[data-crop="grass"]{fill:#a2c179}`, `.il-field[data-crop="wheat"]{fill:#d8c784}`,
  `.il-field[data-crop="barley"]{fill:#c9c27c}`, `.il-field[data-crop="rape"]{fill:#e2cf55}`, `.il-field[data-crop="plough"]{fill:#a8865f}`,
  `.il-furrow{fill:none;stroke:#7c6a45;stroke-width:.35;opacity:.35}`,
  `.il-hedge{fill:none;stroke:#5e8746;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}`,
  `.il-river{fill:#5b93c1}`, `.il-bank{fill:none}`, `.il-bank-line{stroke:#c7b48a}`,
  `.il-road{fill:#868b90}`, `.il-road-mark{fill:none;stroke:#eef0f1;stroke-width:.45;stroke-dasharray:2 3;opacity:.85}`,
  `.il-beach{fill:#e3d3a8}`, `.il-cliff{fill:#c7b083}`, `.il-surf{fill:none;stroke:#f4f8fb;stroke-width:.8;opacity:.8}`,
  ...parts.css,
];
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots|halo)/.test(line) && !line.includes("[data-lit]"));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const css = `${SCOPE}{${DAYLIGHT};--anatomy-weight:.6px;--anatomy-halo:#5b6b4a;--anatomy-halo-opacity:.28}` + [...KIT, ...SCENE_CSS, ...parts.mats].map(scope).join("");

// straight-segment paths rewritten in relative steps: the same picture in fewer bytes
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
    if (move) { out += "m"; sx = x; sy = y; }
    out = join(join(out, r(x - cx)), r(y - cy));
    cx = x; cy = y; move = false;
  }
  return out;
}
const compact = (markup) => markup.replace(/ d="([MLZ0-9.\s-]+)"/g, (_, d) => ` d="${relative(d)}"`);

const defs = `<defs>${grainDefs}<linearGradient id="il-sea-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b88ba"/><stop offset="1" stop-color="#2a6798"/></linearGradient></defs>`;
const body = [defs, `<g class="il-ground">`, faces(), top(), fields(), river(), shore(), roads(), rim(), `</g>`, parts.ground, `<g class="il-things">`, parts.things, `</g>`, parts.over].join("");
const label = "An isometric island of the GB power system: nuclear and gas stations, onshore and offshore wind, solar, a battery, geothermal, the grid, towns with electric cars, and the rock beneath";
const svg = compact(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" class="island-svg" role="img" aria-label="${label}"><style>${css}</style>${body}</svg>`);

// ── Live ────────────────────────────────────────────────────────────────────
// For now the island only says where it is: the projection, so the page can set
// its sections in the same plane.
const ISLAND = { width: WIDTH, height: HEIGHT, projection: P, tile: TILE, depth: DEPTH };
const live = `// Generated by figures/island/build.mjs: the homepage island. Edit the build, not this file.
export const ISLAND = ${JSON.stringify(ISLAND)};
export function mount(stage) {
  return { stage };
}
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "island.svg"), svg);
writeFileSync(join(OUT, "island.js"), live);

// ── Preview: the island alone, as the hero shows it ─────────────────────────
const preview = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Island</title>
<style>html,body{margin:0;height:100%;background:#fff}body.dark{background:#000}.island-scene{position:fixed;inset:0}.island-scene svg{display:block;width:100%;height:100%}</style>
</head><body><div class="island-scene"></div>
<script type="module">
const q = new URLSearchParams(location.search);
if (q.has("dark")) document.body.classList.add("dark");
const scene = document.querySelector(".island-scene");
scene.insertAdjacentHTML("beforeend", await (await fetch("../../staticfiles/image/island/island.svg")).text());
const { mount } = await import("../../staticfiles/image/island/island.js");
mount(scene);
window.ready = true;
</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview);

const kb = (n) => (n / 1024).toFixed(0) + " KB";
const { gzipSync } = await import("node:zlib");
console.log(`island.svg ${kb(svg.length)} (${kb(gzipSync(svg).length)} gzipped) · island.js ${kb(live.length)} · scale ${G.scaleOf(P).toFixed(3)} px/m`);

// ── --check: the preview rendered to a PNG ──────────────────────────────────
if (process.argv.includes("--check")) {
  const { createRequire } = await import("node:module");
  const { createServer } = await import("node:http");
  const { extname } = await import("node:path");
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => {
    const file = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch();
  const zoom = Number(process.argv[process.argv.indexOf("--zoom") + 1]) || 1;
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: zoom });
  await page.goto(`http://127.0.0.1:${server.address().port}/figures/island/preview.html`);
  await page.waitForFunction(() => window.ready);
  await page.screenshot({ path: join(HERE, "check.png") });
  await browser.close();
  server.close();
  console.log("check.png");
}
