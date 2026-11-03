import { ease, mount } from './turbine.js';

const SCROLL_GAIN = 1.15;
const HERO_OFFSET = 24;
const NARROW_HERO_OFFSET = 22;
const NARROW_WIDTH = 900;
const THEME_KEY = 'theme';
const SCENE_BUILD_LIMIT_MS = 15000;

const root = document.documentElement;
const figure = document.querySelector('.stage-figure');
const bar = document.querySelector('.stage-bar-fill');
const steps = [...document.querySelectorAll('.step')].map((el) => ({ el, from: Number(el.dataset.from) }));
const nav = document.querySelector('.nav');
const hero = document.querySelector('.hero');
const foot = document.querySelector('.stage-foot');
const themeButton = document.querySelector('.theme-btn');

let renderTurbine = () => {};
let frameQueued = false;
let usingScene = false;

// The hero in page px at the top of the page: where the turbine's rotor may start, where the water must end, and the width to compose it to.
function heroFrame() {
  const bottom = hero.getBoundingClientRect().bottom + window.scrollY;
  return {
    top: nav.offsetHeight + 10,
    edge: Math.max(bottom, foot.getBoundingClientRect().top - 12),
    width: window.innerWidth,
  };
}

function update() {
  frameQueued = false;
  const y = window.scrollY;
  const max = root.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, (y / max) * SCROLL_GAIN)) : 0;
  const rest = 1 - ease(y / (window.innerHeight * 0.7));
  // The static fallback drawing sits beside the hero text when wide and below it when narrow.
  const shift = window.innerWidth < NARROW_WIDTH
    ? `translateY(${(NARROW_HERO_OFFSET * rest).toFixed(2)}%)`
    : `translateX(${(HERO_OFFSET * rest).toFixed(2)}%)`;

  figure.style.transform = usingScene ? '' : shift;
  bar.style.width = `${(p * 100).toFixed(1)}%`;

  const active = steps.filter((step) => p >= step.from).at(-1);
  for (const step of steps) step.el.classList.toggle('is-active', step === active);

  renderTurbine(p, rest, usingScene ? heroFrame() : null);
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
  usingScene = false;
  root.classList.remove('sea-ready');
  root.classList.add('no-sea');
  mountSvgFigure();
}

// Runs `expire` after `ms` of the page being visible: a background tab slows the build's timers, which is no reason to give up on it.
function visibleTimeout(ms, expire) {
  let left = ms;
  let started = 0;
  let timer = 0;
  const run = () => {
    started = performance.now();
    timer = setTimeout(expire, left);
  };
  const onVisibility = () => {
    if (!document.hidden) return run();
    clearTimeout(timer);
    left -= performance.now() - started;
  };
  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) run();
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

async function mountSceneFigure() {
  const limit = new AbortController();
  const stopLimit = visibleTimeout(SCENE_BUILD_LIMIT_MS, () => limit.abort());
  const timedOut = new Promise((_, reject) => {
    limit.signal.addEventListener('abort', () => reject(new Error('the 3D scene took too long')));
  });
  const load = async () => {
    const { mountTurbine3D } = await import('./turbine3d/scene.js');
    return mountTurbine3D(figure, { signal: limit.signal, onLost: () => fallBack('WebGL context lost') });
  };
  try {
    renderTurbine = await Promise.race([load(), timedOut]);
    usingScene = true;
    root.classList.add('sea-ready');
    update();
  } catch (error) {
    limit.abort();
    fallBack(error.message);
  } finally {
    stopLimit();
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
