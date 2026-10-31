// Prints the model's operating points beside the published figures it should
// land near, and fails if any drifts out of its band.
// Run: node figures/ccgt/check.mjs
import { C, UNIT, atLoad, fullLoad, withCapture } from "./model.mjs";

const row = (label, s) => {
  const t = (k) => `${(s.t[k] - C).toFixed(0)} °C`;
  console.log(`${label.padEnd(22)} net ${s.mw.net.toFixed(0).padStart(4)} MW  gas ${s.mw.gas.toFixed(0).padStart(3)}  steam ${s.mw.steam.toFixed(0).padStart(3)}  ` +
    `η ${(s.eff.combined * 100).toFixed(1)} % (gas alone ${(s.eff.gas * 100).toFixed(1)} %)  PR ${s.pr.toFixed(1)}  ` +
    `compressor ${t("compressor")}  exhaust ${t("exhaust")}  fuel ${s.fuel.toFixed(1)} kg/s  CO2 ${(s.co2 * 1000).toFixed(0)} g/kWh`);
};

const iso = fullLoad();
row("ISO 15 °C, full load", iso);
row("cold day 0 °C", fullLoad(C + 0));
row("hot day 30 °C", fullLoad(C + 30));
for (const l of [0.9, 0.75, 0.6, 0.4]) row(`${l * 100} % load`, atLoad(l));
row("with 95 % capture", withCapture(iso));

// the bands: published H-class figures, rounded (see docs/ccgt-anatomy-investigation.md)
const checks = [
  ["combined efficiency at ISO", iso.eff.combined, 0.61, 0.645],
  ["simple-cycle efficiency at ISO", iso.eff.gas, 0.41, 0.45],
  ["exhaust temperature (°C)", iso.t.exhaust - C, 580, 660],
  ["gas share of output", iso.mw.gas / (iso.mw.gas + iso.mw.steam), 0.62, 0.72],
  ["CO2 at full load (g/kWh)", iso.co2 * 1000, 300, 360],
  ["hot-day output drop per °C (%)", ((iso.mw.net - fullLoad(C + 30).mw.net) / iso.mw.net / 15) * 100, 0.3, 0.9],
  ["efficiency at 60 % load", atLoad(0.6).eff.combined, 0.52, 0.61],
  ["exhaust rises as the vanes close", atLoad(0.8).t.exhaust - iso.t.exhaust, 0, 80],
  ["hot day is less efficient than cold (points)", (fullLoad(C + 0).eff.combined - fullLoad(C + 30).eff.combined) * 100, 0.2, 2],
];
let bad = 0;
for (const [name, v, lo, hi] of checks) {
  const ok = v >= lo && v <= hi;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${v.toFixed(3)} (band ${lo} to ${hi})`);
}
console.log(`shaft ${UNIT.rpm} rpm`);
process.exit(bad ? 1 : 0);
