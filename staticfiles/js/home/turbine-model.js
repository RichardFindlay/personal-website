// The turbine itself: a geared wind turbine of about 4 MW, built part by part
// the way the real machine is, for turbine.js to draw and take apart. Every
// part is a node with a rest place and the moves it makes at each stage of the
// scroll; names are what the callouts point at.
//
// Metres. x runs along the drivetrain (the hub upwind at -x), y up, z across.
// The tower top's flange is at y = 0. The drivetrain and the rotor tilt 5°
// up toward the hub.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const HUB = V(-4.6, 2.75, 0);        // the hub's centre
export const TILT = (5 * Math.PI) / 180;

// ── Geometry helpers ────────────────────────────────────────────────────────
function nonIndexed(g) {
    const o = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
    if (!o.attributes.uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    if (!o.attributes.normal) o.computeVertexNormals();
    return o;
}
const merge = (...list) => mergeGeometries(list.flat(Infinity).filter(Boolean).map(nonIndexed));
// a turned body about x from [x, r] points; about y with turnedY
function turned(profile, segments = 64) {
    const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0001), x)), segments);
    return g.rotateZ(-Math.PI / 2);
}
const turnedY = (profile, segments = 64) => new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(Math.max(r, 0.0001), y)), segments);
const ringX = (rIn, rOut, w, segments = 72) => turned([[0, rIn], [0, rOut], [w, rOut], [w, rIn], [0, rIn]], segments);
const ringY = (rIn, rOut, h, segments = 72) => turnedY([[0, rIn], [0, rOut], [h, rOut], [h, rIn], [0, rIn]], segments);
const cylX = (r, x0, x1, s = 32) => new THREE.CylinderGeometry(r, r, x1 - x0, s).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, 0, 0);
const cylY = (r, y0, y1, s = 32, r1 = r) => new THREE.CylinderGeometry(r1, r, y1 - y0, s).translate(0, (y0 + y1) / 2, 0);
const cylZ = (r, z0, z1, s = 32) => new THREE.CylinderGeometry(r, r, z1 - z0, s).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
function extrudeX(shape, width, { bevel = 0, curve = 24 } = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: curve });
    return g.rotateY(Math.PI / 2);   // along +x from 0 to width; the shape's x becomes -z
}
const extrudeZ = (shape, depth, opts = {}) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16, ...opts }).translate(0, 0, -depth / 2);
function rbox(w, h, d, r = 0.05) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const b = Math.min(r, d / 4);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 5 });
    return g.translate(0, 0, -(d - 2 * b) / 2);
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const circlePath = (x, y, r, cw = true) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, cw); return p; };
function roundRectShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
}
// a disc about x with a bore and a circle of holes
function holedDisc(rIn, rOut, w, holes = [], segments = 96) {
    const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, TAU, false);
    if (rIn > 0) s.holes.push(circlePath(0, 0, rIn));
    for (const { n, r, d, a0 = 0 } of holes) for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; s.holes.push(circlePath(Math.cos(a) * r, Math.sin(a) * r, d / 2)); }
    return extrudeX(s, w, { curve: segments / 4 });
}
// twist a body about x as it runs along x: helical teeth
function twistX(g, angle, x0, x1) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const t = (p.getX(i) - x0) / (x1 - x0), a = angle * t, y = p.getY(i), z = p.getZ(i);
        p.setY(i, y * Math.cos(a) - z * Math.sin(a)); p.setZ(i, y * Math.sin(a) + z * Math.cos(a));
    }
    g.computeVertexNormals();
    return g;
}
// a gear about x from x = 0 to width: involute-like teeth with root fillets and tip lands,
// helical if `helix` (radians of twist across the face), with an optional web and hub
function gear({ teeth, r, h = 0.05, width, bore = 0, internal = false, rOut = 0, helix = 0, web = null }) {
    const per = TAU / teeth, prof = [[0, 0], [0.05, 0.08], [0.11, 0.42], [0.16, 0.78], [0.21, 1], [0.37, 1], [0.42, 0.78], [0.47, 0.42], [0.53, 0.08], [0.58, 0]];
    const pts = [];
    for (let i = 0; i < teeth; i++) for (const [f, k] of prof) { const a = (i + f) * per, rr = internal ? r - h * k : r + h * k; pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
    let g;
    if (internal) {
        const outer = new THREE.Shape(); outer.absarc(0, 0, rOut, 0, TAU, false);
        outer.holes.push(new THREE.Path(pts.slice().reverse()));
        g = extrudeX(outer, width, { curve: 48 });
    } else if (web) {
        // a rim with the teeth, a thinner web with lightening holes, a hub
        const rim = new THREE.Shape(pts); rim.holes.push(circlePath(0, 0, r - web.rim));
        const webShape = new THREE.Shape(); webShape.absarc(0, 0, r - web.rim + 0.005, 0, TAU, false); webShape.holes.push(circlePath(0, 0, web.hub));
        for (let i = 0; i < web.holes; i++) { const a = (i / web.holes) * TAU; webShape.holes.push(circlePath(Math.cos(a) * (web.hub + r - web.rim) / 2, Math.sin(a) * (web.hub + r - web.rim) / 2, (r - web.rim - web.hub) * 0.3)); }
        const hub = new THREE.Shape(); hub.absarc(0, 0, web.hub, 0, TAU, false); if (bore) hub.holes.push(circlePath(0, 0, bore));
        g = merge(twistX(extrudeX(rim, width, { curve: 48 }), helix, 0, width), extrudeX(webShape, width * 0.35).translate(width * 0.325, 0, 0), extrudeX(hub, width * 1.2).translate(-width * 0.1, 0, 0));
        return g;
    } else {
        const s = new THREE.Shape(pts); if (bore) s.holes.push(circlePath(0, 0, bore));
        g = extrudeX(s, width, { curve: 24 });
    }
    return helix ? twistX(g, helix, 0, width) : g;
}
// bolt heads with washers on a circle about x, at x, heads toward +x (facing 1) or -x
function bolts(n, r, x, { size = 0.03, facing = 1, a0 = 0, stud = false } = {}) {
    const f = facing, parts = [
        cylX(size * 1.7, 0, size * 0.25, 14).translate(f > 0 ? 0 : -size * 0.25, 0, 0),
        cylX(size, 0, size * 0.75, 6).translate(f > 0 ? size * 0.25 : -size, 0, 0),
    ];
    if (stud) parts.push(cylX(size * 0.55, 0, size * 0.6, 8).translate(f > 0 ? size : -size * 1.6, 0, 0));
    const head = merge(parts);
    const out = [];
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; out.push(head.clone().translate(x, Math.cos(a) * r, Math.sin(a) * r)); }
    return merge(out);
}
// the same, standing up: about y at height y, heads toward +y
const boltsY = (n, r, y, opts) => bolts(n, r, 0, opts).rotateZ(Math.PI / 2).translate(0, y, 0);
// a row of bolts along a line, heads toward `normal` (x, y or z)
function boltRow(from, to, n, { size = 0.025, normal = 'y' } = {}) {
    const head = merge(cylY(size * 1.6, 0, size * 0.22, 12), cylY(size, size * 0.22, size * 0.9, 6));
    const rot = normal === 'x' ? (g) => g.rotateZ(-Math.PI / 2) : normal === 'z' ? (g) => g.rotateX(Math.PI / 2) : normal === '-z' ? (g) => g.rotateX(-Math.PI / 2) : normal === '-x' ? (g) => g.rotateZ(Math.PI / 2) : (g) => g;
    const out = [];
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); out.push(rot(head.clone()).translate(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t)); }
    return merge(out);
}
// a pipe or cable along points
const pipe = (points, r, seg = 0) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => V(...p)), false, 'catmullrom', 0.1), seg || points.length * 14, r, 8, false);
// a finned electric motor along +y from y0, with a fan cowl, terminal box and flange
function motorY(r, len, y0 = 0) {
    const fins = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; fins.push(box(0.012, len * 0.8, r * 0.18).translate(0, y0 + len * 0.45, r + r * 0.07).rotateY(a)); }
    return merge(
        cylY(r * 1.18, y0, y0 + 0.03, 32),                               // mounting flange
        cylY(r, y0 + 0.03, y0 + len, 32),
        fins,
        cylY(r * 1.06, y0 + len, y0 + len + r * 0.6, 32, r * 0.9),       // the fan cowl
        ...[0.2, 0.4].map((f) => new THREE.TorusGeometry(r * (0.9 - f), 0.006, 4, 32).rotateX(Math.PI / 2).translate(0, y0 + len + r * 0.6 + 0.002, 0)),
        rbox(r * 0.7, r * 0.5, r * 0.55, 0.01).translate(0, y0 + len * 0.6, r * 1.3),   // terminal box
        cylZ(r * 0.12, r * 1.55, r * 1.75, 10).translate(0, y0 + len * 0.6, 0),         // its gland
    );
}
// a planetary reduction gearbox along +y: stepped cylinders with bolted flanges
function gearheadY(r, len, y0 = 0, steps = 3) {
    const out = [];
    for (let i = 0; i < steps; i++) {
        const a = y0 + (len / steps) * i, b = a + len / steps, rr = r * (1 - i * 0.08);
        out.push(cylY(rr, a, b - 0.012, 36), cylY(rr * 1.12, b - 0.03, b, 36), boltsY(10, rr * 1.04, b, { size: 0.012 }));
    }
    return merge(out);
}
// a cabinet with a door, a handle and vents, standing on its base at the origin, door toward +z
function cabinet(w, h, d, { vents = true } = {}) {
    const door = rbox(w - 0.06, h - 0.08, 0.02, 0.01).translate(0, h / 2, d / 2 + 0.01);
    const parts = [rbox(w, h, d, 0.015).translate(0, h / 2, 0), door, box(0.02, 0.16, 0.03).translate(w / 2 - 0.08, h * 0.55, d / 2 + 0.035),
        cylZ(0.012, d / 2, d / 2 + 0.03, 8).translate(-w / 2 + 0.04, h * 0.2, 0), cylZ(0.012, d / 2, d / 2 + 0.03, 8).translate(-w / 2 + 0.04, h * 0.8, 0)];
    if (vents) for (let i = 0; i < 6; i++) parts.push(box(w * 0.5, 0.012, 0.012).translate(0, h * 0.12 + i * 0.03, d / 2 + 0.025));
    return merge(parts);
}
// a handrail along points (on a deck), posts every `step`
function handrail(points, { height = 1.1, r = 0.022, step = 1.2 } = {}) {
    const top = points.map(([x, y, z]) => [x, y + height, z]), mid = points.map(([x, y, z]) => [x, y + height * 0.5, z]);
    const posts = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = V(...points[i]), b = V(...points[i + 1]), n = Math.max(1, Math.round(a.distanceTo(b) / step));
        for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); posts.push(cylY(r, p.y, p.y + height, 8).translate(p.x, 0, p.z)); }
    }
    return merge(pipe(top, r, top.length * 8), pipe(mid, r * 0.8, mid.length * 8), posts);
}
// an open grating panel, w × d, its top at y = 0
function grating(w, d, pitch = 0.06) {
    const out = [rbox(w, 0.04, 0.03, 0.005).translate(0, -0.02, d / 2), rbox(w, 0.04, 0.03, 0.005).translate(0, -0.02, -d / 2),
        rbox(0.03, 0.04, d, 0.005).translate(w / 2, -0.02, 0), rbox(0.03, 0.04, d, 0.005).translate(-w / 2, -0.02, 0)];
    for (let z = -d / 2 + pitch; z < d / 2; z += pitch) out.push(box(w, 0.03, 0.006).translate(0, -0.015, z));
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.3) out.push(box(0.006, 0.02, d).translate(x, -0.01, 0));
    return merge(out);
}
// louvres: slanted slats in a frame on a face whose normal is +z
function louvre(w, h, n = 8) {
    const out = [rbox(w, 0.04, 0.04, 0.008).translate(0, h / 2, 0), rbox(w, 0.04, 0.04, 0.008).translate(0, -h / 2, 0), rbox(0.04, h, 0.04, 0.008).translate(w / 2, 0, 0), rbox(0.04, h, 0.04, 0.008).translate(-w / 2, 0, 0)];
    for (let i = 0; i < n; i++) out.push(box(w - 0.04, 0.012, h / n * 1.1).rotateX(-0.6).translate(0, -h / 2 + (i + 0.5) * (h / n), 0.01));
    return merge(out);
}
// an I-beam along x, w wide, h deep
function iBeam(len, h, w, t = 0.02) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, -h / 2 + t); s.lineTo(t / 2, -h / 2 + t); s.lineTo(t / 2, h / 2 - t); s.lineTo(w / 2, h / 2 - t);
    s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, h / 2 - t); s.lineTo(-t / 2, h / 2 - t); s.lineTo(-t / 2, -h / 2 + t); s.lineTo(-w / 2, -h / 2 + t);
    return extrudeX(s, len);
}
// a U-channel cable tray along x with cables lying in it
function cableTray(len, w = 0.3, nCables = 4) {
    const s = new THREE.Shape(), h = 0.08, t = 0.006;
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(w / 2 - t, h); s.lineTo(w / 2 - t, t); s.lineTo(-w / 2 + t, t); s.lineTo(-w / 2 + t, h); s.lineTo(-w / 2, h);
    const out = [extrudeX(s, len)];
    for (let i = 0; i < nCables; i++) { const z = -w / 2 + (i + 0.5) * (w / nCables); out.push(cylX(0.022, 0, len, 10).translate(0, 0.03, z)); }
    for (let x = 0.3; x < len; x += 0.6) out.push(box(0.03, 0.01, w * 1.1).translate(x, -0.01, 0));
    return merge(out);
}
// lifting eye: a ring standing on a boss
const liftingEye = (r = 0.06) => merge(new THREE.TorusGeometry(r, r * 0.3, 8, 20).translate(0, r * 1.3, 0), cylY(r * 0.5, 0, r * 0.5, 12));

