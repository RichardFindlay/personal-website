// The donder card: a fell seen from straight above as a contour map in
// donder's own teal-to-green, the contours running off every edge of the card.
// Every fifth is an index contour, drawn heavier as an OS map draws it, and the
// summit carries the map's trig-point triangle. A still drawing; no script.
// Run: node build.mjs   writes staticfiles/image/thumbnails/donder/scene-colour.svg
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../staticfiles/image/thumbnails/donder");
const SCOPE = ".scene-donder";
const RAD = Math.PI / 180;

// The card is portrait; the drawing is its size in viewBox units, and the
// field runs a margin past each edge so every contour leaves the card cleanly.
const VIEW = { width: 400, height: 500, margin: 40 };
// donder's own gradient, as its site draws it: 120deg, teal into pale green
const TEAL = "#07a3b2", PALE = "#d9ecc7";

// ── The ground: a main summit low and right of centre, a shoulder off to its
// left, a lower top on the left and a knoll on the right, both kept below the
// card's words so the ground under them is open, and a rise of the whole slope
// toward the bottom ───────────────────────────────────
const bump = (x, y, cx, cy, sx, sy, turn) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  const u = ((x - cx) * c + (y - cy) * s) / sx, v = (-(x - cx) * s + (y - cy) * c) / sy;
  return Math.exp(-(u * u + v * v) / 2);
};
const wrinkle = (x, y) => 0.03 * Math.sin(x * 0.045 + 1.3) * Math.cos(y * 0.038 - 0.4) + 0.02 * Math.sin((x + y) * 0.07 + 2.1);
const SUMMIT = [268, 330];
const field = (x, y) =>
  1.0 * bump(x, y, ...SUMMIT, 78, 58, 28 * RAD) +
  0.58 * bump(x, y, 120, 372, 66, 44, -18 * RAD) +
  0.5 * bump(x, y, 78, 196, 70, 52, 12 * RAD) +
  0.32 * bump(x, y, 360, 178, 46, 38, 0) +
  0.12 * (y / VIEW.height) +
  wrinkle(x, y);

const STEP = 2.5;
const LEVELS = 24;
const [x0, y0, x1, y1] = [-VIEW.margin, -VIEW.margin, VIEW.width + VIEW.margin, VIEW.height + VIEW.margin];
const cols = Math.ceil((x1 - x0) / STEP), rows = Math.ceil((y1 - y0) / STEP);
const at = (i, j) => field(x0 + i * STEP, y0 + j * STEP);
let low = Infinity, high = -Infinity, peak = SUMMIT;
for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
  const h = at(i, j);
  low = Math.min(low, h);
  if (h > high) { high = h; peak = [x0 + i * STEP, y0 + j * STEP]; }
}
const levelOf = (k) => low + ((k + 1) / (LEVELS + 1)) * (high - low);

