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
  // GRP nose cone, nearly a ball about the apex, enclosing the hub and clearing the blade roots. Its rear rim stops just ahead of the cover (m).
  spinner: { rear: 3.05, radius: 3.05, bulge: 0.05, noseFromApex: 3.45, tail: 3.4, nosePower: 2.1, hole: 1.86, noseSeam: 2.05, noseStep: 0.035, capSeam: 0.82 },
  // Bolted ring where each blade root leaves the nose cone, stations measured from the apex along the pitch axis. The 3.542 m root leaves little skin behind it, so it stays tight on the root (m).
  bladeCollar: { seat: 2.0, face: 2.68, neck: 2.84, outer: 2.06, inner: 1.79, bolts: 32, boltCircle: 1.94, boltSize: 0.042 },

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
  // Partial-rating converter for a DFIG, in floor-standing cabinets on outriggers either side of the generator, which is what lets the frame end just behind it (m).
  converter: { cabinets: 4, width: 0.82, depth: 0.82, height: 2.1, x0: -5.0, rowY: 1.85, z: 0.82 },

  // Soft rounded-rectangle envelope in the proportions of current offshore cowlings, far taller than the drivetrain needs. It closes behind the spinner on a shoulder and on a domed stern, and `stern.centre` sits low so the stern still wraps the rear of the bedplate (m).
  nacelle: {
    front: 2.95,
    rear: -9.6,
    halfWidth: 2.9,
    roof: 6.0,
    skirt: -0.42,
    cornerTop: 1.3,
    cornerBottom: 0.9,
    shoulder: { from: -0.8, halfWidth: 2.35, top: 4.45, bottom: -0.05, cornerTop: 1.6, power: 2.3 },
    stern: { from: -6.1, centre: 1.3, power: 2.4 },
    seam: { z: 3.55, lowZ: 0.42 },
    vent: { x: -1.75, z: 3.74, length: 1.5, height: 0.12 },
    hatch: { x: -3.2, y: -0.45, length: 1.5, width: 1.05 },
    // Lip seal just clear of the 0.72 m main shaft neck where it leaves the nose plate.
    shaftSeal: { inner: 0.78, outer: 0.94 },
    // How the GRP cover divides: panels meet on the two flank seams, the stern comes off whole at `sternAt`, and the floor is cut round the yaw ring (m).
    panels: { sternAt: -7.6, shell: 0.07, floorHole: 2.36 },
  },
  // Raised rear housing over the cooler: a raked front like a windscreen, whose side panels run on down the flank to a rounded tip. All side-view stations (m).
  raised: {
    tail: -8.4,
    rearTop: -8.0,
    frontTop: -6.2,
    tip: -3.6,
    top: 7.6,
    low: 1.75,
    browRadius: 0.32,
    tipRadius: 0.42,
    proud: 0.18,
    lean: 0.45,
    leanFrom: 4.7,
    corner: 0.42,
    cornerLow: 0.12,
    cornerFrom: 5.2,
    recess: 0.42,
    pillar: 0.3,
    // `bow` tilts the glass normal per metre across and up the band: under an orthographic camera truly flat glass reflects one colour.
    panes: { count: 4, bottom: 6.14, top: 7.2, halfWidth: 1.75, mullion: 0.12, radius: 0.09, bow: [0.12, 0.25] },
    panel: { rear: -7.55, front: -4.6, bottom: 2.05, top: 3.2, radius: 0.22 },
  },
  // Galvanised side trusses that carry the cover, in the gap outboard of the converter and bedplate (m).
  spaceframe: { y: 2.62, rear: -7.2, front: 1.1, low: 1.0, high: 4.85, bays: 6, chord: 0.12, member: 0.045 },
  // Cast front saddle bolted to a welded rear frame, the usual split for a three-point mount (m).
  bedplate: { castFront: 2.95, castRear: -2.6, top: 0.72, cheekY: 1.58, cheekThickness: 0.42, rearEnd: -8.9, girderY: 1.2, girderDepth: 0.62 },
  // Radiator with twin fans, seated inside the raised housing and above the converter (m).
  cooling: { x: -7.2, base: 5.3, width: 3.0, height: 1.7, depth: 0.55, fins: 110, fanRadius: 0.62 },
  // Roof sensors on the raised housing: two wind instruments on tripods, a satellite radome and the aviation beacon offshore rules require (m).
  instruments: {
    cups: { x: -7.05, y: 1.3, height: 2.3, armLength: 0.42, cupRadius: 0.15 },
    vane: { x: -7.05, y: -1.3, height: 2.0, tail: 0.75, head: 0.55, fin: [0.5, 0.34], disc: 0.2 },
    tripod: { spread: 0.3, height: 0.62 },
    radome: { x: -7.4, y: 0.4, radius: 0.42, collar: 0.22 },
    beacon: { x: -7.65, y: -0.95, height: 0.8 },
  },
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

  // Foundations gather fish, so a shoal circles the pile. Drawn several times life size so it reads at this zoom (m, rad/s; `arc` in rad, `spread` as radial and vertical).
  shoals: [
    { centre: [0, 0], radius: 11, arc: 1.5, spread: [3, 3], depth: 9.5, rate: 0.13, count: 36, length: 2.7, tone: "#dfe8ec" },
  ],

  // Sea in view axes: `u` runs across the screen (x + y) and `v` up and down it (x - y), so the line v = front reads as a level edge. Far wider and deeper than any screen shows; only that edge is ever seen. `front` keeps the rocks and pile foot on screen above it, and `pileEmbed` is how far the piles run on below the seabed (m).
  seaTile: { left: -820, right: 700, back: -920, front: 70, pileEmbed: 4.2, scourRadius: 14.5, scourRocks: 1300 },
  // The rest of the wind farm as [u, v] from the foundation in focus: far closer than the usual seven rotor diameters, so more than one fits on a screen, and clear of the hero text low on the left, which needs u > -88 or v < -70.
  farm: [
    [120, -150], [-174, -79], [320, -110], [260, -300], [60, -350], [-230, -310], [-420, -300],
    [-610, -280], [-800, -300], [470, -280], [200, -480], [-40, -530], [-300, -500], [-520, -490], [-740, -490],
  ],
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