// ── The blade: a smooth loft from a round root to a thin, twisted tip ───────
const BLADE = { L: 58, root: 2.03 };
function bladeShape(t) {
    const chord = t < 0.05 ? 2.3 : t < 0.22 ? 2.3 + (4.1 - 2.3) * Math.sin(((t - 0.05) / 0.17) * Math.PI / 2) : 4.1 * (1 - (t - 0.22) / 0.78) ** 0.9 + 0.5;
    const thick = t < 0.05 ? 1 : t < 0.3 ? 1 - 0.7 * ((t - 0.05) / 0.25) : 0.3 - 0.12 * ((t - 0.3) / 0.7);
    const twist = 0.24 * (1 - Math.min(1, t / 0.7));
    const round = 1 - Math.min(1, Math.max(0, (t - 0.03) / 0.17)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (t - 0.03) / 0.17)));
    // a flat-backed trailing edge inboard, closing to sharp by mid-span
    const flatback = 0.06 * Math.max(0, 1 - t / 0.45);
    return { chord, thick, twist, round, flatback };
}
function bladePoint(t, u) {
    const { chord: c, thick: th, twist: tw, round, flatback } = bladeShape(t);
    const xc = (1 - Math.cos(u)) / 2, upper = Math.sin(u) >= 0;
    const half = 5 * th * 0.2 * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4) / 0.2 * 0.5 + flatback * xc ** 3;
    const camber = 0.03 * Math.sin(Math.PI * xc);
    let ax = (xc - 0.3) * c, az = (camber + (upper ? half : -half)) * c;
    ax = ax * (1 - round) + Math.cos(u) * 1.15 * round; az = az * (1 - round) + Math.sin(u) * 1.15 * round;
    return V(ax * Math.cos(tw) - az * Math.sin(tw), BLADE.root + t * BLADE.L, ax * Math.sin(tw) + az * Math.cos(tw));
}
function bladeGeometry() {
    const N = 70, K = 56, pos = [], idx = [];
    for (let i = 0; i < N; i++) { const t = (i / (N - 1)) ** 1.7; for (let j = 0; j < K; j++) pos.push(...bladePoint(t, (j / K) * TAU).toArray()); }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < K; j++) {
        const a = i * K + j, b = i * K + ((j + 1) % K), c = (i + 1) * K + j, d = (i + 1) * K + ((j + 1) % K);
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
// vortex generators: pairs of small fins on the suction side, inboard, where the flow would separate
function vortexGenerators() {
    const fin = new THREE.BufferGeometry();
    fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.004, 0.1, 0, -0.004, 0.1, 0.05, -0.004, 0, 0, 0.004, 0.1, 0.05, 0.004, 0.1, 0, 0.004, 0, 0, -0.004, 0, 0, 0.004, 0.1, 0.05, 0.004, 0, 0, -0.004, 0.1, 0.05, 0.004, 0.1, 0.05, -0.004], 3));
    fin.computeVertexNormals();
    const out = [];
    const u = Math.acos(1 - 2 * 0.28);   // 28 % chord, suction side
    for (let y = 4.2; y < 15; y += 0.32) {
        const t = (y - BLADE.root) / BLADE.L, p = bladePoint(t, u), pu = bladePoint(t, u + 0.01), py = bladePoint(t + 0.002, u);
        const along = pu.clone().sub(p).normalize().negate(), span = py.clone().sub(p).normalize(), normal = new THREE.Vector3().crossVectors(along, span).normalize();
        if (normal.z < 0) normal.negate();
        for (const [toe, off] of [[0.3, -0.05], [-0.3, 0.05]]) {
            const m = new THREE.Matrix4().makeBasis(along.clone().applyAxisAngle(normal, toe), normal, new THREE.Vector3().crossVectors(along.clone().applyAxisAngle(normal, toe), normal));
            m.setPosition(p.clone().addScaledVector(span, off));
            out.push(fin.clone().applyMatrix4(m));
        }
    }
    return merge(out);
}

