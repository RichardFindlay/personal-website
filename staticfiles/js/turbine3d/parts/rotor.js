import * as THREE from "three";
import { sectionAt, bladeSpans, RING_POINTS } from "./loft.js";
import { BOLT, DEG, Kit, TAU, aim, boltCircle, box, chamfer, gear, inShaftFrame, lathe, loftRings, merge, pipe, positioned, rod, sphere, trs } from "./shapes.js";

const NOSE_INDEX = (RING_POINTS - 1) / 2;
const AZIMUTHS = [0, 120, 240].map((a) => a * DEG);

// Blade frame origin at the apex: +z along the preconed pitch axis, +x upwind, +y the direction of rotation.
const bladeFrames = (spec) =>
  AZIMUTHS.map((azimuth) => trs([spec.published.overhang, 0, 0]).multiply(trs([0, 0, 0], [azimuth, 0, 0])).multiply(trs([0, 0, 0], [0, spec.published.precone * DEG, 0])));

const smin = (a, b, k) => {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

function rotatingKit(mats) {
  const kit = new Kit(mats);
  kit.group.userData.spins = true;
  return kit;
}

function inRotorFrame(kit, spec) {
  const frame = new THREE.Group();
  frame.matrixAutoUpdate = false;
  frame.matrix.copy(inShaftFrame(spec));
  frame.add(kit.finish());
  return frame;
}

function bladeSkin(spec) {
  const spans = bladeSpans();
  const hub = spec.published.hubRadius;
  const rings = spans.map((span) => {
    const { points } = sectionAt(span);
    const ring = new Array(RING_POINTS);
    for (let j = 0; j < RING_POINTS; j++) ring[j] = [points[j * 3], points[j * 3 + 1], points[j * 3 + 2] + hub];
    return ring;
  });
  return { spans, rings, skin: loftRings(rings, { flip: true }) };
}

function trailingEdge(rings) {
  const strip = rings.map((ring) => [ring[RING_POINTS - 1], ring[0]]);
  return loftRings(strip, { flip: true });
}

function offsetStrip(skin, spans, fromSpan, j0, j1, lift) {
  const position = skin.attributes.position;
  const normal = skin.attributes.normal;
  const rows = [];
  spans.forEach((span, i) => {
    if (span < fromSpan) return;
    const row = [];
    for (let j = j0; j <= j1; j++) {
      const v = i * RING_POINTS + j;
      row.push([position.getX(v) + normal.getX(v) * lift, position.getY(v) + normal.getY(v) * lift, position.getZ(v) + normal.getZ(v) * lift]);
    }
    rows.push(row);
  });
  return loftRings(rows, { flip: true });
}

export function buildBlade(spec, mats, which) {
  const kit = rotatingKit(mats);
  const { assumed, published } = spec;
  const hub = published.hubRadius;
  const frames = [bladeFrames(spec)[which]];
  const { spans, rings, skin } = bladeSkin(spec);

  kit.many("paint", skin, frames);
  kit.many("seam", trailingEdge(rings), frames);
  kit.many("edgeTape", offsetStrip(skin, spans, assumed.leadingEdgeStripFrom, NOSE_INDEX - 7, NOSE_INDEX + 7, 0.006), frames);

  const receptors = [];
  const disc = rod([0, 0, 0], [0, 0, 0.012], 0.055, 10);
  const position = skin.attributes.position;
  const normal = skin.attributes.normal;
  for (const span of assumed.receptorSpans) {
    const row = spans.findIndex((value) => value >= span);
    for (const j of [10, RING_POINTS - 11]) {
      const v = row * RING_POINTS + j;
      const p = [position.getX(v), position.getY(v), position.getZ(v)];
      const n = [normal.getX(v), normal.getY(v), normal.getZ(v)];
      for (const frame of frames) receptors.push(frame.clone().multiply(aim(p, n)));
    }
  }
  kit.many("aluminium", disc, receptors);

  const rootRadius = published.stations[0].chord / 2;
  const collar = lathe(chamfer([[0.26, rootRadius], [0.16, rootRadius + 0.05], [0, rootRadius + 0.05], [0, rootRadius - 0.1]].reverse(), 0.012), { seg: 96 });
  const toBladeAxis = trs([0, 0, hub], [0, -Math.PI / 2, 0]);
  kit.many("paint", collar, frames.map((frame) => frame.clone().multiply(toBladeAxis)));
  const studs = boltCircle(92, rootRadius + 0.012, 0.165, 1, 0.038);
  kit.many("bolt", BOLT, frames.flatMap((frame) => positioned(studs, frame.clone().multiply(toBladeAxis))));
  // Root bulkhead, so the open blade end shows a floor once the blade is drawn off the hub.
  kit.many("darkMetal", rod([0, 0, hub + 0.3], [0, 0, hub + 0.32], rootRadius - 0.02, 48), frames);

  return inRotorFrame(kit, spec);
}

// A whole rotor as one mesh in the shaft frame, for the distant turbines.
export function simpleRotor(spec) {
  const { rings } = bladeSkin(spec);
  const thin = (list, step) => list.filter((_, k) => k % step === 0 || k === list.length - 1);
  const skin = loftRings(thin(rings, 5).map((ring) => thin(ring, 3)), { flip: true });
  return merge([...bladeFrames(spec).map((frame) => skin.clone().applyMatrix4(frame)), sphere([spec.published.overhang, 0, 0], spec.assumed.spinner.radius, 16, 10)]);
}

function hubSkin(spec, frames) {
  const { hub } = spec.assumed;
  const faceDistance = spec.published.hubRadius - 0.02;
  const axes = frames.map((frame) => new THREE.Vector3(0, 0, 1).transformDirection(frame));
  const n = new THREE.Vector3();
  const radial = () => {
    let r = hub.radius;
    for (const axis of axes) {
      const d = n.dot(axis);
      if (d > 0.05) r = smin(r, faceDistance / d, 0.1);
    }
    if (-n.x > 0.05) r = smin(r, hub.rearFace / -n.x, 0.14);
    if (n.x > 0.05) r = smin(r, hub.frontFace / n.x, 0.14);
    return r;
  };
  const rows = 120;
  const columns = 180;
  const rings = [];
  for (let i = 0; i <= rows; i++) {
    const theta = Math.PI * (0.001 + (0.998 * i) / rows);
    const ring = new Array(columns);
    for (let j = 0; j < columns; j++) {
      const phi = (j / columns) * TAU;
      n.set(Math.cos(theta), Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi));
      const r = radial();
      ring[j] = [spec.published.overhang + n.x * r, n.y * r, n.z * r];
    }
    rings.push(ring);
  }
  const skin = loftRings(rings, { closedRing: true });

  // Openings are cut by dropping triangles: the jagged edge they leave stays under the pitch bearing and manhole ring.
  const position = skin.attributes.position;
  const index = skin.index.array;
  const kept = [];
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  const apex = new THREE.Vector3(spec.published.overhang, 0, 0);
  const inOpening = (axis, radius) => {
    const along = centre.dot(axis);
    return along > 0.5 && centre.lengthSq() - along * along < radius * radius;
  };
  const nose = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < index.length; i += 3) {
    centre.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centre.add(v.fromBufferAttribute(position, index[i + k]));
    centre.multiplyScalar(1 / 3).sub(apex);
    if (!axes.some((axis) => inOpening(axis, hub.openingRadius + 0.05)) && !inOpening(nose, 0.84)) kept.push(index[i], index[i + 1], index[i + 2]);
  }
  skin.setIndex(new THREE.BufferAttribute(new Uint32Array(kept), 1));
  return skin;
}

