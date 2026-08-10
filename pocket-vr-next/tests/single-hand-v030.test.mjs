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

import { HandTrackingManagerV2 } from '../tracking/hand-tracking-v020.js';
import { InteractionManagerV2 } from '../scene/interaction-manager-v020.js';

function makeTrackedHand() {
  const joints = Array.from({ length: 21 }, () => ({ x: -0.38, y: 0.13, z: -0.62 }));
  joints[4] = { x: -0.38, y: 0.13, z: -0.62 };
  joints[5] = { x: -0.38, y: 0.13, z: -0.58 };
  joints[6] = { x: -0.38, y: 0.13, z: -0.61 };
  joints[8] = { x: -0.38, y: 0.13, z: -0.62 };
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
    rayOriginWorld: { x: -0.38, y: 0.13, z: -0.50 },
    rayDirectionWorld: { x: 0, y: 0, z: -1 },
    velocityWorld: { x: 0, y: 0, z: 0 },
    gesture: { name: 'point', pinchPhase: 'start', pinchSerial: 1, pinchStrength: 1, pinchRatio: 0.2 },
  };
}

function makeLostHand() {
  const hand = makeTrackedHand();
  hand.tracked = false;
  hand.interacting = false;
  hand.interactionSafe = false;
  hand.interactionState = 'UNTRACKED';
  return hand;
}

test('one detection is automatically assigned without requiring a second hand', () => {
  const manager = new HandTrackingManagerV2({}, { horizontalFovDeg: 100 });
  const detection = {
    wrist: { x: 0.72, y: 0.52 },
    label: 'left',
    score: 0.91,
  };
  const assignment = manager._assignDetections([detection], 1000);
  assert.equal(assignment.length, 1);
  assert.equal(assignment[0].side, 'left');
  assert.equal(assignment[0].detection, detection);
});

test('a single tracked hand can activate far UI while the other hand is lost', () => {
  const interaction = new InteractionManagerV2();
  const left = makeTrackedHand();
  const right = makeLostHand();
  let action = null;
  interaction.addEventListener('action', (event) => { action = event.detail; });
  interaction.update({ left, right }, 1000);
  assert.ok(action, 'single-hand input should be accepted');
  assert.equal(action.side, 'left');
  assert.equal(action.action, 'recenter');
});

test('either left or right hand may be the only active controller', () => {
  const interaction = new InteractionManagerV2();
  const left = makeLostHand();
  const right = makeTrackedHand();
  right.rayOriginWorld = { x: 0, y: 0.13, z: -0.50 };
  right.jointsInteractionWorld = right.jointsInteractionWorld.map((joint) => ({ ...joint, x: 0 }));
  let action = null;
  interaction.addEventListener('action', (event) => { action = event.detail; });
  interaction.update({ left, right }, 1000);
  assert.ok(action, 'right-only input should be accepted');
  assert.equal(action.side, 'right');
  assert.equal(action.action, 'recalibrate');
});
