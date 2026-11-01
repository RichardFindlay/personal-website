// Turns the OpenFAST NREL 5 MW input files in ./source into a data module the turbine scene imports.
// Run: node build.mjs   writes staticfiles/js/turbine3d/published.js
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "source");
const OUT = join(HERE, "../../staticfiles/js/turbine3d/published.js");

const AIRFOIL_FILES = ["Cylinder1", "Cylinder2", "DU40_A17", "DU35_A17", "DU30_A17", "DU25_A17", "DU21_A17", "NACA64_A17"];
const POINTS_PER_SIDE = 40;
const TOWER_STATIONS = 11;
const BLADE_STATIONS = 19;

const read = (name) => readFileSync(join(SOURCE, name), "utf8");

function number(text, where) {
  const value = Number(text);
  if (text === undefined || text === "" || !Number.isFinite(value)) throw new Error(`${where}: not a number: ${text}`);
  return value;
}

function scalar(text, name, file) {
  const line = text.split("\n").find((l) => l.trim().split(/\s+/)[1] === name);
  if (!line) throw new Error(`${file}: no ${name}`);
  return number(line.trim().split(/\s+/)[0], `${file} ${name}`);
}

function tableAfter(text, header, rows, file) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith(header));
  if (start < 0) throw new Error(`${file}: no table ${header}`);
  const table = lines.slice(start + 2, start + 2 + rows).map((l) => l.trim().split(/\s+/).map((v) => number(v, `${file} ${header}`)));
  if (table.length !== rows) throw new Error(`${file}: ${header} has ${table.length} rows, wanted ${rows}`);
  return table;
}

function expectSign(value, sign, name) {
  if (Math.sign(value) !== sign) throw new Error(`${name}: expected sign ${sign}, got ${value}`);
  return Math.abs(value);
}

