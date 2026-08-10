import test from 'node:test';
import assert from 'node:assert/strict';
import {
  qAxisAngle,
  qRelative,
  qRotateVec,
  rayPlaneIntersection,
  v3Distance,
} from '../core/math.js';

test('relative quaternion is identity when poses match', () => {
  const pose = qAxisAngle(0, 1, 0, Math.PI / 3);
  const relative = qRelative(pose, pose);
  assert.ok(Math.abs(relative.x) < 1e-6);
  assert.ok(Math.abs(relative.y) < 1e-6);
  assert.ok(Math.abs(relative.z) < 1e-6);
  assert.ok(Math.abs(relative.w - 1) < 1e-6);
});

test('quaternion rotates a forward vector around Y', () => {
  const rotation = qAxisAngle(0, 1, 0, Math.PI / 2);
  const rotated = qRotateVec(rotation, { x: 0, y: 0, z: -1 });
  assert.ok(v3Distance(rotated, { x: -1, y: 0, z: 0 }) < 1e-6);
});

test('ray intersects a world-space panel plane', () => {
  const hit = rayPlaneIntersection(
    { x: 0, y: 0, z: -0.4 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: -1.25 },
    { x: 0, y: 0, z: 1 },
  );
  assert.ok(hit);
  assert.ok(Math.abs(hit.point.z + 1.25) < 1e-6);
  assert.ok(Math.abs(hit.distance - 0.85) < 1e-6);
});
