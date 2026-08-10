import {
  clamp,
  expSmoothing,
  rayPlaneIntersection,
  v3Add,
  v3Distance,
  v3Dot,
  v3Length,
  v3Normalize,
  v3Scale,
  v3Sub,
} from '../core/math.js';

const HAND_STATES = Object.freeze({
  UNTRACKED: 'UNTRACKED',
  IDLE: 'IDLE',
  NEAR_UI: 'NEAR_UI',
  FAR_AIMING: 'FAR_AIMING',
  PINCHING_UI: 'PINCHING_UI',
  POKING: 'POKING',
  GRABBING: 'GRABBING',
  TWO_HAND_GRAB: 'TWO_HAND_GRAB',
  CALIBRATING: 'CALIBRATING',
});

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function clampVector(v, maxLength) {
  const length = v3Length(v);
  return length > maxLength && length > 0 ? v3Scale(v, maxLength / length) : { ...v };
}

function raySphere(origin, direction, center, radius) {
  const oc = v3Sub(origin, center);
  const b = 2 * v3Dot(oc, direction);
  const c = v3Dot(oc, oc) - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t0 = (-b - root) / 2;
  const t1 = (-b + root) / 2;
  const t = t0 > 0 ? t0 : (t1 > 0 ? t1 : null);
  return t == null ? null : { distance: t, point: v3Add(origin, v3Scale(direction, t)) };
}

export class InteractionManagerV2 extends EventTarget {
  constructor() {
    super();
    this.panel = {
      center: { x: 0, y: 0, z: -1.25 },
      width: 1.18,
      height: 0.74,
      normal: { x: 0, y: 0, z: 1 },
    };
    this.buttons = [
      { id: 'recenter', label: 'Recenter View', x: -0.38, y: 0.13, w: 0.33, h: 0.17 },
      { id: 'recalibrate', label: 'Recalibrate Hands', x: 0, y: 0.13, w: 0.33, h: 0.17 },
      { id: 'debug', label: 'Debug', x: 0.38, y: 0.13, w: 0.33, h: 0.17 },
      { id: 'reset-objects', label: 'Reset Objects', x: -0.38, y: -0.12, w: 0.33, h: 0.17 },
      { id: 'performance', label: 'Performance', x: 0, y: -0.12, w: 0.33, h: 0.17 },
      { id: 'exit', label: 'Exit VR', x: 0.38, y: -0.12, w: 0.33, h: 0.17 },
    ].map((button) => ({ ...button, hoveredBy: new Set(), pressedBy: new Set() }));

    this.objects = [
      this._makeObject('cube-left', { x: -0.27, y: -0.28, z: -0.86 }, 0.13, '#70e6ff'),
      this._makeObject('cube-right', { x: 0.27, y: -0.28, z: -0.86 }, 0.13, '#ff7bd5'),
    ];

    this.handRuntime = {
      left: this._makeHandRuntime(),
      right: this._makeHandRuntime(),
    };
    this.lastUpdateAt = performance.now();
  }

  _makeObject(id, position, size, color) {
    return {
      id,
      position: { ...position },
      initialPosition: { ...position },
      size,
      initialSize: size,
      rotationZ: 0,
      color,
      velocity: { x: 0, y: 0, z: 0 },
      grabbedBy: new Set(),
      oneHandOffsets: new Map(),
      twoHand: null,
    };
  }

  _makeHandRuntime() {
    return {
      state: HAND_STATES.UNTRACKED,
      lastPinchSerial: -1,
      wasPinched: false,
      nearMode: false,
      pokeState: 'OUTSIDE',
      previousFrontDistance: null,
      pokeButtonId: null,
      currentObjectId: null,
      lockedTargetId: null,
      lockedTargetUntil: 0,
    };
  }

  resetObjects() {
    for (const object of this.objects) {
      object.position = { ...object.initialPosition };
      object.size = object.initialSize;
      object.rotationZ = 0;
      object.velocity = { x: 0, y: 0, z: 0 };
      object.grabbedBy.clear();
      object.oneHandOffsets.clear();
      object.twoHand = null;
    }
    for (const runtime of Object.values(this.handRuntime)) {
      runtime.currentObjectId = null;
      runtime.state = HAND_STATES.IDLE;
    }
  }

  update(hands, now = performance.now()) {
    const dt = clamp((now - this.lastUpdateAt) / 1000, 1 / 120, 0.05);
    this.lastUpdateAt = now;

    for (const button of this.buttons) {
      button.hoveredBy.clear();
      button.pressedBy.clear();
    }

    for (const side of ['left', 'right']) {
      this._updateHand(side, hands[side], hands, now);
    }

    this._updateHeldObjects(hands, dt);
    this._updateFreeObjectPhysics(dt);
  }

