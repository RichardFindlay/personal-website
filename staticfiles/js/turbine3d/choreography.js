import { ASSUMED, seaPoint } from "./assumed.js";
import { PUBLISHED } from "./published.js";
import { PART_TABLE } from "./parts/table.js";

const clamp = (x) => Math.min(1, Math.max(0, x));
export const ease = (x) => {
  const c = clamp(x);
  return c * c * (3 - 2 * c);
};

const C = Math.sqrt(3) / 2;
const S = 0.5;

// True isometric with the rotor facing the viewer's lower right: +x runs to the lower right, +y to the upper right, +z straight up.
// The old drawing's second axis ran to the lower left, which is a mirror image; a real rotor has a handedness, so this keeps right-handed axes and views from -y instead.
// `zoom` is viewBox units per one of these projected units, and a projected unit is sqrt(2/3) camera-space metres.
export const VIEW_DIRECTION = [1, -1, 1];
export const project = ([x, y, z]) => [(x + y) * C, (x - y) * S - z];
export const CAMERA_SCALE = Math.sqrt(1.5);
export const VIEWBOX = { width: 800, height: 1000 };

const lerp = (a, b, t) => a + (b - a) * t;

const CAMERA = {
  assembled: { target: [0, 0, -36.65], zoom: 4.49 },
  exploded: { target: [2.6, 0, 11], zoom: 17.5 },
};

const HERO_EDGE = project([ASSUMED.seaTile.heroEdge / 2, -ASSUMED.seaTile.heroEdge / 2, -PUBLISHED.towerTop])[1];

// The pair the hero is composed around is the turbine in focus and its partner in the next row back.
const [REAR_U, REAR_V] = ASSUMED.pair;
// The rear nacelle's highest point on screen, its roof instruments.
const REAR_NACELLE_TOP = project([ASSUMED.raised.rearTop, 0, ASSUMED.raised.top + ASSUMED.instruments.cups.height])[1] + REAR_V * S;
// The turbine in focus stands a little right of the middle, with the farm's rows falling away either side. Its size is set by the farm's spacing: grown with the screen, one row's spacing spans 55% of the screen's width, so the view keeps its balance whatever the spacing.
const MAIN_AT = 0.58;
const ROW_SPAN = 0.55;
// px per projected unit for each px of screen width
const WIDTH_SCALE = ROW_SPAN / (ASSUMED.farmGrid.row * C);
// Below this, on a phone, the pair stops shrinking with the width and lets its outer blades run off the sides.
const MIN_SCALE = 1.9;

// A narrow screen still shows two whole turbines: the one in focus and its partner up to the left, each rotor's tips
// (out from its tower by the overhang) kept PAIR_MARGIN inside the screen. Extents are projected units from the focused tower.
const ROTOR_SPAN = PUBLISHED.tipRadius * C;
const ROTOR_AHEAD = PUBLISHED.overhang * C;
const PAIR_LEFT = -REAR_U * C + ROTOR_SPAN - ROTOR_AHEAD;
const PAIR_RIGHT = ROTOR_SPAN + ROTOR_AHEAD;
const PAIR_MARGIN = 12;

// The resting camera for a hero frame, in px down the figure: the water's hero line exactly on `edge`, the turbine in focus at MAIN_AT across the screen `width`, and the farm grown with it until the rear nacelle reaches `top`.
// Where the pair would not fit whole, it shrinks until it does, and the turbine in focus moves right of MAIN_AT as far as its partner needs.
// The smaller pair also rises off the hero line (by `lift` px), into the tall screen's middle, the more the further it shrank.
const PAIR_LIFT = 0.45;
export function heroCamera({ figureHeight, meet, top, edge, width }) {
  const grown = Math.max(MIN_SCALE, Math.min(width * WIDTH_SCALE, (edge - top) / (HERO_EDGE - REAR_NACELLE_TOP)));
  const scale = Math.min(grown, (width - 2 * PAIR_MARGIN) / (PAIR_LEFT + PAIR_RIGHT));
  const mainX = Math.min(Math.max(width * MAIN_AT, PAIR_MARGIN + PAIR_LEFT * scale), width - PAIR_MARGIN - PAIR_RIGHT * scale);
  const lift = figureHeight * PAIR_LIFT * (1 - scale / grown);
  return { target: [0, 0, (edge - lift - figureHeight / 2) / scale - HERO_EDGE], zoom: scale / meet, shiftX: mainX - width / 2, lift };
}

export function toViewBox(point, camera) {
  const q = project(point);
  const t = project(camera.target);
  return [VIEWBOX.width / 2 + camera.zoom * (q[0] - t[0]), VIEWBOX.height / 2 + camera.zoom * (q[1] - t[1])];
}

// The opening move: the camera starts higher and to the right, looking at open water further out, and settles on the resting view. Angles in radians, `pan` in sea axes.
export const INTRO = { seconds: 4.5, waveSlope: 0.3, azimuth: (18 * Math.PI) / 180, elevation: (22 * Math.PI) / 180, zoom: 0.85, pan: seaPoint([40, -200]) };

