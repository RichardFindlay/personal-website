/*
 * One NREL 5 MW turbine steered by the post's Q-learning agent, as a pure model
 * the build and the page share (the page inlines this file, exports stripped).
 *
 * The agent's actions are α·Δγ with α in {-1, 0, +1} and Δγ = 5°, the yaw rate
 * the post's quasi-dynamic run uses. The upstream turbine of its three-turbine
 * row settles at 25°, so the loop steps out to 25° one action at a time, holds
 * there, and steps back to 0°. Wind from 270° at 8 m/s; positive yaw turns the
 * rotor's face from west toward north.
 */
export const TURBINE = { D: 126, hub: 90, U: 8, tsr: 7.55, rpm: [6.9, 12.1] };
export const STEP_DEG = 5;
export const STEERED = 25;

// Seconds of the card's clock. A 5° slew takes the real machine about 17 s at
// its 0.3°/s yaw rate; the card plays each one in 1.2 s. The loop opens with a
// short lead so the first action starts as the card comes on screen, and rests
// hold + dwell at each end.
export const LOOP = { lead: 0.3, slew: 1.2, hold: 0.6, dwell: 1.2 };
const STEPS = STEERED / STEP_DEG;
const ACTIONS = [...Array(STEPS).fill(1), ...Array(STEPS).fill(-1)];
const PER_ACTION = LOOP.slew + LOOP.hold;
export const LOOP_SECONDS = 2 * LOOP.dwell + ACTIONS.length * PER_ACTION;
const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** The yaw in degrees at t seconds: a short lead at 0°, five +5° actions, a dwell at 25°, five -5° actions, a rest at 0° until the loop comes round. */
export function yawAt(t) {
  let s = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS - LOOP.lead, yaw = 0;
  ACTIONS.forEach((alpha, n) => {
    if (n === STEPS) s -= LOOP.dwell;
    yaw += alpha * STEP_DEG * smooth((s - n * PER_ACTION) / LOOP.slew);
  });
  return yaw;
}

/** The moment, in seconds from the loop's start, the agent reaches yaw on its way out. */
export const outboundAt = (yaw) => LOOP.lead + (yaw / STEP_DEG) * PER_ACTION - LOOP.hold;

/** Rotor speed in rpm: below rated the NREL 5 MW tracks a tip-speed ratio of 7.55 on the wind normal to its disc. */
export function rpmAt(yaw) {
  const U = TURBINE.U * Math.cos((yaw * Math.PI) / 180);
  const [lo, hi] = TURBINE.rpm;
  return Math.min(hi, Math.max(lo, ((TURBINE.tsr * U) / (TURBINE.D / 2)) * (30 / Math.PI)));
}
