import * as THREE from "three";
import { WAVES } from "./parts/waves.js";

const NOISE_SIZE = 256;

function tileableNoise(size, seed) {
  const lattice = (period) => {
    const values = new Float32Array(period * period);
    let state = seed;
    for (let i = 0; i < values.length; i++) {
      state = Math.imul(state ^ (state >>> 15), 2246822519) + 3266489917;
      values[i] = ((state >>> 16) & 0xffff) / 65535;
    }
    return values;
  };
  const octaves = [[8, 0.5], [32, 0.3], [96, 0.2]].map(([period, weight]) => ({ period, weight, values: lattice(period) }));
  const out = new Float32Array(size * size);
  for (const { period, weight, values } of octaves) {
    const scale = period / size;
    for (let y = 0; y < size; y++) {
      const fy = y * scale;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      const y1 = (y0 + 1) % period;
      for (let x = 0; x < size; x++) {
        const fx = x * scale;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % period;
        const a = values[y0 * period + x0] + (values[y0 * period + x1] - values[y0 * period + x0]) * tx;
        const b = values[y1 * period + x0] + (values[y1 * period + x1] - values[y1 * period + x0]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * weight;
      }
    }
  }
  return out;
}

function noiseTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = NOISE_SIZE;
  const context = canvas.getContext("2d");
  const image = context.createImageData(NOISE_SIZE, NOISE_SIZE);
  const channels = [tileableNoise(NOISE_SIZE, 11), tileableNoise(NOISE_SIZE, 257), tileableNoise(NOISE_SIZE, 4093)];
  for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
    image.data[i * 4] = channels[0][i] * 255;
    image.data[i * 4 + 1] = channels[1][i] * 255;
    image.data[i * 4 + 2] = channels[2][i] * 255;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

// Surface variation sampled triplanar from object-space position, so no geometry needs uvs.
// scale: metres per noise tile. rough/bump/tint: how far the noise moves roughness, the normal and the base colour.
function patchSurface(material, surface, noise) {
  if (!surface) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceNoise = { value: noise };
    shader.uniforms.uSurface = { value: new THREE.Vector4(1 / surface.scale, surface.rough, surface.bump, surface.tint) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSurfacePosition;\nvarying vec3 vSurfaceNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurfacePosition = position;\nvSurfaceNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D uSurfaceNoise;
uniform vec4 uSurface;
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;
vec3 surfaceNoise;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec3 blend = pow(abs(normalize(vSurfaceNormal)), vec3(4.0));
blend /= blend.x + blend.y + blend.z + 1e-5;
vec3 tiled = vSurfacePosition * uSurface.x;
surfaceNoise = texture2D(uSurfaceNoise, tiled.yz).rgb * blend.x + texture2D(uSurfaceNoise, tiled.xz).rgb * blend.y + texture2D(uSurfaceNoise, tiled.xy).rgb * blend.z;
diffuseColor.rgb *= 1.0 + (surfaceNoise.r - 0.5) * uSurface.w;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (surfaceNoise.g - 0.5) * uSurface.y, 0.04, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
normal = normalize(normal + (surfaceNoise.bgr - 0.5) * uSurface.z);`,
      );
  };
  material.customProgramCacheKey = () => "surface";
  return material;
}

const PAINT = { scale: 3.2, rough: 0.08, bump: 0.018, tint: 0.025 };
const STEEL = { scale: 1.1, rough: 0.12, bump: 0.02, tint: 0.05 };

// Base finishes. `surface` feeds patchSurface; colours are sRGB. What lies under the water is seen through two layers of it, so it gets the cheap lambert model.
const FINISHES = {
  // RAL 7035 light grey, gloss polyurethane topcoat.
  paint: { physical: { color: "#cdd2cf", roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22 }, surface: PAINT },
  // The nose cone is an open shell, so its inside can be seen through the blade holes.
  grp: { physical: { color: "#cdd2cf", roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22, side: THREE.DoubleSide }, surface: PAINT },
  // RAL 1023-ish traffic yellow on the sleeve.
  yellow: { physical: { color: "#f2b90a", roughness: 0.36, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 }, surface: { ...PAINT, tint: 0.05, rough: 0.14 } },
  hullDark: { standard: { color: "#2c2a26", roughness: 0.62, metalness: 0.1 }, surface: { scale: 2.4, rough: 0.22, bump: 0.05, tint: 0.5 } },
  pile: { standard: { color: "#3b3f3f", roughness: 0.7, metalness: 0.15 }, surface: { scale: 3, rough: 0.2, bump: 0.05, tint: 0.45 } },
  anode: { standard: { color: "#8c9498", roughness: 0.85, metalness: 0.4 }, surface: STEEL },
  towerInner: { standard: { color: "#5e6462", roughness: 0.8 } },
  doorPaint: { physical: { color: "#b9bfbc", roughness: 0.42, clearcoat: 0.3 }, surface: PAINT },
  doorGlass: { physical: { color: "#2a3640", roughness: 0.08, metalness: 0.2, clearcoat: 1 } },
  steel: { standard: { color: "#b6babd", roughness: 0.26, metalness: 1 }, surface: STEEL },
  gearSteel: { standard: { color: "#9fa3a6", roughness: 0.3, metalness: 1 }, surface: STEEL },
  carrier: { standard: { color: "#6f7478", roughness: 0.44, metalness: 0.9 }, surface: { scale: 0.8, rough: 0.18, bump: 0.05, tint: 0.14 } },
  brakeDisc: { standard: { color: "#a3a6a8", roughness: 0.2, metalness: 1 }, surface: { scale: 0.4, rough: 0.16, bump: 0.018, tint: 0.09 } },
  bolt: { standard: { color: "#8e9498", roughness: 0.38, metalness: 0.95 } },
  // Ductile iron under a thin grey primer: visibly coarse.
  castIron: { standard: { color: "#8d9296", roughness: 0.56, metalness: 0.4 }, surface: { scale: 0.75, rough: 0.2, bump: 0.15, tint: 0.2 } },
  castPaint: { standard: { color: "#6f777e", roughness: 0.5, metalness: 0.25 }, surface: { scale: 0.85, rough: 0.16, bump: 0.13, tint: 0.14 } },
  framePaint: { standard: { color: "#6c747b", roughness: 0.46, metalness: 0.2 }, surface: { scale: 2, rough: 0.12, bump: 0.03, tint: 0.08 } },
  housing: { standard: { color: "#7c8e94", roughness: 0.42, metalness: 0.28 }, surface: { scale: 1.1, rough: 0.12, bump: 0.07, tint: 0.09 } },
  // RAL 5014-ish blue, the common generator colour.
  genPaint: { physical: { color: "#3d6283", roughness: 0.36, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.3 }, surface: { scale: 1.5, rough: 0.1, bump: 0.035, tint: 0.07 } },
  yawPaint: { physical: { color: "#3d6283", roughness: 0.38, metalness: 0.1, clearcoat: 0.3 }, surface: PAINT },
  bearingPaint: { standard: { color: "#62676b", roughness: 0.42, metalness: 0.7 }, surface: STEEL },
  castInterior: { standard: { color: "#4b4f52", roughness: 0.72, metalness: 0.2, side: THREE.DoubleSide }, surface: { scale: 0.75, rough: 0.14, bump: 0.14, tint: 0.2 } },
  electricalSteel: { standard: { color: "#6b6f72", roughness: 0.34, metalness: 0.95 }, surface: { scale: 0.3, rough: 0.1, bump: 0.05, tint: 0.07 } },
  copper: { standard: { color: "#c07a42", roughness: 0.34, metalness: 1 } },
  brass: { standard: { color: "#b2935a", roughness: 0.32, metalness: 1 } },
  aluminium: { standard: { color: "#c2c6c9", roughness: 0.38, metalness: 0.95 } },
  galvanised: { standard: { color: "#a7acae", roughness: 0.5, metalness: 0.95 }, surface: { scale: 0.6, rough: 0.22, bump: 0.03, tint: 0.14 } },
  grating: { standard: { color: "#a4a9ab", roughness: 0.62, metalness: 0.7 }, surface: { scale: 0.22, rough: 0.26, bump: 0.2, tint: 0.3 } },
  rubber: { standard: { color: "#1b1c1e", roughness: 0.88, metalness: 0 } },
  composite: { standard: { color: "#2a2c2f", roughness: 0.42, metalness: 0.2 }, surface: { scale: 0.22, rough: 0.1, bump: 0.05, tint: 0.3 } },
  darkMetal: { standard: { color: "#2f3236", roughness: 0.5, metalness: 0.7 } },
  dark: { standard: { color: "#17181a", roughness: 0.82 } },
  seam: { standard: { color: "#5e6365", roughness: 0.7, metalness: 0.1 } },
  // Cut faces get the flat red engineers use on sectioned drawings, so the cutaway reads at a glance.
  cutFace: { standard: { color: "#b5412a", roughness: 0.6, metalness: 0.05 } },
  cabinet: { physical: { color: "#d7dad6", roughness: 0.44, metalness: 0.05, clearcoat: 0.2 }, surface: PAINT },
  cabinetDoor: { physical: { color: "#c8ccc8", roughness: 0.46, metalness: 0.05, clearcoat: 0.2 }, surface: PAINT },
  warning: { standard: { color: "#f2c200", roughness: 0.5 } },
  label: { standard: { color: "#efefe9", roughness: 0.55 } },
  edgeTape: { physical: { color: "#9ca2a2", roughness: 0.3, clearcoat: 0.6 } },
  caliper: { physical: { color: "#b23020", roughness: 0.4, metalness: 0.2, clearcoat: 0.4 } },
  rock: { lambert: { color: "#d4d0c6" } },
  sand: { lambert: { color: "#ffffff", vertexColors: true } },
  sediment: { lambert: { color: "#ffffff", vertexColors: true } },
  beacon: { standard: { color: "#5e120c", emissive: "#ff2a18", emissiveIntensity: 1, roughness: 0.25 } },
};

const SEA_GLSL = `
uniform float uSeaTime;
uniform vec4 uWaves[${WAVES.length}];
vec3 seaField(vec2 p) {
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${WAVES.length}; i++) {
    float phase = dot(uWaves[i].xy, p) - uWaves[i].z * uSeaTime + float(i) * 1.7;
    h += uWaves[i].w * sin(phase);
    g += uWaves[i].w * cos(phase) * uWaves[i].xy;
  }
  return vec3(h, g);
}`;

function createWater(noise, shared) {
  const surface = new THREE.MeshStandardMaterial({ color: "#1f5f7d", roughness: 0.14, metalness: 0, transparent: true, opacity: 0.74, depthWrite: false });
  surface.userData.selfFading = true;
  surface.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, { uSeaNoise: { value: noise } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${SEA_GLSL}\nvarying vec2 vSeaPosition;\nvarying vec3 vSeaField;`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeaField = seaField(position.xy);\ntransformed.z += vSeaField.x;\nvSeaPosition = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uSeaTime;
uniform sampler2D uSeaNoise;
uniform float uPileRadius;
uniform float uBaseFade;
uniform vec3 uFoamColor;
varying vec2 vSeaPosition;
varying vec3 vSeaField;
vec3 seaNow;
float foam;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
seaNow = vSeaField;
vec2 rippleA = texture2D(uSeaNoise, vSeaPosition * 0.11 + vec2(0.022, 0.013) * uSeaTime).gb - 0.5;
vec2 rippleB = texture2D(uSeaNoise, vSeaPosition * 0.37 - vec2(0.041, 0.031) * uSeaTime).gb - 0.5;
float pileDistance = length(vSeaPosition) - uPileRadius;
float breakup = texture2D(uSeaNoise, vSeaPosition * 0.031 + vec2(0.004, -0.005) * uSeaTime).r;
vec2 skew = mat2(0.83, 0.56, -0.56, 0.83) * vSeaPosition;
float wisps = texture2D(uSeaNoise, skew * vec2(0.083, 0.047) - vec2(0.007, 0.005) * uSeaTime).g;
float crest = smoothstep(0.5, 0.8, seaNow.x / 4.2 + (breakup - 0.5) * 1.1) * smoothstep(0.48, 0.62, wisps);
float ring = smoothstep(2.4, 0.2, pileDistance + (wisps - 0.5) * 5.0);
foam = clamp(crest * 0.72 + ring * 0.85, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, foam);
diffuseColor.a = mix(diffuseColor.a, 0.96, foam) * uBaseFade;`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, foam);")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
vec3 seaNormal = normalize(vec3(-seaNow.yz - (rippleA + rippleB * 0.8) * 0.26, 1.0));
normal = normalize(mat3(viewMatrix) * seaNormal);`,
      );
  };

  const wall = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  wall.userData.selfFading = true;
  wall.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, { uSeaNoise: { value: noise } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${SEA_GLSL}\nattribute float aTop;\nvarying float vDepth;\nvarying vec2 vWallPosition;`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.z += seaField(position.xy).x * aTop;\nvDepth = 1.0 - aTop;\nvWallPosition = vec2(position.x + position.y, position.z);");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D uSeaNoise;
uniform float uSeaTime;
uniform float uBaseFade;
uniform vec3 uWallTop;
uniform vec3 uWallDeep;
uniform vec3 uFoamColor;
varying float vDepth;
varying vec2 vWallPosition;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
float shimmer = texture2D(uSeaNoise, vWallPosition * vec2(0.035, 0.05) + vec2(0.01, 0.006) * uSeaTime).r - 0.5;
float depth = clamp(vDepth + shimmer * 0.12, 0.0, 1.0);
diffuseColor.rgb = mix(uWallTop, uWallDeep, pow(depth, 0.72));
diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, smoothstep(0.03, 0.0, vDepth) * 0.72);
diffuseColor.a = mix(0.46, 0.76, depth) * uBaseFade;`,
      );
  };
  return { water: surface, waterWall: wall };
}