// How much of the opening move is left, 1 to 0, at a time since the scene appeared.
export const introAmount = (elapsed) => 1 - ease(elapsed / INTRO.seconds);

const REST_AZIMUTH = Math.atan2(VIEW_DIRECTION[1], VIEW_DIRECTION[0]);
const REST_ELEVATION = Math.atan2(VIEW_DIRECTION[2], Math.hypot(VIEW_DIRECTION[0], VIEW_DIRECTION[1]));

const DEGREES = Math.PI / 180;

// The camera's tour of the turbine as it comes apart: [progress, azimuth, elevation] away from the resting view, in degrees. It holds the resting view until the camera has drawn back, then makes one full turn round the turbine at a steady pace, rising to look almost straight down from the far side and coming back down to the resting view, a whole turn on, for the finished diagram.
const ORBIT = [
  [0.12, 0, 0],
  [0.27, -90, 20],
  [0.42, -180, 47],
  [0.57, -270, 20],
  [0.72, -360, 0],
];

// How fast each view is changing at each key, in degrees per unit of progress: still at the two ends, and elsewhere set by its neighbours so the camera passes through without pausing.
const ORBIT_RATES = ORBIT.map((key, i) => {
  if (i === 0 || i === ORBIT.length - 1) return [0, 0];
  const [before, after] = [ORBIT[i - 1], ORBIT[i + 1]];
  return [1, 2].map((j) => (after[j] - before[j]) / (after[0] - before[0]));
});

// Cubic Hermite between two keys, at `t` 0 to 1 across a span `span` of progress.
const hermite = (a, b, rateA, rateB, t, span) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * span * rateA + (-2 * t3 + 3 * t2) * b + (t3 - t2) * span * rateB;
};

// The [azimuth, elevation] the tour has reached, in radians.
export function orbitAt(p) {
  const next = ORBIT.findIndex(([at]) => at > p);
  if (next <= 0) return [0, 0];
  const [from, to] = [ORBIT[next - 1], ORBIT[next]];
  const span = to[0] - from[0];
  const t = (p - from[0]) / span;
  return [1, 2].map((j) => hermite(from[j], to[j], ORBIT_RATES[next - 1][j - 1], ORBIT_RATES[next][j - 1], t, span) * DEGREES);
}

// The unit direction towards the camera with that much of the opening move left and that far round the tour.
export function viewAxis(amount, [orbitAzimuth, orbitElevation] = [0, 0]) {
  const azimuth = REST_AZIMUTH + INTRO.azimuth * amount + orbitAzimuth;
  const elevation = REST_ELEVATION + INTRO.elevation * amount + orbitElevation;
  return [Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation)];
}

// Away from the resting height the crossing waves misbehave, reading as a woven lattice from high up and as heavy bands of sheen from low down, so their slopes soften there.
export const waveSlopeFor = (axisZ) => lerp(1, INTRO.waveSlope, clamp(Math.abs(Math.asin(axisZ) - REST_ELEVATION) / (15 * DEGREES)));

const CARRIERS = Object.fromEntries(PART_TABLE.map((part) => [part.key, part]));

// Where a part has moved to, in nacelle axes, for a set of channel values.
export const displacement = (part, explode) =>
  part.explode.map((value, i) => value * explode[part.key] + (part.carriedBy ? CARRIERS[part.carriedBy].explode[i] * explode[part.carriedBy] : 0));

// How strongly the rest of the farm still shows once the turbine in focus has come apart.
export const FARM_FADED = 0.35;

// The scroll progress at which the rotor has stopped and the turbine starts coming apart.
export const EXPLODE_START = 0.08;


export function stateAt(progress, assembled = CAMERA.assembled) {
  const p = clamp(progress);
  // Every part starts drawing off together once the rotor stops. The shell gets furthest soonest, so the parts inside never pass through it.
  const apart = (span) => ease((p - EXPLODE_START) / span);
  const channels = {
    z: ease(p / 0.32),
    b: apart(0.2),
    c: apart(0.2),
    s: apart(0.22),
    f: apart(0.26),
    y: apart(0.26),
    d: apart(0.3),
  };

  const { exploded } = CAMERA;
  const camera = {
    target: assembled.target.map((v, i) => lerp(v, exploded.target[i], channels.z)),
    zoom: Math.exp(lerp(Math.log(assembled.zoom), Math.log(exploded.zoom), channels.z)),
  };

  const explode = Object.fromEntries(PART_TABLE.map((part) => [part.key, part.channel ? channels[part.channel] : 0]));

  return {
    camera,
    explode,
    spin: 1 - ease((p - 0.01) / (EXPLODE_START - 0.01)),
    baseFade: 1 - apart(0.22) * 0.85,
    // The water stops catching shadows once the parts are well apart, or theirs would sprawl across it as the camera turns.
    seaShadows: apart(0.22) < 0.9,
    orbit: orbitAt(p),
    // The rest of the farm stays in the background, faded back, as this one comes apart.
    farmFade: 1 - ease(p / 0.16) * (1 - FARM_FADED),
  };
}
