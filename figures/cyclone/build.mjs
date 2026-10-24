// The card for "Probabilistic Forecasting of Renewable Generation & Wholesale
// Prices with Quantile-Regression": a tropical cyclone seen from straight above,
// turning anticlockwise as it crosses an arid coast. The ground is SVG relief
// (land.mjs); the cloud is a WebGL layer (cloud.mjs) over it, with a baked image
// of the same shader as the SVG's own cloud when WebGL is missing.
// Run: node build.mjs        scene.svg + scene.js in staticfiles/image/thumbnails/cyclone,
//                            preview.html and bake.html beside this file
//      node bake.mjs         renders bake.html to fallback.webp, then rebuild
//      --colour              on both: the daylight paint (paint.mjs), every name with -colour
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./model.mjs";
import { landSvg } from "./land.mjs";
import { paintedFragment } from "./cloud.mjs";
import { PAINT } from "./paint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../../staticfiles/image/thumbnails/cyclone");
const SCOPE = ".scene-cyclone";
const WIDTH = 1400, HEIGHT = 200;
// the baked cloud: a square of side 2·HALF units round the eye, at BAKE px a unit
const HALF = 240, BAKE = 0.8, BAKED = { strength: 0.95, age: 50 };

const paint = PAINT[process.argv.includes("--colour") ? "colour" : "navy"];
const FRAGMENT = paintedFragment(paint.cloud);
const named = (name, ext) => `${name}${paint.suffix}.${ext}`;
const land = landSvg();

// ── The cloud without WebGL: the baked shader frame, turned and moved ───────
const webp = join(HERE, named("fallback", "webp"));
const atRest = M.stormsAt(M.STILL);
const place = (s) => `translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${(-s.spin * 180 / Math.PI).toFixed(2)}) scale(${s.size.toFixed(3)}) translate(${-HALF} ${-HALF})`;
const fallback = existsSync(webp)
  ? `<defs><image id="cy-cloud" width="${2 * HALF}" height="${2 * HALF}" href="data:image/webp;base64,${readFileSync(webp).toString("base64")}"/></defs>` +
    `<g class="cy-fallback">${atRest.map((s) => `<use href="#cy-cloud" transform="${place(s)}" style="opacity:${s.visible.toFixed(3)}"/>`).join("")}</g>`
  : "";
if (!fallback) console.warn(`no ${named("fallback", "webp")} yet: run node bake.mjs${paint.suffix && " --colour"}, then build again`);

