export const EPSILON = 1e-6;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function expSmoothing(dtMs, timeConstantMs) {
  return 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, timeConstantMs));
}

export function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function v3Clone(v) {
  return { x: v.x, y: v.y, z: v.z };
}

export function v3Add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function v3Sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function v3Scale(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

export function v3Dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function v3Cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function v3Length(v) {
  return Math.hypot(v.x, v.y, v.z);
}

export function v3Distance(a, b) {
  return v3Length(v3Sub(a, b));
}

export function v3Normalize(v) {
  const length = v3Length(v);
  if (length < EPSILON) return { x: 0, y: 0, z: -1 };
  return v3Scale(v, 1 / length);
}

export function v3Lerp(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function quat(x = 0, y = 0, z = 0, w = 1) {
  return { x, y, z, w };
}

export function qClone(q) {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export function qNormalize(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

export function qMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function qConjugate(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function qAxisAngle(x, y, z, angleRadians) {
  const half = angleRadians * 0.5;
  const s = Math.sin(half);
  return qNormalize({ x: x * s, y: y * s, z: z * s, w: Math.cos(half) });
}

export function qFromEulerYXZ(x, y, z) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return qNormalize({
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  });
}

export function qRotateVec(q, v) {
  const result = qMultiply(qMultiply(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConjugate(q));
  return { x: result.x, y: result.y, z: result.z };
}

export function qRelative(base, current) {
  return qNormalize(qMultiply(qConjugate(base), current));
}

export function qNlerp(a, b, t) {
  let target = b;
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) target = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  return qNormalize({
    x: lerp(a.x, target.x, t),
    y: lerp(a.y, target.y, t),
    z: lerp(a.z, target.z, t),
    w: lerp(a.w, target.w, t),
  });
}

export function rayPlaneIntersection(origin, direction, planePoint, planeNormal) {
  const denominator = v3Dot(direction, planeNormal);
  if (Math.abs(denominator) < EPSILON) return null;
  const t = v3Dot(v3Sub(planePoint, origin), planeNormal) / denominator;
  if (t <= 0) return null;
  return { point: v3Add(origin, v3Scale(direction, t)), distance: t };
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}
