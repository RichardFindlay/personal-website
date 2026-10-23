// One tropical cyclone crossing a coast, as a pure function of time. The build
// reads it to place the still frame and the page inlines it (exports stripped)
// to move the storm, so both agree.
//
// Each storm lives LIFE seconds: it gathers over the sea, deepens on its way in,
// makes landfall about halfway and fills over the land until it is gone. The
// next one gathers as the last few wisps of the old one clear, so there is one
// storm on screen at a time. Every quantity is a smooth function of the storm's
// own age, which is what makes the loop seamless.
export const PERIOD = 90;
export const LIFE = PERIOD + 6;
// the moment shown under reduced motion and before the script runs: just ashore
export const STILL = 60;
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
    strength: (0.5 + 0.5 * smooth(0, 36, age)) * (1 - 0.62 * smooth(50, 88, age)),
    // a young storm is compact; a dying one spreads as it fills
    size: (0.62 + 0.38 * smooth(0, 34, age)) * (1 + 0.14 * smooth(56, LIFE, age)),
    // how much cloud there is: it gathers, and over the land it rains itself out
    visible: smooth(1, 19, age) * (1 - smooth(PERIOD - 16, LIFE, age)),
  };
}

// the storms at loop time t: this period's, and the last one's final seconds
export function stormsAt(t) {
  const age = ((t % PERIOD) + PERIOD) % PERIOD;
  return [stormAt(age), stormAt(Math.min(LIFE, age + PERIOD))];
}
