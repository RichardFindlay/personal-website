import { PUBLISHED } from "../published.js";
import { ASSUMED } from "../assumed.js";
import { PART_TABLE } from "./table.js";
import { buildBlade, buildSpinner } from "./rotor.js";
import { buildCover, buildFloor, buildHousing, buildSidePanel, buildStern } from "./nacelle.js";
import { buildFarm, buildSea, buildTower } from "./support.js";

export const SPEC = { published: PUBLISHED, assumed: ASSUMED };

// What shows from outside. The parts inside are kept in `internals/` and joined on by `partsFor`.
const BUILDERS = {
  spin: buildSpinner,
  cover: buildCover,
  housing: buildHousing,
  sideNear: (spec, mats) => buildSidePanel(spec, mats, -1),
  sideFar: (spec, mats) => buildSidePanel(spec, mats, 1),
  floor: buildFloor,
  stern: buildStern,
  blade0: (spec, mats) => buildBlade(spec, mats, 0),
  blade1: (spec, mats) => buildBlade(spec, mats, 1),
  blade2: (spec, mats) => buildBlade(spec, mats, 2),
  farm: buildFarm,
  tower: buildTower,
  sea: buildSea,
};

// The parts to build, in the table's order. A scene that never comes apart leaves out everything the shell hides, and never fetches its code.
export async function partsFor({ internals }) {
  const inside = internals ? (await import("./internals/index.js")).INTERNAL_BUILDERS : {};
  return PART_TABLE.filter((entry) => internals || !entry.revealedBy).map((entry) => ({ ...entry, build: BUILDERS[entry.key] ?? inside[entry.key] }));
}
