import { hssOffset } from "../assumed.js";
import { BOLT, DEG, Kit, TAU, aim, boltCircle, box, boxAt, chamfer, gear, inShaftFrame, lathe, pipe, prism, rod, section, trs } from "./shapes.js";

// The casing is cut away on the side the isometric camera looks from: 135 deg about the shaft, between -y and +z.
const WINDOW = { from: 76 * DEG, to: 194 * DEG };
const REST = { from: WINDOW.to, to: WINDOW.from + TAU };

function cutaway(kit, key, profile, { seg = 72, rest = REST, smooth } = {}) {
  kit.add(key, lathe(profile, { seg, from: rest.from, to: rest.to, closed: true, smooth }));
  kit.add("cutFace", section(profile, rest.from, -1));
  kit.add("cutFace", section(profile, rest.to, 1));
}

export function buildBearing(spec, mats) {
  const kit = new Kit(mats, inShaftFrame(spec));
  const { mainBearing: b } = spec.assumed;
  const front = b.s + b.width / 2;
  const rear = b.s - b.width / 2;
  kit.add("castPaint", lathe(chamfer([[rear, b.bore + 0.05], [rear, b.outer - 0.08], [rear + 0.1, b.outer], [front - 0.1, b.outer], [front, b.outer - 0.08], [front, b.bore + 0.05]], 0.012), { seg: 96 }));
  const outline = [
    [-b.footHalfSpan, -b.foot],
    [b.footHalfSpan, -b.foot],
    [b.footHalfSpan, -b.foot + 0.16],
    [0.98, -b.foot + 0.2],
    [b.outer - 0.02, -0.34],
    [b.outer - 0.02, 0],
    [-b.outer + 0.02, 0],
    [-b.outer + 0.02, -0.34],
    [-0.98, -b.foot + 0.2],
    [-b.footHalfSpan, -b.foot + 0.16],
  ];
  kit.add("castPaint", prism(outline, rear + 0.05, front - 0.05, { holes: [[[0.86, -0.02], [-0.86, -0.02], [-0.76, -0.56], [0, -0.92], [0.76, -0.56]]], bevel: 0.02 }));
  kit.add("castPaint", box(0.86, b.footHalfSpan * 2 - 0.1, 0.1, 0.012), trs([b.s, 0, -b.foot + 0.05]));
  for (const side of [-1, 1]) {
    kit.add("castPaint", boxAt([b.s, side * 1.24, -b.foot + 0.25], [0.1, 0.42, 0.34], 0.01));
    kit.add("seam", boxAt([b.s, side * (b.outer + 0.012), 0.0], [b.width + 0.02, 0.05, 0.012]));
  }
  kit.add("rubber", lathe([[front, b.bore + 0.06], [front + 0.03, b.bore + 0.03], [front + 0.03, b.bore - 0.02]], { seg: 72 }));
  kit.add("rubber", lathe([[rear - 0.03, b.bore - 0.02], [rear - 0.03, b.bore + 0.03], [rear, b.bore + 0.06]], { seg: 72 }));
  kit.add("steel", lathe(chamfer([[front - 0.02, b.bore + 0.06], [front - 0.02, b.outer - 0.2], [front + 0.06, b.outer - 0.2], [front + 0.06, b.bore + 0.06]], 0.01), { seg: 72 }));
  kit.many("bolt", BOLT, boltCircle(24, b.outer - 0.27, front + 0.06, 1, 0.022));

  const feet = [];
  for (const y of [-1.37, -1.14, 1.14, 1.37]) for (const ds of [-0.3, 0, 0.3]) feet.push(aim([b.s + ds, y, -b.foot + 0.16], [0, 0, 1], 0.045));
  for (const y of [-1, 1]) for (const ds of [-0.32, 0.32]) feet.push(aim([b.s + ds, y * (b.outer + 0.0), 0.0], [0, 0, 1], 0.05));
  kit.many("bolt", BOLT, feet);

  kit.add("brass", rod([b.s + 0.2, 0, b.outer - 0.02], [b.s + 0.2, 0, b.outer + 0.1], 0.018, 8));
  kit.add("brass", rod([b.s - 0.2, 0, b.outer - 0.02], [b.s - 0.2, 0, b.outer + 0.1], 0.018, 8));
  kit.add("rubber", pipe([[b.s + 0.2, 0, b.outer + 0.1], [b.s + 0.25, -0.2, b.outer + 0.14], [b.s + 0.3, -0.75, b.outer - 0.06]], 0.012));
  return kit.finish();
}

