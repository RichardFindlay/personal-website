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
import { buildTurbine } from './turbine-model.js';

// ── Small helpers ───────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { const t = clamp(x); return t * t * t * (t * (t * 6 - 15) + 10); };   // smootherstep
const win = (p, a, b) => ease((p - a) / (b - a));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ── Materials: paper white, with a little tone so the forms read ────────────
// Double-sided throughout: some turned bodies face inward, and the spinner is a thin shell.
function materials() {
    const base = (hex) => new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide });
    return { white: base(0xffffff), light: base(0xf4f5f6), mid: base(0xe6e8ea), dark: base(0xcdd2d6), spinner: base(0xffffff) };
}

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
    { n: '2', label: 'SPINNER', part: 'spinner', at: [-2.0, 1.5, 0.3], show: [0.14, 0.27] },
    { n: '3', label: 'HUB', part: 'hub casting', at: [0, 0.6, 1.4], show: [0.16, 0.27] },
    { n: '4', label: 'MAIN SHAFT', part: 'main shaft', at: [-0.4, 0.46, 0], show: [0.16, 0.27] },
    { n: '5', label: 'GEARBOX', part: 'parallel stage housing', at: [1.15, 1.62, 0], show: [0.16, 0.27] },
    { n: '6', label: 'GENERATOR', part: 'generator cooler', at: [0, 1.47, 0], show: [0.16, 0.27] },
    { n: '7', label: 'NACELLE COVER', part: 'cover roof', at: [4, 4.4, 1.6], show: [0.12, 0.27] },
    { n: '8', label: 'YAW SYSTEM', part: 'yaw ring gear', at: [0, 0.1, 2.15], show: [0.16, 0.27] },
    { n: '3.1', label: 'PITCH BEARING', part: 'pitch bearing outer ring', at: [1.22, 1.84, 0], show: [0.31, 0.39] },
    { n: '3.2', label: 'BALLS, 2 ROWS', part: 'pitch bearing balls', at: [1.0, 1.84, 0], show: [0.32, 0.39] },
    { n: '3.3', label: 'PITCH DRIVE', part: 'pitch drive', at: [0.12, 1.3, 0.74], show: [0.32, 0.39] },
    { n: '3.4', label: 'BLADE STUDS ×64', part: 'blade root bolts', at: [0, 1.97, 0.94], show: [0.32, 0.39] },
    { n: '3.5', label: 'PITCH CABINET', part: 'pitch cabinet', at: [-0.45, 0.8, 1.39], show: [0.32, 0.39] },
    { n: '3.6', label: 'BARREL NUTS ×64', part: 'barrel nuts', at: [0, 2.32, 1.17], show: [0.33, 0.39] },
    { n: '3.7', label: 'VORTEX GENERATORS', part: 'vortex generators', at: [0.3, 6.0, 0.5], show: [0.33, 0.39] },
    { n: '4.1', label: 'MAIN BEARING', part: 'housing', at: [0, 1.02, 0], show: [0.42, 0.49] },
    { n: '4.2', label: 'ROLLERS ×48', part: 'rollers', at: [0.16, 0.53, 0], show: [0.43, 0.49] },
    { n: '4.3', label: 'CAGE', part: 'cage', at: [0, 0.535, 0.1], show: [0.43, 0.49] },
    { n: '4.4', label: 'ROTOR LOCK DISC', part: 'rotor lock disc', at: [-2.25, 1.0, 0.6], show: [0.43, 0.49] },
    { n: '4.5', label: 'LOCKING PIN', part: 'rotor lock pin', at: [0.2, 0.12, 0], show: [0.43, 0.49] },
    { n: '4.6', label: 'GREASE LINES', part: 'grease lines', at: [0.3, 1.35, 0.4], show: [0.43, 0.49] },
    { n: '5.1', label: 'RING GEAR', part: 'ring gear', at: [0, 1.12, 0], show: [0.53, 0.61] },
    { n: '5.2', label: 'PLANET ×3', part: 'planet gear', at: [0, 0.38, 0], show: [0.53, 0.61] },
    { n: '5.3', label: 'SUN', part: 'sun gear', at: [0, 0.28, 0], show: [0.54, 0.61] },
    { n: '5.4', label: 'PLANET CARRIER', part: 'planet carrier', at: [0.3, 0.92, 0], show: [0.54, 0.61] },
    { n: '5.5', label: 'SHRINK DISC', part: 'shrink disc', at: [-1.62, 0.66, 0], show: [0.54, 0.61] },
    { n: '5.6', label: 'BULL GEAR', part: 'bull gear', at: [0, 0.65, 0], show: [0.54, 0.61] },
    { n: '5.7', label: 'HIGH-SPEED PINION', part: 'high-speed pinion', at: [0.2, 1.4, 0], show: [0.54, 0.61] },
    { n: '6.1', label: 'STATOR', part: 'stator frame', at: [0, 0.9, 0.6], show: [0.65, 0.75] },
    { n: '6.2', label: 'ROTOR', part: 'rotor core', at: [0, 0.58, 0], show: [0.65, 0.75] },
    { n: '6.3', label: 'SLIP RINGS', part: 'slip rings', at: [1.75, 0.17, 0], show: [0.66, 0.75] },
    { n: '6.4', label: 'END WINDING', part: 'rotor core', at: [-1.25, 0.5, 0.1], show: [0.66, 0.75] },
    { n: '6.5', label: 'COOLER', part: 'generator cooler', at: [0.5, 1.6, 0.3], show: [0.66, 0.75] },
    { n: '6.6', label: 'BRAKE DISC', part: 'brake disc', at: [0.3, 0.5, 0], show: [0.66, 0.75] },
    { n: '6.7', label: 'COUPLING', part: 'coupling', at: [1.1, 0.13, 0], show: [0.66, 0.75] },
    { n: '8.1', label: 'YAW BEARING', part: 'yaw ring gear', at: [0, 0.1, 2.15], show: [0.8, 0.89] },
    { n: '8.2', label: 'YAW DRIVE ×8', part: 'yaw drive', at: [0, 1.2, 0.18], show: [0.8, 0.89] },
    { n: '8.3', label: 'YAW BRAKE ×10', part: 'yaw brake', at: [0, -0.28, 0.1], show: [0.8, 0.89] },
    { n: '8.4', label: 'BRAKE DISC', part: 'yaw brake disc', at: [0, -0.28, 2.08], show: [0.8, 0.89] },
    { n: '8.5', label: 'CABLE LOOP', part: 'cable loop', at: [0.1, -0.6, 0], show: [0.81, 0.89] },
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
    const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
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