// ── Contours by marching squares, joined into lines: closed rings round the
// tops, and open lines that run off the drawing's edges ──────────────────────
function linesAt(level) {
  const cross = (a, b) => {
    const [ha, hb] = [at(...a), at(...b)], t = (level - ha) / (hb - ha);
    return [x0 + (a[0] + (b[0] - a[0]) * t) * STEP, y0 + (a[1] + (b[1] - a[1]) * t) * STEP];
  };
  const segments = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const up = corners.map((c) => at(...c) >= level);
    const hit = [0, 1, 2, 3].filter((e) => up[e] !== up[(e + 1) % 4]).map((e) => cross(corners[e], corners[(e + 1) % 4]));
    if (hit.length === 2) segments.push(hit);
    if (hit.length === 4) segments.push([hit[0], hit[1]], [hit[2], hit[3]]);
  }
  const key = ([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`;
  const ends = new Map();
  segments.forEach((s, n) => s.forEach((p) => ends.set(key(p), [...(ends.get(key(p)) || []), n])));
  const loose = (n) => segments[n].some((p) => ends.get(key(p)).length === 1);
  // start from a loose end where there is one, so an open line comes out whole
  const order = segments.map((_, n) => n).sort((a, b) => loose(b) - loose(a));
  const used = new Set(), lines = [];
  for (const start of order) {
    if (used.has(start)) continue;
    used.add(start);
    let [head, tail] = segments[start];
    if (ends.get(key(tail)).length === 1) [head, tail] = [tail, head];
    const line = [head, tail];
    for (;;) {
      const next = ends.get(key(tail)).find((m) => !used.has(m));
      if (next === undefined) break;
      used.add(next);
      tail = key(segments[next][0]) === key(tail) ? segments[next][1] : segments[next][0];
      line.push(tail);
    }
    const closed = key(line[0]) === key(line[line.length - 1]);
    if (line.length > 6) lines.push({ points: smooth(line, closed), closed });
  }
  return lines;
}
// Chaikin twice, keeping an open line's two ends where they leave the drawing
function smooth(line, closed) {
  let pts = line.filter((_, i) => i % 2 === 0 || i === line.length - 1);
  for (let pass = 0; pass < 2; pass++) {
    const out = closed ? [] : [pts[0]];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    if (!closed) out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

const f1 = (n) => +n.toFixed(1);
const pathOf = ({ points, closed }) => "M" + points.map((p) => `${f1(p[0])} ${f1(p[1])}`).join("L") + (closed ? "Z" : "");
const contours = Array.from({ length: LEVELS }, (_, k) => {
  const d = linesAt(levelOf(k)).map(pathOf).join("");
  return d ? `<path class="${(k + 1) % 5 === 0 ? "dn-index" : "dn-contour"}" d="${d}"/>` : "";
}).join("");

// The OS map's trig point: a triangle with a dot at its centre, on the summit.
const TRIG = 6;
const trig = (() => {
  const [cx, cy] = peak;
  const corners = [0, 120, 240].map((a) => [cx + TRIG * Math.sin(a * RAD), cy - TRIG * Math.cos(a * RAD)]);
  return `<path class="dn-trig" d="${pathOf({ points: corners, closed: true })}"/><circle class="dn-trig-dot" cx="${f1(cx)}" cy="${f1(cy)}" r="1.3"/>`;
})();

const css = [
  `${SCOPE} .dn-contour,${SCOPE} .dn-index{fill:none;stroke:#fff;stroke-linejoin:round;stroke-linecap:round}`,
  `${SCOPE} .dn-contour{stroke-width:.8;stroke-opacity:.55}`,
  `${SCOPE} .dn-index{stroke-width:1.4;stroke-opacity:.8}`,
  `${SCOPE} .dn-trig{fill:none;stroke:#fff;stroke-width:1.3;stroke-linejoin:round}`,
  `${SCOPE} .dn-trig-dot{fill:#fff}`,
].join("");
const GRADIENT = `<defs><linearGradient id="dn-ground" gradientUnits="userSpaceOnUse" gradientTransform="rotate(30 ${VIEW.width / 2} ${VIEW.height / 2})" x1="${-VIEW.width * 0.25}" y1="0" x2="${VIEW.width * 1.25}" y2="0"><stop offset="20.08%" stop-color="${TEAL}"/><stop offset="80.96%" stop-color="${PALE}"/></linearGradient></defs>`;
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.width} ${VIEW.height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><style>${css}</style>${GRADIENT}` +
  `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#dn-ground)"/>${contours}${trig}</svg>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "scene-colour.svg"), markup);

// ── The preview: the card as the homepage draws it ───────────────────────────
const preview = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>donder card</title>
<style>body{margin:0;padding:24px;background:#bccbd0;font-family:Inter,system-ui,sans-serif}.card{position:relative;width:400px;aspect-ratio:4/5;overflow:hidden;border-radius:6px;background:linear-gradient(120deg,${TEAL} 20.08%,${PALE} 80.96%)}
${SCOPE}{position:absolute;inset:0}${SCOPE} svg{display:block;width:100%;height:100%}
.text{position:relative;padding:20px 22px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:6px}.label{font:11px/1 monospace;letter-spacing:.08em;opacity:.82}.title{font-size:22px;font-weight:600}.blurb{font-size:13px;opacity:.88}</style></head><body>
<div class="card"><div class="${SCOPE.slice(1)}" aria-hidden="true">${markup}</div><div class="text"><span class="label">DONDER.CO.UK</span><span class="title">donder</span><span class="blurb">A hill-walking journal for logging ascents of UK and Irish peaks</span></div></div>
</body></html>`;
writeFileSync(join(HERE, "preview-colour.html"), preview);
console.log(`scene-colour.svg ${(markup.length / 1024).toFixed(0)} KB · ${LEVELS} contours`);
