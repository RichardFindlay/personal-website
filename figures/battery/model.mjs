/*
 * One trading day of the post's 10 MW / 20 MWh battery, as its Double Dueling
 * DQN agent ran it: the hourly wholesale price, the power it chose (positive
 * discharges, negative charges) and the state of charge that follows. Pure, so
 * the build and the page (which inlines this file, exports stripped) agree.
 */
export const BATTERY = { mw: 10, mwh: 20, socMin: 0.2, socMax: 1 };

/** The day's hours from the post's CSV rows: `{ price, mw, soc }`, soc at the hour's start. */
export function dayOf(rows) {
  return rows.map(({ price, action, soc }) => ({ price, mw: action * BATTERY.mw, soc }));
}

/**
 * The battery at `t` hours into the day (0 to 24). Power is held for the whole
 * hour, so the state of charge runs in a straight line across it:
 * SoC(t + 1) = SoC(t) - P·1 h / E, the post's own record.
 */
export function stateAt(day, t) {
  const n = day.length;
  const at = ((t % n) + n) % n;
  const hour = Math.floor(at);
  const { price, mw, soc } = day[hour];
  const into = at - hour;
  return { t: at, hour, price, mw, soc: soc - (mw * into) / BATTERY.mwh };
}
