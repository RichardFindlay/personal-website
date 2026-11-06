import { PUBLISHED } from "../published.js";
import { ASSUMED } from "../assumed.js";

const GRAVITY = 9.81;

function wavenumber(omega, depth) {
  let k = (omega * omega) / GRAVITY;
  for (let i = 0; i < 24; i++) k = (omega * omega) / (GRAVITY * Math.tanh(k * depth));
  return k;
}

// Linear waves in the deck's 20 m of water, scaled so the sampled spectrum has the deck's significant height: Hs = 4 sqrt(sum(a^2) / 2).
export const WAVES = (() => {
  const depth = -PUBLISHED.seabed;
  const energy = ASSUMED.waves.reduce((sum, wave) => sum + wave.weight * wave.weight, 0);
  const scale = PUBLISHED.waveHs / (4 * Math.sqrt(energy / 2));
  return ASSUMED.waves.map(({ period, weight, heading }) => {
    const omega = (2 * Math.PI) / period;
    const k = wavenumber(omega, depth);
    const a = (heading * Math.PI) / 180;
    return { kx: k * Math.cos(a), ky: k * Math.sin(a), omega, amplitude: weight * scale };
  });
})();
