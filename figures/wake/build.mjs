// The thumbnail for "Reinforcement Learning for Offshore Wind Farm Optimisation":
// one NREL 5 MW turbine close up, seen from above and downwind of its nacelle.
// The post's Q-learning agent yaws it in 5° actions out to the 25° the upstream
// turbine settles at and back, the pointer on the yaw deck stepping along the
// tower-top scale, while the rotor turns at the speed the wind across its disc
// drives it. True perspective; one unit is a metre.
// Run: node build.mjs            writes staticfiles/image/thumbnails/wake/scene.svg
//                                and scene.js, and the preview pages beside this file
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = { rotor: join(HERE, "rotor.mjs"), camera: join(HERE, "camera.mjs"), model: join(HERE, "model.mjs"), turbine: join(HERE, "turbine.mjs") };
const { makeRotor } = await import(FILES.rotor);
const { lookFrom, persp } = await import(FILES.camera);
const M = await import(FILES.model);
const { makeTurbine } = await import(FILES.turbine);
const OUT = join(HERE, "../../staticfiles/image/thumbnails/wake");
const SCOPE = ".scene-wake";

const RAD = Math.PI / 180;
const add3 = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub3 = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const mul3 = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const unit3 = (p) => mul3(p, 1 / (Math.hypot(p[0], p[1], p[2]) || 1));

// ── The camera: above and downwind of the nacelle, looking down on it ───────
// From the north-east the rotor sits beyond the nacelle at the strip's right
// edge and the agent's positive yaw swings the canopy's tail toward the camera
// while the disc closes toward edge-on. A shifted frame puts the yaw deck (sx)
// in the right of the strip with navy clear of the helihoist railings; a phone
// card shows only the strip's right end, so there the drawing slides right to
// phoneSx, out of the heaviest fade. WAKE_VIEW='{"bearing":30}' tries another camera.
const VIEW = { width: 1400, height: 200, bearing: -62, elevation: 48, distance: 90, focal: 1100, target: [0, 0, 89], sx: 1130, phoneSx: 1200, sy: 90, fps: 30, ...JSON.parse(process.env.WAKE_VIEW || "{}") };
const WIDTH = VIEW.width, HEIGHT = VIEW.height;
const toEye = [Math.cos(VIEW.elevation * RAD) * Math.cos(VIEW.bearing * RAD), Math.cos(VIEW.elevation * RAD) * Math.sin(VIEW.bearing * RAD), Math.sin(VIEW.elevation * RAD)];
const EYE = add3(VIEW.target, mul3(toEye, VIEW.distance));
const CAM = lookFrom(EYE, Math.atan2(-toEye[1], -toEye[0]), -VIEW.elevation * RAD, VIEW.focal, VIEW.sx, VIEW.sy);
const at = (p) => persp(p, CAM);
const depth = (p) => dot3(sub3(p, EYE), CAM.fwd);
const L = unit3([Math.cos(250 * RAD) * 0.77, Math.sin(250 * RAD) * 0.77, 0.64]); // the ohmera card's sun
const BANDS = [0, 0.2, 0.42, 0.62];
const fastPath = (pts, closed = false) => { let d = ""; for (let i = 0; i < pts.length; i++) d += (i ? "L" : "M") + Math.round(pts[i][0] * 10) / 10 + " " + Math.round(pts[i][1] * 10) / 10; return d && closed ? d + "Z" : d; };
const ctx = { P: CAM, iso: persp, pathOf: k.pathOf, V: [0, 0, 1], L, BANDS, eye: EYE };
const TB = makeTurbine({ ...ctx, makeRotor });
const ROTOR_DETAIL = { sections: 22, arc: 10, bisect: 10, facets: 8 };

// The camera stays downwind of the rotor's plane at every yaw the agent reaches,
// so the whole rotor is drawn before the tower and the nacelle.
for (let yaw = 0; yaw <= M.STEERED; yaw += 1) {
  const F = TB.frame(yaw);
  if (dot3(F.AX, sub3(EYE, F.hub)) >= 0) throw new Error(`the camera sees the rotor's face at ${yaw}°`);
}

