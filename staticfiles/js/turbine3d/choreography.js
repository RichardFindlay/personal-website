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

const SEA_EDGE = project([ASSUMED.seaTile.front / 2, -ASSUMED.seaTile.front / 2, -PUBLISHED.towerTop])[1];

// The pair the hero is composed around is the turbine in focus and the one behind it, the farm's second.
const [REAR_U, REAR_V] = ASSUMED.farm[1];
// The rear nacelle's highest point on screen, its roof instruments.
const REAR_NACELLE_TOP = project([ASSUMED.raised.rearTop, 0, ASSUMED.raised.top + ASSUMED.instruments.cups.height])[1] + REAR_V * S;
// Measured off the 943 px layout that balanced them: px per projected unit for each px of screen width, and the middle of the pair as a share of the width.
const WIDTH_SCALE = 3.44 / 943;
const PAIR_CENTRE = 0.425;
// Below this, on a phone, the pair stops shrinking with the width and lets its outer blades run off the sides.
const MIN_SCALE = 1.9;

// The resting camera for a hero frame, in px down the figure: the water's front edge exactly on `edge`, and the pair grown with the screen `width`, centred on PAIR_CENTRE, until the rear nacelle reaches `top`.
export function heroCamera({ figureHeight, meet, top, edge, width }) {
  const scale = Math.max(MIN_SCALE, Math.min(width * WIDTH_SCALE, (edge - top) / (SEA_EDGE - REAR_NACELLE_TOP)));
  const shiftX = width * (PAIR_CENTRE - 0.5) - (REAR_U * C * scale) / 2;
  return { target: [0, 0, (edge - figureHeight / 2) / scale - SEA_EDGE], zoom: scale / meet, shiftX };
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

// The camera's tour of the turbine as it comes apart: [progress, azimuth, elevation] away from the resting view, in degrees. It holds on a side view as the blades draw off, looks straight down as the cover lifts, comes round behind for the drivetrain, and is home for the finished diagram. Azimuths stay on the side of the turbine with sea behind it.
const ORBIT = [
  [0.04, 0, 0],
  [0.2, -45, -17],
  [0.36, 0, 47],
  [0.56, -75, -7],
  [0.72, 0, 0],
];

// The [azimuth, elevation] the tour has reached, in radians, easing to a stop at each view.
export function orbitAt(p) {
  const next = ORBIT.findIndex(([at]) => at > p);
  if (next <= 0) return [0, 0];
  const [from, to] = [ORBIT[next - 1], ORBIT[next]];
  const t = ease((p - from[0]) / (to[0] - from[0]));
  return [lerp(from[1], to[1], t) * DEGREES, lerp(from[2], to[2], t) * DEGREES];
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

export function stateAt(progress, assembled = CAMERA.assembled) {
  const p = clamp(progress);
  const channels = {
    z: ease(p / 0.38),
    b: ease((p - 0.12) / 0.24),
    c: ease((p - 0.3) / 0.22),
    s: ease((p - 0.34) / 0.22),
    f: ease((p - 0.4) / 0.2),
    y: ease((p - 0.36) / 0.2),
    d: ease((p - 0.46) / 0.32),
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
    spin: 1 - ease((p - 0.02) / 0.1),
    baseFade: 1 - ease((p - 0.14) / 0.22) * 0.85,
    // How far the sea has faded to its backdrop strength behind the exploded parts, which each theme sets.
    seaFocus: ease((p - 0.14) / 0.22),
    orbit: orbitAt(p),
    farmFade: 1 - ease(p / 0.16),
  };
}
