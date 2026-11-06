import * as THREE from "three";
import { ALONG_Z, BOLT, DEG, Kit, TAU, aim, arc, box, boxAt, chamfer, fromArrays, gear, lathe, loftRings, pipe, prism, rod, sphere, trs } from "./shapes.js";
import { hullHalfWidthAt, hullSection, superellipse } from "../assumed.js";

export function buildConverter(spec, mats) {
  const kit = new Kit(mats);
  const c = spec.assumed.converter;
  const louvre = [];
  const handle = [];
  const screws = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < c.cabinets; i++) {
      const x = c.x0 - i * (c.width + 0.04);
      const y = side * c.rowY;
      const cz = c.z + c.height / 2;
      kit.add("cabinet", boxAt([x, y, cz], [c.width, c.depth, c.height], 0.012));
      kit.add("framePaint", boxAt([x, y, c.z + 0.05], [c.width + 0.02, c.depth + 0.02, 0.1], 0.004));
      const face = y + side * (c.depth / 2);
      kit.add("cabinetDoor", boxAt([x, face + side * 0.012, cz + 0.04], [c.width - 0.08, 0.024, c.height - 0.3], 0.006));
      kit.add("seam", boxAt([x, face + side * 0.002, cz + 0.04], [c.width - 0.05, 0.004, c.height - 0.27]));
      for (let k = 0; k < 9; k++) {
        louvre.push(trs([x, face + side * 0.03, c.z + 0.34 + k * 0.05], [side * 0.45, 0, 0]));
        louvre.push(trs([x, face + side * 0.03, c.z + c.height - 0.62 + k * 0.05], [side * 0.45, 0, 0]));
      }
      handle.push(trs([x + c.width / 2 - 0.09, face + side * 0.05, cz + 0.08]));
      for (const dz of [-0.82, 0.92]) screws.push(aim([x - c.width / 2 + 0.06, face + side * 0.024, cz + dz], [0, side, 0], 0.012));
      kit.add("warning", triangle([x - 0.1, face + side * 0.0255, cz + 0.28], 0.13, side));
      kit.add("dark", triangle([x - 0.1, face + side * 0.027, cz + 0.28], 0.05, side));
      kit.add("label", boxAt([x + 0.08, face + side * 0.026, cz + 0.28], [0.22, 0.003, 0.14]));
      kit.add("dark", boxAt([x + 0.08, face + side * 0.028, cz + 0.31], [0.16, 0.002, 0.012]));
      kit.add("dark", boxAt([x + 0.08, face + side * 0.028, cz + 0.27], [0.16, 0.002, 0.012]));
    }
    const length = c.cabinets * (c.width + 0.04);
    kit.add("galvanised", boxAt([c.x0 - length / 2 + c.width / 2, side * c.rowY, c.z + c.height + 0.08], [length, 0.42, 0.04]));
    for (const dy of [-0.2, 0.2]) kit.add("galvanised", boxAt([c.x0 - length / 2 + c.width / 2, side * c.rowY + dy, c.z + c.height + 0.13], [length, 0.015, 0.1]));
    for (const dy of [-0.14, -0.05, 0.05, 0.14]) {
      kit.add("rubber", pipe([[c.x0 + 0.4, side * c.rowY + dy, c.z + c.height + 0.13], [c.x0 - length + 0.6, side * c.rowY + dy, c.z + c.height + 0.13]], 0.03, { seg: 6 }));
    }
  }
  kit.many("cabinetDoor", box(c.width - 0.2, 0.035, 0.008), louvre);
  kit.many("darkMetal", box(0.03, 0.03, 0.17, 0.006), handle);
  kit.many("bolt", BOLT, screws);
  return kit.finish();
}

function triangle(center, size, side) {
  const [x, y, z] = center;
  const h = size * 0.86;
  const a = [x - size / 2, y, z - h / 3];
  const b = [x + size / 2, y, z - h / 3];
  const c = [x, y, z + (2 * h) / 3];
  const positions = [...a, ...b, ...c];
  const normals = [0, side, 0, 0, side, 0, 0, side, 0];
  return fromArrays(positions, normals, side > 0 ? [0, 2, 1] : [0, 1, 2]);
}

const sampled = (count, at) => Array.from({ length: count }, (_, k) => at(k / count));
// Even angular steps along a superellipse quarter, so a dome's steep end gets its share of stations.
const domeT = (u, power) => Math.pow(Math.sin((u * Math.PI) / 2), 2 / power);
const smoothstep = (a, b, t) => {
  const c = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return c * c * (3 - 2 * c);
};
const lerp = (a, b, t) => a + (b - a) * t;

// One half of a section running up to the crown, mirrored into a whole one anticlockwise seen from upwind, so a rear-to-front loft with `flip` faces outwards.
const mirrored = (x, half, crown) => [...half, crown, ...[...half].reverse().map(([y, z]) => [-y, z])].map(([y, z]) => [x, y, z]);

const hullHalf = ({ halfWidth, top, bottom, cornerTop, cornerBottom }) => [
    ...sampled(5, (u) => [((halfWidth - cornerBottom) * (u * 5 + 1)) / 6, bottom]),
    ...sampled(10, (u) => [halfWidth - cornerBottom + cornerBottom * Math.sin((u * Math.PI) / 2), bottom + cornerBottom - cornerBottom * Math.cos((u * Math.PI) / 2)]),
    ...sampled(10, (u) => [halfWidth, lerp(bottom + cornerBottom, top - cornerTop, u)]),
    ...sampled(20, (u) => [halfWidth - cornerTop + cornerTop * Math.cos((u * Math.PI) / 2), top - cornerTop + cornerTop * Math.sin((u * Math.PI) / 2)]),
    ...sampled(8, (u) => [(halfWidth - cornerTop) * (1 - u), top]),
];

