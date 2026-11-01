import { PUBLISHED } from "../published.js";
import { ASSUMED } from "../assumed.js";

const TILT = (PUBLISHED.shaftTilt * Math.PI) / 180;

const onShaft = (s, y = 0, up = 0) => [s * Math.cos(TILT) - up * Math.sin(TILT), y, PUBLISHED.towerTopToShaft + s * Math.sin(TILT) + up * Math.cos(TILT)];
const alongShaft = (d) => [d * Math.cos(TILT), 0, d * Math.sin(TILT)];

// The scene-independent half of the PARTS registry, kept free of three.js so choreography.js and the Node check can read it.
// Coordinates are metres in nacelle axes: origin at the yaw axis on the tower top, +x upwind, +z up.
// Order is the callout order, which staggers their fade-in.
// `revealedBy`: the part whose movement first exposes this one. Until then it is not drawn, which keeps the frame cost of everything sealed inside the nacelle out of the assembled view.
export const PART_TABLE = [
  { key: "spin", label: "SPINNER", number: "01", channel: "d", explode: alongShaft(15.5), anchor: onShaft(5.6, -2.05, -1.75), lead: [[-65, 5], [-79, 5]], side: "left" },
  { key: "hub", revealedBy: "blades", label: "HUB", number: "02", channel: "d", explode: alongShaft(7.5), anchor: onShaft(5.6, 0.75, 1.9), lead: [[44, -60], [58, -60]], side: "right" },
  { key: "bearing", revealedBy: "cover", label: "MAIN BEARING", number: "03", channel: "d", explode: alongShaft(5.5), anchor: onShaft(2.5, 0.5, 1.02), lead: [[125, -126], [139, -126]], side: "right" },
  { key: "shaft", revealedBy: "cover", label: "MAIN SHAFT", number: "04", channel: "d", explode: alongShaft(2), anchor: onShaft(1.4, -0.2, 0.55), lead: [[19, -73], [33, -73]], side: "right" },
  { key: "gear", revealedBy: "cover", label: "GEARBOX", number: "05", channel: "d", explode: [0, 0, 0], anchor: onShaft(-0.4, -0.75, 1.05), lead: [[51, -114], [65, -114]], side: "right" },
  { key: "brake", revealedBy: "cover", label: "BRAKE & CALIPER", number: "06", channel: "d", explode: alongShaft(-2), anchor: onShaft(-3.3, -0.3, 0.75), lead: [[-16, 170], [-30, 170]], side: "left" },
  { key: "gen", revealedBy: "cover", label: "GENERATOR", number: "07", channel: "d", explode: alongShaft(-4), anchor: onShaft(-5.0, -0.75, 0.3), lead: [[12, 129], [-2, 129]], side: "left" },
  { key: "conv", revealedBy: "cover", label: "CONVERTER", number: "08", channel: "d", explode: [-7, 0, 0], anchor: [-10, -1.6, 2.2], lead: [[3, 112], [17, 112]], side: "right" },
  { key: "cover", label: "NACELLE COVER", number: "09", channel: "c", explode: [0, 0, 11], anchor: [-1.2, -0.6, 4.05], lead: [[130, -90], [144, -90]], side: "right" },
  { key: "cool", label: "COOLING & MET MAST", number: "10", channel: "c", explode: [0, 0, 17], anchor: [ASSUMED.cooling.x, 0, 5], lead: [[16, -100], [30, -100]], side: "right" },
  { key: "bed", revealedBy: "cover", label: "BEDPLATE", number: "11", channel: "d", explode: [0, 0, 0], anchor: [1.2, -1.75, 0.6], lead: [[-71, 132], [-85, 132]], side: "left" },
  { key: "yaw", revealedBy: "cover", label: "YAW SYSTEM", number: "12", channel: "y", explode: [0, 0, -5], anchor: [0.4, -2.0, -0.1], lead: [[-53, 90], [-67, 90]], side: "left" },
  { key: "blades", label: null, number: null, channel: "b", explode: [14, 0, -40], fade: "blade" },
  { key: "tower", label: null, number: null, channel: null, explode: [0, 0, 0], fade: "base" },
  { key: "sea", label: null, number: null, channel: null, explode: [0, 0, 0], fade: "base" },
];