function planetaryStage(kit, stage, { radius, carrier, bore }) {
  // One planet clear on each side of the window's centre, so the sun shows between them.
  const planetsAt = Array.from({ length: stage.planets }, (_, k) => (75 * DEG) + (k * TAU) / stage.planets);
  const m = stage.module;
  const pitch = (z) => (m * z) / 2;
  const centre = m * (stage.sun + stage.planet) / 2;
  const planetWidth = stage.width - 0.08;

  const sunStep = TAU / stage.sun;
  const planetStep = TAU / stage.planet;
  const ringStep = TAU / stage.ring;
  kit.add("gearSteel", gear({ teeth: stage.sun, module: m, width: planetWidth, bore: bore.sun }), trs([stage.s, 0, 0]));

  planetsAt.forEach((angle) => {
    // Puts a planet tooth gap where the sun presents a tooth along the line of centres.
    const nearest = Math.round(angle / sunStep) * sunStep;
    const offset = ((angle - nearest) * stage.sun) / stage.planet;
    const phase = angle + Math.PI + offset - planetStep / 2;
    const planet = gear({ teeth: stage.planet, module: m, width: planetWidth, bore: bore.planet, phase });
    const px = centre * Math.cos(angle);
    const py = centre * Math.sin(angle);
    kit.add("gearSteel", planet, trs([stage.s, px, py]));
    kit.add("steel", lathe(chamfer([[-planetWidth / 2 - carrier.gap, 0], [-planetWidth / 2 - carrier.gap, bore.planet], [planetWidth / 2 + carrier.gap, bore.planet], [planetWidth / 2 + carrier.gap, 0]], 0.008), { seg: 24 }), trs([stage.s, px, py]));
    kit.add("bearingPaint", lathe([[-planetWidth / 2 - 0.002, bore.planet], [-planetWidth / 2 - 0.002, bore.planet + 0.02], [planetWidth / 2 + 0.002, bore.planet + 0.02], [planetWidth / 2 + 0.002, bore.planet]], { seg: 24 }), trs([stage.s, px, py]));
  });

  const planet0 = planetsAt[0];
  const sunNearest = Math.round(planet0 / sunStep) * sunStep;
  const planetOffset = ((planet0 - sunNearest) * stage.sun) / stage.planet;
  const ringPhase = planet0 + (planetOffset * stage.planet) / stage.ring - ringStep / 2;
  const rim = radius.rim;
  kit.add("gearSteel", gear({ teeth: stage.ring, module: m, width: stage.width, internal: true, rim, from: REST.from, to: REST.to, phase: ringPhase }), trs([stage.s, 0, 0]));
  const ringRoot = pitch(stage.ring) + 1.25 * m;
  const backing = [[stage.s - stage.width / 2, ringRoot - 0.002], [stage.s - stage.width / 2, rim], [stage.s + stage.width / 2, rim], [stage.s + stage.width / 2, ringRoot - 0.002]];
  kit.add("cutFace", section(backing, REST.from, -1));
  kit.add("cutFace", section(backing, REST.to, 1));

  const plateRadius = carrier.radius;
  const back = stage.s - stage.width / 2 - carrier.gap;
  const front = stage.s + stage.width / 2 + carrier.gap;
  kit.add("carrier", lathe(chamfer([[back - carrier.plate, 0], [back - carrier.plate, plateRadius], [back, plateRadius], [back, carrier.hub]], 0.012), { seg: 72 }));
  const frontPlate = chamfer([[front, carrier.hub], [front, plateRadius], [front + carrier.plate, plateRadius], [front + carrier.plate, carrier.hub]], 0.012);
  kit.add("carrier", lathe(frontPlate, { seg: 56, from: REST.from, to: REST.to, closed: true }));
  kit.add("cutFace", section(frontPlate, REST.from, -1));
  kit.add("cutFace", section(frontPlate, REST.to, 1));
  kit.add("carrier", lathe(chamfer([[front - 0.002, carrier.hub], [front + carrier.plate + carrier.nose, carrier.hub], [front + carrier.plate + carrier.nose, 0.03]], 0.012), { seg: 40 }));
}

