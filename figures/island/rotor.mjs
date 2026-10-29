/*
 * A small rotor for the island: three tapered blades drawn flat in the rotor's
 * true plane, for any angle, in the island's parallel view. Pure: the build
 * draws the rest pose with it and the page inlines this file (exports
 * stripped) to turn the rotors, so both draw the same blade. Each blade is its
 * planform, the leading half pale and the trailing half a shade darker, the way
 * the twist catches the light.
 */
export function islandRotor({ hub, axis, R, root = 1.6 }, project) {
  const up = [0, 0, 1];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
  const side = norm(cross(up, axis));
  const lift = cross(axis, side);
  // planform along the span (x from 0 at the root to 1 at the tip): chord as a
  // share of R, widest a fifth of the way out
  const STATIONS = [0, 0.08, 0.2, 0.4, 0.6, 0.8, 0.94, 1];
  const chord = (x) => R * (x < 0.2 ? 0.05 + 0.18 * x : 0.086 * Math.pow(1 - (x - 0.2) / 0.8, 0.7) + 0.012);
  const r1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => { const [sx, sy] = project(p); return r1(sx) + " " + r1(sy); };
  const at = (r, c, phi) => {
    // radial direction at angle phi in the rotor plane, and the chord across it
    const cs = Math.cos(phi), sn = Math.sin(phi);
    const rad = [side[0] * sn + lift[0] * cs, side[1] * sn + lift[1] * cs, side[2] * sn + lift[2] * cs];
    const tan = [side[0] * cs - lift[0] * sn, side[1] * cs - lift[1] * sn, side[2] * cs - lift[2] * sn];
    return [hub[0] + rad[0] * r + tan[0] * c, hub[1] + rad[1] * r + tan[1] * c, hub[2] + rad[2] * r + tan[2] * c];
  };
  // one blade's two halves: leading edge to pitch axis, pitch axis to trailing edge
  return function pose(angle) {
    let lead = "", trail = "";
    for (let b = 0; b < 3; b++) {
      const phi = angle + (b * 2 * Math.PI) / 3;
      const span = STATIONS.map((x) => root + (R - root) * x);
      const le = span.map((r, i) => at(r, chord(STATIONS[i]) * 0.35, phi));
      const ax = span.map((r) => at(r, 0, phi));
      const te = span.map((r, i) => at(r, -chord(STATIONS[i]) * 0.65, phi));
      lead += "M" + [...le, ...ax.slice().reverse()].map(pt).join("L") + "Z";
      trail += "M" + [...ax, ...te.slice().reverse()].map(pt).join("L") + "Z";
    }
    return { lead, trail };
  };
}
