// The homepage's wind turbine: a geared turbine of about 4 MW modelled in code
// and drawn as a clean engineering drawing (white parts, ink outlines and
// creases, one accent on the part in focus). As the page scrolls the nacelle
// cover lifts away, the machine explodes along its axes, and the camera drills
// into each assembly in turn: the hub and its pitch system, the main bearing
// and the gearbox's planetary stage, the generator, the yaw system. Part
// numbers are called out as each comes into view.
//
// Metres. x runs along the drivetrain (the hub upwind at -x), y up, z across.
// The tower top's flange is at y = 0.
//
//   mountTurbine(stage, { still, labels })   → { setProgress(p, jump), draw, ... }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── Small helpers ───────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { const t = clamp(x); return t * t * t * (t * (t * 6 - 15) + 10); };   // smootherstep
const win = (p, a, b) => ease((p - a) / (b - a));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// a turned body about the x axis from a profile of [x, r] points
function turned(profile, segments = 64) {
    const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0001), x)), segments);
    g.rotateZ(-Math.PI / 2);   // the lathe's y axis becomes +x
    return g;
}
// a flat ring, rIn to rOut, w thick, about the x axis, starting at x = 0
const ringX = (rIn, rOut, w, segments = 72) => turned([[0, rIn], [0, rOut], [w, rOut], [w, rIn], [0, rIn]], segments);
// a cylinder about x from x0 to x1
const cylX = (r, x0, x1, segments = 40) => new THREE.CylinderGeometry(r, r, x1 - x0, segments).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, 0, 0);
// a gear outline, extruded along x: teeth outward, or inward for a ring gear
function gear({ teeth, r, depth = 0.08, width, bore = 0, internal = false, rOut = 0 }) {
    const shape = new THREE.Shape(), pts = [];
    const per = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
        const a = i * per;
        const tip = internal ? r - depth : r + depth, root = r;
        pts.push([a, root], [a + per * 0.18, tip], [a + per * 0.48, tip], [a + per * 0.66, root]);
    }
    const outline = pts.map(([a, rr]) => new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    if (internal) {
        // a ring gear: a round outside, the teeth on the bore
        const outer = new THREE.Shape();
        for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU; const v = new THREE.Vector2(Math.cos(a) * rOut, Math.sin(a) * rOut); if (i) outer.lineTo(v.x, v.y); else outer.moveTo(v.x, v.y); }
        outer.holes.push(new THREE.Path(outline.slice().reverse()));
        return extrudeX(outer, width);
    }
    shape.setFromPoints(outline);
    if (bore) { const hole = new THREE.Path(); hole.absarc(0, 0, bore, 0, TAU, true); shape.holes.push(hole); }
    return extrudeX(shape, width);
}
function extrudeX(shape, width, bevel = 0) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 24 });
    g.rotateY(Math.PI / 2);   // extruded along z → along x
    return g;
}
// a rounded box
function rbox(w, h, d, r = 0.05) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * Math.min(r, d / 4), bevelEnabled: true, bevelSize: Math.min(r, d / 4), bevelThickness: Math.min(r, d / 4), bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * Math.min(r, d / 4)) / 2);
    return g;
}
const at = (g, x, y, z) => g.translate(x, y, z);
// a ring of copies of g about the x axis, at radius r, starting angle a0
function aroundX(g, n, r, { a0 = 0, x = 0, turn = true } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU, c = g.clone();
        if (turn) c.rotateX(a);
        c.translate(x, Math.cos(a) * r * (turn ? 0 : 1), Math.sin(a) * r * (turn ? 0 : 1));
        out.push(c);
    }
    return out;
}
// bolts: hex heads and washers on a bolt circle about the x axis, heads facing +x (or -x)
function boltCircle(n, r, x, { size = 0.035, facing = 1 } = {}) {
    const head = mergeGeometries([
        new THREE.CylinderGeometry(size * 1.6, size * 1.6, size * 0.3, 16).rotateZ(Math.PI / 2).translate(size * 0.15 * facing, 0, 0),
        new THREE.CylinderGeometry(size, size, size * 0.7, 6).rotateZ(Math.PI / 2).translate(size * (0.3 + 0.35) * facing, 0, 0),
    ].map(nonIndexed));
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; out.push(head.clone().translate(x, Math.cos(a) * r, Math.sin(a) * r)); }
    return mergeGeometries(out);
}
function nonIndexed(g) {
    const o = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
    if (!o.attributes.uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    return o;
}
const merge = (list) => mergeGeometries(list.flat().map(nonIndexed));

// ── Materials: paper white, with a little tone so the forms read ────────────
function materials() {
    const base = (hex, opts = {}) => new THREE.MeshLambertMaterial({ color: hex, ...opts });
    return {
        white: base(0xffffff), light: base(0xf4f5f6), mid: base(0xe6e8ea), dark: base(0xcdd2d6), ink: base(0x8b949b),
        accent: base(0xffffff, { emissive: 0x000000 }),
    };
}

// ── The turbine ─────────────────────────────────────────────────────────────
// Every part is a node with a rest place and a list of moves: [stage, offset].
// Stage windows (scroll progress) are defined in STAGES below.
const HUB = V(-4.6, 2.75, 0);          // the hub's centre
const TILT = (5 * Math.PI) / 180;       // the shaft tilts up toward the hub

function buildTurbine(M) {
    const root = new THREE.Group();
    const parts = [];     // { obj, moves: [{ stage, by: Vector3 }], spin?, label? }
    const part = (geo, mat, parent, { name, moves = [], at: pos = [0, 0, 0], rot } = {}) => {
        const mesh = geo instanceof THREE.Object3D ? geo : new THREE.Mesh(geo, mat);
        mesh.name = name || '';
        mesh.position.set(...pos);
        if (rot) mesh.rotation.set(...rot);
        mesh.userData.rest = mesh.position.clone();
        mesh.userData.moves = moves.map(([stage, by]) => ({ stage, by: V(...by) }));
        if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = false; }
        parent.add(mesh);
        parts.push(mesh);
        return mesh;
    };
    const group = (parent, opts) => part(new THREE.Group(), null, parent, opts);

    // ── Tower top, yaw bearing and yaw drives ───────────────────────────────
    const tower = group(root, { name: 'tower' });
    part(turned([[-26, 2.25], [0, 1.85]], 96).rotateZ(Math.PI / 2), M.white, tower, { name: 'tower shell' });
    part(merge([new THREE.CylinderGeometry(2.0, 2.0, 0.14, 96).translate(0, -0.07, 0), new THREE.CylinderGeometry(1.86, 1.86, 0.01, 96).translate(0, -0.15, 0)]), M.mid, tower, { name: 'tower flange' });
    // an internal platform and the door far below are out of frame; the ladder reaches the top
    const yaw = group(root, { name: 'yaw system', moves: [['yaw', [0, -1.6, 0]]] });
    // the yaw bearing: outer ring with its gear teeth, inner ring, balls between
    const yawRingGeo = gear({ teeth: 132, r: 2.12, depth: 0.06, width: 0.22 }).rotateZ(Math.PI / 2);
    part(yawRingGeo, M.light, yaw, { name: 'yaw ring gear', at: [0, 0.0, 0], moves: [['yaw', [0, -0.5, 0]]] });
    part(new THREE.CylinderGeometry(1.95, 1.95, 0.22, 96, 1, true).translate(0, 0.11, 0), M.mid, yaw, { name: 'yaw inner ring', moves: [['yaw', [0, 0.9, 0]]] });
    part(new THREE.TorusGeometry(2.02, 0.05, 8, 160).rotateX(Math.PI / 2).translate(0, 0.11, 0), M.dark, yaw, { name: 'yaw balls', moves: [['yaw', [0, 0.25, 0]]] });
    // six yaw drives: motor, gearbox, pinion, standing on the bedplate's ring
    const drive = merge([
        new THREE.CylinderGeometry(0.16, 0.16, 0.12, 24).translate(0, -0.06, 0),                 // pinion
        gear({ teeth: 14, r: 0.15, depth: 0.04, width: 0.16 }).rotateZ(Math.PI / 2).translate(0, -0.2, 0),
        new THREE.CylinderGeometry(0.2, 0.2, 0.55, 32).translate(0, 0.3, 0),                     // planetary gearbox
        new THREE.CylinderGeometry(0.24, 0.24, 0.06, 32).translate(0, 0.6, 0),
        new THREE.CylinderGeometry(0.18, 0.18, 0.42, 32).translate(0, 0.84, 0),                  // motor
        new THREE.CylinderGeometry(0.12, 0.12, 0.12, 24).translate(0, 1.11, 0),                  // brake
    ]);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        part(drive.clone(), M.white, yaw, { name: 'yaw drive', at: [Math.cos(a) * 2.38, 0.42, Math.sin(a) * 2.38], moves: [['yaw', [Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9]]] });
    }

    // ── The nacelle: bedplate, drivetrain, everything on it ─────────────────
    const nacelle = group(root, { name: 'nacelle' });
    // the cast front bedplate: a saddle on the yaw bearing carrying the main bearing
    const bedplate = group(nacelle, { name: 'bedplate', moves: [['explode', [0, -0.4, 0]]] });
    const castProfile = new THREE.Shape();
    castProfile.moveTo(-2.7, 0.35); castProfile.lineTo(2.1, 0.35); castProfile.lineTo(2.1, 1.0); castProfile.quadraticCurveTo(0.2, 1.3, -1.2, 1.9); castProfile.lineTo(-2.7, 2.0); castProfile.lineTo(-2.7, 0.35);
    const cast = new THREE.ExtrudeGeometry(castProfile, { depth: 2.4, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -1.2);
    part(cast, M.light, bedplate, { name: 'cast bedplate' });
    // the rear frame: two girders and cross members to the back of the nacelle
    for (const z of [-1.05, 1.05]) part(rbox(7.8, 0.36, 0.22, 0.03).translate(6.0, 0.62, z), M.white, bedplate, { name: 'rear frame' });
    for (const x of [2.6, 4.6, 6.6, 8.6]) part(rbox(0.22, 0.3, 2.3, 0.03).translate(x, 0.62, 0), M.mid, bedplate, { name: 'cross member' });
    // the service crane rail along the roof line
    part(rbox(9.6, 0.12, 0.12, 0.02).translate(4.2, 3.95, 0), M.mid, bedplate, { name: 'crane rail', moves: [['explode', [0, 1.2, 0]]] });

    // the drivetrain sits along the tilted shaft axis
    const train = group(nacelle, { name: 'drivetrain', at: [0, 2.2, 0], rot: [0, 0, -TILT] });

    // main shaft: a forged shaft, flanged at the hub end
    const shaft = group(train, { name: 'main shaft', moves: [['explode', [-0.9, 0, 0]], ['bearing', [-1.4, 0, 0]]] });
    part(turned([[-2.55, 0.0], [-2.55, 1.05], [-2.4, 1.05], [-2.4, 0.62], [-2.0, 0.5], [-1.2, 0.46], [0.9, 0.38], [1.5, 0.36], [1.5, 0.0]], 96), M.white, shaft, { name: 'main shaft' });
    part(boltCircle(36, 0.88, -2.55, { size: 0.03, facing: -1 }), M.dark, shaft, { name: 'flange bolts' });

    // main bearing: housing, outer ring, two rows of barrel rollers, inner ring
    const bearing = group(train, { name: 'main bearing', at: [-1.45, 0, 0], moves: [['explode', [-0.3, 0, 0]]] });
    const housing = group(bearing, { name: 'bearing housing', moves: [['bearing', [0, 2.6, 0]]] });
    part(turned([[-0.42, 0.62], [-0.42, 0.98], [-0.32, 1.02], [0.32, 1.02], [0.42, 0.98], [0.42, 0.62]], 96), M.light, housing, { name: 'housing' });
    part(rbox(0.86, 0.5, 2.5, 0.04).translate(0, -0.95, 0), M.light, housing, { name: 'housing feet' });
    part(boltCircle(16, 0.8, 0.42, { size: 0.025 }), M.dark, housing, { name: 'cover bolts' });
    part(ringX(0.56, 0.62, 0.62).translate(-0.31, 0, 0), M.mid, bearing, { name: 'outer ring', moves: [['bearing', [0.9, 1.3, 0]]] });
    const rollers = merge([-0.16, 0.16].map((x) => {
        const roller = turned([[-0.11, 0.0], [-0.11, 0.045], [0, 0.052], [0.11, 0.045], [0.11, 0.0]], 16);
        return Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * TAU; return roller.clone().rotateZ(x < 0 ? 0.18 : -0.18).translate(x, 0, 0).translate(0, 0.53, 0).rotateX(a); });
    }));
    part(rollers, M.dark, bearing, { name: 'rollers', moves: [['bearing', [0.45, 0.6, 0]]] });
    part(ringX(0.46, 0.5, 0.62).translate(-0.31, 0, 0), M.mid, bearing, { name: 'inner ring', moves: [['bearing', [-0.4, -0.1, 0]]] });

    // gearbox: a planetary stage then two parallel stages, in a split housing
    const gearbox = group(train, { name: 'gearbox', at: [2.6, 0, 0], moves: [['explode', [0.6, 0, 0]]] });
    const gbCase = group(gearbox, { name: 'gearbox housing', moves: [['gearbox', [0, 2.4, 0]]] });
    part(turned([[-1.1, 0.5], [-1.1, 1.2], [-0.95, 1.32], [0.3, 1.32], [0.45, 1.2], [0.45, 0.5]], 96), M.white, gbCase, { name: 'planetary housing' });
    part(boltCircle(40, 1.26, -1.1, { size: 0.028, facing: -1 }), M.dark, gbCase, { name: 'housing bolts' });
    part(rbox(1.4, 2.3, 1.9, 0.12).translate(1.15, 0.35, 0), M.white, gbCase, { name: 'parallel stage housing' });
    for (const z of [-1.55, 1.55]) part(rbox(0.6, 0.5, 0.9, 0.08).translate(-0.4, -0.2, z), M.light, gbCase, { name: 'torque arm' });
    for (const z of [-1.55, 1.55]) part(cylX(0.18, -0.65, -0.15, 24).rotateX(Math.PI / 2).translate(0, -0.2, z * 0 + z), M.dark, gbCase, { name: 'elastomer mount' });
    // the planetary stage itself
    const planetary = group(gearbox, { name: 'planetary stage', at: [-0.45, 0, 0] });
    part(gear({ teeth: 96, r: 1.0, depth: 0.05, width: 0.42, internal: true, rOut: 1.12 }).translate(-0.21, 0, 0), M.light, planetary, { name: 'ring gear', moves: [['gearbox', [-1.5, 0, 0]]] });
    const planetGeo = gear({ teeth: 30, r: 0.33, depth: 0.05, width: 0.4, bore: 0.09 }).translate(-0.2, 0, 0);
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 2;
        part(planetGeo.clone(), M.white, planetary, { name: 'planet gear', at: [0, Math.cos(a) * 0.62, Math.sin(a) * 0.62], moves: [['gearbox', [0.9, Math.cos(a) * 0.75, Math.sin(a) * 0.75]]] });
    }
    part(gear({ teeth: 26, r: 0.24, depth: 0.045, width: 0.44, bore: 0.05 }).translate(-0.22, 0, 0), M.mid, planetary, { name: 'sun gear', moves: [['gearbox', [2.0, 0, 0]]] });
    part(merge([ringX(0.2, 0.92, 0.07).translate(-0.33, 0, 0), ringX(0.2, 0.92, 0.07).translate(0.26, 0, 0), ...aroundX(cylX(0.08, -0.33, 0.33, 16), 3, 0.62, { a0: Math.PI / 2, turn: false })]), M.dark, planetary, { name: 'planet carrier', moves: [['gearbox', [-0.4, 0, 0]]] });
    // the high-speed shaft out of the back, offset upward
    const hss = group(gearbox, { name: 'high-speed shaft', at: [1.85, 0.75, 0], moves: [['explode', [0.5, 0, 0]]] });
    part(cylX(0.09, 0, 0.6, 24), M.mid, hss, { name: 'output shaft' });
    // brake disc and caliper
    part(merge([ringX(0.1, 0.48, 0.04).translate(0.3, 0, 0), ringX(0.1, 0.16, 0.12).translate(0.26, 0, 0)]), M.light, hss, { name: 'brake disc', moves: [['explode', [0.4, 0, 0]]] });
    part(rbox(0.16, 0.28, 0.2, 0.03).translate(0.32, 0.4, 0), M.dark, hss, { name: 'brake caliper', moves: [['explode', [0.4, 0.5, 0]]] });
    // the composite coupling to the generator
    part(merge([cylX(0.13, 0.7, 1.6, 32), ringX(0.06, 0.2, 0.06).translate(0.66, 0, 0), ringX(0.06, 0.2, 0.06).translate(1.6, 0, 0)]), M.white, hss, { name: 'coupling', moves: [['explode', [0.9, 0, 0]]] });

    // generator: a doubly fed machine, its stator in a finned frame, the rotor inside
    const generator = group(train, { name: 'generator', at: [6.2, 0.75, 0], moves: [['explode', [1.8, 0, 0]]] });
    const stator = group(generator, { name: 'stator', moves: [['generator', [-0.4, 1.9, 0]]] });
    const squareWithBore = (side, r, bore) => {
        const sh = new THREE.Shape(), h = side / 2;
        sh.moveTo(-h + r, -h); sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r); sh.lineTo(h, h - r); sh.quadraticCurveTo(h, h, h - r, h);
        sh.lineTo(-h + r, h); sh.quadraticCurveTo(-h, h, -h, h - r); sh.lineTo(-h, -h + r); sh.quadraticCurveTo(-h, -h, -h + r, -h);
        const hole = new THREE.Path(); hole.absarc(0, 0, bore, 0, TAU, true); sh.holes.push(hole);
        return sh;
    };
    part(extrudeX(squareWithBore(1.8, 0.16, 0.62), 2.6).translate(-1.3, 0, 0), M.white, stator, { name: 'stator frame' });
    part(merge([-0.9, -0.3, 0.3, 0.9].map((x) => extrudeX(squareWithBore(1.88, 0.18, 0.8), 0.08).translate(x - 0.04, 0, 0))), M.light, stator, { name: 'stiffening bands' });
    // the stator's laminated core inside the bore, seen once the rotor is out
    part(merge(Array.from({ length: 22 }, (_, i) => ringX(0.6, 0.66, 0.1).translate(-1.15 + i * 0.105, 0, 0))), M.mid, stator, { name: 'stator core' });
    part(merge([ringX(0.15, 0.82, 0.06).translate(-1.36, 0, 0), ringX(0.15, 0.82, 0.06).translate(1.3, 0, 0)]), M.mid, stator, { name: 'end shields', moves: [['generator', [0, 0, 0]]] });
    part(rbox(2.2, 0.3, 1.5, 0.04).translate(0, -0.95, 0), M.light, generator, { name: 'generator feet' });
    part(rbox(0.5, 0.35, 0.45, 0.04).translate(0.2, 1.08, 0.35), M.mid, stator, { name: 'terminal box' });
    const rotor = group(generator, { name: 'rotor', moves: [['generator', [1.6, 0.0, 0]]] });
    part(merge([cylX(0.58, -1.15, 1.15, 72), ...Array.from({ length: 24 }, (_, i) => cylX(0.585, -1.15 + i * 0.1, -1.15 + i * 0.1 + 0.012, 72))]), M.light, rotor, { name: 'rotor core' });
    part(cylX(0.08, -1.6, 2.1, 24), M.mid, rotor, { name: 'rotor shaft' });
    part(merge([0, 1, 2].map((i) => ringX(0.08, 0.17, 0.05).translate(1.65 + i * 0.1, 0, 0))), M.dark, rotor, { name: 'slip rings' });

    // converter cabinets and the transformer behind the generator
    const electrics = group(nacelle, { name: 'electrics', moves: [['explode', [1.2, 0, 0]]] });
    for (let i = 0; i < 3; i++) part(rbox(0.7, 2.0, 0.6, 0.03).translate(8.1 + i * 0.75, 1.8, -1.45), M.white, electrics, { name: 'converter cabinet', moves: [['explode', [0, 0, -0.8]]] });
    part(rbox(1.6, 1.6, 1.4, 0.06).translate(8.9, 1.6, 1.0), M.light, electrics, { name: 'transformer', moves: [['explode', [0, 0, 0.9]]] });
    for (let i = 0; i < 7; i++) part(rbox(0.06, 1.2, 0.3, 0.01).translate(8.2 + i * 0.22, 1.6, 1.85), M.mid, electrics, { name: 'radiator fin', moves: [['explode', [0, 0, 0.9]]] });
    // the cooler on the roof: a radiator frame with two fans, the met mast behind
    const cooler = group(nacelle, { name: 'cooler', moves: [['explode', [0, 2.2, 0]]] });
    part(rbox(1.8, 1.2, 2.6, 0.05).translate(8.6, 4.9, 0), M.white, cooler, { name: 'cooler frame' });
    for (const z of [-0.6, 0.6]) {
        part(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 48).translate(8.6, 5.52, z), M.mid, cooler, { name: 'fan shroud' });
        part(merge([0, 1, 2, 3, 4].map((b) => rbox(0.44, 0.02, 0.1, 0.005).translate(0.22, 0, 0).rotateY((b / 5) * TAU))).translate(8.6, 5.58, z), M.dark, cooler, { name: 'fan blades' });
    }
    const mast = group(nacelle, { name: 'met mast', moves: [['explode', [0.4, 2.6, 0]]] });
    part(merge([new THREE.CylinderGeometry(0.035, 0.035, 1.4, 12).translate(9.4, 5.0, 0), rbox(0.08, 0.08, 1.2, 0.01).translate(9.4, 5.7, 0)]), M.mid, mast, { name: 'mast' });
    // the cup anemometer and the wind vane at either end of the cross arm
    part(merge([new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8).translate(9.4, 5.85, -0.55), ...[0, 1, 2].map((c) => { const a = (c / 3) * TAU; return [new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6).rotateZ(Math.PI / 2).translate(0.07, 0, 0).rotateY(a).translate(9.4, 5.95, -0.55), new THREE.SphereGeometry(0.035, 12, 8, 0, TAU, 0, Math.PI / 2).rotateZ(Math.PI / 2).translate(Math.cos(a) * 0.14, 5.95, -0.55 - Math.sin(a) * 0.14).translate(9.4, 0, 0)]; }).flat()]), M.dark, mast, { name: 'anemometer' });
    part(merge([new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8).translate(9.4, 5.85, 0.55), rbox(0.36, 0.12, 0.01, 0.005).translate(9.55, 5.97, 0.55)]), M.dark, mast, { name: 'wind vane' });
    part(new THREE.SphereGeometry(0.06, 12, 8).translate(9.4, 6.0, 0), M.dark, mast, { name: 'aviation light' });

    // the nacelle cover: a GRP shell in panels that lift away
    const cover = group(nacelle, { name: 'nacelle cover' });
    const shell = (w, h, d) => rbox(w, h, d, 0.5);
    const coverRoof = part(merge([shell(10.6, 0.12, 4.6).translate(4.0, 4.3, 0)]), M.white, cover, { name: 'cover roof', moves: [['cover', [0, 5.0, 0]]] });
    // the near side drops away below the frame, the far side lifts behind
    part(shell(10.6, 4.0, 0.12).translate(4.0, 2.3, 2.3), M.white, cover, { name: 'cover side', moves: [['cover', [1.0, -9.0, 1.2]]] });
    part(shell(10.6, 4.0, 0.12).translate(4.0, 2.3, -2.3), M.white, cover, { name: 'cover side', moves: [['cover', [0, 3.2, -3.2]]] });
    part(shell(0.12, 4.0, 4.6).translate(9.3, 2.3, 0), M.white, cover, { name: 'cover rear', moves: [['cover', [3.6, 1.2, 0]]] });
    part(shell(10.6, 0.12, 4.6).translate(4.0, 0.36, 0), M.light, cover, { name: 'cover floor', moves: [['cover', [0, -9.0, 0]]] });
    // seams and the roof hatch on the roof panel
    part(merge([...[0.8, 2.8, 4.8, 6.8].map((x) => rbox(0.03, 0.02, 4.5, 0.005).translate(x, 4.37, 0)), rbox(1.2, 0.04, 1.0, 0.02).translate(2.0, 4.39, 0.9)]), M.mid, coverRoof, { name: 'roof seams' });

    // ── The rotor: hub, pitch bearings and drives, spinner, three blades ────
    const rotorGroup = group(root, { name: 'rotor', at: HUB.toArray(), rot: [0, 0, -TILT], moves: [['explode', [-2.4, 0, 0]], ['hub', [-1.0, 0, 0]]] });
    const spin = group(rotorGroup, { name: 'rotor spin' });
    const hubCast = group(spin, { name: 'hub' });
    // the cast hub: a rounded body with three blade flanges and the shaft flange behind
    part(new THREE.SphereGeometry(1.55, 64, 40), M.white, hubCast, { name: 'hub casting' });
    part(turned([[1.1, 0], [1.1, 1.08], [1.32, 1.08], [1.32, 0.6]], 96), M.light, hubCast, { name: 'hub shaft flange' });
    part(boltCircle(36, 0.88, 1.32, { size: 0.03 }), M.dark, hubCast, { name: 'hub flange bolts' });
    for (let b = 0; b < 3; b++) {
        const a = (b / 3) * TAU;
        const blade = group(spin, { name: 'blade assembly', rot: [a, 0, 0], moves: [['explode', [0, 0, 0]]] });
        // the blade's axis is +y in this frame; everything below is laid out along it
        const flange = group(blade, { name: 'pitch system', moves: [['hub', [0, 0.7, 0]]] });
        part(new THREE.CylinderGeometry(1.0, 1.05, 0.5, 72).translate(0, 1.55, 0), M.light, hubCast, { name: 'blade flange', rot: [a, 0, 0] });
        // the pitch bearing: outer ring bolted to the hub, inner ring with gear teeth, two rows of balls
        part(new THREE.CylinderGeometry(1.12, 1.12, 0.18, 96, 1, true).translate(0, 1.92, 0), M.mid, flange, { name: 'pitch bearing outer ring', moves: [['pitch', [0, 0.2, 0]]] });
        part(merge([1.86, 1.98].map((y) => new THREE.TorusGeometry(1.06, 0.03, 8, 120).rotateX(Math.PI / 2).translate(0, y, 0))), M.dark, flange, { name: 'pitch bearing balls', moves: [['pitch', [0, 0.55, 0]]] });
        part(gear({ teeth: 110, r: 0.88, depth: 0.05, width: 0.2, internal: true, rOut: 1.0 }).rotateZ(Math.PI / 2).translate(0, 1.82, 0), M.light, flange, { name: 'pitch bearing inner ring', moves: [['pitch', [0, 0.95, 0]]] });
        part(boltCircle(54, 0.95, 0, { size: 0.022 }).rotateZ(Math.PI / 2).translate(0, 2.03, 0), M.dark, flange, { name: 'blade root bolts', moves: [['pitch', [0, 1.3, 0]]] });
        // the pitch drive inside the hub: motor and gearbox, its pinion on the inner ring
        part(merge([new THREE.CylinderGeometry(0.13, 0.13, 0.5, 28).translate(0, 1.2, 0), new THREE.CylinderGeometry(0.11, 0.11, 0.38, 28).translate(0, 0.76, 0), gear({ teeth: 13, r: 0.1, depth: 0.03, width: 0.14 }).rotateZ(Math.PI / 2).translate(0, 1.6, 0)]).translate(0, 0, 0.72), M.white, flange, { name: 'pitch drive', moves: [['pitch', [0, -0.3, 0.7]]] });
        // the blade: root cylinder, then the aerofoil, twisting and tapering
        part(bladeGeometry(), M.white, blade, { name: 'blade', moves: [['explode', [0, 2.2, 0]], ['hub', [0, 1.5, 0]], ['pitch', [0, 1.4, 0]]] });
    }
    // the spinner: a GRP nose cone over the hub
    part(merge([turned([[-2.6, 0], [-2.45, 0.6], [-2.1, 1.25], [-1.5, 1.85], [-0.6, 2.25], [0.4, 2.35], [0.9, 2.3]], 96)]), M.white, spin, { name: 'spinner', moves: [['explode', [-3.0, 0, 0]], ['hub', [-1.5, 0, 0]]] });
    // the spinner's windows for the blades are cut by drawing it partly open: its rear half is a frame only
    return { root, parts, spin, rotorGroup, nacelle, tower };
}

