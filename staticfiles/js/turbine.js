const C = 0.8660254037844387, S = 0.5;
const project = (v) => [(v[0] - v[1]) * C, (v[0] + v[1]) * S - v[2]];

const clamp = (x) => Math.min(1, Math.max(0, x));
export const ease = (x) => { const c = clamp(x); return c * c * (3 - 2 * c); };

const EX = {"conv":[-6,0,0],"gen":[-3.5,0,0],"brake":[-1.6,0,0],"gear":[0,0,0],"shaft":[1.5,0,0],"bearing":[4.5,0,0],"hub":[9,0,0],"spin":[13,0,0],"cover":[0,0,10],"cool":[0,0,15],"yaw":[0,0,-4],"bed":[0,0,0]};
const CH = {"conv":"d","gen":"d","brake":"d","gear":"d","shaft":"d","bearing":"d","hub":"d","spin":"d","cover":"c","cool":"c","yaw":"y","bed":"d"};
const CAM = {"s0":5.36,"s1":16.555,"f0":[1.93,35.11],"f1":[2.6,-6.72]};
const CALL = [["spin","spin",[9.2,-1,4.2]],["hub","hub",[6.45,1.45,1.55]],["bearing","bearing",[2.7,-1,4]],["shaft","shaft",[3.6,0.53,2.4699999999999998]],["gear","gear",[-0.6,1.4,1.6]],["brake","brake",[-2.68,0.95,2.05]],["gen","gen",[-4.6,1.27,1.73]],["conv","conv",[-7.15,1.5,1.6]],["cover","cover",[-5,2.55,4.6]],["cool","cool",[-6.4,0,6.9]],["bed","bed",[1,1.7,0.75]],["yaw","yaw",[0.6,1.9,0]]];

export function stateAt(progress) {
  const p = clamp(progress);
  const ch = { z: ease(p / 0.38), b: ease((p - 0.03) / 0.3), c: ease((p - 0.3) / 0.22), y: ease((p - 0.36) / 0.2), d: ease((p - 0.46) / 0.32) };

  const off = {};
  const parts = { base: 'translate(0 0)' };
  for (const k in EX) {
    const e = ch[CH[k]];
    off[k] = [EX[k][0] * e, EX[k][1] * e, EX[k][2] * e];
    const q = project(off[k]);
    parts[k] = 'translate(' + q[0].toFixed(3) + ' ' + q[1].toFixed(3) + ')';
  }

  const z = ch.z;
  const s = Math.exp(Math.log(CAM.s0) + (Math.log(CAM.s1) - Math.log(CAM.s0)) * z);
  const fx = CAM.f0[0] + (CAM.f1[0] - CAM.f0[0]) * z;
  const fy = CAM.f0[1] + (CAM.f1[1] - CAM.f0[1]) * z;

  const callouts = {};
  CALL.forEach(([id, part, a], i) => {
    const o = off[part];
    const q = project([a[0] + o[0], a[1] + o[1], a[2] + o[2]]);
    const x = 400 + s * (q[0] - fx), y = 500 + s * (q[1] - fy);
    callouts[id] = { t: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')', o: ease((p - 0.74 - i * 0.012) / 0.1).toFixed(3) };
  });

  return {
    cam: 'translate(400 500) scale(' + s.toFixed(4) + ') translate(' + (-fx).toFixed(3) + ' ' + (-fy).toFixed(3) + ')',
    parts,
    callouts,
    bladeR: 'translate(0 ' + (ch.b * 70).toFixed(2) + ')',
    bladeOp: (1 - ease((ch.b - 0.55) / 0.45)).toFixed(3),
    baseOp: (1 - ease((p - 0.2) / 0.25) * 0.85).toFixed(3),
  };
}

export function mount(svg) {
  const cam = svg.querySelector('[data-cam]');
  const parts = [...svg.querySelectorAll('[data-part]')];
  const callouts = [...svg.querySelectorAll('[data-callout]')];
  const blades = [...svg.querySelectorAll('[data-blade]')];
  const bladeFade = svg.querySelector('[data-fade="blade"]');
  const baseFade = svg.querySelector('[data-fade="base"]');

  return (p) => {
    const state = stateAt(p);
    cam.setAttribute('transform', state.cam);
    for (const el of parts) el.setAttribute('transform', state.parts[el.dataset.part]);
    for (const el of callouts) {
      const { t, o } = state.callouts[el.dataset.callout];
      el.setAttribute('transform', t);
      el.setAttribute('opacity', o);
    }
    for (const el of blades) el.setAttribute('transform', state.bladeR);
    bladeFade.setAttribute('opacity', state.bladeOp);
    baseFade.setAttribute('opacity', state.baseOp);
  };
}
