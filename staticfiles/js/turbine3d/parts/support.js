import * as THREE from "three";
import { ALONG_Z, BOLT, DEG, Kit, TAU, aim, arc, box, boxAt, chamfer, fromArrays, inShaftFrame, lathe, merge, pipe, rod, seeded, sphere, trs } from "./shapes.js";
import { seaPoint } from "../assumed.js";
import { simpleNacelle } from "./nacelle.js";
import { simpleRotor } from "./rotor.js";

// Lathe angle whose radial direction lands on this azimuth once the lathe axis is turned onto +z.
const azimuthToLathe = (azimuth) => azimuth + Math.PI / 2;
const radial = (azimuth, r, z) => [r * Math.cos(azimuth), r * Math.sin(azimuth), z];

const towerRadius = (spec, elevation) => {
  const table = spec.published.tower;
  const lower = table.findLast((row) => row.elev <= elevation) ?? table[0];
  const upper = table.find((row) => row.elev >= elevation) ?? table.at(-1);
  const t = upper.elev === lower.elev ? 0 : (elevation - lower.elev) / (upper.elev - lower.elev);
  return (lower.diam + (upper.diam - lower.diam) * t) / 2;
};

function towerProfile(spec) {
  const { published, assumed } = spec;
  const local = (elevation) => elevation - published.towerTop;
  const points = [];
  const flanges = assumed.towerJoints;
  let elevation = published.towerBase;
  const seam = 0.06;
  while (elevation < published.towerTop - 0.01) {
    const next = Math.min(published.towerTop, elevation + assumed.towerCanLength);
    const joint = flanges.find((z) => z >= elevation && z < next);
    const r0 = towerRadius(spec, elevation);
    points.push([local(elevation), r0]);
    if (joint !== undefined) {
      const r = towerRadius(spec, joint);
      points.push([local(joint - 0.28), r], [local(joint - 0.1), r + 0.02], [local(joint - 0.1), r + 0.17], [local(joint - 0.01), r + 0.17], [local(joint - 0.01), r + 0.02], [local(joint + 0.01), r + 0.02], [local(joint + 0.01), r + 0.17], [local(joint + 0.1), r + 0.17], [local(joint + 0.1), r + 0.02], [local(joint + 0.28), r]);
    } else if (next < published.towerTop) {
      const r1 = towerRadius(spec, next);
      points.push([local(next - seam), r1], [local(next - seam / 2), r1 + 0.012], [local(next), r1]);
    }
    elevation = next;
  }
  points.push([0, towerRadius(spec, published.towerTop)]);
  return points;
}