// ── The fixed parts: the tower dropping away below the frame, its top flange ─
const T = { tp: 16, flange: 87.42, top: TB.N.top, r0: 3.0, r1: 1.94, flangeR: 2.8, gearR: 2.05, gearZ: TB.YAW.gearZ };
const sweep = makeRotor({ hub: [0, 0, 0], axis: [1, 0, 0], R: 1, rootR: 0, span: 1, sections: 1, arc: 12, bisect: 10 }, ctx).ribbon;
const ring = (C, r) => ({ C, u: [1, 0, 0], v: [0, 1, 0], hc: r, ht: r });
const solid = (paths, style = {}) => k.solidSvg({ ...paths, seamless: true }, style);
const column = (z0, z1, r0, r1 = r0) => sweep([ring([0, 0, z0], r0), ring([0, 0, z1], r1)], [0, 0, 1]);
const towerR = (z) => T.r0 + ((T.r1 - T.r0) * (z - T.tp)) / (T.flange - T.tp);
const toEyeAt = Math.atan2(EYE[1], EYE[0]);
// the half of a level ring round the tower that faces the camera
const halfRing = (r, z, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const f = toEyeAt - Math.PI / 2 + (Math.PI * i) / n; return [r * Math.cos(f), r * Math.sin(f), z]; });
const onRing = (deg, r, z) => [r * Math.cos(deg * RAD), r * Math.sin(deg * RAD), z];
const seenDeg = (deg) => Math.cos(deg * RAD - toEyeAt) > 0.05;

function tower() {
  const out = [];
  const seams = [76].map((z) => k.pathOf(halfRing(towerR(z) + 0.01, z).map(at))).join("");
  out.push(solid(column(T.tp, T.flange, T.r0, T.r1), { tone: "mid", inner: k.lineSvg(seams, { tone: "faint" }) }));
  // the tower-top flange: its bolt circle, and the yaw scale on its rim, 5° a tick
  out.push(solid(column(T.flange - 0.12, T.flange, T.r1 + 0.1, T.r1 + 0.1), { tone: "mid" }));
  out.push(solid(column(T.flange, T.top, T.flangeR), { tone: "mid" }));
  out.push(k.dotsSvg(Array.from({ length: 48 }, (_, n) => at(onRing(n * 7.5 + 3.75, 2.62, T.top))), { r: 0.42, tone: "mid" }));
  const zero = TB.frame(0).polar(TB.YAW.pointer, 1, 0), zeroDeg = Math.atan2(zero[1], zero[0]) / RAD;
  const tick = (deg, r0) => k.pathOf([at(onRing(deg, r0, T.top)), at(onRing(deg, T.flangeR, T.top))]);
  const ticks = { faint: [], lo: [], hi: [] };
  for (let n = 0; n < 72; n++) {
    const off = n * 5, deg = zeroDeg - off; // positive yaw turns the pointer clockwise seen from above
    if (off === 0) ticks.hi.push(tick(deg, 2.5));
    else if (off === M.STEERED) ticks.hi.push(tick(deg, 2.58));
    else if (off % 45 === 0) ticks.lo.push(tick(deg, 2.6));
    else ticks.faint.push(tick(deg, 2.7));
  }
  out.push(k.lineSvg(ticks.faint.join(""), { tone: "lo" }), k.lineSvg(ticks.lo.join(""), { tone: "mid" }), k.lineSvg(ticks.hi.join(""), { tone: "hi" }));
  // the yaw bearing's fixed gear ring, its teeth on the outside
  const teeth = Array.from({ length: 120 }, (_, n) => n * 3).filter(seenDeg).map((deg) => k.pathOf([at(onRing(deg, T.gearR + 0.005, T.top)), at(onRing(deg, T.gearR + 0.005, T.gearZ))])).join("");
  out.push(solid(column(T.top, T.gearZ, T.gearR), { tone: "mid", inner: k.lineSvg(teeth, { tone: "faint" }) }));
  return { body: out.join(""), zeroDeg };
}

// ── The rotor's slots: blades pointing away behind the spinner, toward in front ─
const rotorRest = makeRotor(TB.rotorSpec(0, ROTOR_DETAIL), ctx).pose(0);
const solidMarkup = (paths, slot) => `<g class="iso-solid" data-seamless="" data-slot="${slot}"><path class="iso-fill"${paths ? ` d="${paths.fill}"` : ""}/>${[0, 1, 2, 3].map((s) => `<path class="iso-shade" data-shade="${s}"${paths?.shades[s] ? ` d="${paths.shades[s]}"` : ""}/>`).join("")}<path class="iso-top"${paths?.top ? ` d="${paths.top}"` : ""}/><path class="iso-line iso-crease" data-tone="lo"/><path class="iso-line iso-edge" data-tone="hi"${paths ? ` d="${paths.outline}"` : ""}/></g>`;
const rotorLayer = (front) => [0, 1, 2].map((b) => {
  const pose = rotorRest[b], mine = pose.toward === front;
  const pair = [solidMarkup(mine ? pose.blade : null, `${front ? "f" : "b"}${b}blade`), solidMarkup(mine ? pose.collar : null, `${front ? "f" : "b"}${b}collar`)];
  return (front ? pair.reverse() : pair).join("");
}).join("");
const rotor = `<g data-rotor="">${rotorLayer(false)}${solidMarkup(TB.spinner(0), "spinner")}${rotorLayer(true)}</g>`;