// the blade: lofted aerofoil sections from a round root to a thin tip, 58 m long
function bladeGeometry() {
    const L = 58, N = 46, K = 40, pos = [], idx = [];
    const chord = (t) => (t < 0.05 ? 2.3 : t < 0.22 ? 2.3 + (4.1 - 2.3) * Math.sin(((t - 0.05) / 0.17) * Math.PI / 2) : 4.1 * (1 - (t - 0.22) / 0.78) ** 0.9 + 0.5);
    const thick = (t) => (t < 0.05 ? 1 : t < 0.3 ? 1 - (1 - 0.3) * ((t - 0.05) / 0.25) : 0.3 - 0.12 * ((t - 0.3) / 0.7));
    const twist = (t) => (0.24 * (1 - Math.min(1, t / 0.7)));
    for (let i = 0; i < N; i++) {
        const t = (i / (N - 1)) ** 1.6, y = 2.03 + t * L, c = chord(t), th = thick(t), tw = twist(t), round = 1 - smooth01(0.03, 0.2, t);
        for (let j = 0; j < K; j++) {
            const u = (j / K) * TAU;
            // a cambered aerofoil from a symmetric NACA thickness and a small camber, blended to a circle at the root
            const xc = (1 - Math.cos(u)) / 2;
            const half = 5 * th * 0.2 * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4) / 0.2 * 0.5;
            const camber = 0.03 * Math.sin(Math.PI * xc);
            let ax = (xc - 0.3) * c, az = (camber + (Math.sin(u) >= 0 ? half : -half)) * c;
            const rx = Math.cos(u) * 1.15, rz = Math.sin(u) * 1.15;
            ax = ax * (1 - round) + rx * round; az = az * (1 - round) + rz * round;
            const cs = Math.cos(tw), sn = Math.sin(tw);
            pos.push(ax * cs - az * sn, y, ax * sn + az * cs);
        }
    }
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
function smooth01(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// ── The scroll: stage windows and the camera through them ───────────────────
// Each move happens across its stage's window and is undone in `reassemble`.
const STAGES = {
    cover: [0.04, 0.12], explode: [0.1, 0.2],
    hub: [0.24, 0.29], pitch: [0.28, 0.35],
    bearing: [0.39, 0.45],
    gearbox: [0.49, 0.56],
    generator: [0.61, 0.68],
    yaw: [0.76, 0.83],
    reassemble: [0.9, 1.0],
};
// what the camera looks at, and from where (relative to its target), at points along the scroll;
// pairs of shots hold the camera while a stage explodes and is read
const SHOTS = [
    { p: 0.0, target: [0.4, 2.2, 0], from: [-11.5, 4.6, 19.5], fov: 32 },
    { p: 0.05, target: [0.6, 2.4, 0], from: [-10.0, 5.6, 19.5], fov: 32 },
    { p: 0.2, target: [1.2, 3.4, 0], from: [-6.0, 7.5, 24.5], fov: 34 },
    { p: 0.24, target: [1.0, 3.4, 0], from: [-6.8, 7.0, 24.0], fov: 34 },
    { p: 0.3, target: [-7.4, 3.3, 0], from: [-7.5, 2.2, 10.5], fov: 34 },     // the hub and pitch system
    { p: 0.37, target: [-7.4, 4.3, 0.5], from: [-6.5, 2.6, 8.0], fov: 34 },
    { p: 0.44, target: [-1.4, 3.5, 0], from: [-3.8, 1.8, 9.2], fov: 34 },    // the main bearing
    { p: 0.48, target: [-1.4, 3.5, 0], from: [-3.2, 1.4, 8.6], fov: 34 },
    { p: 0.55, target: [2.6, 2.6, 0], from: [-3.0, 2.0, 7.6], fov: 34 },     // the planetary stage
    { p: 0.6, target: [2.8, 2.6, 0], from: [-2.6, 1.6, 7.2], fov: 34 },
    { p: 0.67, target: [8.6, 3.6, 0], from: [-3.2, 1.8, 8.6], fov: 34 },     // the generator
    { p: 0.74, target: [8.8, 3.6, 0], from: [-2.6, 1.4, 8.2], fov: 34 },
    { p: 0.8, target: [0, 0.2, 0], from: [3.5, 2.8, 6.8], fov: 36 },         // the yaw system
    { p: 0.88, target: [0, 0.0, 0], from: [3.0, 2.2, 6.4], fov: 36 },
    { p: 0.95, target: [1.0, 2.4, 0], from: [-8.0, 6.5, 22.0], fov: 34 },
    { p: 1.0, target: [0.4, 2.2, 0], from: [-11.5, 4.6, 19.5], fov: 32 },
];
// what each stage calls out: part name, its number, and where the leader points (world, at rest)
export const CALLOUTS = [
    { n: '1', label: 'BLADE', part: 'blade', at: [0, 9, 0], show: [0.14, 0.27] },
    { n: '2', label: 'SPINNER', part: 'spinner', at: [-2.0, 1.5, 0], show: [0.14, 0.27] },
    { n: '3', label: 'HUB', part: 'hub casting', at: [0, 0.6, 1.4], show: [0.16, 0.27] },
    { n: '4', label: 'MAIN SHAFT', part: 'main shaft', at: [-0.4, 0.45, 0], show: [0.16, 0.27] },
    { n: '5', label: 'GEARBOX', part: 'parallel stage housing', at: [1.15, 1.4, 0], show: [0.16, 0.27] },
    { n: '6', label: 'GENERATOR', part: 'stator frame', at: [0, 0.9, 0.6], show: [0.16, 0.27] },
    { n: '7', label: 'NACELLE COVER', part: 'cover roof', at: [4, 4.4, 1.6], show: [0.12, 0.27] },
    { n: '8', label: 'YAW SYSTEM', part: 'yaw ring gear', at: [2.1, 0.1, 0], show: [0.16, 0.27] },
    { n: '3.1', label: 'PITCH BEARING', part: 'pitch bearing outer ring', at: [1.12, 1.92, 0], show: [0.31, 0.39] },
    { n: '3.2', label: 'BEARING BALLS', part: 'pitch bearing balls', at: [1.06, 1.92, 0], show: [0.32, 0.39] },
    { n: '3.3', label: 'PITCH DRIVE', part: 'pitch drive', at: [0.13, 1.2, 0.72], show: [0.32, 0.39] },
    { n: '3.4', label: 'ROOT BOLTS ×54', part: 'blade root bolts', at: [0, 2.03, 0.95], show: [0.32, 0.39] },
    { n: '4.1', label: 'MAIN BEARING', part: 'housing', at: [0, 1.02, 0], show: [0.42, 0.49] },
    { n: '4.2', label: 'ROLLERS ×44', part: 'rollers', at: [0.16, 0.53, 0], show: [0.43, 0.49] },
    { n: '5.1', label: 'RING GEAR', part: 'ring gear', at: [0, 1.12, 0], show: [0.53, 0.61] },
    { n: '5.2', label: 'PLANET ×3', part: 'planet gear', at: [0, 0.38, 0], show: [0.53, 0.61] },
    { n: '5.3', label: 'SUN', part: 'sun gear', at: [0, 0.28, 0], show: [0.54, 0.61] },
    { n: '5.4', label: 'PLANET CARRIER', part: 'planet carrier', at: [0.3, 0.92, 0], show: [0.54, 0.61] },
    { n: '6.1', label: 'STATOR', part: 'stator frame', at: [0, 0.9, 0.6], show: [0.65, 0.75] },
    { n: '6.2', label: 'ROTOR', part: 'rotor core', at: [0, 0.58, 0], show: [0.65, 0.75] },
    { n: '6.3', label: 'SLIP RINGS', part: 'slip rings', at: [1.75, 0.17, 0], show: [0.66, 0.75] },
    { n: '8.1', label: 'YAW BEARING', part: 'yaw ring gear', at: [2.1, 0.1, 0], show: [0.8, 0.89] },
    { n: '8.2', label: 'YAW DRIVE ×6', part: 'yaw drive', at: [0, 0.84, 0.18], show: [0.8, 0.89] },
];

// ── The drawing: white surfaces, ink where normals or depth change ──────────
const EDGE_SHADER = {
    uniforms: {
        tColour: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 400 }, uInk: { value: new THREE.Color(0x15191d) },
        uWidth: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
        uniform sampler2D tColour; uniform sampler2D tNormal; uniform sampler2D tDepth;
        uniform vec2 uTexel; uniform float uNear; uniform float uFar; uniform vec3 uInk; uniform float uWidth;
        varying vec2 vUv;
        float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
        void main(){
            vec4 c = texture2D(tColour, vUv);
            float d0 = texture2D(tDepth, vUv).r;
            vec3 n0 = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
            float z0 = lin(d0);
            float edge = 0.0, any = d0 < 1.0 ? 1.0 : 0.0;
            for (int i = 0; i < 8; i++) {
                vec2 o = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : i == 2 ? 0.0 : i == 3 ? 0.0 : i == 4 ? 1.0 : i == 5 ? -1.0 : i == 6 ? 1.0 : -1.0,
                              i == 0 ? 0.0 : i == 1 ? 0.0 : i == 2 ? 1.0 : i == 3 ? -1.0 : i == 4 ? 1.0 : i == 5 ? -1.0 : i == 6 ? -1.0 : 1.0) * uTexel * uWidth;
                float d = texture2D(tDepth, vUv + o).r;
                vec3 n = texture2D(tNormal, vUv + o).rgb * 2.0 - 1.0;
                float z = lin(d);
                if (d < 1.0) any = 1.0;
                // a silhouette: the neighbour is much further away (or is sky)
                float dz = (d0 < 1.0 || d < 1.0) ? abs(z - z0) / min(z, z0) : 0.0;
                edge = max(edge, smoothstep(0.012, 0.03, dz));
                // a crease: the surface turns
                if (d0 < 1.0 && d < 1.0) edge = max(edge, smoothstep(0.22, 0.45, 1.0 - dot(n0, n)));
            }
            vec3 paper = d0 < 1.0 ? c.rgb : vec3(1.0);
            vec3 col = mix(paper, uInk, edge * 0.92);
            float a = d0 < 1.0 ? 1.0 : edge;
            gl_FragColor = vec4(col * a, a);
            #include <colorspace_fragment>
        }`,
};

export async function mountTurbine(stage, { still = matchMedia('(prefers-reduced-motion: reduce)').matches, labels = true } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.2, 400);
    // soft, even light: a key from above-front and a broad fill, so faces read in three or four tones
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe3e6e8, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-3, 6, 5); scene.add(key);
    const M = materials();
    const T = buildTurbine(M);
    scene.add(T.root);
    const byName = (name) => T.parts.find((p) => p.name === name);

    // the accent: the part in focus is drawn in the accent material
    const accentFor = (p) => (p < 0.27 ? null : p < 0.4 ? 'pitch system' : p < 0.5 ? 'main bearing' : p < 0.62 ? 'planetary stage' : p < 0.76 ? 'generator' : p < 0.9 ? 'yaw system' : null);

    // ── Render targets ──────────────────────────────────────────────────────
    const colourRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
    const normalRT = new THREE.WebGLRenderTarget(1, 1);
    normalRT.depthTexture = new THREE.DepthTexture(1, 1);
    const normalMat = new THREE.MeshNormalMaterial();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...EDGE_SHADER, uniforms: THREE.UniformsUtils.clone(EDGE_SHADER.uniforms), depthTest: false, depthWrite: false, transparent: true }));
    const quadScene = new THREE.Scene(); quadScene.add(quad);
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const U = quad.material.uniforms;

    // ── Callouts: an SVG over the canvas, balloons with leaders ─────────────
    const NS = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(NS, 'svg');
    overlay.setAttribute('class', 'turbine-callouts');
    stage.appendChild(overlay);
    const callouts = labels ? CALLOUTS.map((c) => {
        const g = document.createElementNS(NS, 'g');
        g.innerHTML = `<line/><circle r="3"/><text class="num"></text><text class="label"></text>`;
        g.querySelector('.num').textContent = c.n;
        g.querySelector('.label').textContent = c.label;
        overlay.appendChild(g);
        return { ...c, g, obj: byName(c.part) };
    }) : [];

    // ── Placing everything for a point on the scroll ────────────────────────
    let goal = 0, now = 0, time = 0;
    const shotAt = (p) => {
        let i = 0;
        while (i < SHOTS.length - 2 && SHOTS[i + 1].p <= p) i++;
        const a = SHOTS[i], b = SHOTS[i + 1], t = ease((p - a.p) / (b.p - a.p || 1));
        const lerp3 = (u, v) => u.map((x, k) => x + (v[k] - x) * t);
        return { target: lerp3(a.target, b.target), from: lerp3(a.from, b.from), fov: a.fov + (b.fov - a.fov) * t };
    };
    function pose(p) {
        const back = 1 - win(p, ...STAGES.reassemble);
        for (const obj of T.parts) {
            obj.position.copy(obj.userData.rest);
            for (const { stage: s, by } of obj.userData.moves) obj.position.addScaledVector(by, win(p, ...STAGES[s]) * back);
        }
        // the accent
        const focus = accentFor(p), focusObj = focus && byName(focus);
        T.root.traverse((o) => {
            if (!o.isMesh) return;
            if (!o.userData.base) o.userData.base = o.material;
            let lit = false;
            for (let q = o; q && !lit; q = q.parent) if (q === focusObj) lit = true;
            o.material = lit ? M.accentOf(o.userData.base) : o.userData.base;
        });
        const s = shotAt(p);
        camera.position.set(s.target[0] + s.from[0], s.target[1] + s.from[1], s.target[2] + s.from[2]);
        camera.lookAt(...s.target);
        // a tall phone screen needs a much wider lens to keep the same machine in frame
        const aspect = stage.clientWidth / stage.clientHeight;
        camera.fov = s.fov * (aspect < 0.9 ? 1 + 1.05 * (0.9 - aspect) / 0.44 : 1);
        frame(stage.clientWidth, stage.clientHeight);
    }
    // the accent: a pale blue-steel version of each base material
    const accents = new Map();
    M.accentOf = (mat) => {
        if (!accents.has(mat)) { const c = mat.clone(); c.color = new THREE.Color(mat.color).lerp(new THREE.Color(0x9ec3e6), 0.55); accents.set(mat, c); }
        return accents.get(mat);
    };

    function placeCallouts(p) {
        const w = stage.clientWidth, h = stage.clientHeight;
        for (const c of callouts) {
            const o = clamp(Math.min((p - c.show[0]) / 0.02, (c.show[1] - p) / 0.02));
            if (!c.obj || o <= 0) { c.g.style.opacity = 0; c.box = null; continue; }
            const world = c.obj.localToWorld(V(...c.at));
            const s = world.clone().project(camera);
            const x = (s.x * 0.5 + 0.5) * w, y = (-s.y * 0.5 + 0.5) * h;
            // balloons sit up and to the right of their part, clear of the text column on the left,
            // unless the part is near the right edge
            const right = x < w * 0.8;
            const bx = x + (right ? 64 : -64), by = y - 34;
            const [line, dot, num, label] = c.g.children;
            line.setAttribute('x1', x); line.setAttribute('y1', y); line.setAttribute('x2', bx); line.setAttribute('y2', by);
            dot.setAttribute('cx', x); dot.setAttribute('cy', y);
            num.setAttribute('x', bx + (right ? 4 : -4)); num.setAttribute('y', by - 6); num.setAttribute('text-anchor', right ? 'start' : 'end');
            label.setAttribute('x', bx + (right ? 4 : -4)); label.setAttribute('y', by + 8); label.setAttribute('text-anchor', right ? 'start' : 'end');
            c.g.style.opacity = o;
            c.box = { x, y, bx, by, right };
        }
        // keep labels on each side at least 30 px apart, pushing later ones down
        for (const side of [true, false]) {
            const list = callouts.filter((c) => c.g.style.opacity > 0 && c.box && c.box.right === side).sort((a, b) => a.box.by - b.box.by);
            for (let i = 1; i < list.length; i++) {
                const prev = list[i - 1].box, cur = list[i].box;
                if (cur.by - prev.by < 30) { cur.by = prev.by + 30; place(list[i]); }
            }
        }
    }
    function place(c) {
        const { x, y, bx, by, right } = c.box;
        const [line, , num, label] = c.g.children;
        line.setAttribute('x2', bx); line.setAttribute('y2', by);
        num.setAttribute('x', bx + (right ? 4 : -4)); num.setAttribute('y', by - 6);
        label.setAttribute('x', bx + (right ? 4 : -4)); label.setAttribute('y', by + 8);
    }

    function resize() {
        const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight, r = renderer.getPixelRatio();
        renderer.setSize(w, h, false);
        colourRT.setSize(w * r, h * r); normalRT.setSize(w * r, h * r);
        U.uTexel.value.set(1 / (w * r), 1 / (h * r));
        U.uWidth.value = Math.max(1, r * 0.75);
        overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
        camera.aspect = w / h;
        frame(w, h);
    }
    // on a wide screen the drawing's centre sits at about 64 % across, clear of the text on the left
    function frame(w, h) {
        const wide = w / h > 1.1;
        if (wide) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); else camera.clearViewOffset();
        camera.updateProjectionMatrix();
    }
    resize();
    new ResizeObserver(resize).observe(stage);

    function draw() {
        pose(now);
        // the rotor turns slowly at rest, and is still while it is apart
        const turning = 1 - win(now, 0.08, 0.14) * (1 - win(now, 0.92, 0.99));
        T.spin.rotation.x = still ? 0 : time * 0.18 * turning;
        renderer.setRenderTarget(colourRT); renderer.render(scene, camera);
        scene.overrideMaterial = normalMat;
        renderer.setRenderTarget(normalRT); renderer.render(scene, camera);
        scene.overrideMaterial = null;
        U.tColour.value = colourRT.texture; U.tNormal.value = normalRT.texture; U.tDepth.value = normalRT.depthTexture;
        U.uNear.value = camera.near; U.uFar.value = camera.far;
        renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
        placeCallouts(now);
    }

    const clock = new THREE.Timer();
    let raf = 0;
    const loop = () => {
        raf = requestAnimationFrame(loop);
        clock.update();
        const dt = Math.min(0.1, clock.getDelta());
        time += dt;
        now += (goal - now) * (1 - Math.exp(-dt * 5));
        if (Math.abs(goal - now) < 1e-5) now = goal;
        draw();
    };
    if (still) draw(); else loop();

    return {
        camera, renderer, scene, parts: T.parts,
        setProgress(p, jump = false) { goal = clamp(p); if (jump || still) { now = goal; draw(); } },
        draw: () => draw(),
        stop: () => cancelAnimationFrame(raf),
    };
}
