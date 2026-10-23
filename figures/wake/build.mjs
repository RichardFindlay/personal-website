// The thumbnail for "Reinforcement Learning for Offshore Wind Farm Optimisation":
// the post's three-turbine FLORIS row at sea, seen from 200 m up and downwind of
// it. The two upstream turbines yaw in the agents' 5° steps and their wakes, laid
// on the sea as the hub-height deficit contours FLORIS plots, swing aside so the
// turbine behind them stands in faster wind. True perspective; one unit is a metre.
// Run: node build.mjs            writes staticfiles/image/thumbnails/wake/scene.svg
//                                and scene.js, and the preview page beside this file
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
const { makeNacelles } = await import(FILES.turbine);
const OUT = join(HERE, "../../staticfiles/image/thumbnails/wake");
const SCOPE = ".scene-wake";

const RAD = Math.PI / 180;
const add3 = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub3 = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const mul3 = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const unit3 = (p) => mul3(p, 1 / (Math.hypot(p[0], p[1], p[2]) || 1));
const random = ((seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(11);

// ── The camera: 200 m up, 2 km downwind and a little south of the last turbine ─
// Like the ohmera.ai card it looks level through a shifted frame, so towers stay
// upright, but from thirteen times higher, so the sea fills the strip. Looking
// back up the row, a wake's sideways swing runs across the screen at full
// scale while the 8 D spacing closes up in depth: all three turbines fit the
// right end, where the card's fade is thinnest and a phone's card still reaches.
// WAKE_VIEW='{"bearing":-20}' tries another camera.
const VIEW = { width: 1400, height: 200, horizon: 12, eyeZ: 200, range: 2000, bearing: -16, x: 1290, focal: 1400, fps: 30, ...JSON.parse(process.env.WAKE_VIEW || "{}") };
const WIDTH = VIEW.width, HEIGHT = VIEW.height, HORIZON = VIEW.horizon;
const LAST = M.SITES[2];
const EYE = [LAST[0] + VIEW.range * Math.cos(VIEW.bearing * RAD), LAST[1] + VIEW.range * Math.sin(VIEW.bearing * RAD), VIEW.eyeZ];
const toLast = Math.atan2(LAST[1] - EYE[1], LAST[0] - EYE[0]);
const CAM = lookFrom(EYE, toLast + Math.atan((VIEW.x - WIDTH / 2) / VIEW.focal), 0, VIEW.focal, WIDTH / 2, HORIZON);
const at = (p) => persp(p, CAM);
const depth = (p) => dot3(sub3(p, EYE), CAM.fwd);
const L = unit3([Math.cos(250 * RAD) * 0.77, Math.sin(250 * RAD) * 0.77, 0.64]); // the ohmera card's sun
const BANDS = [0, 0.2, 0.42, 0.62];
const fastPath = (pts, closed = false) => { let d = ""; for (let i = 0; i < pts.length; i++) d += (i ? "L" : "M") + Math.round(pts[i][0] * 10) / 10 + " " + Math.round(pts[i][1] * 10) / 10; return d && closed ? d + "Z" : d; };
const ctx = { P: CAM, iso: persp, pathOf: k.pathOf, V: [0, 0, 1], L, BANDS, eye: EYE };
const NAC = makeNacelles({ ...ctx, makeRotor });

// ── The turbines' fixed parts: monopile, transition piece, deck and tower ───
const T = { deck: 12.5, tp: 15, top: 87.6, r0: 3.0, r1: 1.94, tpR: 3.25, deckR: 5.4 };
const sweep = makeRotor({ hub: [0, 0, 0], axis: [1, 0, 0], R: 1, rootR: 0, span: 1, sections: 1, arc: 10, bisect: 10 }, ctx).ribbon;
const ring = (C, r) => ({ C, u: [1, 0, 0], v: [0, 1, 0], hc: r, ht: r });
const solid = (paths, style = {}) => k.solidSvg({ ...paths, seamless: true }, style);
const column = ([x, y], z0, z1, r0, r1) => sweep([ring([x, y, z0], r0), ring([x, y, z1], r1)], [0, 0, 1]);
function halfRing([x, y], r, z, behind = false, n = 24) {
  const a = Math.atan2(EYE[1] - y, EYE[0] - x) + (behind ? Math.PI : 0);
  return Array.from({ length: n + 1 }, (_, i) => { const f = a - Math.PI / 2 + (Math.PI * i) / n; return [x + r * Math.cos(f), y + r * Math.sin(f), z]; });
}
const TURBINES = M.SITES.map((site, i) => {
  const d = depth([site[0], site[1], M.FARM.hub]);
  const rpx = (63 * CAM.focal) / d;
  return { i, site, d, rpx, tone: d < 1500 ? "hi" : d < 3200 ? "mid" : "lo", detail: { sections: Math.max(6, Math.min(14, Math.round(rpx / 5))), arc: 6, bisect: 8, facets: 6 } };
});
// From behind, a rotor is further from the eye than its tower at every yaw the agents reach.
for (const t of TURBINES) for (const yaw of [0, 12.5, 25]) {
  const F = NAC.frame(t.site, yaw);
  if (dot3(F.AX, sub3(EYE, F.hub)) >= 0) throw new Error(`turbine ${t.i} shows its rotor's face at ${yaw}°`);
}

const solidMarkup = (paths, { tone = "hi", part, lit = false } = {}) => {
  const d = (v) => (v ? ` d="${v}"` : "");
  return `<g class="iso-solid" data-seamless=""${lit ? ` data-lit=""` : ""}${part ? ` data-solid="${part}"` : ""}><path class="iso-fill"${d(paths?.fill)}/>${[0, 1, 2, 3].map((s) => `<path class="iso-shade" data-shade="${s}"${d(paths?.shades[s])}/>`).join("")}<path class="iso-top"${d(paths?.top)}/><path class="iso-line iso-crease" data-tone="faint"${d(paths?.crease)}/><path class="iso-line iso-edge" data-tone="${tone}"${d(paths?.outline)}/></g>`;
};
const rotorLayers = (rest, front, tone) => `<g data-part="${front ? "front" : "back"}">${[0, 1, 2].map((b) => `<g data-blade="${b}">${solidMarkup(rest[b].toward === front ? rest[b].blade : null, { tone, part: "blade" })}</g>`).join("")}</g>`;

function turbine(t) {
  const o = t.site, tone = t.tone, out = [];
  const yaw = M.yawAt(t.i, 0), live = NAC.nacelle(o, yaw);
  const rest = makeRotor(NAC.rotorSpec(o, yaw, t.detail), ctx).pose(0);
  out.push(`<g class="wk-foam">${[4.6, 5.6, 6.9].map((r, n) => k.lineSvg(k.pathOf(halfRing(o, r, 0, true).map(at)), { tone: "lo", className: `wk-ripple wk-r${n}` })).join("")}</g>`);
  // rotor and spinner first: from downwind the tower and nacelle stand in front of them
  out.push(`<g data-rotor="${t.i}">${rotorLayers(rest, false, tone)}${solidMarkup(live.spinner, { tone, part: "spinner" })}${rotorLayers(rest, true, tone)}</g>`);
  out.push(solid(column(o, -0.5, T.deck, T.tpR, T.tpR), { tone, lit: true, inner: k.lineSvg(k.pathOf(halfRing(o, T.tpR + 0.01, 5).map(at)), { tone: "faint" }) }));
  // boat landing on the south face: two fender tubes with rungs between
  const face = -80 * RAD, F = [Math.cos(face), Math.sin(face), 0], S = [-Math.sin(face), Math.cos(face), 0];
  const offs = (z, r, lat) => at(add3([o[0], o[1], z], add3(mul3(F, r), mul3(S, lat))));
  const tubes = [-0.8, 0.8].map((lat) => k.pathOf([offs(-0.5, T.tpR + 0.7, lat), offs(11.6, T.tpR + 0.7, lat)])).join("");
  const rungs = Array.from({ length: 11 }, (_, n) => n * 1.1).map((z) => k.pathOf([offs(z, T.tpR + 0.72, -0.8), offs(z, T.tpR + 0.72, 0.8)])).join("");
  const arms = [2, 10.5].map((z) => [-0.8, 0.8].map((lat) => k.pathOf([offs(z, T.tpR, lat), offs(z, T.tpR + 0.7, lat)])).join("")).join("");
  out.push(k.lineSvg(rungs, { tone: "lo" }), k.lineSvg(tubes, { tone: "mid" }), k.lineSvg(arms, { tone: "mid" }));
  out.push(solid(column(o, T.deck, T.deck + 0.5, T.deckR, T.deckR), { tone }));
  const rail = (behind) => {
    const top = halfRing(o, T.deckR - 0.25, T.deck + 1.6, behind, 28), mid = halfRing(o, T.deckR - 0.25, T.deck + 1.05, behind, 28);
    const posts = top.filter((_, n) => n % 4 === 0).map((p) => k.pathOf([at([p[0], p[1], T.deck + 0.5]), at(p)])).join("");
    return k.lineSvg(k.pathOf(top.map(at)) + posts, { tone: "mid" }) + k.lineSvg(k.pathOf(mid.map(at)), { tone: "lo" });
  };
  out.push(rail(true));
  out.push(solid(column(o, T.deck + 0.5, T.tp, T.tpR, T.tpR), { tone, lit: true }));
  const slope = (T.r1 - T.r0) / (T.top - T.tp);
  const seams = [36, 58, 76].map((z) => k.pathOf(halfRing(o, T.r0 + slope * (z - T.tp) + 0.01, z).map(at))).join("");
  out.push(solid(column(o, T.tp, T.top, T.r0, T.r1), { tone, inner: k.lineSvg(seams, { tone: "faint" }) }));
  out.push(rail(false));
  out.push(`<g data-nacelle="${t.i}">${solidMarkup(live.body, { tone, part: "body" })}<path class="iso-line" data-tone="faint" data-part="joint" d="${live.joint}"/>${solidMarkup(live.cooler, { tone: tone === "hi" ? "mid" : tone, part: "cooler" })}<g class="wk-beacon"><circle data-part="light" cx="${live.light[0].toFixed(1)}" cy="${live.light[1].toFixed(1)}" r="0.9"/></g></g>`);
  out.push(`<g class="wk-foam">${[4.6, 5.6, 6.9].map((r, n) => k.lineSvg(k.pathOf(halfRing(o, r, 0).map(at)), { tone: "mid", className: `wk-ripple wk-r${n}` })).join("")}</g>`);
  return `<g data-turbine="${t.i}">${out.join("")}</g>`;
}

// ── The sea, as on the ohmera.ai card: a fill to the horizon, glints in bands ─
// The card's 69 m swell from the north-east, under a 25 m wind sea running east
// before the post's westerly.
const SWELL_DIR = unit3([Math.cos(225 * RAD), Math.sin(225 * RAD), 0]);
const TRAINS = [
  { key: "a", dir: SWELL_DIR, length: 69, period: 20 / 3, share: 0.45 },
  { key: "b", dir: [1, 0, 0], length: 25, period: 4, share: 0.55 },
];
const BUCKETS = 12;
const ray = (sx, sy) => {
  const dir = add3(CAM.fwd, add3(mul3(CAM.right, (sx - CAM.cx) / CAM.focal), mul3(CAM.up, -(sy - CAM.cy) / CAM.focal)));
  return dir[2] < -1e-4 ? add3(EYE, mul3(dir, -EYE[2] / dir[2])) : null;
};
function sea() {
  const groups = new Map();
  for (let y = HORIZON + 1.2, step; y < HEIGHT + 4; y += step) {
    step = 2.2 + 0.05 * (y - HORIZON);
    for (let x = -8 + random() * step * 2; x < WIDTH + 8; x += step * (2.1 + random() * 1.6)) {
      const sy = y + (random() - 0.5) * step * 0.6, p = ray(x, sy);
      if (!p) continue;
      const train = random() < TRAINS[0].share ? TRAINS[0] : TRAINS[1];
      const crest = [-train.dir[1], train.dir[0], 0], half = ((1.1 * step + 0.6) * depth(p)) / CAM.focal / 2;
      const seg = k.pathOf([at(add3(p, mul3(crest, -half))), at(add3(p, mul3(crest, half)))]);
      const phase = ((dot3(p, train.dir) / train.length) % 1 + 1) % 1, b = Math.floor(phase * BUCKETS);
      const key = `${train.key}${b}${y < HORIZON + 26 ? "far" : "near"}`;
      groups.set(key, (groups.get(key) || "") + seg);
    }
  }
  const glints = [...groups].map(([key, d]) => {
    const train = TRAINS.find((t) => t.key === key[0]), b = parseInt(key.slice(1), 10), tier = key.match(/[a-z]+$/)[0];
    const delay = ((((b + 0.5) / BUCKETS - 0.5) % 1) - 1) * train.period;
    return `<path class="wk-glint" data-train="${train.key}" data-tier="${tier}" style="animation-delay:${delay.toFixed(3)}s" d="${d}"/>`;
  }).join("");
  const water = k.pathOf([[0, HORIZON], [WIDTH, HORIZON], [WIDTH, HEIGHT], [0, HEIGHT]], true);
  return `<defs><linearGradient id="wk-sea" x1="0" y1="${HORIZON}" x2="0" y2="${HEIGHT}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--wk-sea-far)"/><stop offset="1" style="stop-color:var(--wk-sea-near)"/></linearGradient>` +
    `<linearGradient id="wk-haze" x1="0" y1="0" x2="0" y2="${HORIZON}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--wk-haze);stop-opacity:0"/><stop offset="1" style="stop-color:var(--wk-haze);stop-opacity:1"/></linearGradient></defs>` +
    `<rect x="0" y="0" width="${WIDTH}" height="${HORIZON}" fill="url(#wk-haze)"/>` +
    `<path d="${water}" fill="url(#wk-sea)"/>${k.lineSvg(k.pathOf([[0, HORIZON], [WIDTH, HORIZON]]), { tone: "lo", free: true })}` +
    // the wakes are calmer water: slower wind raises fewer glints there
    `<mask id="wk-calm" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>${M.SITES.map((_, i) => LEVELS.map((_, n) => `<path class="wk-hush" data-wake="${i}" data-level="${n}"/>`).join("")).join("")}</mask>` +
    `<g class="wk-sea" mask="url(#wk-calm)">${glints}</g>`;
}

// ── The wakes: per turbine a closed contour per deficit level, and the
// streamline down its centre; all redrawn live ─────────────────────────────
const LEVELS = [0.05, 0.15];
const STREAMS = [0];
const wakeLayer = () => `<g class="wk-wakes">${M.SITES.map((_, i) => LEVELS.map((_, n) => `<path class="wk-band" data-wake="${i}" data-level="${n}"/>`).join("") +
  STREAMS.map((n) => `<path class="wk-stream" data-wake="${i}" data-stream="${n}"/>`).join("")).join("")}</g>`;

const svgBody = [sea(), wakeLayer(), TURBINES.map(turbine).join("")].join("");

// ── Live ────────────────────────────────────────────────────────────────────
const strip = (file) => readFileSync(file, "utf8").replace(/^export /gm, "");
const live = `
${strip(FILES.rotor)}
${strip(FILES.camera)}
${strip(FILES.model)}
${strip(FILES.turbine)}
const CAM = ${JSON.stringify(CAM)};
const fastPath = ${fastPath.toString()};
const CTX = { P: CAM, iso: persp, pathOf: fastPath, V: [0, 0, 1], L: ${JSON.stringify(L)}, BANDS: ${JSON.stringify(BANDS)}, eye: CAM.eye };
const NAC = makeNacelles({ ...CTX, makeRotor });
const TURBINES = ${JSON.stringify(TURBINES.map(({ i, site, detail }) => ({ i, site, detail })))};
const LEVELS = ${JSON.stringify(LEVELS)};
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const SOLID = (el) => [...el.querySelectorAll(":scope > path")];
const write = (els, paths) => {
  const values = paths ? [paths.fill, ...paths.shades, paths.top, paths.crease || "", paths.outline] : els.map(() => "");
  els.forEach((el, j) => { if (el.getAttribute("d") !== values[j]) el.setAttribute("d", values[j]); });
};
// The agents' clock: one 3900-timestep episode loop in ${(M.LOOP_STEPS / 100).toFixed(0)} s, a hundred timesteps a second.
// The rotors keep real time, each at the speed its inflow drives it.
const STEPS_PER_SECOND = 100;
const turbines = TURBINES.map((t) => {
  const g = svg.querySelector('[data-turbine="' + t.i + '"]'), n = g.querySelector('[data-nacelle="' + t.i + '"]');
  const slot = (layer, b) => SOLID(g.querySelector('[data-part="' + layer + '"] [data-blade="' + b + '"] [data-solid="blade"]'));
  return {
    ...t, yaw: null, angle: (t.i * 2.1) % (2 * Math.PI), rotor: null,
    blades: [0, 1, 2].map((b) => ({ back: slot("back", b), front: slot("front", b) })),
    spinner: SOLID(g.querySelector('[data-solid="spinner"]')),
    body: SOLID(n.querySelector('[data-solid="body"]')), cooler: SOLID(n.querySelector('[data-solid="cooler"]')),
    joint: n.querySelector('[data-part="joint"]'), light: n.querySelector('[data-part="light"]'),
  };
});
function yawTo(t, yaw) {
  if (t.yaw !== null && Math.abs(yaw - t.yaw) < 0.02) return;
  t.yaw = yaw;
  const parts = NAC.nacelle(t.site, yaw);
  write(t.spinner, parts.spinner); write(t.body, parts.body); write(t.cooler, parts.cooler);
  t.joint.setAttribute("d", parts.joint);
  t.light.setAttribute("cx", parts.light[0].toFixed(1)); t.light.setAttribute("cy", parts.light[1].toFixed(1));
  t.rotor = makeRotor(NAC.rotorSpec(t.site, yaw, t.detail), CTX);
}
function spin(t) {
  t.rotor.pose(t.angle).forEach((b, i) => {
    write(b.toward ? t.blades[i].front : t.blades[i].back, b.blade);
    write(b.toward ? t.blades[i].back : t.blades[i].front, null);
  });
}
// Each wake's contour at a deficit level runs down one edge of the band where
// the hub-height deficit exceeds it, round the tip where it fades to the level,
// and back up the other. The streamlines run inside the outer contour and meet
// at its tip, so every line ends on the contour.
const STREAMS = ${JSON.stringify(STREAMS)};
const pick = (sel, i, key, v) => svg.querySelector(sel + '[data-wake="' + i + '"][data-' + key + '="' + v + '"]');
const WAKES = SITES.map((_, i) => ({
  bands: LEVELS.map((_, n) => [pick(".wk-band", i, "level", n), pick(".wk-hush", i, "level", n)]),
  streams: STREAMS.map((n) => [n, pick(".wk-stream", i, "stream", n)]),
}));
const setD = (el, d) => { if (el.getAttribute("d") !== d) el.setAttribute("d", d); };
const seen = (p) => (p.x - CAM.eye[0]) * CAM.fwd[0] + (p.y - CAM.eye[1]) * CAM.fwd[1] > 260;
const sea = (x, y) => persp([x, y, 0], CAM);
// where the wake's centre deficit falls to level, between stations q and p
const tipOf = (q, p, level) => { const f = (q.C - level) / (q.C - p.C); return sea(q.x + f * (p.x - q.x), q.y + f * (p.y - q.y)); };
function wakes(s) {
  WAKES.forEach((wake, i) => {
    const plan = wakePlan(i, s, LEVELS);
    const outline = LEVELS.map((level, n) => {
      const left = [], right = [];
      for (let j = 0; j < plan.length && seen(plan[j]); j++) {
        const p = plan[j], h = p.widths[n];
        if (h > 0) { left.push(sea(p.x, p.y + h)); right.push(sea(p.x, p.y - h)); continue; }
        if (left.length) right.push(tipOf(plan[j - 1], p, level));
        break;
      }
      const d = left.length > 1 ? fastPath([...left, ...right.reverse()], true) : "";
      setD(wake.bands[n][0], d); setD(wake.bands[n][1], d);
      return d;
    });
    for (const [n, el] of wake.streams) {
      const pts = [];
      for (let j = 0; j < plan.length && seen(plan[j]); j++) {
        const p = plan[j], w = p.widths[0];
        if (w > 0) { pts.push(sea(p.x, p.y + n * Math.min(p.sy, 0.6 * w))); continue; }
        if (pts.length) pts.push(tipOf(plan[j - 1], p, LEVELS[0]));
        break;
      }
      setD(el, outline[0] && pts.length > 1 ? fastPath(pts) : "");
    }
  });
}
const GAP = ${Math.round(1000 / VIEW.fps) - 2};
let frame = 0, visible = false, last = -Infinity, clock = 0;
function draw(s, dt) {
  for (const t of turbines) {
    yawTo(t, yawAt(t.i, s));
    t.angle += dt * rpmOf(t.i, s) * Math.PI / 30;
    spin(t);
  }
  wakes(s);
}
function tick(now) {
  if (now - last >= GAP) {
    const dt = Math.min(0.1, last < 0 ? 0 : (now - last) / 1000);
    last = now; clock += dt;
    draw(clock * STEPS_PER_SECOND, dt);
  }
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
// A still frame (reduced motion) shows the episode's end: both agents steered,
// their wakes settled clear. The preview sets data-at to show any timestep.
if (still.matches) clock = ${M.ACTIONS[M.ACTIONS.length - 1][1] + 480} / STEPS_PER_SECOND;
if (stage.dataset.at) clock = Number(stage.dataset.at) / STEPS_PER_SECOND;
draw(clock * STEPS_PER_SECOND, 0);
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible && !frame && !still.matches) { last = -Infinity; frame = requestAnimationFrame(tick); }
}, { rootMargin: "120px 0px" }).observe(stage);
`;

// ── Styles: the ohmera.ai card's navy set, every rule scoped to the scene ───
const NAVY = `--anatomy-page:#050f17;--anatomy-card:#081722;--anatomy-paper:#081722;--anatomy-face:#0c1f2d;
--anatomy-shade-0:#040e17;--anatomy-shade-1:#061521;--anatomy-shade-2:#091b29;--anatomy-shade-3:#0c2131;--anatomy-top:#10283a;
--anatomy-lit-top:#163045;--anatomy-lit-shade:#12293b;
--anatomy-hi:#9fb2c2;--anatomy-mid:#5a7184;--anatomy-lo:#2f475a;--anatomy-faint:#1a3041;--anatomy-halo:#01070c;
--anatomy-text:#7f95a7;--anatomy-strong:#c9d6e0;--anatomy-muted:#566d80`;
const SEA = `--wk-sea-far:#0b1d2b;--wk-sea-near:#061420;--wk-haze:#0e2232;--wk-glint:#7b93a6;--wk-glint-far:#3d5568;--wk-beacon:#e0675e;--wk-wake:#9fb2c2;--wk-slick:#030b12`;
const SCENE_CSS = `.wk-glint{fill:none;stroke:var(--wk-glint);stroke-width:.7;stroke-linecap:round;opacity:.16;animation:wk-crest linear infinite}
.wk-glint[data-tier="far"]{stroke:var(--wk-glint-far)}
.wk-glint[data-train="a"]{animation-duration:${(20 / 3).toFixed(4)}s}
.wk-glint[data-train="b"]{animation-duration:4s}
@keyframes wk-crest{0%,36%{opacity:.16}50%{opacity:1}64%,100%{opacity:.16}}
.wk-band{fill:var(--wk-wake);fill-opacity:.07;stroke:var(--anatomy-mid);stroke-width:.6;stroke-linejoin:round}
.wk-band[data-level="1"]{fill-opacity:.09;stroke:var(--anatomy-hi);stroke-opacity:.55}
.wk-hush{fill:#000;fill-opacity:.6}
.wk-stream{fill:none;stroke:var(--anatomy-hi);stroke-opacity:.75;stroke-width:.7;stroke-linecap:round}
.wk-ripple{animation:wk-ripple 4s ease-in-out infinite}
.wk-r1{animation-delay:-1.333s}
.wk-r2{animation-delay:-2.667s}
@keyframes wk-ripple{0%,100%{opacity:.25}50%{opacity:1}}
.wk-beacon circle{fill:var(--wk-beacon)}
.wk-beacon{animation:wk-blink 2s steps(1) infinite}
@keyframes wk-blink{0%{opacity:1}30%,100%{opacity:.15}}`;
const STILL = ".wk-glint,.wk-ripple,.wk-beacon";
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots)/.test(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const css = `${SCOPE}{${NAVY};${SEA};--anatomy-lit:#c9d6e0;--anatomy-dot:#9fb2c2;--anatomy-weight:.6px}` + [...KIT, ...SCENE_CSS.split("\n")].map(scope).join("") +
  `@media (prefers-reduced-motion:reduce){${STILL.split(",").map((x) => `${SCOPE} ${x}`).join(",")}{animation:none}}`;
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${svgBody}</svg>`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "scene.svg"), markup);
const js = `// Generated by figures/wake/build.mjs: yaws the turbines through the agents' episode, moves\n// their wakes and turns the rotors on the reinforcement-learning post's card. Edit the build, not this file.\n${live}`;
writeFileSync(join(OUT, "scene.js"), js);

// ── The preview: the card as the homepage draws it ───────────────────────────
const preview = (at) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css?family=Quicksand:400,500,700" rel="stylesheet">
<style>body{margin:0;padding:24px 15px;background:#fff;font-family:Quicksand,sans-serif}.card{position:relative;max-width:1110px;margin:0 auto 24px;height:160px;overflow:hidden;border-radius:4px;background:#081722}
.scene-wake{position:absolute;inset:0}.scene-wake svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,0.2),white 80%)}
.text{position:relative;z-index:2;padding:16px 15px}h2{margin:0 0 8px;color:#717171;font-weight:500;font-size:26px;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:14px;margin:0 0 6px}.blurb{font-size:13px;margin:0;max-width:60%}
@media (max-width:770px){h2{font-size:18px}.date{font-size:9px}.blurb{font-size:10px}}</style></head><body>
<div class="card" id="card"><div class="scene-wake"${at === null ? "" : ` data-at="${at}"`}></div><div class="text"><h2>Reinforcement Learning for Offshore Wind Farm Optimisation</h2><p class="date">Apr 30, 2022</p><p class="blurb">Applying Q-Learning to Static &amp; Quasi-Dynamic Offshore Wind Farm Environments to Optimise Wake Steering Strategies</p></div></div>
<script type="module">
const at = new URLSearchParams(location.search).get("at");
const scene = document.querySelector(".scene-wake");
if (at !== null) scene.dataset.at = at;
const svg = await (await fetch("../../staticfiles/image/thumbnails/wake/scene.svg")).text();
scene.insertAdjacentHTML("beforeend", svg);
await import("../../staticfiles/image/thumbnails/wake/scene.js");
</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview(null));
// a bare strip, no fade, for reading the drawing itself
writeFileSync(join(HERE, "strip.html"), preview(null).replace(".card::after{", ".card::after{display:none;").replace('<div class="text">', '<div class="text" hidden>'));

