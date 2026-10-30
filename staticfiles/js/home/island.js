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
    const target = V([(tile.x || 0) + tile.w / 2, (tile.y || 0) + tile.d / 2, -depth / 2]);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    camera.position.copy(target).addScaledVector(toward, 2500);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    // the island's extent on screen, in metres along the camera's right and up
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const extremes = [];
    for (const x of [tile.x || 0, (tile.x || 0) + tile.w]) for (const y of [tile.y || 0, (tile.y || 0) + tile.d]) for (const z of [-depth, 0]) extremes.push(V([x, y, z]));
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
    const hemi = new THREE.HemisphereLight(0xdfefff, 0xb9c398, 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe9c8, 3.2);
    // from the south-west and high: the faces turned to the viewer catch it
    const sunDir = new THREE.Vector3(-0.72, 1.0, 0.58).normalize();
    sun.position.copy(target).addScaledVector(sunDir, 1500);
    sun.target.position.copy(target);
    sun.castShadow = true;
    const small = Math.min(innerWidth, innerHeight) < 700;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 460, bottom: -460, near: 900, far: 2200 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    // ── Materials, by the name each part carries from Blender ──────────────
    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const lamp = (colour, base = 0) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: colour, emissiveIntensity: base, side: THREE.DoubleSide });
    const MATERIALS = {
        ground: solid, rock: solid, solid,
        water: new THREE.MeshStandardMaterial({ color: 0x3dbbe7, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.9 }),
        lights_window: lamp(0xffcf7a), lights_glow: lamp(0xffb45a), lights_beacon: lamp(0xff4b3a, 0.6),
        lights_led: lamp(0x3ee07f, 0.8), lights_head: lamp(0xfff2c4), lights_lamp: lamp(0xfff0b0, 0.3),
        lights_trace: lamp(0x46e0e6, 1.6),
        lights_lantern: lamp(0xffb347, 0.25),
        foam: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f7ff, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
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
        if (name === 'leaves') { o.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); o.castShadow = true; o.receiveShadow = false; return; }
        o.material = MATERIALS[name] || solid;
        o.castShadow = name !== 'water' && name !== 'foam' && !name.startsWith('lights_');
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
            if (o.material.colorWrite === false) mesh.receiveShadow = false;
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
            m4.compose(V(at), q, s.setScalar(meta.carScale || 1));
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
    const vents = [...meta.steam.map((v) => ({ v, kind: 'steam' })), ...(meta.smoke || []).map((v) => ({ v, kind: 'smoke' })), ...(meta.spray || []).map((v) => ({ v, kind: 'spray' }))];
    const PUFF = { steam: { n: 9, size: 1, colour: 0xffffff, rise: 1, life: 11 }, smoke: { n: 6, size: 0.45, colour: 0xc9c4bd, rise: 1, life: 11 }, spray: { n: 5, size: 0.22, colour: 0xffffff, rise: 0.25, life: 2.6 } };
    for (const { v: vent, kind } of vents) for (let n = 0; n < PUFF[kind].n; n++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: PUFF[kind].colour, toneMapped: false }));
        scene.add(sprite);
        puffs.push({ sprite, vent: V(vent), age: n / PUFF[kind].n, size: PUFF[kind].size, rise: PUFF[kind].rise, life: PUFF[kind].life });
    }
    function placeSteam(dt) {
        for (const p of puffs) {
            p.age = (p.age + dt / p.life) % 1;
            const a = p.age;
            p.sprite.position.copy(p.vent).add(new THREE.Vector3((18 * a + 4 * Math.sin(a * 9 + p.vent.x)) * p.size, (6 + 55 * a) * p.size * p.rise, -10 * a * p.size));
            p.sprite.scale.setScalar((16 + 40 * a) * p.size);
            p.sprite.material.opacity = 0.7 * Math.sin(Math.PI * Math.min(1, a * 1.15));
        }
    }

    // ── Clouds: puffs of the prototype, drifting slowly over the island ────
    const cloudParts = [];
    if (protos.cloud && meta.clouds) {
        protos.cloud.updateMatrixWorld(true);
        protos.cloud.traverse((o) => {
            if (!o.isMesh) return;
            const mesh = new THREE.InstancedMesh(o.geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }), meta.clouds.length);
            mesh.castShadow = true;
            cloudParts.push({ mesh, local: o.matrixWorld.clone() });
            scene.add(mesh);
        });
    }
    function placeClouds(t) {
        (meta.clouds || []).forEach((c, i) => {
            const at = [c.at[0] + 14 * Math.sin(t / 23 + i * 1.7), c.at[1] + 8 * Math.cos(t / 31 + i), c.at[2] + 2.5 * Math.sin(t / 7 + i * 2.3)];
            q.setFromAxisAngle(yAxis, -c.rot);
            m4.compose(V(at), q, s.setScalar(c.scale));
            for (const { mesh, local } of cloudParts) mesh.setMatrixAt(i, m4.clone().multiply(local));
        });
        for (const { mesh } of cloudParts) mesh.instanceMatrix.needsUpdate = true;
    }

    // ── Energy pulses running along the pylon lines, source to city ────────
    const pulseGeo = new THREE.SphereGeometry(2.2, 12, 8);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xb8fbff, toneMapped: false });
    const traces = (meta.lines || meta.traces || []).map((pts) => {
        const lens = [0];
        for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const dots = [0, 1, 2].map(() => { const m = new THREE.Mesh(pulseGeo, pulseMat); scene.add(m); return m; });
        return { pts, lens, total: lens[lens.length - 1], dots };
    });
    const pointOn = (t, d) => {
        let k = 1;
        while (k < t.lens.length - 1 && t.lens[k] < d) k++;
        const a = t.pts[k - 1], b = t.pts[k], f = (d - t.lens[k - 1]) / ((t.lens[k] - t.lens[k - 1]) || 1);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    };
    function placePulses(t) {
        traces.forEach((tr, i) => tr.dots.forEach((dot, n) => {
            const d = ((t * 38 + n * tr.total / 3 + i * 17) % tr.total);
            dot.position.copy(V(pointOn(tr, d)));
        }));
    }

    // ── Data rising from the data centre: little coloured pixels ───────────
    const pixelGeo = new THREE.BoxGeometry(2.6, 2.6, 2.6);
    const PIXEL_COLOURS = [0xf2a83b, 0x46e0e6, 0xf26b4f, 0xf5d547, 0x7bd389];
    const pixels = [];
    for (const src of meta.pixels || []) for (let n = 0; n < 26; n++) {
        const m = new THREE.Mesh(pixelGeo, new THREE.MeshBasicMaterial({ color: PIXEL_COLOURS[n % PIXEL_COLOURS.length], transparent: true, toneMapped: false }));
        scene.add(m);
        pixels.push({ m, src, age: n / 26, dx: (Math.random() - 0.5) * 30, dy: (Math.random() - 0.5) * 22 });
    }
    function placePixels(dt) {
        for (const p of pixels) {
            p.age = (p.age + dt / 7) % 1;
            const a = p.age;
            p.m.position.copy(V([p.src[0] + p.dx * a, p.src[1] + p.dy * a, p.src[2] + 4 + 70 * a]));
            p.m.material.opacity = Math.min(1, a * 6) * (1 - a);
            p.m.rotation.set(a * 3, a * 2, 0);
        }
    }

    // ── Grass: swaying blades over every green patch, after Bruno Simon's ──
    // A grid from the build (heights, where grass grows, the ground's colour);
    // each blade is one triangle, coloured from the ground beneath it, darker at
    // the root, bending in the wind.
    const wind = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.8, 0.6) } };
    const toLinear = (c) => Math.pow(c / 255, 2.2);
    if (meta.grass) {
        const G = meta.grass, n = G.nx * G.ny;
        const buf = await fetch(stage.dataset.glb.replace('island.glb', 'island-grass.bin')).then((r) => r.arrayBuffer());
        const heights = new Int16Array(buf, 0, n), mask = new Uint8Array(buf, 2 * n, n), colour = new Uint8Array(buf, 3 * n, 3 * n);
        const hAt = (fx, fy) => {
            const i = Math.min(G.nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(G.ny - 2, Math.max(0, Math.floor(fy))), u = fx - i, v = fy - j;
            const h = (a, b) => heights[b * G.nx + a] / 10;
            return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
        };
        const perCell = Math.min(innerWidth, innerHeight) < 700 ? 3 : 6;
        const pos = [], params = [], tint = [];
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let j = 0; j < G.ny - 1; j++) for (let i = 0; i < G.nx - 1; i++) {
            const c = j * G.nx + i;
            if (!mask[c]) continue;
            for (let k = 0; k < perCell; k++) {
                const fx = i + rnd(), fy = j + rnd();
                if (!mask[Math.round(fy) * G.nx + Math.round(fx)]) continue;
                const x = G.x0 + fx * G.step, y = G.y0 + fy * G.step;
                pos.push(x, hAt(fx, fy) - 0.2, y);
                params.push(2.4 + rnd() * 2.2, 0.9 + rnd() * 0.5, rnd() * Math.PI * 2, rnd());
                tint.push(toLinear(colour[c * 3]), toLinear(colour[c * 3 + 1]), toLinear(colour[c * 3 + 2]));
            }
        }
        const blade = new THREE.InstancedBufferGeometry();
        blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0], 3));
        blade.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
        blade.setAttribute('iParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 4));
        blade.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 3));
        blade.instanceCount = pos.length / 3;
        const grass = new THREE.Mesh(blade, new THREE.ShaderMaterial({
            uniforms: wind,
            side: THREE.DoubleSide,
            vertexShader: `
                attribute vec3 iPos; attribute vec4 iParams; attribute vec3 iTint;
                uniform float uTime; uniform vec2 uWind;
                varying float vUp; varying vec3 vTint; varying float vShade;
                void main() {
                    float h = iParams.x, w = iParams.y, r = iParams.z;
                    vec3 p = vec3(cos(r) * position.x * w, position.y * h, sin(r) * position.x * w);
                    float gust = sin(uTime * 1.6 + iPos.x * 0.045 + iPos.z * 0.06) + 0.5 * sin(uTime * 2.9 + iPos.x * 0.11 - iPos.z * 0.07);
                    float bend = (0.25 + 0.3 * gust) * h * position.y * position.y;
                    p.x += bend * uWind.x; p.z += bend * uWind.y; p.y -= abs(bend) * 0.2 * position.y;
                    vUp = position.y; vTint = iTint; vShade = iParams.w;
                    gl_Position = projectionMatrix * viewMatrix * vec4(iPos + p, 1.0);
                }`,
            fragmentShader: `
                varying float vUp; varying vec3 vTint; varying float vShade;
                void main() {
                    vec3 base = vTint * 0.55, tip = vTint * 1.25 + vec3(0.06, 0.06, -0.02);
                    vec3 c = mix(base, tip, smoothstep(0.0, 1.0, vUp)) * (0.88 + 0.24 * vShade);
                    gl_FragColor = vec4(c, 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`,
        }));
        grass.frustumCulled = false;
        scene.add(grass);
    }

    // ── Trees: soft clusters of leaf cards, lit for volume, swaying ────────
    // The solid leaf shapes from the model stay as invisible shadow casters.
    {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        let sd = 3;
        const r2 = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
        for (let n = 0; n < 14; n++) {
            const a = r2() * Math.PI * 2, d = r2() * 34;
            g.beginPath();
            g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 14 + r2() * 12, 9 + r2() * 8, r2() * Math.PI, 0, Math.PI * 2);
            g.fill();
        }
        const leafTex = new THREE.CanvasTexture(c);
        const G3 = (h) => [1, 3, 5].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16)));
        // each kind: where its crown sits, how many cards, and its shade, middle and sunlit colours
        const shapes = {
            oak: { centre: [0, 0, 11.5], r: 6.8, cards: 30, size: 6.4, tall: 1, leaf: ['#5c7a4a', '#91ad78', '#b7c98a'] },
            birch: { centre: [0, 0, 13], r: 5.2, cards: 24, size: 5.2, tall: 1.15, leaf: ['#7f8a2a', '#abae2b', '#d2cf5a'] },
            cherry: { centre: [0, 0, 9.5], r: 6.2, cards: 28, size: 6.0, tall: 0.95, leaf: ['#c24a7c', '#ed71a0', '#f7a4c0'] },
            bush: { centre: [0, 0, 1.8], r: 2.5, cards: 10, size: 2.6, tall: 0.8, leaf: ['#55703f', '#7e9a66', '#a4bb86'] },
        };
        const sun = new THREE.Vector3(-0.72, 1.0, 0.58).normalize();
        const centres = [], sizes = [], shades = [], phases = [];
        let sd2 = 11;
        const r3 = () => ((sd2 = (sd2 * 16807) % 2147483647) / 2147483647);
        for (const inst of meta.instances) {
            const S = shapes[inst.proto];
            if (!S) continue;
            const k = inst.scale;
            for (let n = 0; n < S.cards; n++) {
                // a point in the crown, its offset from the middle deciding how lit it is
                let ox, oy, oz;
                do { ox = r3() * 2 - 1; oy = r3() * 2 - 1; oz = r3() * 2 - 1; } while (ox * ox + oy * oy + oz * oz > 1);
                const off = new THREE.Vector3(ox * S.r, oz * S.r * S.tall, oy * S.r).multiplyScalar(k * 0.8);
                const p = V([inst.at[0] + S.centre[0] * k, inst.at[1] + S.centre[1] * k, inst.at[2] + S.centre[2] * k]).add(off);
                const lit = Math.max(0, Math.min(1, 0.5 + 0.5 * off.clone().normalize().dot(sun) + 0.15 * oz));
                const LEAF = S.leaf.map(G3);
                const col = lit < 0.5 ? LEAF[0].map((v, i) => v + (LEAF[1][i] - v) * lit * 2) : LEAF[1].map((v, i) => v + (LEAF[2][i] - v) * (lit - 0.5) * 2);
                centres.push(p.x, p.y, p.z); sizes.push(S.size * k * (0.75 + r3() * 0.5)); shades.push(...col); phases.push(r3() * 6.28);
            }
        }
        const card = new THREE.InstancedBufferGeometry();
        card.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
        card.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        card.setIndex([0, 1, 2, 0, 2, 3]);
        card.setAttribute('iCentre', new THREE.InstancedBufferAttribute(new Float32Array(centres), 3));
        card.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
        card.setAttribute('iShade', new THREE.InstancedBufferAttribute(new Float32Array(shades), 3));
        card.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
        card.instanceCount = sizes.length;
        const foliage = new THREE.Mesh(card, new THREE.ShaderMaterial({
            uniforms: { ...wind, uLeaf: { value: leafTex } },
            vertexShader: `
                attribute vec3 iCentre; attribute float iSize; attribute vec3 iShade; attribute float iPhase;
                uniform float uTime; uniform vec2 uWind;
                varying vec2 vUv; varying vec3 vShade;
                void main() {
                    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                    float sway = sin(uTime * 1.3 + iPhase + iCentre.x * 0.03) * 0.5;
                    vec3 p = iCentre + (right * position.x + up * position.y) * iSize + vec3(uWind.x, 0.0, uWind.y) * sway;
                    vUv = uv; vShade = iShade;
                    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
                }`,
            fragmentShader: `
                uniform sampler2D uLeaf;
                varying vec2 vUv; varying vec3 vShade;
                void main() {
                    if (texture2D(uLeaf, vUv).a < 0.5) discard;
                    gl_FragColor = vec4(vShade * (0.92 + 0.16 * vUv.y), 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`,
        }));
        foliage.frustumCulled = false;
        scene.add(foliage);
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
        wind.uTime.value = clock;
        placeCars(dt);
        placeSteam(dt);
        placeClouds(clock);
        placePulses(clock);
        placePixels(dt);
        draw();
        raf = visible && !frozen && !document.hidden ? requestAnimationFrame(tick) : 0;
    }
    const start = () => { if (!raf && !frozen) { last = 0; raf = requestAnimationFrame(tick); } };
    frameCamera();
    placeCars(0);
    placeSteam(0.0);
    placeClouds(0);
    placePulses(0.4);
    placePixels(0.5);
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