const TW = tower();
const lights = TB.lights(0);
const svgBody = [`<g class="wk-frame">`, rotor, TW.body, `<g data-yawing="">${TB.yawing(0)}</g>`,
  `<g class="wk-beacon">${lights.map(([x, y], n) => `<circle data-light="${n}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1"/>`).join("")}</g>`, `</g>`].join("");

// ── Live ────────────────────────────────────────────────────────────────────
// the page inlines the shared modules without their exports, comments or indentation
const strip = (file) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*\n/gm, "").replace(/^\s+/gm, "").replace(/^export /gm, "");
const live = `
${strip(FILES.rotor)}
${strip(FILES.camera)}
${strip(FILES.model)}
${strip(FILES.turbine)}
const CAM = ${JSON.stringify(CAM)};
const fastPath = ${fastPath.toString()};
const CTX = { P: CAM, iso: persp, pathOf: fastPath, V: [0, 0, 1], L: ${JSON.stringify(L)}, BANDS: ${JSON.stringify(BANDS)}, eye: CAM.eye };
const TB = makeTurbine({ ...CTX, makeRotor });
const DETAIL = ${JSON.stringify(ROTOR_DETAIL)};
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const yawing = svg.querySelector("[data-yawing]");
const lights = [...svg.querySelectorAll("[data-light]")];
const slot = (name) => [...svg.querySelector('[data-slot="' + name + '"]').children];
const BLADES = [0, 1, 2].map((b) => ({ b: { blade: slot("b" + b + "blade"), collar: slot("b" + b + "collar") }, f: { blade: slot("f" + b + "blade"), collar: slot("f" + b + "collar") } }));
const SPINNER = slot("spinner");
const write = (els, paths) => {
  const values = paths ? [paths.fill, ...paths.shades, paths.top || "", paths.crease || "", paths.outline] : els.map(() => "");
  els.forEach((el, j) => { if (el.getAttribute("d") !== values[j]) el.setAttribute("d", values[j]); });
};
let yawShown = null, rotor = null, angle = 0;
function yawTo(yaw) {
  if (yawShown !== null && Math.abs(yaw - yawShown) < 0.01) return;
  yawShown = yaw;
  yawing.innerHTML = TB.yawing(yaw);
  TB.lights(yaw).forEach(([x, y], n) => { lights[n].setAttribute("cx", x.toFixed(1)); lights[n].setAttribute("cy", y.toFixed(1)); });
  write(SPINNER, TB.spinner(yaw));
  rotor = makeRotor(TB.rotorSpec(yaw, DETAIL), CTX);
}
function spin() {
  rotor.pose(angle).forEach((p, i) => {
    const mine = p.toward ? BLADES[i].f : BLADES[i].b, other = p.toward ? BLADES[i].b : BLADES[i].f;
    write(mine.blade, p.blade); write(mine.collar, p.collar);
    write(other.blade, null); write(other.collar, null);
  });
}
const GAP = ${Math.round(1000 / VIEW.fps) - 2};
let frame = 0, visible = false, last = -Infinity, clock = 0;
function draw(dt) {
  const yaw = yawAt(clock);
  yawTo(yaw);
  angle += dt * rpmAt(yaw) * Math.PI / 30;
  spin();
}
function tick(now) {
  if (now - last >= GAP) {
    const dt = Math.min(0.1, last < 0 ? 0 : (now - last) / 1000);
    last = now; clock += dt;
    draw(dt);
  }
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
// A still frame (reduced motion) holds the steered pose. The preview sets
// data-at (seconds into the loop) to show any moment. Each time the card comes
// back on screen the loop starts over, so the first action follows at once.
const START = stage.dataset.at ? Number(stage.dataset.at) : still.matches ? outboundAt(STEERED) + 1 : 0;
clock = START;
angle = 0.7;
draw(0);
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible && !frame && !still.matches && !stage.dataset.hold) { last = -Infinity; clock = START; frame = requestAnimationFrame(tick); }
}, { rootMargin: "120px 0px" }).observe(stage);
`;