const hullRing = (x, section) => [[x, 0, section.bottom], ...mirrored(x, hullHalf(section), [0, section.top])];

const insetSection = ({ halfWidth, top, bottom, cornerTop, cornerBottom }, t) => ({
  halfWidth: halfWidth - t,
  top: top - t,
  bottom: bottom + t,
  cornerTop: Math.max(0.01, cornerTop - t),
  cornerBottom: Math.max(0.01, cornerBottom - t),
});

// The stretch of a half outline between two heights, resampled evenly so every station gets the same column count.
function outlineBetween(section, from, to, count) {
  const outline = [[0, section.bottom], ...hullHalf(section), [0, section.top]];
  const kept = [];
  const at = (a, b, z) => [lerp(a[0], b[0], (z - a[1]) / (b[1] - a[1])), z];
  outline.forEach((point, i) => {
    const previous = outline[i - 1];
    if (previous && previous[1] < from && point[1] > from) kept.push(at(previous, point, from));
    if (point[1] >= from && point[1] <= to) kept.push(point);
    if (previous && previous[1] < to && point[1] > to) kept.push(at(previous, point, to));
  });
  const lengths = [0];
  kept.slice(1).forEach((point, i) => lengths.push(lengths[i] + Math.hypot(point[0] - kept[i][0], point[1] - kept[i][1])));
  return Array.from({ length: count }, (_, k) => {
    const s = (lengths.at(-1) * k) / (count - 1);
    const reached = lengths.findIndex((length) => length >= s);
    const i = reached < 0 ? kept.length - 2 : Math.max(0, reached - 1);
    const u = lengths[i + 1] > lengths[i] ? (s - lengths[i]) / (lengths[i + 1] - lengths[i]) : 0;
    return [lerp(kept[i][0], kept[i + 1][0], u), lerp(kept[i][1], kept[i + 1][1], u)];
  });
}

const mirrorPath = (path) => path.map(([y, z]) => [-y, z]).reverse();

// A loft of closed shell sections: the outer skin, a sharp rim, the inner skin and a sharp rim back. Each end closes on the shell's mid-line.
function shellLoft(stations, arc) {
  const ring = (x, outer, inner) => {
    const flipped = [...inner].reverse();
    return [...outer, outer.at(-1), flipped[0], ...flipped, flipped.at(-1), outer[0]].map(([y, z]) => [x, y, z]);
  };
  const cap = (x) => {
    const { outer, inner } = arc(x);
    const middle = outer.map(([y, z], k) => [(y + inner[k][0]) / 2, (z + inner[k][1]) / 2]);
    return ring(x, middle, middle);
  };
  const rings = stations.map((x) => {
    const { outer, inner } = arc(x);
    return ring(x, outer, inner);
  });
  return loftRings([cap(stations[0]), ...rings, cap(stations.at(-1))], { closedRing: true, flip: true });
}

function coverStations({ nacelle: n }) {
  const { stern, shoulder, panels } = n;
  return [
    ...sampled(8, (u) => lerp(panels.sternAt, stern.from, u)),
    ...sampled(18, (u) => lerp(stern.from, shoulder.from, u)),
    ...sampled(24, (u) => shoulder.from + (n.front - shoulder.from) * domeT(u, shoulder.power)),
    n.front,
  ];
}

const bandArc = (x, from, to, count, shell) => ({
  outer: outlineBetween(hullSection(x), from, to, count),
  inner: outlineBetween(insetSection(hullSection(x), shell), from, to, count),
});

// Side view of the raised housing: `upper` and `lower` bound it at each station, from a rounded rear wall, over the roof, down the rake to a rounded tip on the flank.
function raisedOutline(r) {
  const rake = Math.atan2(r.top - r.low, r.tip - r.frontTop);
  const brow = { x: r.frontTop - r.browRadius * Math.tan(rake / 2), z: r.top - r.browRadius };
  const tip = { x: r.tip - r.tipRadius / Math.tan(rake / 2), z: r.low + r.tipRadius };
  const rakeFrom = brow.x + r.browRadius * Math.sin(rake);
  const rakeTo = tip.x + r.tipRadius * Math.sin(rake);
  const tipEnd = tip.x + r.tipRadius;
  const onCircle = (centre, radius, x) => Math.sqrt(Math.max(0, radius * radius - (x - centre.x) * (x - centre.x)));
  const lower = (x) => (x <= tip.x ? r.low : tip.z - onCircle(tip, r.tipRadius, x));
  const upper = (x) => {
    if (x <= r.tail) return r.low;
    if (x < r.rearTop) return r.low + (r.top - r.low) * superellipse((r.rearTop - x) / (r.rearTop - r.tail), 3);
    if (x <= brow.x) return r.top;
    if (x <= rakeFrom) return brow.z + onCircle(brow, r.browRadius, x);
    if (x <= rakeTo) return r.top - (x - r.frontTop) * Math.tan(rake);
    if (x < tipEnd) return tip.z + onCircle(tip, r.tipRadius, x);
    return tip.z;
  };
  const stations = [
    ...sampled(24, (u) => r.rearTop - (r.rearTop - r.tail) * domeT(1 - u, 3)),
    ...sampled(8, (u) => lerp(r.rearTop, brow.x, u)),
    ...sampled(10, (u) => brow.x + r.browRadius * Math.sin(rake * u)),
    // The recessed crown turns over the same brow, earlier.
    ...sampled(10, (u) => brow.x - r.recess + r.browRadius * Math.sin(rake * u)),
    ...sampled(30, (u) => lerp(rakeFrom, rakeTo, u)),
    ...sampled(16, (u) => tip.x + r.tipRadius * Math.sin((u * Math.PI) / 2)),
    tipEnd,
  ]
    .sort((a, b) => a - b)
    .filter((x, i, all) => i === 0 || x - all[i - 1] > 1e-3);
  return { rake, upper, lower, stations };
}

