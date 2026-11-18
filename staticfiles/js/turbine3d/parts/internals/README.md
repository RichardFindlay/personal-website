# Inside the turbine

Everything the nacelle cover and the spinner hide: the hub casting and pitch drives, the main shaft and bearing, the three-stage gearbox, the brake, the generator, the converter cabinets, the cooler, the bedplate, the yaw drive and the two side frames. About 220,000 triangles of modelled machinery for the NREL 5 MW reference turbine.

The homepage's hero never shows any of it, so the hero neither builds nor downloads this folder. It is kept here, whole and working, for the exploded tour and for any later project that wants the machinery.

## Seeing it

Add `?explode` to the homepage address. The turbine then comes apart as the page scrolls and the camera makes one turn round it. That is the only thing that loads this folder: `partsFor({ internals: true })` in `../index.js` imports `index.js` here.

## What is here

| File | Parts (key in `../table.js`) | Builder |
| --- | --- | --- |
| `hub.js` | Hub casting with pitch bearings, ring gears and pitch motors (`hub`) | `buildHub` |
| `hub.js` | Main shaft with lock disc and shrink disc (`shaft`) | `buildShaft` |
| `drivetrain.js` | Main bearing in its housing (`bearing`) | `buildBearing` |
| `drivetrain.js` | Gearbox: two planetary stages and a helical stage, casing cut away (`gear`) | `buildGearbox` |
| `drivetrain.js` | Disc brake and coupling (`brake`) | `buildBrake` |
| `drivetrain.js` | Generator, cut away to the stator windings (`gen`) | `buildGenerator` |
| `machinery.js` | Converter cabinets (`conv`) | `buildConverter` |
| `machinery.js` | Roof cooler with fans and pipework (`cool`) | `buildCooling` |
| `machinery.js` | Cast bedplate and rear frame (`bed`) | `buildBedplate` |
| `machinery.js` | Yaw bearing, ring gear, drives and brakes (`yaw`) | `buildYaw` |
| `machinery.js` | Side frames that carry the cover (`frameNear`, `frameFar`) | `buildSpaceframe` |

`index.js` gathers them as `INTERNAL_BUILDERS`, keyed as in the table.

## How a builder works

Each is `build(spec, mats)` and returns a three.js `Object3D`, in metres, in nacelle axes: origin on the yaw axis at the tower top, +x upwind, +z up.

- `spec` is `{ published, assumed }`: the turbine's published dimensions (`../../published.js`, generated from the OpenFAST input files by `figures/turbine3d/build.mjs`) and the dimensions this model had to assume (`../../assumed.js`). Gear ratios, tooth counts and shaft positions all come from there.
- `mats` is a map from finish name to three.js material, such as `steel`, `gearSteel`, `castIron`, `copper`, `bolt` and `genPaint`. The scene's are made by `createMaterials` in `../../materials.js`; any object with those names will do.
- Parts that turn carry `userData.spins` (with the rotor) or `userData.turn` (a gear ratio: the part turns that many times as far as the rotor, about its own x axis). The scene reads these to animate the drivetrain.

Where each part goes when the turbine comes apart, and what first uncovers it, is in `../table.js`.

## Taking it elsewhere

The builders need only these, all in this repository:

- `../shapes.js`: the geometry kit (lathes, gears, bolt circles, pipes, the `Kit` that groups geometry by finish).
- `../rotor.js`: three small helpers for the rotating frame, used by `hub.js`.
- `../../assumed.js` and `../../published.js`: the dimensions.
- three.js 0.170.

Copy `parts/` with `assumed.js`, `published.js` and `materials.js`, and build with:

```js
import { SPEC } from "./parts/index.js";
import { INTERNAL_BUILDERS } from "./parts/internals/index.js";
import { createMaterials } from "./materials.js";

const { mats } = createMaterials({ pileRadius: 3, piles: [[0, 0]] });
const gearbox = INTERNAL_BUILDERS.gear(SPEC, mats);
scene.add(gearbox);
```

`figures/turbine3d/check.mjs` checks the dimensions these parts are built from: run `node figures/turbine3d/check.mjs` after changing any.
