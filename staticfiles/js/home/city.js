// The homepage's future city: a coastal city of glass towers and the power that
// runs it, drawn live with three.js and flown through as the page scrolls.
// Offshore wind in the bay, a tidal barrage, a fusion plant, hydrogen and
// battery storage, a solar farm and a geothermal plant, all wired into the city
// with traffic, air taxis and a low golden sun. Everything is made here in code,
// so nothing is downloaded but this file and three.js.
//
// One unit is a metre: x east, z south, y up. The coast runs north–south a
// little east of the centre, with the sea beyond it.
//
//   mountCity(stage, { still, quality })   → { setProgress, scrollDriven, ... }
//   setProgress(p, now)  the camera's place on its path, 0 to 1; `now` jumps there
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ── Small helpers ───────────────────────────────────────────────────────────
const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
function hash(x, y) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, o = 5) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * noise(x, y); n += a; x *= 2.03; y *= 2.03; a *= 0.5; } return s / n; };

// non-indexed, with only position, normal and uv, so any can be merged with any
function prep(g) {
    const out = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(name)) out.deleteAttribute(name);
    if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((out.attributes.position.count) * 2), 2));
    return out;
}

// A list of triangles with normals and uvs, each turned to face `out`
class Mesher {
    constructor() { this.p = []; this.n = []; this.u = []; }
    tri(a, b, c, ua, ub, uc, out, na, nb, nc) {
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (cr[0] * out[0] + cr[1] * out[1] + cr[2] * out[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; [nb, nc] = [nc, nb]; cr = cr.map((v) => -v); }
        const l = Math.hypot(...cr) || 1, fn = cr.map((v) => v / l);
        this.p.push(...a, ...b, ...c); this.u.push(...ua, ...ub, ...uc);
        this.n.push(...(na || fn), ...(nb || fn), ...(nc || fn));
    }
    quad(a, b, c, d, ua, ub, uc, ud, out, ns) {
        this.tri(a, b, c, ua, ub, uc, out, ns && ns[0], ns && ns[1], ns && ns[2]);
        this.tri(a, c, d, ua, uc, ud, out, ns && ns[0], ns && ns[2], ns && ns[3]);
    }
    get empty() { return this.p.length === 0; }
    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
        return g;
    }
}