// Section of the raised housing. Its crown dips between the two side pillars, so the panes sit back from them, and runs on inside the cover where the rake has fallen below the roof.
function raisedRing(x, r, { upper, lower }) {
  const { halfWidth } = hullSection(x);
  const outer = halfWidth + r.proud;
  const bottom = lower(x);
  const top = upper(x);
  const crown = Math.min(top, upper(x + r.recess));
  const corner = Math.min((top - bottom) / 2, lerp(r.cornerLow, r.corner, smoothstep(r.cornerFrom, r.top, top)));
  const lip = Math.min(0.03, (top - bottom) * 0.2);
  const sideTop = top - corner;
  const sideAt = (z) => outer - r.lean * smoothstep(r.leanFrom, r.top, z);
  const shoulderY = sideAt(sideTop) - corner;
  const half = [
    [halfWidth - 0.12, bottom],
    [outer - lip, bottom],
    ...sampled(12, (u) => {
      const z = lerp(bottom + lip, sideTop, u);
      return [sideAt(z), z];
    }),
    ...sampled(8, (u) => [shoulderY + corner * Math.cos((u * Math.PI) / 2), sideTop + corner * Math.sin((u * Math.PI) / 2)]),
    ...sampled(10, (u) => {
      const y = shoulderY * (1 - u);
      return [y, lerp(crown, top, smoothstep(shoulderY - r.pillar, shoulderY, y))];
    }),
  ];
  return mirrored(x, half, [0, crown]);
}

const densified = (path, step) =>
  path.flatMap(([a, b], i) => {
    const [c, d] = path[(i + 1) % path.length];
    return sampled(Math.max(1, Math.ceil(Math.hypot(c - a, d - b) / step)), (u) => [lerp(a, c, u), lerp(b, d, u)]);
  });

const roundedRect = (cy, cz, width, height, radius, steps = 4) =>
  [[1, 1, 0], [-1, 1, 1], [-1, -1, 2], [1, -1, 3]].flatMap(([sy, sz, quarter]) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const a = ((quarter + k / steps) * Math.PI) / 2;
      return [cy + sy * (width / 2 - radius) + radius * Math.cos(a), cz + sz * (height / 2 - radius) + radius * Math.sin(a)];
    }),
  );

// The pane band lies on the recessed rake plane; +x of a prism drawn with this matrix is that plane's normal.
function addPanes(kit, r, { rake }) {
  const { panes } = r;
  const planeX = (z) => r.frontTop - r.recess + (r.top - z) / Math.tan(rake);
  const middle = (panes.bottom + panes.top) / 2;
  const slopeLength = (panes.top - panes.bottom) / Math.sin(rake);
  const onPlane = trs([planeX(middle), 0, middle], [0, rake - Math.PI / 2, 0]);
  const paneWidth = (panes.halfWidth * 2 - panes.mullion * (panes.count - 1)) / panes.count;
  const holes = sampled(panes.count, (u) => roundedRect(-panes.halfWidth + paneWidth / 2 + u * panes.count * (paneWidth + panes.mullion), 0, paneWidth, slopeLength, panes.radius).reverse());
  const size = [panes.halfWidth * 2 + 0.2, slopeLength + 0.2];
  const glass = prism(roundedRect(0, 0, size[0] - 0.08, size[1] - 0.08, panes.radius), -0.06, 0.02);
  const { position, normal } = glass.attributes;
  for (let i = 0; i < normal.count; i++) {
    if (normal.getX(i) < 0.5) continue;
    const length = Math.hypot(1, position.getY(i) * panes.bow[0], position.getZ(i) * panes.bow[1]);
    normal.setXYZ(i, 1 / length, (position.getY(i) * panes.bow[0]) / length, (position.getZ(i) * panes.bow[1]) / length);
  }
  kit.add("glass", glass, onPlane);
  kit.add("paint", prism(roundedRect(0, 0, size[0], size[1], panes.radius + 0.08), -0.06, 0.07, { holes, bevel: 0.015, curve: 4 }), onPlane);
}