// A point on the sea from its view axes.
export const seaPoint = ([u, v]) => [(u + v) / 2, (u - v) / 2];

export const stageRatio = (stage) => (stage.kind === "planetary" ? 1 + stage.ring / stage.sun : stage.wheel / stage.pinion);

export const hssOffset = () => {
  const { pinion, wheel, module } = ASSUMED.stages[2];
  return (module * (pinion + wheel)) / 2;
};

const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const superellipse = (t, power) => Math.pow(1 - Math.pow(t, power), 1 / power);

// Cover section at station x. The shoulder blends the flat-sided body into the nose, then the stern scales the result down to a dome.
export function hullSection(x) {
  const { nacelle: n } = ASSUMED;
  const { shoulder, stern } = n;
  const nose = 1 - superellipse(clamp01((x - shoulder.from) / (n.front - shoulder.from)), shoulder.power);
  const scale = superellipse(clamp01((stern.from - x) / (stern.from - n.rear)), stern.power);
  const toward = (body, end) => body + (end - body) * nose;
  return {
    halfWidth: toward(n.halfWidth, shoulder.halfWidth) * scale,
    top: stern.centre + (toward(n.roof, shoulder.top) - stern.centre) * scale,
    bottom: stern.centre + (toward(n.skirt, shoulder.bottom) - stern.centre) * scale,
    cornerTop: toward(n.cornerTop, shoulder.cornerTop) * scale,
    cornerBottom: n.cornerBottom * scale,
  };
}

// How far the cover reaches sideways at height z on station x, 0 above or below it.
export function hullHalfWidthAt(x, z) {
  const { halfWidth, top, bottom, cornerTop, cornerBottom } = hullSection(x);
  if (z > top || z < bottom) return 0;
  const inset = (corner, d) => (d > 0 ? corner - Math.sqrt(corner * corner - d * d) : 0);
  return halfWidth - inset(cornerTop, z - (top - cornerTop)) - inset(cornerBottom, bottom + cornerBottom - z);
}
