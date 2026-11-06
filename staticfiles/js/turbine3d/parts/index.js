import { PUBLISHED } from "../published.js";
import { ASSUMED } from "../assumed.js";
import { PART_TABLE } from "./table.js";
import { buildBlade, buildHub, buildShaft, buildSpinner } from "./rotor.js";
import { buildBearing, buildBrake, buildGearbox, buildGenerator } from "./drivetrain.js";
import { buildBedplate, buildConverter, buildCooling, buildCover, buildFloor, buildHousing, buildSidePanel, buildSpaceframe, buildStern, buildYaw } from "./nacelle.js";
import { buildFarm, buildSea, buildTower } from "./support.js";

export const SPEC = { published: PUBLISHED, assumed: ASSUMED };

const BUILDERS = {
  spin: buildSpinner,
  hub: buildHub,
  bearing: buildBearing,
  shaft: buildShaft,
  gear: buildGearbox,
  brake: buildBrake,
  gen: buildGenerator,
  conv: buildConverter,
  cover: buildCover,
  cool: buildCooling,
  bed: buildBedplate,
  yaw: buildYaw,
  housing: buildHousing,
  sideNear: (spec, mats) => buildSidePanel(spec, mats, -1),
  sideFar: (spec, mats) => buildSidePanel(spec, mats, 1),
  floor: buildFloor,
  stern: buildStern,
  frameNear: (spec, mats) => buildSpaceframe(spec, mats, -1),
  frameFar: (spec, mats) => buildSpaceframe(spec, mats, 1),
  blade0: (spec, mats) => buildBlade(spec, mats, 0),
  blade1: (spec, mats) => buildBlade(spec, mats, 1),
  blade2: (spec, mats) => buildBlade(spec, mats, 2),
  farm: buildFarm,
  tower: buildTower,
  sea: buildSea,
};

export const PARTS = PART_TABLE.map((entry) => ({ ...entry, build: BUILDERS[entry.key] }));
