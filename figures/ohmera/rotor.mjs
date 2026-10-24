/*
 * The rotor of a three-blade upwind turbine, drawn in its true plane for any
 * rotor angle. Pure: the build draws the rest pose with it and the page inlines
 * this file (exports stripped) and calls it every frame, so both draw the same
 * blade. Everything lives inside makeRotor so nothing clashes with the kit.
 */
export function makeRotor(spec, { P, iso, pathOf, V, L, BANDS, eye }) {
  const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
  const mul = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const unit = (p) => mul(p, 1 / (Math.hypot(p[0], p[1], p[2]) || 1));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
  const TAU = Math.PI * 2;

  // arc: samples round each section's visible half; bisect: steps to place a tone
  // edge. A small rotor on a landscape needs far fewer of both than a close-up.
  // girth scales the 54.6 m blade's chord and thickness for a longer blade.
  const { hub, axis: a, R, rootR, span, collar, arc: ARC = 14, bisect: BISECT = 18, girth = 1 } = spec;
  const up = [0, 0, 1];
  const side = unit(cross(up, a)); // to the right of the hub, seen from upwind
  // Toward the viewer from a point: one direction for a parallel view, or toward
  // the eye when there is one (a perspective camera).
  const viewAt = eye ? (p) => unit(add(eye, mul(p, -1))) : () => V;
  const Vh = viewAt(hub), Vp = add(Vh, mul(a, -dot(a, Vh))); // the view, in the rotor plane

  // Planform of a 54.6 m blade, x = 0 at the root flange and 1 at the tip.
  const chord = (x) => {
    const c = girth * (x < 0.03 ? 3.0 : x < 0.22 ? lerp(3.0, 4.1, ease((x - 0.03) / 0.19)) : 4.1 - 3.2 * Math.pow((x - 0.22) / 0.78, 0.75));
    return x > 0.965 ? c * Math.sqrt(Math.max(0, 1 - ((x - 0.965) / 0.035) ** 2)) : c;
  };
  const ratio = (x) => (x < 0.03 ? 1 : x < 0.25 ? lerp(1, 0.42, ease((x - 0.03) / 0.22)) : lerp(0.42, 0.16, Math.pow((x - 0.25) / 0.75, 0.6)));
  const twist = (x) => (16 * Math.PI / 180) * Math.pow(clamp((1 - x) / 0.78, 0, 1), 1.6);
  const shift = (x) => 0.2 * chord(x) * ease((x - 0.03) / 0.15); // pitch axis at 30% chord

  // One cross-section: an ellipse in the plane of u (leading to trailing edge) and v.
  function section(d, T, x, r) {
    const c = Math.max(0.04 * girth, chord(x)), th = Math.max(0.03, c * ratio(x)), q = twist(x);
    const u = add(mul(T, -Math.cos(q)), mul(a, -Math.sin(q)));
    const v = unit(cross(d, u));
    return { C: add(add(hub, mul(d, r)), mul(u, shift(x))), u, v, hc: c / 2, ht: th / 2 };
  }
  const tube = (d, T, r, radius) => ({ C: add(hub, mul(d, r)), u: T, v: unit(cross(d, T)), hc: radius, ht: radius });

  const at = (S, f) => iso(add(add(S.C, mul(S.u, S.hc * Math.cos(f))), mul(S.v, S.ht * Math.sin(f))), P);
  const lit = (S, f) => {
    const nu = Math.cos(f) / S.hc, nv = Math.sin(f) / S.ht;
    return (nu * dot(S.u, L) + nv * dot(S.v, L)) / Math.hypot(nu, nv);
  };
  const band = (score) => { let t = 0; while (t < BANDS.length && score >= BANDS[t]) t++; return Math.min(3, Math.max(0, t - 1)); };

  // The visible half of a section, from one limb to the other, cut where its tone changes.
  function arcOf(S, near) {
    const V = viewAt(S.C);
    let f0 = Math.atan2(dot(S.v, V) / S.ht, dot(S.u, V) / S.hc);
    if (near !== undefined) while (f0 - near > Math.PI) f0 -= TAU;
    if (near !== undefined) while (near - f0 > Math.PI) f0 += TAU;
    const from = f0 - Math.PI / 2, K = ARC, cuts = [from];
    let prev = band(lit(S, from));
    const tones = [prev];
    for (let i = 1; i <= K; i++) {
      const f = from + (Math.PI * i) / K, tone = band(lit(S, f));
      if (tone !== prev) {
        let lo = from + (Math.PI * (i - 1)) / K, hi = f;
        for (let j = 0; j < BISECT; j++) { const m = (lo + hi) / 2; if (band(lit(S, m)) === prev) lo = m; else hi = m; }
        cuts.push((lo + hi) / 2); tones.push(tone); prev = tone;
      }
    }
    cuts.push(from + Math.PI);
    return { f0, from, to: from + Math.PI, cuts, tones };
  }
  const run = (S, f1, f2) => {
    const n = Math.max(2, Math.ceil(Math.abs(f2 - f1) / 0.2));
    return Array.from({ length: n + 1 }, (_, i) => at(S, f1 + ((f2 - f1) * i) / n));
  };

  // A solid swept along dir through its sections: fill, outline, four tones, and
  // the end you can see. At an end whose face is turned toward you the outline
  // runs round the far half of the ring (like the back of a can's lid); at an end
  // turned away it runs round the near half.
  function ribbon(list, dir) {
    let near;
    const arcs = list.map((S) => { const A = arcOf(S, near); near = A.f0; return A; });
    const left = list.map((S, i) => at(S, arcs[i].from)), right = list.map((S, i) => at(S, arcs[i].to));
    const first = list[0], last = list[list.length - 1], a0 = arcs[0], a1 = arcs[arcs.length - 1];
    const startShows = dot(dir, viewAt(first.C)) < 0, endShows = dot(dir, viewAt(last.C)) > 0;
    const tipEnd = (endShows ? run(last, a1.from, a1.to - TAU) : run(last, a1.from, a1.to)).slice(1, -1);
    const rootEnd = (startShows ? run(first, a0.to, a0.from + TAU) : run(first, a0.to, a0.from)).slice(1, -1);
    const ring = [...left, ...tipEnd, ...right.reverse(), ...rootEnd];
    const shades = [[], [], [], []];
    // Where neighbouring sections share their run of tones, each tone is one long
    // strip from the first section of the run to the last, not a strip per segment.
    const strip = (i0, i1) => arcs[i0].tones.forEach((tone, k) => {
      const lead = [], trail = [];
      for (let i = i0; i <= i1; i++) { lead.push(at(list[i], arcs[i].cuts[k])); trail.push(at(list[i], arcs[i].cuts[k + 1])); }
      shades[tone].push(pathOf([...run(list[i0], arcs[i0].cuts[k + 1], arcs[i0].cuts[k]).slice(0, -1), ...lead, ...run(list[i1], arcs[i1].cuts[k], arcs[i1].cuts[k + 1]).slice(1, -1), ...trail.reverse()], true));
    });
    let start = 0;
    for (let i = 0; i + 1 < list.length; i++) {
      const p = arcs[i], q = arcs[i + 1];
      if (p.tones.join() === q.tones.join()) {
        if (i + 2 === list.length || arcs[i + 2].tones.join() !== q.tones.join()) { strip(start, i + 1); start = i + 1; }
      } else {
        start = i + 1;
        // a band is born or dies here: facet the strip finely and let each facet take its tone
        const N = spec.facets ?? 16; // fewer suit a rotor redrawn every frame
        for (let k = 0; k < N; k++) {
          const t0 = k / N, t1 = (k + 1) / N, fp0 = p.from + Math.PI * t0, fp1 = p.from + Math.PI * t1, fq0 = q.from + Math.PI * t0, fq1 = q.from + Math.PI * t1;
          const tone = band((lit(list[i], (fp0 + fp1) / 2) + lit(list[i + 1], (fq0 + fq1) / 2)) / 2);
          shades[tone].push(pathOf([at(list[i], fp0), at(list[i], fp1), at(list[i + 1], fq1), at(list[i + 1], fq0)], true));
        }
      }
    }
    const caps = [startShows ? pathOf(run(first, 0, TAU), true) : "", endShows ? pathOf(run(last, 0, TAU), true) : ""];
    return { fill: pathOf(ring, true), outline: pathOf(ring, true), shades: shades.map((s) => s.join("")), top: caps.join("") };
  }

  /** Every blade at rotor angle phi: which layer it is drawn in, and its paths. */
  function pose(phi) {
    return [0, 1, 2].map((i) => {
      const f = phi + (i * TAU) / 3;
      const d = add(mul(up, Math.cos(f)), mul(side, Math.sin(f))), T = add(mul(up, -Math.sin(f)), mul(side, Math.cos(f)));
      // A blade pointing toward the viewer is in front of the spinner and of its own
      // collar's outer face; one pointing away is behind both.
      const toward = dot(d, Vp) > 0;
      const from = toward && collar ? collar.to : rootR;
      const xs = Array.from({ length: spec.sections + 1 }, (_, k) => k / spec.sections).map((t) => {
        const r = from + t * (R - from);
        return [(r - rootR) / span, r];
      });
      const blade = ribbon(xs.map(([x, r]) => section(d, T, x, r)), d);
      blade.top = ""; // the root is hidden in the collar and the tip has no face
      const fitting = collar ? ribbon([collar.from, (collar.from + collar.to) / 2, collar.to].map((r) => tube(d, T, r, collar.radius)), d) : null;
      return { toward, angle: f, blade, collar: fitting };
    });
  }
  return { pose, side, ribbon };
}
