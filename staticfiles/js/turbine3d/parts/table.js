import { PUBLISHED } from "../published.js";

const TILT = (PUBLISHED.shaftTilt * Math.PI) / 180;

const alongShaft = (d) => [d * Math.cos(TILT), 0, d * Math.sin(TILT)];
const PRECONE = (PUBLISHED.precone * Math.PI) / 180;
// A blade's pitch axis in nacelle axes with the rotor parked: azimuth 0 points up.
const alongBlade = (degrees, d) => {
  const a = (degrees * Math.PI) / 180;
  const up = Math.cos(PRECONE) * Math.cos(a);
  const upwind = Math.sin(PRECONE);
  return [d * (upwind * Math.cos(TILT) - up * Math.sin(TILT)), -d * Math.cos(PRECONE) * Math.sin(a), d * (upwind * Math.sin(TILT) + up * Math.cos(TILT))];
};

// The scene-independent half of the PARTS registry, kept free of three.js so choreography.js and the Node check can read it.
// Coordinates are metres in nacelle axes: origin at the yaw axis on the tower top, +x upwind, +z up.
// `carriedBy`: a part this one also rides with, so a blade drawn off the hub keeps pointing at it as the hub moves.
// `revealedBy`: the part whose movement first exposes this one. Until then it is not drawn, which keeps the frame cost of everything sealed inside the nacelle out of the assembled view.
export const PART_TABLE = [
  { key: "spin", channel: "d", explode: alongShaft(15.5) },
  { key: "hub", revealedBy: "blade0", channel: "d", explode: alongShaft(7.5) },
  { key: "bearing", revealedBy: "cover", channel: "d", explode: alongShaft(5.5) },
  { key: "shaft", revealedBy: "cover", channel: "d", explode: alongShaft(2) },
  { key: "gear", revealedBy: "cover", channel: "d", explode: [0, 0, 0] },
  { key: "brake", revealedBy: "cover", channel: "d", explode: alongShaft(-2) },
  { key: "gen", revealedBy: "cover", channel: "d", explode: alongShaft(-4) },
  { key: "conv", revealedBy: "cover", channel: "d", explode: [-1, 0, 5.5] },
  { key: "cover", channel: "c", explode: [0, 0, 12] },
  { key: "cool", revealedBy: "cover", channel: "c", explode: [-6, 0, 5.5] },
  { key: "bed", revealedBy: "cover", channel: "d", explode: [0, 0, 0] },
  { key: "yaw", revealedBy: "cover", channel: "y", explode: [0, 0, -5] },
  { key: "frameNear", revealedBy: "cover", channel: "f", explode: [0, -5, 0] },
  { key: "frameFar", revealedBy: "cover", channel: "f", explode: [0, 4, 0] },
  { key: "housing", channel: "c", explode: [-1.5, 0, 19] },
  { key: "sideNear", channel: "s", explode: [0, -9, 0] },
  { key: "sideFar", channel: "s", explode: [0, 8, 0] },
  { key: "floor", channel: "s", explode: [0, 0, -9] },
  { key: "stern", channel: "s", explode: [-7, 0, 0] },
  { key: "blade0", channel: "b", carriedBy: "hub", explode: alongBlade(0, 14) },
  { key: "blade1", channel: "b", carriedBy: "hub", explode: alongBlade(120, 11) },
  { key: "blade2", channel: "b", carriedBy: "hub", explode: alongBlade(240, 11) },
  { key: "farm", channel: null, explode: [0, 0, 0], fade: "farm" },
  { key: "tower", channel: null, explode: [0, 0, 0], fade: "base" },
  { key: "sea", channel: null, explode: [0, 0, 0], fade: "sea" },
];