// ── Styles: the ohmera.ai card's navy set, every rule scoped to the scene ───
const NAVY = `--anatomy-page:#050f17;--anatomy-card:#081722;--anatomy-paper:#081722;--anatomy-face:#0c1f2d;
--anatomy-shade-0:#040e17;--anatomy-shade-1:#061521;--anatomy-shade-2:#091b29;--anatomy-shade-3:#0c2131;--anatomy-top:#10283a;
--anatomy-lit-top:#163045;--anatomy-lit-shade:#12293b;
--anatomy-hi:#9fb2c2;--anatomy-mid:#5a7184;--anatomy-lo:#2f475a;--anatomy-faint:#1a3041;--anatomy-halo:#01070c;
--anatomy-text:#7f95a7;--anatomy-strong:#c9d6e0;--anatomy-muted:#566d80`;
const SCENE_CSS = `.wk-beacon circle{fill:#e0675e}
.wk-beacon{animation:wk-blink 2s steps(1) infinite}
@keyframes wk-blink{0%{opacity:1}30%,100%{opacity:.15}}`;
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const css = `${SCOPE}{${NAVY};--anatomy-lit:#c9d6e0;--anatomy-dot:#9fb2c2;--anatomy-weight:.6px}` + [...KIT, ...SCENE_CSS.split("\n")].map(scope).join("") +
  `@media (prefers-reduced-motion:reduce){${SCOPE} .wk-beacon{animation:none}}` +
  `@media (max-width:770px){${SCOPE} .wk-frame{transform:translate(${VIEW.phoneSx - VIEW.sx}px)}}`;
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${svgBody}</svg>`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "scene.svg"), markup);
const js = `// Generated by figures/wake/build.mjs: yaws the turbine through the agent's 5° actions and\n// turns its rotor on the reinforcement-learning post's card. Edit the build, not this file.\n${live}`;
writeFileSync(join(OUT, "scene.js"), js);

// ── The preview: the card as the homepage draws it ───────────────────────────
// ?at=<seconds> shows one moment of the loop; ?hold=1 keeps it there.
const preview = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css?family=Quicksand:400,500,700" rel="stylesheet">
<style>body{margin:0;padding:24px 15px;background:#fff;font-family:Quicksand,sans-serif}.card{position:relative;max-width:1110px;margin:0 auto 24px;height:160px;overflow:hidden;border-radius:4px;background:#081722}
.scene-wake{position:absolute;inset:0}.scene-wake svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,0.2),white 80%)}
.text{position:relative;z-index:2;padding:16px 15px}h2{margin:0 0 8px;color:#717171;font-weight:500;font-size:26px;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:14px;margin:0 0 6px}.blurb{font-size:13px;margin:0;max-width:60%}
@media (max-width:770px){h2{font-size:18px}.date{font-size:9px}.blurb{font-size:10px}}</style></head><body>
<div class="card" id="card"><div class="scene-wake"></div><div class="text"><h2>Reinforcement Learning for Offshore Wind Farm Optimisation</h2><p class="date">Apr 30, 2022</p><p class="blurb">Applying Q-Learning to Static &amp; Quasi-Dynamic Offshore Wind Farm Environments to Optimise Wake Steering Strategies</p></div></div>
<script type="module">
const q = new URLSearchParams(location.search);
const scene = document.querySelector(".scene-wake");
if (q.get("at") !== null) scene.dataset.at = q.get("at");
if (q.get("hold") !== null) scene.dataset.hold = "1";
const svg = await (await fetch("../../staticfiles/image/thumbnails/wake/scene.svg")).text();
scene.insertAdjacentHTML("beforeend", svg);
await import("../../staticfiles/image/thumbnails/wake/scene.js");
</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview);
// a bare strip, no fade, for reading the drawing itself
writeFileSync(join(HERE, "strip.html"), preview.replace(".card::after{", ".card::after{display:none;").replace('<div class="text">', '<div class="text" hidden>'));

console.log(`scene.svg ${(markup.length / 1024).toFixed(0)} KB · scene.js ${(js.length / 1024).toFixed(0)} KB`);
const scale = (p) => CAM.focal / depth(p);
for (const [name, p] of [["hub", TB.frame(0).hub], ["yaw deck", [0, 0, T.top]], ["tower base", [0, 0, T.tp]], ["sea at tower", [0, 0, 0]]]) console.log(`${name}: screen ${at(p).map((v) => v.toFixed(0)).join(",")}, ${scale(p).toFixed(2)} units/m`);
for (const yaw of [0, 25]) console.log(`yaw ${yaw}°: ${M.rpmAt(yaw).toFixed(2)} rpm`);
{
  let near = Infinity;
  for (const yaw of [0, M.STEERED]) for (let f = 0; f < 360; f += 5) {
    const F = TB.frame(yaw), side = [-F.AX[1], F.AX[0], 0];
    near = Math.min(near, depth(add3(F.hub, add3([0, 0, 63 * Math.cos(f * RAD)], mul3(side, 63 * Math.sin(f * RAD))))));
  }
  console.log(`nearest blade tip ${near.toFixed(1)} m in front of the camera`);
}
console.log(`loop ${M.LOOP_SECONDS.toFixed(1)} s; mid-step at ${(M.outboundAt(15) - M.LOOP.slew / 2).toFixed(2)} s; steered from ${M.outboundAt(25).toFixed(2)} s`);