// Theme looks: everything the lighting and sea need to switch between day and dusk.
export const LOOKS = {
  light: {
    exposure: 1.02,
    sun: { color: "#fff1dd", intensity: 2.7, direction: [0.28, -0.8, 0.82] },
    environment: { intensity: 0.62, zenith: "#8fb2d0", horizon: "#e0e7ea", ground: "#6a777d", key: "#ffffff", keyStrength: 5 },
    water: { color: "#1c5f7c", opacity: 0.72, foam: "#f2f7f7", wallTop: "#5d9dba", wallDeep: "#123f58" },
    beacon: { emissive: 1.1, glow: 0.3 },
  },
  dark: {
    exposure: 1.18,
    sun: { color: "#ffc9a0", intensity: 1.5, direction: [0.05, -0.95, 0.42] },
    environment: { intensity: 0.85, zenith: "#2f4a78", horizon: "#a27c78", ground: "#141d2a", key: "#b6c9ee", keyStrength: 3 },
    water: { color: "#163e58", opacity: 0.82, foam: "#b5c4d2", wallTop: "#235a7a", wallDeep: "#07202f" },
    beacon: { emissive: 7, glow: 1 },
  },
};

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,210,190,1)");
  gradient.addColorStop(0.12, "rgba(255,90,60,0.85)");
  gradient.addColorStop(0.4, "rgba(255,50,30,0.22)");
  gradient.addColorStop(1, "rgba(255,40,20,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createMaterials({ pileRadius }) {
  const noise = noiseTexture();
  const shared = {
    uSeaTime: { value: 0 },
    uWaves: { value: WAVES.map((wave) => new THREE.Vector4(wave.kx, wave.ky, wave.omega, wave.amplitude)) },
    uPileRadius: { value: pileRadius },
    uBaseFade: { value: 1 },
    uFoamColor: { value: new THREE.Color() },
    uWallTop: { value: new THREE.Color() },
    uWallDeep: { value: new THREE.Color() },
  };

  const mats = {};
  for (const [key, { physical, standard, lambert, surface }] of Object.entries(FINISHES)) {
    const material = physical ? new THREE.MeshPhysicalMaterial(physical) : lambert ? new THREE.MeshLambertMaterial(lambert) : new THREE.MeshStandardMaterial(standard);
    material.userData.surface = surface;
    mats[key] = patchSurface(material, surface, noise);
  }
  Object.assign(mats, createWater(noise, shared));
  mats.beaconGlow = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });

  // A copy for fading parts: three.js does not carry onBeforeCompile across clone().
  const fadeCopy = (material) => {
    const copy = material.clone();
    copy.transparent = true;
    return patchSurface(copy, material.userData.surface, noise);
  };

  const applyLook = (look) => {
    mats.water.color.set(look.water.color);
    mats.water.opacity = look.water.opacity;
    shared.uFoamColor.value.set(look.water.foam);
    shared.uWallTop.value.set(look.water.wallTop);
    shared.uWallDeep.value.set(look.water.wallDeep);
    mats.beacon.emissiveIntensity = look.beacon.emissive;
    mats.beaconGlow.opacity = look.beacon.glow;
  };

  return { mats, shared, fadeCopy, applyLook };
}