function addInstruments(kit, spec, mats) {
  const { raised: r, instruments: inst } = spec.assumed;
  const roof = r.top;
  const tripod = (x, y, height) => {
    const { spread, height: legs } = inst.tripod;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.5;
      kit.add("galvanised", rod([x + spread * Math.cos(a), y + spread * Math.sin(a), roof - 0.02], [x, y, roof + legs], 0.02, 6));
    }
    kit.add("galvanised", rod([x, y, roof + legs - 0.12], [x, y, roof + height], [0.04, 0.026], 10));
    kit.add("aluminium", rod([x, y, roof + legs], [x, y, roof + legs + 0.34], 0.08, 14));
  };

  const { cups } = inst;
  tripod(cups.x, cups.y, cups.height);
  const hub = [cups.x, cups.y, roof + cups.height];
  kit.add("darkMetal", rod(hub, [hub[0], hub[1], hub[2] + 0.12], 0.045, 12));
  const cup = sphere([0, 0, 0], cups.cupRadius, 14, 6, Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.35;
    const tip = [hub[0] + cups.armLength * Math.cos(a), hub[1] + cups.armLength * Math.sin(a), hub[2] + 0.1];
    kit.add("darkMetal", rod([hub[0], hub[1], hub[2] + 0.1], tip, 0.012, 6));
    kit.add("darkMetal", cup.clone(), trs(tip, [0, 0, a]));
  }

  const { vane } = inst;
  tripod(vane.x, vane.y, vane.height);
  const pivot = [vane.x, vane.y, roof + vane.height + 0.1];
  kit.add("darkMetal", rod([pivot[0], pivot[1], roof + vane.height], pivot, 0.04, 10));
  kit.add("aluminium", rod([pivot[0] + vane.head, pivot[1], pivot[2]], [pivot[0] - vane.tail, pivot[1], pivot[2]], 0.022, 8));
  kit.add("aluminium", boxAt([pivot[0] - vane.tail, pivot[1], pivot[2]], [vane.fin[0], 0.014, vane.fin[1]], 0.005));
  kit.add("darkMetal", rod([pivot[0] + vane.head - 0.025, pivot[1], pivot[2]], [pivot[0] + vane.head + 0.025, pivot[1], pivot[2]], vane.disc, 22));

  const { radome, beacon } = inst;
  kit.add("galvanised", rod([radome.x, radome.y, roof - 0.02], [radome.x, radome.y, roof + radome.collar], 0.17, 18));
  kit.add("paint", sphere([0, 0, 0], radome.radius, 32, 22), trs([radome.x, radome.y, roof + radome.collar + radome.radius * 1.02], [0, 0, 0], [1, 1, 1.1]));

  kit.add("galvanised", rod([beacon.x, beacon.y, roof - 0.02], [beacon.x, beacon.y, roof + beacon.height], [0.035, 0.024], 10));
  kit.add("galvanised", rod([beacon.x, beacon.y, roof + beacon.height], [beacon.x, beacon.y, roof + beacon.height + 0.06], 0.08, 14));
  const lamp = [beacon.x, beacon.y, roof + beacon.height + 0.14];
  kit.add("beacon", sphere(lamp, 0.09, 16, 12));
  const glow = new THREE.Sprite(mats.beaconGlow);
  glow.position.set(...lamp);
  glow.scale.set(3.6, 3.6, 1);
  kit.object(glow);
}

// The cover as one closed skin with its panes, for the distant turbines. Returns geometry by finish.
export function simpleNacelle(spec) {
  const { nacelle: n, raised: r } = spec.assumed;
  const { stern, shoulder } = n;
  const shaftZ = spec.published.towerTopToShaft + n.front * Math.tan(spec.published.shaftTilt * DEG);
  const stations = [
    ...sampled(18, (u) => stern.from - (stern.from - n.rear) * domeT(1 - u, stern.power)),
    ...sampled(8, (u) => lerp(stern.from, shoulder.from, u)),
    ...sampled(12, (u) => shoulder.from + (n.front - shoulder.from) * domeT(u, shoulder.power)),
    n.front,
  ];
  const thin = (list, step) => list.filter((_, k) => k % step === 0 || k === list.length - 1);
  const rings = stations.map((x) => hullRing(x, hullSection(x)));
  const nose = hullSection(n.front);
  rings.push(hullRing(n.front, { halfWidth: nose.halfWidth * 0.1, top: shaftZ + (nose.top - shaftZ) * 0.1, bottom: shaftZ + (nose.bottom - shaftZ) * 0.1, cornerTop: nose.cornerTop * 0.1, cornerBottom: nose.cornerBottom * 0.1 }));
  const outline = raisedOutline(r);
  const solid = { paint: [loftRings(rings.map((ring) => thin(ring, 3)), { closedRing: true, flip: true }), loftRings(thin(outline.stations, 3).map((x) => thin(raisedRing(x, r, outline), 2)), { flip: true })], glass: [] };
  addPanes({ add: (key, geometry, matrix) => solid[key].push(geometry.applyMatrix4(matrix)) }, r, outline);
  return solid;
}

export function buildCover(spec, mats) {
  const kit = new Kit(mats);
  const { nacelle: n } = spec.assumed;
  const shaftZ = spec.published.towerTopToShaft + n.front * Math.tan(spec.published.shaftTilt * DEG);
  kit.add("paint", shellLoft(coverStations(spec.assumed), (x) => {
    const { outer, inner } = bandArc(x, n.seam.z, Infinity, 40, n.panels.shell);
    return { outer: [...outer, ...mirrorPath(outer)], inner: [...inner, ...mirrorPath(inner)] };
  }));

  // A flat plate closes the nose behind the spinner, around the shaft seal, and comes away with the roof.
  const nose = hullSection(n.front);
  const plate = [1, 0.75, 0.45, 0.15].map((f) => hullRing(n.front, { halfWidth: nose.halfWidth * f, top: shaftZ + (nose.top - shaftZ) * f, bottom: shaftZ + (nose.bottom - shaftZ) * f, cornerTop: nose.cornerTop * f, cornerBottom: nose.cornerBottom * f }));
  kit.add("paint", loftRings(plate, { closedRing: true, flip: true }));
  const { inner: sealInner, outer: sealOuter } = n.shaftSeal;
  kit.add("rubber", lathe(chamfer([[-0.04, sealInner], [-0.04, sealOuter], [0.04, sealOuter], [0.04, sealInner]], 0.012), { seg: 72 }), trs([n.front + 0.02, 0, shaftZ]));
  kit.add("dark", rod([n.front, 0, shaftZ], [n.front + 0.03, 0, shaftZ], sealInner + 0.01, 56));

  const { vent, hatch } = n;
  for (const side of [-1, 1]) {
    const face = side * n.halfWidth;
    kit.add("dark", boxAt([vent.x, face, vent.z], [vent.length, 0.02, vent.height], 0.003));
    kit.add("paint", boxAt([vent.x, face + side * 0.03, vent.z + vent.height / 2 + 0.012], [vent.length + 0.12, 0.07, 0.03], 0.012));
  }
  kit.add("paint", boxAt([hatch.x, hatch.y, n.roof + 0.012], [hatch.length, hatch.width, 0.03], 0.01));
  kit.add("seam", boxAt([hatch.x, hatch.y, n.roof + 0.002], [hatch.length + 0.05, hatch.width + 0.05, 0.006]));
  return kit.finish();
}