console.log(`scene.svg ${(markup.length / 1024).toFixed(0)} KB · scene.js ${(js.length / 1024).toFixed(0)} KB`);
{
  const steered = M.wakePlan(0, 3300, [0.05]).find((p) => p.x >= M.SITES[1][0]);
  const miss = sub3(at([steered.x, steered.y, 0]), at([M.SITES[1][0], M.SITES[1][1], 0]));
  console.log(`steered wake of turbine 0 passes turbine 1's base ${Math.hypot(miss[0], miss[1]).toFixed(1)} px off (${miss[0].toFixed(1)}, ${miss[1].toFixed(1)})`);
  // against the post's figure 3: 1.69 MW for the free turbine at 0°, and 1.41, 0.98, 1.13 MW once steered
  for (const s of [50, 3300]) console.log(`timestep ${s}: yaw ${[0, 1, 2].map((i) => M.yawAt(i, s).toFixed(0)).join("/")}°, power ${[0, 1, 2].map((i) => M.powerOf(i, s).toFixed(2)).join(" + ")} MW, ${[0, 1, 2].map((i) => M.rpmOf(i, s).toFixed(1)).join("/")} rpm`);
}
for (const t of TURBINES) console.log(`turbine ${t.i}: depth ${t.d.toFixed(0)} m, rotor ${(2 * t.rpx).toFixed(0)} px, base at ${at([t.site[0], t.site[1], 0]).map((v) => v.toFixed(0)).join(",")}, hub at ${at([t.site[0], t.site[1], 90]).map((v) => v.toFixed(0)).join(",")}`);
