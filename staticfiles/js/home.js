import { ease, mount } from './turbine.js';

const SCROLL_GAIN = 1.15;
const HERO_OFFSET = 24;
const NARROW_HERO_OFFSET = 22;
const NARROW_WIDTH = 900;
const THEME_KEY = 'theme';
const SCENE_BUILD_LIMIT_MS = 15000;

const root = document.documentElement;
const figure = document.querySelector('.stage-figure');
const readout = document.querySelector('.stage-readout');
const bar = document.querySelector('.stage-bar-fill');
const steps = [...document.querySelectorAll('.step')].map((el) => ({ el, from: Number(el.dataset.from) }));
const nav = document.querySelector('.nav');
const themeButton = document.querySelector('.theme-btn');

let renderTurbine = () => {};
let frameQueued = false;

function update() {
  frameQueued = false;
  const y = window.scrollY;
  const max = root.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, (y / max) * SCROLL_GAIN)) : 0;
  const rest = 1 - ease(y / (window.innerHeight * 0.7));
  // The hero text sits beside the turbine when wide and above it when narrow.
  const shift = window.innerWidth < NARROW_WIDTH
    ? `translateY(${(NARROW_HERO_OFFSET * rest).toFixed(2)}%)`
    : `translateX(${(HERO_OFFSET * rest).toFixed(2)}%)`;

  figure.style.transform = shift;
  bar.style.width = `${(p * 100).toFixed(1)}%`;
  readout.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;

  const active = steps.filter((step) => p >= step.from).at(-1);
  for (const step of steps) step.el.classList.toggle('is-active', step === active);

  renderTurbine(p);
}

function schedule() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(update);
}

function measureNav() {
  root.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
}

async function mountSvgFigure() {
  let markup;
  try {
    const response = await fetch(figure.dataset.svg);
    if (!response.ok) return;
    markup = await response.text();
  } catch {
    return;
  }
  figure.insertAdjacentHTML('beforeend', markup);
  const svg = figure.querySelector('svg');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) svg.pauseAnimations();
  renderTurbine = mount(svg);
  update();
}

function hasCapableWebGL() {
  const context = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  return Boolean(context);
}

function fallBack(reason) {
  console.warn(`Showing the static turbine drawing: ${reason}`);
  renderTurbine = () => {};
  mountSvgFigure();
}

async function mountSceneFigure() {
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(), SCENE_BUILD_LIMIT_MS);
  const timedOut = new Promise((_, reject) => {
    limit.signal.addEventListener('abort', () => reject(new Error('the 3D scene took too long')));
  });
  const load = async () => {
    const { mountTurbine3D } = await import('./turbine3d/scene.js');
    return mountTurbine3D(figure, { signal: limit.signal, onLost: () => fallBack('WebGL context lost') });
  };
  try {
    renderTurbine = await Promise.race([load(), timedOut]);
    update();
  } catch (error) {
    limit.abort();
    fallBack(error.message);
  } finally {
    clearTimeout(timer);
  }
}

function mountFigure() {
  if (hasCapableWebGL()) mountSceneFigure();
  else fallBack('no capable WebGL2');
}

function readTheme() {
  return root.dataset.theme === 'dark' ? 'dark' : 'light';
}

themeButton.addEventListener('click', () => {
  const theme = readTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
});

window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', () => {
  measureNav();
  schedule();
});
// Layout settles and the browser restores a reloaded scroll position after this module has run.
window.addEventListener('load', () => {
  measureNav();
  update();
});

measureNav();
update();
mountFigure();

// Each card scene: fetched once the page is up; its script animates the
// drawing while the card is on screen.
document.querySelectorAll('.card-scene').forEach((scene) => {
  fetch(scene.dataset.svg)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('scene ' + r.status))))
    .then((svg) => { scene.insertAdjacentHTML('beforeend', svg); return import(scene.dataset.js); })
    .then(() => requestAnimationFrame(() => scene.classList.add('in')))
    .catch(() => {});
});
