import * as THREE from "three";
import { sectionAt, bladeSpans, RING_POINTS } from "./loft.js";
import { BOLT, DEG, Kit, TAU, aim, boltCircle, chamfer, inShaftFrame, lathe, loftRings, merge, pipe, positioned, rod, sphere, trs } from "./shapes.js";

const NOSE_INDEX = (RING_POINTS - 1) / 2;

const AZIMUTHS = [0, 120, 240].map((a) => a * DEG);

// Blade frame origin at the apex: +z along the preconed pitch axis, +x upwind, +y the direction of rotation.
export const bladeFrames = (spec) =>
  AZIMUTHS.map((azimuth) => trs([spec.published.overhang, 0, 0]).multiply(trs([0, 0, 0], [azimuth, 0, 0])).multiply(trs([0, 0, 0], [0, spec.published.precone * DEG, 0])));

export function rotatingKit(mats) {
  const kit = new Kit(mats);
  kit.group.userData.spins = true;
  return kit;
}

export function inRotorFrame(kit, spec) {
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

// A whole rotor as one mesh in the shaft frame, for the turbines standing behind. `light` keeps fewer sections along each blade and fewer points round each, for a farm seen only at the hero's distance.
export function simpleRotor(spec, { light = false } = {}) {
  const { rings } = bladeSkin(spec);
  const thin = (list, step) => list.filter((_, k) => k % step === 0 || k === list.length - 1);
  const [along, around] = light ? [9, 5] : [5, 3];
  const skin = loftRings(thin(rings, along).map((ring) => thin(ring, around)), { flip: true });
  return merge([...bladeFrames(spec).map((frame) => skin.clone().applyMatrix4(frame)), sphere([spec.published.overhang, 0, 0], spec.assumed.spinner.radius, light ? 12 : 16, light ? 8 : 10)]);
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
