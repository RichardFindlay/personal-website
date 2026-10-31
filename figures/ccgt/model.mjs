/*
 * How a combined-cycle gas turbine (CCGT) power station works, as numbers: a
 * research model for an anatomy figure of one. Pure, so a build and the page
 * that animates it would agree, the way figures/battery/model.mjs does.
 *
 * Gas turbine (the topping cycle, Brayton): air is drawn in and compressed,
 * gas is burnt in it, and the hot gas expands through the turbine, which turns
 * both the compressor and the generator. Its exhaust leaves at about 600 °C.
 * Heat-recovery steam generator (HRSG): that exhaust passes over banks of
 * tubes and boils water at three pressures before leaving up the stack at
 * about 85 °C. Steam turbine (the bottoming cycle, Rankine): the steam drives
 * a second turbine, is condensed under vacuum and pumped back round.
 *
 * The working is a cold-air-standard cycle with real component efficiencies,
 * calibrated to an H-class single-shaft unit at ISO conditions (15 °C, 1.013
 * bar, humidity ignored), sized like Keadby 2 in Lincolnshire (one Siemens
 * SGT5-9000HL, 849 MW and 64.18 % at its 2024 record test): about 44 % simple
 * cycle, 63.6 % combined, exhaust about 635 °C, roughly 2:1 gas to steam. It is a teaching model, good to a few per
 * cent, not a design tool: it ignores turbine cooling air, humidity, pressure
 * losses beyond one factor, and the HRSG's pinch analysis.
 *
 * Units: kelvin, bar, kg/s, kJ/kg, MW.
 */

export const C = 273.15;

// ── The unit: one gas turbine, one HRSG, one steam turbine on one shaft ─────
export const UNIT = {
  airFlow: 1170,            // kg/s through the compressor at ISO conditions: about 850 MW net, Keadby 2's size
  pressureRatio: 23,        // compressor outlet over inlet, full load
  firing: 1750,             // K, turbine inlet (rotor inlet) temperature at full load
  firingMin: 1300,          // K, the lowest the combustor runs before emissions rise
  igvMin: 0.72,             // inlet guide vanes closed: the least air flow, as a share of full
  compressorEff: 0.885,     // isentropic
  turbineEff: 0.9,          // isentropic
  lossFactor: 0.95,         // pressure kept through the combustor and ducts
  stack: C + 85,            // K, exhaust temperature leaving the HRSG
  condenserLift: 18,        // K the steam condenses above the air or water that cools it: 33 °C (about 0.05 bar) at ISO
  rankineQuality: 0.8,      // the steam cycle's share of Carnot between its mean heat temperature and the condenser
  generatorEff: 0.985,
  auxiliary: 0.02,          // pumps, fans and cooling: a share of gross output used on site
  minLoad: 0.4,             // the lowest load it runs at within its emission limits
  rpm: 3000,                // a two-pole generator on GB's 50 Hz grid
};

const AIR = { cp: 1.005, k: 1.4 };            // kJ/kg·K
const GAS = { cp: 1.15, k: 1.33 };            // hot combustion products
const EXHAUST_CP = 1.08;                      // the exhaust as it cools through the HRSG
export const GAS_LHV = 50000;                 // kJ/kg, natural gas (mostly methane), lower heating value
export const CO2_PER_KWH_FUEL = 0.202;        // kg CO2 per kWh of natural gas burnt (LHV), about 56 kg/GJ

const exponent = ({ k }) => (k - 1) / k;

/**
 * One operating point: `ambient` air temperature (K), `airShare` of full air
 * flow (set by the inlet guide vanes) and `firing` temperature (K).
 * Returns every temperature, pressure, flow and power along the gas and steam
 * paths, for the figure's gauges and the colour of its hot parts.
 */
