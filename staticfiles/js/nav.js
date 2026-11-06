// The floating bar every page shares: the phone menu, the day-and-night switch where the page has one, and the words
// cut out of the glass where the page asks for it (data-etch). The bar's height is exported for layouts that sit under it.
const root = document.documentElement;
export const nav = document.querySelector('.nav');
const THEME_KEY = 'theme';

// Where the floating bar ends, from the top of the window: its height and the gap it floats in.
export const navBottom = () => nav.offsetHeight + parseFloat(getComputedStyle(nav).marginTop);

export function measureNav() {
  root.style.setProperty('--nav-h', `${navBottom()}px`);
}

// The name, and on a wide screen the links, are cut out of the bar's glass. A CSS mask cannot use the page's
// web font, so each word is drawn onto one canvas the size of the glass, in its font, at its exact size, spacing
// and place, and the glass layer is masked by it. Until that works the words stay ordinary text.
const brand = nav.querySelector('.nav-brand');
const linksRow = nav.querySelector('.nav-links');
const links = [...nav.querySelectorAll('.nav-link')];
export async function etchNav() {
  if (!nav.hasAttribute('data-etch')) return;
  await document.fonts.ready;
  if (!brand.textContent.trim()) return;
  // Folded into the phone menu, the links are a card of their own and stay as text.
  const linksInBar = getComputedStyle(linksRow).position !== 'absolute';
  const bar = nav.getBoundingClientRect();
  // The mask sits in the glass layer's own box, which starts inside the bar's border.
  const border = parseFloat(getComputedStyle(nav).borderLeftWidth);
  const ratio = Math.ceil(window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((bar.width - 2 * border) * ratio);
  canvas.height = Math.ceil((bar.height - 2 * border) * ratio);
  const context = canvas.getContext('2d');
  if (!context || !('letterSpacing' in context)) return;
  context.scale(ratio, ratio);
  for (const word of [brand, ...(linksInBar ? links : [])]) {
    const range = document.createRange();
    range.selectNodeContents(word);
    const box = range.getBoundingClientRect();
    const style = getComputedStyle(word);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.letterSpacing = style.letterSpacing;
    const metrics = context.measureText(word.textContent);
    context.fillText(word.textContent, box.left - bar.left - border, box.top - bar.top - border + metrics.fontBoundingBoxAscent + (box.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2);
  }
  nav.style.setProperty('--etch-mask', `url(${canvas.toDataURL()})`);
  nav.classList.add('is-etched');
  nav.classList.toggle('is-etched-links', linksInBar);
}

// The phone menu: opens under the bar, and closes on a link, a tap elsewhere or Escape.
const menuButton = nav.querySelector('.menu-btn');
function setMenu(open) {
  nav.toggleAttribute('data-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
}
menuButton.addEventListener('click', () => setMenu(!nav.hasAttribute('data-open')));
nav.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('click', (event) => { if (!nav.contains(event.target)) setMenu(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false); });

// Day and night, remembered between visits; the page's head applies the remembered choice before first paint.
const themeButton = nav.querySelector('.theme-btn');
if (themeButton) themeButton.addEventListener('click', () => {
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
});

window.addEventListener('resize', () => {
  measureNav();
  etchNav();
});
// Layout settles after this module has run.
window.addEventListener('load', measureNav);
measureNav();
etchNav();
