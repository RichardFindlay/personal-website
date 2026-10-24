/*
 * A perspective camera: an eye, a heading (yaw, from +x toward +y), a tilt
 * (pitch, negative looks down) and a focal length in pixels. Pure, so the build
 * and the page (which inlines this file, exports stripped) project the same way.
 */
export function lookFrom(eye, yaw, pitch, focal, cx, cy) {
  const fwd = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  const right = [Math.sin(yaw), -Math.cos(yaw), 0];
  const up = [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)];
  return { eye, fwd, right, up, focal, cx, cy };
}

/** A world point on the screen; the second argument mirrors the kit's iso(p, P). */
export function persp(p, C) {
  const d = [p[0] - C.eye[0], p[1] - C.eye[1], p[2] - C.eye[2]];
  const z = Math.max(0.5, d[0] * C.fwd[0] + d[1] * C.fwd[1] + d[2] * C.fwd[2]);
  const s = C.focal / z;
  return [C.cx + (d[0] * C.right[0] + d[1] * C.right[1]) * s, C.cy - (d[0] * C.up[0] + d[1] * C.up[1] + d[2] * C.up[2]) * s];
}