export function buildHub(spec, mats) {
  const kit = rotatingKit(mats);
  const { assumed, published } = spec;
  const { hub } = assumed;
  const frames = bladeFrames(spec);
  kit.add("castIron", hubSkin(spec, frames));

  const toBladeAxis = trs([0, 0, published.hubRadius], [0, -Math.PI / 2, 0]);
  const { inner, outer, height } = assumed.pitchBearing;
  const race = lathe(chamfer([[-height, inner + 0.18], [-height, outer], [0, outer], [0, inner + 0.18]], 0.02), { seg: 96 });
  const innerRace = lathe(chamfer([[-height, inner], [-height, inner + 0.17], [0.012, inner + 0.17], [0.012, inner]], 0.015), { seg: 96 });
  const ringTeeth = gear({ teeth: 138, module: 0.0205, width: 0.13, internal: true, rim: inner + 0.05 }).applyMatrix4(trs([-height + 0.08, 0, 0]));
  const outerBolts = boltCircle(68, outer - 0.09, 0, 1, 0.034);
  const innerBolts = boltCircle(68, inner + 0.09, 0.012, 1, 0.03, { phase: 0.04 });
  const motor = lathe(chamfer([[0.7, 0], [0.7, 0.15], [0.76, 0.15], [0.76, assumed.pitchDrive.motorRadius], [1.2, assumed.pitchDrive.motorRadius], [1.2, 0.13], [1.28, 0.13], [1.28, 0]], 0.012), { seg: 20 });
  const finsOnMotor = [];
  for (let k = 0; k < 14; k++) finsOnMotor.push(trs([0.98, 0.205 * Math.cos((k / 14) * TAU), 0.205 * Math.sin((k / 14) * TAU)], [(k / 14) * TAU, 0, 0]));
  const fin = box(0.4, 0.03, 0.012);
  const pinion = gear({ teeth: 15, module: 0.0205, width: 0.14, bore: 0.05 }).applyMatrix4(trs([published.hubRadius - height + 0.08, 0, 0]));

  const bore = lathe([[0, hub.openingRadius + 0.04], [-0.72, hub.openingRadius + 0.04], [-0.72, 0]], { seg: 96 });
  for (const frame of frames) {
    const axisFrame = frame.clone().multiply(toBladeAxis);
    kit.add("castInterior", bore.clone(), axisFrame);
    kit.add("bearingPaint", race.clone(), axisFrame);
    kit.add("steel", innerRace.clone(), axisFrame);
    kit.add("gearSteel", ringTeeth.clone(), axisFrame);
    const motorFrame = frame.clone().multiply(trs([-assumed.pitchDrive.offset, 0, 0], [0, -Math.PI / 2, 0]));
    kit.add("genPaint", motor.clone(), motorFrame);
    kit.add("gearSteel", pinion.clone(), motorFrame);
    kit.many("genPaint", fin, finsOnMotor.map((matrix) => motorFrame.clone().multiply(matrix)));
    kit.many("bolt", BOLT, positioned(outerBolts, axisFrame));
    kit.many("bolt", BOLT, positioned(innerBolts, axisFrame));
    kit.add("darkMetal", box(0.16, 0.26, 0.2, 0.012), motorFrame.clone().multiply(trs([1.08, 0.24, 0])));
  }

  const apex = published.overhang;
  kit.add("steel", lathe(chamfer([[apex + assumed.hub.frontFace - 0.08, 0.93], [apex + assumed.hub.frontFace + 0.02, 0.93], [apex + assumed.hub.frontFace + 0.02, 0.8], [apex + assumed.hub.frontFace - 0.12, 0.8]], 0.012), { seg: 72 }));
  kit.many("bolt", BOLT, boltCircle(24, 0.865, apex + assumed.hub.frontFace + 0.02, 1, 0.026));
  kit.add("castInterior", lathe([[apex + assumed.hub.frontFace, 0.84], [apex + assumed.hub.frontFace - 0.6, 0.84], [apex + assumed.hub.frontFace - 0.6, 0]], { seg: 72 }));
  kit.add("cabinet", box(0.4, 0.56, 0.42, 0.015), trs([apex + assumed.hub.frontFace - 0.42, 0, 0.1]));
  kit.add("darkMetal", rod([apex + assumed.hub.frontFace - 0.6, 0, -0.42], [apex + assumed.hub.frontFace - 0.3, 0, -0.42], 0.1, 16));
  return inRotorFrame(kit, spec);
}