export function buildHousing(spec, mats) {
  const kit = new Kit(mats);
  const { nacelle: n, raised: r } = spec.assumed;
  const outline = raisedOutline(r);
  kit.add("paint", loftRings(outline.stations.map((x) => raisedRing(x, r, outline)), { flip: true }));
  addPanes(kit, r, outline);

  const onFlank = ([x, z]) => [x, hullHalfWidthAt(x, z) + 0.002, z];
  // Side panel outlines: a gap up the rake where it lands on the flank, until the roof curves away, and a line along its foot, whose real gap faces downwards out of sight.
  const finRake = outline.stations.filter((x) => outline.upper(x) < n.roof - n.cornerTop && x > r.frontTop).map((x) => onFlank([x, outline.upper(x)]));
  const finFoot = outline.stations.filter((x) => x > r.tail + 0.02 && outline.lower(x) === r.low).map((x) => [x, hullSection(x).halfWidth + r.proud + 0.002, r.low + 0.05]);
  for (const side of [-1, 1]) {
    const onSide = (path) => path.map(([x, y, z]) => [x, side * y, z]);
    kit.add("seam", pipe(onSide(finRake), 0.016, { seg: 5 }));
    kit.add("seam", pipe(onSide(finFoot), 0.014, { seg: 5 }));
    const { panel } = r;
    const panelPath = densified(roundedRect((panel.rear + panel.front) / 2, (panel.bottom + panel.top) / 2, panel.front - panel.rear, panel.top - panel.bottom, panel.radius, 5), 0.2).map(([x, z]) => [x, side * (hullSection(x).halfWidth + r.proud + 0.002), z]);
    kit.add("seam", pipe(panelPath, 0.01, { seg: 5, closed: true }));
  }
  addInstruments(kit, spec, mats);
  return kit.finish();
}

export function buildSidePanel(spec, mats, side) {
  const kit = new Kit(mats);
  const { nacelle: n, raised: r } = spec.assumed;
  kit.add("paint", shellLoft(coverStations(spec.assumed), (x) => {
    const { outer, inner } = bandArc(x, n.seam.lowZ, n.seam.z, 24, n.panels.shell);
    return side > 0 ? { outer, inner } : { outer: mirrorPath(outer), inner: mirrorPath(inner) };
  }));
  const onFlank = (x, z) => [x, side * (hullHalfWidthAt(x, z) + 0.002), z];
  const flankSeam = (from, to, z, count = 50) => sampled(count + 1, (u) => onFlank(lerp(from, to, (u * (count + 1)) / count), z));
  const seamFrom = r.frontTop + (r.top - n.seam.z) / Math.tan(raisedOutline(r).rake);
  kit.add("seam", pipe(flankSeam(seamFrom, n.front - 0.25, n.seam.z), 0.014, { seg: 5 }));
  kit.add("seam", pipe(flankSeam(n.stern.from - 1.5, r.tip - 0.2, n.seam.lowZ, 24), 0.014, { seg: 5 }));
  return kit.finish();
}

export function buildFloor(spec, mats) {
  const kit = new Kit(mats);
  const { nacelle: n } = spec.assumed;
  const pan = shellLoft(coverStations(spec.assumed), (x) => {
    const { outer, inner } = bandArc(x, -Infinity, n.seam.lowZ, 40, n.panels.shell);
    return { outer: [...mirrorPath(outer), ...outer], inner: [...mirrorPath(inner), ...inner] };
  });
  // The tower opening is cut by dropping triangles: the jagged edge they leave stays under the rim.
  const { floorHole } = n.panels;
  const position = pan.attributes.position;
  const kept = [];
  const index = pan.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
    const cx = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const cy = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    if (Math.hypot(cx, cy) > floorHole) kept.push(a, b, c);
  }
  pan.setIndex(kept);
  kit.add("paint", pan);
  kit.add("paint", lathe(chamfer([[-0.1, floorHole + 0.26], [-0.1, floorHole - 0.05], [-0.26, floorHole - 0.05], [-0.26, floorHole + 0.26]], 0.02, { closed: true }), { seg: 96, closed: true }), ALONG_Z);
  return kit.finish();
}

export function buildStern(spec, mats) {
  const kit = new Kit(mats);
  const { nacelle: n } = spec.assumed;
  const { stern, panels } = n;
  const outer = [...sampled(30, (u) => stern.from - (stern.from - n.rear) * domeT(1 - u, stern.power))].filter((x) => x < panels.sternAt);
  outer.push(panels.sternAt);
  const skin = outer.map((x) => hullRing(x, hullSection(x)));
  const inner = [...outer].reverse().filter((x) => hullSection(x).halfWidth > panels.shell * 2 && hullSection(x).top - hullSection(x).bottom > panels.shell * 2);
  const lining = inner.map((x) => hullRing(x, insetSection(hullSection(x), panels.shell)));
  const tip = lining.at(-1).map(([x]) => [x, 0, stern.centre]);
  kit.add("paint", loftRings([...skin, skin.at(-1), lining[0], ...lining, tip], { closedRing: true, flip: true }));
  return kit.finish();
}

