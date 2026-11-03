import * as THREE from "three";
import { CAMERA_SCALE, INTRO, VIEWBOX, displacement, heroCamera, introAmount, stateAt, viewAxis, waveSlopeFor } from "./choreography.js";
import { PARTS, SPEC } from "./parts/index.js";
import { seaPoint } from "./assumed.js";
import { LOOKS, createMaterials } from "./materials.js";

const NARROW_WIDTH = 900;
const SHADOW_SIZE = 2048;
// A frame slower than this, averaged over QUALITY_WINDOW spinning frames, drops the canvas to the next pixel ratio down. It never climbs back up.
const SLOW_FRAME_MS = 24;
const QUALITY_WINDOW = 45;
const PIXEL_RATIO_STEPS = [1.5, 1.25];
const CAMERA_DISTANCE = 1400;
// How long to wait for the browser to hand back a lost GPU context before falling back to the static drawing.
const RESTORE_WAIT_MS = 10000;
const SPIN_RATE = (SPEC.assumed.spinRpm / 60) * Math.PI * 2;
const THREE_FOLD = (Math.PI * 2) / 3;

const nextTask = () => new Promise((resolve) => setTimeout(resolve));

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
  return { materials: [...faded], twins, meshes };
}

export async function mountTurbine3D(figure, { signal, onLost }) {
  const checkpoint = () => {
    if (signal.aborted) throw new Error("turbine build timed out");
  };
  const narrow = () => window.innerWidth < NARROW_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.className = "tb3d-canvas";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });

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
    sun.shadow.camera.far = 2000;
    scene.add(sun, sun.target);

    const { mats, shared, fadeCopy, applyLook } = createMaterials({ pileRadius: SPEC.published.monopileDiameter / 2, piles: [[0, 0], ...SPEC.assumed.farm.map(seaPoint)], seaFront: SPEC.assumed.seaTile.front });

    const entries = [];
    const spinning = [];
    const rotors = [];
    let seaSurface;
    const fading = { base: { roots: [], materials: [], twins: [], meshes: [] }, sea: { roots: [], materials: [], twins: [], meshes: [] }, farm: { roots: [], materials: [], twins: [], meshes: [] } };
    for (const part of PARTS) {
      await nextTask();
      checkpoint();
      const root = new THREE.Group();
      root.add(part.build(SPEC, mats));
      root.traverse((object) => {
        if (object.userData.spins) spinning.push(object);
        if (object.userData.rotors) rotors.push(object);
        if (object.userData.seaSurface) seaSurface = object;
      });
      if (part.fade) {
        const { materials, twins, meshes } = fadeInPlace(root, fadeCopy);
        fading[part.fade].roots.push(root);
        fading[part.fade].materials.push(...materials);
        fading[part.fade].twins.push(...twins);
        fading[part.fade].meshes.push(...meshes);
      }
      scene.add(root);
      entries.push({ part, root });
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
      seaFaded = look.water.faded;
      scene.environment = environmentFor(name);
      scene.environmentIntensity = look.environment.intensity;
      renderer.toneMappingExposure = look.exposure;
      sun.color.set(look.sun.color);
      sun.intensity = look.sun.intensity;
      sunDirection.set(...look.sun.direction).normalize();
      applyLook(look);
    };
    const sunDirection = new THREE.Vector3();
    let seaFaded = 1;
    applyTheme();

    figure.append(canvas);

    // The canvas fills the stage, up behind the nav, because the sea does. The figure keeps the 800x1000 box the camera is framed in.
    let pixelRatioLimit = Infinity;
    const view = { width: 1, height: 1, meet: 1, figureTop: 0, figureHeight: 1 };
    let heroFrame = null;
    let assembled;
    const fitHero = () => {
      if (heroFrame) assembled = heroCamera({ figureHeight: view.figureHeight, meet: view.meet, top: heroFrame.top - view.figureTop, edge: heroFrame.edge - view.figureTop, width: heroFrame.width });
    };
    const resize = () => {
      const height = Math.max(1, figure.clientHeight);
      const full = Math.max(1, figure.clientWidth);
      view.meet = Math.min(full / VIEWBOX.width, height / VIEWBOX.height);
      view.figureTop = figure.offsetTop;
      view.figureHeight = height;
      view.width = full;
      view.height = height + view.figureTop;
      canvas.style.top = `${-view.figureTop}px`;
      canvas.style.height = `${view.height}px`;
      fitHero();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow() ? 1.5 : 2, pixelRatioLimit));
      renderer.setSize(view.width, view.height, false);
    };
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let progress = 0;
    let heroShift = 0;
    let heroRest = 1;
    // The opening camera move runs on frame time, so it waits out a hidden tab, and is skipped for reduced motion or a page reopened part way down.
    let introTime = reducedMotion.matches ? Infinity : 0;
    let rendered = false;
    let spinAngle = 0;
    let spinRate = reducedMotion.matches ? 0 : SPIN_RATE;
    let seaTime = 0;
    let lastFrame = 0;
    let frame = 0;
    let lastProgress = 0;

    const target = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const rotorMatrix = new THREE.Matrix4();
    const rotorTurn = new THREE.Matrix4();
    const place = (state) => {
      const intro = introAmount(introTime) * heroRest;
      const perMetre = view.meet * state.camera.zoom * (1 + (INTRO.zoom - 1) * intro) * CAMERA_SCALE;
      const centreX = view.width / 2 + heroShift;
      const centreY = view.figureTop + view.figureHeight / 2;
      axis.set(...viewAxis(intro, reducedMotion.matches ? [0, 0] : state.orbit));
      shared.uWaveSlope.value = waveSlopeFor(axis.z);
      target.set(...state.camera.target);
      target.x += INTRO.pan[0] * intro;
      target.y += INTRO.pan[1] * intro;
      camera.position.copy(target).addScaledVector(axis, CAMERA_DISTANCE);
      camera.left = -centreX / perMetre;
      camera.right = (view.width - centreX) / perMetre;
      camera.top = centreY / perMetre;
      camera.bottom = -(view.height - centreY) / perMetre;
      camera.lookAt(target);
      camera.updateProjectionMatrix();

      const reach = Math.max(-camera.left, camera.right, camera.top, -camera.bottom) * 1.08;
      const shadow = sun.shadow.camera;
      shadow.left = -reach;
      shadow.right = reach;
      shadow.top = reach;
      shadow.bottom = -reach;
      shadow.updateProjectionMatrix();
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDirection, 1000);
      sun.shadow.normalBias = (reach * 2 * 1.6) / sun.shadow.mapSize.x;
    };

    const setFade = (group, amount) => {
      for (const root of group.roots) root.visible = amount > 0.002;
      for (const material of group.materials) material.opacity = amount;
      // Fully opaque, the depth test alone sorts it and the twin is wasted work.
      for (const twin of group.twins) twin.visible = amount < 1;
    };

    const draw = (now) => {
      const state = stateAt(progress, assembled);
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      introTime += dt;

      const spinningFull = state.spin >= 1;
      if (!reducedMotion.matches) {
        spinRate += ((spinningFull ? SPIN_RATE : 0) - spinRate) * Math.min(1, dt * 2.5);
        spinAngle += spinRate * dt;
        if (spinningFull) spinAngle %= THREE_FOLD;
        seaTime += dt;
      }
      // Clockwise seen from upwind. Everything that spins has three-fold symmetry, so the angle settles back to zero before the blades are drawn off along their parked axes.
      const shown = -spinAngle * state.spin;
      for (const object of spinning) object.rotation.x = shown;
      if (state.farmFade > 0) {
        for (const mesh of rotors) {
          mesh.userData.rotors.forEach(({ frame: place, phase }, i) => mesh.setMatrixAt(i, rotorMatrix.copy(place).multiply(rotorTurn.makeRotationX(shown + phase))));
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      shared.uSeaTime.value = seaTime;

      place(state);
      for (const { part, root } of entries) {
        root.position.set(...displacement(part, state.explode));
        root.visible = !part.revealedBy || state.explode[part.revealedBy] > 0;
      }
      // Once a tower ghosts it draws after the water, or its depth would punch a see-through hole in the sea.
      for (const [group, amount] of [[fading.base, state.baseFade], [fading.farm, state.farmFade]]) {
        setFade(group, amount);
        for (const mesh of group.meshes) mesh.renderOrder = amount < 1 ? 7 : 1;
        for (const twin of group.twins) twin.renderOrder = amount < 1 ? 6 : 0;
      }
      const seaFade = 1 - state.seaFocus * (1 - seaFaded);
      // The seabed goes faster than the water, so the faded backdrop stays blue instead of sandy.
      setFade(fading.sea, seaFade * seaFade);
      shared.uSeaFade.value = seaFade;
      // Exploded parts would throw huge ghost shadows across the faded backdrop as the camera tours them.
      seaSurface.receiveShadow = state.seaFocus < 0.9;
      shared.uFarmFade.value = state.farmFade;


      renderer.render(scene, camera);
    };

    const animating = () => !reducedMotion.matches && !document.hidden && (stateAt(progress).spin >= 1 || spinRate > 0.002);

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
    // Browsers take the context away on a GPU reset or from a tab they are starving, and usually give it back.
    let lostTimer = 0;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      if (frame > 0) cancelAnimationFrame(frame);
      frame = -1;
      lostTimer = setTimeout(() => {
        canvas.remove();
        onLost();
      }, RESTORE_WAIT_MS);
    });
    // three.js re-uploads geometry and textures by itself; the environment maps were rendered on the GPU, so they are rendered again.
    canvas.addEventListener("webglcontextrestored", () => {
      clearTimeout(lostTimer);
      for (const name of Object.keys(environments)) delete environments[name];
      applyTheme();
      sun.shadow.needsUpdate = true;
      frame = 0;
      lastFrame = 0;
      request();
    });

    place(stateAt(0));
    await renderer.compileAsync(scene, camera);
    checkpoint();
    sun.shadow.needsUpdate = true;
    draw(performance.now());
    canvas.classList.add("is-ready");
    request();

    // `rest` is 1 at the top of the page and `frame` the hero's px on screen: the rotor's top, where the water ends and the width of a wide screen, plus `aside`, how far to slide the turbine off centre beside the panel being read.
    return (next, rest = 0, frame = null) => {
      if (!rendered && next > 0) introTime = Infinity;
      rendered = true;
      progress = next;
      if (frame) {
        heroFrame = frame;
        fitHero();
        heroShift = (assembled?.shiftX ?? 0) * rest + frame.aside;
        heroRest = rest;
      }
      request();
    };
  } catch (error) {
    canvas.remove();
    renderer.dispose();
    throw error;
  }
}