  _updateHand(side, hand, hands, now) {
    const runtime = this.handRuntime[side];
    if (!hand?.tracked || !hand.interactionSafe || !hand.interacting) {
      this._releaseHand(side, hand, true);
      runtime.state = hand?.interactionState === 'CALIBRATING' ? HAND_STATES.CALIBRATING : HAND_STATES.UNTRACKED;
      runtime.nearMode = false;
      runtime.pokeState = 'OUTSIDE';
      runtime.previousFrontDistance = null;
      runtime.lockedTargetId = null;
      if (hand) {
        hand.target = null;
        hand.reticleState = 'DISABLED';
        hand.interactionMode = 'none';
        hand.interactionState = runtime.state;
      }
      return;
    }

    const indexTip = hand.jointsInteractionWorld[8];
    const thumbTip = hand.jointsInteractionWorld[4];
    const pinchPoint = midpoint(indexTip, thumbTip);
    const rayOrigin = hand.rayOriginWorld;
    const rayDirection = v3Normalize(hand.rayDirectionWorld);
    const frontDistance = v3Dot(v3Sub(indexTip, this.panel.center), this.panel.normal);
    const localTip = {
      x: indexTip.x - this.panel.center.x,
      y: indexTip.y - this.panel.center.y,
    };

    const withinPanel = Math.abs(localTip.x) <= this.panel.width / 2 + 0.06
      && Math.abs(localTip.y) <= this.panel.height / 2 + 0.06;
    if (!runtime.nearMode) runtime.nearMode = withinPanel && frontDistance <= 0.16 && frontDistance >= -0.055;
    else if (!withinPanel || frontDistance > 0.22 || frontDistance < -0.08) runtime.nearMode = false;

    const isPinched = hand.gesture.pinchPhase === 'start' || hand.gesture.pinchPhase === 'held';
    const pinchStarted = hand.gesture.pinchPhase === 'start'
      && runtime.lastPinchSerial !== hand.gesture.pinchSerial;
    const pinchReleased = hand.gesture.pinchPhase === 'release'
      && runtime.lastPinchSerial !== hand.gesture.pinchSerial;

    if (runtime.currentObjectId) {
      runtime.state = this._objectForRuntime(runtime)?.grabbedBy.size === 2
        ? HAND_STATES.TWO_HAND_GRAB
        : HAND_STATES.GRABBING;
      hand.interactionState = runtime.state;
      hand.interactionMode = 'grab';
      hand.target = runtime.currentObjectId;
      hand.reticleState = 'SELECTED';
      if (pinchReleased || !isPinched) {
        runtime.lastPinchSerial = hand.gesture.pinchSerial;
        this._releaseHand(side, hand, false);
      }
      runtime.wasPinched = isPinched;
      return;
    }

    // Priority 1: direct touch. A near button does not also receive far-ray or
    // grab input in the same frame.
    if (runtime.nearMode) {
      const directButton = this._buttonAt(localTip.x, localTip.y, 0.028);
      if (directButton) {
        directButton.hoveredBy.add(side);
        hand.target = directButton.id;
        hand.interactionMode = 'near';
        hand.reticleState = runtime.pokeState === 'PRESSED' ? 'SELECTED' : 'HOVER';
        runtime.state = HAND_STATES.NEAR_UI;
        this._updatePoke(side, hand, directButton, frontDistance, runtime);
        hand.interactionState = runtime.state;
        runtime.wasPinched = isPinched;
        return;
      }
    }

    // Priority 2: grabbing. A pinch only grabs when it starts on a plausible
    // nearby object or on a clearly aimed object.
    const objectCandidate = this._pickObject(pinchPoint, rayOrigin, rayDirection);
    if (pinchStarted && objectCandidate) {
      runtime.lastPinchSerial = hand.gesture.pinchSerial;
      this._grabObject(side, objectCandidate, pinchPoint, hands);
      runtime.state = objectCandidate.grabbedBy.size === 2 ? HAND_STATES.TWO_HAND_GRAB : HAND_STATES.GRABBING;
      hand.interactionState = runtime.state;
      hand.interactionMode = 'grab';
      hand.target = objectCandidate.id;
      hand.reticleState = 'SELECTED';
      runtime.wasPinched = true;
      return;
    }

    // Priority 3: far ray. Target magnetism affects selection only; the visible
    // hand and ray remain unsnapped.
    const farTarget = this._farButtonTarget(rayOrigin, rayDirection, runtime, now);
    if (farTarget) {
      farTarget.hoveredBy.add(side);
      hand.target = farTarget.id;
      hand.interactionMode = 'far';
      hand.reticleState = isPinched ? 'SELECTED' : 'PINCH READY';
      runtime.state = isPinched ? HAND_STATES.PINCHING_UI : HAND_STATES.FAR_AIMING;

      if (pinchStarted) {
        runtime.lastPinchSerial = hand.gesture.pinchSerial;
        farTarget.pressedBy.add(side);
        this.dispatchEvent(new CustomEvent('action', {
          detail: { action: farTarget.id, side, mode: 'far-pinch' },
        }));
      }
      if (isPinched) farTarget.pressedBy.add(side);
    } else {
      hand.target = null;
      hand.interactionMode = 'none';
      hand.reticleState = 'NO TARGET';
      runtime.state = HAND_STATES.IDLE;
    }

    if (pinchReleased) runtime.lastPinchSerial = hand.gesture.pinchSerial;
    runtime.wasPinched = isPinched;
    hand.interactionState = runtime.state;
    runtime.previousFrontDistance = frontDistance;
  }