export function buildSpaceframe(spec, mats, side) {
  const kit = new Kit(mats);
  const f = spec.assumed.spaceframe;
  const y = side * f.y;
  const bay = (f.front - f.rear) / f.bays;
  for (const z of [f.low, f.high]) kit.add("galvanised", boxAt([(f.front + f.rear) / 2, y, z], [f.front - f.rear + f.chord, f.chord, f.chord], 0.012));
  for (let k = 0; k <= f.bays; k++) {
    const x = f.rear + k * bay;
    kit.add("galvanised", rod([x, y, f.low], [x, y, f.high], f.member, 10));
    kit.add("framePaint", boxAt([x, y, f.low - 0.14], [0.26, 0.2, 0.16], 0.012));
    if (k < f.bays) kit.add("galvanised", k % 2 ? rod([x, y, f.low], [x + bay, y, f.high], f.member * 0.8, 8) : rod([x, y, f.high], [x + bay, y, f.low], f.member * 0.8, 8));
  }
  return kit.finish();
}

export function buildCooling(spec, mats) {
  const kit = new Kit(mats);
  const { cooling: c } = spec.assumed;
  const base = c.base;
  const width = c.width;
  const height = c.height;
  const depth = c.depth;
  const top = base + 0.2 + height;

  for (const y of [-width / 2, width / 2]) {
    kit.add("galvanised", boxAt([c.x, y, base + 0.2 + height / 2], [depth + 0.08, 0.1, height + 0.08], 0.01));
    for (const x of [c.x - 0.42, c.x + 0.42]) {
      kit.add("galvanised", boxAt([x, y, base + 0.1], [0.1, 0.1, 0.5], 0.006));
      kit.add("galvanised", boxAt([x, y * 0.6, base + 0.1], [0.1, 0.1, 0.5], 0.006));
    }
  }
  for (const z of [base + 0.2, top]) kit.add("galvanised", boxAt([c.x, 0, z], [depth + 0.1, width, 0.09], 0.01));
  kit.add("galvanised", boxAt([c.x, 0, base + 0.02], [1.1, width + 0.2, 0.06]));

  const fin = box(depth - 0.04, 0.006, height - 0.08);
  const fins = [];
  for (let k = 0; k < c.fins; k++) fins.push(trs([c.x, -width / 2 + 0.06 + ((width - 0.12) * k) / (c.fins - 1), base + 0.2 + height / 2]));
  kit.many("aluminium", fin, fins);
  const tubes = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 6; col++) {
      tubes.push(trs([c.x + (col - 2.5) * 0.085, 0, base + 0.42 + row * 0.2]));
    }
  }
  kit.many("copper", rod([0, -width / 2, 0], [0, width / 2, 0], 0.012, 6), tubes);
  kit.add("steel", rod([c.x, width / 2 + 0.05, base + 0.1], [c.x, width / 2 + 0.05, top - 0.02], 0.07, 12));
  kit.add("steel", rod([c.x, -width / 2 - 0.05, base + 0.1], [c.x, -width / 2 - 0.05, top - 0.02], 0.07, 12));
  kit.add("rubber", pipe([[c.x, width / 2 + 0.05, base + 0.12], [c.x + 0.14, width / 2 + 0.2, base - 0.02], [c.x + 0.5, width / 2 + 0.14, base - 0.28]], 0.05, { seg: 8 }));
  kit.add("rubber", pipe([[c.x, -width / 2 - 0.05, base + 0.12], [c.x + 0.14, -width / 2 - 0.2, base - 0.02], [c.x + 0.5, -width / 2 - 0.14, base - 0.28]], 0.05, { seg: 8 }));

  // Fans on the upwind face, so the visible side shows them.
  const fanAt = [-0.72, 0.72];
  for (const y of fanAt) {
    const frame = trs([c.x + depth / 2, y, base + 0.2 + height / 2]);
    kit.add("darkMetal", lathe(chamfer([[0, c.fanRadius - 0.02], [0, c.fanRadius + 0.05], [0.2, c.fanRadius + 0.05], [0.2, c.fanRadius - 0.02]], 0.01), { seg: 56 }), frame);
    kit.add("darkMetal", rod([0.02, 0, 0], [0.26, 0, 0], 0.12, 20), frame);
    const blades = [];
    for (let k = 0; k < 7; k++) blades.push(frame.clone().multiply(trs([0.13, 0, 0], [(k / 7) * TAU, 0, 0])).multiply(trs([0, (c.fanRadius + 0.12) / 2, 0], [0.5, 0, 0])));
    kit.many("composite", box(0.012, c.fanRadius - 0.14, 0.19), blades);
    const guard = [];
    for (let r = 0.2; r < c.fanRadius; r += 0.1) guard.push(frame.clone().multiply(trs([0.215, 0, 0], [0, -Math.PI / 2, 0], [r, r, 1])));
    kit.many("steel", pipe(arc(1, 0, 0, TAU, 32), 0.005, { seg: 4 }), guard);
    const spokes = [];
    for (let k = 0; k < 4; k++) spokes.push(frame.clone().multiply(trs([0.215, 0, 0], [(k / 4) * TAU, 0, 0])));
    kit.many("steel", rod([0, -c.fanRadius, 0], [0, c.fanRadius, 0], 0.006, 5), spokes);
  }
  return kit.finish();
}