// ── The spinner ─────────────────────────────────────────────────────────────
// A surface of revolution sampled finely, with a round opening cut where each
// blade passes through, a rolled rim on every opening, seams between the panels
const SPINNER = [[-2.62, 0], [-2.58, 0.25], [-2.45, 0.6], [-2.1, 1.25], [-1.5, 1.85], [-0.6, 2.25], [0.3, 2.36], [0.9, 2.3], [1.0, 2.2]];
const spinnerR = (x) => { for (let i = 1; i < SPINNER.length; i++) if (x <= SPINNER[i][0]) { const [x0, r0] = SPINNER[i - 1], [x1, r1] = SPINNER[i], t = (x - x0) / (x1 - x0), s = t * t * (3 - 2 * t); return r0 + (r1 - r0) * (0.5 * t + 0.5 * s); } return SPINNER[SPINNER.length - 1][1]; };
const OPENING = 0.5;   // the openings' half-angle, seen from the hub's centre
function spinnerGeometry() {
    const NX = 110, NA = 240, x0 = -2.62, x1 = 1.0, pos = [];
    const axes = [0, 1, 2].map((b) => V(0, Math.cos((b / 3) * TAU), Math.sin((b / 3) * TAU)));
    const pt = (i, j) => { const x = x0 + ((x1 - x0) * i) / NX, a = (j / NA) * TAU, r = spinnerR(x); return V(x, Math.cos(a) * r, Math.sin(a) * r); };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NA; j++) {
        const q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
        const c = q.reduce((s, v) => s.add(v), V(0, 0, 0)).multiplyScalar(0.25).normalize();
        if (axes.some((ax) => c.dot(ax) > Math.cos(OPENING))) continue;
        for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...q[k].toArray());
    }
    const shell = new THREE.BufferGeometry();
    shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shell.computeVertexNormals();
    // each opening's rim: walk round the cone of the opening and find where it meets the surface
    const rims = axes.map((ax) => {
        const e1 = V(1, 0, 0), e2 = new THREE.Vector3().crossVectors(ax, e1), pts = [];
        for (let k = 0; k <= 96; k++) {
            const f = (k / 96) * TAU, d = ax.clone().multiplyScalar(Math.cos(OPENING)).addScaledVector(e1, Math.sin(OPENING) * Math.cos(f)).addScaledVector(e2, Math.sin(OPENING) * Math.sin(f));
            let lo = 0.3, hi = 4;
            for (let n = 0; n < 40; n++) { const t = (lo + hi) / 2, q = d.clone().multiplyScalar(t); if (Math.hypot(q.y, q.z) < spinnerR(q.x)) lo = t; else hi = t; }
            pts.push(d.clone().multiplyScalar(lo).toArray());
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), true), 160, 0.035, 8, true);
    });
    const meridian = (ang) => SPINNER.filter(([x]) => x > -2.3 && x < 0.95).map(([x, r]) => [x, Math.cos(ang) * (r + 0.012), Math.sin(ang) * (r + 0.012)]);
    return merge(shell, rims,
        [0, 1, 2].map((b) => pipe(meridian((b / 3) * TAU + Math.PI / 3), 0.018, 80)),
        new THREE.TorusGeometry(spinnerR(-2.08) + 0.01, 0.022, 6, 120).rotateY(Math.PI / 2).translate(-2.08, 0, 0),
        cylX(0.02, -2.95, -2.6, 8), new THREE.SphereGeometry(0.035, 10, 8).translate(-2.97, 0, 0));
}

