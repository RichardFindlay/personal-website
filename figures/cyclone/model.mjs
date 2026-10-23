// The weather the thumbnail shows, as one pure module that the build and the
// page (which inlines this file with its exports stripped) both read.
//
// The post's ERA5 input: the area its downloader requests from the CDS
// (scripts/preprocessing/ERA5_downloader.py: 'area': [61.19, -11.95, 49.78, 1.76])
// on ERA5's 0.25° grid, hourly fields interpolated to half-hour periods (HH) by
// averaging the hours either side (preprocessing_funcs.interpolate_4d). The
// decoder forecasts the next 48 HH, so one loop of the strip is one forecast day.
export const AREA = { north: 61.19, west: -11.95, south: 49.78, east: 1.76 };
export const CELL = 0.25;
export const COLS = Math.ceil((AREA.east - AREA.west) / CELL - 1e-9);   // 55
export const ROWS = Math.ceil((AREA.north - AREA.south) / CELL - 1e-9); // 46
export const STEPS = 48;
export const HOURS = STEPS / 2;

// Equidistant cylindrical, true to scale on the domain's middle parallel, so the
// lat/lon grid stays a grid. Kilometres east and north of the domain's centre.
export const LAT0 = (AREA.north + AREA.south) / 2;
export const LON0 = (AREA.west + AREA.east) / 2;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180), KY = 111.13;
export const km = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];

// Cell (i down from the north edge, j east from the west edge): its bounds,
// cut at the area's edges, and the point it is sampled at, its centre.
export function cellOf(i, j) {
  const west = AREA.west + j * CELL, east = Math.min(AREA.east, west + CELL);
  const north = AREA.north - i * CELL, south = Math.max(AREA.south, north - CELL);
  return { west, east, north, south, lon: (west + east) / 2, lat: (north + south) / 2 };
}

// ── The depressions ─────────────────────────────────────────────────────────
// A family of Atlantic lows on one track from the south-west, each a day behind
// the last, moving at 55 km/h (a mobile winter depression), so one crosses the
// domain each forecast day and the loop closes on the next. Each turns
// anticlockwise (northern hemisphere) as it goes, 8° an hour, and deepens out
// of the Atlantic and fills beyond the North Sea.
export const SPEED = 55;
export const SPACING = SPEED * HOURS;                 // 1320 km between lows
const BEARING = (58 * Math.PI) / 180;                 // heading east-north-east
export const HEADING = [Math.sin(BEARING), Math.cos(BEARING)];
export const SPIN = (8 * Math.PI) / 180;              // rad an hour, anticlockwise
// where the low of the loop's first step stands: off the west of Ireland
export const ORIGIN = km(-11.5, 54.2);
export const ARMS = [
  // phase (rad), inner and outer reach (km), half-width (km), strength
  { phase: 0, from: 60, to: 840, width: 95, strength: 0.95 },
  { phase: (2 * Math.PI) / 3 + 0.25, from: 90, to: 620, width: 72, strength: 0.8 },
  { phase: (4 * Math.PI) / 3 + 0.1, from: 120, to: 450, width: 56, strength: 0.62 },
];
export const PITCH = 2.3;                             // cot of the arms' pitch angle
export const R0 = 250;                                // radius where an arm sits at its phase
export const CORE = { radius: 170, slot: 38 };        // the dense head and its clear centre

// Each low's place along the track is s km past ORIGIN: lows sit at
// s = SPEED·h + k·SPACING. Its strength ramps up out of the Atlantic and down
// past the North Sea, both off the plinth, so none appears or vanishes in view.
const LIFE = { born: -3200, grown: -1700, fading: 900, gone: 1700 };
const ramp = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function lowsAt(hours) {
  const out = [];
  const base = ((SPEED * hours) % SPACING + SPACING) % SPACING;
  for (let k = -3; k <= 2; k++) {
    const s = base + k * SPACING;
    const life = ramp(LIFE.born, LIFE.grown, s) * (1 - ramp(LIFE.fading, LIFE.gone, s));
    if (life <= 0) continue;
    // a young low is a smaller spiral; it reaches full size a day before landfall
    const size = 0.6 + 0.4 * ramp(LIFE.born, LIFE.grown + 600, s);
    out.push({ key: k, s, life, size, at: [ORIGIN[0] + HEADING[0] * s, ORIGIN[1] + HEADING[1] * s], spin: (SPIN * s) / SPEED });
  }
  return out;
}

// An arm's centreline: the trailing log spiral φ = phase + spin − PITCH·ln(r/R0),
// so going outward along it turns clockwise and the arms trail an anticlockwise
// turn. Its half-width tapers to nothing at both ends.
export const armAngle = (arm, r, spin) => arm.phase + spin - PITCH * Math.log(r / R0);
export function armWidth(arm, r) {
  const u = (r - arm.from) / (arm.to - arm.from);
  if (u <= 0 || u >= 1) return 0;
  return arm.width * Math.sin(Math.PI * Math.pow(u, 0.7)) ** 0.8;
}

// Cloud cover in [0, 1] at a point (km) for one low: the arms' bands, Gaussian
// across, plus the dense head round a clearer centre.
export function lowCover(low, x, y) {
  const dx = (x - low.at[0]) / low.size, dy = (y - low.at[1]) / low.size, r = Math.hypot(dx, dy);
  if (r > 1100) return 0;
  const phi = Math.atan2(dy, dx);
  let clear = 1;
  for (const arm of ARMS) {
    const w = armWidth(arm, r);
    if (!w) continue;
    let d = phi - armAngle(arm, r, low.spin);
    d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const across = (Math.abs(d) * r) / Math.sqrt(1 + PITCH * PITCH);
    clear *= 1 - arm.strength * Math.exp(-((across / w) ** 2));
  }
  const head = Math.exp(-((r / CORE.radius) ** 2)) * (1 - Math.exp(-((r / CORE.slot) ** 2)));
  clear *= 1 - 0.9 * head;
  return low.life * (1 - clear);
}
export function cover(lows, x, y) {
  let clear = 1;
  for (const low of lows) clear *= 1 - lowCover(low, x, y);
  return 1 - clear;
}

// The field the model reads at HH step n: on the hour, ERA5's own field; on a
// half hour, the mean of the hours either side, as the post's preprocessing does.
export function fieldAt(step) {
  const hour = Math.floor(step / 2), out = new Float32Array(ROWS * COLS);
  const sample = (h, w) => {
    const lows = lowsAt(h);
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
      const c = cellOf(i, j), [x, y] = km(c.lon, c.lat);
      out[i * COLS + j] += w * cover(lows, x, y);
    }
  };
  if (step % 2 === 0) sample(hour, 1);
  else { sample(hour, 0.5); sample(hour + 1, 0.5); }
  return out;
}
