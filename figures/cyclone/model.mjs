// One tropical cyclone crossing a coast, as a pure function of time. The build
// reads it to place the still frame and the page inlines it (exports stripped)
// to move the storm, so both agree.
//
// Each storm lives LIFE seconds: it forms over the sea, deepens on its way in,
// makes landfall about halfway and fills over the land. A new storm forms every
// PERIOD seconds, so the last OVERLAP seconds of one, already dissolving inland,
// overlap the first seconds of the next. Every quantity is a smooth function of
// the storm's own age, which is what makes the loop seamless.
export const PERIOD = 90;
export const OVERLAP = 18;
export const LIFE = PERIOD + OVERLAP;
// the moment shown under reduced motion and before the script runs: the eye on the coast
export const STILL = 50;
// the eye's track in viewBox units (x right, y down): a quadratic from the open
// sea at the left to the plateau at the right
export const TRACK = [[1105, 154], [1222, 138], [1390, 62]];
// the pattern turns anticlockwise (northern hemisphere), radians a second
export const SPIN = 0.075;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function stormAt(age) {
  const u = age / LIFE, v = 1 - u;
  const [a, b, c] = TRACK;
  return {
    age,
    x: v * v * a[0] + 2 * u * v * b[0] + u * u * c[0],
    y: v * v * a[1] + 2 * u * v * b[1] + u * u * c[1],
    spin: SPIN * age,
    // organisation: it deepens over warm water, then fills once it is ashore
    strength: (0.5 + 0.5 * smooth(0, 38, age)) * (1 - 0.62 * smooth(56, 100, age)),
    // how much of it there is to see
    visible: smooth(0, 16, age) * (1 - smooth(PERIOD - 2, LIFE, age)),
  };
}

// the storms on screen at loop time t: this period's and the last one's tail
export function stormsAt(t) {
  const age = ((t % PERIOD) + PERIOD) % PERIOD;
  return [stormAt(age), stormAt(Math.min(LIFE, age + PERIOD))];
}
