import { PUBLISHED } from "../published.js";
import { ASSUMED } from "../assumed.js";

const STATIONS = PUBLISHED.stations.filter((station, i, all) => i === 0 || station.span - all[i - 1].span > 0.01);
const SPANS = STATIONS.map((station) => station.span);

function pchipSlopes(xs, ys) {
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = ys.slice(1).map((y, i) => (y - ys[i]) / h[i]);
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return m;
}

function pchip(xs, ys) {
  const m = pchipSlopes(xs, ys);
  return (x) => {
    let i = 0;
    while (i < xs.length - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = Math.min(1, Math.max(0, (x - xs[i]) / h));
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const chordAt = pchip(SPANS, STATIONS.map((s) => s.chord));
const twistAt = pchip(SPANS, STATIONS.map((s) => s.twist));
const crvAt = pchip(SPANS, STATIONS.map((s) => s.crv));
const swpAt = pchip(SPANS, STATIONS.map((s) => s.swp));

// One closed ring per airfoil: trailing edge along the suction side to the nose, then along the pressure side back,
// measured from the aerodynamic reference point in chord lengths.
function airfoilRing({ reference, upper, lower }) {
  const ring = [...upper].reverse().concat(lower.slice(1));
  return ring.map(([x, y]) => [x - reference[0], y - reference[1]]);
}

const RINGS = PUBLISHED.airfoils.map(airfoilRing);
export const RING_POINTS = RINGS[0].length;
const SHAPE = Array.from({ length: RING_POINTS }, (_, i) =>
  [0, 1].map((axis) => pchip(SPANS, STATIONS.map((station) => RINGS[station.airfoil][i][axis]))),
);

const TIP = SPANS.at(-1);
const tipScale = (span) => {
  const t = (span - (TIP - ASSUMED.bladeTipRounding)) / ASSUMED.bladeTipRounding;
  return t <= 0 ? 1 : Math.sqrt(Math.max(0, 1 - t * t));
};

// Ring in the blade frame: pitch axis along +z from the root, +x upwind (out of plane), +y the direction of rotation.
// Twist turns the nose upwind; the deck's curve is positive downwind and its sweep positive towards the trailing edge.
export function sectionAt(span) {
  const chord = chordAt(span) * tipScale(span);
  const twist = (twistAt(span) * Math.PI) / 180;
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  const acX = -crvAt(span);
  const acY = -swpAt(span);
  const points = new Float64Array(RING_POINTS * 3);
  for (let i = 0; i < RING_POINTS; i++) {
    const towardTail = SHAPE[i][0](span) * chord;
    const towardSuction = SHAPE[i][1](span) * chord;
    points[i * 3] = acX + -towardTail * sin + towardSuction * cos;
    points[i * 3 + 1] = acY + -towardTail * cos - towardSuction * sin;
    points[i * 3 + 2] = span;
  }
  return { chord, twist: twistAt(span), points };
}

export function bladeSpans() {
  const spans = [];
  for (let i = 1; i < SPANS.length; i++) {
    const steps = Math.max(2, Math.round((SPANS[i] - SPANS[i - 1]) / (SPANS[i] < 16 ? 0.28 : 0.55)));
    for (let k = 0; k < steps; k++) spans.push(SPANS[i - 1] + ((SPANS[i] - SPANS[i - 1]) * k) / steps);
  }
  const tipStart = TIP - ASSUMED.bladeTipRounding;
  const kept = spans.filter((span) => span < tipStart);
  const tipRings = 12;
  for (let k = 0; k <= tipRings; k++) kept.push(tipStart + ASSUMED.bladeTipRounding * Math.sin((k / tipRings) * (Math.PI / 2)));
  return kept;
}
