import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  };
}

import { OneEuroScalar, RobustDepthFilter, VelocityEstimator } from '../tracking/filters-v020.js';
import { GestureDetectorV2 } from '../tracking/gesture-detector-v020.js';
import { HandTrackingManagerV2 } from '../tracking/hand-tracking-v020.js';
import { InteractionManagerV2 } from '../scene/interaction-manager-v020.js';

function baseLandmarks() {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0] = { x: 0.50, y: 0.72, z: 0 };
  points[5] = { x: 0.42, y: 0.55, z: 0 };
  points[9] = { x: 0.50, y: 0.50, z: 0 };
  points[13] = { x: 0.58, y: 0.55, z: 0 };
  points[17] = { x: 0.66, y: 0.60, z: 0 };
  points[6] = { x: 0.42, y: 0.43, z: 0 };
  points[7] = { x: 0.42, y: 0.34, z: 0 };
  points[8] = { x: 0.42, y: 0.25, z: 0 };
  points[3] = { x: 0.33, y: 0.51, z: 0 };
  points[4] = { x: 0.30, y: 0.45, z: 0 };
  return points;
}

function makeHand() {
  const joints = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.7 }));
  return {
    tracked: true,
    interacting: true,
    interactionSafe: true,
    interactionState: 'IDLE',
    interactionMode: 'none',
    target: null,
    reticleState: 'NO TARGET',
    grabObjectId: null,
    jointsInteractionWorld: joints,
    rayOriginWorld: { x: 0, y: 0, z: -0.45 },
    rayDirectionWorld: { x: 0, y: 0, z: -1 },
    velocityWorld: { x: 0, y: 0, z: 0 },
    gesture: { name: 'point', pinchPhase: 'open', pinchSerial: 0, pinchStrength: 0, pinchRatio: 1 },
  };
}

function setPinchPoint(hand, point) {
  hand.jointsInteractionWorld[4] = { ...point };
  hand.jointsInteractionWorld[8] = { ...point };
  hand.jointsInteractionWorld[5] = { x: point.x, y: point.y, z: point.z + 0.05 };
  hand.jointsInteractionWorld[6] = { x: point.x, y: point.y, z: point.z + 0.025 };
}

test('adaptive scalar filter stabilizes stationary noise without freezing fast movement', () => {
  const filter = new OneEuroScalar({ minCutoff: 1.1, beta: 0.7 });
  let value = 0;
  let time = 0;
  for (let i = 0; i < 40; i += 1) {
    time += 16.7;
    value = filter.filter((i % 2 ? 1 : -1) * 0.006, time, 0.95);
  }
  assert.ok(Math.abs(value) < 0.0045);
  for (let i = 0; i < 6; i += 1) {
    time += 16.7;
    value = filter.filter(0.18, time, 0.95);
  }
  assert.ok(value > 0.11, `fast response was too delayed: ${value}`);
});

test('robust depth filter rejects a one-frame depth spike', () => {
  const filter = new RobustDepthFilter();
  filter.reset(0.55, 0);
  const normal = filter.filter(0.56, 50, 0.9);
  const spike = filter.filter(1.45, 100, 0.9);
  assert.ok(normal > 0.54 && normal < 0.58);
  assert.ok(spike < 0.80, `depth spike leaked through: ${spike}`);
});

test('pinch hysteresis produces one start, held state, and one release', () => {
  const detector = new GestureDetectorV2();
  const landmarks = baseLandmarks();
  let now = 0;
  const phases = [];

  // Open.
  for (let i = 0; i < 4; i += 1) {
    now += 33;
    landmarks[4] = { x: 0.30, y: 0.45, z: 0 };
    phases.push(detector.process('left', landmarks, now, 0.95).pinchPhase);
  }
  // Close thumb to index and hold.
  for (let i = 0; i < 8; i += 1) {
    now += 33;
    landmarks[4] = { x: 0.415, y: 0.265, z: 0 };
    phases.push(detector.process('left', landmarks, now, 0.95).pinchPhase);
  }
  // Release.
  for (let i = 0; i < 8; i += 1) {
    now += 33;
    landmarks[4] = { x: 0.30, y: 0.45, z: 0 };
    phases.push(detector.process('left', landmarks, now, 0.95).pinchPhase);
  }

  assert.equal(phases.filter((phase) => phase === 'start').length, 1);
  assert.equal(phases.filter((phase) => phase === 'release').length, 1);
  assert.ok(phases.filter((phase) => phase === 'held').length >= 3);
});

test('identity assignment favors motion continuity over one-frame handedness flip', () => {
  const manager = new HandTrackingManagerV2({}, { horizontalFovDeg: 100 });
  manager.hands.left.imageWrist = { x: 0.70, y: 0.50 };
  manager.hands.right.imageWrist = { x: 0.30, y: 0.50 };
  manager.hands.left.lastSeenAt = 1000;
  manager.hands.right.lastSeenAt = 1000;
  const detections = [
    { wrist: { x: 0.69, y: 0.50 }, label: 'right', score: 0.96 },
    { wrist: { x: 0.31, y: 0.50 }, label: 'left', score: 0.96 },
  ];
  const assignments = manager._assignDetections(detections, 1033);
  assert.equal(assignments.find((item) => item.side === 'left').detection.wrist.x, 0.69);
  assert.equal(assignments.find((item) => item.side === 'right').detection.wrist.x, 0.31);
});