export function buildTower(spec, mats) {
  const kit = new Kit(mats);
  const { published, assumed } = spec;
  const local = (elevation) => elevation - published.towerTop;

  kit.add("paint", lathe(towerProfile(spec), { seg: 96, smooth: 0.98 }), ALONG_Z);
  const topRadius = towerRadius(spec, published.towerTop);
  const innerTop = topRadius - published.towerTopWall;
  kit.add("towerInner", lathe([[-9, innerTop], [0, innerTop]].reverse(), { seg: 96 }), ALONG_Z);
  kit.add("steel", lathe([[0, innerTop], [0, topRadius]].reverse(), { seg: 96 }), ALONG_Z);
  kit.add("steel", lathe(chamfer([[-0.015, innerTop], [-0.015, innerTop - 0.22], [-0.1, innerTop - 0.22], [-0.1, innerTop]], 0.006), { seg: 96 }), ALONG_Z);
  const topBolts = [];
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * TAU;
    topBolts.push(aim([(innerTop - 0.12) * Math.cos(a), (innerTop - 0.12) * Math.sin(a), -0.015], [0, 0, 1], 0.03));
  }
  kit.many("bolt", BOLT, topBolts);

  for (const joint of assumed.towerJoints) {
    const r = towerRadius(spec, joint) + 0.09;
    const heads = [];
    const nuts = [];
    for (let k = 0; k < 92; k++) {
      const a = (k / 92) * TAU;
      heads.push(aim(radial(a, r, local(joint + 0.1)), [0, 0, 1], 0.036));
      nuts.push(aim(radial(a, r, local(joint - 0.1)), [0, 0, -1], 0.036));
    }
    kit.many("bolt", BOLT, heads);
    kit.many("bolt", BOLT, nuts);
  }

  const door = assumed.towerDoor;
  const doorAz = door.azimuth * DEG;
  const half = door.halfAngle * DEG;
  const rDoor = towerRadius(spec, door.z) + 0.03;
  const zBottom = local(door.z - door.height / 2);
  const zTop = local(door.z + door.height / 2);
  const a0 = azimuthToLathe(doorAz) - half;
  const a1 = azimuthToLathe(doorAz) + half;
  kit.add("doorPaint", lathe([[zBottom + 0.14, rDoor], [zTop - 0.14, rDoor]], { seg: 14, from: a0, to: a1 }), ALONG_Z);
  const obround = [];
  const cornerSteps = 6;
  const corner = 0.3;
  const push = (az, z) => obround.push(radial(az, rDoor + 0.02, z));
  const halfWidth = half;
  for (const [c, startAngle] of [[[doorAz + halfWidth - corner / rDoor, zTop - corner], 0], [[doorAz - halfWidth + corner / rDoor, zTop - corner], Math.PI / 2], [[doorAz - halfWidth + corner / rDoor, zBottom + corner], Math.PI], [[doorAz + halfWidth - corner / rDoor, zBottom + corner], 1.5 * Math.PI]]) {
    for (let k = 0; k <= cornerSteps; k++) {
      const t = startAngle + (k / cornerSteps) * (Math.PI / 2);
      push(c[0] + (Math.cos(t) * corner) / rDoor, c[1] + Math.sin(t) * corner);
    }
  }
  kit.add("steel", pipe(obround, 0.05, { seg: 6, closed: true }));
  const handleZ = local(door.z);
  kit.add("darkMetal", rod(radial(doorAz + half * 0.55, rDoor + 0.06, handleZ - 0.1), radial(doorAz + half * 0.55, rDoor + 0.06, handleZ + 0.1), 0.02, 6));
  kit.add("doorGlass", rod(radial(doorAz, rDoor + 0.005, handleZ + 0.56), radial(doorAz, rDoor + 0.022, handleZ + 0.56), 0.13, 16));
  kit.add("steel", lathe([[0, 0.13], [0.01, 0.15], [0.03, 0.15]], { seg: 16 }), aim(radial(doorAz, rDoor, handleZ + 0.56), [Math.cos(doorAz), Math.sin(doorAz), 0]).multiply(trs([0, 0, 0], [0, -Math.PI / 2, 0])));

  buildTransitionPiece(kit, spec);
  return kit.finish();
}

