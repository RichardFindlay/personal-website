// Everything the OpenFAST deck does not define. The deck is an aero-elastic model: it has no nacelle
// envelope, bearing, gearbox stage, brake, generator or converter geometry. These values are sized from
// typical 5 MW-class practice and none of them is a published value of this turbine.
// Positions named `s` run along the shaft axis in metres, 0 where it crosses the yaw axis, positive upwind.
export const ASSUMED = {
  // Cut-in rotor speed as remembered from NREL TP-500-38060; the report was unreachable and the deck holds only the 12.1 rpm rated value.
  spinRpm: 6.9,
  // The deck ends the blade on a 1.419 m chord, and no real blade stops on a square cut, so this last length is rounded off inside the 63 m radius (m).
  bladeTipRounding: 1.05,
  // Lightning receptors at these spans, typical of a multi-receptor down-conductor layout (m).
  receptorSpans: [55.5, 58.2, 60.6],
  // Protective leading-edge tape from this span outwards, where tip speed erodes coatings (m).
  leadingEdgeStripFrom: 41,

  // A sphere cut by three blade faces at the published hub radius; this radius gives a face circle just wider than the 3.542 m root (m).
  hub: { radius: 2.35, rearFace: 1.27, frontFace: 1.55, openingRadius: 1.42 },
  // Double-row slew bearing wide enough to carry the 3.542 m root bolt circle (m).
  pitchBearing: { inner: 1.42, outer: 1.86, height: 0.24 },
  // Pitch drives per blade: one motor is the common electric-pitch arrangement (m).
  pitchDrive: { motorRadius: 0.19, offset: 1.26 },
  // GRP nose cone enclosing the hub and clearing the blade roots (m).
  spinner: { rear: 3.05, radius: 2.85, noseFromApex: 3.45, hole: 1.96 },

  // Three-point mount: one main bearing plus the two gearbox torque-arm mounts, the common choice for this size.
  mainShaft: { flangeS: 3.75, flangeRadius: 1.05, neckRadius: 0.72, lockDiscS: 3.28, lockDiscRadius: 1.3, seatS: [1.95, 2.85], seatRadius: 0.62, endS: 0.55, endRadius: 0.56, shrinkDisc: { s: 0.82, radius: 0.88 } },
  mainBearing: { s: 2.4, width: 0.86, bore: 0.64, outer: 1.04, foot: 1.47, footHalfSpan: 1.52 },

  // Two planetary stages plus one parallel helical stage, the usual layout for this ratio. Each stage has a fixed ring, driven carrier and sun output; tooth counts are coprime so the same teeth rarely meet, and the ratios multiply to the deck's 97.
  stages: [
    { kind: "planetary", sun: 25, planet: 47, ring: 119, planets: 3, module: 0.018, width: 0.72, s: 0.33 },
    { kind: "planetary", sun: 32, planet: 43, ring: 118, planets: 3, module: 0.012, width: 0.5, s: -0.82 },
    { kind: "helical", pinion: 27, wheel: 97, module: 0.01, width: 0.42, helix: 12, s: -1.92 },
  ],
  gearbox: { front: 0.95, rear: -2.5, stage1Radius: 1.42, stage2Radius: 1.04, stage3Radius: 0.72, torqueArmY: 2.08, torqueArmDown: 0.34 },
  // Disc brake on the high-speed shaft, cheap because the torque there is 97 times lower (m).
  brake: { s: -3.28, discRadius: 0.44, discThickness: 0.05 },
  couplingS: [-3.5, -4.42],
  // Four-pole doubly fed machine: 97 x 12.1 = 1173.7 rpm sits below the 1500 rpm synchronous speed at 50 Hz.
  generator: { poles: 4, front: -4.55, rear: -7.0, radius: 0.74, finRadius: 0.87, fins: 64, sliprearS: -7.55 },
  // Partial-rating converter for a DFIG, in floor-standing cabinets at the rear of the nacelle (m).
  converter: { cabinets: 4, width: 0.82, depth: 0.82, height: 2.1, x0: -8.25, rowY: 1.32, z: 0.82 },

  // Envelope sized to clear the drivetrain above and the spinner in front (m).
  nacelle: { front: 2.95, rear: -12.6, halfWidth: 2.72, roof: 4.05, skirt: -0.42 },
  // Cast front saddle bolted to a welded rear frame, the usual split for a three-point mount (m).
  bedplate: { castFront: 2.95, castRear: -2.6, top: 0.72, cheekY: 1.58, cheekThickness: 0.42, rearEnd: -11.6, girderY: 1.2, girderDepth: 0.62 },
  // Roof radiator and met mast behind the converter (m).
  cooling: { x: -9.9, width: 3.0, height: 1.7, depth: 0.55, fins: 110, fanRadius: 0.62 },
  metMast: { x: -11.7, height: 3.1 },
  // Eight drives on an externally toothed slew ring seated on the tower top (m).
  yaw: { drives: 8, ringTeeth: 120, pinionTeeth: 14, module: 0.032, height: 0.26, inner: 1.62 },

  // Three tower sections, a length that can be road transported. Real L-flanges sit inside the tube; they are drawn outside here so the bolted joint can be seen.
  towerJoints: [35.8, 61.7],
  towerCanLength: 3.0,
  towerDoor: { z: 11.4, height: 2.2, halfAngle: 9, azimuth: -28 },
  // The deck models the monopile running straight up to the tower base; the grouted yellow sleeve around it is the usual real-world arrangement (m above MSL).
  transitionPiece: { top: 10, bottom: -6, radius: 3.32, darkBelow: 1.5 },
  platform: { z: 10.1, radius: 6.5, railHeight: 1.1 },
  boatLanding: { azimuth: -92, standoff: 1.3, top: 7.5, bottom: -5, halfSpacing: 0.62 },
  jTube: { azimuth: 28, radius: 0.2 },

  // Sea tile: a cut block big enough to show the scour apron, not a modelled site (m).
  seaTile: { half: 32, sediment: 4.2, scourRadius: 14.5, scourRocks: 1300 },
  // Wave periods around the deck's 10 s peak, sharing the deck's significant height with these weights; the deck has a spectrum, this samples it by eye.
  waves: [
    { period: 10, weight: 1, heading: 12 },
    { period: 7.3, weight: 0.62, heading: -24 },
    { period: 5.4, weight: 0.42, heading: 38 },
    { period: 3.9, weight: 0.26, heading: -52 },
    { period: 2.9, weight: 0.16, heading: 74 },
    { period: 2.2, weight: 0.1, heading: -12 },
  ],
};

export const stageRatio = (stage) => (stage.kind === "planetary" ? 1 + stage.ring / stage.sun : stage.wheel / stage.pinion);

export const hssOffset = () => {
  const { pinion, wheel, module } = ASSUMED.stages[2];
  return (module * (pinion + wheel)) / 2;
};
