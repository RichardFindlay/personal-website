import { ease, mount } from './turbine.js';
import { navBottom } from './nav.js';

const SCROLL_GAIN = 1.15;
const HERO_OFFSET = 24;
const NARROW_HERO_OFFSET = 22;
const NARROW_WIDTH = 900;
const SCENE_BUILD_LIMIT_MS = 15000;
// The hero's view of the farm holds all the way down, the cards passing over it. `?explode` on the address brings back the
// scroll-driven tour instead: the turbine comes apart and the camera orbits it as the page scrolls.
const STILL_SCENE = !new URLSearchParams(window.location.search).has('explode');
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
const hero = document.querySelector('.hero');
const foot = document.querySelector('.stage-foot');

let renderTurbine = () => {};
let frameQueued = false;
let usingScene = false;

// The hero in page px at the top of the page: where the turbine's rotor may start, where the water must end, and the width to compose it to.
function heroFrame() {
  const bottom = hero.getBoundingClientRect().bottom + window.scrollY;
  return {
    top: navBottom() + 10,
    edge: Math.max(bottom, foot.getBoundingClientRect().top - 12),
    width: window.innerWidth,
  };
}

function update() {
  frameQueued = false;
  const y = window.scrollY;
  const max = root.scrollHeight - window.innerHeight;
  const p = !STILL_SCENE && max > 0 ? Math.min(1, Math.max(0, (y / max) * SCROLL_GAIN)) : 0;
  const rest = STILL_SCENE ? 1 : 1 - ease(y / (window.innerHeight * 0.7));
  // The static fallback drawing sits beside the hero text when wide and below it when narrow.
  const shift = window.innerWidth < NARROW_WIDTH
    ? `translateY(${(NARROW_HERO_OFFSET * rest).toFixed(2)}%)`
    : `translateX(${(HERO_OFFSET * rest).toFixed(2)}%)`;

  figure.style.transform = usingScene ? '' : shift;
  renderTurbine(p, rest, usingScene ? heroFrame() : null);
}

function schedule() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(update);
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
    // On a machine the scene already runs slowly on, the card drawings rest until the pointer is over them.
    return mountTurbine3D(figure, { signal: limit.signal, onLost: () => fallBack('WebGL context lost'), onSlow: () => root.classList.add('is-slow') });
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

window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule);
// Layout settles and the browser restores a reloaded scroll position after this module has run.
window.addEventListener('load', update);

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
  const frame = SCENE_FRAMES[scene.dataset.svg.split('/').slice(-2)[0]];
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
      // A still drawing, like donder's map, has no script to run.
      return scene.dataset.js && import(scene.dataset.js);
    })
    .then(() => requestAnimationFrame(() => scene.classList.add('in')))
    .catch(() => {});
});
