import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTrackingManager } from '../tracking/hand-tracking.js';

function makeNormalizedHand(centerX, palmWidth) {
  const points = Array.from({ length: 21 }, () => ({ x: centerX, y: 0.55, z: 0 }));
  points[0] = { x: centerX, y: 0.76, z: 0 };
  points[5] = { x: centerX - palmWidth / 2, y: 0.55, z: 0 };
  points[17] = { x: centerX + palmWidth / 2, y: 0.57, z: 0 };
  points[9] = { x: centerX, y: 0.52, z: 0 };
  points[4] = { x: centerX - 0.07, y: 0.45, z: 0 };
  points[8] = { x: centerX - 0.02, y: 0.28, z: 0 };
  points[6] = { x: centerX - 0.02, y: 0.4, z: 0 };
  points[12] = { x: centerX + 0.01, y: 0.31, z: 0 };
  points[10] = { x: centerX + 0.01, y: 0.42, z: 0 };
  points[16] = { x: centerX + 0.04, y: 0.34, z: 0 };
  points[14] = { x: centerX + 0.04, y: 0.45, z: 0 };
  points[20] = { x: centerX + 0.07, y: 0.39, z: 0 };
  points[18] = { x: centerX + 0.07, y: 0.49, z: 0 };
  return points;
}

function makeManager() {
  const video = { videoWidth: 640, videoHeight: 480 };
  const camera = { horizontalFovDeg: 110 };
  return new HandTrackingManager(video, camera);
}

test('hand identity combines handedness and continuity', () => {
  const manager = makeManager();
  const now = performance.now();
  const leftDetection = { label: 'left', score: 0.95, wrist: { x: 0.28, y: 0.6 } };
  const rightDetection = { label: 'right', score: 0.95, wrist: { x: 0.72, y: 0.6 } };
  let assignments = manager._assignDetections([leftDetection, rightDetection], now);
  assert.equal(assignments[0].side, 'left');
  assert.equal(assignments[1].side, 'right');

  manager.hands.left.imageWrist = { x: 0.28, y: 0.6 };
  manager.hands.left.lastSeenAt = now;
  manager.hands.right.imageWrist = { x: 0.72, y: 0.6 };
  manager.hands.right.lastSeenAt = now;
  assignments = manager._assignDetections([
    { ...leftDetection, wrist: { x: 0.61, y: 0.6 } },
    { ...rightDetection, wrist: { x: 0.39, y: 0.6 } },
  ], now + 30);
  assert.equal(assignments.find((item) => item.detection.label === 'left').side, 'left');
  assert.equal(assignments.find((item) => item.detection.label === 'right').side, 'right');
});

test('larger apparent palm width produces a nearer estimated depth', () => {
  const manager = makeManager();
  const hand = manager.hands.left;
  manager._updateHand(hand, {
    landmarks: makeNormalizedHand(0.4, 0.08),
    label: 'left',
    score: 0.9,
    wrist: { x: 0.4, y: 0.76 },
  }, 1000);
  const farDepth = hand.rawDepthMeters;

  manager._updateHand(hand, {
    landmarks: makeNormalizedHand(0.4, 0.18),
    label: 'left',
    score: 0.9,
    wrist: { x: 0.4, y: 0.76 },
  }, 1066);
  const nearDepth = hand.rawDepthMeters;
  assert.ok(nearDepth < farDepth);
  assert.ok(nearDepth >= 0.22);
  assert.ok(farDepth <= 1.45);
});