// Spinner profile, at `angle` from the bulge towards the nose (+) or the rear rim (-): an ellipse behind the bulge and a fuller superellipse ahead of it.
function spinnerPoint(angle, { radius, bulge, noseFromApex, tail, nosePower }) {
  if (angle < 0) return [bulge + tail * Math.sin(angle), radius * Math.cos(angle)];
  return [bulge + (noseFromApex - bulge) * Math.pow(Math.sin(angle), 2 / nosePower), radius * Math.pow(Math.cos(angle), 2 / nosePower)];
}

export function buildSpinner(spec, mats) {
  const kit = rotatingKit(mats);
  const { assumed, published } = spec;
  const apex = published.overhang;
  const { spinner, bladeCollar: collar } = assumed;
  const frames = bladeFrames(spec);
  const axes = frames.map((frame) => new THREE.Vector3(0, 0, 1).transformDirection(frame));
  const origin = new THREE.Vector3(apex, 0, 0);

  const rows = 110;
  const columns = 216;
  const rearAngle = -Math.asin((spinner.bulge - (spinner.rear - apex)) / spinner.tail);
  const lastAngle = (Math.PI / 2) * 0.998;
  const rings = [];
  for (let i = 0; i <= rows; i++) {
    const [x, r] = spinnerPoint(rearAngle + ((lastAngle - rearAngle) * i) / rows, spinner);
    const ring = new Array(columns);
    for (let j = 0; j < columns; j++) {
      const a = (j / columns) * TAU;
      ring[j] = [x + apex, r * Math.cos(a), r * Math.sin(a)];
    }
    rings.push(ring);
  }
  const shell = loftRings(rings, { closedRing: true, flip: true });
  const position = shell.attributes.position;
  const kept = [];
  const index = shell.index.array;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    centre.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centre.add(v.fromBufferAttribute(position, index[i + k]));
    centre.multiplyScalar(1 / 3).sub(origin);
    const inHole = axes.some((axis) => {
      const along = centre.dot(axis);
      return along > 0 && Math.sqrt(centre.lengthSq() - along * along) < spinner.hole;
    });
    if (!inHole) kept.push(index[i], index[i + 1], index[i + 2]);
  }
  shell.setIndex(new THREE.BufferAttribute(new Uint32Array(kept), 1));
  kit.add("grp", shell);

  // The triangle-dropped hole edge is hidden under the collar, which seats below the skin all the way round.
  const ring = lathe(
    chamfer(
      [
        [collar.seat, collar.outer],
        [collar.face, collar.outer],
        [collar.face, collar.boltCircle - 0.07],
        [collar.neck, collar.inner + 0.03],
        [collar.neck, collar.inner],
        [collar.seat, collar.inner],
      ],
      0.02,
    ),
    { seg: 120 },
  );
  const toBladeAxis = trs([0, 0, 0], [0, -Math.PI / 2, 0]);
  const axisFrames = frames.map((frame) => frame.clone().multiply(toBladeAxis));
  kit.many("paint", ring, axisFrames);
  const bolts = boltCircle(collar.bolts, collar.boltCircle, collar.face, 1, collar.boltSize);
  kit.many("bolt", BOLT, axisFrames.flatMap((frame) => positioned(bolts, frame)));

  // The nose disc stands a step proud of the skin; its seam and the centre cap's are circles at the radius each sits.
  const angleAt = (radius) => Math.acos(Math.pow(radius / spinner.radius, spinner.nosePower / 2));
  const disc = Array.from({ length: 41 }, (_, k) => {
    const [x, r] = spinnerPoint(angleAt(spinner.noseSeam) + (lastAngle - angleAt(spinner.noseSeam)) * (k / 40), spinner);
    return [x + apex + spinner.noseStep, r];
  });
  kit.add("paint", lathe([[disc[0][0] - 2 * spinner.noseStep, disc[0][1]], ...disc], { seg: 144, smooth: 0.5 }));
  for (const [radius, thickness, step] of [[spinner.noseSeam, 0.022, 0], [spinner.capSeam, 0.013, spinner.noseStep]]) {
    const [x, r] = spinnerPoint(angleAt(radius), spinner);
    const path = [];
    for (let k = 0; k < 120; k++) path.push([x + apex + step, r * Math.cos((k / 120) * TAU), r * Math.sin((k / 120) * TAU)]);
    kit.add("seam", pipe(path, thickness, { seg: 5, closed: true }));
  }

  return inRotorFrame(kit, spec);
}

