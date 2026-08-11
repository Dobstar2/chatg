export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / Math.max(1e-9, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const distance = (a, b) => length(sub(a, b));
export const normalize = (a) => {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 0, -1);
};

export const qAxisAngle = (axis, angle) => {
  const n = normalize(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return qNormalize({ x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) });
};
export const qFromYawPitch = (yaw, pitch) => qNormalize(qMultiply(
  qAxisAngle(v3(0, 1, 0), yaw),
  qAxisAngle(v3(1, 0, 0), pitch),
));

export const qConjugate = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const qNormalize = (q) => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};
export const qMultiply = (a, b) => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
export const qRotateVec = (qRaw, p) => {
  const q = qNormalize(qRaw);
  const u = v3(q.x, q.y, q.z);
  const uv = cross(u, p);
  const uuv = cross(u, uv);
  return add(p, add(scale(uv, 2 * q.w), scale(uuv, 2)));
};

export const cameraFromWorld = (world, headOrientation, eyeOffset = 0) => {
  const eyeWorld = qRotateVec(headOrientation, v3(eyeOffset, 0, 0));
  return qRotateVec(qConjugate(headOrientation), sub(world, eyeWorld));
};

export const viewForward = (headOrientation) => normalize(qRotateVec(headOrientation, v3(0, 0, -1)));

export function projectWorld(world, headOrientation, width, height, eyeOffset = 0, fovYDeg = 86) {
  const p = cameraFromWorld(world, headOrientation, eyeOffset);
  if (p.z >= -0.03) return null;
  const fov = fovYDeg * Math.PI / 180;
  const focal = height / (2 * Math.tan(fov / 2));
  const invZ = 1 / -p.z;
  return {
    x: width / 2 + p.x * focal * invZ,
    y: height / 2 - p.y * focal * invZ,
    depth: -p.z,
    scale: focal * invZ,
    camera: p,
  };
}

export function angularOffset(world, headOrientation) {
  const p = cameraFromWorld(world, headOrientation, 0);
  if (p.z >= -0.02) return { angle: Math.PI, xAngle: Math.PI, yAngle: Math.PI, depth: -p.z };
  const xAngle = Math.atan2(p.x, -p.z);
  const yAngle = Math.atan2(p.y, -p.z);
  return { angle: Math.hypot(xAngle, yAngle), xAngle, yAngle, depth: -p.z };
}

export function rayPlane(origin, direction, planePoint, planeNormal) {
  const denom = dot(direction, planeNormal);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(sub(planePoint, origin), planeNormal) / denom;
  if (t <= 0) return null;
  return { distance: t, point: add(origin, scale(direction, t)) };
}

export const seededRandom = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
