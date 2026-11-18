import * as THREE from "three";
import { ALONG_Z, DEG, Kit, TAU, arc, boxAt, chamfer, lathe, loftRings, pipe, prism, rod, sphere, trs } from "./shapes.js";
import { hullHalfWidthAt, hullSection, superellipse } from "../assumed.js";

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
function addPanes(kit, r, { rake }, light = false) {
  const { panes } = r;
  const planeX = (z) => r.frontTop - r.recess + (r.top - z) / Math.tan(rake);
  const middle = (panes.bottom + panes.top) / 2;
  const slopeLength = (panes.top - panes.bottom) / Math.sin(rake);
  const onPlane = trs([planeX(middle), 0, middle], [0, rake - Math.PI / 2, 0]);
  const paneWidth = (panes.halfWidth * 2 - panes.mullion * (panes.count - 1)) / panes.count;
  const steps = light ? 1 : 4;
  const holes = sampled(panes.count, (u) => roundedRect(-panes.halfWidth + paneWidth / 2 + u * panes.count * (paneWidth + panes.mullion), 0, paneWidth, slopeLength, panes.radius, steps).reverse());
  const size = [panes.halfWidth * 2 + 0.2, slopeLength + 0.2];
  const glass = prism(roundedRect(0, 0, size[0] - 0.08, size[1] - 0.08, panes.radius, steps), -0.06, 0.02);
  const { position, normal } = glass.attributes;
  for (let i = 0; i < normal.count; i++) {
    if (normal.getX(i) < 0.5) continue;
    const length = Math.hypot(1, position.getY(i) * panes.bow[0], position.getZ(i) * panes.bow[1]);
    normal.setXYZ(i, 1 / length, (position.getY(i) * panes.bow[0]) / length, (position.getZ(i) * panes.bow[1]) / length);
  }
  kit.add("glass", glass, onPlane);
  kit.add("paint", prism(roundedRect(0, 0, size[0], size[1], panes.radius + 0.08, steps), -0.06, 0.07, { holes, bevel: light ? 0 : 0.015, curve: 4 }), onPlane);
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

// The cover as one closed skin with its panes, for the turbines standing behind. Returns geometry by finish.
// `light` is for a farm seen only at the hero's distance, where a metre is a few pixels: fewer sections, fewer points round each, and square-cut panes.
export function simpleNacelle(spec, { light = false } = {}) {
  const { nacelle: n, raised: r } = spec.assumed;
  const { stern, shoulder } = n;
  const shaftZ = spec.published.towerTopToShaft + n.front * Math.tan(spec.published.shaftTilt * DEG);
  const thin = (list, step) => list.filter((_, k) => k % step === 0 || k === list.length - 1);
  const [along, around, raisedAlong, raisedAround] = light ? [2, 5, 6, 3] : [1, 3, 3, 2];
  const stations = thin(
    [
      ...sampled(18, (u) => stern.from - (stern.from - n.rear) * domeT(1 - u, stern.power)),
      ...sampled(8, (u) => lerp(stern.from, shoulder.from, u)),
      ...sampled(12, (u) => shoulder.from + (n.front - shoulder.from) * domeT(u, shoulder.power)),
      n.front,
    ],
    along,
  );
  const rings = stations.map((x) => hullRing(x, hullSection(x)));
  const nose = hullSection(n.front);
  rings.push(hullRing(n.front, { halfWidth: nose.halfWidth * 0.1, top: shaftZ + (nose.top - shaftZ) * 0.1, bottom: shaftZ + (nose.bottom - shaftZ) * 0.1, cornerTop: nose.cornerTop * 0.1, cornerBottom: nose.cornerBottom * 0.1 }));
  const outline = raisedOutline(r);
  const solid = { paint: [loftRings(rings.map((ring) => thin(ring, around)), { closedRing: true, flip: true }), loftRings(thin(outline.stations, raisedAlong).map((x) => thin(raisedRing(x, r, outline), raisedAround)), { flip: true })], glass: [] };
  addPanes({ add: (key, geometry, matrix) => solid[key].push(geometry.applyMatrix4(matrix)) }, r, outline, light);
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