// ── Styles: the paint's tokens and the ground's own tints ───────────────────
const { ground: g, lines: l } = paint;
const SCENE_CSS = [
  `.cy-sea{${g.sea}}`,
  ...g.shelf.map((c, n) => `.cy-shelf[data-n="${n}"]{fill:${c}}`),
  `.cy-swell{${g.swell}}`, ...g.swellOpacity.map((o, n) => `.cy-swell[data-n="${n}"]{opacity:${o}}`),
  ...g.terrace.map((c, n) => `.cy-terrace[data-n="${n}"]{fill:${c}}`),
  `.cy-dark{${g.dark}}`, `.cy-rim{${g.rim}}`,
  `.cy-wadi{${g.wadi}}`, `.cy-fan{${g.fan}}`,
  `.cy-hach-dark{${g.hachDark}}`, `.cy-hach-lit{${g.hachLit}}`,
  `.cy-dune-dark{${g.duneDark}}`, `.cy-dune-lit{${g.duneLit}}`,
  `.iso-line{fill:none;stroke-linecap:round;stroke-linejoin:round}`,
  `.cy-coast{${l.coast}}`, `.cy-surf{${l.surf}}`, `.cy-index{${l.index}}`,
  `.cy-gl{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 1.2s ease}`,
  `.in .cy-gl{opacity:1}`,
  `[data-gl] .cy-fallback{display:none}`,
];
// states of the scene element itself (.in, [data-gl]) attach to the scope; the rest descend from it
const scope = (rule) => rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => (/^(\.in |\[)/.test(x) ? SCOPE + x : `${SCOPE} ${x}`)).join(","));
const css = `${SCOPE}{${paint.tokens}}` + SCENE_CSS.map(scope).join("");

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
const svg = compact(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style><defs>${land.defs}</defs>${land.body}${fallback}</svg>`);

// ── Live ────────────────────────────────────────────────────────────────────
const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const GL_SETUP = `
function webgl(stage) {
  const canvas = document.createElement("canvas");
  canvas.className = "cy-gl";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  gl.getExtension("OES_standard_derivatives");
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  try {
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) { console.error("cyclone shader:", error.message); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const at = Object.fromEntries(["uMap", "uA", "uB", "uL", "uK", "uShadow"].map((n) => [n, gl.getUniformLocation(program, n)]));
  return { canvas, gl, at };
}`;
const live = `// Generated by figures/cyclone/build.mjs: turns the cyclone in the post card and
// moves it over the coast. Edit the build, not this file.
${model}
const FRAGMENT = ${JSON.stringify(FRAGMENT)};
${GL_SETUP}
const HALF = ${HALF};
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const uses = [...svg.querySelectorAll(".cy-fallback use")];
const r3 = (v) => Math.round(v * 1000) / 1000;
const layer = webgl(stage);
if (layer) { stage.appendChild(layer.canvas); stage.setAttribute("data-gl", ""); }
let map = [1, 0, -1, 0];
function size() {
  if (!layer) return;
  const { width: w, height: h } = stage.getBoundingClientRect();
  const ratio = Math.min(1.5, devicePixelRatio || 1);
  const c = layer.canvas;
  c.width = Math.max(1, Math.round(w * ratio));
  c.height = Math.max(1, Math.round(h * ratio));
  // the SVG is xMaxYMax slice: scale s, flush right and bottom
  const s = Math.max(w / ${WIDTH}, h / ${HEIGHT}), ox = w - ${WIDTH} * s, oy = h - ${HEIGHT} * s;
  const rx = c.width / w, ry = c.height / h;
  map = [1 / (rx * s), -ox / s, -1 / (ry * s), (h - oy) / s];
  layer.gl.viewport(0, 0, c.width, c.height);
}
function draw(t) {
  const [a, b] = stormsAt(t);
  if (layer) {
    const { gl, at } = layer;
    gl.uniform4fv(at.uMap, map);
    gl.uniform4f(at.uA, a.x, a.y, a.spin, a.strength);
    gl.uniform4f(at.uB, b.x, b.y, b.spin, b.strength);
    gl.uniform4f(at.uL, a.age, a.visible, b.age, b.visible);
    gl.uniform2f(at.uK, a.size, b.size);
    gl.uniform1f(at.uShadow, ${paint.cloud.shadow});
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return;
  }
  [a, b].forEach((s, n) => {
    uses[n].setAttribute("transform", "translate(" + r3(s.x) + " " + r3(s.y) + ") rotate(" + r3(-s.spin * 180 / Math.PI) + ") scale(" + r3(s.size) + ") translate(" + -HALF + " " + -HALF + ")");
    uses[n].style.opacity = r3(s.visible);
  });
}
const START = Number(stage.dataset.at ?? 50);
const frozen = still.matches || "frozen" in stage.dataset;
const GAP = 1000 / 30 - 2;
let frame = 0, visible = false, t0 = 0, last = -Infinity, clock = frozen && !("at" in stage.dataset) ? STILL : START;
function tick(now) {
  if (!t0) t0 = now - (clock - START) * 1000;
  if (now - last >= GAP) { last = now; clock = START + (now - t0) / 1000; draw(clock % PERIOD); }
  frame = visible && !frozen ? requestAnimationFrame(tick) : 0;
}
size();
draw(clock);
if (layer) new ResizeObserver(() => { size(); draw(clock % PERIOD); }).observe(stage);
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible && !frame && !frozen) { t0 = 0; last = -Infinity; frame = requestAnimationFrame(tick); }
}, { rootMargin: "120px 0px" }).observe(stage);
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, named("scene", "svg")), svg);
writeFileSync(join(OUT, named("scene", "js")), live);