// Walls round a footprint from y0 to y1 (uv in metres: along the wall, and the
// height above ground), optionally twisting or tapering, and a flat roof on top.
function prism(walls, roof, poly, y0, y1, { twist = 0, top = 1, segs = 1, smooth = false, twist0 = 0 } = {}) {
    const n = poly.length, per = [0];
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; per.push(per[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const at = (i, s) => {
        const [x, z] = poly[i % n], ang = twist0 + twist * s, k = 1 + (top - 1) * s, c = Math.cos(ang), sn = Math.sin(ang);
        return [(x * c - z * sn) * k, y0 + (y1 - y0) * s, (x * sn + z * c) * k];
    };
    const radial = (p) => { const l = Math.hypot(p[0], p[2]) || 1; return [p[0] / l, 0, p[2] / l]; };
    for (let j = 0; j < segs; j++) {
        const s0 = j / segs, s1 = (j + 1) / segs;
        for (let i = 0; i < n; i++) {
            const a = at(i, s0), b = at(i + 1, s0), c = at(i + 1, s1), d = at(i, s1);
            const out = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
            walls.quad(a, b, c, d, [per[i], a[1]], [per[i + 1], b[1]], [per[i + 1], c[1]], [per[i], d[1]], out, smooth ? [radial(a), radial(b), radial(c), radial(d)] : null);
        }
    }
    if (!roof) return;
    const ring = Array.from({ length: n }, (_, i) => at(i, 1)), cx = ring.reduce((s, p) => s + p[0], 0) / n, cz = ring.reduce((s, p) => s + p[2], 0) / n;
    for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n], c = [cx, y1, cz];
        roof.tri(a, b, c, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    }
}
const rect = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const chamfer = (w, d, c) => [[-w / 2 + c, -d / 2], [w / 2 - c, -d / 2], [w / 2, -d / 2 + c], [w / 2, d / 2 - c], [w / 2 - c, d / 2], [-w / 2 + c, d / 2], [-w / 2, d / 2 - c], [-w / 2, -d / 2 + c]];
const circle = (r, n = 28) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

// ── The plan ────────────────────────────────────────────────────────────────
const GROUND = 2;                                   // the land's surface; the sea is at 0
const P = 110, ROAD = 22;                           // the street grid's pitch and road width
const I0 = -14, I1 = 6, J0 = -12, J1 = 12;          // lots, by index; a lot's centre is (i, j) × P
const coastX = (z) => 760 + 70 * Math.sin(z / 340) + 40 * Math.sin(z / 130 + 1);
const CORE = [-150, -40];                           // the centre of downtown
const ZONES = {
    fusion: { i: [-14, -11], j: [-12, -9] },
    hydrogen: { i: [-12, -11], j: [4, 7] },
    battery: { i: [-10, -9], j: [4, 7] },
    solar: { i: [-6, 2], j: [9, 12] },
    geothermal: { i: [4, 5], j: [7, 9] },
    park: { i: [-3, -2], j: [2, 3] },
};
const zoneOf = (i, j) => Object.keys(ZONES).find((k) => i >= ZONES[k].i[0] && i <= ZONES[k].i[1] && j >= ZONES[k].j[0] && j <= ZONES[k].j[1]);
const zoneCentre = (k) => [((ZONES[k].i[0] + ZONES[k].i[1]) / 2) * P, ((ZONES[k].j[0] + ZONES[k].j[1]) / 2) * P];
const zoneSize = (k) => [(ZONES[k].i[1] - ZONES[k].i[0] + 1) * P - ROAD, (ZONES[k].j[1] - ZONES[k].j[0] + 1) * P - ROAD];
const onLand = (x, z, margin = 0) => x < coastX(z) - margin;
const lotUsed = (i, j) => i >= I0 && i <= I1 && j >= J0 && j <= J1 && onLand(i * P, j * P, P * 0.75);

// The camera's flight: where it is and what it looks at, through each place
const FLIGHT = [
    [[2700, 520, 1500], [-150, 160, -80]],          // out at sea: the wind farm, the skyline beyond
    [[1650, 260, 380], [900, 120, -160]],           // low over the turbines
    [[1200, 80, -260], [880, 20, -700]],            // the tidal barrage
    [[760, 120, -120], [0, 170, -60]],              // making for the skyline
    [[330, 58, 55], [-300, 80, 55]],                // into the canyon, down a street
    [[-330, 110, 55], [-700, 220, -320]],           // out under the tallest towers
    [[-760, 330, -380], [-1375, 40, -1155]],        // rising over the crowns, the fusion plant ahead
    [[-1060, 170, -820], [-1375, 30, -1155]],       // round the fusion plant
    [[-1500, 190, -60], [-1155, 20, 605]],          // turning south to the hydrogen and the batteries
    [[-840, 120, 420], [-1155, 10, 640]],
    [[-480, 150, 860], [-165, 0, 1155]],            // the solar farm
    [[150, 150, 980], [440, 30, 990]],              // the geothermal plant by the shore
    [[1100, 760, 2100], [-200, 100, -150]],         // and up and away, the whole city
];

// ── Textures, painted on canvases ───────────────────────────────────────────
const FACADES = {
    blue: { frame: '#8e9aa5', top: '#86a9c9', bottom: '#223b57', metal: 0.9, bay: 3.0, floor: 4.0, mull: 0.05, band: 0.14, lit: 0.05 },
    dark: { frame: '#30353b', top: '#56687a', bottom: '#111820', metal: 0.92, bay: 3.2, floor: 4.0, mull: 0.06, band: 0.12, lit: 0.06 },
    bronze: { frame: '#5e4e3d', top: '#c4a47c', bottom: '#3d2e21', metal: 0.9, bay: 3.0, floor: 4.2, mull: 0.05, band: 0.15, lit: 0.05 },
    silver: { frame: '#d3d8dc', top: '#b6cde0', bottom: '#46627c', metal: 0.85, bay: 2.8, floor: 4.0, mull: 0.08, band: 0.18, lit: 0.05 },
    white: { frame: '#eceeee', top: '#9db3c6', bottom: '#2c3f51', metal: 0.3, bay: 3.6, floor: 3.6, mull: 0.26, band: 0.34, lit: 0.08 },
    stone: { frame: '#d6cdbd', top: '#a9b8c4', bottom: '#2f3a44', metal: 0.2, bay: 3.4, floor: 3.6, mull: 0.3, band: 0.36, lit: 0.08 },
    brick: { frame: '#8c4f3a', top: '#9fb0bd', bottom: '#28323b', metal: 0.1, bay: 3.2, floor: 3.4, mull: 0.42, band: 0.4, lit: 0.08 },
    terra: { frame: '#c4906a', top: '#a7b6c1', bottom: '#2c3741', metal: 0.12, bay: 3.4, floor: 3.5, mull: 0.36, band: 0.38, lit: 0.08 },
    sand: { frame: '#e0d2b4', top: '#9eb2c2', bottom: '#2b3946', metal: 0.15, bay: 3.0, floor: 3.4, mull: 0.32, band: 0.34, lit: 0.08 },
    graphite: { frame: '#4a4f55', top: '#93a9ba', bottom: '#1f2a33', metal: 0.4, bay: 2.8, floor: 3.6, mull: 0.22, band: 0.3, lit: 0.08 },
};
const MID = ['white', 'stone', 'brick', 'terra', 'sand', 'graphite', 'silver', 'brick', 'stone', 'terra'];
const COLS = 8, ROWS = 8;
function facadeMaps(spec, seed, anisotropy) {
    const S = 512, bw = S / COLS, fh = S / ROWS, rnd = seeded(seed);
    const [cm, m] = canvas(S), [cr, r] = canvas(S), [ce, e] = canvas(S);
    m.fillStyle = spec.frame; m.fillRect(0, 0, S, S);
    r.fillStyle = 'rgb(170,170,170)'; r.fillRect(0, 0, S, S);
    e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
    const mw = Math.max(2, bw * spec.mull), band = fh * spec.band;
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
        const x = col * bw + mw / 2, y = row * fh + band, w = bw - mw, h = fh - band;
        const grad = m.createLinearGradient(0, y, 0, y + h), k = 0.93 + rnd() * 0.14;
        const tint = (hex) => { const c = new THREE.Color(hex).multiplyScalar(k); return `#${c.getHexString()}`; };
        grad.addColorStop(0, tint(spec.top)); grad.addColorStop(1, tint(spec.bottom));
        m.fillStyle = grad; m.fillRect(x, y, w, h);
        const g = Math.round(8 + rnd() * 26); r.fillStyle = `rgb(${g},${g},${g})`; r.fillRect(x, y, w, h);
        if (rnd() < spec.lit) {
            const warm = rnd() < 0.8, a = 0.45 + rnd() * 0.55;
            e.fillStyle = warm ? `rgba(255,${190 + rnd() * 30 | 0},${120 + rnd() * 40 | 0},${a})` : `rgba(200,225,255,${a})`;
            e.fillRect(x, y + h * 0.1, w, h * 0.9);
        }
    }
    const tex = (c, srgb) => {
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / (COLS * spec.bay), 1 / (ROWS * spec.floor));
        t.anisotropy = anisotropy;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
    };
    return { map: tex(cm, true), roughnessMap: tex(cr), emissiveMap: tex(ce, true) };
}
function tiled(S, paint, metres, anisotropy, srgb = true) {
    const [c, g] = canvas(S);
    paint(g, S);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / metres, 1 / metres);
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
function speckle(g, S, base, spread, n, size = 2) {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    const rnd = seeded(n);
    for (let k = 0; k < n; k++) { const v = (rnd() - 0.5) * spread; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rnd() * S, rnd() * S, size, size); }
}
// the sea's ripples: tileable sums of waves, turned into a normal map
function waterNormals() {
    const S = 256, [c, g] = canvas(S), img = g.createImageData(S, S), rnd = seeded(5);
    const waves = Array.from({ length: 14 }, () => ({ kx: Math.round((rnd() - 0.5) * 16), ky: Math.round((rnd() - 0.5) * 16), a: rnd(), p: rnd() * 6.28 }));
    const h = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin((w.kx * x + w.ky * y) * (Math.PI * 2 / S) + w.p), 0);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), l = Math.hypot(dx, dy, 4);
        const i = (y * S + x) * 4;
        img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (4 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
const softDot = () => {
    const [c, g] = canvas(64), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
};

export async function mountCity(stage, { still = matchMedia('(prefers-reduced-motion: reduce)').matches, quality } = {}) {
    const small = Math.min(innerWidth, innerHeight) < 700;
    const high = quality ? quality === 'high' : !small;

    // ── Renderer and the frame ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 2 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.68;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 3, 30000);
    const rnd = seeded(2077);

    // ── Sky, sun, haze ──────────────────────────────────────────────────────
    // A low morning sun from the east-south-east: the skyline lit gold from the sea
    const sunDir = new THREE.Vector3(0.78, 0.17, 0.5).normalize();
    const sky = new Sky();
    sky.scale.setScalar(20000);
    sky.material.uniforms.turbidity.value = 5.5;
    sky.material.uniforms.rayleigh.value = 1.6;
    sky.material.uniforms.mieCoefficient.value = 0.006;
    sky.material.uniforms.mieDirectionalG.value = 0.82;
    sky.material.uniforms.sunPosition.value.copy(sunDir);
    // a few high fair-weather clouds
    if (sky.material.uniforms.cloudCoverage) { sky.material.uniforms.cloudCoverage.value = 0.32; sky.material.uniforms.cloudDensity.value = 0.45; sky.material.uniforms.cloudScale.value = 0.0004; }
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    // the reflections come from the same sky without the sun's disc, which is far too bright to mirror
    const skyCopy = new Sky(); skyCopy.scale.setScalar(20000);
    for (const [k, u] of Object.entries(sky.material.uniforms)) skyCopy.material.uniforms[k].value = u.value?.clone ? u.value.clone() : u.value;
    skyCopy.material.uniforms.showSunDisc.value = 0;
    skyScene.add(skyCopy);
    scene.environment = pmrem.fromScene(skyScene, 0, 1, 25000).texture;
    scene.environmentIntensity = 0.55;
    scene.fog = new THREE.FogExp2(0xb9c4cc, 0.00016);

    const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8a7f6e, 0.35);
    const sun = new THREE.DirectionalLight(0xffd2a0, 4.2);
    sun.castShadow = true;
    const shadowSize = high ? Math.min(4096, renderer.capabilities.maxTextureSize) : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 5000 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.2;
    scene.add(hemi, sun, sun.target);

    // ── Materials ───────────────────────────────────────────────────────────
    const facade = Object.fromEntries(Object.entries(FACADES).map(([name, spec], n) => [name, new THREE.MeshStandardMaterial({
        ...facadeMaps(spec, 11 + n * 7, aniso), metalness: spec.metal, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.28, envMapIntensity: 1.25,
    })]));
    const M = {
        roof: new THREE.MeshStandardMaterial({ map: tiled(256, (g, S) => speckle(g, S, '#8f8d88', 0.12, 2400), 12, aniso), roughness: 0.92 }),
        greenRoof: new THREE.MeshStandardMaterial({ map: tiled(256, (g, S) => speckle(g, S, '#5d7a3e', 0.3, 3000, 3), 10, aniso), roughness: 1 }),
        core: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.4, metalness: 0.6 }),
        concrete: new THREE.MeshStandardMaterial({ map: tiled(256, (g, S) => speckle(g, S, '#b9b4aa', 0.1, 2000), 8, aniso), roughness: 0.9 }),
        paving: new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, map: tiled(256, (g, S) => { speckle(g, S, '#a7a39b', 0.08, 1500); g.strokeStyle = 'rgba(60,55,50,0.25)'; for (let k = 0; k <= S; k += S / 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); } }, 6, aniso), roughness: 0.85 }),
        white: new THREE.MeshStandardMaterial({ color: 0xe9ecee, roughness: 0.55, metalness: 0.05 }),
        steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.48, metalness: 0.85 }),
        darkSteel: new THREE.MeshStandardMaterial({ color: 0x3c4249, roughness: 0.35, metalness: 0.85 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x9fc3dc, roughness: 0.05, metalness: 1, envMapIntensity: 1.4 }),
        yellow: new THREE.MeshStandardMaterial({ color: 0xe8b51c, roughness: 0.5 }),
        pv: new THREE.MeshStandardMaterial({ map: tiled(128, (g, S) => { g.fillStyle = '#16233a'; g.fillRect(0, 0, S, S); g.strokeStyle = '#7e8ea3'; g.lineWidth = 2; for (let k = 0; k <= S; k += S / 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); } }, 1, aniso), roughness: 0.18, metalness: 0.65, envMapIntensity: 1.5 }),
        light: (colour, k = 4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(k * 2.5), toneMapped: false }),
    };
    const buckets = new Map();   // material → geometries, merged into one mesh each at the end
    const add = (mat, geo) => { if (!buckets.has(mat)) buckets.set(mat, []); buckets.get(mat).push(prep(geo)); };
    const addMesher = (mat, m, x, z, rot = 0, y = 0) => { if (m.empty) return; const g = m.geometry(); if (rot) g.rotateY(rot); g.translate(x, y, z); add(mat, g); };
    const place = (geo, x, y, z, rot = 0) => { const g = geo.clone(); if (rot) g.rotateY(rot); g.translate(x, y, z); return g; };

    // ── The ground: land to the coast, painted by district ──────────────────
    const GX0 = -2300, GX1 = 1100, GZ0 = -1900, GZ1 = 2000;
    {
        const S = high ? 4096 : 2048, [c, g] = canvas(S);
        const toPx = (x, z) => [((x - GX0) / (GX1 - GX0)) * S, ((z - GZ0) / (GZ1 - GZ0)) * S];
        const metre = S / (GX1 - GX0);
        // fields and woods all round, a patchwork seen from the air
        g.fillStyle = '#6f7f4a'; g.fillRect(0, 0, S, S);
        const fr = seeded(9);
        for (let k = 0; k < 900; k++) {
            const x = fr() * S, y = fr() * S, w = (60 + fr() * 220) * metre, h = (60 + fr() * 220) * metre;
            g.fillStyle = ['#7d8a4f', '#8e9257', '#6a7a42', '#a39d62', '#5f7140', '#8a8a55'][Math.floor(fr() * 6)];
            g.fillRect(x, y, w, h);
        }
        // the city's ground: paving, darker under the core
        const [cx0, cz0] = toPx((I0 - 0.5) * P, (J0 - 0.5) * P), [cx1, cz1] = toPx((I1 + 0.5) * P, (J1 + 0.5) * P);
        g.fillStyle = '#8f8b84'; g.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);
        for (let k = 0; k < 30000; k++) { const x = cx0 + fr() * (cx1 - cx0), y = cz0 + fr() * (cz1 - cz0), v = (fr() - 0.5) * 0.18; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(x, y, 3, 3); }
        // the zones: green park, gravel for the plants, rough grass under the solar
        const paintZone = (k, colour) => { const [zx, zz] = zoneCentre(k), [w, d] = zoneSize(k), [a, b] = toPx(zx - w / 2, zz - d / 2); g.fillStyle = colour; g.fillRect(a, b, w * metre, d * metre); };
        paintZone('park', '#5d7d3c'); paintZone('fusion', '#a8a397'); paintZone('hydrogen', '#a8a397'); paintZone('battery', '#9c978c');
        paintZone('solar', '#7b8650'); paintZone('geothermal', '#a49d90');
        // a sandy strip along the shore
        for (let z = GZ0; z < GZ1; z += 4) { const [a, b] = toPx(coastX(z) - 30, z); g.fillStyle = '#cdbf9c'; g.fillRect(a, b, 32 * metre, 5 * metre); }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        // the land out to the horizon: a repeating patchwork of fields, its east edge the coast
        const landShape = (x0, z0, z1, step) => {
            const pts = [new THREE.Vector2(x0, -z1)];
            for (let z = z1; z >= z0; z -= step(z)) pts.push(new THREE.Vector2(coastX(z), -z));
            pts.push(new THREE.Vector2(coastX(z0), -z0), new THREE.Vector2(x0, -z0));
            const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, GROUND, 0);
            return geo;
        };
        const fields = tiled(1024, (fg, FS) => {
            fg.fillStyle = '#6f7f4a'; fg.fillRect(0, 0, FS, FS);
            const r2 = seeded(31);
            for (let k = 0; k < 260; k++) {
                fg.fillStyle = ['#7d8a4f', '#8e9257', '#6a7a42', '#a39d62', '#5f7140', '#8a8a55', '#4f6236'][Math.floor(r2() * 7)];
                const x = r2() * FS, y = r2() * FS, w = 40 + r2() * 220, h = 40 + r2() * 220;
                for (const [ox, oy] of [[0, 0], [-FS, 0], [0, -FS], [-FS, -FS]]) fg.fillRect(x + ox, y + oy, w, h);   // wrapped, so it tiles
            }
        }, 1400, aniso);
        const far = landShape(-12000, -12000, 12000, (z) => (Math.abs(z) > 2500 ? 400 : 20));
        const fpos = far.attributes.position, fuv = far.attributes.uv;
        for (let k = 0; k < fpos.count; k++) fuv.setXY(k, fpos.getX(k), -fpos.getZ(k));
        const land = new THREE.Mesh(far, new THREE.MeshStandardMaterial({ map: fields, roughness: 0.95 }));
        land.receiveShadow = true;
        scene.add(land);
        // and the city's own ground laid over it
        const geo = landShape(GX0, GZ0, GZ1, () => 20);
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) - GX0) / (GX1 - GX0), 1 - (pos.getZ(k) - GZ0) / (GZ1 - GZ0));
        const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 }));
        ground.receiveShadow = true;
        scene.add(ground);
        // the sea wall along the coast
        const wall = new Mesher();
        for (let z = GZ0 - 600; z < GZ1 + 600; z += 20) {
            const a = [coastX(z), GROUND + 0.6, z], b = [coastX(z + 20), GROUND + 0.6, z + 20];
            wall.quad(a, b, [b[0], -8, b[2]], [a[0], -8, a[2]], [z, a[1]], [z + 20, a[1]], [z + 20, -8], [z, -8], [1, 0, 0]);
        }
        addMesher(M.concrete, wall, 0, 0);
    }

    // ── Hills far inland, softened by the haze ──────────────────────────────
    {
        const NA = 160, NR = 26, verts = [], cols = [], idx = [];
        for (let r = 0; r <= NR; r++) for (let a = 0; a <= NA; a++) {
            const t = 0.3 * Math.PI + (a / NA) * 1.4 * Math.PI, rad = 3200 + (r / NR) * 7000;
            const x = Math.cos(t) * rad - 600, z = Math.sin(t) * rad * 0.9;
            const h = Math.pow(fbm(x / 1800, z / 1800, 5), 1.6) * 900 * smooth(3200, 5600, rad) * smooth(0.3 * Math.PI, 0.45 * Math.PI, t) * smooth(1.7 * Math.PI, 1.55 * Math.PI, t);
            verts.push(x, GROUND - 1 + h, z);
            const c = new THREE.Color(0x3f5030).lerp(new THREE.Color(0x6d6c62), smooth(200, 600, h));
            cols.push(c.r, c.g, c.b);
        }
        for (let r = 0; r < NR; r++) for (let a = 0; a < NA; a++) { const k = r * (NA + 1) + a; idx.push(k, k + 1, k + NA + 1, k + 1, k + NA + 2, k + NA + 1); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        const hills = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
        hills.receiveShadow = true;
        scene.add(hills);
    }

    // ── The sea ─────────────────────────────────────────────────────────────
    let water;
    {
        const geo = new THREE.PlaneGeometry(40000, 40000);
        if (high) {
            water = new Water(geo, {
                textureWidth: 1024, textureHeight: 1024, waterNormals: waterNormals(), sunDirection: sunDir.clone(), sunColor: 0xffe2b8,
                waterColor: 0x0b3346, distortionScale: 2.4, fog: true,
            });
            water.material.uniforms.size.value = 6;
        } else {
            const n = waterNormals(); n.repeat.set(400, 400);
            water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x174a5e, roughness: 0.08, metalness: 0.6, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35) }));
        }
        water.rotation.x = -Math.PI / 2;
        water.position.set(8000, 0, 0);
        scene.add(water);
    }

    // ── Streets: roads between the lots, junctions, pavements ───────────────
    const roadTex = tiled(512, (g, S) => {
        speckle(g, S, '#3b3d40', 0.14, 6000, 2);
        g.fillStyle = 'rgba(235,235,230,0.85)';
        g.fillRect(S * 0.035, 0, S * 0.012, S); g.fillRect(S * 0.953, 0, S * 0.012, S);              // edge lines
        g.fillRect(S * 0.49, 0, S * 0.008, S); g.fillRect(S * 0.502, 0, S * 0.008, S);               // the centre, doubled
        for (const u of [0.27, 0.73]) for (let v = 0; v < S; v += S / 4) g.fillRect(S * u, v, S * 0.009, S / 8);   // lane dashes
        g.fillStyle = 'rgba(40,220,255,0.0)';
    }, 1, aniso);
    roadTex.repeat.set(1, 1 / 24);
    const junctionTex = tiled(512, (g, S) => {
        speckle(g, S, '#3b3d40', 0.14, 6000, 2);
        g.fillStyle = 'rgba(235,235,230,0.85)';
        for (let k = 0; k < 9; k++) { const u = S * (0.12 + k * 0.085); g.fillRect(u, 0, S * 0.045, S * 0.1); g.fillRect(u, S * 0.9, S * 0.045, S * 0.1); g.fillRect(0, u, S * 0.1, S * 0.045); g.fillRect(S * 0.9, u, S * 0.1, S * 0.045); }
    }, 1, aniso);
    junctionTex.repeat.set(1, 1);
    // drawn a touch nearer than they are, so the flat ground never shows through them far off
    const nearer = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
    M.road = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82, ...nearer });
    M.junction = new THREE.MeshStandardMaterial({ map: junctionTex, roughness: 0.82, ...nearer });
    // energy conduits down the avenues: a pulse of light running to the core
    const conduitTex = tiled(64, (g, S) => { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.8, 'rgba(80,230,255,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }, 1, 1);
    conduitTex.repeat.set(1, 1 / 60);
    M.conduit = new THREE.MeshBasicMaterial({ map: conduitTex, color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

    const segments = [];   // for traffic: [axis, fixed, from, to]
    {
        const road = new Mesher(), junction = new Mesher(), conduit = new Mesher();
        const strip = (m, x0, z0, x1, z1, w, y, along) => {
            // a flat strip from (x0,z0) to (x1,z1), w wide, uv: across 0..1, along in metres
            const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * w / 2, nz = dx / l * w / 2;
            m.quad([x0 + nx, y, z0 + nz], [x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], [0, 0], [1, 0], [1, along ? l : 1], [0, along ? l : 1], [0, 1, 0]);
        };
        const segOK = (ia, ja, ib, jb) => {
            // a road between lot (ia,ja) and lot (ib,jb): kept if either is used and not inside one zone
            const ua = lotUsed(ia, ja), ub = lotUsed(ib, jb);
            if (!ua && !ub) return false;
            const za = zoneOf(ia, ja), zb = zoneOf(ib, jb);
            return !(za && za === zb && ua && ub) || za === 'park';
        };
        const junctions = new Set();
        // roads running north–south at x = (i + ½)P, between lots i and i+1
        for (let i = I0 - 1; i <= I1; i++) for (let j = J0; j <= J1; j++) {
            if (!segOK(i, j, i + 1, j) || zoneOf(i, j) === 'park' && zoneOf(i + 1, j) === 'park') continue;
            const x = (i + 0.5) * P, z0 = (j - 0.5) * P + ROAD / 2, z1 = (j + 0.5) * P - ROAD / 2;
            if (!onLand(x, z0, 8) || !onLand(x, z1, 8)) continue;
            strip(road, x, z0, x, z1, ROAD, GROUND + 0.12, true);
            segments.push(['z', x, z0 - ROAD / 2, z1 + ROAD / 2]);
            junctions.add(`${i},${j - 1}`); junctions.add(`${i},${j}`);
        }
        // roads running east–west at z = (j + ½)P
        for (let j = J0 - 1; j <= J1; j++) for (let i = I0; i <= I1; i++) {
            if (!segOK(i, j, i, j + 1) || zoneOf(i, j) === 'park' && zoneOf(i, j + 1) === 'park') continue;
            const z = (j + 0.5) * P, x0 = (i - 0.5) * P + ROAD / 2, x1 = (i + 0.5) * P - ROAD / 2;
            if (!onLand(x1, z, 8)) continue;
            strip(road, x0, z, x1, z, ROAD, GROUND + 0.12, true);
            segments.push(['x', z, x0 - ROAD / 2, x1 + ROAD / 2]);
            junctions.add(`${i - 1},${j}`); junctions.add(`${i},${j}`);
        }
        for (const key of junctions) {
            const [i, j] = key.split(',').map(Number), x = (i + 0.5) * P, z = (j + 0.5) * P;
            if (!onLand(x + ROAD / 2, z, 2)) continue;
            junction.quad([x - ROAD / 2, GROUND + 0.12, z - ROAD / 2], [x + ROAD / 2, GROUND + 0.12, z - ROAD / 2], [x + ROAD / 2, GROUND + 0.12, z + ROAD / 2], [x - ROAD / 2, GROUND + 0.12, z + ROAD / 2], [0, 0], [1, 0], [1, 1], [0, 1], [0, 1, 0]);
        }
        // two avenues carry the glowing conduits: one from the wind farm's landfall, one from the solar
        for (const z of [0.5 * P, -0.5 * P]) strip(conduit, coastX(z) - 40, z + (z > 0 ? -1.6 : 1.6), -1100, z + (z > 0 ? -1.6 : 1.6), 0.8, GROUND + 0.16, true);
        for (const x of [-0.5 * P]) strip(conduit, x + 1.6, 1250, x + 1.6, -1250, 0.8, GROUND + 0.16, true);
        addMesher(M.road, road, 0, 0); addMesher(M.junction, junction, 0, 0);
        const conduitMesh = new THREE.Mesh(conduit.geometry(), M.conduit);
        conduitMesh.renderOrder = 2;
        scene.add(conduitMesh);
    }

    // ── Trees: one instanced tree, coloured a little differently each time ──
    const trees = [];
    const treeAt = (x, z, s = 1, y = GROUND) => trees.push([x, y, z, s]);

    // ── Buildings ───────────────────────────────────────────────────────────
    const towers = [];       // tall, axis-aligned ones, for sky bridges
    const beacons = [], spires = [];
    const rooftopPV = [];    // [x, y, z, rot] panels on the lower blocks' roofs
    function tower(x, z, w, d, h) {
        const kind = ['blue', 'dark', 'bronze', 'silver', 'blue', 'dark'][Math.floor(rnd() * 6)];
        const mat = facade[kind], walls = new Mesher(), roof = new Mesher(), core = new Mesher();
        const r = rnd(), rot = rnd() < 0.25 ? (rnd() - 0.5) * 0.5 : 0;
        let shape = 'box';
        if (h > 140) shape = r < 0.22 ? 'twist' : r < 0.4 ? 'cyl' : r < 0.58 ? 'setback' : r < 0.74 ? 'garden' : r < 0.86 ? 'taper' : 'box';
        else shape = r < 0.3 ? 'setback' : r < 0.45 ? 'cyl' : 'box';
        const c = Math.min(w, d) * 0.18;
        if (shape === 'twist') prism(walls, roof, chamfer(w * 0.9, d * 0.9, c), GROUND, GROUND + h, { twist: 0.7 + rnd() * 0.6, segs: 30 });
        else if (shape === 'cyl') prism(walls, roof, circle(Math.min(w, d) / 2, 32), GROUND, GROUND + h, { smooth: true, top: 0.92 });
        else if (shape === 'taper') prism(walls, roof, chamfer(w, d, c), GROUND, GROUND + h, { top: 0.62, segs: 1 });
        else if (shape === 'setback') {
            const h1 = h * (0.45 + rnd() * 0.15), h2 = h * (0.78 + rnd() * 0.1);
            prism(walls, roof, rect(w, d), GROUND, GROUND + h1);
            prism(walls, roof, chamfer(w * 0.8, d * 0.8, c * 0.6), GROUND + h1, GROUND + h2);
            prism(walls, roof, chamfer(w * 0.58, d * 0.58, c * 0.5), GROUND + h2, GROUND + h);
        } else if (shape === 'garden') {
            // a sky garden: the tower breaks for a planted terrace and carries on above
            const g0 = h * (0.5 + rnd() * 0.12), g1 = g0 + 12;
            prism(walls, roof, chamfer(w, d, c), GROUND, GROUND + g0);
            prism(core, null, chamfer(w * 0.55, d * 0.55, c * 0.5), GROUND + g0, GROUND + g1);
            prism(walls, roof, chamfer(w, d, c), GROUND + g1, GROUND + h);
            for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, rr = Math.min(w, d) * 0.4; treeAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.6 + rnd() * 0.3, GROUND + g0); }
        } else prism(walls, roof, chamfer(w, d, c * 0.4), GROUND, GROUND + h);
        addMesher(mat, walls, x, z, rot); addMesher(M.roof, roof, x, z, rot); addMesher(M.core, core, x, z, rot);
        // the crown: a spire and a red light on the tallest, plant on the rest
        const topY = GROUND + h;
        if (h > 260) { spires.push([x, topY, z, 18 + h * 0.18]); beacons.push([x, topY + 18 + h * 0.18, z]); }
        else { add(M.steel, place(new THREE.BoxGeometry(w * 0.3, 5, d * 0.25), x, topY + 2.5, z, rot)); beacons.push([x + w * 0.1, topY + 5.5, z]); }
        if (!rot && shape !== 'twist' && shape !== 'cyl') towers.push({ x, z, w, d, h, kind });
    }
    function midrise(x, z, w, d, h, kind) {
        const walls = new Mesher(), roof = new Mesher();
        prism(walls, roof, rect(w, d), GROUND, GROUND + h);
        addMesher(facade[kind], walls, x, z);
        const r = rnd(), green = r < 0.3, pv = r > 0.62;
        addMesher(green ? M.greenRoof : M.roof, roof, x, z);
        if (!green && !pv) { add(M.steel, place(new THREE.BoxGeometry(Math.min(8, w * 0.3), 3, Math.min(6, d * 0.3)), x + w * 0.15, GROUND + h + 1.5, z - d * 0.1)); return; }
        if (pv) for (let px = -w / 2 + 5; px < w / 2 - 4; px += 4.2) for (let pz = -d / 2 + 5; pz < d / 2 - 4; pz += 2.6) rooftopPV.push([x + px, GROUND + h + 0.8, z + pz]);
        else for (let k = 0; k < 4; k++) treeAt(x + (rnd() - 0.5) * w * 0.6, z + (rnd() - 0.5) * d * 0.6, 0.45 + rnd() * 0.25, GROUND + h);
    }
    const plinth = new Mesher();
    for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
        if (!lotUsed(i, j)) continue;
        const zone = zoneOf(i, j), x = i * P, z = j * P, L = P - ROAD;
        // every lot stands on a kerbed pavement
        if (zone !== 'park' && zone !== 'solar') prism(plinth, plinth, rect(L, L).map(([a, b]) => [a + x, b + z]), GROUND, GROUND + 0.3);
        if (zone === 'park') {
            for (let k = 0; k < 22; k++) treeAt(x + (rnd() - 0.5) * L * 0.9, z + (rnd() - 0.5) * L * 0.9, 0.8 + rnd() * 0.5);
            continue;
        }
        if (zone) continue;
        const d = Math.hypot(x - CORE[0], (z - CORE[1]) * 1.15);
        const peak = 470 * Math.exp(-((d / 360) ** 2)) + 120 * Math.exp(-((d / 750) ** 2));
        const h = Math.max(14, peak * (0.55 + rnd() * 0.6));
        // small parks scattered through the grid
        if (d > 300 && rnd() < 0.07) { add(M.greenRoof, place(new THREE.BoxGeometry(L - 4, 0.4, L - 4), x, GROUND + 0.4, z)); for (let k = 0; k < 14; k++) treeAt(x + (rnd() - 0.5) * L * 0.85, z + (rnd() - 0.5) * L * 0.85, 0.7 + rnd() * 0.5); continue; }
        if (h > 110) {
            // one tower, or two side by side, on a podium of shops
            if (rnd() < 0.3 && h < 260) { tower(x - L * 0.24, z, L * 0.42, L * 0.7, h); tower(x + L * 0.26, z + L * 0.1, L * 0.38, L * 0.5, h * (0.6 + rnd() * 0.3)); }
            else { const s = 0.62 + rnd() * 0.2; tower(x, z, L * s, L * (0.55 + rnd() * 0.25), h); }
            if (rnd() < 0.6) midrise(x, z, L * 0.92, L * 0.92, 10 + rnd() * 8, rnd() < 0.5 ? 'graphite' : 'stone');
        } else if (h > 34) {
            // a perimeter block: slabs of different heights and facades round a planted courtyard
            const t = 13 + rnd() * 5, inner = L - 2 * t;
            add(M.greenRoof, place(new THREE.BoxGeometry(inner, 0.4, inner), x, GROUND + 0.4, z));
            for (let k = 0; k < 6; k++) treeAt(x + (rnd() - 0.5) * inner * 0.7, z + (rnd() - 0.5) * inner * 0.7, 0.6 + rnd() * 0.3);
            const slabs = [[0, -(L - t) / 2, L, t], [0, (L - t) / 2, L, t], [-(L - t) / 2, 0, t, inner], [(L - t) / 2, 0, t, inner]];
            for (const [dx, dz, w, d] of slabs) {
                // each side in two or three buildings, as a street is built up over time
                const n = 1 + Math.floor(rnd() * 3), along = w > d ? w : d;
                for (let k = 0; k < n; k++) {
                    const len = along / n, off = -along / 2 + len * (k + 0.5);
                    const bx = x + dx + (w > d ? off : 0), bz = z + dz + (w > d ? 0 : off);
                    midrise(bx, bz, w > d ? len - 0.6 : w, w > d ? d : len - 0.6, h * (0.55 + rnd() * 0.5), MID[Math.floor(rnd() * MID.length)]);
                }
            }
        } else {
            // houses and small blocks, gardens between
            add(M.greenRoof, place(new THREE.BoxGeometry(L - 6, 0.35, L - 6), x, GROUND + 0.35, z));
            for (let a = -1.5; a <= 1.5; a++) for (let b = -1.5; b <= 1.5; b++) {
                if (rnd() < 0.3) { treeAt(x + a * L * 0.22, z + b * L * 0.22, 0.7 + rnd() * 0.4); continue; }
                midrise(x + a * L * 0.22, z + b * L * 0.22, L * (0.13 + rnd() * 0.06), L * (0.13 + rnd() * 0.06), 7 + rnd() * Math.max(6, h * 0.6), MID[Math.floor(rnd() * MID.length)]);
            }
        }
        // street trees along the pavement's edge
        for (let k = -L / 2 + 6; k <= L / 2 - 6; k += 12) for (const [tx, tz] of [[x + k, z - L / 2 + 2.5], [x + k, z + L / 2 - 2.5], [x - L / 2 + 2.5, z + k], [x + L / 2 - 2.5, z + k]]) if (rnd() < 0.7) treeAt(tx, tz, 0.55 + rnd() * 0.2);
    }
    addMesher(M.paving, plinth, 0, 0);
    // sky bridges between neighbouring tall towers
    for (const a of towers) for (const b of towers) {
        if (a === b || a.h < 180 || b.h < 180) continue;
        if (Math.abs(a.z - b.z) < 6 && b.x > a.x && b.x - a.x < P * 1.1) {
            const y = GROUND + Math.min(a.h, b.h) * (0.55 + hash(a.x, b.x) * 0.2), x0 = a.x + a.w / 2, x1 = b.x - b.w / 2;
            if (x1 > x0) { add(M.glass, place(new THREE.BoxGeometry(x1 - x0 + 2, 7, 10), (x0 + x1) / 2, y, a.z)); add(M.steel, place(new THREE.BoxGeometry(x1 - x0 + 2, 1, 11), (x0 + x1) / 2, y - 4, a.z)); }
        }
    }
    for (const [x, y, z, l] of spires) { add(M.steel, place(new THREE.ConeGeometry(2.2, l, 12), x, y + l / 2, z)); add(M.steel, place(new THREE.CylinderGeometry(6, 8, 6, 16), x, y + 3, z)); }

    // ── Offshore wind: a field of turbines in the bay ───────────────────────
    const rotors = [];
    {
        const sites = [];
        for (let gx = 0; gx < 7; gx++) for (let gz = 0; gz < 9; gz++) {
            const x = 1450 + gx * 280 + (gz % 2) * 140, z = -1200 + gz * 300;
            if (hash(gx, gz) < 0.12) continue;
            sites.push([x, z]);
        }
        const HUB = 135, R = 95;
        const tower = mergeGeometries([
            prep(new THREE.CylinderGeometry(3.4, 5, 24, 20).translate(0, 12 - 6, 0)),
            prep(new THREE.CylinderGeometry(2.6, 3.8, HUB - 18, 20).translate(0, 18 + (HUB - 18) / 2, 0)),
            prep(new RoundedBoxGeometry(16, 6.5, 6.5, 2, 1.4).translate(-3, HUB, 0)),
        ]);
        const base = mergeGeometries([prep(new THREE.CylinderGeometry(5.2, 5.2, 14, 20).translate(0, 4, 0)), prep(new THREE.CylinderGeometry(9, 9, 1.4, 24).translate(0, 11.5, 0))]);
        // a blade: a long thin tapered aerofoil, root at the hub
        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(0, -1.6); bladeShape.bezierCurveTo(R * 0.15, -3.6, R * 0.6, -1.6, R, -0.25);
        bladeShape.lineTo(R, 0.25); bladeShape.bezierCurveTo(R * 0.6, 1.2, R * 0.15, 2.0, 0, 1.6); bladeShape.lineTo(0, -1.6);
        const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.6, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.3);
        // the blades turn in the y–z plane, about the nacelle's own x axis
        const rotor = mergeGeometries([0, 1, 2].map((k) => prep(blade.clone().rotateZ((k / 3) * Math.PI * 2 + Math.PI / 2))).concat([prep(new THREE.SphereGeometry(3, 16, 12).scale(1, 1, 1.6))])).rotateY(Math.PI / 2);
        const towerMesh = new THREE.InstancedMesh(tower, M.white, sites.length);
        const baseMesh = new THREE.InstancedMesh(base, M.yellow, sites.length);
        const rotorMesh = new THREE.InstancedMesh(rotor, M.white, sites.length);
        const yaw = 0.25;   // facing out to sea, into an easterly
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
        sites.forEach(([x, z], n) => {
            q.setFromEuler(new THREE.Euler(0, yaw, 0));
            m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1));
            towerMesh.setMatrixAt(n, m4); baseMesh.setMatrixAt(n, m4);
            rotors.push({ at: new THREE.Vector3(x + Math.cos(yaw) * 6.5, HUB, z - Math.sin(yaw) * 6.5), yaw, phase: hash(x, z) * 6.28, speed: 0.9 + hash(z, x) * 0.25 });
        });
        for (const mesh of [towerMesh, baseMesh, rotorMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }
        rotors.mesh = rotorMesh;
        // a red light on every nacelle
        const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), M.light(0xff2a1a, 6), sites.length);
        sites.forEach(([x, z], n) => lights.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, HUB + 4.2, z)));
        scene.add(lights);
        // the export cable's landfall: a substation on the shore
        const sx = coastX(0.5 * P) - 70, sz = 0.5 * P - 40;
        add(M.white, place(new THREE.BoxGeometry(46, 18, 30), sx, GROUND + 9, sz));
        add(M.darkSteel, place(new THREE.BoxGeometry(48, 2, 32), sx, GROUND + 19, sz));
    }

    // ── The tidal barrage across the north of the bay ───────────────────────
    const foamSpots = [];
    {
        const z0 = -700, start = coastX(z0) - 10, end = start + 900;
        for (let x = start; x < end; x += 30) {
            const z = z0 - Math.sin(((x - start) / 900) * Math.PI) * 140, z2 = z0 - Math.sin(((x + 30 - start) / 900) * Math.PI) * 140;
            const ang = Math.atan2(z2 - z, 30);
            add(M.concrete, place(new THREE.BoxGeometry(31, 16, 26).rotateY(-ang), x + 15, -4, (z + z2) / 2));
            add(M.paving, place(new THREE.BoxGeometry(31, 0.4, 18).rotateY(-ang), x + 15, 4.2, (z + z2) / 2));
            if (Math.round((x - start) / 30) % 3 === 1) {
                // a turbine housing, its sluice churning white on the sea side
                add(M.white, place(new THREE.BoxGeometry(18, 9, 14).rotateY(-ang), x + 15, 8.5, (z + z2) / 2 - 2));
                add(M.darkSteel, place(new THREE.BoxGeometry(19, 1.2, 15).rotateY(-ang), x + 15, 13.4, (z + z2) / 2 - 2));
                beacons.push([x + 15, 14.6, (z + z2) / 2 - 2]);
                foamSpots.push([x + 15, 0.6, (z + z2) / 2 + 18]);
            }
        }
    }

    // ── Fusion: a tokamak in an open crown of white fins ────────────────────
    let plasma;
    {
        const [cx, cz] = zoneCentre('fusion'), [zw, zd] = zoneSize('fusion');
        add(M.paving, place(new THREE.BoxGeometry(zw, 0.6, zd), cx, GROUND + 0.3, cz));
        const R0 = 62;
        add(M.darkSteel, place(new THREE.TorusGeometry(R0, 20, 24, 96).rotateX(Math.PI / 2), cx, GROUND + 34, cz));
        for (let k = 0; k < 18; k++) {
            // the field coils round the vessel
            const a = (k / 18) * Math.PI * 2;
            add(M.steel, place(new THREE.TorusGeometry(25, 2.4, 8, 32).rotateY(-a), cx + Math.cos(a) * R0, GROUND + 34, cz + Math.sin(a) * R0));
        }
        add(M.darkSteel, place(new THREE.CylinderGeometry(18, 22, 70, 32), cx, GROUND + 35, cz));
        plasma = new THREE.Mesh(new THREE.TorusGeometry(R0, 7, 24, 128).rotateX(Math.PI / 2), M.light(0xb070ff, 5));
        plasma.position.set(cx, GROUND + 34, cz);
        scene.add(plasma);
        const glow = new THREE.PointLight(0xa880ff, 80000, 600, 2);
        glow.position.set(cx, GROUND + 60, cz);
        scene.add(glow);
        // the crown: tall curved fins round it, gaps between to see in
        const fin = new THREE.Shape();
        fin.moveTo(0, 0); fin.lineTo(14, 0); fin.bezierCurveTo(18, 40, 8, 80, -14, 112); fin.lineTo(-20, 108); fin.bezierCurveTo(0, 78, 6, 40, 0, 0);
        const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 5, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -2.5);
        for (let k = 0; k < 28; k++) {
            const a = (k / 28) * Math.PI * 2;
            const g = finGeo.clone().translate(118, 0, 0).rotateY(-a);
            g.translate(cx, GROUND, cz);
            add(M.white, g);
        }
        add(M.glass, place(new THREE.TorusGeometry(104, 2.5, 8, 96).rotateX(Math.PI / 2), cx, GROUND + 108, cz));
        // halls and cooling towers round about
        for (const [dx, dz, w, d, h] of [[-150, -120, 90, 50, 26], [150, -130, 70, 70, 22], [-160, 140, 80, 60, 30], [150, 140, 110, 44, 18]]) {
            const walls = new Mesher(), roof = new Mesher();
            prism(walls, roof, rect(w, d), GROUND, GROUND + h);
            addMesher(facade.white, walls, cx + dx, cz + dz); addMesher(M.roof, roof, cx + dx, cz + dz);
        }
    }
    const steamVents = [];
    const coolingTower = (x, z, rTop, h) => {
        const pts = Array.from({ length: 20 }, (_, i) => { const t = i / 19, y = t * h; return new THREE.Vector2(rTop * Math.sqrt(1 + ((y - h * 0.78) / (h * 0.42)) ** 2) * 0.82, y); });
        add(M.concrete, place(new THREE.LatheGeometry(pts, 48), x, GROUND, z));
        steamVents.push([x, GROUND + h, z, rTop]);
    };
    { const [cx, cz] = zoneCentre('fusion'); coolingTower(cx + 170, cz + 10, 32, 120); coolingTower(cx - 175, cz - 5, 28, 105); }

    // ── Hydrogen: spheres of stored gas, the electrolysers that fill them ───
    {
        const [cx, cz] = zoneCentre('hydrogen'), [zw, zd] = zoneSize('hydrogen');
        add(M.paving, place(new THREE.BoxGeometry(zw, 0.5, zd), cx, GROUND + 0.25, cz));
        const h2glow = M.light(0x40e0ff, 3);
        for (let k = 0; k < 6; k++) {
            const x = cx - 40 + (k % 2) * 80, z = cz - 150 + Math.floor(k / 2) * 80, r = 26;
            add(M.white, place(new THREE.SphereGeometry(r, 32, 20), x, GROUND + r + 10, z));
            for (let l = 0; l < 8; l++) { const a = (l / 8) * Math.PI * 2; add(M.steel, place(new THREE.CylinderGeometry(1.2, 1.2, r + 10, 6), x + Math.cos(a) * r * 0.86, GROUND + (r + 10) / 2, z + Math.sin(a) * r * 0.86)); }
            add(h2glow, place(new THREE.TorusGeometry(r + 0.2, 0.5, 6, 64).rotateX(Math.PI / 2), x, GROUND + r + 10, z));
        }
        for (let k = 0; k < 2; k++) {
            const walls = new Mesher(), roof = new Mesher(), x = cx - 30 + k * 64, z = cz + 160;
            prism(walls, roof, rect(52, 90), GROUND, GROUND + 16);
            addMesher(facade.silver, walls, x, z); addMesher(M.roof, roof, x, z);
        }
        for (let k = 0; k < 4; k++) add(M.steel, place(new THREE.CylinderGeometry(1.6, 1.6, 300, 10).rotateX(Math.PI / 2), cx - 60 + k * 40, GROUND + 6, cz));
    }

    // ── Battery storage: rows of containers, a green light on each ──────────
    const batteryLeds = [];
    {
        const [cx, cz] = zoneCentre('battery'), [zw, zd] = zoneSize('battery');
        add(M.paving, place(new THREE.BoxGeometry(zw, 0.5, zd), cx, GROUND + 0.25, cz));
        const unit = new RoundedBoxGeometry(13, 6, 3.4, 2, 0.4);
        const units = [];
        for (let gx = 0; gx < 11; gx++) for (let gz = 0; gz < 22; gz++) {
            const x = cx - zw / 2 + 20 + gx * 17.5, z = cz - zd / 2 + 24 + gz * 18 + (gz % 2) * 4;
            units.push([x, z]);
        }
        const mesh = new THREE.InstancedMesh(unit, M.white, units.length);
        units.forEach(([x, z], n) => { mesh.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, GROUND + 3.5, z)); batteryLeds.push([x + 4, GROUND + 5, z + 1.75]); });
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
        const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), M.light(0x3dff8e, 4), batteryLeds.length);
        batteryLeds.forEach(([x, y, z], n) => leds.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, y, z)));
        scene.add(leds);
    }

    // ── The solar farm: long rows of tilted panels ──────────────────────────
    {
        const [cx, cz] = zoneCentre('solar'), [zw, zd] = zoneSize('solar');
        const panel = new THREE.BoxGeometry(4, 0.12, 2.2).rotateX(-0.5);
        const posts = new THREE.BoxGeometry(0.25, 2.2, 0.25);
        const spots = [];
        for (let z = cz - zd / 2 + 8; z < cz + zd / 2 - 6; z += 6.2) for (let x = cx - zw / 2 + 6; x < cx + zw / 2 - 6; x += 4.15) {
            // a track for maintenance every eighth row, and the odd gap
            if (Math.round((z - cz) / 6.2) % 8 === 0 || hash(Math.round(x), Math.round(z)) < 0.02) continue;
            spots.push([x, z]);
        }
        const mesh = new THREE.InstancedMesh(panel, M.pv, spots.length), legs = new THREE.InstancedMesh(posts, M.steel, spots.length);
        spots.forEach(([x, z], n) => { mesh.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, GROUND + 2.4, z)); legs.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, GROUND + 1.1, z + 0.4)); });
        mesh.receiveShadow = true; mesh.castShadow = true;
        scene.add(mesh, legs);
        add(M.white, place(new THREE.BoxGeometry(24, 7, 12), cx + zw / 2 - 30, GROUND + 3.5, cz - zd / 2 - 2));
    }
    // panels on the lower blocks' roofs
    if (rooftopPV.length) {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 0.1, 2.0).rotateX(-0.35), M.pv, rooftopPV.length);
        rooftopPV.forEach(([x, y, z], n) => mesh.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, y, z)));
        mesh.receiveShadow = true;
        scene.add(mesh);
    }

    // ── Geothermal: a plant by the shore, its wells and steam ───────────────
    {
        const [cx, cz] = zoneCentre('geothermal'), [zw, zd] = zoneSize('geothermal');
        add(M.paving, place(new THREE.BoxGeometry(zw, 0.5, zd), cx, GROUND + 0.25, cz));
        const walls = new Mesher(), roof = new Mesher();
        prism(walls, roof, rect(90, 50), GROUND, GROUND + 24);
        addMesher(facade.silver, walls, cx - 40, cz - 50); addMesher(M.roof, roof, cx - 40, cz - 50);
        for (let k = 0; k < 4; k++) {
            const x = cx + 40 + (k % 2) * 46, z = cz - 70 + Math.floor(k / 2) * 46;
            add(M.concrete, place(new THREE.CylinderGeometry(15, 17, 22, 32), x, GROUND + 11, z));
            add(M.darkSteel, place(new THREE.CylinderGeometry(12, 12, 1.4, 32), x, GROUND + 22.4, z));
            steamVents.push([x, GROUND + 23, z, 10]);
        }
        // the wellheads, piped to the plant
        for (let k = 0; k < 5; k++) {
            const x = cx - 100 + k * 50, z = cz + 80;
            add(M.yellow, place(new THREE.BoxGeometry(8, 4, 8), x, GROUND + 2, z));
            add(M.steel, place(new THREE.CylinderGeometry(1.6, 1.6, 60, 10).rotateX(Math.PI / 2), x, GROUND + 3.5, z - 30));
        }
    }

    // ── All the static parts, one mesh per material ─────────────────────────
    for (const [mat, list] of buckets) {
        const mesh = new THREE.Mesh(mergeGeometries(list), mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
    }

    // ── Trees ───────────────────────────────────────────────────────────────
    {
        const trunk = new THREE.CylinderGeometry(0.35, 0.5, 5, 6).translate(0, 2.5, 0);
        const crown = mergeGeometries([prep(new THREE.IcosahedronGeometry(3.6, 1).translate(0, 7, 0)), prep(new THREE.IcosahedronGeometry(2.8, 1).translate(1.2, 9.2, 0.6)), prep(new THREE.IcosahedronGeometry(2.4, 1).translate(-1.4, 8.6, -0.8))]);
        const wood = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 }), trees.length);
        const leaves = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), trees.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
        trees.forEach(([x, y, z, s], n) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(x, z) * 6.28);
            m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.9 + hash(z, x) * 0.3), s));
            wood.setMatrixAt(n, m4); leaves.setMatrixAt(n, m4);
            leaves.setColorAt(n, c.setHSL(0.24 + hash(x, y) * 0.06, 0.38 + hash(z, y) * 0.15, 0.24 + hash(y, x) * 0.08));
        });
        for (const mesh of [wood, leaves]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }
    }

    // ── Lights that glow: beacons on the towers and the barrage ─────────────
    const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.2, 8, 6), M.light(0xff3322, 6), beacons.length);
    beacons.forEach(([x, y, z], n) => beaconMesh.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x, y, z)));
    scene.add(beaconMesh);

    // ── Traffic: cars on every road, keeping left ───────────────────────────
    const cars = [];
    {
        // join each street's blocks into one long run, so cars drive its whole length
        const runs = [], lines = new Map();
        for (const s of segments) { const key = `${s[0]}${s[1]}`; if (!lines.has(key)) lines.set(key, []); lines.get(key).push(s); }
        for (const list of lines.values()) {
            list.sort((a, b) => a[2] - b[2]);
            let cur = [...list[0]];
            for (const s of list.slice(1)) { if (s[2] - cur[3] < 1) cur[3] = s[3]; else { runs.push(cur); cur = [...s]; } }
            runs.push(cur);
        }
        const weights = runs.map((r) => r[3] - r[2]), total = weights.reduce((a, b) => a + b, 0);
        const pickRun = () => { let x = rnd() * total; for (let k = 0; k < runs.length; k++) { x -= weights[k]; if (x <= 0) return runs[k]; } return runs[runs.length - 1]; };
        const n = high ? 900 : 400;
        for (let k = 0; k < n; k++) {
            const s = pickRun(), forward = rnd() < 0.5, lane = (rnd() < 0.5 ? 3.2 : 7.6) * (forward ? -1 : 1);
            cars.push({ s, forward, lane, t: rnd(), speed: (11 + rnd() * 6) / (s[3] - s[2]) });
        }
        const body = new RoundedBoxGeometry(4.6, 1.3, 2.0, 2, 0.45).translate(0, 0.95, 0);
        const cabin = new RoundedBoxGeometry(2.6, 0.9, 1.8, 2, 0.4).translate(-0.3, 1.9, 0);
        const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1 });
        cars.body = new THREE.InstancedMesh(body, paint, n);
        cars.cabin = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.05, metalness: 0.9 }), n);
        cars.head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.25, 1.6).translate(2.32, 1.05, 0), M.light(0xfff2d0, 3), n);
        cars.tail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.25, 1.6).translate(-2.32, 1.1, 0), M.light(0xff2010, 3), n);
        const PAINT = [0xf2f2f0, 0x1c1f24, 0x8a9199, 0xc1c6cb, 0x26456e, 0x8c1c1c, 0xf2f2f0, 0x3b3f45];
        cars.forEach((c, k) => cars.body.setColorAt(k, new THREE.Color(PAINT[k % PAINT.length])));
        for (const m of [cars.body, cars.cabin]) { m.castShadow = true; scene.add(m); }
        scene.add(cars.head, cars.tail);
    }
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    function moveCars(dt) {
        cars.forEach((c, k) => {
            c.t = (c.t + c.speed * dt) % 1;
            const [axis, fixed, a, b] = c.s, along = lerp(a, b, c.forward ? c.t : 1 - c.t);
            const dir = c.forward ? 1 : -1;
            if (axis === 'x') { v3.set(along, GROUND + 0.12, fixed + c.lane); q4.setFromAxisAngle(up, dir > 0 ? 0 : Math.PI); }
            else { v3.set(fixed - c.lane, GROUND + 0.12, along); q4.setFromAxisAngle(up, dir > 0 ? -Math.PI / 2 : Math.PI / 2); }
            m4.compose(v3, q4, one);
            cars.body.setMatrixAt(k, m4); cars.cabin.setMatrixAt(k, m4); cars.head.setMatrixAt(k, m4); cars.tail.setMatrixAt(k, m4);
        });
        for (const m of [cars.body, cars.cabin, cars.head, cars.tail]) m.instanceMatrix.needsUpdate = true;
    }

    // ── Air taxis: quiet electric craft circling the towers ─────────────────
    const taxis = [];
    {
        const n = 34;
        const hull = mergeGeometries([prep(new THREE.SphereGeometry(2.2, 16, 10).scale(1.8, 0.7, 1)), ...[[-3, -3], [3, -3], [-3, 3], [3, 3]].map(([x, z]) => prep(new THREE.CylinderGeometry(1.8, 1.8, 0.2, 16).translate(x, 0.8, z)))]);
        taxis.hull = new THREE.InstancedMesh(hull, M.white, n);
        taxis.glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6).translate(0, -0.9, 0), M.light(0x5ce8ff, 5), n);
        for (let k = 0; k < n; k++) taxis.push({ r: 220 + rnd() * 700, y: 90 + rnd() * 220, w: (0.025 + rnd() * 0.03) * (rnd() < 0.5 ? 1 : -1), p: rnd() * 6.28, e: 0.6 + rnd() * 0.4, cx: CORE[0] + (rnd() - 0.5) * 300, cz: CORE[1] + (rnd() - 0.5) * 300 });
        taxis.hull.castShadow = true;
        scene.add(taxis.hull, taxis.glow);
    }
    function moveTaxis(t) {
        taxis.forEach((a, k) => {
            const ang = a.p + t * a.w, x = a.cx + Math.cos(ang) * a.r, z = a.cz + Math.sin(ang) * a.r * a.e, y = a.y + Math.sin(t * 0.3 + a.p) * 8;
            q4.setFromAxisAngle(up, -ang - (a.w > 0 ? Math.PI / 2 : -Math.PI / 2));
            m4.compose(v3.set(x, y, z), q4, one);
            taxis.hull.setMatrixAt(k, m4); taxis.glow.setMatrixAt(k, m4);
        });
        taxis.hull.instanceMatrix.needsUpdate = taxis.glow.instanceMatrix.needsUpdate = true;
    }

    // ── Steam and the barrage's churn: soft sprites rising and fading ───────
    const puffs = [];
    {
        const tex = softDot();
        const make = (at, kind) => {
            const n = kind === 'steam' ? 10 : 5;
            for (let k = 0; k < n; k++) {
                const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, fog: true }));
                scene.add(s);
                puffs.push({ s, at, kind, age: k / n });
            }
        };
        steamVents.forEach((v) => make(v, 'steam'));
        foamSpots.forEach((v) => make(v, 'foam'));
    }
    function movePuffs(dt) {
        for (const p of puffs) {
            p.age = (p.age + dt / (p.kind === 'steam' ? 14 : 3)) % 1;
            const a = p.age, [x, y, z, r = 8] = p.at;
            if (p.kind === 'steam') {
                p.s.position.set(x - 60 * a, y + 4 + 160 * a, z - 20 * a);
                p.s.scale.setScalar(r * 1.6 + 120 * a);
                p.s.material.opacity = Math.min(1, a * 5) * (1 - a) * 0.75;
            } else {
                p.s.position.set(x + Math.sin(a * 9 + x) * 4, y + 2 * a, z + 18 * a);
                p.s.scale.setScalar(10 + 20 * a);
                p.s.material.opacity = Math.min(1, a * 4) * (1 - a) * 0.8;
            }
        }
    }

    // ── Post: bloom on the lights and the sun's glints, then the tone curve ─
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    // the sun's disc is brighter than a half-float can hold: cap it, so the bloom can't smear it across the frame
    composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = clamp(c, 0.0, 24.0); }',
    }));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.6, 3.6);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ── The flight ──────────────────────────────────────────────────────────
    const posCurve = new THREE.CatmullRomCurve3(FLIGHT.map(([p]) => new THREE.Vector3(...p)), false, 'centripetal');
    const lookCurve = new THREE.CatmullRomCurve3(FLIGHT.map(([, l]) => new THREE.Vector3(...l)), false, 'centripetal');
    let goal = 0, now = 0;
    const look = new THREE.Vector3();
    function placeCamera(t) {
        const u = Math.min(1, Math.max(0, now));
        posCurve.getPointAt(u, camera.position);
        lookCurve.getPointAt(u, look);
        // a breath of drift, so the frame is never quite still
        if (!still) { camera.position.y += Math.sin(t * 0.4) * 1.5; camera.position.x += Math.sin(t * 0.23) * 2; }
        camera.lookAt(look);
        // the sun's shadows follow what the camera is looking at
        const focus = look.clone().lerp(camera.position, 0.35);
        focus.y = GROUND;
        sun.position.copy(focus).addScaledVector(sunDir, 2500);
        sun.target.position.copy(focus);
        sun.target.updateMatrixWorld();
    }

    function resize() {
        const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
        renderer.setSize(w, h, false);
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
        camera.aspect = w / h;
        // a wider lens on a tall phone screen
        camera.fov = w / h < 0.8 ? 68 : 50;
        camera.updateProjectionMatrix();
    }
    resize();
    new ResizeObserver(resize).observe(stage);

    const clock = new THREE.Clock();
    let time = 0;
    function frame(dt) {
        time += dt;
        now += (goal - now) * (1 - Math.exp(-dt * 3.2));
        if (Math.abs(goal - now) < 1e-5) now = goal;
        placeCamera(time);
        if (!still) {
            moveCars(dt); moveTaxis(time); movePuffs(dt);
            conduitTex.offset.y -= dt * 0.8;
            plasma.material.color.setHSL(0.75 + Math.sin(time * 0.7) * 0.03, 1, 0.5).multiplyScalar(5);
        }
        rotors.forEach((r, n) => {
            q4.setFromEuler(new THREE.Euler(0, r.yaw, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), r.phase + (still ? 0 : time * r.speed)));
            rotors.mesh.setMatrixAt(n, m4.compose(r.at, q4, one));
        });
        rotors.mesh.instanceMatrix.needsUpdate = true;
        if (water.material.uniforms?.time) water.material.uniforms.time.value += still ? 0 : dt * 0.6;
        composer.render(dt);
    }
    moveCars(0); moveTaxis(0); movePuffs(0.01);
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); frame(Math.min(0.1, clock.getDelta())); };
    if (still) frame(0); else loop();

    return {
        scrollDriven: true,
        camera, renderer, scene,
        setProgress(p, jump = false) {
            goal = Math.min(1, Math.max(0, p));
            if (jump) now = goal;
            if (still) frame(0);
        },
        draw: () => frame(0),
        stop: () => cancelAnimationFrame(raf),
    };
}