export function buildBedplate(spec, mats) {
  const kit = new Kit(mats);
  const b = spec.assumed.bedplate;
  const g = spec.assumed.gearbox;
  const mb = spec.assumed.mainBearing;

  // Side profile of each cast cheek in [x, z], stepping down from the main-bearing deck to the yaw ring.
  const cheekProfile = [
    [b.castFront, 0.12],
    [b.castFront, b.top - 0.1],
    [b.castFront - 0.1, b.top],
    [1.5, b.top],
    [1.1, 0.98],
    [0.72, 1.3],
    [-0.55, 1.3],
    [-1.0, 1.0],
    [-1.6, 0.86],
    [b.castRear, 0.82],
    [b.castRear, 0.12],
    [-1.8, 0.0],
    [1.9, 0.0],
    [b.castFront - 0.2, 0.05],
  ];
  const windows = [
    [[1.75, 0.2], [2.42, 0.2], [2.42, 0.52], [1.75, 0.52]],
    [[-0.55, 0.32], [0.6, 0.32], [0.6, 0.98], [-0.55, 0.98]],
    [[-2.05, 0.28], [-1.05, 0.28], [-1.05, 0.66], [-2.05, 0.66]],
  ];
  const cheek = (y0, y1) => {
    const geometry = prism(cheekProfile.map(([x, z]) => [x, z]), y0, y1, { holes: windows.map((w) => [...w].reverse()), bevel: 0.03, curve: 4 });
    // Prism draws in the part's y,z plane along x; turning it about z puts the profile in x,z and the thickness along y.
    return geometry.applyMatrix4(trs([0, 0, 0], [0, 0, -Math.PI / 2]));
  };
  for (const side of [-1, 1]) {
    const y = side * b.cheekY;
    kit.add("castPaint", cheek(-y - b.cheekThickness / 2, -y + b.cheekThickness / 2));
    kit.add("castPaint", boxAt([0.03, y, 0.66], [0.14, b.cheekThickness + 0.02, 0.66]));
    const mountX = 0.27;
    const armZ = spec.published.towerTopToShaft + mountX * Math.tan(spec.published.shaftTilt * DEG) - g.torqueArmDown;
    const yM = side * g.torqueArmY;
    for (const ds of [-0.68, 0.68]) {
      kit.add("castPaint", boxAt([mountX + ds * 0.72, yM, armZ - 0.34], [0.14, 0.56, 1.02], 0.02));
    }
    kit.add("castPaint", boxAt([mountX, side * ((g.torqueArmY + b.cheekY) / 2 + 0.06), armZ - 0.66], [1.15, g.torqueArmY - b.cheekY + 0.78, 0.2], 0.025));
    kit.add("castPaint", boxAt([mountX, side * (b.cheekY + 0.32), 0.46], [0.84, 0.3, 0.72], 0.03));
    const mountBolts = [];
    for (const dx of [-0.42, -0.14, 0.14, 0.42]) for (const dy of [-0.2, 0.2]) mountBolts.push(aim([mountX + dx, yM + dy, armZ - 0.56], [0, 0, 1], 0.03));
    kit.many("bolt", BOLT, mountBolts);
    const footX = mb.s * Math.cos(5 * DEG);
    kit.add("framePaint", boxAt([footX, side * 1.26, b.top + 0.012], [1.06, 0.62, 0.05], 0.008));
    const lug = prism([[-0.22, 0], [0.22, 0], [0.13, 0.36], [0.06, 0.42], [-0.06, 0.42], [-0.13, 0.36]], -0.05, 0.05, { holes: [{ y: 0, z: 0.28, r: 0.075 }], bevel: 0.008, curve: 10 });
    kit.add("castPaint", lug, trs([1.15, side * (b.cheekY - 0.2), b.top - 0.02]));
  }

  kit.add("castPaint", lathe(chamfer([[0.22, 2.42], [0.22, 1.2], [0.02, 1.2], [0.02, 2.42]], 0.02, { closed: true }), { seg: 96, closed: true }), ALONG_Z);
  kit.add("castPaint", boxAt([0, 0, 0.16], [3.3, b.cheekY * 2 + 0.3, 0.2], 0.02));
  kit.add("castPaint", boxAt([b.castFront - 0.32, 0, 0.42], [0.62, b.cheekY * 2, 0.6], 0.025));
  kit.add("castPaint", boxAt([2.2, 0, b.top - 0.1], [1.38, b.cheekY * 2 - 0.1, 0.2], 0.025));
  kit.add("castPaint", boxAt([b.castRear + 0.14, 0, 0.5], [0.28, b.cheekY * 2, 0.64], 0.02));

  const deckBolts = [];
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * TAU;
    deckBolts.push(aim([2.24 * Math.cos(a), 2.24 * Math.sin(a), 0.22], [0, 0, 1], 0.026));
  }
  kit.many("bolt", BOLT, deckBolts);

  const frameLength = b.castRear - b.rearEnd;
  const frameMid = (b.castRear + b.rearEnd) / 2;
  const topZ = 0.82;
  for (const side of [-1, 1]) {
    const y = side * b.girderY;
    kit.add("framePaint", boxAt([frameMid, y, topZ - b.girderDepth / 2], [frameLength, 0.04, b.girderDepth]));
    kit.add("framePaint", boxAt([frameMid, y, topZ - 0.02], [frameLength, 0.36, 0.04], 0.006));
    kit.add("framePaint", boxAt([frameMid, y, topZ - b.girderDepth + 0.02], [frameLength, 0.36, 0.04], 0.006));
    kit.add("framePaint", boxAt([b.castRear - 0.08, y, topZ - b.girderDepth / 2], [0.16, 0.5, b.girderDepth + 0.1], 0.01));
    const splice = [];
    for (const dy of [-0.18, 0, 0.18]) for (const dz of [-0.24, 0, 0.24]) splice.push(aim([b.castRear - 0.16, y + dy, topZ - b.girderDepth / 2 + dz], [-1, 0, 0], 0.024));
    kit.many("bolt", BOLT, splice);
    const stiffeners = [];
    for (let k = 1; k < 9; k++) stiffeners.push(trs([b.castRear - (frameLength * k) / 9, y + side * 0.09, topZ - b.girderDepth / 2]));
    kit.many("framePaint", box(0.02, 0.15, b.girderDepth - 0.06), stiffeners);
    for (const x of [-5.1, -6.7]) {
      kit.add("framePaint", boxAt([x, side * 0.87, topZ + 0.015], [0.72, 0.48, 0.03], 0.004));
    }
  }
  const crossAt = [-3.3, -4.95, -6.4, -7.85];
  for (const x of crossAt) {
    kit.add("framePaint", boxAt([x, 0, topZ - b.girderDepth / 2], [0.03, b.girderY * 2, b.girderDepth - 0.02]));
    kit.add("framePaint", boxAt([x, 0, topZ - 0.03], [0.26, b.girderY * 2, 0.03]));
    kit.add("framePaint", boxAt([x, 0, topZ - b.girderDepth + 0.02], [0.26, b.girderY * 2, 0.03]));
  }
  kit.add("framePaint", boxAt([b.rearEnd, 0, topZ - b.girderDepth / 2], [0.05, b.girderY * 2 + 0.36, b.girderDepth + 0.02]));

  const conv = spec.assumed.converter;
  const convLength = conv.cabinets * (conv.width + 0.04);
  const floorEdge = conv.rowY + (conv.depth + 0.3) / 2;
  for (const side of [-1, 1]) {
    kit.add("grating", boxAt([conv.x0 - convLength / 2 + conv.width / 2, side * conv.rowY, conv.z - 0.015], [convLength + 0.2, conv.depth + 0.3, 0.03]));
    for (const x of crossAt.slice(1)) kit.add("framePaint", boxAt([x, side * ((b.girderY + floorEdge) / 2), conv.z - 0.08], [0.16, floorEdge - b.girderY, 0.1], 0.006));
  }
  return kit.finish();
}