// ── Preview: the card as the homepage draws it ──────────────────────────────
// ?raw drops the fade and the text, ?land the cloud too, ?at=<s> starts the loop there, ?frozen holds it.
const TITLE = "Probabilistic Forecasting of Renewable Generation &amp; Wholesale Prices with Quantile-Regression";
const preview = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cyclone card</title>
<style>
body{margin:0;background:#fff;font-family:Quicksand,system-ui,sans-serif}
.wrap{max-width:1140px;margin:24px auto;padding:0 15px}
.card{position:relative;height:160px;overflow:hidden;border:1px solid rgba(0,0,0,.125);border-radius:4px;display:flex}
.scene-card{background:${paint.card}}
.card-scene{position:absolute;inset:0}
.card-scene svg{display:block;width:100%;height:100%;opacity:0;transition:opacity 1.2s ease}
.card-scene.in svg{opacity:1}
.scene-card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,.2),white 80%)}
.raw .scene-card::after,.raw .block{display:none}
.land .cy-gl,.land .cy-fallback{display:none}
.block{position:relative;z-index:2;margin:auto 15px}
h2{color:#717171;font-weight:500;font-size:2rem;margin:0 0 .4rem;text-decoration:underline;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:1rem;margin:0 0 .3rem}
.text{color:#000;font-size:1rem;margin:0}
</style></head><body><div class="wrap"><div class="card scene-card iso-plate"><div class="card-scene scene-cyclone" aria-hidden="true">${svg}</div>
<div class="block"><h2>${TITLE}</h2><p class="date">Jun 15, 2022</p><p class="text">With the 2022 UK energy security strategy anticipating to further accelerate the development of offshore wind capacity to 50GW by 2030, alongside solar capacity potentially</p></div></div></div>
<script>
const q = new URLSearchParams(location.search), st = document.querySelector(".scene-cyclone");
if (q.has("raw")) document.body.classList.add("raw");
if (q.has("land")) document.body.classList.add("land", "raw");
if (q.has("at")) st.dataset.at = q.get("at");
if (q.has("frozen")) st.dataset.frozen = "";
</script>
<script type="module">${live}
requestAnimationFrame(() => stage.classList.add("in"));</script></body></html>`;
writeFileSync(join(HERE, named("preview", "html")), preview);

// ── Bake: one storm in its own square, for the fallback image ───────────────
const bake = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000}canvas{display:block}</style></head><body>
<div class="scene-cyclone"><svg></svg></div>
<script>
const FRAGMENT = ${JSON.stringify(FRAGMENT)};
${GL_SETUP}
const layer = webgl(document.querySelector(".scene-cyclone"));
const px = ${2 * HALF * BAKE};
layer.canvas.width = layer.canvas.height = px;
layer.canvas.className = "";
document.body.appendChild(layer.canvas);
const { gl, at } = layer;
gl.viewport(0, 0, px, px);
gl.uniform4f(at.uMap, ${1 / BAKE}, 0, ${-1 / BAKE}, ${2 * HALF});
gl.uniform4f(at.uA, ${HALF}, ${HALF}, 0, ${BAKED.strength});
gl.uniform4f(at.uB, 0, 0, 0, 0);
gl.uniform4f(at.uL, ${BAKED.age}, 1, 0, 0);
gl.uniform2f(at.uK, 1, 1);
gl.uniform1f(at.uShadow, 0);
gl.drawArrays(gl.TRIANGLES, 0, 3);
window.baked = layer.canvas.toDataURL("image/png");
</script></body></html>`;
writeFileSync(join(HERE, named("bake", "html")), bake);
console.log(named("scene", "svg"), (svg.length / 1024).toFixed(0) + " KB · " + named("scene", "js"), (live.length / 1024).toFixed(1) + " KB ·", JSON.stringify(land.stats));