function buildTransitionPiece(kit, spec) {
  const { published, assumed } = spec;
  const local = (elevation) => elevation - published.towerTop;
  const tp = assumed.transitionPiece;
  const R = tp.radius;
  const pileR = published.monopileDiameter / 2;
  const baseR = published.tower[0].diam / 2;

  kit.add("yellow", lathe(chamfer([[local(tp.darkBelow), R], [local(tp.top - 0.3), R], [local(tp.top - 0.3), R + 0.13], [local(tp.top), R + 0.13], [local(tp.top), baseR + 0.08], [local(tp.top + 0.06), baseR + 0.08], [local(tp.top + 0.06), baseR]], 0.012), { seg: 96 }), ALONG_Z);
  kit.add("hullDark", lathe([[local(tp.bottom - 0.3), pileR], [local(tp.bottom), R - 0.02], [local(tp.darkBelow), R]], { seg: 96 }), ALONG_Z);
  kit.add("pile", lathe([[local(published.seabed - spec.assumed.seaTile.pileEmbed), pileR], [local(tp.bottom - 0.3), pileR]], { seg: 96 }), ALONG_Z);

  const flangeBolts = [];
  for (let k = 0; k < 120; k++) {
    const a = (k / 120) * TAU;
    flangeBolts.push(aim(radial(a, baseR + 0.04, local(tp.top + 0.06)), [0, 0, 1], 0.03));
  }
  kit.many("bolt", BOLT, flangeBolts);

  const anodes = [];
  for (const z of [-16.5, -12]) {
    for (let k = 0; k < 8; k++) {
      const a = ((k + (z < -13 ? 0.5 : 0)) / 8) * TAU;
      anodes.push(trs(radial(a, pileR + 0.2, local(z)), [0, 0, a]));
    }
  }
  kit.many("anode", box(0.3, 0.26, 1.9, 0.03), anodes);

  const P = assumed.platform;
  const zDeck = local(P.z);
  kit.add("grating", lathe([[zDeck, R + 0.14], [zDeck, P.radius]].reverse(), { seg: 96 }), ALONG_Z);
  kit.add("grating", lathe([[zDeck - 0.03, P.radius], [zDeck - 0.03, R + 0.14]].reverse(), { seg: 96 }), ALONG_Z);
  kit.add("galvanised", lathe(chamfer([[zDeck - 0.18, P.radius], [zDeck + 0.14, P.radius], [zDeck + 0.14, P.radius - 0.02], [zDeck - 0.18, P.radius - 0.02]], 0.002), { seg: 96 }), ALONG_Z);
  const beams = [];
  const gussets = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    beams.push(trs(radial(a, (R + P.radius) / 2, zDeck - 0.14), [0, 0, a]));
    gussets.push(aim(radial(a, R + 0.75, zDeck - 0.92), [Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.7]));
  }
  kit.many("yellow", box(P.radius - R - 0.2, 0.14, 0.22, 0.01), beams);
  kit.many("yellow", rod([0, 0, -0.95], [0, 0, 0.92], 0.05, 8), gussets);

  const landing = assumed.boatLanding;
  const landingAz = landing.azimuth * DEG;
  const gapHalf = 7 * DEG;
  const posts = [];
  const rails = [[landingAz + gapHalf, landingAz + TAU - gapHalf]];
  for (const [from, to] of rails) {
    const count = 34;
    for (let k = 0; k <= count; k++) posts.push(radial(from + ((to - from) * k) / count, P.radius - 0.04, zDeck));
    for (const h of [0.55, P.railHeight]) kit.add("galvanised", pipe(arc(P.radius - 0.04, zDeck + h, from, to, 72), 0.028, { seg: 6 }));
  }
  kit.many("galvanised", rod([0, 0, 0], [0, 0, P.railHeight], 0.026, 6), posts.map((p) => trs(p)));

  const e = [Math.cos(landingAz), Math.sin(landingAz)];
  const t = [-e[1], e[0]];
  const tubeR = R + landing.standoff;
  for (const side of [-1, 1]) {
    const px = e[0] * tubeR + t[0] * side * landing.halfSpacing;
    const py = e[1] * tubeR + t[1] * side * landing.halfSpacing;
    kit.add("yellow", rod([px, py, local(landing.bottom)], [px, py, local(landing.top)], 0.16, 14));
    kit.add("yellow", sphere([px, py, local(landing.top)], 0.16, 12, 6));
    kit.add("yellow", sphere([px, py, local(landing.bottom)], 0.16, 12, 6));
    for (const z of [landing.top - 0.5, 3.5, -0.5, landing.bottom + 0.7]) {
      const hub = R + 0.02;
      kit.add("yellow", rod([e[0] * hub + t[0] * side * landing.halfSpacing, e[1] * hub + t[1] * side * landing.halfSpacing, local(z)], [px, py, local(z)], 0.085, 8));
    }
  }
  const ladderR = R + landing.standoff - 0.32;
  const ladderTop = P.z + P.railHeight;
  for (const side of [-0.24, 0.24]) {
    const px = e[0] * ladderR + t[0] * side;
    const py = e[1] * ladderR + t[1] * side;
    kit.add("galvanised", rod([px, py, local(landing.bottom)], [px, py, local(ladderTop)], 0.022, 6));
  }
  const rungs = [];
  for (let z = landing.bottom + 0.1; z < P.z + 0.1; z += 0.3) rungs.push(trs([e[0] * ladderR, e[1] * ladderR, local(z)]));
  kit.many("galvanised", rod([t[0] * -0.24, t[1] * -0.24, 0], [t[0] * 0.24, t[1] * 0.24, 0], 0.014, 6), rungs);
  for (let k = 0; k < 5; k++) {
    const hoop = (z) => Array.from({ length: 13 }, (_, i) => {
      const f = (i / 12) * Math.PI;
      return [e[0] * ladderR + t[0] * 0.38 * Math.cos(f) + e[0] * 0.38 * Math.sin(f), e[1] * ladderR + t[1] * 0.38 * Math.cos(f) + e[1] * 0.38 * Math.sin(f), local(z)];
    });
    kit.add("galvanised", pipe(hoop(P.z - 3.4 + k * 0.7), 0.014, { seg: 5 }));
  }

  const jAz = assumed.jTube.azimuth * DEG;
  const jr = assumed.jTube.radius;
  const seabed = published.seabed;
  const jPath = [];
  const outer = R + jr + 0.14;
  const pileOuter = pileR + jr + 0.14;
  jPath.push(radial(jAz, outer, local(P.z - 0.1)), radial(jAz, outer, local(tp.bottom + 0.4)), radial(jAz, (outer + pileOuter) / 2, local(tp.bottom - 0.4)), radial(jAz, pileOuter, local(tp.bottom - 1.4)), radial(jAz, pileOuter, local(seabed + 3.2)));
  for (let k = 1; k <= 10; k++) {
    const f = (k / 10) * (Math.PI / 2);
    jPath.push(radial(jAz, pileOuter + 2.6 * (1 - Math.cos(f)), local(seabed + 3.2 - 2.6 * Math.sin(f))));
  }
  jPath.push(radial(jAz, pileOuter + 4.4, local(seabed + 0.5)));
  const jGeo = pipe(jPath, jr, { seg: 12 });
  kit.add("hullDark", jGeo);
  const clamps = [];
  for (const z of [8, 4, 0, -3.5]) clamps.push(trs(radial(jAz, R + 0.02, local(z)), [0, 0, jAz]));
  for (const z of [-9, -14, -18]) clamps.push(trs(radial(jAz, pileR + 0.02, local(z)), [0, 0, jAz]));
  kit.many("yellow", box(0.68, 0.58, 0.24, 0.012), clamps);

  const davitAz = 10 * DEG;
  const dp = radial(davitAz, P.radius - 0.7, zDeck);
  kit.add("yellow", rod(dp, [dp[0], dp[1], zDeck + 3.1], [0.11, 0.08], 12));
  kit.add("yellow", rod([dp[0], dp[1], zDeck + 3.05], [dp[0] + 1.9 * Math.cos(davitAz), dp[1] + 1.9 * Math.sin(davitAz), zDeck + 3.5], [0.07, 0.04], 8));
  kit.add("steel", rod([dp[0] + 1.9 * Math.cos(davitAz), dp[1] + 1.9 * Math.sin(davitAz), zDeck + 3.5], [dp[0] + 1.9 * Math.cos(davitAz), dp[1] + 1.9 * Math.sin(davitAz), zDeck + 2.1], 0.012, 5));
  kit.add("yellow", rod([dp[0], dp[1], zDeck], [dp[0], dp[1], zDeck + 0.06], 0.34, 16));
  const lockerAz = -118 * DEG;
  const lp = radial(lockerAz, P.radius - 1.1, zDeck + 0.42);
  kit.add("galvanised", boxAt(lp, [1.1, 0.7, 0.84], 0.02, [0, 0, lockerAz]));

  const doorAz = assumed.towerDoor.azimuth * DEG;
  const stepCount = 5;
  const steps = [];
  for (let k = 0; k < stepCount; k++) {
    const r = R + 1.4 - k * 0.22;
    steps.push(trs(radial(doorAz, r, zDeck + 0.16 + k * 0.17), [0, 0, doorAz]));
  }
  kit.many("grating", box(0.26, 1.1, 0.03), steps);
  for (const side of [-1, 1]) {
    const tan = [-Math.sin(doorAz) * side * 0.56, Math.cos(doorAz) * side * 0.56];
    const low = radial(doorAz, R + 1.5, zDeck + 0.14);
    const high = radial(doorAz, R + 0.4, zDeck + 1.02);
    kit.add("galvanised", rod([low[0] + tan[0], low[1] + tan[1], low[2]], [high[0] + tan[0], high[1] + tan[1], high[2]], 0.024, 6));
    kit.add("galvanised", rod([low[0] + tan[0], low[1] + tan[1], low[2]], [low[0] + tan[0], low[1] + tan[1], low[2] + 0.95], 0.02, 6));
    kit.add("galvanised", rod([low[0] + tan[0], low[1] + tan[1], low[2] + 0.95], [high[0] + tan[0], high[1] + tan[1], high[2] + 0.95], 0.02, 6));
  }
}