export function buildShaft(spec, mats) {
  const kit = rotatingKit(mats);
  const { mainShaft: m } = spec.assumed;
  const profile = chamfer(
    [
      [m.endS, 0.14],
      [m.endS, m.endRadius],
      [m.seatS[0], m.endRadius],
      [m.seatS[0] + 0.02, m.seatRadius],
      [m.seatS[1], m.seatRadius],
      [m.lockDiscS - 0.12, m.neckRadius - 0.04],
      [m.lockDiscS - 0.09, m.neckRadius],
      [m.lockDiscS + 0.08, m.neckRadius],
      [m.flangeS - 0.22, m.neckRadius + 0.05],
      [m.flangeS - 0.1, m.flangeRadius],
      [m.flangeS, m.flangeRadius],
      [m.flangeS, 0.24],
    ],
    0.015,
  );
  kit.add("steel", lathe(profile, { seg: 96 }));
  kit.add("steel", lathe(chamfer([[m.lockDiscS - 0.09, m.neckRadius], [m.lockDiscS - 0.09, m.lockDiscRadius], [m.lockDiscS + 0.09, m.lockDiscRadius], [m.lockDiscS + 0.09, m.neckRadius]], 0.012), { seg: 96 }));

  const lockHoles = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    lockHoles.push(trs([m.lockDiscS + 0.09, 1.03 * Math.cos(a), 1.03 * Math.sin(a)], [0, Math.PI / 2, 0]));
  }
  kit.many("darkMetal", rod([0, 0, -0.17], [0, 0, 0.012], 0.1, 16), lockHoles);
  kit.many("bolt", BOLT, boltCircle(36, 0.93, m.flangeS, 1, 0.04));
  kit.add("darkMetal", rod([m.flangeS - 0.02, 0, 0], [m.flangeS + 0.012, 0, 0], 0.26, 24));
  kit.add("steel", rod([m.flangeS, 0, 0], [m.flangeS + 0.12, 0, 0], 0.09, 14));

  const { s, radius } = m.shrinkDisc;
  kit.add("steel", lathe(chamfer([[s - 0.2, m.endRadius], [s - 0.2, radius], [s + 0.08, radius], [s + 0.18, radius - 0.14], [s + 0.18, m.endRadius]], 0.012), { seg: 72 }));
  kit.many("bolt", BOLT, boltCircle(24, radius - 0.1, s + 0.15, 1, 0.024));
  return inRotorFrame(kit, spec);
}
