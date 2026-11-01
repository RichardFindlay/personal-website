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
  exploded: { target: [2.6, 0, 11], zoom: 19.5 },
};

export function toViewBox(point, camera) {
  const q = project(point);
  const t = project(camera.target);
  return [VIEWBOX.width / 2 + camera.zoom * (q[0] - t[0]), VIEWBOX.height / 2 + camera.zoom * (q[1] - t[1])];
}

const CALLOUT_KEYS = PART_TABLE.filter((part) => part.number).map((part) => part.key);

export function stateAt(progress) {
  const p = clamp(progress);
  const channels = {
    z: ease(p / 0.38),
    b: ease((p - 0.03) / 0.3),
    c: ease((p - 0.3) / 0.22),
    y: ease((p - 0.36) / 0.2),
    d: ease((p - 0.46) / 0.32),
  };

  const { assembled, exploded } = CAMERA;
  const camera = {
    target: assembled.target.map((v, i) => lerp(v, exploded.target[i], channels.z)),
    zoom: Math.exp(lerp(Math.log(assembled.zoom), Math.log(exploded.zoom), channels.z)),
  };

  const explode = Object.fromEntries(PART_TABLE.map((part) => [part.key, part.channel ? channels[part.channel] : 0]));
  const callouts = Object.fromEntries(CALLOUT_KEYS.map((key, i) => [key, ease((p - 0.74 - i * 0.012) / 0.1)]));

  return {
    camera,
    explode,
    bladeFade: 1 - ease((channels.b - 0.55) / 0.45),
    baseFade: 1 - ease((p - 0.2) / 0.25) * 0.85,
    callouts,
  };
}