function seabedHeight(x, y) {
  return 0.28 * Math.sin(x * 0.11 + 1.3) * Math.cos(y * 0.09 - 0.7) + 0.12 * Math.sin(x * 0.31 + y * 0.23) + 0.05 * Math.sin(x * 0.83 - y * 0.67);
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function withColours(geometry, colours) {
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colours), 3));
  return geometry;
}

const linear = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

// A unit-length fish, nose on +x: a tapered body with a dark back, then a forked tail and dorsal fin as flat plates.
function fishGeometry() {
  const RINGS = 14;
  const AROUND = 10;
  const BODY = 0.86;
  const positions = [];
  const normals = [];
  const colours = [];
  const indices = [];
  const shade = (up) => {
    const c = 1 - 0.68 * Math.min(1, Math.max(0, up * 0.8 + 0.45));
    colours.push(c, c, c);
  };
  for (let k = 0; k <= RINGS; k++) {
    const u = k / RINGS;
    const girth = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.9) + 0.06;
    const height = 0.1 * girth;
    const width = 0.045 * girth;
    for (let j = 0; j < AROUND; j++) {
      const a = (j / AROUND) * TAU;
      const length = Math.hypot(Math.cos(a) / width, Math.sin(a) / height);
      positions.push(0.5 - BODY * u, width * Math.cos(a), height * Math.sin(a));
      normals.push(0, Math.cos(a) / width / length, Math.sin(a) / height / length);
      shade(Math.sin(a));
      if (k < RINGS) {
        const v = k * AROUND + j;
        const next = k * AROUND + ((j + 1) % AROUND);
        indices.push(v, v + AROUND, next, next, v + AROUND, next + AROUND);
      }
    }
  }
  for (const plate of [
    [[-0.34, 0], [-0.5, 0.14], [-0.44, 0]],
    [[-0.34, 0], [-0.44, 0], [-0.5, -0.14]],
    [[0.14, 0.09], [-0.02, 0.17], [-0.1, 0.075]],
  ]) {
    const base = positions.length / 3;
    for (const [x, z] of plate) {
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      shade(1);
    }
    indices.push(base, base + 1, base + 2);
  }
  return withColours(fromArrays(positions, normals, indices), colours);
}

