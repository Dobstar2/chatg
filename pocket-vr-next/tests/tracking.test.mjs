import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pointInPolygon,
  qAxisAngle,
  qRelative,
  qRotateVec,
  rayPlaneIntersection,
  v3Distance,
} from '../core/math.js';
import { GestureDetector } from '../tracking/gesture-detector.js';

function baseHand() {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0] = { x: 0.5, y: 0.8, z: 0 };
  points[5] = { x: 0.42, y: 0.58, z: 0 };
  points[6] = { x: 0.42, y: 0.44, z: 0 };
  points[8] = { x: 0.42, y: 0.2, z: 0 };
  points[9] = { x: 0.5, y: 0.57, z: 0 };
  points[10] = { x: 0.5, y: 0.46, z: 0 };
  points[12] = { x: 0.5, y: 0.24, z: 0 };
  points[13] = { x: 0.58, y: 0.6, z: 0 };
  points[14] = { x: 0.58, y: 0.5, z: 0 };
  points[16] = { x: 0.58, y: 0.31, z: 0 };
  points[17] = { x: 0.65, y: 0.63, z: 0 };
  points[18] = { x: 0.65, y: 0.55, z: 0 };
  points[20] = { x: 0.65, y: 0.39, z: 0 };
  points[3] = { x: 0.35, y: 0.58, z: 0 };
  points[4] = { x: 0.29, y: 0.49, z: 0 };
  return points;
}

test('relative quaternion keeps a frozen world direction consistent', () => {
  const base = qAxisAngle(0, 1, 0, Math.PI / 6);
  const current = qAxisAngle(0, 1, 0, Math.PI / 3);
  const relative = qRelative(base, current);
  const forward = qRotateVec(relative, { x: 0, y: 0, z: -1 });
  assert.ok(forward.x < -0.45);
  assert.ok(forward.z < -0.8);
});

test('ray-plane intersection returns a forward hit', () => {
  const hit = rayPlaneIntersection(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
  );
  assert.ok(hit);
  assert.ok(v3Distance(hit.point, { x: 0, y: 0, z: -1 }) < 1e-6);
});

test('polygon hit testing accepts an interior point', () => {
  assert.equal(pointInPolygon(
    { x: 5, y: 5 },
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  ), true);
});

test('pinch emits start, held, and release only on transitions', () => {
  const detector = new GestureDetector();
  const open = baseHand();
  const pinched = structuredClone(open);
  pinched[4] = { ...pinched[8], x: pinched[8].x + 0.005 };

  assert.equal(detector.process('left', open).pinchPhase, 'open');
  const start = detector.process('left', pinched);
  assert.equal(start.pinchPhase, 'start');
  assert.equal(detector.process('left', pinched).pinchPhase, 'held');
  const release = detector.process('left', open);
  assert.equal(release.pinchPhase, 'release');
  assert.notEqual(start.pinchSerial, release.pinchSerial);
});