export function buildGearbox(spec, mats) {
  const kit = new Kit(mats, inShaftFrame(spec));
  const { gearbox: g, stages } = spec.assumed;
  const [one, two, three] = stages;
  const offset = hssOffset();

  const stage1Profile = chamfer(
    [
      [-0.42, 0.86],
      [-0.42, g.stage2Radius + 0.06],
      [-0.32, g.stage2Radius + 0.12],
      [-0.32, g.stage1Radius - 0.06],
      [-0.24, g.stage1Radius],
      [g.front - 0.24, g.stage1Radius],
      [g.front - 0.1, 1.12],
      [g.front, 0.98],
      [g.front, 0.72],
      [g.front - 0.09, 0.72],
      [g.front - 0.13, 1.02],
      [g.front - 0.24, 1.28],
      [-0.22, 1.28],
      [-0.26, 0.86],
    ],
    0.018,
    { closed: true },
  );
  cutaway(kit, "housing", stage1Profile, { seg: 96 });

  const stage2Profile = chamfer(
    [
      [-1.34, 0.56],
      [-1.34, g.stage2Radius - 0.05],
      [-1.26, g.stage2Radius],
      [-0.42, g.stage2Radius],
      [-0.42, 0.86],
      [-0.48, 0.86],
      [-0.48, 0.95],
      [-1.26, 0.95],
      [-1.26, 0.56],
    ],
    0.014,
    { closed: true },
  );
  cutaway(kit, "housing", stage2Profile, { seg: 72 });

  const rearLip = chamfer(
    [
      [g.rear + 0.04, g.stage3Radius - 0.08],
      [g.rear + 0.04, g.stage3Radius],
      [-1.34, g.stage3Radius],
      [-1.34, g.stage3Radius - 0.08],
    ],
    0.01,
    { closed: true },
  );
  cutaway(kit, "housing", rearLip, { seg: 56 });

  const R = g.stage3Radius;
  const r = 0.34;
  const outline = [];
  for (let k = 0; k <= 40; k++) {
    const a = 1.3 * Math.PI + ((1.4 * Math.PI) / 40) * k;
    outline.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  for (let k = 0; k <= 24; k++) {
    const a = 0.08 * Math.PI + ((0.84 * Math.PI) / 24) * k;
    outline.push([r * Math.cos(a), offset + r * Math.sin(a)]);
  }
  kit.add("housing", prism(outline, g.rear - 0.02, g.rear + 0.1, { bevel: 0.012, holes: [{ y: 0, z: offset, r: 0.13 }] }));
  kit.add("steel", lathe(chamfer([[-0.14, 0.12], [-0.14, 0.26], [0.06, 0.26], [0.06, 0.11]], 0.008), { seg: 32 }), trs([g.rear - 0.02, 0, offset]));
  kit.many("bolt", BOLT, boltCircle(10, 0.2, -0.14, -1, 0.016).map((matrix) => trs([g.rear - 0.02, 0, offset]).multiply(matrix)));
  kit.add("steel", lathe(chamfer([[-0.1, 0.02], [-0.1, 0.32], [0.02, 0.32], [0.02, 0.02]], 0.008), { seg: 40 }), trs([g.rear - 0.02, 0, 0]));
  kit.many("bolt", BOLT, boltCircle(12, 0.25, -0.1, -1, 0.016).map((matrix) => trs([g.rear - 0.02, 0, 0]).multiply(matrix)));

  planetaryStage(kit, one, {
    radius: { rim: 1.27 },
    bore: { sun: 0.12, planet: 0.11 },
    carrier: { radius: 0.98, plate: 0.09, gap: 0.03, hub: 0.28, nose: 0.1 },
  });
  planetaryStage(kit, two, {
    radius: { rim: 0.93 },
    bore: { sun: 0.09, planet: 0.075 },
    carrier: { radius: 0.66, plate: 0.06, gap: 0.02, hub: 0.17, nose: 0.1 },
  });

  const sun1Shaft = [one.s - 0.3, 0.095];
  kit.add("steel", lathe(chamfer([[two.s + two.width / 2, 0], [two.s + two.width / 2, sun1Shaft[1]], [one.s + 0.34, sun1Shaft[1]], [one.s + 0.34, 0]], 0.01), { seg: 24 }));
  kit.add("steel", lathe(chamfer([[three.s - 0.36, 0], [three.s - 0.36, 0.07], [two.s + two.width / 2 - 0.04, 0.07], [two.s + two.width / 2 - 0.04, 0]], 0.01), { seg: 20 }));

  kit.add("gearSteel", gear({ teeth: three.wheel, module: three.module, width: three.width, helix: three.helix * DEG, bore: 0.09, slices: 4 }), trs([three.s, 0, 0]));
  const pinionPhase = Math.PI / 2 + Math.PI - (TAU / three.pinion) / 2;
  kit.add("gearSteel", gear({ teeth: three.pinion, module: three.module, width: three.width + 0.05, helix: -three.helix * DEG, bore: 0.05, slices: 4, phase: pinionPhase }), trs([three.s, 0, offset]));
  kit.add("steel", lathe(chamfer([[g.rear - 0.3, 0], [g.rear - 0.3, 0.085], [three.s + 0.3, 0.085], [three.s + 0.3, 0]], 0.008), { seg: 20 }), trs([0, 0, offset]));
  kit.add("bearingPaint", lathe(chamfer([[-0.05, 0.085], [-0.05, 0.15], [0.05, 0.15], [0.05, 0.085]], 0.006), { seg: 24 }), trs([three.s + 0.32, 0, offset]));
  kit.add("bearingPaint", lathe(chamfer([[-0.05, 0.08], [-0.05, 0.14], [0.05, 0.14], [0.05, 0.08]], 0.006), { seg: 24 }), trs([g.rear + 0.15, 0, offset]));

  const ribFrames = [];
  for (let k = 0; k <= 18; k++) {
    const a = REST.from + 0.07 + ((REST.to - REST.from - 0.14) * k) / 18;
    ribFrames.push(trs([(g.front - 0.24 - 0.24) / 2, (g.stage1Radius + 0.05) * Math.cos(a), (g.stage1Radius + 0.05) * Math.sin(a)], [a, 0, 0]));
  }
  kit.many("housing", box(g.front - 0.5, 0.12, 0.05, 0.008), ribFrames);
  const rib2 = [];
  for (let k = 0; k <= 16; k++) {
    const a = REST.from + 0.08 + ((REST.to - REST.from - 0.16) * k) / 16;
    rib2.push(trs([-0.84, (g.stage2Radius + 0.04) * Math.cos(a), (g.stage2Radius + 0.04) * Math.sin(a)], [a, 0, 0]));
  }
  kit.many("housing", box(0.78, 0.09, 0.04, 0.006), rib2);
  kit.many("bolt", BOLT, boltCircle(30, g.stage2Radius + 0.21, -0.32, -1, 0.024, { from: REST.from + 0.03, to: REST.to - 0.03, closed: false }));
  kit.many("bolt", BOLT, boltCircle(26, 0.86, g.front, 1, 0.022, { from: REST.from + 0.03, to: REST.to - 0.03, closed: false }));

  const armThickness = [-0.08, 0.62];
  const arm = [
    [1.3, -0.56],
    [1.95, -0.02],
    [2.32, 0.0],
    [g.torqueArmY + 0.37, -g.torqueArmDown],
    [2.32, -0.68],
    [1.6, -0.88],
    [1.02, -1.08],
    [0.86, -0.86],
  ];
  const mirror = (points) => points.map(([y, z]) => [-y, z]).reverse();
  const eye = { y: g.torqueArmY, z: -g.torqueArmDown, r: 0.26 };
  kit.add("housing", prism(arm, armThickness[0], armThickness[1], { bevel: 0.022, holes: [eye] }));
  kit.add("housing", prism(mirror(arm), armThickness[0], armThickness[1], { bevel: 0.022, holes: [{ ...eye, y: -eye.y }] }));
  for (const side of [-1, 1]) {
    kit.add("rubber", rod([armThickness[0] - 0.05, side * g.torqueArmY, -g.torqueArmDown], [armThickness[1] + 0.05, side * g.torqueArmY, -g.torqueArmDown], 0.26, 28));
    kit.add("steel", rod([armThickness[0] - 0.12, side * g.torqueArmY, -g.torqueArmDown], [armThickness[1] + 0.12, side * g.torqueArmY, -g.torqueArmDown], 0.1, 20));
    kit.add("steel", lathe(chamfer([[armThickness[1] + 0.05, 0.1], [armThickness[1] + 0.05, 0.2], [armThickness[1] + 0.09, 0.2], [armThickness[1] + 0.09, 0.1]], 0.006), { seg: 24 }), trs([0, side * g.torqueArmY, -g.torqueArmDown]));
  }

  const line = (radius, s0, s1, a0, a1) => pipe(Array.from({ length: 26 }, (_, k) => {
    const t = k / 25;
    const a = a0 + (a1 - a0) * t;
    const s = s0 + (s1 - s0) * t;
    return [s, radius * Math.cos(a), radius * Math.sin(a)];
  }), 0.024, { seg: 6 });
  const around = (radius, a) => [radius * Math.cos(a), radius * Math.sin(a)];
  kit.add("steel", line(g.stage1Radius + 0.14, 0.52, 0.52, 200 * DEG, 268 * DEG));
  kit.add("steel", line(g.stage1Radius + 0.14, 0.08, 0.08, 200 * DEG, 268 * DEG));
  kit.add("steel", line(g.stage1Radius + 0.14, 0.52, 0.52, 42 * DEG, 72 * DEG));
  kit.add("steel", pipe([[0.52, ...around(g.stage1Radius + 0.14, 72 * DEG)], [-0.9, ...around(g.stage2Radius + 0.22, 70 * DEG)], [-2.1, ...around(0.88, 68 * DEG)], [-2.42, ...around(0.5, 68 * DEG)]], 0.024));
  kit.add("housing", rod([-2.0, 0.94, 0.28], [-1.46, 0.94, 0.28], 0.14, 20));
  kit.add("steel", rod([-2.05, 0.94, 0.28], [-1.99, 0.94, 0.28], 0.15, 20));

  return kit.finish();
}

export function buildBrake(spec, mats) {
  const kit = new Kit(mats, inShaftFrame(spec));
  const { brake, couplingS } = spec.assumed;
  const offset = hssOffset();
  const axis = trs([0, 0, offset]);

  kit.add("steel", lathe(chamfer([[couplingS[0] + 0.02, 0], [couplingS[0] + 0.02, 0.09], [-2.82, 0.09], [-2.82, 0]], 0.008), { seg: 20 }), axis);

  const half = brake.discThickness / 2;
  kit.add("brakeDisc", lathe(chamfer([[brake.s - half, 0.11], [brake.s - half, brake.discRadius], [brake.s + half, brake.discRadius], [brake.s + half, 0.11]], 0.004), { seg: 96 }), axis);
  kit.add("steel", lathe(chamfer([[brake.s - 0.08, 0.09], [brake.s - 0.08, 0.17], [brake.s + 0.08, 0.17], [brake.s + 0.08, 0.09]], 0.008), { seg: 32 }), axis);
  const drillings = [];
  for (const [radius, count, phase] of [[0.24, 18, 0], [0.31, 22, 0.08], [0.38, 26, 0.03]]) {
    for (let k = 0; k < count; k++) {
      const a = phase + (k / count) * TAU;
      drillings.push(axis.clone().multiply(aim([brake.s + half, radius * Math.cos(a), radius * Math.sin(a)], [1, 0, 0])));
    }
  }
  kit.many("darkMetal", rod([0, 0, -0.001], [0, 0, 0.0015], 0.009, 8), drillings);
  kit.many("bolt", BOLT, boltCircle(8, 0.14, brake.s + 0.08, 1, 0.014).map((matrix) => axis.clone().multiply(matrix)));

  const y = -0.08;
  const z = offset + brake.discRadius - 0.1;
  kit.add("caliper", boxAt([brake.s, y, z + 0.1], [0.3, 0.42, 0.26], 0.018));
  kit.add("caliper", boxAt([brake.s + 0.1, y, z], [0.09, 0.38, 0.34], 0.012));
  kit.add("caliper", boxAt([brake.s - 0.1, y, z], [0.09, 0.38, 0.34], 0.012));
  for (const dy of [-0.09, 0.09]) {
    kit.add("steel", rod([brake.s + 0.15, y + dy, z - 0.02], [brake.s + 0.23, y + dy, z - 0.02], 0.065, 14));
    kit.add("steel", rod([brake.s - 0.23, y + dy, z - 0.02], [brake.s - 0.15, y + dy, z - 0.02], 0.065, 14));
  }
  const capPositions = [];
  for (const dy of [-0.14, 0.14]) for (const ds of [-0.1, 0.1]) capPositions.push(aim([brake.s + ds, y + dy, z + 0.23], [0, 0, 1], 0.018));
  kit.many("bolt", BOLT, capPositions);
  kit.add("rubber", pipe([[brake.s + 0.15, y - 0.2, z + 0.14], [brake.s + 0.34, y - 0.34, z + 0.26], [brake.s + 0.62, y - 0.36, z + 0.1]], 0.014));
  kit.add("rubber", pipe([[brake.s - 0.15, y - 0.2, z + 0.14], [brake.s - 0.3, y - 0.3, z + 0.3], [brake.s - 0.5, y - 0.34, z + 0.2]], 0.014));
  kit.add("castPaint", boxAt([brake.s + 0.26, y, z - 0.18], [0.14, 0.52, 0.42], 0.012, [0, 0, 0]));
  kit.add("castPaint", boxAt([brake.s + 0.42, y - 0.12, z - 0.32], [0.3, 0.3, 0.08], 0.01));

  // Flexible coupling: disc packs at each end of a composite spacer that isolates the generator electrically.
  const [c0, c1] = couplingS;
  for (const s of [c0, c1 + 0.08]) {
    kit.add("steel", lathe(chamfer([[s - 0.06, 0.04], [s - 0.06, 0.25], [s, 0.25], [s, 0.04]], 0.006), { seg: 36 }), axis);
    kit.add("darkMetal", lathe([[s - 0.088, 0.04], [s - 0.088, 0.24], [s - 0.06, 0.24], [s - 0.06, 0.04]], { seg: 36 }), axis);
    kit.add("steel", lathe(chamfer([[s - 0.145, 0.04], [s - 0.145, 0.25], [s - 0.088, 0.25], [s - 0.088, 0.04]], 0.006), { seg: 36 }), axis);
    kit.many("bolt", BOLT, boltCircle(6, 0.195, s, 1, 0.02).map((matrix) => axis.clone().multiply(matrix)));
  }
  kit.add("composite", lathe(chamfer([[c1 + 0.08, 0.04], [c1 + 0.08, 0.13], [c0 - 0.145, 0.13], [c0 - 0.145, 0.04]], 0.01), { seg: 32 }), axis);
  return kit.finish();
}

export function buildGenerator(spec, mats) {
  const kit = new Kit(mats, inShaftFrame(spec));
  const { generator: g } = spec.assumed;
  const offset = hssOffset();
  const axis = trs([0, 0, offset]);
  const window = { from: 100 * DEG, to: 170 * DEG };
  const rest = { from: window.to, to: window.from + TAU };

  const frame = chamfer(
    [
      [g.rear + 0.14, 0.62],
      [g.rear + 0.14, g.radius],
      [g.front - 0.14, g.radius],
      [g.front - 0.14, 0.62],
    ],
    0.008,
    { closed: true },
  );
  kit.add("genPaint", lathe(frame, { seg: 96, from: rest.from, to: rest.to, closed: true }), axis);
  kit.add("cutFace", section(frame, rest.from, -1), axis);
  kit.add("cutFace", section(frame, rest.to, 1), axis);

  const fins = [];
  for (let k = 0; k < g.fins; k++) {
    const a = rest.from + 0.05 + ((rest.to - rest.from - 0.1) * k) / (g.fins - 1);
    const mid = (g.radius + g.finRadius) / 2;
    fins.push(axis.clone().multiply(trs([(g.front + g.rear) / 2, mid * Math.cos(a), mid * Math.sin(a)], [a, 0, 0])));
  }
  kit.many("genPaint", box(g.front - g.rear - 0.34, g.finRadius - g.radius, 0.014), fins);

  for (const s of [g.front, g.rear]) {
    const dir = s === g.front ? 1 : -1;
    const shield = dir > 0
      ? [[s - 0.14, g.radius + 0.04], [s - 0.03, g.radius - 0.02], [s, 0.5], [s + 0.03, 0.26], [s + 0.03, 0.0]]
      : [[s + 0.14, g.radius + 0.04], [s + 0.03, g.radius - 0.02], [s, 0.5], [s - 0.03, 0.26], [s - 0.03, 0.0]].reverse();
    kit.add("genPaint", lathe(shield, { seg: 72, smooth: 0.7 }), axis);
    kit.many("bolt", BOLT, boltCircle(22, g.radius - 0.07, s - dir * 0.04, dir, 0.022).map((matrix) => axis.clone().multiply(matrix)));
  }
  kit.add("steel", lathe(chamfer([[g.front + 0.02, 0], [g.front + 0.02, 0.1], [g.front + 0.15, 0.1], [g.front + 0.15, 0]], 0.006), { seg: 20 }), axis);

  const coreFrom = g.rear + 0.32;
  const coreTo = g.front - 0.32;
  kit.add("steel", lathe(chamfer([[g.front - 0.16, 0.03], [g.front - 0.16, 0.08], [g.rear + 0.16, 0.08], [g.rear + 0.16, 0.03]].reverse(), 0.006), { seg: 24 }), axis);
  const rotorFrom = g.rear + 0.38;
  const rotorTo = g.front - 0.38;
  kit.add("electricalSteel", lathe(chamfer([[rotorFrom, 0.08], [rotorFrom, 0.44], [rotorTo, 0.44], [rotorTo, 0.08]], 0.01), { seg: 56 }), axis);
  const bars = [];
  const slotCount = 22;
  for (let k = 0; k < slotCount; k++) {
    const a = window.from - 0.01 + ((window.to - window.from + 0.02) * k) / (slotCount - 1);
    bars.push(axis.clone().multiply(trs([0, 0.5 * Math.cos(a), 0.5 * Math.sin(a)], [a, 0, 0])));
  }
  kit.many("copper", rod([coreFrom - 0.1, 0, 0], [coreTo + 0.1, 0, 0], 0.016, 6), bars);
  const overhang = [];
  for (let k = 0; k < 40; k++) {
    const a = window.from - 0.02 + ((window.to - window.from + 0.04) * k) / 39;
    for (const [s, r] of [[coreFrom - 0.12, 0.52], [coreTo + 0.12, 0.52]]) {
      overhang.push(axis.clone().multiply(trs([s, r * Math.cos(a), r * Math.sin(a)], [a, 0, 0])));
    }
  }
  kit.many("copper", box(0.1, 0.1, 0.016, 0.004), overhang);
  const ringBars = [];
  for (let k = 0; k < 16; k++) {
    const a = window.from - 0.01 + ((window.to - window.from + 0.02) * k) / 15;
    ringBars.push(axis.clone().multiply(trs([rotorTo + 0.04, 0.38 * Math.cos(a), 0.38 * Math.sin(a)], [a, 0, 0])));
    ringBars.push(axis.clone().multiply(trs([rotorFrom - 0.04, 0.38 * Math.cos(a), 0.38 * Math.sin(a)], [a, 0, 0])));
  }
  kit.many("copper", box(0.06, 0.1, 0.018, 0.004), ringBars);

  const footDrop = 0.72;
  for (const side of [-1, 1]) {
    for (const s of [g.front - 0.42, g.rear + 0.42]) {
      kit.add("genPaint", boxAt([s, side * 0.72, -footDrop + 0.14 + offset], [0.52, 0.34, 0.28], 0.015));
      kit.add("genPaint", boxAt([s, side * 0.86, -footDrop + 0.02 + offset], [0.62, 0.46, 0.06], 0.008));
      kit.add("rubber", rod([s, side * 0.9, -footDrop - 0.09 + offset], [s, side * 0.9, -footDrop - 0.01 + offset], 0.15, 16));
      const heads = [];
      for (const ds of [-0.22, 0.22]) heads.push(aim([s + ds, side * 0.86, -footDrop + 0.05 + offset], [0, 0, 1], 0.024));
      kit.many("bolt", BOLT, heads);
    }
  }

  const tb = { s: (g.front + g.rear) / 2 + 0.3, a: 188 * DEG };
  const tbR = g.finRadius + 0.2;
  const tbCentre = [tb.s, tbR * Math.cos(tb.a), tbR * Math.sin(tb.a) + offset];
  kit.add("genPaint", boxAt(tbCentre, [0.82, 0.44, 0.6], 0.02));
  kit.add("genPaint", boxAt([tb.s, tbCentre[1] - 0.235, tbCentre[2]], [0.72, 0.03, 0.5], 0.008));
  const lidBolts = [];
  for (const ds of [-0.32, 0.32]) for (const dz of [-0.2, 0.2]) lidBolts.push(aim([tb.s + ds, tbCentre[1] - 0.25, tbCentre[2] + dz], [0, -1, 0], 0.016));
  kit.many("bolt", BOLT, lidBolts);
  for (const ds of [-0.26, -0.09, 0.09, 0.26]) {
    kit.add("brass", rod([tb.s + ds, tbCentre[1], tbCentre[2] - 0.3], [tb.s + ds, tbCentre[1], tbCentre[2] - 0.4], 0.04, 10));
  }

  kit.add("genPaint", lathe(chamfer([[g.sliprearS, 0], [g.sliprearS, 0.42], [g.rear - 0.03, 0.42], [g.rear - 0.03, 0.2]], 0.012), { seg: 48 }), axis);
  kit.add("darkMetal", boxAt([g.sliprearS + 0.2, -0.36, offset + 0.22], [0.2, 0.08, 0.12], 0.006));
  const vent = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU;
    vent.push(axis.clone().multiply(trs([g.sliprearS + 0.3, 0.425 * Math.cos(a), 0.425 * Math.sin(a)], [a, 0, 0])));
  }
  kit.many("darkMetal", box(0.2, 0.012, 0.05), vent);
  return kit.finish();
}