  _updatePoke(side, hand, button, frontDistance, runtime) {
    const previous = runtime.previousFrontDistance;
    const sameButton = runtime.pokeButtonId === button.id;

    if (!sameButton) {
      runtime.pokeButtonId = button.id;
      runtime.pokeState = 'APPROACHING';
    }

    if (frontDistance <= 0.035 && frontDistance > 0.006) {
      runtime.pokeState = 'CONTACT';
    }

    const crossedActivation = previous != null
      && previous > 0.012
      && frontDistance <= 0.004;
    if (crossedActivation && runtime.pokeState !== 'PRESSED') {
      runtime.pokeState = 'PRESSED';
      runtime.state = HAND_STATES.POKING;
      button.pressedBy.add(side);
      hand.reticleState = 'SELECTED';
      this.dispatchEvent(new CustomEvent('action', {
        detail: { action: button.id, side, mode: 'poke' },
      }));
    } else if (runtime.pokeState === 'PRESSED') {
      button.pressedBy.add(side);
      runtime.state = HAND_STATES.POKING;
      if (frontDistance > 0.050) {
        runtime.pokeState = 'RELEASED';
        runtime.state = HAND_STATES.NEAR_UI;
      }
    } else if (frontDistance > 0.080) {
      runtime.pokeState = 'APPROACHING';
    }

    runtime.previousFrontDistance = frontDistance;
  }

  _buttonAt(x, y, padding = 0) {
    let best = null;
    let bestScore = Infinity;
    for (const button of this.buttons) {
      const halfW = button.w / 2 + padding;
      const halfH = button.h / 2 + padding;
      const dx = Math.abs(x - button.x);
      const dy = Math.abs(y - button.y);
      if (dx > halfW || dy > halfH) continue;
      const score = Math.hypot(dx / Math.max(0.001, halfW), dy / Math.max(0.001, halfH));
      if (score < bestScore) {
        best = button;
        bestScore = score;
      }
    }
    return best;
  }

  _farButtonTarget(origin, direction, runtime, now) {
    const hit = rayPlaneIntersection(origin, direction, this.panel.center, this.panel.normal);
    if (!hit || hit.distance > 2.2) {
      runtime.lockedTargetId = null;
      return null;
    }

    const localX = hit.point.x - this.panel.center.x;
    const localY = hit.point.y - this.panel.center.y;
    let target = this._buttonAt(localX, localY, 0.045);

    if (!target && runtime.lockedTargetId && now < runtime.lockedTargetUntil) {
      target = this.buttons.find((button) => button.id === runtime.lockedTargetId) || null;
    }

    if (target) {
      runtime.lockedTargetId = target.id;
      runtime.lockedTargetUntil = now + 110;
    } else {
      runtime.lockedTargetId = null;
    }
    return target;
  }

  _pickObject(pinchPoint, rayOrigin, rayDirection) {
    let nearest = null;
    let score = Infinity;
    for (const object of this.objects) {
      const directDistance = v3Distance(pinchPoint, object.position);
      if (directDistance <= object.size * 1.75 && directDistance < score) {
        nearest = object;
        score = directDistance;
        continue;
      }

      const rayHit = raySphere(rayOrigin, rayDirection, object.position, object.size * 1.05);
      if (rayHit && rayHit.distance < 1.45) {
        const rayScore = 0.25 + rayHit.distance * 0.12;
        if (rayScore < score) {
          nearest = object;
          score = rayScore;
        }
      }
    }
    return nearest;
  }

