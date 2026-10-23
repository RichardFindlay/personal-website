/*
 * The post's wind farm and its wake steering, as a pure model the build and the
 * page share (the page inlines this file with its exports stripped).
 *
 * The farm is the post's FLORIS case: three NREL 5 MW turbines (126 m rotor, 90 m
 * hub) in one row 8 D apart, wind from 270° at 8 m/s. The wakes follow FLORIS's
 * Gaussian model (Bastankhah and Porté-Agel 2016, as FLORIS v2's "gauss" velocity
 * and deflection models write it, with its default constants), summed by squares.
 * Each turbine's own wake recovers at the turbulence it stands in: the ambient
 * 6% plus what the wake just upstream adds (Crespo and Hernández, FLORIS's
 * defaults), taken over the whole rotor.
 *
 * World axes: x downwind (east), y north, z up, metres; turbine 0 at the origin.
 * Positive yaw turns a rotor's face toward +y and pushes its wake toward -y, as
 * in the post's figure.
 */
export const FARM = { D: 126, hub: 90, U: 8, spacing: 8, Ct: 0.763, TI: 0.06, rho: 1.225, Cp: 0.432, pP: 1.88 };
export const SITES = [0, 1, 2].map((i) => [i * FARM.spacing * FARM.D, 0]);
const GAUSS = { ka: 0.38, kb: 0.004, alpha: 0.58, beta: 0.077 };
const induction = (1 - Math.sqrt(1 - FARM.Ct)) / 2;
const added = (dx) => 0.73 * induction ** 0.8 * FARM.TI ** 0.1 * (dx / FARM.D) ** -0.275;
export const TURBULENCE = SITES.map((_, i) => (i ? Math.hypot(FARM.TI, added(FARM.spacing * FARM.D)) : FARM.TI));