export function buildYaw(spec, mats) {
  const kit = new Kit(mats);
  const y = spec.assumed.yaw;
  const ringPitch = (y.module * y.ringTeeth) / 2;
  const bottom = -y.height;

  kit.add("bearingPaint", lathe(chamfer([[bottom, y.inner + 0.14], [bottom, ringPitch - 0.06], [-0.1, ringPitch - 0.06], [-0.1, y.inner + 0.14]], 0.012), { seg: 96 }), ALONG_Z);
  kit.add("steel", lathe(chamfer([[-0.09, y.inner], [-0.09, ringPitch - 0.14], [0, ringPitch - 0.14], [0, y.inner]], 0.012), { seg: 96 }), ALONG_Z);
  kit.add("gearSteel", gear({ teeth: y.ringTeeth, module: y.module, width: 0.15, bore: ringPitch - 0.08 }), ALONG_Z.clone().multiply(trs([bottom + 0.075, 0, 0])));
  const inner = [];
  const outer = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * TAU;
    inner.push(aim([(y.inner + 0.1) * Math.cos(a), (y.inner + 0.1) * Math.sin(a), 0], [0, 0, 1], 0.03));
  }
  for (let k = 0; k < 72; k++) {
    const a = ((k + 0.5) / 72) * TAU;
    outer.push(aim([(ringPitch - 0.17) * Math.cos(a), (ringPitch - 0.17) * Math.sin(a), -0.1], [0, 0, 1], 0.03));
  }
  kit.many("bolt", BOLT, inner);
  kit.many("bolt", BOLT, outer);

  const drivePitch = ringPitch + (y.module * y.pinionTeeth) / 2;
  const motor = lathe(chamfer([[0.26, 0.0], [0.26, 0.19], [0.36, 0.19], [0.36, 0.22], [0.5, 0.17], [1.04, 0.17], [1.04, 0.12], [1.12, 0.12], [1.12, 0]], 0.012), { seg: 24, smooth: 0.8 });
  const stage = lathe(chamfer([[-0.1, 0.0], [-0.1, 0.1], [0.04, 0.1], [0.04, 0.24], [0.26, 0.24], [0.26, 0]], 0.012), { seg: 24 });
  const pin = gear({ teeth: y.pinionTeeth, module: y.module, width: 0.16, bore: 0.04 });
  const fin = box(0.46, 0.03, 0.01);
  const flangeBolts = [];
  const fins = [];
  for (let d = 0; d < y.drives; d++) {
    const a = (d / y.drives) * TAU + (22.5 * DEG);
    const x = drivePitch * Math.cos(a);
    const yy = drivePitch * Math.sin(a);
    const frame = trs([x, yy, 0]).multiply(ALONG_Z);
    kit.add("yawPaint", motor.clone(), frame);
    kit.add("castPaint", stage.clone(), frame);
    kit.add("gearSteel", pin.clone(), frame.clone().multiply(trs([bottom + 0.08, 0, 0], [0, 0, 0])));
    kit.add("steel", lathe([[bottom + 0.16, 0], [bottom + 0.16, 0.05], [-0.1, 0.05]], { seg: 12 }), frame);
    for (let k = 0; k < 8; k++) {
      const f = (k / 8) * TAU;
      flangeBolts.push(aim([x + 0.2 * Math.cos(f), yy + 0.2 * Math.sin(f), 0.04], [0, 0, 1], 0.016));
    }
    for (let k = 0; k < 12; k++) {
      const f = (k / 12) * TAU;
      fins.push(frame.clone().multiply(trs([0.76, 0.18 * Math.cos(f), 0.18 * Math.sin(f)], [f, 0, 0])));
    }
    kit.add("darkMetal", boxAt([x + 0.18 * Math.cos(a), yy + 0.18 * Math.sin(a), 0.9], [0.14, 0.14, 0.16], 0.008));
  }
  kit.many("yawPaint", fin, fins);
  kit.many("bolt", BOLT, flangeBolts);
  return kit.finish();
}