  _grabObject(side, object, pinchPoint, hands) {
    const runtime = this.handRuntime[side];
    runtime.currentObjectId = object.id;
    object.grabbedBy.add(side);
    object.velocity = { x: 0, y: 0, z: 0 };
    object.oneHandOffsets.set(side, v3Sub(object.position, pinchPoint));

    if (object.grabbedBy.size === 2) {
      const leftPoint = this._pinchPoint(hands.left);
      const rightPoint = this._pinchPoint(hands.right);
      if (leftPoint && rightPoint) {
        const vector = v3Sub(rightPoint, leftPoint);
        object.twoHand = {
          initialDistance: Math.max(0.16, v3Length(vector)),
          initialAngle: Math.atan2(vector.y, vector.x),
          initialSize: object.size,
          initialRotation: object.rotationZ,
          initialMidpointOffset: v3Sub(object.position, midpoint(leftPoint, rightPoint)),
        };
      }
      for (const grabSide of object.grabbedBy) {
        this.handRuntime[grabSide].state = HAND_STATES.TWO_HAND_GRAB;
        hands[grabSide].interactionState = HAND_STATES.TWO_HAND_GRAB;
      }
    }
  }

  _releaseHand(side, hand, unsafe) {
    const runtime = this.handRuntime[side];
    if (!runtime.currentObjectId) return;
    const object = this.objects.find((candidate) => candidate.id === runtime.currentObjectId);
    if (object) {
      object.grabbedBy.delete(side);
      object.oneHandOffsets.delete(side);
      object.twoHand = null;
      if (!unsafe && hand?.velocityWorld) {
        object.velocity = clampVector(hand.velocityWorld, 2.2);
      }
      if (object.grabbedBy.size === 1) {
        const [remainingSide] = [...object.grabbedBy];
        this.handRuntime[remainingSide].state = HAND_STATES.GRABBING;
      }
    }
    runtime.currentObjectId = null;
  }

  _objectForRuntime(runtime) {
    return this.objects.find((object) => object.id === runtime.currentObjectId) || null;
  }

  _updateHeldObjects(hands, dt) {
    for (const object of this.objects) {
      if (object.grabbedBy.size === 2) {
        const leftPoint = this._pinchPoint(hands.left);
        const rightPoint = this._pinchPoint(hands.right);
        if (!leftPoint || !rightPoint || !object.twoHand) continue;

        const vector = v3Sub(rightPoint, leftPoint);
        const distance = Math.max(0.16, v3Length(vector));
        const angle = Math.atan2(vector.y, vector.x);
        const scale = clamp(distance / object.twoHand.initialDistance, 0.58, 2.0);
        const targetSize = clamp(object.twoHand.initialSize * scale, 0.07, 0.32);
        const targetRotation = object.twoHand.initialRotation + (angle - object.twoHand.initialAngle);
        const targetPosition = v3Add(midpoint(leftPoint, rightPoint), object.twoHand.initialMidpointOffset);
        const alpha = expSmoothing(dt * 1000, 34);

        object.size += (targetSize - object.size) * alpha;
        object.rotationZ += (targetRotation - object.rotationZ) * alpha;
        object.position = {
          x: object.position.x + (targetPosition.x - object.position.x) * alpha,
          y: object.position.y + (targetPosition.y - object.position.y) * alpha,
          z: object.position.z + (targetPosition.z - object.position.z) * alpha,
        };
        object.velocity = { x: 0, y: 0, z: 0 };
      } else if (object.grabbedBy.size === 1) {
        const [side] = [...object.grabbedBy];
        const pinchPoint = this._pinchPoint(hands[side]);
        if (!pinchPoint) continue;
        const offset = object.oneHandOffsets.get(side) || { x: 0, y: 0, z: 0 };
        object.position = v3Add(pinchPoint, offset);
        object.velocity = { x: 0, y: 0, z: 0 };
      }
    }
  }

  _updateFreeObjectPhysics(dt) {
    const floorY = -0.55;
    for (const object of this.objects) {
      if (object.grabbedBy.size) continue;
      const speed = v3Length(object.velocity);
      if (speed < 0.015) {
        object.velocity = { x: 0, y: 0, z: 0 };
        continue;
      }

      object.velocity.y -= 0.75 * dt;
      object.position = v3Add(object.position, v3Scale(object.velocity, dt));
      const damping = Math.exp(-2.4 * dt);
      object.velocity = v3Scale(object.velocity, damping);

      const minY = floorY + object.size;
      if (object.position.y < minY) {
        object.position.y = minY;
        object.velocity.y = Math.abs(object.velocity.y) * 0.22;
      }
      object.position.x = clamp(object.position.x, -1.4, 1.4);
      object.position.z = clamp(object.position.z, -2.4, -0.32);
      object.velocity = clampVector(object.velocity, 2.2);
    }
  }

  _pinchPoint(hand) {
    if (!hand?.interactionSafe || !hand.tracked) return null;
    return midpoint(hand.jointsInteractionWorld[4], hand.jointsInteractionWorld[8]);
  }
}

export { HAND_STATES };
