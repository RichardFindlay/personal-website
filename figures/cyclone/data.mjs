// Writes data.json beside it: the coastline inside the post's ERA5 domain, from
// Natural Earth's 1:50m land polygons, and a 0.1° terrain grid from the AWS
// Terrain Tiles. Run once; the build reads data.json.
//   node data.mjs <path to ne_50m_land.geojson>
// (https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson)
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AREA } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) throw new Error("usage: node data.mjs <ne_50m_land.geojson>");

// Sutherland–Hodgman against the domain box, one edge at a time.
function clip(ring, { north, south, west, east }) {
  const edges = [
    [(p) => p[0] >= west, (a, b) => [west, a[1] + ((b[1] - a[1]) * (west - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= east, (a, b) => [east, a[1] + ((b[1] - a[1]) * (east - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= south, (a, b) => [a[0] + ((b[0] - a[0]) * (south - a[1])) / (b[1] - a[1]), south]],
    [(p) => p[1] <= north, (a, b) => [a[0] + ((b[0] - a[0]) * (north - a[1])) / (b[1] - a[1]), north]],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length], b = input[i];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

const area = (ring) => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const land = JSON.parse(readFileSync(source, "utf8"));
const coast = [];
for (const f of land.features) {
  const [w, s, e, n] = f.bbox;
  if (e < AREA.west || w > AREA.east || n < AREA.south || s > AREA.north) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = clip(poly[0].slice(0, -1), AREA);
    // islands under ~40 km² vanish at this scale, and the model is of the
    // islands, so the strip of France's coast the area's south edge cuts is left off
    const france = ring.some(([, lat]) => lat <= AREA.south + 1e-6);
    if (!france && ring.length >= 3 && Math.abs(area(ring)) * 111 * 63 > 40) coast.push(ring.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]));
  }
}

// Terrain every 0.1°: the mean of the zoom-5 Terrarium elevation tiles (about
// 0.04° a pixel) over each 0.1° cell, sea floored at 0.
const STEP = 0.1, ZOOM = 5, N = 2 ** ZOOM;
const lats = [], lons = [];
for (let lat = Math.ceil(AREA.south / STEP) * STEP; lat <= AREA.north + 1e-9; lat += STEP) lats.push(+lat.toFixed(2));
for (let lon = Math.ceil(AREA.west / STEP) * STEP; lon <= AREA.east + 1e-9; lon += STEP) lons.push(+lon.toFixed(2));
const tileX = (lon) => ((lon + 180) / 360) * N;
const tileY = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N; };
// A PNG decoder for 8-bit RGB or RGBA, the format Terrarium tiles use.
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = { 2: 3, 6: 4 }[data[9]]; if (data[8] !== 8 || !channels) throw new Error("png format"); }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= channels && y ? out[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      out[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { width, height, channels, pixels: out };
}
const tiles = new Map();
for (let tx = Math.floor(tileX(AREA.west)); tx <= Math.floor(tileX(AREA.east)); tx++) for (let ty = Math.floor(tileY(AREA.north)); ty <= Math.floor(tileY(AREA.south)); ty++) {
  const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`);
  if (!res.ok) throw new Error(`tile ${tx}/${ty} ${res.status}`);
  tiles.set(`${tx}/${ty}`, decodePng(Buffer.from(await res.arrayBuffer())));
}
const metresAt = (lon, lat) => {
  const fx = tileX(lon), fy = tileY(lat), t = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`);
  const px = Math.min(255, Math.floor((fx % 1) * 256)), py = Math.min(255, Math.floor((fy % 1) * 256)), o = (py * 256 + px) * t.channels;
  return t.pixels[o] * 256 + t.pixels[o + 1] + t.pixels[o + 2] / 256 - 32768;
};
const heights = [];
for (const lat of lats) for (const lon of lons) {
  let sum = 0, n = 0;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const la = lat + (a * STEP) / 5, lo = lon + (b * STEP) / 5;
    if (la > AREA.north || la < AREA.south || lo < AREA.west || lo > AREA.east) continue;
    sum += Math.max(0, metresAt(lo, la)); n++;
  }
  heights.push(Math.round(sum / n));
}

writeFileSync(join(HERE, "data.json"), JSON.stringify({
  source: { coast: "Natural Earth 1:50m land", terrain: "AWS Terrain Tiles (Terrarium, zoom 5), averaged over 0.1° cells" },
  coast,
  terrain: { lat0: lats[0], lon0: lons[0], step: STEP, rows: lats.length, cols: lons.length, metres: heights },
}));
console.log("coast rings", coast.length, "points", coast.reduce((s, r) => s + r.length, 0), "terrain", lats.length, "x", lons.length);
