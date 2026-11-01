import * as THREE from "three";
import { ALONG_Z, BOLT, DEG, Kit, TAU, aim, arc, box, boxAt, chamfer, fromArrays, lathe, pipe, rod, seeded, sphere, trs } from "./shapes.js";

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
  kit.add("pile", lathe([[local(published.seabed - spec.assumed.seaTile.sediment), pileR], [local(tp.bottom - 0.3), pileR]], { seg: 96 }), ALONG_Z);

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

function seabedHeight(x, y, pileR) {
  const swell = 0.28 * Math.sin(x * 0.11 + 1.3) * Math.cos(y * 0.09 - 0.7) + 0.12 * Math.sin(x * 0.31 + y * 0.23) + 0.05 * Math.sin(x * 0.83 - y * 0.67);
  const d = Math.hypot(x, y);
  const scour = -0.55 * Math.exp(-((d - pileR - 1) * (d - pileR - 1)) / 9);
  return swell + scour;
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

export function buildSea(spec, mats) {
  const kit = new Kit(mats);
  const { published, assumed } = spec;
  const tile = assumed.seaTile;
  const half = tile.half;
  const seaZ = -published.towerTop;
  const bedZ = seaZ + published.seabed;
  const pileR = published.monopileDiameter / 2;
  const random = seeded(5021);

  const sand = linear("#c9b58c");
  const sandDark = linear("#a8966f");
  const STRATA = [[0, linear("#bda67a")], [0.09, linear("#b09769")], [0.28, linear("#8f7b58")], [0.55, linear("#6d5e49")], [1, linear("#4d4336")]];

  const addMesh = (geometry, material) => kit.object(new THREE.Mesh(geometry, material));

  const GRID = 64;
  const positions = new Float32Array((GRID + 1) * (GRID + 1) * 3);
  const colours = [];
  const indices = [];
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const x = -half + (2 * half * i) / GRID;
      const y = -half + (2 * half * j) / GRID;
      const h = seabedHeight(x, y, pileR);
      positions.set([x, y, bedZ + h], (i * (GRID + 1) + j) * 3);
      colours.push(...mix(sand, sandDark, Math.min(1, Math.max(0, 0.5 - h * 1.1 + (random() - 0.5) * 0.32))));
      if (i < GRID && j < GRID) {
        const a = i * (GRID + 1) + j;
        indices.push(a, a + GRID + 1, a + 1, a + 1, a + GRID + 1, a + GRID + 2);
      }
    }
  }
  const bed = new THREE.BufferGeometry();
  bed.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  bed.setIndex(indices);
  bed.computeVertexNormals();
  addMesh(withColours(bed, colours), mats.sand);

  const stratum = (t) => {
    let c = STRATA[0][1];
    for (let k = 1; k < STRATA.length; k++) {
      const [t0, c0] = STRATA[k - 1];
      const [t1, c1] = STRATA[k];
      if (t >= t0 && t <= t1) c = mix(c0, c1, (t - t0) / (t1 - t0));
    }
    return c;
  };
  const WALL_COLUMNS = 80;
  const WALL_ROWS = 22;
  const edges = [
    { from: [half, half], to: [half, -half], normal: [1, 0, 0] },
    { from: [-half, half], to: [half, half], normal: [0, 1, 0] },
    { from: [half, -half], to: [-half, -half], normal: [0, -1, 0] },
    { from: [-half, -half], to: [-half, half], normal: [-1, 0, 0] },
  ];
  const sedimentPositions = [];
  const sedimentNormals = [];
  const sedimentColours = [];
  const sedimentIndices = [];
  for (const edge of edges) {
    const base = sedimentPositions.length / 3;
    for (let i = 0; i <= WALL_COLUMNS; i++) {
      const u = i / WALL_COLUMNS;
      const x = edge.from[0] + (edge.to[0] - edge.from[0]) * u;
      const y = edge.from[1] + (edge.to[1] - edge.from[1]) * u;
      const wobble = 0.05 * Math.sin(u * 19 + edge.normal[0] * 3) + 0.03 * Math.sin(u * 53);
      const top = bedZ + seabedHeight(x, y, pileR);
      const bottom = bedZ - tile.sediment;
      for (let j = 0; j <= WALL_ROWS; j++) {
        const v = j / WALL_ROWS;
        sedimentPositions.push(x, y, top + (bottom - top) * v);
        sedimentNormals.push(...edge.normal);
        const grain = 1 + (random() - 0.5) * 0.09;
        sedimentColours.push(...stratum(Math.max(0, v + wobble)).map((c) => c * grain));
      }
    }
    for (let i = 0; i < WALL_COLUMNS; i++) {
      for (let j = 0; j < WALL_ROWS; j++) {
        const a = base + i * (WALL_ROWS + 1) + j;
        const b = a + WALL_ROWS + 1;
        sedimentIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  addMesh(withColours(fromArrays(sedimentPositions, sedimentNormals, sedimentIndices), sedimentColours), mats.sediment);

  const big = new THREE.IcosahedronGeometry(1, 1);
  const small = new THREE.IcosahedronGeometry(1, 0);
  for (const g of [big, small]) g.deleteAttribute("uv");
  const rockColor = new THREE.Color();
  const scatter = (geometry, count, rMin, rMax, sizeMin, sizeMax) => {
    const mesh = new THREE.InstancedMesh(geometry, mats.rock, count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = random() * TAU;
      const r = pileR + 0.15 + (rMax - rMin) * Math.pow(random(), 0.7) + rMin;
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      const edgeFade = 1 - Math.min(1, (r - pileR) / (rMax + 0.1));
      const s = sizeMin + (sizeMax - sizeMin) * random() * (0.35 + 0.65 * edgeFade);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * TAU, random() * TAU, random() * TAU));
      matrix.compose(new THREE.Vector3(x, y, bedZ + seabedHeight(x, y, pileR) + s * 0.3), q, new THREE.Vector3(s * (0.8 + random() * 0.5), s * (0.8 + random() * 0.5), s * (0.55 + random() * 0.4)));
      mesh.setMatrixAt(i, matrix);
      const v = 0.42 + random() * 0.32;
      mesh.setColorAt(i, rockColor.setRGB(v, v * 0.97, v * 0.9));
    }
    mesh.frustumCulled = false;
    kit.object(mesh);
  };
  scatter(big, Math.round(tile.scourRocks * 0.2), 0, tile.scourRadius * 0.62, 0.35, 0.95);
  scatter(small, Math.round(tile.scourRocks * 0.8), 0, tile.scourRadius, 0.14, 0.42);

  // Water: the shaders lift whatever carries aTop = 1 by the wave field, so the surface and the top of the side walls move together.
  const SURFACE = 128;
  const surfacePositions = new Float32Array((SURFACE + 1) * (SURFACE + 1) * 3);
  const surfaceNormals = new Float32Array((SURFACE + 1) * (SURFACE + 1) * 3);
  const surfaceIndices = [];
  for (let i = 0; i <= SURFACE; i++) {
    for (let j = 0; j <= SURFACE; j++) {
      const v = i * (SURFACE + 1) + j;
      surfacePositions.set([-half + (2 * half * i) / SURFACE, -half + (2 * half * j) / SURFACE, seaZ], v * 3);
      surfaceNormals.set([0, 0, 1], v * 3);
      if (i < SURFACE && j < SURFACE) surfaceIndices.push(v, v + SURFACE + 1, v + 1, v + 1, v + SURFACE + 1, v + SURFACE + 2);
    }
  }
  const surface = fromArrays(surfacePositions, surfaceNormals, surfaceIndices);
  surface.setAttribute("aTop", new THREE.BufferAttribute(new Float32Array((SURFACE + 1) * (SURFACE + 1)).fill(1), 1));

  const wall = (selected, order) => {
    const positionsW = [];
    const normalsW = [];
    const tops = [];
    const indicesW = [];
    for (const edge of selected) {
      const base = positionsW.length / 3;
      const columns = 90;
      for (let i = 0; i <= columns; i++) {
        const u = i / columns;
        const x = edge.from[0] + (edge.to[0] - edge.from[0]) * u;
        const y = edge.from[1] + (edge.to[1] - edge.from[1]) * u;
        positionsW.push(x, y, seaZ, x, y, bedZ);
        normalsW.push(...edge.normal, ...edge.normal);
        tops.push(1, 0);
      }
      for (let i = 0; i < columns; i++) {
        const a = base + i * 2;
        indicesW.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }
    const geometry = fromArrays(positionsW, normalsW, indicesW);
    geometry.setAttribute("aTop", new THREE.BufferAttribute(new Float32Array(tops), 1));
    const mesh = new THREE.Mesh(geometry, mats.waterWall);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    kit.object(mesh);
  };
  const surfaceMesh = new THREE.Mesh(surface, mats.water);
  surfaceMesh.receiveShadow = true;
  surfaceMesh.renderOrder = 4;
  surfaceMesh.frustumCulled = false;
  kit.object(surfaceMesh);
  wall([edges[0], edges[2]], 5);

  return kit.finish();
}