// ── The agents' episode ─────────────────────────────────────────────────────
// The trained policy run greedily with Δγ = 5°, as the post's figure 3 plays it:
// the two upstream agents take turns at one +5° step about every 340 timesteps
// (100 to settle plus the frozen wake's 2016 m / 8 m/s) until they hold 25° and
// 20°; the last turbine stays at 0°. One timestep is one second of wind.
export const STEP_DEG = 5;
export const ACTIONS = [[0, 100], [1, 440], [0, 780], [1, 1120], [0, 1460], [1, 1800], [0, 2140], [1, 2480], [0, 2820]];
export const EPISODE = { hold: 520, reset: 560, slew: 30 }; // timesteps
export const LOOP_STEPS = ACTIONS[ACTIONS.length - 1][1] + EPISODE.hold + EPISODE.reset;
const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** Turbine i's yaw in degrees at timestep s of the loop: steps up, holds, then the episode resets. */
export function yawAt(i, s) {
  const S = ((s % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  let yaw = 0;
  for (const [who, at] of ACTIONS) if (who === i) yaw += STEP_DEG * smooth((S - at) / EPISODE.slew);
  const resetAt = LOOP_STEPS - EPISODE.reset;
  return yaw * (1 - smooth((S - resetAt) / (EPISODE.reset * 0.5)));
}

// ── One wake ────────────────────────────────────────────────────────────────
const RAD = Math.PI / 180;

/** The wake of a rotor yawed yaw degrees, dx metres downstream of it: deflection δ (toward -y), widths, centre deficit. */
export function wakeAt(dx, yaw, TI = FARM.TI) {
  const { D, Ct } = FARM, { ka, kb, alpha, beta } = GAUSS;
  const cg = Math.cos(yaw * RAD);
  const uR = (Ct * cg) / (2 * (1 - Math.sqrt(1 - Ct * cg)));
  const u0 = Math.sqrt(1 - Ct);
  const x0 = (D * cg * (1 + Math.sqrt(1 - Ct * cg))) / (Math.SQRT2 * (4 * alpha * TI + 2 * beta * (1 - Math.sqrt(1 - Ct))));
  const k = ka * TI + kb;
  const sz0 = D * 0.5 * Math.sqrt(uR / (1 + u0)), sy0 = sz0 * cg;
  const theta = ((0.3 * yaw * RAD) / cg) * (1 - Math.sqrt(1 - Ct * cg));
  const delta0 = Math.tan(theta) * x0;
  let sy, sz, delta;
  if (dx < x0) {
    // the near wake narrows from the rotor's core to the far wake's start
    const f = Math.max(0, dx) / x0, s0 = 0.501 * D * Math.sqrt(Ct / 2);
    sy = (1 - f) * s0 + f * sy0;
    sz = (1 - f) * s0 + f * sz0;
    delta = f * delta0;
  } else {
    sy = k * (dx - x0) + sy0;
    sz = k * (dx - x0) + sz0;
    const C0 = 1 - u0, M0 = C0 * (2 - C0), E0 = C0 * C0 - 3 * Math.exp(1 / 12) * C0 + 3 * Math.exp(1 / 3);
    const r = Math.sqrt((sy * sz) / (sy0 * sz0)), m = Math.sqrt(M0);
    delta = delta0 + ((theta * E0) / 5.2) * Math.sqrt((sy0 * sz0) / (k * k * M0)) * Math.log(((1.6 + m) * (1.6 * r - m)) / ((1.6 - m) * (1.6 * r + m)));
  }
  const C = 1 - Math.sqrt(Math.max(0, 1 - (Ct * cg) / ((8 * sy * sz) / (D * D))));
  return { delta, sy, sz, C };
}

/** Half-width of the wake's hub-height contour at deficit level (0 where the wake is weaker than level). */
export function halfWidth(w, level) {
  return w.C > level ? w.sy * Math.sqrt(2 * Math.log(w.C / level)) : 0;
}

// ── The frozen wake: what each wake looks like at one moment ────────────────
// Taylor's hypothesis, as in the post's quasi-dynamic environment: a change of
// yaw travels downstream unchanged at the free-stream speed, so the wake dx
// metres down is the one the rotor shed dx / U timesteps ago.
export const yawSeen = (i, dx, s) => yawAt(i, s - Math.max(0, dx) / FARM.U);

/** The fraction of free-stream speed left at a point at hub-height offset dz, summed by squares over upstream wakes. */
export function speedAt(x, y, dz, s) {
  let sum = 0;
  SITES.forEach(([tx, ty], i) => {
    const dx = x - tx;
    if (dx <= 1) return;
    const w = wakeAt(dx, yawSeen(i, dx, s), TURBULENCE[i]);
    const d = w.C * Math.exp(-0.5 * ((y - ty + w.delta) / w.sy) ** 2 - 0.5 * (dz / w.sz) ** 2);
    sum += d * d;
  });
  return 1 - Math.sqrt(sum);
}

/** Rotor-averaged inflow of turbine i as a fraction of U, over a 5 × 5 grid on its disc. */
export function inflowOf(i, s) {
  const [x, y] = SITES[i], R = FARM.D / 2, g = Array.from({ length: 5 }, (_, n) => (n - 2) / 2.5);
  let sum = 0, n = 0;
  for (const a of g) for (const b of g) {
    const u = a * R, v = b * R;
    if (u * u + v * v > R * R) continue;
    sum += speedAt(x, y + u, v, s); n++;
  }
  return sum / n;
}

/** Turbine i's rotor speed in rpm: the NREL 5 MW tracks a tip-speed ratio of 7.55 below rated, between 6.9 and 12.1 rpm. */
export function rpmOf(i, s) {
  const U = FARM.U * inflowOf(i, s) * Math.cos(yawAt(i, s) * RAD);
  return Math.min(12.1, Math.max(6.9, ((7.55 * U) / (FARM.D / 2)) * (30 / Math.PI)));
}

/** Turbine i's power in MW, with FLORIS's cos^1.88 yaw loss. */
export function powerOf(i, s) {
  const { rho, D, Cp, pP } = FARM, U = FARM.U * inflowOf(i, s);
  return (0.5 * rho * Math.PI * (D / 2) ** 2 * Cp * U ** 3 * Math.cos(yawAt(i, s) * RAD) ** pP) / 1e6;
}

// ── A wake in plan, laid on the sea ─────────────────────────────────────────
// Downstream stations, closer together near the rotor where the wake turns.
export const STATIONS = Array.from({ length: 48 }, (_, n) => 3000 * (n / 47) ** 1.5);
// Behind the rotor the wake leaves the swept disc, so the drawn plume starts at
// the rotor's width and opens until the model's own contour is the narrower.
const opening = (dx, yaw) => (FARM.D / 2) * Math.cos(yaw * RAD) * Math.sqrt(0.15 + dx / (0.5 * FARM.D));

/** Turbine i's wake at timestep s: per station, its centre y and the half-width at each level (0 past where it fades). */
export function wakePlan(i, s, levels) {
  const [tx, ty] = SITES[i];
  return STATIONS.map((dx) => {
    const yaw = yawSeen(i, dx, s), w = wakeAt(dx, yaw, TURBULENCE[i]), cap = opening(dx, yaw);
    return { x: tx + dx, y: ty - w.delta, sy: w.sy, C: w.C, widths: levels.map((l) => Math.min(halfWidth(w, l), cap)) };
  });
}
