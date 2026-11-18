// What is inside the hub and the nacelle, each part with its own builder: see README.md beside this file.
// Nothing here is seen until the turbine comes apart, so the scene fetches this folder only when it is going to.
import { buildHub, buildShaft } from "./hub.js";
import { buildBearing, buildBrake, buildGearbox, buildGenerator } from "./drivetrain.js";
import { buildBedplate, buildConverter, buildCooling, buildSpaceframe, buildYaw } from "./machinery.js";

export const INTERNAL_BUILDERS = {
  hub: buildHub,
  bearing: buildBearing,
  shaft: buildShaft,
  gear: buildGearbox,
  brake: buildBrake,
  gen: buildGenerator,
  conv: buildConverter,
  cool: buildCooling,
  bed: buildBedplate,
  yaw: buildYaw,
  frameNear: (spec, mats) => buildSpaceframe(spec, mats, -1),
  frameFar: (spec, mats) => buildSpaceframe(spec, mats, 1),
};