function addShoals(kit, spec, mats) {
  const { shoals } = spec.assumed;
  const seaZ = -spec.published.towerTop;
  const random = seeded(7741);
  const count = shoals.reduce((sum, shoal) => sum + shoal.count, 0);
  const geometry = fishGeometry();
  const orbit = new Float32Array(count * 4);
  const motion = new Float32Array(count * 4);
  const clarity = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geometry, mats.fish, count);
  const identity = new THREE.Matrix4();
  const colour = new THREE.Color();
  let i = 0;
  for (const shoal of shoals) {
    for (let k = 0; k < shoal.count; k++, i++) {
      orbit.set([shoal.centre[0], shoal.centre[1], seaZ - shoal.depth + (random() - 0.5) * shoal.spread[1], shoal.radius + (random() - 0.5) * shoal.spread[0]], i * 4);
      motion.set([random() * shoal.arc, shoal.rate, shoal.length * (0.85 + 0.3 * random()), random() * TAU], i * 4);
      clarity[i] = 0.95 - (0.5 * (seaZ - orbit[i * 4 + 2])) / -spec.published.seabed;
      mesh.setMatrixAt(i, identity);
      mesh.setColorAt(i, colour.set(shoal.tone).multiplyScalar(0.9 + 0.2 * random()));
    }
  }
  geometry.setAttribute("aOrbit", new THREE.InstancedBufferAttribute(orbit, 4));
  geometry.setAttribute("aMotion", new THREE.InstancedBufferAttribute(motion, 4));
  geometry.setAttribute("aClarity", new THREE.InstancedBufferAttribute(clarity, 1));
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  kit.object(mesh);
}

