// Asserts the spec against literal values read from figures/turbine3d/source, under plain Node.
// Run: node check.mjs
import assert from "node:assert/strict";
import { PUBLISHED } from "../../staticfiles/js/turbine3d/published.js";
import { ASSUMED, seaPoint, stageRatio, hssOffset, hullHalfWidthAt } from "../../staticfiles/js/turbine3d/assumed.js";
import { INTRO, heroCamera, introAmount, orbitAt, stateAt, project, toViewBox, viewAxis, VIEW_DIRECTION, CAMERA_SCALE, VIEWBOX } from "../../staticfiles/js/turbine3d/choreography.js";
import { PART_TABLE } from "../../staticfiles/js/turbine3d/parts/table.js";
import { sectionAt, RING_POINTS } from "../../staticfiles/js/turbine3d/parts/loft.js";
import { WAVES } from "../../staticfiles/js/turbine3d/parts/waves.js";

const close = (actual, expected, tolerance = 1e-9, what = "") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what} expected ${expected}, got ${actual}`);

assert.equal(PUBLISHED.tipRadius, 63);
assert.equal(PUBLISHED.hubRadius, 1.5);
assert.equal(PUBLISHED.stations.length, 19);
assert.equal(PUBLISHED.stations[11].twist, 4.188);
assert.equal(PUBLISHED.stations[11].chord, 3.256);
assert.equal(PUBLISHED.stations[11].span, 38.95);
assert.equal(PUBLISHED.stations[0].chord, 3.542);
assert.equal(PUBLISHED.airfoils[PUBLISHED.stations[0].airfoil].name, "Cylinder1");
assert.equal(PUBLISHED.airfoils[PUBLISHED.stations[11].airfoil].name, "DU21_A17");
assert.equal(PUBLISHED.airfoils[PUBLISHED.stations[18].airfoil].name, "NACA64_A17");
assert.equal(PUBLISHED.precone, 2.5);
assert.equal(PUBLISHED.shaftTilt, 5);
assert.equal(PUBLISHED.overhang, 5.0191);
assert.equal(PUBLISHED.towerTopToShaft, 1.96256);
assert.equal(PUBLISHED.towerTop, 87.6);
assert.equal(PUBLISHED.towerBase, 10);
assert.equal(PUBLISHED.tower[0].diam, 6);
assert.equal(PUBLISHED.tower.at(-1).diam, 3.87);
assert.equal(PUBLISHED.monopileDiameter, 6);
assert.equal(PUBLISHED.monopileWall, 0.06);
assert.equal(PUBLISHED.towerBaseWall, 0.027);
assert.equal(PUBLISHED.towerTopWall, 0.019);
close(PUBLISHED.seabed, -20, 0.001);
assert.equal(PUBLISHED.gearboxRatio, 97);
assert.equal(PUBLISHED.ratedRotorRpm, 12.1);
assert.equal(PUBLISHED.hubMass, 56780);
assert.equal(PUBLISHED.nacelleMass, 240000);
assert.equal(PUBLISHED.waveHs, 6);
assert.equal(PUBLISHED.waveTp, 10);

const tilt = (PUBLISHED.shaftTilt * Math.PI) / 180;
const C = Math.sqrt(3) / 2;
const apexHeight = PUBLISHED.towerTop + PUBLISHED.towerTopToShaft + PUBLISHED.overhang * Math.sin(tilt);
close(apexHeight, 90, 0.001, "hub height");
close(PUBLISHED.overhang * Math.cos(tilt), 5, 0.001, "horizontal overhang");

// Reads the blade loft back against the deck: the ring must span the published chord with the nose turned by the published twist.
const station = PUBLISHED.stations[11];
const { chord, twist, points } = sectionAt(station.span);
close(chord, 3.256, 1e-9, "loft chord at station 12");
close(twist, 4.188, 1e-9, "loft twist at station 12");
const last = (RING_POINTS - 1) * 3;
// The sections have a blunt trailing edge, so the chord line ends midway across it.
const tail = [(points[0] + points[last]) / 2, (points[1] + points[last + 1]) / 2];
const nose = [points[((RING_POINTS - 1) / 2) * 3], points[((RING_POINTS - 1) / 2) * 3 + 1]];
const dx = nose[0] - tail[0];
const dy = nose[1] - tail[1];
close(Math.hypot(dx, dy), 3.256, 0.02, "loft nose to tail distance");
close((Math.atan2(dx, dy) * 180) / Math.PI, 4.188, 0.1, "loft chord line angle");

const stages = ASSUMED.stages.map((stage) => {
  if (stage.kind !== "planetary") return [stage.wheel, stage.pinion];
  assert.equal(stage.ring, stage.sun + 2 * stage.planet, "planet must mesh both sun and ring");
  assert.equal((stage.ring + stage.sun) % stage.planets, 0, "equally spaced planets must fit");
  return [stage.ring + stage.sun, stage.sun];
});
const numerator = stages.reduce((n, [a]) => n * a, 1);
const denominator = stages.reduce((n, [, b]) => n * b, 1);
assert.equal(numerator, 97 * denominator, "assumed stage ratios must multiply to exactly 97");
close(ASSUMED.stages.reduce((n, stage) => n * stageRatio(stage), 1), 97, 1e-9, "stage ratio product");
close(hssOffset(), 0.62, 1e-9, "high speed shaft offset");
close(97 * 12.1, 1173.7, 1e-9, "generator speed");
assert.equal(ASSUMED.spinRpm, 6.9);
assert.equal((120 * 50) / ASSUMED.generator.poles, 1500, "four poles at 50 Hz");

// The cover must wrap what it hides. These are outermost corners measured off the built parts, not values derived from the envelope.
for (const [what, x, y, z] of [
  ["bedplate rear", -8.93, 1.38, 0.2],
  ["bedplate nose", 2.94, 1.79, 0.12],
  ["torque arm mount", 0.27, 2.53, 0.88],
  ["gearbox crown", 0.3, 0, 3.51],
  ["converter top rear", -8.0, 2.33, 3.1],
  ["converter floor rear", -8.0, 2.41, 0.79],
  ["yaw drive", 0, 2.24, -0.26],
  ["spaceframe rear top", -7.26, 2.68, 4.91],
  ["spaceframe front top", 1.16, 2.68, 4.91],
  ["spaceframe foot", -7.33, 2.72, 0.78],
]) {
  assert.ok(Math.abs(y) <= hullHalfWidthAt(x, z), `${what} at (${x}, ${y}, ${z}) pokes out of the cover, which reaches ${hullHalfWidthAt(x, z)}`);
}
close(hullHalfWidthAt(-4, 3), 2.9, 1e-9, "cover half width amidships");
assert.equal(hullHalfWidthAt(-4, 6.01), 0, "nothing above the roof");
assert.equal(hullHalfWidthAt(-4, -0.43), 0, "nothing below the skirt");
// The cooler seats inside the raised housing: bounds of the built part against the housing's roof, rear wall and recessed rake.
assert.ok(7.24 < ASSUMED.raised.top, "cooler under the housing roof");
assert.ok(-7.75 > ASSUMED.raised.rearTop, "cooler ahead of the housing rear wall");
assert.ok(-6.65 < ASSUMED.raised.frontTop - ASSUMED.raised.recess, "fans behind the panes");
assert.ok(ASSUMED.nacelle.front < ASSUMED.spinner.rear * Math.cos(tilt), "cover stops short of the spinner's rear rim");

close(4 * Math.sqrt(WAVES.reduce((sum, wave) => sum + (wave.amplitude * wave.amplitude) / 2, 0)), 6, 1e-9, "sampled sea significant height");
close((2 * Math.PI) / WAVES[0].omega, 10, 1e-9, "longest sampled wave period");

// Every fish must stay wet and off the pile: the widest a fish reaches on its path, including the shader's 0.35 m drift, 0.25 m bob and half a body.
const waveTrough = WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);
for (const { centre, radius, spread, depth, length } of ASSUMED.shoals) {
  const reach = radius + spread[0] / 2 + 0.35 + (length * 1.15) / 2;
  const inner = radius - spread[0] / 2 - 0.35 - (length * 1.15) / 2;
  assert.ok((centre[0] - centre[1] + reach * Math.SQRT2) < ASSUMED.seaTile.front, `shoal at ${centre} swims out past the front edge`);
  const away = Math.hypot(...centre);
  assert.ok(away - reach > ASSUMED.transitionPiece.radius || inner - away > ASSUMED.transitionPiece.radius, `shoal at ${centre} swims through the foundation`);
  assert.ok(depth - spread[1] / 2 - 0.25 > waveTrough, `shoal at ${centre} can break the deepest trough`);
  assert.ok(depth + spread[1] / 2 + 0.25 < -PUBLISHED.seabed - 2, `shoal at ${centre} hits the seabed`);
}

const start = stateAt(0);
const end = stateAt(1);
assert.deepEqual(Object.keys(start.explode).sort(), PART_TABLE.map((part) => part.key).sort());
for (const part of PART_TABLE) {
  assert.equal(start.explode[part.key], 0, `${part.key} assembled at p=0`);
  assert.equal(end.explode[part.key], part.channel ? 1 : 0, `${part.key} at p=1`);
}
assert.equal(start.spin, 1);
assert.equal(end.spin, 0);
assert.equal(start.baseFade, 1);
close(end.baseFade, 0.15, 1e-9, "baseFade at p=1");
assert.equal(start.seaFocus, 0);
assert.equal(end.seaFocus, 1);
assert.equal(start.farmFade, 1);
assert.equal(end.farmFade, 0);

// Channel values at p=0.5, worked by hand from the design's easing: smoothstep of 0.2/0.22, 0.14/0.2 and 0.04/0.32.
const mid = stateAt(0.5);
assert.equal(mid.explode.blade0, 1);
close(mid.explode.cover, 0.97671, 1e-5, "c channel at 0.5");
close(mid.explode.yaw, 0.784, 1e-9, "y channel at 0.5");
close(mid.explode.gear, 0.04297, 1e-5, "d channel at 0.5");

const { front, left, right, back, pileEmbed, scourRadius } = ASSUMED.seaTile;
const seaEdge = [front / 2, -front / 2, -PUBLISHED.towerTop];
// Resting camera, read off a desktop and a phone: the water's front edge lands exactly on `edge`, and the sea runs past every side of the screen, up behind the nav included.
for (const { screenW, figureHeight, top, edge } of [
  { screenW: 1400, figureHeight: 944, top: 10, edge: 870 },
  { screenW: 375, figureHeight: 756, top: 66, edge: 694 },
]) {
  const meet = Math.min(screenW / VIEWBOX.width, figureHeight / VIEWBOX.height);
  const camera = heroCamera({ figureHeight, meet, top, edge, width: screenW });
  const screenY = (point) => figureHeight / 2 + meet * (toViewBox(point, camera)[1] - VIEWBOX.height / 2);
  close(screenY(seaEdge), edge, 1e-6, "water ends on the hero edge");
  const scale = meet * camera.zoom;
  assert.ok(left * C * scale < -(screenW / 2 + camera.shiftX), "sea reaches the left of the screen");
  assert.ok(right * C * scale > screenW / 2 - camera.shiftX, "sea reaches the right of the screen");
  assert.ok(screenY(seaPoint([0, back]).concat(-PUBLISHED.towerTop)) < -56, "sea reaches behind the nav");
}
// Every screen keeps the balance of the 943 px layout: both nacelles in frame, the pair of turbines centred at 42.5% of the width, and at that layout the main one at 70%.
const heroAt = (width, height) => ({ figureHeight: height - 56, meet: Math.min(width / VIEWBOX.width, (height - 56) / VIEWBOX.height), top: 14, edge: height - 62 - 56, width });
const REAR = ASSUMED.farm[1];
close((943 / 2 + heroCamera(heroAt(943, 798)).shiftX) / 943, 0.7, 0.01, "main turbine at 70% of the 943 px layout");
for (const [width, height] of [[375, 812], [768, 1024], [943, 798], [1280, 720], [1440, 900], [1920, 1080], [2560, 1300], [3440, 1440], [5120, 1440]]) {
  const frame = heroAt(width, height);
  const camera = heroCamera(frame);
  const screenY = (point) => frame.figureHeight / 2 + frame.meet * (toViewBox(point, camera)[1] - VIEWBOX.height / 2);
  const scale = frame.meet * camera.zoom;
  const mainX = width / 2 + camera.shiftX;
  close((mainX + (mainX + REAR[0] * C * scale)) / 2 / width, 0.425, 1e-9, `${width}x${height}: pair centred`);
  close(screenY(seaEdge), frame.edge, 1e-6, `${width}x${height}: water ends on the hero edge`);
  const [rearX, rearY] = seaPoint(REAR);
  assert.ok(screenY([rearX + ASSUMED.raised.rearTop, rearY, ASSUMED.raised.top + ASSUMED.instruments.cups.height]) >= frame.top - 1e-6, `${width}x${height}: rear nacelle under the top of the frame`);
}

// The widest screen the block is sized for, 32:9, with its turbine right of centre.
const wide = { screenW: 5120, figureHeight: 1384, top: 10, edge: 1310 };
const wideScale = heroCamera({ figureHeight: wide.figureHeight, meet: wide.figureHeight / VIEWBOX.height, top: wide.top, edge: wide.edge, width: wide.screenW }).zoom * (wide.figureHeight / VIEWBOX.height);
assert.ok(left * C * wideScale < -(wide.screenW * 0.7), "sea reaches the left of a 32:9 screen");
assert.ok(right * C * wideScale > wide.screenW * 0.3, "sea reaches the right of a 32:9 screen");

// Nothing under the water may show below its front edge: on screen the lowest things are the pile foot and the far side of the rock apron, whose biggest rocks sit a metre proud.
const below = (v, z) => v * 0.5 - z;
assert.ok(below(0, -PUBLISHED.towerTop + PUBLISHED.seabed - pileEmbed) < below(front, -PUBLISHED.towerTop), "pile foot above the water's edge");
assert.ok(below((PUBLISHED.monopileDiameter / 2 + 0.15 + scourRadius + 1) * Math.SQRT2, -PUBLISHED.towerTop + PUBLISHED.seabed) < below(front, -PUBLISHED.towerTop), "rock apron above the water's edge");

// The farm's rotors must not sweep through each other or the one in focus, and every turbine stands on the sea.
const turbines = [[0, 0], ...ASSUMED.farm];
turbines.forEach((a, i) => turbines.slice(i + 1).forEach((b) => {
  const [dx, dy] = seaPoint([a[0] - b[0], a[1] - b[1]]);
  assert.ok(Math.hypot(dx, dy) > 2 * PUBLISHED.tipRadius + 4, `turbines at ${a} and ${b} sweep through each other`);
}));
for (const [u, v] of ASSUMED.farm) {
  assert.ok(u > left && u < right && v > back && v < front, `turbine at ${[u, v]} is off the sea`);
}

assert.deepEqual(project([1, 0, 0]), [Math.sqrt(3) / 2, 0.5]);

// The scroll tour leaves from and returns to the resting view for the finished diagram, and water fills the screen all the way round while it can still be seen.
assert.deepEqual(orbitAt(0), [0, 0]);
assert.deepEqual(orbitAt(0.73), [0, 0]);
assert.deepEqual(orbitAt(1), [0, 0]);
assert.ok(Math.asin(viewAxis(0, orbitAt(0.36))[2]) > (80 * Math.PI) / 180, "the tour reaches a bird's eye view");
close(Math.atan2(viewAxis(0, orbitAt(0.2))[1], viewAxis(0, orbitAt(0.2))[0]), -Math.PI / 2, 1e-9, "the tour reaches a side view from -y");
for (const [screenW, screenH] of [[375, 812], [1440, 900], [1920, 1080]]) {
  const figureHeight = screenH - 56;
  const meet = Math.min(screenW / VIEWBOX.width, figureHeight / VIEWBOX.height);
  const rest = heroCamera({ figureHeight, meet, top: 10, edge: screenH - 118, width: screenW });
  for (let p = 0.04; p <= 0.74; p += 0.01) {
    const state = stateAt(p, rest);
    const [ax, ay, az] = viewAxis(0, state.orbit);
    const flat = Math.hypot(ax, ay);
    const sideways = [-ay / flat, ax / flat, 0];
    const up = [(-az * ax) / flat, (-az * ay) / flat, flat];
    const perMetre = meet * state.camera.zoom * CAMERA_SCALE;
    const centreY = 56 + figureHeight / 2;
    for (const [px, py] of [[0, screenH], [screenW, screenH], [0, 0], [screenW, 0]]) {
      const point = [0, 1, 2].map((i) => state.camera.target[i] + sideways[i] * ((px - screenW / 2) / perMetre) + up[i] * ((centreY - py) / perMetre));
      const along = (-PUBLISHED.towerTop - point[2]) / az;
      const [x, y] = [point[0] + ax * along, point[1] + ay * along];
      const [u, v] = [x + y, x - y];
      if (state.seaFocus > 0) assert.ok(u >= left && u <= right && v >= back && v <= front, `${screenW}x${screenH}: screen corner (${px}, ${py}) leaves the water at p=${p.toFixed(2)}: u ${u.toFixed(0)}, v ${v.toFixed(0)}`);
    }
  }
}

// The opening move ends exactly on the resting view, and at every step the water fills the screen down to the hero edge.
assert.equal(introAmount(0), 1);
assert.equal(introAmount(INTRO.seconds), 0);
assert.equal(introAmount(Infinity), 0);
const restAxis = VIEW_DIRECTION.map((value) => value / Math.sqrt(3));
viewAxis(0).forEach((value, i) => close(value, restAxis[i], 1e-12, "opening move ends on the resting axis"));
for (const { screenW, screenH, nav, edge } of [
  { screenW: 1280, screenH: 720, nav: 56, edge: 658 },
  { screenW: 1440, screenH: 900, nav: 56, edge: 838 },
  { screenW: 1920, screenH: 1080, nav: 56, edge: 1018 },
  { screenW: 3440, screenH: 1440, nav: 56, edge: 1378 },
  { screenW: 768, screenH: 1024, nav: 56, edge: 962 },
  { screenW: 375, screenH: 812, nav: 112, edge: 750 },
]) {
  const figureHeight = screenH - 56;
  const meet = Math.min(screenW / VIEWBOX.width, figureHeight / VIEWBOX.height);
  const rest = heroCamera({ figureHeight, meet, top: nav + 10 - 56, edge: edge - 56, width: screenW });
  const shiftX = rest.shiftX;
  for (let step = 0; step <= 40; step++) {
    const amount = step / 40;
    const [ax, ay, az] = viewAxis(amount);
    const flat = Math.hypot(ax, ay);
    const sideways = [-ay / flat, ax / flat, 0];
    const up = [-az * ax / flat, -az * ay / flat, flat];
    const perMetre = meet * rest.zoom * (1 + (INTRO.zoom - 1) * amount) * CAMERA_SCALE;
    const middle = [rest.target[0] + INTRO.pan[0] * amount, rest.target[1] + INTRO.pan[1] * amount, rest.target[2]];
    const centreX = screenW / 2 + shiftX;
    const centreY = 56 + figureHeight / 2;
    const onWater = (px, py) => {
      const point = [0, 1, 2].map((i) => middle[i] + sideways[i] * ((px - centreX) / perMetre) + up[i] * ((centreY - py) / perMetre));
      const along = (-PUBLISHED.towerTop - point[2]) / az;
      const [x, y] = [point[0] + ax * along, point[1] + ay * along];
      return [x + y, x - y];
    };
    for (const [px, py] of [[0, edge], [screenW, edge], [0, 0], [screenW, 0]]) {
      const [u, v] = onWater(px, py);
      assert.ok(v <= front + 1e-6 && v >= back && u >= left && u <= right, `${screenW}x${screenH}: screen corner (${px}, ${py}) leaves the water with ${amount} of the opening move left: u ${u}, v ${v}`);
    }
  }
}

console.log("spec check passed");
