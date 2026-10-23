/*
 * The parts of an NREL 5 MW turbine that turn with its yaw: nacelle, roof cooler,
 * aviation light, spinner and rotor. Pure, so the build draws the rest pose with
 * it and the page (which inlines this file, exports stripped) redraws them as the
 * agent yaws. Built the way the ohmera.ai card builds its turbines (their prism,
 * their spinner sweep and their rotor), scaled to a 126 m rotor on a 90 m hub.
 */
export function makeNacelles({ P, iso, pathOf, L, BANDS, eye, makeRotor }) {
  const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const mul = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const unit = (p) => mul(p, 1 / (Math.hypot(p[0], p[1], p[2]) || 1));
  const at = (p) => iso(p, P);
  const band = (score) => { let t = 0; while (t < BANDS.length && score >= BANDS[t]) t++; return Math.min(3, Math.max(0, t - 1)); };
  const ctx = { P, iso, pathOf, V: [0, 0, 1], L, BANDS, eye };

  const N = { hub: 90, overhang: 5, body: [-9.5, 3.6], half: 1.95, z0: 87.6, z1: 91.4, cooler: [-9, -5.6], coolHalf: 1.35, coolZ: 92.5, spinnerR: 1.6, nose: 2.6 };
  const ROTOR = { R: 63, rootR: 1.6, span: 61.4, girth: 1.13, collar: null };

  // The rotor faces upwind (-x) turned by its yaw; LAT is to its right seen from upwind.
  function frame([x, y], yaw) {
    const g = (yaw * Math.PI) / 180, AX = [-Math.cos(g), Math.sin(g), 0], LAT = [-AX[1], AX[0], 0];
    const onN = (ax, lat, z) => [x + ax * AX[0] + lat * LAT[0], y + ax * AX[1] + lat * LAT[1], z];
    return { AX, LAT, onN, hub: onN(N.overhang, 0, N.hub) };
  }

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
      if (dot(normal, sub(eye, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2])) <= 0) continue;
      shades[band(dot(normal, L))].push(pathOf([lo[i], lo[j], hi[j], hi[i]].map(at), true));
      crease.push(pathOf([hi[i], hi[j]].map(at)));
    }
    const outline = pathOf(hull([...lo, ...hi].map(at)), true);
    return { fill: outline, outline, shades: shades.map((s) => s.join("")), top: eye[2] > z1 ? pathOf(hi.map(at), true) : "", crease: crease.join("") };
  }

  // a rounded rectangle in the nacelle's own (along, across) coordinates
  function plan(F, a0, a1, half, r, steps = 3) {
    const pts = [];
    const corner = (ca, cl, from) => { for (let k = 0; k <= steps; k++) { const f = from + (Math.PI / 2) * (k / steps); pts.push(F.onN(ca + r * Math.cos(f), cl + r * Math.sin(f), 0).slice(0, 2)); } };
    corner(a1 - r, half - r, 0); corner(a0 + r, half - r, Math.PI / 2); corner(a0 + r, -half + r, Math.PI); corner(a1 - r, -half + r, 1.5 * Math.PI);
    return pts;
  }

  const sweep = makeRotor({ hub: [0, 0, 0], axis: [1, 0, 0], R: 1, rootR: 0, span: 1, sections: 1, arc: 8, bisect: 8 }, ctx).ribbon;
  function spinner(F) {
    const rOf = (s) => (s <= 0 ? N.spinnerR : N.spinnerR * Math.sqrt(Math.max(0, 1 - (s / N.nose) ** 2)));
    const ss = [-1.2, 0, ...Array.from({ length: 5 }, (_, i) => (N.nose * 0.99 * (i + 1)) / 5)];
    return sweep(ss.map((s) => ({ C: add(F.hub, mul(F.AX, s)), u: [0, 0, 1], v: F.LAT, hc: rOf(s), ht: rOf(s) })), F.AX);
  }

  /** Every yawing part of the turbine at site, yawed yaw degrees. */
  function nacelle(site, yaw) {
    const F = frame(site, yaw);
    return {
      body: prism(plan(F, N.body[0], N.body[1], N.half, 0.9), N.z0, N.z1),
      cooler: prism(plan(F, N.cooler[0], N.cooler[1], N.coolHalf, 0.3, 2), N.z1, N.coolZ),
      // the panel joint across the roof, between the cooler and the hub
      joint: pathOf([F.onN(-2.2, -N.half, N.z1), F.onN(-2.2, N.half, N.z1)].map(at)),
      light: at(F.onN(-7.3, 0, N.coolZ + 0.5)),
      spinner: spinner(F),
      hub: F.hub,
      axis: F.AX,
    };
  }

  const rotorSpec = (site, yaw, detail) => { const F = frame(site, yaw); return { hub: F.hub, axis: F.AX, ...ROTOR, ...detail }; };
  return { nacelle, rotorSpec, frame };
}