function interpolate(side, x) {
  for (let i = 1; i < side.length; i++) {
    const [x0, y0] = side[i - 1];
    const [x1, y1] = side[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return side.at(-1)[1];
}

function parseAirfoil(name) {
  const file = `airfoils/${name}_coords.txt`;
  const lines = read(file).split("\n");
  const count = number(lines[0].trim().split(/\s+/)[0], `${file} NumCoords`);
  const rows = lines.filter((l) => /^\s*-?\d/.test(l)).slice(1).map((l) => l.trim().split(/\s+/).slice(0, 2).map((v) => number(v, file)));
  if (rows.length !== count) throw new Error(`${file}: ${rows.length} coordinates, header says ${count}`);
  const [reference, ...coords] = rows;
  const nose = coords.reduce((best, [x], i) => (x < coords[best][0] ? i : best), 0);
  const upper = coords.slice(0, nose + 1).reverse();
  const lower = coords.slice(nose);
  const stations = Array.from({ length: POINTS_PER_SIDE + 1 }, (_, k) => (1 - Math.cos((Math.PI * k) / POINTS_PER_SIDE)) / 2);
  const resample = (side) => stations.map((x) => [round(x), round(interpolate(side, x))]);
  const result = { reference, upper: resample(upper), lower: resample(lower) };
  if (result.upper[20][1] <= result.lower[20][1]) throw new Error(`${file}: upper surface is not above the lower one`);
  return result;
}

const round = (v) => Number(v.toFixed(5));

const elastodyn = read("elastodyn.dat");
const ed = (name) => scalar(elastodyn, name, "elastodyn.dat");
const seastate = read("seastate.dat");

const bladeText = read("blade.dat");
const stationCount = scalar(bladeText, "NumBlNds", "blade.dat");
if (stationCount !== BLADE_STATIONS) throw new Error(`blade.dat: ${stationCount} stations, wanted ${BLADE_STATIONS}`);
const stations = tableAfter(bladeText, "BlSpn", stationCount, "blade.dat").map(([span, crv, swp, , twist, chord, airfoil]) => {
  if (!Number.isInteger(airfoil) || airfoil < 1 || airfoil > AIRFOIL_FILES.length) throw new Error(`blade.dat: bad airfoil id ${airfoil}`);
  return { span, crv, swp, twist, chord, airfoil: airfoil - 1 };
});

const towerTable = tableAfter(read("aerodyn.dat"), "TwrElev", TOWER_STATIONS, "aerodyn.dat").map(([elev, diam]) => ({ elev, diam }));

const subdyn = read("subdyn.dat");
const joints = tableAfter(subdyn, "JointID", 4, "subdyn.dat").map(([id, , , z]) => ({ id, z }));
const sections = tableAfter(subdyn, "PropSetID", 3, "subdyn.dat").map(([id, , , , diam, wall]) => ({ id, diam, wall }));

const airfoils = AIRFOIL_FILES.map(parseAirfoil);

const scalars = [
  ["tipRadius", ed("TipRad"), "elastodyn.dat TipRad (m)"],
  ["hubRadius", ed("HubRad"), "elastodyn.dat HubRad (m)"],
  ["precone", expectSign(ed("PreCone(1)"), -1, "PreCone"), "elastodyn.dat PreCone, negative there means coned upwind (deg)"],
  ["shaftTilt", expectSign(ed("ShftTilt"), -1, "ShftTilt"), "elastodyn.dat ShftTilt, negative there lifts the upwind end (deg)"],
  ["overhang", expectSign(ed("OverHang"), -1, "OverHang"), "elastodyn.dat OverHang along the shaft, negative there means upwind (m)"],
  ["towerTopToShaft", ed("Twr2Shft"), "elastodyn.dat Twr2Shft (m)"],
  ["towerTop", ed("TowerHt"), "elastodyn.dat TowerHt above MSL (m)"],
  ["towerBase", ed("TowerBsHt"), "elastodyn.dat TowerBsHt above MSL (m)"],
  ["nacelleCmDownwind", ed("NacCMxn"), "elastodyn.dat NacCMxn (m)"],
  ["nacelleCmUp", ed("NacCMzn"), "elastodyn.dat NacCMzn (m)"],
  ["gearboxRatio", ed("GBRatio"), "elastodyn.dat GBRatio (-)"],
  ["ratedRotorRpm", ed("RotSpeed"), "elastodyn.dat RotSpeed (rpm)"],
  ["hubMass", ed("HubMass"), "elastodyn.dat HubMass (kg)"],
  ["nacelleMass", ed("NacMass"), "elastodyn.dat NacMass (kg)"],
  ["seabed", round(joints[0].z), "subdyn.dat joint 1 Z above MSL (m)"],
  ["monopileDiameter", sections[0].diam, "subdyn.dat PropSet 1 XsecD (m)"],
  ["monopileWall", sections[0].wall, "subdyn.dat PropSet 1 XsecT (m)"],
  ["towerBaseWall", sections[1].wall, "subdyn.dat PropSet 2 XsecT (m)"],
  ["towerTopWall", sections[2].wall, "subdyn.dat PropSet 3 XsecT (m)"],
  ["waveHs", scalar(seastate, "WaveHs", "seastate.dat"), "seastate.dat WaveHs (m)"],
  ["waveTp", scalar(seastate, "WaveTp", "seastate.dat"), "seastate.dat WaveTp (s)"],
];

const compact = (rows) => rows.map((row) => `    ${JSON.stringify(row)},`).join("\n");

const body = `// Generated by figures/turbine3d/build.mjs from the OpenFAST input files in figures/turbine3d/source.
// Edit the build, not this file.
export const PUBLISHED = {
${scalars.map(([key, value, source]) => `  // ${source}\n  ${key}: ${value},`).join("\n")}
  // blade.dat BlSpn, BlCrvAC, BlSwpAC, BlTwist, BlChord, BlAFID (m, m, m, deg, m, zero-based index into airfoils)
  stations: [
${compact(stations)}
  ],
  // aerodyn.dat TwrElev, TwrDiam (m above MSL, m)
  tower: [
${compact(towerTable)}
  ],
  // airfoils/*_coords.txt, reference point in x/c, y/c, each surface resampled from 399 points to ${POINTS_PER_SIDE + 1} cosine-spaced ones running leading edge to trailing edge
  airfoils: [
${airfoils.map((airfoil, i) => `    { name: ${JSON.stringify(AIRFOIL_FILES[i])}, reference: ${JSON.stringify(airfoil.reference)}, upper: ${JSON.stringify(airfoil.upper)}, lower: ${JSON.stringify(airfoil.lower)} },`).join("\n")}
  ],
};
`;

writeFileSync(OUT, body);
