// Asserts the spec against literal values read from figures/turbine3d/source, under plain Node.
// Run: node check.mjs
import assert from "node:assert/strict";
import { PUBLISHED } from "../../staticfiles/js/turbine3d/published.js";
import { ASSUMED, stageRatio, hssOffset } from "../../staticfiles/js/turbine3d/assumed.js";
import { stateAt, project, toViewBox, VIEWBOX } from "../../staticfiles/js/turbine3d/choreography.js";
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

close(4 * Math.sqrt(WAVES.reduce((sum, wave) => sum + (wave.amplitude * wave.amplitude) / 2, 0)), 6, 1e-9, "sampled sea significant height");
close((2 * Math.PI) / WAVES[0].omega, 10, 1e-9, "longest sampled wave period");

const start = stateAt(0);
const end = stateAt(1);
assert.deepEqual(Object.keys(start.explode).sort(), PART_TABLE.map((part) => part.key).sort());
for (const part of PART_TABLE) {
  assert.equal(start.explode[part.key], 0, `${part.key} assembled at p=0`);
  assert.equal(end.explode[part.key], part.channel ? 1 : 0, `${part.key} at p=1`);
}
assert.equal(start.bladeFade, 1);
assert.equal(end.bladeFade, 0);
assert.equal(start.baseFade, 1);
close(end.baseFade, 0.15, 1e-9, "baseFade at p=1");
const calloutKeys = ["spin", "hub", "bearing", "shaft", "gear", "brake", "gen", "conv", "cover", "cool", "bed", "yaw"];
assert.deepEqual(Object.keys(end.callouts), calloutKeys);
for (const key of calloutKeys) {
  assert.equal(start.callouts[key], 0, `${key} callout hidden at p=0`);
  assert.equal(end.callouts[key], 1, `${key} callout shown at p=1`);
}
assert.deepEqual(PART_TABLE.filter((p) => p.number).map((p) => p.number), ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]);

// Channel values at p=0.5, worked by hand from the design's easing: smoothstep of 0.2/0.22, 0.14/0.2 and 0.04/0.32.
const mid = stateAt(0.5);
assert.equal(mid.explode.blades, 1);
close(mid.explode.cover, 0.97671, 1e-5, "c channel at 0.5");
close(mid.explode.yaw, 0.784, 1e-9, "y channel at 0.5");
close(mid.explode.gear, 0.04297, 1e-5, "d channel at 0.5");

// At p=0 the full rotor at any azimuth and the whole cut block must fit the 800x1000 box.
const camera = start.camera;
const apex = [PUBLISHED.overhang * Math.cos(tilt), 0, PUBLISHED.towerTopToShaft + PUBLISHED.overhang * Math.sin(tilt)];
const { half, sediment } = ASSUMED.seaTile;
const seaZ = -PUBLISHED.towerTop;
const bedZ = seaZ + PUBLISHED.seabed - sediment;
const extremes = [
  ...[...Array(360).keys()].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [apex[0], apex[1] + PUBLISHED.tipRadius * Math.cos(a), apex[2] + PUBLISHED.tipRadius * Math.sin(a)];
  }),
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([x, y]) => [[x * half, y * half, seaZ], [x * half, y * half, bedZ]]),
];
for (const point of extremes) {
  const [x, y] = toViewBox(point, camera);
  assert.ok(x >= 0 && x <= VIEWBOX.width && y >= 0 && y <= VIEWBOX.height, `(${point}) projects to ${x}, ${y}, outside the box`);
}
assert.deepEqual(project([1, 0, 0]), [Math.sqrt(3) / 2, 0.5]);

console.log("spec check passed");