const rockShape = (detail) => {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute("uv");
  return geometry;
};

// Scour rocks around each foundation in `spots`.
function scatterRocks(kit, spec, mats, random, geometry, spots, reach, sizeMin, sizeMax) {
  const pileR = spec.published.monopileDiameter / 2;
  const bedZ = -spec.published.towerTop + spec.published.seabed;
  const rockColor = new THREE.Color();
  const count = spots.reduce((sum, spot) => sum + spot.count, 0);
  const mesh = new THREE.InstancedMesh(geometry, mats.rock, count);
  const matrix = new THREE.Matrix4();
  let i = 0;
  for (const { at: [cx, cy], count: rocks } of spots) {
    for (let k = 0; k < rocks; k++, i++) {
      const a = random() * TAU;
      const r = pileR + 0.15 + reach * Math.pow(random(), 0.7);
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      const edgeFade = 1 - Math.min(1, (r - pileR) / (reach + 0.1));
      const s = sizeMin + (sizeMax - sizeMin) * random() * (0.35 + 0.65 * edgeFade);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * TAU, random() * TAU, random() * TAU));
      matrix.compose(new THREE.Vector3(x, y, bedZ + seabedHeight(x, y) + s * 0.3), q, new THREE.Vector3(s * (0.8 + random() * 0.5), s * (0.8 + random() * 0.5), s * (0.55 + random() * 0.4)));
      mesh.setMatrixAt(i, matrix);
      const v = 0.42 + random() * 0.32;
      mesh.setColorAt(i, rockColor.setRGB(v, v * 0.97, v * 0.9));
    }
  }
  mesh.frustumCulled = false;
  kit.object(mesh);
}

// Every other turbine in the farm, one draw call a finish: one rotor spins in `userData.rotors`, all else is fixed.
export function buildFarm(spec, mats) {
  const kit = new Kit(mats);
  const { published, assumed } = spec;
  const local = (elevation) => elevation - published.towerTop;
  const tp = assumed.transitionPiece;
  const pileR = published.monopileDiameter / 2;
  const R = tp.radius;
  const places = assumed.farm.map((point) => trs([...seaPoint(point), 0]));
  const shell = simpleNacelle(spec);
  kit.many("paint", merge([lathe(towerProfile(spec), { seg: 28, smooth: 0.98 }).applyMatrix4(ALONG_Z), ...shell.paint]), places);
  kit.many("glass", merge(shell.glass), places);
  kit.many("yellow", lathe([[local(tp.darkBelow), R], [local(tp.top), R], [local(tp.top), published.tower[0].diam / 2]], { seg: 28 }).applyMatrix4(ALONG_Z), places);
  kit.many("hullDark", lathe([[local(tp.bottom), pileR], [local(tp.bottom), R - 0.02], [local(tp.darkBelow), R]], { seg: 28 }).applyMatrix4(ALONG_Z), places);
  kit.many("pile", lathe([[local(published.seabed - assumed.seaTile.pileEmbed), pileR], [local(tp.bottom), pileR]], { seg: 28 }).applyMatrix4(ALONG_Z), places);
  kit.many("grating", lathe([[local(assumed.platform.z), assumed.platform.radius], [local(assumed.platform.z), R]], { seg: 28 }).applyMatrix4(ALONG_Z), places);

  const random = seeded(2207);
  scatterRocks(kit, spec, mats, random, rockShape(1), assumed.farm.map((point) => ({ at: seaPoint(point), count: 70 })), assumed.seaTile.scourRadius * 0.62, 0.35, 0.95);
  const rotors = new THREE.InstancedMesh(simpleRotor(spec), mats.paint, places.length);
  rotors.castShadow = true;
  rotors.receiveShadow = true;
  rotors.frustumCulled = false;
  rotors.userData.rotors = places.map((place) => ({ frame: place.clone().multiply(inShaftFrame(spec)), phase: random() * TAU }));
  kit.object(rotors);
  return kit.finish();
}

