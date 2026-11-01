import * as THREE from "three";
import { CAMERA_SCALE, VIEWBOX, VIEW_DIRECTION, stateAt, toViewBox } from "./choreography.js";
import { PARTS, SPEC } from "./parts/index.js";
import { LOOKS, createMaterials } from "./materials.js";

const NARROW_WIDTH = 900;
const SHADOW_SIZE = 2048;
// A frame slower than this, averaged over QUALITY_WINDOW spinning frames, drops the canvas to the next pixel ratio down. It never climbs back up.
const SLOW_FRAME_MS = 24;
const QUALITY_WINDOW = 45;
const PIXEL_RATIO_STEPS = [1.5, 1.25];
const CAMERA_DISTANCE = 600;
const CAMERA_AXIS = new THREE.Vector3(...VIEW_DIRECTION).normalize();
const SPIN_RATE = (SPEC.assumed.spinRpm / 60) * Math.PI * 2;
const THREE_FOLD = (Math.PI * 2) / 3;
const CANVAS_MARGIN = 1.4;
const SVG_NS = "http://www.w3.org/2000/svg";

const nextTask = () => new Promise((resolve) => setTimeout(resolve));

function buildCallouts() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tb3d-callouts");
  svg.setAttribute("viewBox", `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");
  const element = (name, attrs, parent) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.appendChild(node);
    return node;
  };
  const entries = PARTS.filter((part) => part.number).map((part) => {
    const group = element("g", { opacity: 0 }, svg);
    element("circle", { r: 2.6, fill: "var(--tb-ink)" }, group);
    const end = part.lead.at(-1);
    const points = ["0,0", ...part.lead.map(([dx, dy]) => `${dx},${dy}`)].join(" ");
    element("polyline", { points, fill: "none", stroke: "var(--tb-ink)", "stroke-width": 0.9 }, group);
    const left = part.side === "left";
    const text = element("text", { class: "tb3d-label", x: end[0] + (left ? -4 : 4), y: end[1] + 4, "text-anchor": left ? "end" : "start" }, group);
    const number = (attrs) => {
      const span = element("tspan", { class: "tb3d-number", ...attrs }, text);
      span.textContent = part.number;
    };
    if (!left) number({});
    const label = element("tspan", { dx: left ? 0 : 8 }, text);
    label.textContent = part.label;
    if (left) number({ dx: 8 });
    return { part, group };
  });
  return { svg, entries };
}

// Sky dome plus soft boxes: gives the paint a horizon line to reflect and the metal bright panels to catch.
function environmentScene(env) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(50, 32, 24);
  const position = dome.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const zenith = new THREE.Color(env.zenith);
  const horizon = new THREE.Color(env.horizon);
  const ground = new THREE.Color(env.ground);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const h = position.getZ(i) / 50;
    if (h >= 0) c.copy(horizon).lerp(zenith, Math.pow(h, 0.55));
    else c.copy(horizon).lerp(ground, Math.pow(-h, 0.35));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const key = new THREE.Color(env.key).multiplyScalar(env.keyStrength);
  for (const [x, y, z, w, h] of [[22, -30, 32, 26, 16], [-34, -14, 24, 12, 18], [30, 30, 14, 14, 8], [4, -38, 12, 22, 6]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: key, side: THREE.DoubleSide }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  return scene;
}

// A depth-only twin drawn first, so a fading mesh shows just its nearest surface however its triangles are ordered.
function fadeInPlace(root, fadeCopy) {
  const copies = new Map();
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const faded = new Set();
  const twins = [];
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh && !object.material.userData.selfFading) meshes.push(object);
  });
  for (const mesh of meshes) {
    if (!copies.has(mesh.material)) copies.set(mesh.material, fadeCopy(mesh.material));
    mesh.material = copies.get(mesh.material);
    faded.add(mesh.material);
    mesh.renderOrder = 1;
    const twin = mesh.isInstancedMesh ? new THREE.InstancedMesh(mesh.geometry, depthOnly, mesh.count) : new THREE.Mesh(mesh.geometry, depthOnly);
    if (mesh.isInstancedMesh) twin.instanceMatrix = mesh.instanceMatrix;
    twin.frustumCulled = mesh.frustumCulled;
    twin.renderOrder = 0;
    twins.push(twin);
    mesh.parent.add(twin);
  }
  return { materials: [...faded], twins };
}

export async function mountTurbine3D(figure, { signal, onLost }) {
  const checkpoint = () => {
    if (signal.aborted) throw new Error("turbine build timed out");
  };
  const narrow = () => window.innerWidth < NARROW_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.className = "tb3d-canvas";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  const callouts = buildCallouts();

  try {
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2);
    camera.up.set(0, 0, 1);

    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    sun.shadow.autoUpdate = false;
    sun.shadow.bias = -0.00025;
    sun.shadow.radius = 2.2;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 1000;
    scene.add(sun, sun.target);

    const { mats, shared, fadeCopy, applyLook } = createMaterials({ pileRadius: SPEC.published.monopileDiameter / 2 });

    const entries = [];
    const spinning = [];
    const fading = { blade: { roots: [], materials: [], twins: [] }, base: { roots: [], materials: [], twins: [] } };
    for (const part of PARTS) {
      await nextTask();
      checkpoint();
      const root = new THREE.Group();
      root.add(part.build(SPEC, mats));
      root.traverse((object) => {
        if (object.userData.spins) spinning.push(object);
      });
      if (part.fade) {
        const { materials, twins } = fadeInPlace(root, fadeCopy);
        fading[part.fade].roots.push(root);
        fading[part.fade].materials.push(...materials);
        fading[part.fade].twins.push(...twins);
      }
      scene.add(root);
      entries.push({ part, root, offset: new THREE.Vector3(...part.explode) });
    }
    await nextTask();
    checkpoint();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const environments = {};
    const environmentFor = (name) => {
      environments[name] ??= pmrem.fromScene(environmentScene(LOOKS[name].environment), 0.02, 0.1, 200).texture;
      return environments[name];
    };

    const applyTheme = () => {
      const name = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const look = LOOKS[name];
      scene.environment = environmentFor(name);
      scene.environmentIntensity = look.environment.intensity;
      renderer.toneMappingExposure = look.exposure;
      sun.color.set(look.sun.color);
      sun.intensity = look.sun.intensity;
      sunDirection.set(...look.sun.direction).normalize();
      applyLook(look);
    };
    const sunDirection = new THREE.Vector3();
    applyTheme();

    figure.append(canvas, callouts.svg);

    // The canvas covers the box and a margin for the rotor as it leaves, not the whole wide stage: clearing and resolving empty MSAA pixels costs real frame time.
    let pixelRatioLimit = Infinity;
    const view = { width: 1, height: 1, meet: 1 };
    const resize = () => {
      const height = Math.max(1, figure.clientHeight);
      const full = Math.max(1, figure.clientWidth);
      view.meet = Math.min(full / VIEWBOX.width, height / VIEWBOX.height);
      view.width = Math.min(full, Math.ceil(VIEWBOX.width * view.meet * CANVAS_MARGIN));
      view.height = height;
      canvas.style.width = `${view.width}px`;
      canvas.style.left = `${(full - view.width) / 2}px`;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow() ? 1.5 : 2, pixelRatioLimit));
      renderer.setSize(view.width, view.height, false);
    };
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let progress = 0;
    let spinAngle = 0;
    let spinRate = reducedMotion.matches ? 0 : SPIN_RATE;
    let seaTime = 0;
    let lastFrame = 0;
    let frame = 0;
    let lastProgress = 0;

    const target = new THREE.Vector3();
    const place = (state) => {
      const { zoom } = state.camera;
      const halfWidth = view.width / view.meet / 2 / (zoom * CAMERA_SCALE);
      const halfHeight = view.height / view.meet / 2 / (zoom * CAMERA_SCALE);
      target.set(...state.camera.target);
      camera.position.copy(target).addScaledVector(CAMERA_AXIS, CAMERA_DISTANCE);
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.lookAt(target);
      camera.updateProjectionMatrix();

      const reach = Math.max(halfWidth, halfHeight) * 1.08;
      const shadow = sun.shadow.camera;
      shadow.left = -reach;
      shadow.right = reach;
      shadow.top = reach;
      shadow.bottom = -reach;
      shadow.updateProjectionMatrix();
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDirection, 500);
      sun.shadow.normalBias = (reach * 2 * 1.6) / sun.shadow.mapSize.x;
    };

    const setFade = (group, amount) => {
      for (const root of group.roots) root.visible = amount > 0.002;
      for (const material of group.materials) material.opacity = amount;
      // Fully opaque, the depth test alone sorts it and the twin is wasted work.
      for (const twin of group.twins) twin.visible = amount < 1;
    };

    const draw = (now) => {
      const state = stateAt(progress);
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;

      const spinningFull = state.bladeFade >= 1;
      if (!reducedMotion.matches) {
        spinRate += ((spinningFull ? SPIN_RATE : 0) - spinRate) * Math.min(1, dt * 2.5);
        spinAngle += spinRate * dt;
        if (spinningFull) spinAngle %= THREE_FOLD;
        seaTime += dt;
      }
      // Clockwise seen from upwind. Everything that spins has three-fold symmetry, so the angle can settle back to zero as the blades fade.
      const shown = -spinAngle * state.bladeFade;
      for (const object of spinning) object.rotation.x = shown;
      shared.uSeaTime.value = seaTime;

      place(state);
      for (const { part, root, offset } of entries) {
        root.position.copy(offset).multiplyScalar(state.explode[part.key]);
        root.visible = !part.revealedBy || state.explode[part.revealedBy] > 0;
      }
      setFade(fading.blade, state.bladeFade);
      setFade(fading.base, state.baseFade);
      shared.uBaseFade.value = state.baseFade;

      for (const { part, group } of callouts.entries) {
        const opacity = state.callouts[part.key];
        group.setAttribute("opacity", opacity.toFixed(3));
        if (opacity <= 0) continue;
        const factor = state.explode[part.key];
        const point = part.anchor.map((value, i) => value + part.explode[i] * factor);
        const [x, y] = toViewBox(point, state.camera);
        group.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }

      renderer.render(scene, camera);
    };

    const animating = () => !reducedMotion.matches && !document.hidden && (stateAt(progress).bladeFade >= 1 || spinRate > 0.002);

    let qualityFrames = 0;
    let qualityTime = 0;
    const watchQuality = (now) => {
      if (!lastFrame) return;
      qualityFrames++;
      qualityTime += now - lastFrame;
      if (qualityFrames < QUALITY_WINDOW) return;
      const next = PIXEL_RATIO_STEPS.find((ratio) => ratio < renderer.getPixelRatio());
      if (qualityTime / qualityFrames > SLOW_FRAME_MS && next) {
        pixelRatioLimit = next;
        resize();
      }
      qualityFrames = 0;
      qualityTime = 0;
    };

    // The rotor is the only thing that moves shadows while the page is still, and at 6.9 rpm every other frame is plenty.
    let shadowTurn = false;
    const tick = (now) => {
      frame = 0;
      const continuing = animating() && lastFrame > 0 && lastProgress === progress;
      if (continuing) watchQuality(now);
      shadowTurn = !shadowTurn;
      sun.shadow.needsUpdate = shadowTurn || !continuing;
      lastProgress = progress;
      draw(now);
      if (animating()) frame = requestAnimationFrame(tick);
      else lastFrame = 0;
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    new ResizeObserver(() => {
      resize();
      request();
    }).observe(figure);
    document.addEventListener("visibilitychange", () => {
      lastFrame = 0;
      request();
    });
    reducedMotion.addEventListener("change", request);
    new MutationObserver(() => {
      applyTheme();
      request();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      if (frame) cancelAnimationFrame(frame);
      frame = -1;
      canvas.remove();
      callouts.svg.remove();
      onLost();
    });

    place(stateAt(0));
    await renderer.compileAsync(scene, camera);
    checkpoint();
    sun.shadow.needsUpdate = true;
    draw(performance.now());
    canvas.classList.add("is-ready");
    request();

    return (next) => {
      progress = next;
      request();
    };
  } catch (error) {
    canvas.remove();
    callouts.svg.remove();
    renderer.dispose();
    throw error;
  }
}
