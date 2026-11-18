import { ALONG_Z, BOLT, DEG, Kit, TAU, aim, arc, box, boxAt, chamfer, fromArrays, gear, lathe, pipe, prism, rod, trs } from "../shapes.js";

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