// ── The turbine ─────────────────────────────────────────────────────────────
export function buildTurbine(M) {
    const root = new THREE.Group();
    const parts = [];
    const part = (geo, mat, parent, { name, moves = [], at: pos = [0, 0, 0], rot } = {}) => {
        const obj = geo instanceof THREE.Object3D ? geo : new THREE.Mesh(geo, mat);
        obj.name = name || '';
        obj.position.set(...pos);
        if (rot) obj.rotation.set(...rot);
        obj.userData.rest = obj.position.clone();
        obj.userData.moves = moves.map(([stage, by]) => ({ stage, by: V(...by) }));
        parent.add(obj);
        parts.push(obj);
        return obj;
    };
    const group = (parent, opts) => part(new THREE.Group(), null, parent, opts);

    // ── Tower top ───────────────────────────────────────────────────────────
    const tower = group(root, { name: 'tower' });
    part(merge(turnedY([[-26, 2.3], [-0.2, 1.86]], 128)), M.white, tower, { name: 'tower shell' });
    // weld seams between the rolled cans, and a bolted section joint lower down
    part(merge([-2.6, -5.2, -7.8, -10.4, -15.6, -18.2, -20.8].map((y) => new THREE.TorusGeometry(1.86 + (-y / 26) * 0.44 + 0.004, 0.008, 4, 128).rotateX(Math.PI / 2).translate(0, y, 0))), M.mid, tower, { name: 'weld seams' });
    part(merge(ringY(2.0 + 0.09, 2.18, 0.12, 128).translate(0, -13.1, 0), boltsY(96, 2.12, -12.98, { size: 0.022 })), M.light, tower, { name: 'tower section flange' });
    part(merge(ringY(1.62, 2.0, 0.2, 128).translate(0, -0.2, 0), boltsY(120, 1.72, 0.0, { size: 0.02, stud: true })), M.light, tower, { name: 'tower flange' });

    // ── Yaw system: bearing with its gear ring, brake disc and calipers, drives ──
    const yaw = group(root, { name: 'yaw system', moves: [['yaw', [0, -1.2, 0]]] });
    part(gear({ teeth: 150, r: 2.14, h: 0.055, width: 0.2, bore: 2.03 }).rotateZ(Math.PI / 2), M.light, yaw, { name: 'yaw ring gear', moves: [['yaw', [0, -0.6, 0]]] });
    part(merge(ringY(1.66, 2.02, 0.2, 128), boltsY(96, 1.86, 0.2, { size: 0.02 })), M.mid, yaw, { name: 'yaw inner ring', moves: [['yaw', [0, 0.7, 0]]] });
    part(merge([0.07, 0.14].map((y) => new THREE.TorusGeometry(2.03, 0.022, 6, 180).rotateX(Math.PI / 2).translate(0, y, 0))), M.dark, yaw, { name: 'yaw balls', moves: [['yaw', [0, 0.25, 0]]] });
    // the brake disc below the gear, and ten hydraulic calipers gripping it
    part(ringY(1.6, 2.08, 0.04, 128).translate(0, -0.3, 0), M.mid, yaw, { name: 'yaw brake disc', moves: [['yaw', [0, -1.0, 0]]] });
    const caliper = merge(rbox(0.26, 0.22, 0.2, 0.02).translate(0, -0.28, 0), cylY(0.05, -0.12, 0.0, 16).translate(0, 0, 0.04), cylY(0.05, -0.12, 0.0, 16).translate(0, 0, -0.04), pipe([[0, -0.2, 0.1], [0, -0.1, 0.25], [0, 0.1, 0.3]], 0.012));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.15; part(caliper.clone().rotateY(-a + Math.PI / 2), M.dark, yaw, { name: 'yaw brake', at: [Math.cos(a) * 1.92, 0, Math.sin(a) * 1.92], moves: [['yaw', [Math.cos(a) * 0.5, -0.4, Math.sin(a) * 0.5]]] }); }
    // eight drives: finned motor, brake, three-stage gearhead, pinion in the ring's teeth
    const drive = merge(
        gear({ teeth: 15, r: 0.12, h: 0.04, width: 0.18 }).rotateZ(Math.PI / 2).translate(0, -0.02, 0),
        cylY(0.06, 0.16, 0.24, 16),
        gearheadY(0.17, 0.62, 0.24, 3),
        cylY(0.23, 0.86, 0.9, 36), boltsY(8, 0.21, 0.9, { size: 0.014 }),
        cylY(0.14, 0.9, 1.0, 28),                                     // the motor's brake
        motorY(0.16, 0.42, 1.0),
    );
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        part(drive.clone(), M.white, yaw, { name: 'yaw drive', at: [Math.cos(a) * 2.34, 0.04, Math.sin(a) * 2.34], moves: [['yaw', [Math.cos(a) * 1.0, 0.7, Math.sin(a) * 1.0]]] });
    }

    // ── The nacelle's structure ─────────────────────────────────────────────
    const nacelle = group(root, { name: 'nacelle' });
    const bedplate = group(nacelle, { name: 'bedplate', moves: [['explode', [0, -0.4, 0]]] });
    // the cast front bedplate: two cheeks with lightening holes, a deck, a round foot on the yaw bearing
    const cheek = new THREE.Shape();
    cheek.moveTo(-2.7, 0.3); cheek.lineTo(2.2, 0.3); cheek.lineTo(2.2, 0.95); cheek.quadraticCurveTo(0.4, 1.15, -0.9, 1.75); cheek.lineTo(-2.7, 1.95); cheek.lineTo(-2.7, 0.3);
    cheek.holes.push(circlePath(-1.7, 1.05, 0.38), circlePath(0.15, 0.78, 0.28), circlePath(1.45, 0.66, 0.2));
    for (const z of [-1.08, 1.08]) part(extrudeZ(cheek, 0.16, { bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }).translate(0, 0, z), M.light, bedplate, { name: 'cast bedplate' });
    part(merge(rbox(4.9, 0.12, 2.3, 0.03).translate(-0.25, 0.36, 0), rbox(0.16, 1.5, 2.3, 0.03).translate(-2.62, 1.12, 0), rbox(0.16, 0.6, 2.3, 0.03).translate(2.12, 0.62, 0)), M.light, bedplate, { name: 'bedplate deck' });
    part(merge(ringY(1.62, 2.0, 0.1, 128).translate(0, 0.2, 0), boltsY(96, 1.86, 0.3, { size: 0.018 })), M.mid, bedplate, { name: 'bedplate foot' });
    // ribs between the cheeks and the deck
    for (const x of [-2.2, -1.2, -0.2, 0.8, 1.7]) for (const z of [-0.82, 0.82]) {
        const rib = new THREE.Shape(); rib.moveTo(0, 0); rib.lineTo(0.0, 0.42); rib.lineTo(0.26 * Math.sign(-z), 0); rib.lineTo(0, 0);
        part(extrudeZ(rib, 0.04).rotateY(Math.PI / 2).translate(x, 0.42, z), M.mid, bedplate, { name: 'bedplate rib' });
    }
    // the rotor lock: two hydraulic pins on brackets, aimed at the holes in the lock disc
    for (const s of [-1, 1]) part(merge(rbox(0.3, 0.5, 0.18, 0.02).translate(0, 0, 0), cylX(0.1, 0.0, 0.42, 20).translate(0.06, 0.12, 0), cylX(0.045, -0.24, 0.06, 16).translate(0, 0.12, 0), pipe([[0.4, 0.2, 0], [0.55, 0.35, 0.1], [0.7, 0.36, 0.3]], 0.012)), M.dark, bedplate, { name: 'rotor lock pin', at: [-2.1, 1.4, s * 0.74], moves: [['bearing', [0.4, 0, s * 0.4]]] });
    // the rear frame: I-beams, cross members, braces, walkway gratings and a hatch
    for (const z of [-1.05, 1.05]) part(iBeam(7.6, 0.4, 0.22, 0.025).translate(2.1, 0.62, z), M.white, bedplate, { name: 'rear frame' });
    for (const x of [2.6, 4.3, 6.0, 7.7, 9.5]) part(iBeam(2.1, 0.3, 0.16, 0.02).rotateY(Math.PI / 2).translate(x, 0.62, 1.05), M.mid, bedplate, { name: 'cross member' });
    for (const [x0, x1] of [[2.6, 4.3], [6.0, 7.7]]) part(box(Math.hypot(x1 - x0, 2.1), 0.08, 0.06).rotateY(Math.atan2(2.1, x1 - x0)).translate((x0 + x1) / 2, 0.5, 0), M.mid, bedplate, { name: 'brace' });
    for (const z of [-1.62, 1.62]) part(grating(7.4, 0.95).translate(5.85, 0.86, z), M.mid, bedplate, { name: 'walkway grating' });
    for (const z of [-1.62, 1.62]) for (let x = 2.4; x < 9.6; x += 1.4) part(box(0.06, 0.3, 0.95).translate(x, 0.68, z), M.mid, bedplate, { name: 'grating bracket' });
    // the cable loop down into the tower, and cable trays along both sides
    part(merge([-0.18, -0.06, 0.06, 0.18].map((dz) => pipe([[1.6, 1.25, -1.6 + dz], [0.8, 1.0, -1.0 + dz], [0.2 + dz, 0.4, -0.2], [0 + dz * 0.6, -0.6, 0], [dz * 0.6, -2.5, 0]], 0.035))), M.dark, bedplate, { name: 'cable loop', moves: [['yaw', [0, 0, 0]]] });
    for (const z of [-1.98, 1.98]) part(cableTray(9.4, 0.3, 4).translate(0, 1.25, z), M.mid, bedplate, { name: 'cable tray' });
    // the hydraulic power unit: tank, motor and pump, accumulators, hoses to the brakes
    const hpu = group(bedplate, { name: 'hydraulic unit', at: [3.2, 0.9, -1.62], moves: [['explode', [0, 0.3, -0.9]]] });
    part(merge(rbox(0.9, 0.42, 0.6, 0.03).translate(0, 0.21, 0), motorY(0.1, 0.24, 0.42).translate(-0.2, 0, 0), ...[0.15, 0.3].map((x) => merge(cylY(0.08, 0.42, 0.95, 20), new THREE.SphereGeometry(0.08, 16, 8, 0, TAU, 0, Math.PI / 2).translate(0, 0.95, 0)).translate(x, 0, 0)), box(0.2, 0.08, 0.3).translate(0.25, 0.46, 0.05)), M.white, hpu, { name: 'hydraulic unit' });
    part(merge(pipe([[0.3, 0.3, 0.3], [0.2, 0.5, 0.7], [-0.6, 0.65, 1.2], [-1.8, 0.8, 1.5]], 0.014), pipe([[0.35, 0.3, 0.3], [0.3, 0.45, 0.75], [-0.6, 0.6, 1.25], [-2.6, 0.7, 1.6]], 0.014)), M.dark, hpu, { name: 'hydraulic hoses' });
    // the service crane at the back: a column, a jib, a trolley and hook
    const crane = group(bedplate, { name: 'service crane', at: [9.2, 0.86, -1.3], moves: [['cover', [0, 0, 0]], ['explode', [1.0, 0.4, 0]]] });
    part(merge(cylY(0.09, 0, 3.0, 20), cylY(0.16, 0, 0.06, 20), iBeam(2.6, 0.18, 0.1, 0.014).translate(-2.4, 3.0, 0), box(0.18, 0.12, 0.16).translate(-1.4, 2.85, 0), cylY(0.008, 2.0, 2.8, 6).translate(-1.4, 0, 0), new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI * 1.5).translate(-1.4, 1.96, 0), box(0.4, 0.06, 0.06).rotateZ(-0.7).translate(-0.2, 2.7, 0)), M.mid, crane, { name: 'service crane' });

    // ── The drivetrain, along the tilted shaft axis ─────────────────────────
    const train = group(nacelle, { name: 'drivetrain', at: [0, 2.2, 0], rot: [0, 0, -TILT] });

    // main shaft: forged and hollow, flanged at the hub end, with the rotor lock disc
    const shaft = group(train, { name: 'main shaft', moves: [['explode', [-0.9, 0, 0]], ['bearing', [-1.4, 0, 0]]] });
    part(turned([[-2.55, 0.16], [-2.55, 1.05], [-2.42, 1.05], [-2.42, 0.66], [-2.0, 0.52], [-1.2, 0.47], [-0.9, 0.46], [0.9, 0.4], [1.0, 0.38], [1.5, 0.36], [1.5, 0.16], [-2.55, 0.16]], 128), M.white, shaft, { name: 'main shaft' });
    part(bolts(48, 0.9, -2.55, { size: 0.028, facing: -1, stud: true }), M.dark, shaft, { name: 'flange bolts' });
    part(merge(holedDisc(0.6, 1.25, 0.1, [{ n: 12, r: 1.06, d: 0.13, a0: 0.13 }]).translate(-2.3, 0, 0), bolts(16, 0.68, -2.2, { size: 0.02 })), M.light, shaft, { name: 'rotor lock disc', moves: [['bearing', [0.25, 0, 0]]] });

    // main bearing: a split pillow block with seals, grease lines and a sensor, the bearing inside
    const bearing = group(train, { name: 'main bearing', at: [-1.45, 0, 0], moves: [['explode', [-0.3, 0, 0]]] });
    const housing = group(bearing, { name: 'bearing housing', moves: [['bearing', [0, 2.6, 0]]] });
    part(merge(
        turned([[-0.42, 0.62], [-0.42, 0.97], [-0.34, 1.02], [0.34, 1.02], [0.42, 0.97], [0.42, 0.62]], 128),
        ...[-0.42, 0.34].map((x) => ringX(0.5, 0.66, 0.08).translate(x, 0, 0)),               // labyrinth seal covers
        ...[-0.34, -0.26, 0.26, 0.34].map((x) => new THREE.TorusGeometry(0.98, 0.012, 6, 96).rotateY(Math.PI / 2).translate(x, 0, 0)),
    ), M.light, housing, { name: 'housing' });
    part(merge(rbox(0.86, 0.55, 2.4, 0.04).translate(0, -0.85, 0), ...[-1, 1].map((s) => rbox(0.7, 0.12, 0.34, 0.02).translate(0, 0, s * 1.12)),
        ...[-1, 1].flatMap((s) => [-0.2, 0.2].map((x) => merge(cylY(0.03, 0.06, 0.24, 8), cylY(0.05, 0.12, 0.18, 6)).translate(x, 0, s * 1.15)))), M.light, housing, { name: 'housing feet' });
    part(merge(bolts(16, 0.8, 0.5, { size: 0.022 }), bolts(16, 0.8, -0.5, { size: 0.022, facing: -1 })), M.dark, housing, { name: 'cover bolts' });
    part(merge(pipe([[0.0, 1.03, 0.0], [0.0, 1.2, 0.0], [0.3, 1.35, 0.4], [0.9, 1.3, 1.0]], 0.012), pipe([[-0.25, 1.0, 0.1], [-0.25, 1.2, 0.2], [0.3, 1.38, 0.45], [0.95, 1.32, 1.05]], 0.012), cylY(0.025, 1.02, 1.1, 10), cylZ(0.03, 0.95, 1.12, 10).translate(0.2, 0.3, 0)), M.dark, housing, { name: 'grease lines' });
    part(ringX(0.56, 0.62, 0.62).translate(-0.31, 0, 0), M.mid, bearing, { name: 'outer ring', moves: [['bearing', [0.9, 1.3, 0]]] });
    const roller = turned([[-0.11, 0.0], [-0.11, 0.044], [-0.05, 0.05], [0, 0.052], [0.05, 0.05], [0.11, 0.044], [0.11, 0.0]], 18);
    part(merge([-0.16, 0.16].map((x) => Array.from({ length: 24 }, (_, i) => roller.clone().rotateZ(x < 0 ? 0.18 : -0.18).translate(x, 0.53, 0).rotateX((i / 24) * TAU)))), M.dark, bearing, { name: 'rollers', moves: [['bearing', [0.45, 0.6, 0]]] });
    part(merge(ringX(0.51, 0.535, 0.56).translate(-0.28, 0, 0), ...Array.from({ length: 24 }, (_, i) => box(0.52, 0.025, 0.015).translate(0, 0.53, 0).rotateX(((i + 0.5) / 24) * TAU))), M.mid, bearing, { name: 'cage', moves: [['bearing', [0.45, 0.85, 0]]] });
    part(ringX(0.46, 0.5, 0.62).translate(-0.31, 0, 0), M.mid, bearing, { name: 'inner ring', moves: [['bearing', [-0.4, -0.1, 0]]] });

    // gearbox: a shrink disc on its hollow input, a planetary stage, two helical parallel stages
    const gearbox = group(train, { name: 'gearbox', at: [2.6, 0, 0], moves: [['explode', [0.6, 0, 0]]] });
    part(merge(ringX(0.4, 0.66, 0.26).translate(-1.75, 0, 0), ringX(0.37, 0.6, 0.12).translate(-1.88, 0, 0), bolts(28, 0.55, -1.75, { size: 0.02, facing: -1 })), M.mid, gearbox, { name: 'shrink disc', moves: [['gearbox', [-2.4, 0.3, 0]]] });
    const gbCase = group(gearbox, { name: 'gearbox housing', moves: [['gearbox', [0, 2.6, 0]]] });
    part(turned([[-1.5, 0.5], [-1.5, 0.95], [-1.35, 1.1], [-1.1, 1.2], [-1.1, 1.3], [0.3, 1.3], [0.3, 1.22], [0.45, 1.22], [0.45, 0.5]], 128), M.white, gbCase, { name: 'planetary housing' });
    part(merge(bolts(44, 1.25, -1.1, { size: 0.024, facing: -1 }), bolts(44, 1.25, 0.45, { size: 0.024 })), M.dark, gbCase, { name: 'housing bolts' });
    // cast ribs round the planetary housing
    part(merge(Array.from({ length: 18 }, (_, i) => box(1.32, 0.14, 0.035).translate(-0.4, 1.33, 0).rotateX((i / 18) * TAU))), M.light, gbCase, { name: 'housing ribs' });
    // the parallel stages' housing: ribbed, with bolted inspection covers, lifting eyes, a breather
    const pHouse = merge(
        rbox(1.4, 2.4, 1.9, 0.12).translate(1.15, 0.4, 0),
        ...[-0.6, 0.0, 0.6].map((z) => box(1.3, 0.05, 0.05).translate(1.15, 1.62, z)),
        ...[-0.2, 0.4, 1.0].map((y) => box(1.3, 0.05, 0.05).translate(1.15, y, 0.97)),
        rbox(0.7, 0.5, 0.04, 0.03).translate(1.15, 0.6, 0.98), boltRow([0.85, 0.85, 1.0], [1.45, 0.85, 1.0], 6, { normal: 'z', size: 0.015 }), boltRow([0.85, 0.35, 1.0], [1.45, 0.35, 1.0], 6, { normal: 'z', size: 0.015 }),
        rbox(0.8, 0.04, 0.6, 0.03).translate(1.15, 1.62, 0), boltRow([0.8, 1.64, 0.27], [1.5, 1.64, 0.27], 6, { size: 0.015 }), boltRow([0.8, 1.64, -0.27], [1.5, 1.64, -0.27], 6, { size: 0.015 }),
        liftingEye().translate(0.7, 1.6, -0.7), liftingEye().translate(1.6, 1.6, 0.7), cylY(0.04, 1.6, 1.85, 12).translate(1.6, 0, -0.6), cylY(0.07, 1.85, 1.92, 12).translate(1.6, 0, -0.6),
    );
    part(pHouse, M.white, gbCase, { name: 'parallel stage housing' });
    // torque arms: lugs either side, each through an elastomer bushing in a bracket
    for (const s of [-1, 1]) {
        part(merge(rbox(0.7, 0.55, 0.7, 0.08).translate(-0.4, -0.15, s * 1.55), cylX(0.24, -0.75, -0.05, 28).translate(0, -0.15, s * 1.65)), M.light, gbCase, { name: 'torque arm' });
        part(merge(cylX(0.2, -0.8, 0.0, 28).translate(0, -0.15, s * 1.65), ...[-0.7, -0.1].map((x) => ringX(0.2, 0.28, 0.06).translate(x, -0.15, s * 1.65))), M.dark, gbCase, { name: 'elastomer bushing' });
    }
    // oil system: cooler lines to an oil-air cooler, a filter, the pump
    part(merge(pipe([[1.85, 0.0, 0.7], [2.1, 0.0, 0.9], [2.3, 0.6, 1.3], [2.6, 1.6, 1.4]], 0.03), pipe([[1.85, -0.3, 0.7], [2.15, -0.3, 0.95], [2.35, 0.4, 1.36], [2.7, 1.5, 1.46]], 0.03), cylY(0.12, -0.9, -0.4, 20).translate(1.9, 0, -0.8), cylY(0.14, -0.4, -0.34, 20).translate(1.9, 0, -0.8), motorY(0.08, 0.2, 0).rotateZ(Math.PI / 2).translate(1.95, -0.7, 0.5)), M.dark, gbCase, { name: 'oil system' });
    // the planetary stage
    const planetary = group(gearbox, { name: 'planetary stage', at: [-0.45, 0, 0] });
    part(merge(gear({ teeth: 96, r: 1.0, h: 0.05, width: 0.42, internal: true, rOut: 1.12, helix: 0.06 }).translate(-0.21, 0, 0), bolts(24, 1.07, 0.21, { size: 0.016 })), M.light, planetary, { name: 'ring gear', moves: [['gearbox', [-1.5, 0, 0]]] });
    const planetGeo = merge(gear({ teeth: 30, r: 0.33, h: 0.05, width: 0.4, bore: 0.13, helix: -0.1 }).translate(-0.2, 0, 0), ringX(0.09, 0.13, 0.4).translate(-0.2, 0, 0), ringX(0.065, 0.09, 0.42).translate(-0.21, 0, 0));
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 2;
        part(planetGeo.clone(), M.white, planetary, { name: 'planet gear', at: [0, Math.cos(a) * 0.62, Math.sin(a) * 0.62], moves: [['gearbox', [0.9, Math.cos(a) * 0.75, Math.sin(a) * 0.75]]] });
    }
    part(merge(gear({ teeth: 26, r: 0.24, h: 0.045, width: 0.44, bore: 0.05, helix: 0.12 }).translate(-0.22, 0, 0), cylX(0.12, 0.22, 0.9, 24)), M.mid, planetary, { name: 'sun gear', moves: [['gearbox', [2.0, 0, 0]]] });
    part(merge(holedDisc(0.2, 0.92, 0.07, [{ n: 3, r: 0.62, d: 0.13, a0: Math.PI / 2 }, { n: 6, r: 0.42, d: 0.12, a0: 0.5 }]).translate(-0.33, 0, 0), holedDisc(0.2, 0.92, 0.07, [{ n: 3, r: 0.62, d: 0.13, a0: Math.PI / 2 }, { n: 6, r: 0.42, d: 0.12, a0: 0.5 }]).translate(0.26, 0, 0),
        ...[0, 1, 2].map((i) => { const a = (i / 3) * TAU + Math.PI / 2; return cylX(0.065, -0.36, 0.36, 18).translate(0, Math.cos(a) * 0.62, Math.sin(a) * 0.62); }),
        ...[0, 1, 2].map((i) => { const a = (i / 3) * TAU + Math.PI / 2 + Math.PI / 3; return box(0.6, 0.16, 0.16).translate(0, Math.cos(a) * 0.78, Math.sin(a) * 0.78); }),
        turned([[-0.6, 0.18], [-0.6, 0.3], [-0.33, 0.3], [-0.33, 0.18]], 48)), M.dark, planetary, { name: 'planet carrier', moves: [['gearbox', [-0.4, 0, 0]]] });
    // the parallel stages: a bull gear and its pinion, a second wheel and the high-speed pinion
    const parallel = group(gearbox, { name: 'parallel stages', at: [1.15, 0, 0] });
    part(gear({ teeth: 84, r: 0.62, h: 0.035, width: 0.24, bore: 0.1, helix: 0.18, web: { rim: 0.1, hub: 0.18, holes: 6 } }).translate(-0.12, -0.05, 0), M.white, parallel, { name: 'bull gear', moves: [['gearbox', [0.4, -0.2, 1.7]]] });
    part(merge(gear({ teeth: 21, r: 0.15, h: 0.035, width: 0.3, helix: -0.3 }).translate(-0.15, 0.7, 0), cylX(0.08, -0.55, 0.45, 18).translate(0, 0.7, 0)), M.mid, parallel, { name: 'intermediate pinion', moves: [['gearbox', [0.6, 0.5, 1.8]]] });
    part(merge(gear({ teeth: 72, r: 0.42, h: 0.03, width: 0.2, bore: 0.07, helix: 0.2, web: { rim: 0.07, hub: 0.12, holes: 5 } }).translate(0.15, 0.7, 0)), M.white, parallel, { name: 'intermediate wheel', moves: [['gearbox', [1.0, 0.6, 1.4]]] });
    part(merge(gear({ teeth: 19, r: 0.1, h: 0.03, width: 0.24, helix: -0.35 }).translate(0.12, 0.75 + 0.55, 0), cylX(0.05, -0.3, 0.75, 16).translate(0, 1.3, 0)), M.mid, parallel, { name: 'high-speed pinion', moves: [['gearbox', [1.3, 1.2, 1.2]]] });

    // the high-speed shaft: a ventilated brake disc and caliper, then the disc-pack coupling
    const hss = group(gearbox, { name: 'high-speed shaft', at: [1.85, 0.75, 0], moves: [['explode', [0.5, 0, 0]]] });
    part(cylX(0.09, 0, 0.6, 24), M.mid, hss, { name: 'output shaft' });
    part(merge(holedDisc(0.1, 0.5, 0.025, [{ n: 18, r: 0.36, d: 0.04 }]).translate(0.28, 0, 0), holedDisc(0.1, 0.5, 0.025, [{ n: 18, r: 0.36, d: 0.04 }]).translate(0.33, 0, 0),
        ...Array.from({ length: 24 }, (_, i) => box(0.03, 0.2, 0.012).translate(0.3175, 0.38, 0).rotateX((i / 24) * TAU)), ringX(0.09, 0.16, 0.14).translate(0.24, 0, 0)), M.light, hss, { name: 'brake disc', moves: [['explode', [0.4, 0, 0]]] });
    part(merge(rbox(0.2, 0.3, 0.26, 0.03).translate(0.32, 0.5, 0), cylZ(0.06, 0.13, 0.2, 16).translate(0.32, 0.48, 0), cylZ(0.06, -0.2, -0.13, 16).translate(0.32, 0.48, 0), pipe([[0.32, 0.65, 0.05], [0.4, 0.85, 0.3], [0.7, 0.95, 0.9]], 0.012), boltRow([0.24, 0.66, 0.08], [0.4, 0.66, 0.08], 2, { size: 0.014 })), M.dark, hss, { name: 'brake caliper', moves: [['explode', [0.4, 0.6, 0]]] });
    const hubFlange = (x, f) => merge(ringX(0.06, 0.22, 0.08).translate(x, 0, 0), cylX(0.1, x - 0.1 * f, x + 0.08 + (f < 0 ? 0 : 0.1), 20), bolts(6, 0.17, f > 0 ? x + 0.08 : x, { size: 0.016, facing: f }));
    part(merge(hubFlange(0.62, -1), hubFlange(1.62, 1), ...[0.72, 1.56].map((x) => merge(Array.from({ length: 6 }, (_, i) => ringX(0.08, 0.2, 0.005).translate(x + i * 0.008, 0, 0)))), cylX(0.13, 0.78, 1.55, 36), ...[0.9, 1.1, 1.3].map((x) => new THREE.TorusGeometry(0.13, 0.006, 4, 36).rotateY(Math.PI / 2).translate(x, 0, 0))), M.white, hss, { name: 'coupling', moves: [['explode', [0.9, 0, 0]]] });

    // generator: a doubly fed machine in a ribbed frame, its cooler on top, slip-ring housing behind
    const generator = group(train, { name: 'generator', at: [6.2, 0.75, 0], moves: [['explode', [1.8, 0, 0]]] });
    const stator = group(generator, { name: 'stator', moves: [['generator', [-0.4, 1.9, 0]]] });
    const squareWithBore = (side, r, bore) => { const s = roundRectShape(side, side, r); s.holes.push(circlePath(0, 0, bore)); return s; };
    part(extrudeX(squareWithBore(1.8, 0.16, 0.62), 2.6).translate(-1.3, 0, 0), M.white, stator, { name: 'stator frame' });
    part(merge([-1.0, -0.5, 0, 0.5, 1.0].map((x) => extrudeX(squareWithBore(1.9, 0.2, 0.8), 0.05).translate(x - 0.025, 0, 0)), ...[-0.55, -0.3, 0.3, 0.55].map((z) => box(2.5, 0.06, 0.02).translate(0, 0.93, z)), ...[-0.55, -0.3, 0.3, 0.55].map((y) => box(2.5, 0.02, 0.06).translate(0, y, 0.93))), M.light, stator, { name: 'stiffening bands' });
    part(merge(Array.from({ length: 24 }, (_, i) => ringX(0.6, 0.66, 0.1).translate(-1.2 + i * 0.1, 0, 0))), M.mid, stator, { name: 'stator core' });
    part(merge([-1, 1].map((f) => merge(extrudeX(squareWithBore(1.76, 0.14, 0.2), 0.06).translate(f > 0 ? 1.3 : -1.36, 0, 0), turned([[0, 0.12], [0, 0.32], [0.1 * f, 0.3], [0.16 * f, 0.18], [0.16 * f, 0.12]], 32).translate(f > 0 ? 1.36 : -1.36, 0, 0), bolts(8, 0.26, f > 0 ? 1.36 : -1.36, { size: 0.016, facing: f }), cylY(0.012, 0.3, 0.42, 8).translate(f * 1.42, 0, 0)))), M.mid, stator, { name: 'end shields' });
    // the air-to-air cooler on top: a box with two fan cowls and grilles
    part(merge(rbox(2.0, 0.55, 1.4, 0.06).translate(0, 1.2, 0), ...[-0.5, 0.5].map((x) => merge(cylY(0.3, 1.47, 1.6, 36).translate(x, 0, 0), ...[0.08, 0.16, 0.24].map((r) => new THREE.TorusGeometry(r, 0.006, 4, 32).rotateX(Math.PI / 2).translate(x, 1.605, 0)), ...[0, 1, 2, 3].map((k) => box(0.58, 0.008, 0.012).rotateY((k / 4) * Math.PI).translate(x, 1.605, 0)))), louvre(1.6, 0.4, 7).translate(0, 1.2, 0.71)), M.white, stator, { name: 'generator cooler' });
    part(merge(rbox(0.55, 0.4, 0.45, 0.04).translate(0.2, 0.75, 1.05), ...[0.05, 0.2, 0.35].map((x) => cylY(0.03, 0.5, 0.55, 12).translate(x, 0, 1.05)), ...[0.05, 0.2, 0.35].map((x) => pipe([[x, 0.53, 1.05], [x, 0.3, 1.2], [x + 0.6, -0.3, 1.5], [x + 1.6, -0.5, 1.6]], 0.03))), M.dark, stator, { name: 'terminal box' });
    part(merge(rbox(0.7, 0.9, 1.0, 0.05).translate(1.75, 0, 0), louvre(0.5, 0.3, 4).rotateY(Math.PI / 2).translate(2.11, 0.15, 0), boltRow([1.45, 0.46, -0.45], [1.45, 0.46, 0.45], 5, { size: 0.014 })), M.light, stator, { name: 'slip ring housing' });
    part(merge(rbox(2.4, 0.25, 1.6, 0.04).translate(0, -1.0, 0), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => merge(cylY(0.09, -1.3, -1.12, 20), ringY(0.09, 0.12, 0.04, 20).translate(0, -1.16, 0)).translate(sx * 0.95, 0, sz * 0.62)))), M.light, generator, { name: 'generator feet' });
    const rotor = group(generator, { name: 'rotor', moves: [['generator', [1.6, 0.0, 0]]] });
    part(merge(cylX(0.58, -1.15, 1.15, 72), ...Array.from({ length: 24 }, (_, i) => cylX(0.585, -1.15 + i * 0.1, -1.15 + i * 0.1 + 0.012, 72)), ...[-1.25, 1.25].map((x) => new THREE.TorusGeometry(0.42, 0.11, 10, 48).rotateY(Math.PI / 2).translate(x, 0, 0))), M.light, rotor, { name: 'rotor core' });
    part(merge(cylX(0.08, -1.7, 2.1, 24), ...Array.from({ length: 10 }, (_, i) => box(0.12, 0.22, 0.012).translate(-1.45, 0.25, 0).rotateX((i / 10) * TAU))), M.mid, rotor, { name: 'rotor shaft' });
    part(merge([0, 1, 2].map((i) => ringX(0.08, 0.17, 0.05).translate(1.65 + i * 0.1, 0, 0)), box(0.3, 0.05, 0.05).translate(1.75, 0.22, 0)), M.dark, rotor, { name: 'slip rings' });

    // converter, cabinets and the transformer behind the generator
    const electrics = group(nacelle, { name: 'electrics', moves: [['explode', [1.2, 0, 0]]] });
    for (let i = 0; i < 4; i++) part(cabinet(0.62, 2.0, 0.6).rotateY(Math.PI).translate(7.8 + i * 0.66, 0.86, -1.42), M.white, electrics, { name: 'converter cabinet', moves: [['explode', [0, 0, -0.8]]] });
    const tx = merge(rbox(1.5, 1.5, 1.2, 0.05).translate(0, 0.75, 0), ...Array.from({ length: 8 }, (_, i) => box(0.04, 1.1, 0.32).translate(-0.6 + i * 0.17, 0.7, 0.76)), box(1.4, 0.05, 0.1).translate(0, 1.27, 0.68), box(1.4, 0.05, 0.1).translate(0, 0.14, 0.68),
        ...[-0.4, 0, 0.4].map((x) => turnedY([[0, 0.06], [0.08, 0.06], [0.1, 0.1], [0.14, 0.05], [0.18, 0.09], [0.22, 0.045], [0.26, 0.08], [0.32, 0.04], [0.36, 0.0]], 16).translate(x, 1.5, -0.2)), cylX(0.14, -0.6, 0.6, 20).translate(0, 1.7, 0.35));
    part(tx.translate(8.9, 0.86, 1.0), M.light, electrics, { name: 'transformer', moves: [['explode', [0, 0, 0.9]]] });

    // ── On the roof: cooler, met mast, lights ───────────────────────────────
    const cooler = group(nacelle, { name: 'cooler', moves: [['explode', [0, 2.2, 0]]] });
    part(merge(rbox(1.9, 1.1, 2.7, 0.05).translate(8.6, 4.95, 0), ...Array.from({ length: 22 }, (_, i) => box(1.7, 0.9, 0.01).translate(8.6, 4.95, -1.25 + i * 0.115)), ...[-1.3, 1.3].map((z) => box(1.9, 0.08, 0.08).translate(8.6, 4.42, z))), M.white, cooler, { name: 'cooler frame' });
    for (const z of [-0.65, 0.65]) part(merge(cylY(0.52, 5.5, 5.62, 48).translate(8.6, 0, z), ...[0.12, 0.24, 0.36, 0.48].map((r) => new THREE.TorusGeometry(r, 0.008, 4, 40).rotateX(Math.PI / 2).translate(8.6, 5.66, z)), ...[0, 1, 2, 3].map((k) => box(1.0, 0.01, 0.016).rotateY((k / 4) * Math.PI).translate(8.6, 5.66, z)), cylY(0.08, 5.55, 5.66, 16).translate(8.6, 0, z)), M.mid, cooler, { name: 'fan guard' });
    const mast = group(nacelle, { name: 'met mast', moves: [['explode', [0.4, 2.6, 0]]] });
    part(merge(...[-0.5, 0.5].map((z) => merge(cylY(0.03, 4.4, 5.9, 12).translate(9.6, 0, z), cylY(0.05, 4.4, 4.5, 12).translate(9.6, 0, z))), box(0.06, 0.06, 1.3).translate(9.6, 5.5, 0)), M.mid, mast, { name: 'mast' });
    part(merge(cylY(0.012, 5.9, 6.05, 8).translate(9.6, 0, -0.5), ...[0, 1, 2].flatMap((c) => { const a = (c / 3) * TAU; return [cylX(0.005, 0, 0.13, 6).rotateY(a).translate(9.6, 6.05, -0.5), new THREE.SphereGeometry(0.035, 12, 8, 0, TAU, 0, Math.PI / 2).rotateZ(Math.PI / 2).translate(9.6 + Math.cos(a) * 0.14, 6.05, -0.5 - Math.sin(a) * 0.14)]; })), M.dark, mast, { name: 'anemometer' });
    // the ultrasonic sensor: three arms reaching over a base, a transducer at each tip
    part(merge(cylY(0.05, 5.9, 6.0, 16).translate(9.6, 0, 0.5), ...[0, 1, 2].flatMap((c) => { const a = (c / 3) * TAU; const x = 9.6 + Math.cos(a) * 0.1, z = 0.5 + Math.sin(a) * 0.1; return [pipe([[9.6 + Math.cos(a) * 0.03, 6.0, 0.5 + Math.sin(a) * 0.03], [x, 6.1, z], [x, 6.22, z]], 0.008), cylY(0.016, 6.22, 6.26, 10).translate(x, 0, z)]; })), M.dark, mast, { name: 'ultrasonic sensor' });
    part(merge(...[-0.5, 0.5].map((z) => merge(cylY(0.05, 6.06, 6.1, 12).translate(9.85, 0, z), new THREE.SphereGeometry(0.05, 12, 8, 0, TAU, 0, Math.PI / 2).translate(9.85, 6.1, z))), cylY(0.008, 4.4, 7.0, 6).translate(9.9, 0, 0)), M.dark, mast, { name: 'aviation lights' });

    // ── The nacelle cover: GRP panels with flanged seams, hatches, louvres, rails ──
    const cover = group(nacelle, { name: 'nacelle cover' });
    const seamRow = (from, to, n, normal) => boltRow(from, to, n, { size: 0.016, normal });
    const roof = part(merge(
        rbox(10.6, 0.12, 4.6, 0.5).translate(4.0, 4.3, 0),
        ...[0.8, 2.8, 4.8, 6.8].map((x) => rbox(0.06, 0.05, 4.3, 0.02).translate(x, 4.38, 0)),
        ...[0.8, 2.8, 4.8, 6.8].map((x) => seamRow([x, 4.4, -2.0], [x, 4.4, 2.0], 12, 'y')),
        // the roof hatch: a raised frame, the lid, hinges and a handle
        rbox(1.3, 0.08, 1.1, 0.05).translate(1.8, 4.4, 0.9), rbox(1.2, 0.05, 1.0, 0.05).translate(1.8, 4.46, 0.9), ...[1.4, 2.2].map((x) => cylX(0.025, x - 0.08, x + 0.08, 10).translate(0, 4.46, 0.38)), box(0.2, 0.04, 0.03).translate(1.8, 4.5, 1.35),
        // skylights
        ...[3.8, 5.8].map((x) => rbox(1.0, 0.03, 0.7, 0.05).translate(x, 4.37, -1.1)),
        // handrails round the roof's working area
        handrail([[6.6, 4.36, -2.1], [9.9, 4.36, -2.1], [9.9, 4.36, 2.1], [6.6, 4.36, 2.1]], { height: 1.0, step: 1.1 }),
    ), M.white, cover, { name: 'cover roof', moves: [['cover', [0, 5.0, 0]]] });
    // the near side drops away below the frame, the far side lifts behind
    const side = (s) => merge(
        rbox(10.6, 4.0, 0.12, 0.5).translate(4.0, 2.3, s * 2.3),
        ...[0.8, 2.8, 4.8, 6.8].map((x) => rbox(0.06, 3.7, 0.05, 0.02).translate(x, 2.3, s * 2.38)),
        ...[0.8, 2.8, 4.8, 6.8].map((x) => seamRow([x, 0.6, s * 2.4], [x, 4.0, s * 2.4], 10, s > 0 ? 'z' : '-z')),
        louvre(1.6, 1.0, 9).rotateY(s > 0 ? 0 : Math.PI).translate(8.0, 2.4, s * 2.38),
        rbox(1.0, 1.6, 0.04, 0.04).translate(3.8, 1.6, s * 2.38),           // a service door
        box(0.03, 0.18, 0.04).translate(4.2, 1.6, s * 2.42),
    );
    part(side(1), M.white, cover, { name: 'cover side', moves: [['cover', [1.0, -9.0, 1.2]]] });
    part(side(-1), M.white, cover, { name: 'cover side', moves: [['cover', [0, 3.2, -3.2]]] });
    part(merge(rbox(0.12, 4.0, 4.6, 0.5).translate(9.3, 2.3, 0), louvre(1.8, 1.2, 10).rotateY(Math.PI / 2).translate(9.38, 2.9, -0.8), rbox(0.04, 1.8, 1.4, 0.04).translate(9.38, 1.6, 1.0)), M.white, cover, { name: 'cover rear', moves: [['cover', [3.6, 1.2, 0]]] });
    part(merge(rbox(10.6, 0.12, 4.6, 0.5).translate(4.0, 0.36, 0), rbox(1.6, 0.04, 1.2, 0.05).translate(7.6, 0.3, 0.8)), M.light, cover, { name: 'cover floor', moves: [['cover', [0, -9.0, 0]]] });

    // ── The rotor: cast hub, pitch systems, blades, spinner ─────────────────
    const rotorGroup = group(root, { name: 'rotor', at: HUB.toArray(), rot: [0, 0, -TILT], moves: [['explode', [-2.4, 0, 0]], ['hub', [-1.0, 0, 0]]] });
    const spin = group(rotorGroup, { name: 'rotor spin' });
    const hubCast = group(spin, { name: 'hub' });
    // the casting: a rounded body, three bosses for the blades, a nose opening, the shaft flange
    const bosses = [0, 1, 2].map((b) => turnedY([[0.7, 1.22], [1.55, 1.18], [1.7, 1.12], [1.74, 1.12], [1.74, 0.94], [1.55, 0.94]], 96).rotateX((b / 3) * TAU));
    part(merge(new THREE.SphereGeometry(1.5, 72, 48).scale(1.0, 1, 1), ...bosses,
        turned([[-1.42, 0.72], [-1.5, 0.72], [-1.5, 0.55], [-1.3, 0.55]], 64),
        turned([[1.0, 0.95], [1.1, 1.1], [1.32, 1.1], [1.32, 0.6]], 96)), M.white, hubCast, { name: 'hub casting' });
    part(merge(bolts(48, 0.9, 1.32, { size: 0.028, stud: true }), holedDisc(0, 0.62, 0.04, []).translate(-1.56, 0, 0), bolts(12, 0.58, -1.56, { size: 0.018, facing: -1 })), M.dark, hubCast, { name: 'hub flange bolts' });
    for (let b = 0; b < 3; b++) {
        const a = (b / 3) * TAU;
        // a pitch cabinet with its batteries on the hub between each pair of blades
        const ca = a + Math.PI / 3;
        part(cabinet(0.55, 0.7, 0.32, { vents: false }).rotateX(-Math.PI / 2).translate(-0.45, 1.42, 0.35).rotateX(ca), M.white, hubCast, { name: 'pitch cabinet', moves: [['pitch', [-0.9, Math.cos(ca) * 0.6, Math.sin(ca) * 0.6]]] });
        const blade = group(spin, { name: 'blade assembly', rot: [a, 0, 0] });
        const pitch = group(blade, { name: 'pitch system', moves: [['hub', [0, 0.7, 0]]] });
        // the pitch bearing: outer ring bolted to the hub, inner ring with its teeth and the blade's studs, two rows of balls
        part(merge(ringY(1.02, 1.22, 0.2, 128).translate(0, 1.74, 0), boltsY(60, 1.14, 1.94, { size: 0.02 })), M.mid, pitch, { name: 'pitch bearing outer ring', moves: [['pitch', [0, 0.2, 0]]] });
        part(merge([1.8, 1.88].map((y) => new THREE.TorusGeometry(1.0, 0.026, 8, 140).rotateX(Math.PI / 2).translate(0, y, 0))), M.dark, pitch, { name: 'pitch bearing balls', moves: [['pitch', [0, 0.55, 0]]] });
        part(gear({ teeth: 120, r: 0.88, h: 0.045, width: 0.22, internal: true, rOut: 0.99 }).rotateZ(Math.PI / 2).translate(0, 1.73, 0), M.light, pitch, { name: 'pitch bearing inner ring', moves: [['pitch', [0, 0.95, 0]]] });
        part(boltsY(64, 0.94, 1.97, { size: 0.02, stud: true }), M.dark, pitch, { name: 'blade root bolts', moves: [['pitch', [0, 1.3, 0]]] });
        // the pitch drive: finned motor, brake, gearhead, its pinion in the inner ring's teeth, on a bracket
        part(merge(gear({ teeth: 14, r: 0.09, h: 0.03, width: 0.16 }).rotateZ(Math.PI / 2).translate(0, 1.66, 0), cylY(0.05, 1.5, 1.66, 12), gearheadY(0.12, 0.42, 1.08, 3), rbox(0.36, 0.06, 0.36, 0.02).translate(0, 1.5, 0), motorY(0.11, 0.3, 0.6).rotateZ(Math.PI).translate(0, 1.68, 0)).translate(0, 0, 0.74), M.white, pitch, { name: 'pitch drive', moves: [['pitch', [0, -0.3, 0.7]]] });
        part(merge(pipe([[0.4, 1.4, 0.5], [0.6, 1.5, 0.7], [0.8, 1.72, 0.65]], 0.01), cylY(0.08, 1.2, 1.45, 16).translate(0.35, 0, 0.45)), M.dark, pitch, { name: 'pitch lubrication' });
        // the blade: aerofoil, its root with a flange ring and barrel nuts, vortex generators inboard
        const bladeObj = group(blade, { name: 'blade body', moves: [['explode', [0, 2.2, 0]], ['hub', [0, 1.5, 0]], ['pitch', [0, 1.4, 0]]] });
        part(bladeGeometry(), M.white, bladeObj, { name: 'blade' });
        part(merge(ringY(1.0, 1.17, 0.06, 96).translate(0, 2.0, 0), ...Array.from({ length: 64 }, (_, i) => { const t = (i / 64) * TAU; return cylZ(0.03, 0, 0.012, 12).translate(0, 0, 1.15).rotateY(t).translate(0, 2.32, 0); })), M.dark, bladeObj, { name: 'barrel nuts' });
        part(vortexGenerators(), M.dark, bladeObj, { name: 'vortex generators' });
    }
    // the spinner: a GRP nose cone with openings for the blades, a rim round each, panel seams and a nose cap
    part(spinnerGeometry(), M.spinner, spin, { name: 'spinner', moves: [['explode', [-3.0, 0, 0]], ['hub', [-1.5, 0, 0]]] });
    return { root, parts, spin, rotorGroup, nacelle, tower };
}
