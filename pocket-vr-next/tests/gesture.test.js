import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureDetector } from '../tracking/gesture-detector.js';

function baseLandmarks() {
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.5 + (index % 4) * 0.01,
    y: 0.75 - Math.floor(index / 4) * 0.03,
    z: 0,
  }));
}

function makePointPose() {
  const p = baseLandmarks();
  p[0] = { x: 0.5, y: 0.9, z: 0 };
  p[5] = { x: 0.47, y: 0.7, z: 0 };
  p[6] = { x: 0.47, y: 0.52, z: 0 };
  p[8] = { x: 0.47, y: 0.22, z: 0 };
  p[9] = { x: 0.51, y: 0.7, z: 0 };
  p[10] = { x: 0.51, y: 0.64, z: 0 };
  p[12] = { x: 0.51, y: 0.72, z: 0 };
  p[13] = { x: 0.55, y: 0.72, z: 0 };
  p[14] = { x: 0.55, y: 0.67, z: 0 };
  p[16] = { x: 0.55, y: 0.75, z: 0 };
  p[17] = { x: 0.59, y: 0.75, z: 0 };
  p[18] = { x: 0.59, y: 0.71, z: 0 };
  p[20] = { x: 0.59, y: 0.78, z: 0 };
  p[3] = { x: 0.39, y: 0.68, z: 0 };
  p[4] = { x: 0.32, y: 0.6, z: 0 };
  return p;
}

test('pinch fires one start, held, and one release transition', () => {
  const detector = new GestureDetector();
  const pose = makePointPose();
  pose[4] = { x: pose[8].x + 0.01, y: pose[8].y + 0.01, z: 0 };

  const start = detector.process('left', pose);
  assert.equal(start.name, 'pinch');
  assert.equal(start.pinchPhase, 'start');

  const held = detector.process('left', pose);
  assert.equal(held.pinchPhase, 'held');
  assert.equal(held.pinchSerial, start.pinchSerial);

  pose[4] = { x: 0.25, y: 0.6, z: 0 };
  const release = detector.process('left', pose);
  assert.equal(release.pinchPhase, 'release');
  assert.notEqual(release.pinchSerial, held.pinchSerial);

  const open = detector.process('left', pose);
  assert.equal(open.pinchPhase, 'open');
});

test('extended index with folded other fingers is recognised as point', () => {
  const detector = new GestureDetector();
  const pose = makePointPose();
  const result = detector.process('right', pose);
  assert.equal(result.name, 'point');
});