export function buildSea(spec, mats) {
  const kit = new Kit(mats);
  const { published, assumed } = spec;
  const tile = assumed.seaTile;
  const seaZ = -published.towerTop;
  const bedZ = seaZ + published.seabed;
  const random = seeded(5021);

  // Seen only through 20 m of water, so already shifted to the blue-green that depth leaves, not the tan of dry sand.
  const sand = linear("#7f9a92");
  const sandDark = linear("#647f79");

  const addMesh = (geometry, material) => kit.object(new THREE.Mesh(geometry, material));
  const spanU = tile.right - tile.left;

  // A flat sheet over the sea in view axes as far as `front`: `fill` writes each point, and the winding faces up.
  const sheet = (step, front, fill) => {
    const spanV = front - tile.back;
    const columns = Math.ceil(spanU / step);
    const rows = Math.ceil(spanV / step);
    const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
    const indices = [];
    for (let i = 0; i <= columns; i++) {
      for (let j = 0; j <= rows; j++) {
        const [x, y] = seaPoint([tile.left + (spanU * i) / columns, tile.back + (spanV * j) / rows]);
        const v = i * (rows + 1) + j;
        positions.set([x, y, fill(x, y)], v * 3);
        if (i < columns && j < rows) indices.push(v, v + 1, v + rows + 1, v + 1, v + rows + 2, v + rows + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return { geometry, count: positions.length / 3 };
  };

  // The seabed stops where it passes out from under the water's front edge on screen, flattening so the two lines meet exactly.
  const bedFront = tile.front + 2 * published.seabed;
  const colours = [];
  const bed = sheet(6, bedFront, (x, y) => {
    const h = seabedHeight(x, y) * Math.min(1, (bedFront - (x - y)) / 12);
    colours.push(...mix(sand, sandDark, Math.min(1, Math.max(0, 0.5 - h * 1.1 + (random() - 0.5) * 0.32))));
    return bedZ + h;
  }).geometry;
  bed.computeVertexNormals();
  addMesh(withColours(bed, colours), mats.sand);

  scatterRocks(kit, spec, mats, random, rockShape(1), [{ at: [0, 0], count: Math.round(tile.scourRocks * 0.2) }], tile.scourRadius * 0.62, 0.35, 0.95);
  scatterRocks(kit, spec, mats, random, rockShape(0), [{ at: [0, 0], count: Math.round(tile.scourRocks * 0.8) }], tile.scourRadius, 0.14, 0.42);

  addShoals(kit, spec, mats);

  const { geometry: surface, count: surfaceCount } = sheet(5, tile.front, () => seaZ);
  surface.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(surfaceCount * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));

  const surfaceMesh = new THREE.Mesh(surface, mats.water);
  surfaceMesh.receiveShadow = true;
  surfaceMesh.userData.seaSurface = true;
  surfaceMesh.renderOrder = 4;
  surfaceMesh.frustumCulled = false;
  kit.object(surfaceMesh);

  return kit.finish();
}
