/*
 * The parts of an NREL 5 MW turbine that turn with its yaw, close up: the yaw
 * drives and the pointer over the tower-top scale, the bedplate collar, the
 * nacelle canopy with its seams, louvres, roof hatch, cooler and met mast, the
 * helihoist platform with its railings, the main shaft and the spinner. Pure, so
 * the build draws the rest pose with it and the page (which inlines this file,
 * exports stripped) redraws it as the agent yaws. One unit is a metre: x
 * downwind (east), y north, z up, the tower's axis through the origin.
 */
export function makeTurbine({ P, iso, pathOf, L, BANDS, eye, makeRotor }) {
  const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const mul = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const unit = (p) => mul(p, 1 / (Math.hypot(p[0], p[1], p[2]) || 1));
  const at = (p) => iso(p, P);
  const RAD = Math.PI / 180;
  const band = (score) => { let t = 0; while (t < BANDS.length && score >= BANDS[t]) t++; return Math.min(3, Math.max(0, t - 1)); };
  const faces = (normal, p) => dot(normal, sub(eye, p)) > 0;
  const depth = (p) => dot(sub(p, eye), P.fwd);
  const ctx = { P, iso, pathOf, V: [0, 0, 1], L, BANDS, eye };
  const sweep = makeRotor({ hub: [0, 0, 0], axis: [1, 0, 0], R: 1, rootR: 0, span: 1, sections: 1, arc: 12, bisect: 10 }, ctx).ribbon;

  // tower top 87.6 m and hub 90 m with 5 m overhang, as the NREL 5 MW; the
  // canopy is a 5 MW nacelle's 13 × 4.6 × 4.3 m
  const N = { top: 87.6, hub: 90, overhang: 5, floor: 89.2, roof: 93.5, cap: 93.72, rear: -10.4, front: 2.6, half: 2.3, corner: 0.7 };
  const YAW = { gearZ: 87.95, skirtR: 1.82, driveR: 2.3, drives: [24, 60, 120, 156, -24, -60, -120, -156], pointer: eye[1] > 0 ? -90 : 90, pointerR: 2.74 };
  const DECK = { a0: -13.4, a1: N.rear, z: N.roof, rail: 1.1, posts: 4 };
  const SPIN = { R: 2.7, back: -1.6, nose: 3.4 };
  const ROTOR = { R: 63, rootR: 2.2, span: 60.8, girth: 1.13, collar: { from: 2.05, to: 2.95, radius: 1.82 } };

  // The rotor faces upwind (-x) turned by its yaw; LAT is to its right seen from upwind.
  function frame(yaw) {
    const g = yaw * RAD, AX = [-Math.cos(g), Math.sin(g), 0], LAT = [-AX[1], AX[0], 0];
    const on = (a, l, z) => [a * AX[0] + l * LAT[0], a * AX[1] + l * LAT[1], z];
    const polar = (deg, r, z) => on(r * Math.cos(deg * RAD), r * Math.sin(deg * RAD), z);
    return { AX, LAT, on, polar, hub: on(N.overhang, 0, N.hub) };
  }

  // ── markup ─────────────────────────────────────────────────────────────────
  const solid = (s, tone = "hi", lit = false) => s ? `<g class="iso-solid" data-seamless=""${lit ? ` data-lit=""` : ""}><path class="iso-fill" d="${s.fill}"/>${s.shades.map((d, n) => (d ? `<path class="iso-shade" data-shade="${n}" d="${d}"/>` : "")).join("")}${s.top ? `<path class="iso-top" d="${s.top}"/>` : ""}${s.crease ? `<path class="iso-line iso-crease" data-tone="${tone === "hi" ? "lo" : "faint"}" d="${s.crease}"/>` : ""}<path class="iso-line iso-edge" data-tone="${tone}" d="${s.outline}"/></g>` : "";
  const line = (d, tone = "lo") => (d ? `<path class="iso-line" data-tone="${tone}" d="${d}"/>` : "");
  const seg = (...pts) => pathOf(pts.map(at));
  const dots = (pts, r, tone = "mid") => `<g class="iso-dots" data-tone="${tone}">${pts.map((p) => { const [x, y] = at(p); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`; }).join("")}</g>`;

  function hull(points) {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (const p of pts.reverse()) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  }

  // An upright prism over a convex plan: the faces you can see, each in its tone.
  function prism(plan, z0, z1) {
    const area = plan.reduce((s, p, i) => { const q = plan[(i + 1) % plan.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ring = area < 0 ? [...plan].reverse() : plan, n = ring.length;
    const lo = ring.map(([x, y]) => [x, y, z0]), hi = ring.map(([x, y]) => [x, y, z1]);
    const shades = [[], [], [], []], crease = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = ring[i], b = ring[j];
      const normal = unit([b[1] - a[1], -(b[0] - a[0]), 0]);
      if (!faces(normal, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2])) continue;
      shades[band(dot(normal, L))].push(pathOf([lo[i], lo[j], hi[j], hi[i]].map(at), true));
      crease.push(pathOf([hi[i], hi[j]].map(at)));
    }
    const outline = pathOf(hull([...lo, ...hi].map(at)), true);
    return { fill: outline, outline, shades: shades.map((s) => s.join("")), top: eye[2] > z1 ? pathOf(hi.map(at), true) : "", crease: crease.join("") };
  }

  // a rounded rectangle in the nacelle's own (along, across) coordinates
  function plan(F, a0, a1, l0, l1, r, steps = 3) {
    const pts = [];
    const corner = (ca, cl, from) => { for (let k = 0; k <= steps; k++) { const f = from + (Math.PI / 2) * (k / steps); pts.push(F.on(ca + r * Math.cos(f), cl + r * Math.sin(f), 0).slice(0, 2)); } };
    corner(a1 - r, l1 - r, 0); corner(a0 + r, l1 - r, Math.PI / 2); corner(a0 + r, l0 + r, Math.PI); corner(a1 - r, l0 + r, 1.5 * Math.PI);
    return pts;
  }
  const box = (F, a0, a1, l0, l1, z0, z1, r = 0.04) => prism(plan(F, a0, a1, l0, l1, r, 1), z0, z1);

  // round bodies: an upright post, and a bar along any level direction
  const post = ([x, y], z0, z1, r0, r1 = r0) => sweep([0, 1].map((t) => ({ C: [x, y, z0 + t * (z1 - z0)], u: [1, 0, 0], v: [0, 1, 0], hc: t ? r1 : r0, ht: t ? r1 : r0 })), [0, 0, 1]);
  const bar = (p, q, r) => { const d = unit(sub(q, p)), v = [-d[1], d[0], 0]; return sweep([p, q].map((C) => ({ C, u: [0, 0, 1], v, hc: r, ht: r })), d); };

  // ── the yaw system under the canopy ───────────────────────────────────────
  function yawDeck(F) {
    const out = [];
    const skirtAt = F.polar(0, 0, 88.5);
    const drive = (deg) => {
      const c = F.polar(deg, YAW.driveR, 0), xy = c.slice(0, 2);
      const arm = [deg - 5, deg + 5].map((d) => F.polar(d, YAW.skirtR - 0.05, 0).slice(0, 2));
      const bracket = prism([...arm, ...[deg + 7, deg - 7].map((d) => F.polar(d, YAW.driveR + 0.05, 0).slice(0, 2))], 88.55, 88.78);
      const body = solid(post(xy, 87.62, 88.3, 0.25), "mid") + solid(post(xy, 88.3, 88.42, 0.27), "mid") +
        solid(post(xy, 88.42, 89.1, 0.19), "hi") + solid(post(xy, 89.1, 89.18, 0.21), "mid");
      return { d: depth([c[0], c[1], 88.4]), near: depth([c[0], c[1], 88.4]) < depth(skirtAt), markup: [solid(bracket, "mid"), body] };
    };
    const drives = YAW.drives.map(drive).sort((p, q) => q.d - p.d);
    for (const d of drives) if (!d.near) out.push(d.markup[1], d.markup[0]);
    out.push(solid(post([0, 0], YAW.gearZ, N.floor, YAW.skirtR, YAW.skirtR), "mid"));
    // the pointer: a flat arm from the collar out over the tower-top scale, its tip lit
    const p = YAW.pointer;
    out.push(solid(prism([F.polar(p - 4, YAW.skirtR - 0.05, 0), F.polar(p - 1.4, YAW.pointerR - 0.1, 0), F.polar(p, YAW.pointerR, 0), F.polar(p + 1.4, YAW.pointerR - 0.1, 0), F.polar(p + 4, YAW.skirtR - 0.05, 0)].map((q) => q.slice(0, 2)), 87.97, 88.03), "hi"));
    out.push(line(seg(F.polar(p, YAW.pointerR - 0.32, 88.03), F.polar(p, YAW.pointerR, 88.03)), "lit"));
    for (const d of drives) if (d.near) out.push(...d.markup);
    return out.join("");
  }

  // ── the canopy, its roof and the helihoist platform ───────────────────────
  function canopy(F) {
    const out = [];
    // the main shaft between the canopy's nose and the hub
    out.push(solid(bar(F.on(N.front - 0.2, 0, N.hub), F.on(N.overhang + SPIN.back + 0.05, 0, N.hub), 1.3), "mid"));
    out.push(solid(bar(F.on(N.front - 0.2, 0, N.hub), F.on(N.front + 0.35, 0, N.hub), 1.55), "mid"));
    // the platform's struts run up from the canopy's foot under the deck
    for (const l of [-1.5, 1.5]) out.push(line(seg(F.on(N.rear, l, N.floor), F.on(DECK.a0 + 0.6, l, DECK.z - 0.22)), "mid"));
    out.push(solid(prism(plan(F, N.rear, N.front, -N.half, N.half, N.corner), N.floor, N.roof), "hi", true));
    // side seams, a louvre and a door on whichever side faces the camera
    for (const s of [-1, 1]) {
      const l = s * N.half;
      if (!faces(mul(F.LAT, s), F.on(-4, l, 91))) continue;
      out.push(line([-6.8, -3.4, 0.2].map((a) => seg(F.on(a, l, N.floor), F.on(a, l, N.roof))).join(""), "faint"));
      const [a0, a1, z0, z1] = [-9.5, -8.0, 90.1, 92.3];
      out.push(line(seg(F.on(a0, l, z0), F.on(a1, l, z0), F.on(a1, l, z1), F.on(a0, l, z1)) + "Z", "mid"));
      out.push(line(Array.from({ length: 6 }, (_, n) => z0 + ((n + 1) * (z1 - z0)) / 7).map((z) => seg(F.on(a0, l, z), F.on(a1, l, z))).join(""), "lo"));
      const [d0, d1, h0, h1] = [-2.6, -1.6, 89.5, 91.9];
      out.push(line(seg(F.on(d0, l, h0), F.on(d1, l, h0), F.on(d1, l, h1), F.on(d0, l, h1)) + "Z", "mid"));
      out.push(dots([F.on(d1 - 0.18, l, 90.7)], 0.45, "hi"));
    }
    if (faces(mul(F.AX, -1), F.on(N.rear, 0, 91))) out.push(line([-1.1, 1.1].map((l) => seg(F.on(N.rear, l, N.floor), F.on(N.rear, l, N.roof))).join(""), "faint"));
    const capPlan = plan(F, N.rear + 0.3, N.front - 0.3, -N.half + 0.3, N.half - 0.3, N.corner - 0.25);
    out.push(solid(prism(capPlan, N.roof, N.cap), "hi"));
    const roofL = N.half - 0.3;
    out.push(line([-4.3, -2.2].map((a) => seg(F.on(a, -roofL, N.cap), F.on(a, roofL, N.cap))).join(""), "faint"));
    // roof hatch with its hinges and a grab bar
    out.push(solid(box(F, -1.3, 0.8, -0.9, 0.9, N.cap, N.cap + 0.16, 0.1), "hi"));
    out.push(dots([-0.5, 0.5].map((l) => F.on(-1.3, l, N.cap + 0.16)), 0.45, "mid"));
    out.push(solid(box(F, 0.45, 0.55, -0.35, 0.35, N.cap + 0.16, N.cap + 0.24), "mid"));
    // the cooler: a radiator box with fins and two fans on top
    const C = { a0: -8.2, a1: -5.0, half: 1.9, z: N.cap + 1.45 };
    out.push(solid(box(F, C.a0, C.a1, -C.half, C.half, N.cap, C.z, 0.08), "hi"));
    const fins = [];
    for (const s of [-1, 1]) {
      const l = s * C.half;
      if (faces(mul(F.LAT, s), F.on((C.a0 + C.a1) / 2, l, C.z - 0.6))) for (let a = C.a0 + 0.3; a < C.a1 - 0.15; a += 0.26) fins.push(seg(F.on(a, l, N.cap + 0.12), F.on(a, l, C.z - 0.12)));
    }
    if (faces(mul(F.AX, -1), F.on(C.a0, 0, C.z - 0.6))) for (let l = -C.half + 0.3; l < C.half - 0.15; l += 0.26) fins.push(seg(F.on(C.a0, l, N.cap + 0.12), F.on(C.a0, l, C.z - 0.12)));
    // the fins end on a frame rail along the top and the foot of each finned face
    const rails = [];
    for (const s of [-1, 1]) if (faces(mul(F.LAT, s), F.on((C.a0 + C.a1) / 2, s * C.half, C.z - 0.6))) for (const z of [N.cap + 0.12, C.z - 0.12]) rails.push(seg(F.on(C.a0 + 0.08, s * C.half, z), F.on(C.a1 - 0.08, s * C.half, z)));
    if (faces(mul(F.AX, -1), F.on(C.a0, 0, C.z - 0.6))) for (const z of [N.cap + 0.12, C.z - 0.12]) rails.push(seg(F.on(C.a0, -C.half + 0.08, z), F.on(C.a0, C.half - 0.08, z)));
    out.push(line(fins.join(""), "lo"), line(rails.join(""), "mid"));
    for (const a of [-7.35, -5.85]) {
      const ring = Array.from({ length: 25 }, (_, n) => F.on(a + 0.62 * Math.cos((n / 24) * 2 * Math.PI), 0.62 * Math.sin((n / 24) * 2 * Math.PI), C.z));
      out.push(line(pathOf(ring.map(at), true), "mid"));
      out.push(line([0, 1, 2, 3, 4].map((n) => { const f = (n / 5) * 2 * Math.PI + 0.3; return seg(F.on(a + 0.12 * Math.cos(f), 0.12 * Math.sin(f), C.z), F.on(a + 0.62 * Math.cos(f + 0.5), 0.62 * Math.sin(f + 0.5), C.z)); }).join(""), "lo"));
      out.push(dots([F.on(a, 0, C.z)], 0.6, "hi"));
    }
    // the met mast: two posts and a crossbar carrying the anemometer and the wind vane
    const M = { a: -9.4, l: 1.55, z: N.cap + 2.3 };
    const feet = [-M.l, M.l].map((l) => F.on(M.a, l, N.cap));
    feet.sort((p, q) => depth(q) - depth(p));
    for (const f of feet) out.push(solid(post(f, N.cap, M.z + 0.12, 0.08), "hi"));
    out.push(solid(bar(F.on(M.a, -M.l, M.z), F.on(M.a, M.l, M.z), 0.06), "hi"));
    const cups = F.on(M.a, 0.7, M.z), vane = F.on(M.a, -0.7, M.z);
    out.push(solid(post(cups, M.z, M.z + 0.42, 0.035), "mid"), solid(post(vane, M.z, M.z + 0.42, 0.035), "mid"));
    const cupTop = add(cups, [0, 0, 0.42]);
    const arms = [0, 120, 240].map((d) => add(cupTop, [0.45 * Math.cos(d * RAD + 0.4), 0.45 * Math.sin(d * RAD + 0.4), 0]));
    out.push(line(arms.map((q) => seg(cupTop, q)).join(""), "hi"), dots(arms, 0.9, "hi"), dots([cupTop], 0.5, "hi"));
    // the vane keeps to the wind, from the west, whatever the nacelle's yaw
    const vTop = add(vane, [0, 0, 0.42]);
    out.push(line(seg(add(vTop, [-0.5, 0, 0]), add(vTop, [0.35, 0, 0])), "hi"));
    const fin = pathOf([[0.3, 0.02], [0.95, 0.34], [0.95, -0.12], [0.3, -0.02]].map(([x, z]) => at(add(vTop, [x, 0, z]))), true);
    out.push(solid({ fill: fin, outline: fin, shades: ["", "", "", ""] }, "hi"), dots([add(vTop, [-0.5, 0, 0])], 0.9, "hi"));
    // the helihoist platform off the canopy's tail: deck, hoist hatch, drop-zone ring, railings
    out.push(solid(box(F, DECK.a0, DECK.a1, -N.half, N.half, DECK.z - 0.22, DECK.z, 0.01), "hi"));
    const hc = (DECK.a0 + DECK.a1) / 2;
    out.push(line(pathOf(Array.from({ length: 33 }, (_, n) => F.on(hc + 1.15 * Math.cos((n / 32) * 2 * Math.PI), 1.15 * Math.sin((n / 32) * 2 * Math.PI), DECK.z)).map(at), true), "lo"));
    out.push(line(seg(F.on(hc - 0.55, -0.55, DECK.z), F.on(hc + 0.55, -0.55, DECK.z), F.on(hc + 0.55, 0.55, DECK.z), F.on(hc - 0.55, 0.55, DECK.z)) + "Z", "mid"));
    const edge = [[DECK.a1 - 0.08, N.half], [DECK.a0, N.half], [DECK.a0, -N.half], [DECK.a1 - 0.08, -N.half]];
    const along = [];
    for (let i = 0; i + 1 < edge.length; i++) {
      const [p, q] = [edge[i], edge[i + 1]], n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.95));
      for (let k = i ? 1 : 0; k <= n; k++) along.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
    }
    const rail = (h) => seg(...along.map(([a, l]) => F.on(a, l, DECK.z + h)));
    out.push(line(along.map(([a, l]) => seg(F.on(a, l, DECK.z), F.on(a, l, DECK.z + DECK.rail))).join(""), "mid"));
    out.push(line(rail(DECK.rail / 2), "lo"), line(rail(DECK.rail), "hi"));
    return out.join("");
  }

  function spinner(F) {
    const rOf = (s) => (s <= 0 ? SPIN.R : SPIN.R * Math.sqrt(Math.max(0, 1 - (s / SPIN.nose) ** 2)));
    const ss = [SPIN.back, SPIN.back / 2, 0, ...Array.from({ length: 7 }, (_, i) => (SPIN.nose * 0.995 * (i + 1)) / 7)];
    return sweep(ss.map((s) => ({ C: add(F.hub, mul(F.AX, s)), u: [0, 0, 1], v: F.LAT, hc: rOf(s), ht: rOf(s) })), F.AX);
  }

  /** Markup of every yawing part, at yaw degrees, back to front. */
  const yawing = (yaw) => { const F = frame(yaw); return yawDeck(F) + canopy(F); };
  /** Where the met mast's two aviation lights sit on the screen at yaw degrees. */
  const lights = (yaw) => { const F = frame(yaw); return [-1.55, 1.55].map((l) => at(F.on(-9.4, l, N.cap + 2.3 + 0.2))); };
  const rotorSpec = (yaw, detail) => { const F = frame(yaw); return { hub: F.hub, axis: F.AX, ...ROTOR, ...detail }; };
  return { yawing, lights, rotorSpec, spinner: (yaw) => spinner(frame(yaw)), frame, N, YAW };
}
