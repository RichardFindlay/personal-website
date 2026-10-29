// The homepage island, drawn live with three.js from the model that
// figures/island/build.mjs makes (island.glb, with soft shadows baked into its
// colours) and the motion data beside it (island.json). An orthographic
// camera in the same 60° view as the earlier drawing, a warm sun with real
// shadows, glossy water, turning rotors and electric cars on the left.
//
// Plan coordinates (x east, y south, z up) map to three's (x, z, y).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const V = (p) => new THREE.Vector3(p[0], p[2], p[1]);
const RAD = Math.PI / 180;

export async function mountIsland(stage, { still = false } = {}) {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frozen = still || reduceMotion;
    const [gltf, meta] = await Promise.all([
        new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(stage.dataset.glb),
        fetch(stage.dataset.meta).then((r) => r.json()),
    ]);

    // ── Renderer: transparent, so the page's white is the backdrop ──────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    // ── Camera: parallel projection, framed as the 1440 × 900 hero ──────────
    const { azimuth, elevation, frame, pad, headroom } = meta.camera;
    const { tile, depth } = meta;
    const toward = new THREE.Vector3(Math.cos(elevation * RAD) * Math.cos(azimuth * RAD), Math.sin(elevation * RAD), Math.cos(elevation * RAD) * Math.sin(azimuth * RAD));
    const target = V([tile.w / 2, tile.d / 2, -depth / 2]);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    camera.position.copy(target).addScaledVector(toward, 2500);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // the island's extent on screen, in metres along the camera's right and up
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const extremes = [];
    for (const x of [0, tile.w]) for (const y of [0, tile.d]) for (const z of [-depth, 0]) extremes.push(V([x, y, z]));
    for (const p of meta.tall || []) extremes.push(V(p));
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    for (const p of extremes) {
        const d = p.clone().sub(target);
        minR = Math.min(minR, d.dot(right)); maxR = Math.max(maxR, d.dot(right));
        minU = Math.min(minU, d.dot(up)); maxU = Math.max(maxU, d.dot(up));
    }
    // metres to frame px, and where the frame's centre sits in camera space
    const perMetre = Math.min((frame[0] - 2 * pad) / (maxR - minR), (frame[1] - 2 * pad - headroom) / (maxU - minU));
    const centreR = (minR + maxR) / 2;
    const centreU = (minU + maxU) / 2 + headroom / 2 / perMetre;
    const view = { zoom: 1, panR: 0, panU: 0 };

    function frameCamera() {
        const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
        renderer.setSize(w, h, false);
        // fit the 1440 × 900 frame inside the viewport, as an SVG's "meet" would
        const fit = Math.min(w / frame[0], h / frame[1]) * view.zoom;
        const halfW = w / 2 / (perMetre * fit), halfH = h / 2 / (perMetre * fit);
        const cr = centreR + view.panR, cu = centreU + view.panU;
        camera.left = cr - halfW; camera.right = cr + halfW;
        camera.top = cu + halfH; camera.bottom = cu - halfH;
        camera.updateProjectionMatrix();
    }

    // ── Light: a warm low sun from the upper left, and the sky ──────────────
    const hemi = new THREE.HemisphereLight(0xd6ecff, 0x9db878, 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
    // from the south-west and high: the faces turned to the viewer catch it
    const sunDir = new THREE.Vector3(-0.72, 1.0, 0.58).normalize();
    sun.position.copy(target).addScaledVector(sunDir, 1500);
    sun.target.position.copy(target);
    sun.castShadow = true;
    const small = Math.min(innerWidth, innerHeight) < 700;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -720, right: 720, top: 720, bottom: -720, near: 500, far: 2600 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    // ── Materials, by the name each part carries from Blender ──────────────
    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const lamp = (colour, base = 0) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: colour, emissiveIntensity: base, side: THREE.DoubleSide });
    const MATERIALS = {
        ground: solid, rock: solid, solid,
        water: new THREE.MeshStandardMaterial({ color: 0x3bbcd8, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.86 }),
        lights_window: lamp(0xffcf7a), lights_glow: lamp(0xffb45a), lights_beacon: lamp(0xff4b3a, 0.6),
        lights_led: lamp(0x3ee07f, 0.8), lights_head: lamp(0xfff2c4), lights_lamp: lamp(0xfff0b0, 0.3),
    };
    const lights = {};
    for (const [name, m] of Object.entries(MATERIALS)) if (name.startsWith('lights_')) lights[name.slice(7)] = m;

    const model = gltf.scene;
    const protos = {};
    model.traverse((o) => {
        if (o.name.startsWith('proto_') && !o.isMesh && o.parent === model) protos[o.name.slice(6)] = o;
        if (!o.isMesh) return;
        const name = o.material?.name || '';
        if (name === 'lights_heat') { o.visible = false; return; }
        o.material = MATERIALS[name] || solid;
        o.castShadow = name !== 'water' && !name.startsWith('lights_');
        o.receiveShadow = name !== 'water';
    });
    for (const p of Object.values(protos)) model.remove(p);
    scene.add(model);

    // ── Instances: trees, houses, pylons and sheep from their prototypes ────
    const byProto = {};
    for (const inst of meta.instances) (byProto[inst.proto] ||= []).push(inst);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
    for (const [name, list] of Object.entries(byProto)) {
        const proto = protos[name];
        if (!proto) continue;
        proto.updateMatrixWorld(true);
        proto.traverse((o) => {
            if (!o.isMesh) return;
            const mesh = new THREE.InstancedMesh(o.geometry, o.material, list.length);
            list.forEach((inst, i) => {
                q.setFromAxisAngle(yAxis, -inst.rot);
                s.setScalar(inst.scale);
                m4.compose(V(inst.at), q, s).multiply(o.matrixWorld);
                mesh.setMatrixAt(i, m4);
            });
            mesh.castShadow = !o.material.name?.startsWith?.('lights') && o.material !== MATERIALS.lights_window;
            mesh.receiveShadow = true;
            scene.add(mesh);
        });
    }

    // ── Rotors: the unit rotor, scaled, turned into the wind, spinning ──────
    const rotorProto = protos.rotor;
    const rotors = meta.rotors.map((r) => {
        const mount = new THREE.Object3D();
        mount.position.copy(V(r.at));
        mount.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), V(r.axis).normalize());
        const spin = new THREE.Object3D();
        rotorProto.updateMatrixWorld(true);
        // each mesh keeps its node's transform: gltfpack's dequantisation lives there
        rotorProto.traverse((o) => { if (o.isMesh) { const c = new THREE.Mesh(o.geometry, o.material); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); c.castShadow = true; spin.add(c); } });
        spin.scale.setScalar(r.R);
        mount.add(spin);
        scene.add(mount);
        return { spin, phase: r.phase, speed: (r.rpm * Math.PI * 2) / 60 };
    });

    // ── Cars: one instanced fleet, each car on its road, keeping left ───────
    const carProto = protos.car;
    const roads = Object.fromEntries(Object.entries(meta.roads).map(([name, pts]) => {
        const lens = [0];
        for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        return [name, { pts, lens, total: lens[lens.length - 1] }];
    }));
    const carMeshes = [];
    carProto.updateMatrixWorld(true);
    carProto.traverse((o) => {
        if (!o.isMesh) return;
        const mesh = new THREE.InstancedMesh(o.geometry, o.material, meta.cars.length);
        mesh.castShadow = o.material === solid;
        if (o.name.includes('paint')) {
            meta.cars.forEach((c, i) => mesh.setColorAt(i, new THREE.Color(c.colour)));
        }
        carMeshes.push({ mesh, local: o.matrixWorld.clone() });
        scene.add(mesh);
    });
    const carState = meta.cars.map((c) => ({ ...c, s: c.at * roads[c.road].total }));
    function placeCars(dt) {
        carState.forEach((c, i) => {
            const road = roads[c.road];
            c.s += (c.forward ? 1 : -1) * c.speed * dt;
            if (c.s > road.total) { c.s = road.total; c.forward = false; }
            if (c.s < 0) { c.s = 0; c.forward = true; }
            let k = 1;
            while (k < road.lens.length - 1 && road.lens[k] < c.s) k++;
            const a = road.pts[k - 1], b = road.pts[k], t = (c.s - road.lens[k - 1]) / ((road.lens[k] - road.lens[k - 1]) || 1);
            let dx = b[0] - a[0], dy = b[1] - a[1];
            const l = Math.hypot(dx, dy) || 1;
            dx /= l; dy /= l;
            if (!c.forward) { dx = -dx; dy = -dy; }
            const lane = meta.roadWidth[c.road] / 4;
            // keep left: the left of the direction of travel, with y running south
            const at = [a[0] + (b[0] - a[0]) * t + dy * lane, a[1] + (b[1] - a[1]) * t - dx * lane, a[2] + (b[2] - a[2]) * t];
            q.setFromAxisAngle(yAxis, -Math.atan2(dy, dx));
            m4.compose(V(at), q, s.setScalar(1));
            for (const { mesh, local } of carMeshes) mesh.setMatrixAt(i, m4.clone().multiply(local));
        });
        for (const { mesh } of carMeshes) mesh.instanceMatrix.needsUpdate = true;
    }

    // ── The geothermal heat: a soft glow on the cut face round the bore ─────
    {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,150,70,0.95)');
        grad.addColorStop(0.5, 'rgba(235,95,45,0.4)');
        grad.addColorStop(1, 'rgba(210,80,40,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(110, 46), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
        glow.position.copy(V([meta.bore[0], meta.bore[1] + 0.6, meta.bore[2]]));
        scene.add(glow);
    }

    // ── Steam over the cooling towers: soft puffs rising and thinning ───────
    const puffTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        // white at the heart, a cool grey towards the edge, so it reads on a white page
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.45, 'rgba(240,244,248,0.9)');
        grad.addColorStop(0.75, 'rgba(196,207,218,0.55)');
        grad.addColorStop(1, 'rgba(190,202,214,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    })();
    const puffs = [];
    for (const vent of meta.steam) for (let n = 0; n < 9; n++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0xffffff, toneMapped: false }));
        scene.add(sprite);
        puffs.push({ sprite, vent: V(vent), age: n / 9 });
    }
    function placeSteam(dt) {
        for (const p of puffs) {
            p.age = (p.age + dt / 11) % 1;
            const a = p.age;
            p.sprite.position.copy(p.vent).add(new THREE.Vector3(18 * a + 4 * Math.sin(a * 9 + p.vent.x), 6 + 55 * a, -10 * a));
            p.sprite.scale.setScalar(16 + 40 * a);
            p.sprite.material.opacity = 0.7 * Math.sin(Math.PI * Math.min(1, a * 1.15));
        }
    }

    // ── Running ─────────────────────────────────────────────────────────────
    let progress = 0, clock = 0, last = 0, visible = true, raf = 0;
    function draw() {
        for (const r of rotors) r.spin.rotation.x = r.phase + clock * r.speed;
        renderer.render(scene, camera);
    }
    function tick(now) {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        clock += dt;
        placeCars(dt);
        placeSteam(dt);
        draw();
        raf = visible && !frozen && !document.hidden ? requestAnimationFrame(tick) : 0;
    }
    const start = () => { if (!raf && !frozen) { last = 0; raf = requestAnimationFrame(tick); } };
    frameCamera();
    placeCars(0);
    placeSteam(0.0);
    draw();
    new ResizeObserver(() => { frameCamera(); draw(); }).observe(stage);
    new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) start(); }).observe(stage);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    start();

    return {
        // the scroll's progress, 0 to 1: the camera, the sun and the night follow it from M2
        setProgress(p) { progress = p; if (frozen) draw(); },
        camera, renderer, scene, view, frameCamera, draw,
        get progress() { return progress; },
    };
}