test('far UI pinch fires once while held', () => {
  const interaction = new InteractionManagerV2();
  const left = makeHand();
  const right = makeHand();
  right.tracked = right.interacting = right.interactionSafe = false;
  left.rayOriginWorld = { x: -0.38, y: 0.13, z: -0.55 };
  left.rayDirectionWorld = { x: 0, y: 0, z: -1 };
  left.jointsInteractionWorld[8] = { x: -0.38, y: 0.13, z: -0.55 };
  let actions = 0;
  interaction.addEventListener('action', () => { actions += 1; });

  left.gesture = { ...left.gesture, pinchPhase: 'start', pinchSerial: 1 };
  interaction.update({ left, right }, 1000);
  left.gesture = { ...left.gesture, pinchPhase: 'held', pinchSerial: 1 };
  interaction.update({ left, right }, 1033);
  interaction.update({ left, right }, 1066);
  assert.equal(actions, 1);
});

test('near poke crosses activation plane once without repeat firing', () => {
  const interaction = new InteractionManagerV2();
  const left = makeHand();
  const right = makeHand();
  right.tracked = right.interacting = right.interactionSafe = false;
  let actions = 0;
  interaction.addEventListener('action', () => { actions += 1; });

  left.jointsInteractionWorld[8] = { x: -0.38, y: 0.13, z: -1.22 };
  interaction.update({ left, right }, 1000);
  left.jointsInteractionWorld[8] = { x: -0.38, y: 0.13, z: -1.248 };
  interaction.update({ left, right }, 1033);
  interaction.update({ left, right }, 1066);
  assert.equal(actions, 1);
});

test('grab preserves contact offset and release velocity is clamped', () => {
  const interaction = new InteractionManagerV2();
  const left = makeHand();
  const right = makeHand();
  right.tracked = right.interacting = right.interactionSafe = false;
  const object = interaction.objects[0];
  const startPinch = { x: object.position.x + 0.04, y: object.position.y, z: object.position.z };
  setPinchPoint(left, startPinch);
  left.gesture = { ...left.gesture, pinchPhase: 'start', pinchSerial: 1 };
  interaction.update({ left, right }, 1000);
  assert.ok(object.grabbedBy.has('left'));
  const offsetX = object.position.x - startPinch.x;

  const moved = { x: startPinch.x + 0.12, y: startPinch.y, z: startPinch.z };
  setPinchPoint(left, moved);
  left.gesture = { ...left.gesture, pinchPhase: 'held', pinchSerial: 1 };
  interaction.update({ left, right }, 1033);
  assert.ok(Math.abs((object.position.x - moved.x) - offsetX) < 0.002);

  left.velocityWorld = { x: 12, y: 0, z: 0 };
  left.gesture = { ...left.gesture, pinchPhase: 'release', pinchSerial: 2 };
  interaction.update({ left, right }, 1066);
  assert.ok(vLength(object.velocity) <= 2.2 + 1e-6);
});

function vLength(v) {
  return Math.hypot(v.x, v.y, v.z);
}

test('two-hand scaling remains bounded when hand distance becomes extreme', () => {
  const interaction = new InteractionManagerV2();
  const left = makeHand();
  const right = makeHand();
  const object = interaction.objects[0];
  const leftStart = { x: object.position.x - 0.08, y: object.position.y, z: object.position.z };
  const rightStart = { x: object.position.x + 0.08, y: object.position.y, z: object.position.z };
  setPinchPoint(left, leftStart);
  setPinchPoint(right, rightStart);
  interaction._grabObject('left', object, leftStart, { left, right });
  interaction._grabObject('right', object, rightStart, { left, right });

  setPinchPoint(left, { x: -1.0, y: -0.2, z: -0.9 });
  setPinchPoint(right, { x: 1.0, y: -0.2, z: -0.9 });
  for (let i = 0; i < 30; i += 1) interaction._updateHeldObjects({ left, right }, 1 / 60);
  assert.ok(object.size <= 0.32 + 1e-6);
  assert.ok(object.size >= 0.07 - 1e-6);
});

test('multi-frame velocity estimator clamps tracking spikes', () => {
  const estimator = new VelocityEstimator({ maxSpeed: 2.2 });
  estimator.push({ x: 0, y: 0, z: 0 }, 0);
  estimator.push({ x: 0.02, y: 0, z: 0 }, 16);
  estimator.push({ x: 9, y: 0, z: 0 }, 32);
  assert.ok(vLength(estimator.getVelocity()) <= 2.2 + 1e-6);
});
