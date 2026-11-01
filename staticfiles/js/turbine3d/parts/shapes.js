import * as THREE from "three";

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function trs(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
}

// Stands a lathe about +x upright, about +z.
export const ALONG_Z = trs([0, 0, 0], [0, -Math.PI / 2, 0]);

export const positioned = (matrices, frame) => matrices.map((matrix) => frame.clone().multiply(matrix));

const Z = new THREE.Vector3(0, 0, 1);

// Turns local +z onto `direction`, for bolts, studs and rods.
export function aim(position, direction, scale = 1) {
  const dir = new THREE.Vector3(...direction).normalize();
  const scales = Array.isArray(scale) ? scale : [scale, scale, scale];
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromUnitVectors(Z, dir), new THREE.Vector3(...scales));
}

export function fromArrays(positions, normals, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions instanceof Float32Array ? positions : new Float32Array(positions), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals instanceof Float32Array ? normals : new Float32Array(normals), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  return geometry;
}

// Only position, normal and index survive: materials read their surface noise from object-space position, so no part needs uvs.
export function merge(geometries) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vOffset = 0;
  let iOffset = 0;
  for (const g of geometries) {
    const count = g.attributes.position.count;
    positions.set(g.attributes.position.array, vOffset * 3);
    normals.set(g.attributes.normal.array, vOffset * 3);
    if (g.index) {
      const source = g.index.array;
      for (let i = 0; i < source.length; i++) indices[iOffset + i] = source[i] + vOffset;
      iOffset += source.length;
    } else {
      for (let i = 0; i < count; i++) indices[iOffset + i] = i + vOffset;
      iOffset += count;
    }
    vOffset += count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

// Collects a part's geometry by material and turns it into one mesh per material plus one InstancedMesh per repeated shape.
export class Kit {
  constructor(mats, matrix) {
    this.mats = mats;
    this.solid = new Map();
    this.repeats = [];
    this.group = new THREE.Group();
    if (matrix) {
      this.group.matrixAutoUpdate = false;
      this.group.matrix.copy(matrix);
    }
  }

  add(key, geometry, matrix) {
    if (matrix) geometry.applyMatrix4(matrix);
    if (!this.solid.has(key)) this.solid.set(key, []);
    this.solid.get(key).push(geometry);
    return this;
  }

  many(key, geometry, matrices) {
    if (matrices.length) this.repeats.push({ key, geometry, matrices });
    return this;
  }

  object(child) {
    this.group.add(child);
    return this;
  }

  finish() {
    for (const [key, geometries] of this.solid) {
      const mesh = new THREE.Mesh(merge(geometries), this.mats[key]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    for (const { key, geometry, matrices } of this.repeats) {
      const mesh = new THREE.InstancedMesh(geometry, this.mats[key], matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = geometry !== BOLT;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    return this.group;
  }
}

// Lathe about +x. Each profile point is [s, r], running +s along an outside surface so the normal points out of the body.
// Sharp profile corners stay sharp; shallow ones shade smoothly.
export function lathe(profile, { seg = 72, from = 0, to = TAU, closed = false, smooth = 0.86 } = {}) {
  const points = closed ? [...profile, profile[0]] : profile;
  const segments = [];
  for (let k = 0; k < points.length - 1; k++) {
    const ds = points[k + 1][0] - points[k][0];
    const dr = points[k + 1][1] - points[k][1];
    const len = Math.hypot(ds, dr);
    segments.push(len < 1e-7 ? null : { k, n: [-dr / len, ds / len] });
  }
  const live = segments.filter(Boolean);
  const positions = [];
  const normals = [];
  const indices = [];
  const angles = Array.from({ length: seg + 1 }, (_, j) => {
    const a = from + ((to - from) * j) / seg;
    return [Math.cos(a), Math.sin(a)];
  });
  const blend = (a, b) => {
    if (!b || a.n[0] * b.n[0] + a.n[1] * b.n[1] < smooth) return a.n;
    const x = a.n[0] + b.n[0];
    const y = a.n[1] + b.n[1];
    const len = Math.hypot(x, y);
    return [x / len, y / len];
  };
  live.forEach((segment, i) => {
    const previous = i > 0 ? live[i - 1] : closed ? live.at(-1) : null;
    const next = i < live.length - 1 ? live[i + 1] : closed ? live[0] : null;
    const n0 = blend(segment, previous);
    const n1 = blend(segment, next);
    const [s0, r0] = points[segment.k];
    const [s1, r1] = points[segment.k + 1];
    const base = positions.length / 3;
    for (const [c, sn] of angles) {
      positions.push(s0, r0 * c, r0 * sn, s1, r1 * c, r1 * sn);
      normals.push(n0[0], n0[1] * c, n0[1] * sn, n1[0], n1[1] * c, n1[1] * sn);
    }
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  return fromArrays(positions, normals, indices);
}

// Fills a closed lathe profile at one angle: the flat face a cutaway leaves behind.
export function section(profile, angle, outward) {
  const contour = profile.map(([s, r]) => new THREE.Vector2(s, r));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const nx = 0;
  const ny = -sn * outward;
  const nz = c * outward;
  const positions = [];
  const normals = [];
  for (const [s, r] of profile) {
    positions.push(s, r * c, r * sn);
    normals.push(nx, ny, nz);
  }
  const indices = [];
  const v = (i) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const normal = new THREE.Vector3(nx, ny, nz);
  for (const [a, b, d] of faces) {
    const cross = v(b).sub(v(a)).cross(v(d).sub(v(a)));
    if (cross.dot(normal) >= 0) indices.push(a, b, d);
    else indices.push(a, d, b);
  }
  return fromArrays(positions, normals, indices);
}

// Replaces each interior corner with two points so the corner catches light like a machined chamfer.
export function chamfer(profile, size, { closed = false } = {}) {
  const out = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    const before = closed ? profile[(i - 1 + n) % n] : profile[i - 1];
    const after = closed ? profile[(i + 1) % n] : profile[i + 1];
    if (!before || !after) {
      out.push(p);
      continue;
    }
    const toward = (q) => {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const t = Math.min(size, len * 0.45) / len;
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    out.push(toward(before), toward(after));
  }
  return out;
}

// Box with a chamfer around every edge. Corner vertices carry the adjoining faces' normals, so the chamfer shades as a small round.
export function box(width, height, depth, c = 0) {
  const X = width / 2;
  const Y = height / 2;
  const D = depth / 2;
  const e = Math.min(c, X * 0.9, Y * 0.9, D * 0.9);
  const positions = [];
  const normals = [];
  const indices = [];
  const corners = new Map();
  const vertex = (sx, sy, sz, face) => {
    const key = `${sx}${sy}${sz}${face}`;
    if (corners.has(key)) return corners.get(key);
    const px = face === 0 ? sx * X : sx * (X - e);
    const py = face === 1 ? sy * Y : sy * (Y - e);
    const pz = face === 2 ? sz * D : sz * (D - e);
    positions.push(px, py, pz);
    normals.push(face === 0 ? sx : 0, face === 1 ? sy : 0, face === 2 ? sz : 0);
    corners.set(key, positions.length / 3 - 1);
    return positions.length / 3 - 1;
  };
  const tri = (a, b, d) => {
    const at = (i) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const pa = at(a);
    const cross = at(b).sub(pa).cross(at(d).sub(pa));
    const centre = pa.add(at(b)).add(at(d));
    if (cross.dot(centre) >= 0) indices.push(a, b, d);
    else indices.push(a, d, b);
  };
  const quad = (a, b, d, f) => {
    tri(a, b, d);
    tri(a, d, f);
  };
  const S = [-1, 1];
  for (const s of S) {
    quad(vertex(s, -1, -1, 0), vertex(s, 1, -1, 0), vertex(s, 1, 1, 0), vertex(s, -1, 1, 0));
    quad(vertex(-1, s, -1, 1), vertex(1, s, -1, 1), vertex(1, s, 1, 1), vertex(-1, s, 1, 1));
    quad(vertex(-1, -1, s, 2), vertex(1, -1, s, 2), vertex(1, 1, s, 2), vertex(-1, 1, s, 2));
  }
  if (e > 0) {
    for (const a of S) {
      for (const b of S) {
        quad(vertex(-1, a, b, 1), vertex(1, a, b, 1), vertex(1, a, b, 2), vertex(-1, a, b, 2));
        quad(vertex(a, -1, b, 0), vertex(a, 1, b, 0), vertex(a, 1, b, 2), vertex(a, -1, b, 2));
        quad(vertex(a, b, -1, 0), vertex(a, b, 1, 0), vertex(a, b, 1, 1), vertex(a, b, -1, 1));
        for (const d of S) tri(vertex(a, b, d, 0), vertex(a, b, d, 1), vertex(a, b, d, 2));
      }
    }
  }
  return fromArrays(positions, normals, indices);
}

export const boxAt = (center, size, c = 0, rotation = [0, 0, 0]) => box(size[0], size[1], size[2], c).applyMatrix4(trs(center, rotation));

// Round bar between two points with capped ends; `radius` may be [start, end].
export function rod(a, b, radius, seg = 10) {
  const [r0, r1] = Array.isArray(radius) ? radius : [radius, radius];
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const length = start.distanceTo(end);
  const geometry = new THREE.CylinderGeometry(r1, r0, length, seg, 1, false);
  geometry.deleteAttribute("uv");
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return geometry.applyMatrix4(new THREE.Matrix4().compose(mid, quaternion, new THREE.Vector3(1, 1, 1)));
}

export function sphere(center, radius, w = 12, h = 8, thetaLength = Math.PI) {
  const geometry = new THREE.SphereGeometry(radius, w, h, 0, TAU, 0, thetaLength);
  geometry.deleteAttribute("uv");
  return geometry.applyMatrix4(trs(center));
}

// Sweeps a small circle along a polyline: pipework, rails, seams.
export function pipe(path, radius, { seg = 6, closed = false } = {}) {
  const points = path.map((p) => new THREE.Vector3(...p));
  const count = points.length;
  const positions = [];
  const normals = [];
  const indices = [];
  let reference = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < count; i++) {
    const before = closed ? points[(i - 1 + count) % count] : points[Math.max(0, i - 1)];
    const after = closed ? points[(i + 1) % count] : points[Math.min(count - 1, i + 1)];
    const tangent = after.clone().sub(before).normalize();
    if (Math.abs(reference.dot(tangent)) > 0.95) reference = new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(tangent, reference).normalize();
    const v = new THREE.Vector3().crossVectors(u, tangent).normalize();
    reference = v.clone();
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU;
      const nx = u.x * Math.cos(a) + v.x * Math.sin(a);
      const ny = u.y * Math.cos(a) + v.y * Math.sin(a);
      const nz = u.z * Math.cos(a) + v.z * Math.sin(a);
      positions.push(points[i].x + nx * radius, points[i].y + ny * radius, points[i].z + nz * radius);
      normals.push(nx, ny, nz);
    }
  }
  const rows = closed ? count : count - 1;
  for (let i = 0; i < rows; i++) {
    const r0 = i * (seg + 1);
    const r1 = ((i + 1) % count) * (seg + 1);
    for (let j = 0; j < seg; j++) indices.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
  }
  return fromArrays(positions, normals, indices);
}

export const arc = (radius, z, a0, a1, steps = 48) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [radius * Math.cos(a), radius * Math.sin(a), z];
  });

// Extrudes a 2D outline given as [y, z] pairs along +x from s0 to s1, in the plane a shaft-frame part is drawn in.
export function prism(outline, s0, s1, { holes = [], bevel = 0, curve = 16 } = {}) {
  const shape = new THREE.Shape(outline.map(([y, z]) => new THREE.Vector2(y, z)));
  for (const hole of holes) {
    const path = new THREE.Path();
    if (Array.isArray(hole)) path.setFromPoints(hole.map(([y, z]) => new THREE.Vector2(y, z)));
    else path.absarc(hole.y, hole.z, hole.r, 0, TAU, true);
    shape.holes.push(path);
  }
  const depth = s1 - s0 - 2 * bevel;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: bevel > 0 ? 2 : 0, curveSegments: curve, steps: 1 });
  geometry.deleteAttribute("uv");
  // Shape x,y,z become part y,z,x: a rotation, so the winding and normals stay valid.
  const basis = new THREE.Matrix4().set(0, 0, 1, s0 + bevel, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  return geometry.applyMatrix4(basis);
}

// A spur or helical gear about +x, centred on s = 0. Outline angles are per-tooth fractions tracing a two-segment flank.
export function gear({ teeth, module, width, helix = 0, bore = 0, internal = false, rim = 0, from = 0, to = TAU, phase = 0, slices }) {
  const pitch = (module * teeth) / 2;
  const addendum = pitch + (internal ? -module : module);
  const dedendum = pitch + (internal ? 1.25 * module : -1.25 * module);
  const step = TAU / teeth;
  const flank = [
    [dedendum, -0.36],
    [pitch, -0.25],
    [addendum, -0.13],
    [addendum, 0.13],
    [pitch, 0.25],
    [dedendum, 0.36],
  ];
  const outline = [];
  for (let t = 0; t < teeth; t++) {
    const centre = phase + t * step;
    const norm = ((centre - from) % TAU + TAU) % TAU;
    if (to - from < TAU && norm > to - from) continue;
    for (const [r, fraction] of flank) outline.push([r, centre + fraction * step]);
  }
  const full = to - from >= TAU;
  if (full) outline.push(outline[0].slice(0, 1).concat(outline[0][1] + TAU));

  const twist = helix ? (width * Math.tan(helix)) / pitch : 0;
  const stations = slices ?? (helix ? 3 : 1);
  const positions = [];
  const normals = [];
  const indices = [];
  const emit = (a, b, d, f, n) => {
    const base = positions.length / 3;
    positions.push(...a, ...b, ...d, ...f);
    for (let i = 0; i < 4; i++) normals.push(n[0], n[1], n[2]);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const at = (r, angle, s) => {
    const shift = twist ? (s / width) * twist : 0;
    return [s, r * Math.cos(angle + shift), r * Math.sin(angle + shift)];
  };
  const faceNormal = (a, b, d) => new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...d).sub(new THREE.Vector3(...a))).normalize().toArray();
  for (let i = 0; i < outline.length - 1; i++) {
    const [r0, a0] = outline[i];
    const [r1, a1] = outline[i + 1];
    for (let k = 0; k < stations; k++) {
      const s0 = -width / 2 + (width * k) / stations;
      const s1 = -width / 2 + (width * (k + 1)) / stations;
      const p00 = at(r0, a0, s0);
      const p10 = at(r1, a1, s0);
      const p01 = at(r0, a0, s1);
      const p11 = at(r1, a1, s1);
      // Outline runs anticlockwise about +x, so this quad order faces out of the tooth for an external gear and into the bore for an internal one.
      const quad = internal ? [p00, p01, p11, p10] : [p00, p10, p11, p01];
      emit(...quad, faceNormal(quad[0], quad[1], quad[2]));
    }
  }
  const inner = internal ? rim : bore;
  for (let i = 0; i < outline.length - 1; i++) {
    const [r0, a0] = outline[i];
    const [r1, a1] = outline[i + 1];
    for (const [s, side] of [[-width / 2, -1], [width / 2, 1]]) {
      const a = at(r0, a0, s);
      const b = at(r1, a1, s);
      const c = at(inner, a1, s);
      const d = at(inner, a0, s);
      const facesPlus = internal ? [d, c, b, a] : [a, b, c, d];
      const flip = side > 0 ? facesPlus : [...facesPlus].reverse();
      emit(...flip, [side, 0, 0]);
    }
  }
  return fromArrays(positions, normals, indices);
}

// Flat-topped hex bolt head on a washer, unit size, sitting on z = 0 and pointing +z.
export const BOLT = (() => {
  const head = new THREE.CylinderGeometry(0.72, 0.8, 0.62, 6, 1);
  head.deleteAttribute("uv");
  head.applyMatrix4(trs([0, 0, 0.44], [Math.PI / 2, 0, 0]));
  const washer = new THREE.CylinderGeometry(1, 1, 0.14, 8, 1);
  washer.deleteAttribute("uv");
  washer.applyMatrix4(trs([0, 0, 0.07], [Math.PI / 2, 0, 0]));
  return merge([head.toNonIndexed(), washer]);
})();

// Bolt circle about +x at station s, heads pointing along +x (dir 1) or -x (dir -1).
export function boltCircle(count, radius, s, dir, size, { from = 0, to = TAU, phase = 0, closed = true } = {}) {
  const matrices = [];
  const span = to - from;
  for (let i = 0; i < count; i++) {
    const a = from + phase + (span * i) / (closed ? count : count - 1);
    matrices.push(aim([s, radius * Math.cos(a), radius * Math.sin(a)], [dir, 0, 0], size));
  }
  return matrices;
}

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lofts equal-length rings of [x, y, z] points into a smooth skin. Normal direction is set by ring order: pass `flip` to reverse it.
export function loftRings(rings, { closedRing = false, flip = false } = {}) {
  const rows = rings.length;
  const columns = rings[0].length;
  const positions = new Float32Array(rows * columns * 3);
  rings.forEach((ring, i) => ring.forEach((p, j) => positions.set(p, (i * columns + j) * 3)));
  const indices = [];
  const lastColumn = closedRing ? columns : columns - 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < lastColumn; j++) {
      const a = i * columns + j;
      const b = i * columns + ((j + 1) % columns);
      const c = a + columns;
      const d = b + columns;
      if (flip) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  return geometry;
}

export const inShaftFrame = (spec) => {
  const tilt = spec.published.shaftTilt * DEG;
  return trs([0, 0, spec.published.towerTopToShaft], [0, -tilt, 0]);
};
