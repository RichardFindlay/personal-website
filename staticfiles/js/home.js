import { ease, mount } from './turbine.js';

const SCROLL_GAIN = 1.15;
const HERO_OFFSET = 24;
const NARROW_HERO_OFFSET = 22;
const NARROW_WIDTH = 900;
const THEME_KEY = 'theme';
const SCENE_BUILD_LIMIT_MS = 15000;
// The card drawings are 1400 x 200 strips. By drawing folder: the x each portrait card centres on, how far to drop the drawing down the card, in drawing units, and, for a drawing that fills its whole card, `fill`: the share of the card's height the strip itself takes. The view then reaches up over the strip's top edge into the drawing beyond it, at the same scale and position.
const SCENE_HEIGHT = 200;
const SCENE_FRAMES = {
  battery: { x: 1250, drop: 24 },
  cyclone: { x: 1270, drop: 0 },
  wake: { x: 1150, drop: 30, fill: 0.66 },
  ohmera: { x: 1150, drop: 0 },
};

const root = document.documentElement;
const figure = document.querySelector('.stage-figure');
const bar = document.querySelector('.stage-bar-fill');
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

// The arrows beside a card row step it one card along, and grey out at either end.
document.querySelectorAll('.panel').forEach((panel) => {
  const track = panel.querySelector('.cards');
  const buttons = panel.querySelectorAll('.track-btn');
  if (!track) return;
  const sync = () => {
    const end = track.scrollWidth - track.clientWidth - 1;
    buttons.forEach((button) => {
      button.disabled = Number(button.dataset.step) < 0 ? track.scrollLeft <= 1 : track.scrollLeft >= end;
    });
  };
  buttons.forEach((button) => button.addEventListener('click', () => {
    const step = track.firstElementChild.offsetWidth + parseFloat(getComputedStyle(track).columnGap);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: Number(button.dataset.step) * step, behavior: smooth ? 'smooth' : 'auto' });
  }));
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
});

// Each card scene: fetched once the page is up; its script animates the
// drawing while the card is on screen. The drawings are wide strips with the
// subject towards the right, so a portrait card frames each one on its subject.
document.querySelectorAll('.card-scene').forEach((scene) => {
  const frame = SCENE_FRAMES[scene.dataset.svg.split('/').at(-2)];
  fetch(scene.dataset.svg)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('scene ' + r.status))))
    .then((svg) => {
      scene.insertAdjacentHTML('beforeend', svg);
      if (frame) {
        const drawing = scene.querySelector('svg');
        const height = SCENE_HEIGHT / (frame.fill ?? 1);
        drawing.setAttribute('viewBox', `${frame.x - height} ${SCENE_HEIGHT - frame.drop - height} ${height * 2} ${height}`);
        drawing.setAttribute('preserveAspectRatio', 'xMidYMax slice');
      }
      return import(scene.dataset.js);
    })
    .then(() => requestAnimationFrame(() => scene.classList.add('in')))
    .catch(() => {});
});
