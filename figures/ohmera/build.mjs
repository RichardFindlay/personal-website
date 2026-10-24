// An offshore wind farm seen from just above the waves: one 15 MW-class turbine
// close up on its monopile, towering over the camera, and the rest of the farm
// receding in rows to the horizon over a moving sea. True perspective, not
// isometric. One unit is one metre.
//
// Copied from the ohmera.ai repo's figures/offshore/build.mjs at commit d655e0b
// (camera.mjs beside it and figures/turbine/rotor.mjs as rotor.mjs here), for this
// website's ohmera.ai card only: the hero and plate modes are gone and it writes
// nothing outside this repo. The plain build reproduces the navy card that repo
// wrote, byte for byte, so its generated header still names that build.
// Run: node build.mjs            (needs Node 20.10+) the navy card,
//                                staticfiles/image/thumbnails/ohmera/offshore.svg and .js
//      node build.mjs --colour   the daylight card, offshore-colour.svg and .js
// Each also writes its preview, preview.html or preview-colour.html.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const G = await import(join(SKILL, "kit/lathe.mjs"));
const HERE = dirname(fileURLToPath(import.meta.url));
const ROTOR = join(HERE, "rotor.mjs"), CAMERA = join(HERE, "camera.mjs");
const { makeRotor } = await import(ROTOR);
const { lookFrom, persp } = await import(CAMERA);
const COLOUR = process.argv.includes("--colour");
const OUT = join(HERE, "../../staticfiles/image/thumbnails/ohmera");
const SCOPE = ".ohmera-scene";
const { add3, sub3, mul3, dot3, unit3, cross3 } = G;
const RAD = Math.PI / 180, TAU = Math.PI * 2;
const random = ((seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(7);

// ── The camera: 15 m above the sea, south-west of the nearest turbine ─────────
// It looks level and the frame is shifted instead of tilting (a shift lens), so
// towers stay upright and the horizon is the line through cy. It turns until the
// turbine stands at x, with the farm running off to the right. The card is a long
// strip seen from 1.3 km, the turbine near its right end, where the card's white
// fade is thinnest and a phone's narrow card still reaches; its crests start at
// the frame's foot.
const VIEW = { width: 1400, height: 200, horizon: 165, range: 1330, x: 1150, focal: 720, near: 270, fps: 30 };
const WIDTH = VIEW.width, HEIGHT = VIEW.height, HORIZON = VIEW.horizon;
const EYE = [-VIEW.range * Math.SQRT1_2, -VIEW.range * Math.SQRT1_2, 15];
const CAM = lookFrom(EYE, 45 * RAD - Math.atan((WIDTH / 2 - VIEW.x) / VIEW.focal), 0, VIEW.focal, WIDTH / 2, HORIZON);
const RANGE = Math.round(Math.hypot(EYE[0], EYE[1]));
const at = (p) => persp(p, CAM);
const depth = (p) => dot3(sub3(p, EYE), CAM.fwd);
const L = unit3([Math.cos(250 * RAD) * 0.77, Math.sin(250 * RAD) * 0.77, 0.64]); // sun from the south-south-west
const BANDS = [0, 0.2, 0.42, 0.62];
const band = (score) => { let t = 0; while (t < BANDS.length && score >= BANDS[t]) t++; return Math.min(3, Math.max(0, t - 1)); };

// ── The machine: a 15 MW-class turbine, 236 m rotor, hub 140 m above the sea ───
const AX = [0, -1, 0];                  // the rotors face south, into the wind
const LAT = [1, 0, 0];
const T = { tp: 24, deck: 21.6, top: 135.5, r0: 4.0, r1: 2.9, tpR: 4.6, deckR: 8.2 };
const RPMS = [5, 6, 7];                 // whole numbers of rpm loop seamlessly every 20 s
const onN = (o, ax, lat, z) => [o[0] + ax * AX[0] + lat * LAT[0], o[1] + ax * AX[1] + lat * LAT[1], z];
// the blades start at the spinner's rim, so the ones in front of it leave it whole
const SPEC = (o, detail) => ({ hub: onN(o, 8.4, 0, 140), axis: AX, R: 111, rootR: 3.6, span: 107.4, girth: 1.45, collar: null, ...detail });

// The farm: rows 1.05 km apart east, 0.95 km north, every other row staggered,
// trimmed to an irregular lease boundary. The nearest turbine stands at the
// origin, the farm's south-west corner, so nothing else is as close.
const SITES = [];
for (let j = 0; j <= 9; j++) for (let i = 0; i <= 9; i++) {
  const x = i * 1050 + (j % 2) * 525, y = j * 950;
  if (x > 8800 - j * 260 || (i + j * 3) % 11 === 5) continue;
  SITES.push([x, y]);
}
const FARM = SITES.map(([x, y], n) => {
  const base = [x, y, 0], d = depth([x, y, 140]);
  const s = at([x, y, 140]);
  return { n, x, y, d, rpx: (111 * CAM.focal) / d, s, rpm: RPMS[(n * 7) % 3], phase: random() * TAU };
}).filter((t) => t.d > 100 && t.s[0] > -160 && t.s[0] < WIDTH + 160).sort((a, b) => b.d - a.d);
const tierOf = (t) => (t.n === FARM.find((f) => f.x === 0 && f.y === 0).n ? "near" : t.rpx > 40 ? "mid" : "far");
const toneOf = (d) => (d < 1500 ? "hi" : d < 3200 ? "mid" : d < 6500 ? "lo" : "faint");

// ── Solids in perspective ───────────────────────────────────────────────────
const ctx = { P: CAM, iso: persp, pathOf: k.pathOf, V: [0, 0, 1], L, BANDS, eye: EYE };
const sweeper = (arc) => makeRotor({ hub: [0, 0, 0], axis: [1, 0, 0], R: 1, rootR: 0, span: 1, sections: 1, arc, bisect: 12 }, ctx).ribbon;
const SWEEP = { fine: sweeper(14), coarse: sweeper(6) };
const ring = (C, r, u = [1, 0, 0], v = [0, 1, 0]) => ({ C, u, v, hc: r, ht: r });
const solid = (paths, style = {}) => k.solidSvg({ ...paths, seamless: true }, style);
function column([x, y], z0, z1, r0, r1, detail = "fine") {
  return SWEEP[detail]([ring([x, y, z0], r0), ring([x, y, z1], r1)], [0, 0, 1]);
}
// a level circle's half that faces the eye (or the half behind)
function halfRing([x, y], r, z, behind = false, n = 24) {
  const a = Math.atan2(EYE[1] - y, EYE[0] - x) + (behind ? Math.PI : 0);
  return Array.from({ length: n + 1 }, (_, i) => { const f = a - Math.PI / 2 + (Math.PI * i) / n; return [x + r * Math.cos(f), y + r * Math.sin(f), z]; });
}
// an upright prism over a convex plan: the faces you can see, each in its tone
function prism(plan, z0, z1) {
  const area = plan.reduce((s, p, i) => { const q = plan[(i + 1) % plan.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const ringXY = area < 0 ? [...plan].reverse() : plan, n = ringXY.length;
  const lo = ringXY.map(([x, y]) => [x, y, z0]), hi = ringXY.map(([x, y]) => [x, y, z1]);
  const shades = [[], [], [], []], crease = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = ringXY[i], b = ringXY[j];
    const normal = unit3([b[1] - a[1], -(b[0] - a[0]), 0]);
    if (dot3(normal, sub3(EYE, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2])) <= 0) continue;
    shades[band(dot3(normal, L))].push(k.pathOf([lo[i], lo[j], hi[j], hi[i]].map(at), true));
    crease.push(k.pathOf([hi[i], hi[j]].map(at)));
  }
  if (EYE[2] < z0) shades[0].push(k.pathOf(lo.map(at), true)); // seen from below
  const hull = k.pathOf(G.hullOf([...lo, ...hi].map(at)), true);
  return { fill: hull, outline: hull, shades: shades.map((s) => s.join("")), top: EYE[2] > z1 ? k.pathOf(hi.map(at), true) : "", crease: crease.join("") };
}
const plan = (o, ax0, ax1, half, r, steps = 4) => k.ringOf({ x: ax0, y: -half, w: ax1 - ax0, d: 2 * half, r }, steps).map(([a, l]) => onN(o, a, l, 0).slice(0, 2));

// ── One turbine, drawn at the detail its distance earns ──────────────────────
const solidMarkup = (paths) => {
  const d = (v) => (v ? ` d="${v}"` : "");
  return `<g class="iso-solid" data-seamless="" data-solid="blade"><path class="iso-fill"${d(paths?.fill)}/>${[0, 1, 2, 3].map((s) => `<path class="iso-shade" data-shade="${s}"${d(paths?.shades[s])}/>`).join("")}<path class="iso-top"${d(paths?.top)}/><path class="iso-line iso-edge" data-tone="hi"${d(paths?.outline)}/></g>`;
};
const rotorLayers = (rest, front) => `<g data-part="${front ? "front" : "back"}">${[0, 1, 2].map((i) => `<g data-blade="${i}">${solidMarkup(rest[i].toward === front ? rest[i].blade : null)}</g>`).join("")}</g>`;
// From 1.3 km the nearest rotor is no bigger than a mid one, so every rotor is
// drawn and turned like one: coarse, and each pose worked out once.
const rotorOf = (t) => ({ sections: Math.max(6, Math.min(16, Math.round(t.rpx / 7))), arc: 6, bisect: 8 });

function spinner(o, detail) {
  const hub = onN(o, 8.4, 0, 140), R = 3.6, nose = 5.6;
  const rOf = (s) => (s <= 0 ? R : R * Math.sqrt(Math.max(0, 1 - (s / nose) ** 2)));
  const ss = [-2, 0, ...Array.from({ length: detail === "fine" ? 12 : 4 }, (_, i) => (nose * 0.99 * (i + 1)) / (detail === "fine" ? 12 : 4))];
  return SWEEP[detail](ss.map((s) => ring(add3(hub, mul3(AX, s)), rOf(s), [0, 0, 1], LAT)), AX);
}
// The nacelle with its roof cooler, and the aviation light on the cooler. From
// below the roof the body hides the cooler, so the cooler goes first.
function nacelle(o, tone, flat = false, inner = "") {
  const body = solid(prism(plan(o, -14, 6, 4.2, 1.6), T.top, 143.5), { tone, flat, inner });
  const cooler = solid(prism(plan(o, -13.4, -8.6, 3.2, 0.4, 2), 143.5, 145.8), { tone: tone === "hi" ? "mid" : tone, flat });
  const light = `<g class="os-beacon">${k.dotsSvg([at(onN(o, -11, 0, 146.4))], { size: 1.1, tone: "hi" })}</g>`;
  return EYE[2] < 143.5 ? cooler + light + body : body + cooler + light;
}

function nearTurbine(t) {
  const o = [t.x, t.y], out = [];
  const tone = "hi";
  // waterline foam behind the column, then the transition piece up to its deck
  out.push(`<g class="os-foam">${[5.4, 6.4, 7.8].map((r, i) => k.lineSvg(k.pathOf(halfRing(o, r, 0, true).map(at)), { tone: "lo", className: `os-ripple os-r${i}` })).join("")}</g>`);
  out.push(solid(column(o, -0.5, T.deck, T.tpR, T.tpR), { tone, lit: true, inner: k.lineSvg(k.pathOf(halfRing(o, T.tpR + 0.01, 6).map(at)), { tone: "faint" }) }));
  // boat landing on the side the crew boat comes in: two fender tubes, rungs between
  const face = 175 * RAD, F = [Math.cos(face), Math.sin(face), 0], S = [-Math.sin(face), Math.cos(face), 0];
  const tube = (lat) => [add3([t.x, t.y, -1], add3(mul3(F, T.tpR + 0.9), mul3(S, lat))), add3([t.x, t.y, 19.5], add3(mul3(F, T.tpR + 0.9), mul3(S, lat)))];
  const tubes = [-1.1, 1.1].map((lat) => k.pathOf(tube(lat).map(at))).join("");
  const rungs = Array.from({ length: 16 }, (_, i) => -0.5 + i * 1.25).map((z) => k.pathOf([-0.6, 0.6].map((lat) => at(add3([t.x, t.y, z], add3(mul3(F, T.tpR + 0.95), mul3(S, lat))))))).join("");
  const arms = [3, 11, 19].map((z) => [-1.1, 1.1].map((lat) => k.pathOf([T.tpR, T.tpR + 0.9].map((r) => at(add3([t.x, t.y, z], add3(mul3(F, r), mul3(S, lat))))))).join("")).join("");
  out.push(k.lineSvg(rungs, { tone: "lo" }), k.lineSvg(tubes, { tone: "mid", free: true }), k.lineSvg(arms, { tone: "mid" }));
  // the deck, its railing behind the column, the column above, the railing in front
  out.push(solid(column(o, T.deck, T.deck + 0.6, T.deckR, T.deckR), { tone }));
  const rail = (behind) => {
    const top = halfRing(o, T.deckR - 0.3, T.deck + 1.7, behind, 32), mid = halfRing(o, T.deckR - 0.3, T.deck + 1.15, behind, 32);
    const posts = top.filter((_, i) => i % 4 === 0).map((p) => k.pathOf([at([p[0], p[1], T.deck + 0.6]), at(p)])).join("");
    return k.lineSvg(k.pathOf(top.map(at)) + posts, { tone: "mid" }) + k.lineSvg(k.pathOf(mid.map(at)), { tone: "lo" });
  };
  out.push(rail(true));
  // a davit crane on the deck, behind the column from here
  const davit = add3([t.x, t.y, 0], mul3([Math.cos(40 * RAD), Math.sin(40 * RAD), 0], 6.6));
  out.push(k.lineSvg(k.pathOf([at([davit[0], davit[1], T.deck + 0.6]), at([davit[0], davit[1], T.deck + 5.2]), at(add3([davit[0], davit[1], T.deck + 5.2], mul3([Math.cos(40 * RAD), Math.sin(40 * RAD), 0], 2.6)))]), { tone: "mid" }));
  const slope = (T.r1 - T.r0) / (T.top - T.tp);
  const seams = [52, 80, 108].map((z) => k.pathOf(halfRing(o, T.r0 + slope * (z - T.tp) + 0.01, z).map(at))).join("");
  out.push(solid(column(o, T.deck + 0.6, T.tp, T.tpR, T.tpR), { tone, lit: true }));
  out.push(solid(column(o, T.tp, T.top, T.r0, T.r1), { tone, inner: k.lineSvg(seams, { tone: "faint" }) }));
  out.push(rail(false));
  // panel joints down the west side, the one that faces the camera
  const joints = [-9, -3].map((ax) => k.pathOf([at(onN(o, ax, -4.2, T.top)), at(onN(o, ax, -4.2, 143.5))])).join("");
  out.push(nacelle(o, tone, false, k.lineSvg(joints, { tone: "faint" })));
  const rest = makeRotor(SPEC(o, rotorOf(t)), ctx).pose(t.phase);
  out.push(rotorLayers(rest, false), solid(spinner(o, "fine"), { tone }), rotorLayers(rest, true));
  out.push(`<g class="os-foam">${[5.4, 6.4, 7.8].map((r, i) => k.lineSvg(k.pathOf(halfRing(o, r, 0).map(at)), { tone: "mid", className: `os-ripple os-r${i}` })).join("")}</g>`);
  return out.join("");
}

function midTurbine(t) {
  const o = [t.x, t.y], tone = toneOf(t.d), out = [];
  out.push(solid(column(o, -0.5, T.deck, T.tpR, T.tpR, "coarse"), { tone, lit: true }));
  out.push(solid(column(o, T.deck, T.deck + 0.6, T.deckR, T.deckR, "coarse"), { tone }));
  out.push(solid(column(o, T.deck + 0.6, T.tp, T.tpR, T.tpR, "coarse"), { tone, lit: true }));
  out.push(solid(column(o, T.tp, T.top, T.r0, T.r1, "coarse"), { tone }));
  out.push(nacelle(o, tone));
  const rest = makeRotor(SPEC(o, rotorOf(t)), ctx).pose(t.phase);
  out.push(rotorLayers(rest, false), solid(spinner(o, "coarse"), { tone }), rotorLayers(rest, true));
  out.push(k.lineSvg(k.pathOf(halfRing(o, 6.5, 0, false, 12).map(at)), { tone: "lo", className: "os-ripple os-r1", free: true }));
  return out.join("");
}

// Far off the tower is a tapered band facing the camera and the blades are lines.
function farTurbine(t) {
  const o = [t.x, t.y], tone = toneOf(t.d);
  const band = (z0, z1, r0, r1) => {
    const a = at([o[0] - CAM.right[0] * r0, o[1] - CAM.right[1] * r0, z0]), b = at([o[0] + CAM.right[0] * r0, o[1] + CAM.right[1] * r0, z0]);
    const c = at([o[0] + CAM.right[0] * r1, o[1] + CAM.right[1] * r1, z1]), d = at([o[0] - CAM.right[0] * r1, o[1] - CAM.right[1] * r1, z1]);
    const p = k.pathOf([a, b, c, d], true);
    return solid({ fill: p, outline: p, shades: ["", "", "", ""], top: "" }, { tone, flat: true });
  };
  return band(-0.5, T.deck, T.tpR, T.tpR) + band(T.deck, T.deck + 0.6, T.deckR, T.deckR) + band(T.tp, T.top, T.r0, T.r1) + nacelle(o, tone, true) +
    `<path class="os-blades" style="fill:var(--anatomy-${tone})" data-blades="${t.n}"/>`;
}

// ── The sea: a fill to the horizon and wave glints that travel in bands ───────
// Two wave trains: a 69 m swell rolling in from the north-east toward the camera
// (period 20/3 s) and a 25 m wind sea running north-east (period 4 s); both are
// real deep-water periods and both divide the 20 s loop. Each glint joins the
// band of its phase on its train.
const SWELL_DIR = unit3([Math.cos(225 * RAD), Math.sin(225 * RAD), 0]);
const TRAINS = [
  { key: "a", dir: SWELL_DIR, length: 69, period: 20 / 3, share: 0.55 },
  { key: "b", dir: unit3([Math.cos(60 * RAD), Math.sin(60 * RAD), 0]), length: 25, period: 4, share: 0.45 },
];
const BUCKETS = 12;
// Under the near tower its reflection breaks up into brighter glints.
const NEAR_BASE = at([0, 0, 0]), REFLECT = (T.tpR * CAM.focal) / depth([0, 0, 0]) * 2;
function sea() {
  const groups = new Map();
  const ray = (sx, sy) => {
    const dir = add3(CAM.fwd, add3(mul3(CAM.right, (sx - CAM.cx) / CAM.focal), mul3(CAM.up, -(sy - CAM.cy) / CAM.focal)));
    return dir[2] < -1e-4 ? add3(EYE, mul3(dir, -EYE[2] / dir[2])) : null;
  };
  for (let y = HORIZON + 1.2, step; y < HEIGHT + 4; y += step) {
    step = 2 + 0.065 * (y - HORIZON);
    for (let x = -8 + random() * step * 2; x < WIDTH + 8; x += step * (Math.abs(x - NEAR_BASE[0]) < REFLECT ? 0.6 : 1.3 + random() * 0.9)) {
      const sy = y + (random() - 0.5) * step * 0.6, p = ray(x, sy);
      if (!p) continue;
      const train = random() < TRAINS[0].share ? TRAINS[0] : TRAINS[1];
      const crest = [-train.dir[1], train.dir[0], 0], half = ((1.1 * step + 0.6) * depth(p)) / CAM.focal / 2;
      const seg = k.pathOf([at(add3(p, mul3(crest, -half))), at(add3(p, mul3(crest, half)))]);
      const phase = ((dot3(p, train.dir) / train.length) % 1 + 1) % 1, b = Math.floor(phase * BUCKETS);
      const glow = sy > NEAR_BASE[1] && Math.abs(x - NEAR_BASE[0]) < REFLECT * (1 + (random() - 0.5) * 0.8);
      const tier = glow ? "glow" : y < HORIZON + 30 ? "far" : "near", key = `${train.key}${b}${tier}`;
      groups.set(key, (groups.get(key) || "") + seg);
    }
  }
  const glints = [...groups].map(([key, d]) => {
    const train = TRAINS.find((t) => t.key === key[0]), b = parseInt(key.slice(1), 10), tier = key.match(/[a-z]+$/)[0];
    // a crest reaches phase b/BUCKETS at that fraction of the period; the keyframes peak halfway
    const delay = ((((b + 0.5) / BUCKETS - 0.5) % 1) - 1) * train.period;
    return `<path class="os-glint" data-train="${train.key}" data-tier="${tier}" style="animation-delay:${delay.toFixed(3)}s" d="${d}"/>`;
  }).join("");
  const water = k.pathOf([[0, HORIZON], [WIDTH, HORIZON], [WIDTH, HEIGHT], [0, HEIGHT]], true);
  return `<defs><linearGradient id="os-sea" x1="0" y1="${HORIZON}" x2="0" y2="${HEIGHT}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--os-sea-far)"/><stop offset="1" style="stop-color:var(--os-sea-near)"/></linearGradient>` +
    `<linearGradient id="os-haze" x1="0" y1="${HORIZON - 90}" x2="0" y2="${HORIZON}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--os-haze);stop-opacity:0"/><stop offset="1" style="stop-color:var(--os-haze);stop-opacity:1"/></linearGradient>` +
    `<rect x="0" y="${(HORIZON - 90).toFixed(1)}" width="${WIDTH}" height="90" fill="url(#os-haze)"/>` +
    `<linearGradient id="os-fade-g" x1="0" y1="${HORIZON}" x2="0" y2="${HORIZON + 70}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
    `<mask id="os-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#os-fade-g)"/></mask></defs>` +
    `<path d="${water}" fill="url(#os-sea)"/>${k.lineSvg(k.pathOf([[0, HORIZON], [WIDTH, HORIZON]]), { tone: "lo", free: true })}<g class="os-sea">${glints}</g>` +
    `<g mask="url(#os-fade)"><path class="iso-line os-chop" data-tone="lo" data-free=""/><path class="iso-line os-swell" data-tone="mid" data-free=""/></g>`;
}

// ── Compose: sea, then turbines far to near ─────────────────────────────────
const turbines = FARM.map((t) => {
  const tier = tierOf(t);
  const inner = tier === "near" ? nearTurbine(t) : tier === "mid" ? midTurbine(t) : farTurbine(t);
  // distance haze is in the tone ladder, not group opacity: a translucent group is
  // re-composited whenever a blade inside it moves
  return `<g data-turbine="${t.n}">${inner}</g>`;
}).join("");
// ── Live: the rotors. The near and mid ones reuse a pose per step of their own
// size (a three-blade rotor repeats every 120°); far ones are lines. The emitted
// \`near\` list, for rotors worked out every frame, stays empty on the card.
const MID = FARM.filter((t) => tierOf(t) !== "far").map((t) => ({ n: t.n, rpm: t.rpm, phase: t.phase, spec: SPEC([t.x, t.y], rotorOf(t)), steps: Math.ceil(4.2 * t.rpx) }));
const FAR = FARM.filter((t) => tierOf(t) === "far").map((t) => ({ n: t.n, rpm: t.rpm, phase: t.phase, hub: SPEC([t.x, t.y]).hub }));
const live = `
${readFileSync(ROTOR, "utf8").replace(/^export /gm, "")}
${readFileSync(CAMERA, "utf8").replace(/^export /gm, "")}
const CAM = ${JSON.stringify(CAM)};
// the kit's pathOf rounds through toFixed and a regex; this rounds the same, faster
const round1 = (v) => Math.round(v * 10) / 10;
const fastPath = (pts, closed = false) => { let d = ""; for (let i = 0; i < pts.length; i++) d += (i ? "L" : "M") + round1(pts[i][0]) + " " + round1(pts[i][1]); return d && closed ? d + "Z" : d; };
const CTX = { P: CAM, iso: persp, pathOf: fastPath, V: [0, 0, 1], L: ${JSON.stringify(L)}, BANDS: ${JSON.stringify(BANDS)}, eye: CAM.eye };
const AX = ${JSON.stringify(AX)}, SIDE = [-AX[1], AX[0], 0];
const stage = document.querySelector("${SCOPE}");
const svg = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const slot = (g, layer, i) => [...g.querySelectorAll('[data-part="' + layer + '"] [data-blade="' + i + '"] [data-solid="blade"] > path')];
const write = (els, paths) => {
  const values = paths ? [paths.fill, ...paths.shades, paths.top, paths.outline] : els.map(() => "");
  els.forEach((el, j) => { if (el.getAttribute("d") !== values[j]) el.setAttribute("d", values[j]); });
};
const solidRotor = (t) => {
  const g = svg.querySelector('[data-turbine="' + t.n + '"]');
  return { ...t, rotor: makeRotor(t.spec, CTX), slots: [0, 1, 2].map((i) => ({ back: slot(g, "back", i), front: slot(g, "front", i) })), poses: [] };
};
const near = [].map(solidRotor), mid = ${JSON.stringify(MID)}.map(solidRotor);
const far = ${JSON.stringify(FAR)}.map((t) => ({ ...t, el: svg.querySelector('[data-blades="' + t.n + '"]') }));
const angle = (t, seconds) => t.phase + seconds * t.rpm * Math.PI / 30;
// blade i at phi is blade i + k at phi - k·120°, so one third of a turn covers every pose
function cached(t, phi) {
  const third = 2 * Math.PI / 3, q = Math.round((phi / third) * t.steps), base = ((q % t.steps) + t.steps) % t.steps, k = ((Math.floor(q / t.steps) % 3) + 3) % 3;
  const blades = t.poses[base] || (t.poses[base] = t.rotor.pose((base / t.steps) * third));
  return [0, 1, 2].map((i) => blades[(i + k) % 3]);
}
const place = (t, blades) => blades.forEach((b, i) => {
  const on = b.toward ? t.slots[i].front : t.slots[i].back, off = b.toward ? t.slots[i].back : t.slots[i].front;
  write(on, b.blade); write(off, null);
});
// Far rotors move under a pixel a frame, so each is redrawn on alternate frames,
// half of them on each.
let tock = 0;
function draw(seconds, every = false) {
  tock ^= 1;
  for (const t of near) place(t, t.rotor.pose(angle(t, seconds)));
  for (const t of mid) place(t, cached(t, angle(t, seconds)));
  for (let j = 0; j < far.length; j++) {
    if (!every && j % 2 !== tock) continue;
    const t = far[j];
    // each blade a sliver: 5 m wide at the root, to a point at the tip
    const phi = angle(t, seconds);
    let d = "";
    for (let i = 0; i < 3; i++) {
      const f = phi + i * 2 * Math.PI / 3, c = Math.cos(f), s = Math.sin(f);
      const out = (r, w) => persp([t.hub[0] + SIDE[0] * (r * s + w * c), t.hub[1] + SIDE[1] * (r * s + w * c), t.hub[2] + r * c - w * s], CAM);
      d += fastPath([out(3, -2.6), out(111, 0), out(3, 2.6)], true);
    }
    if (t.el.getAttribute("d") !== d) t.el.setAttribute("d", d);
  }
}
// Crest lines for both trains, moving one wavelength per period: the swell rolls
// in toward the camera, the wind sea runs away from it. A crest's breaks and
// wobble come from its index mod the periods in a loop, and a train holds a
// whole number of those, so every 20 s the sea is as it was.
const CRESTS = [
  { el: svg.querySelector(".os-swell"), dir: ${JSON.stringify(SWELL_DIR)}, length: 69, cycles: 3, near: ${VIEW.near}, count: 12, gap: 0.1, scale: 1, wobble: 5 },
  { el: svg.querySelector(".os-chop"), dir: ${JSON.stringify(TRAINS[1].dir)}, length: 25, cycles: 5, near: ${VIEW.near}, count: 10, gap: 0.5, scale: 0.45, wobble: 1.6 },
];
function crests(seconds) {
  for (const c of CRESTS) {
    const sign = c.dir[0] * CAM.fwd[0] + c.dir[1] * CAM.fwd[1] > 0 ? 1 : -1;
    const into = [sign * c.dir[0], sign * c.dir[1]], along = [-into[1], into[0]];
    const shift = (((seconds * c.cycles) / 20) % 1) * c.length, span = c.count * c.length;
    let d = "";
    for (let n = 0; n < c.count; n++) {
      const r = c.near + ((((n * c.length + sign * shift) % span) + span) % span), m = n % c.cycles;
      let run = [];
      const flush = () => { if (run.length > 1) d += fastPath(run); run = []; };
      for (let i = 0; i <= 72; i++) {
        const u = (i / 72 - 0.5) * 3 * r;
        if (Math.sin(u / (19 * c.scale) + m * 1.7) + Math.sin(u / (53 * c.scale) + m * 4.1) < c.gap) { flush(); continue; }
        const w = r + c.wobble * (Math.sin(u / (37 * c.scale) + 2.1 * m) + 0.4 * Math.sin(u / (11 * c.scale) + m));
        run.push(persp([CAM.eye[0] + into[0] * w + along[0] * u, CAM.eye[1] + into[1] * w + along[1] * u, 0], CAM));
      }
      flush();
    }
    c.el.setAttribute("d", d);
  }
}
// A small scene (the card) draws at a capped rate: its blades move a pixel or two
// a frame even then, and it leaves the rest of the page the time.
const GAP = ${Math.round(1000 / VIEW.fps) - 2};
let frame = 0, visible = false, t0 = 0, last = -Infinity;
function tick(now) {
  if (!t0) t0 = now;
  if (now - last >= GAP) {
    last = now;
    draw((now - t0) / 1000);
    crests((now - t0) / 1000);
  }
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
draw(0, true);
crests(0);
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible && !frame && !still.matches) frame = requestAnimationFrame(tick);
}, { rootMargin: "120px 0px" }).observe(stage);
`;

// The scene's own rules, one per line so a backdrop can scope each to its element.
const SCENE_CSS = `.os-glint{fill:none;stroke:var(--os-glint);stroke-width:.7;stroke-linecap:round;opacity:.16;animation:os-crest linear infinite}
.os-glint[data-tier="far"]{stroke:var(--os-glint-far)}
.os-glint[data-tier="glow"]{stroke:var(--anatomy-hi);opacity:.4}
@keyframes os-glow{0%,36%{opacity:.4}50%{opacity:1}64%,100%{opacity:.4}}
.os-glint[data-tier="glow"]{animation-name:os-glow}
.os-glint[data-train="a"]{animation-duration:${(20 / 3).toFixed(4)}s}
.os-glint[data-train="b"]{animation-duration:4s}
@keyframes os-crest{0%,36%{opacity:.16}50%{opacity:1}64%,100%{opacity:.16}}
.os-ripple{animation:os-ripple 4s ease-in-out infinite}
.os-r1{animation-delay:-1.333s}.os-r2{animation-delay:-2.667s}
.os-wash{animation-duration:2s}
@keyframes os-ripple{0%,100%{opacity:.25}50%{opacity:1}}
.os-beacon circle{fill:var(--os-beacon)}
.os-beacon{animation:os-blink 2s steps(1) infinite}
@keyframes os-blink{0%{opacity:1}30%,100%{opacity:.15}}`;
const NAVY = `--anatomy-page:#050f17;--anatomy-card:#081722;--anatomy-paper:#081722;--anatomy-face:#0c1f2d;
--anatomy-shade-0:#040e17;--anatomy-shade-1:#061521;--anatomy-shade-2:#091b29;--anatomy-shade-3:#0c2131;--anatomy-top:#10283a;
--anatomy-lit-top:#163045;--anatomy-lit-shade:#12293b;
--anatomy-hi:#9fb2c2;--anatomy-mid:#5a7184;--anatomy-lo:#2f475a;--anatomy-faint:#1a3041;--anatomy-halo:#01070c;
--anatomy-text:#7f95a7;--anatomy-strong:#c9d6e0;--anatomy-muted:#566d80`;
const SEA = `--os-sea-far:#0b1d2b;--os-sea-near:#061420;--os-haze:#0e2232;--os-glint:#7b93a6;--os-glint-far:#3d5568;--os-beacon:#e0675e`;
const STILL = ".os-glint,.os-ripple,.os-beacon";

// ── Daylight: the turbine card's white steel and sea, under a hazy blue sky ───
// White and light-grey steel shaded by facing, outlines a darker grey of the same
// paint; the transition pieces, boat landing and deck rail in safety yellow; red
// aviation lights. Air between here and a turbine mixes its paint toward the
// horizon's haze, so the rows pale as they recede.
const DAY = {
  "--anatomy-paper": "#f2f4f5", "--anatomy-top": "#f7f9fa",
  "--anatomy-shade-0": "#8592a0", "--anatomy-shade-1": "#a6b1bc", "--anatomy-shade-2": "#c6cfd7", "--anatomy-shade-3": "#dde3e8",
  "--anatomy-hi": "#4f5d6a", "--anatomy-mid": "#6f7c88", "--anatomy-lo": "#929ea9", "--anatomy-faint": "#b4bec7",
  "--os-tp": "#dfa92e", "--os-tp-top": "#ecbf4f",
  "--os-tp-0": "#9c7114", "--os-tp-1": "#b98820", "--os-tp-2": "#cc9a29", "--os-tp-3": "#d8a52f", "--anatomy-lit": "#94701a",
};
const DAY_SEA = "--os-sky-top:#4a82b6;--os-sky-horizon:#a9c8e1;--os-sea-far:#3f7aae;--os-sea-near:#1d5a89;--os-haze:#c6dbeb;" +
  "--os-glint:#e4eff7;--os-glint-far:#b7d0e3;--os-foam:#eef4f8;--os-swell:#d5e6f2;--os-chop:#a6c5dd;--os-horizon:#8db1ce;--os-rail:#b98a1f;--os-beacon:#d2493f";
const HAZE = { colour: "#c2d8ea", from: 1300, depth: 7000, most: 0.6, steps: 12 };
const hazeOf = (d) => Math.round(HAZE.steps * HAZE.most * (1 - Math.exp(-Math.max(0, d - HAZE.from) / HAZE.depth))) / HAZE.steps;
const mix = (a, b, f) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - f) + parseInt(b.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
const varsOf = (paint) => Object.entries(paint).map(([name, value]) => `${name}:${value}`).join(";");
// one rule per haze step, naming the turbines that stand at it
const hazeRules = () => {
  const steps = new Map();
  for (const t of FARM) { const f = hazeOf(t.d); if (f > 0) steps.set(f, [...(steps.get(f) || []), t.n]); }
  return [...steps].map(([f, ns]) => `${ns.map((n) => `[data-turbine="${n}"]`).join(",")}{${varsOf(Object.fromEntries(Object.entries(DAY).map(([name, v]) => [name, mix(v, HAZE.colour, f)])))}}`);
};
const NEAR_N = FARM.find((t) => tierOf(t) === "near").n;
// Lines the navy card draws in its outline tones take sea or paint colours here.
// Each selector outranks the kit's tone rule it replaces.
const DAY_CSS = [
  "svg>.iso-line[data-free]{stroke:var(--os-horizon)}",
  ".iso-line.os-swell{stroke:var(--os-swell)}",
  ".iso-line.os-chop{stroke:var(--os-chop)}",
  ".iso-line.os-ripple{stroke:var(--os-foam)}",
  '.os-glint[data-tier="glow"]{stroke:var(--os-foam)}',
  ".iso-solid[data-lit]>.iso-fill{fill:var(--os-tp)}",
  ".iso-solid[data-lit]>.iso-top{fill:var(--os-tp-top);stroke:var(--os-tp-top)}",
  ...[0, 1, 2, 3].map((s) => `.iso-solid[data-lit]>.iso-shade[data-shade="${s}"]{fill:var(--os-tp-${s});stroke:var(--os-tp-${s})}`),
  ".iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}",
  // a far turbine's first band is its transition piece, drawn flat
  "[data-turbine]>.iso-solid:first-child>.iso-fill{fill:var(--os-tp)}",
  "[data-turbine]>.iso-solid:first-child>.iso-edge{stroke:var(--anatomy-lit)}",
  `[data-turbine="${NEAR_N}"]>.iso-line[data-tone]{stroke:var(--os-rail)}`,
];
const SKY = `<defs><linearGradient id="os-sky" x1="0" y1="0" x2="0" y2="${HORIZON}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--os-sky-top)"/><stop offset="1" style="stop-color:var(--os-sky-horizon)"/></linearGradient></defs><rect width="${WIDTH}" height="${HORIZON}" fill="url(#os-sky)"/>`;

const PAINT = COLOUR
  ? { suffix: "-colour", vars: `${varsOf(DAY)};${DAY_SEA}`, kit: (line) => !line.includes("[data-lit]"), rules: [...DAY_CSS, ...hazeRules()], sky: SKY, card: "#a9c7e0",
      js: `// Generated by figures/ohmera/build.mjs --colour: turns the rotors and moves the sea in\n// the daylight version of the ohmera.ai card. Edit the build, not this file.\n` }
  : { suffix: "", vars: `${NAVY};${SEA}`, kit: () => true, rules: [], sky: "", card: "#081722",
      js: `// Generated by figures/offshore/build.mjs --card (ohmera.ai repo): turns the rotors and moves the\n// sea in the ohmera.ai card. Edit the build, not this file.\n` };

// The card carries the kit's rules for the classes it uses and its own, every
// selector scoped to its element so nothing reaches the rest of the page.
const KIT = k.ISO_CSS.split("\n").filter((line) => /^\.iso-(fill|shade|top|line|solid|dots)/.test(line) && PAINT.kit(line));
const scope = (rule) => (rule.startsWith("@") ? rule : rule.replace(/^[^{]+/, (sel) => sel.split(",").map((x) => `${SCOPE} ${x.trim()}`).join(",")));
const css = `${SCOPE}{${PAINT.vars};--anatomy-weight:.6px}` + [...KIT, ...SCENE_CSS.split("\n"), ...PAINT.rules].map(scope).join("") +
  `@media (prefers-reduced-motion:reduce){${STILL.split(",").map((x) => `${SCOPE} ${x}`).join(",")}{animation:none}}`;
// The ohmera.ai build drew the sea once for its plate page before the card's, and
// the glints draw on the seeded generator, so this pass keeps them where they were.
sea();
const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false"><style>${css}</style>${PAINT.sky}${sea()}${turbines}</svg>`;
const js = PAINT.js + live;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `offshore${PAINT.suffix}.svg`), markup);
writeFileSync(join(OUT, `offshore${PAINT.suffix}.js`), js);

// ── The preview: the card as the homepage draws it ───────────────────────────
const preview = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ohmera.ai card</title>
<link href="https://fonts.googleapis.com/css?family=Quicksand:400,500,700" rel="stylesheet">
<style>body{margin:0;padding:24px 15px;background:#fff;font-family:Quicksand,sans-serif}.card{position:relative;display:flex;max-width:1110px;margin:0 auto 24px;height:160px;overflow:hidden;border:1px solid rgba(0,0,0,.125);border-radius:4px;background:${PAINT.card}}
${SCOPE}{position:absolute;inset:0}${SCOPE} svg{display:block;width:100%;height:100%}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(-90deg,rgba(255,255,255,0.2),white 80%)}
.text{position:relative;z-index:2;margin:auto 15px}h2{margin:0 0 8px;color:#717171;font-weight:500;font-size:2rem;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:lightgrey;text-underline-offset:2px}
.date{color:#6c757d;font-size:1rem;font-weight:500;margin:0}</style></head><body>
<div class="card"><div class="${SCOPE.slice(1)}" aria-hidden="true"></div><div class="text"><h2>ohmera.ai</h2><p class="date">New age energy market intelligence</p></div></div>
<script type="module">
const scene = document.querySelector("${SCOPE}");
scene.insertAdjacentHTML("beforeend", await (await fetch("../../staticfiles/image/thumbnails/ohmera/offshore${PAINT.suffix}.svg")).text());
await import("../../staticfiles/image/thumbnails/ohmera/offshore${PAINT.suffix}.js");
</script></body></html>`;
writeFileSync(join(HERE, `preview${PAINT.suffix}.html`), preview);
console.log(`offshore${PAINT.suffix}.svg ${(markup.length / 1024).toFixed(0)} KB · offshore${PAINT.suffix}.js ${(js.length / 1024).toFixed(0)} KB · ${FARM.length} turbines`);