export function cycle({ ambient = C + 15, airShare = 1, firing = UNIT.firing, unit = UNIT } = {}) {
  // air is a fixed volume per revolution: hotter air is thinner, so less of it by mass
  const air = unit.airFlow * airShare * ((C + 15) / ambient);
  // the turbine's first nozzle is choked, so the pressure it holds follows the flow and the heat
  const pr = unit.pressureRatio * airShare * Math.sqrt(firing / unit.firing) * ((C + 15) / ambient) ** 0.5;

  // 1 → 2: compression
  const t1 = ambient;
  const t2 = t1 + (t1 * pr ** exponent(AIR) - t1) / unit.compressorEff;
  const compressorWork = AIR.cp * (t2 - t1);                       // per kg of air

  // 2 → 3: combustion, the fuel that lifts the air to the firing temperature
  const heat = GAS.cp * (firing - t2);                             // per kg of air
  const fuelPerAir = heat / GAS_LHV;
  const fuel = air * fuelPerAir;                                   // kg/s

  // 3 → 4: expansion through the turbine
  const t3 = firing;
  const t4 = t3 - unit.turbineEff * (t3 - t3 / (pr * unit.lossFactor) ** exponent(GAS));
  const turbineWork = GAS.cp * (t3 - t4) * (1 + fuelPerAir);

  const gasShaft = (air * (turbineWork - compressorWork)) / 1000;  // MW at the coupling
  const fuelPower = (fuel * GAS_LHV) / 1000;                       // MW of heat burnt

  // 4 → 5: the HRSG takes the exhaust down to the stack
  const exhaust = air * (1 + fuelPerAir);                          // kg/s
  const recovered = (exhaust * EXHAUST_CP * Math.max(0, t4 - unit.stack)) / 1000;
  // the steam is raised across the whole fall of the gas, so its heat arrives at the log mean of it
  const tMean = t4 > unit.stack ? (t4 - unit.stack) / Math.log(t4 / unit.stack) : unit.stack;
  // the condenser is cooled by the day's air or water, so a hot day raises its pressure too
  const condenser = ambient + unit.condenserLift;
  const steamEff = unit.rankineQuality * Math.max(0, 1 - condenser / tMean);
  const steamShaft = recovered * steamEff;
  const rejected = recovered - steamShaft;                         // MW to the condenser and cooling

  const gross = (gasShaft + steamShaft) * unit.generatorEff;
  const net = gross * (1 - unit.auxiliary);
  return {
    ambient, airShare, air, fuel, pr,
    t: { inlet: t1, compressor: t2, firing: t3, exhaust: t4, stack: unit.stack, condenser },
    p: { inlet: 1.013, compressor: 1.013 * pr },
    mw: {
      fuel: fuelPower,
      gas: gasShaft * unit.generatorEff,
      steam: steamShaft * unit.generatorEff,
      gross, net,
      auxiliary: gross - net,
      stack: (exhaust * EXHAUST_CP * (unit.stack - ambient)) / 1000,
      condenser: rejected,
    },
    eff: {
      gas: (gasShaft * unit.generatorEff) / fuelPower,             // as an open-cycle gas turbine alone
      steam: steamEff,
      combined: net / fuelPower,
    },
    co2: CO2_PER_KWH_FUEL / (net / fuelPower),                     // kg per kWh sent out
  };
}

/** Full output at this ambient temperature: the guide vanes open and the flame at its limit. */
export const fullLoad = (ambient = C + 15, unit = UNIT) => cycle({ ambient, unit });

/**
 * The plant at `load` (a share of full net output at this ambient). A real unit
 * turns down in two steps, and so does this one: first the inlet guide vanes
 * close, cutting the air while the flame stays as hot (so the exhaust stays hot
 * and the steam side keeps its efficiency), then, with the vanes shut, the
 * flame is turned down. Below `minLoad` it cannot run within its limits.
 */
export function atLoad(load, ambient = C + 15, unit = UNIT) {
  const full = fullLoad(ambient, unit).mw.net;
  const want = Math.max(unit.minLoad, Math.min(1, load)) * full;
  // the one control, 0 → 1: the second half opens the vanes, the first half lights the flame
  const point = (c) => (c >= 0.5
    ? cycle({ ambient, unit, airShare: unit.igvMin + (1 - unit.igvMin) * (c - 0.5) / 0.5 })
    : cycle({ ambient, unit, airShare: unit.igvMin, firing: unit.firingMin + (unit.firing - unit.firingMin) * (c / 0.5) }));
  let lo = 0, hi = 1;
  for (let n = 0; n < 50; n++) { const m = (lo + hi) / 2; if (point(m).mw.net < want) lo = m; else hi = m; }
  return { ...point(hi), load: want / full };
}

/**
 * Carbon capture on the stack: an amine plant takes `share` of the CO2 out of
 * the exhaust, at the cost of steam drawn from the steam turbine to strip it
 * and power to compress it. `penalty` is the points of efficiency lost, about
 * 7 to 9 for 90 to 95 % capture on a modern CCGT.
 */
export function withCapture(point, { share = 0.95, penalty = 0.08 } = {}) {
  const eff = point.eff.combined - penalty;
  const net = eff * point.mw.fuel;
  return { ...point, captured: share, mw: { ...point.mw, net, capture: point.mw.net - net }, eff: { ...point.eff, combined: eff }, co2: (CO2_PER_KWH_FUEL / eff) * (1 - share) };
}
