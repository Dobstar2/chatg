import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionManager } from '../scene/interaction-manager.js';

function joints(fill = { x: 0, y: 0, z: -0.5 }) {
  return Array.from({ length: 21 }, () => ({ ...fill }));
}

function makeHand(side, pinchPoint, phase = 'open', serial = 0) {
  const handJoints = joints();
  handJoints[4] = { x: pinchPoint.x - 0.01, y: pinchPoint.y, z: pinchPoint.z };
  handJoints[8] = { x: pinchPoint.x + 0.01, y: pinchPoint.y, z: pinchPoint.z };
  handJoints[5] = { x: pinchPoint.x, y: pinchPoint.y, z: pinchPoint.z + 0.28 };
  handJoints[6] = { x: pinchPoint.x, y: pinchPoint.y, z: pinchPoint.z + 0.16 };
  return {
    side,
    tracked: true,
    interacting: true,
    jointsWorld: handJoints,
    gesture: {
      name: phase === 'open' ? 'point' : 'pinch',
      pinchPhase: phase,
      pinchSerial: serial,
      pinchStrength: phase === 'open' ? 0 : 1,
    },
    target: null,
    interactionMode: 'none',
    grabObjectId: null,
  };
}

test('far pinch activates a world-space UI button exactly once', () => {
  const manager = new InteractionManager();
  const actions = [];
  manager.addEventListener('action', (event) => actions.push(event.detail));

  const left = makeHand('left', { x: -0.38, y: 0.13, z: -0.75 }, 'start', 1);
  const right = { tracked: false, interacting: false, jointsWorld: joints(), gesture: { pinchPhase: 'open', pinchSerial: 0 } };
  manager.update({ left, right });
  manager.update({ left: { ...left, gesture: { ...left.gesture, pinchPhase: 'held' } }, right });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'recenter');
  assert.equal(actions[0].side, 'left');
});

test('two hands can scale the same grabbed cube without scale explosion', () => {
  const manager = new InteractionManager();
  const object = manager.objects[0];
  const leftStart = makeHand('left', { ...object.position }, 'start', 1);
  const rightStart = makeHand('right', { x: object.position.x + 0.08, y: object.position.y, z: object.position.z }, 'start', 1);
  manager.update({ left: leftStart, right: rightStart });
  assert.equal(object.grabbedBy.size, 2);

  const leftHeld = makeHand('left', { x: object.position.x - 0.12, y: object.position.y, z: object.position.z }, 'held', 1);
  const rightHeld = makeHand('right', { x: object.position.x + 0.20, y: object.position.y, z: object.position.z }, 'held', 1);
  manager.update({ left: leftHeld, right: rightHeld });

  assert.ok(object.size > object.initialSize);
  assert.ok(object.size <= 0.34);
});
