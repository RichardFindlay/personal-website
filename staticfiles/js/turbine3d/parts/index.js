import { PUBLISHED } from "../published.js";
import { ASSUMED } from "../assumed.js";
import { PART_TABLE } from "./table.js";
import { buildBlades, buildHub, buildShaft, buildSpinner } from "./rotor.js";
import { buildBearing, buildBrake, buildGearbox, buildGenerator } from "./drivetrain.js";
import { buildBedplate, buildConverter, buildCooling, buildCover, buildYaw } from "./nacelle.js";
import { buildSea, buildTower } from "./support.js";

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
  blades: buildBlades,
  tower: buildTower,
  sea: buildSea,
};

export const PARTS = PART_TABLE.map((entry) => ({ ...entry, build: BUILDERS[entry.key] }));
