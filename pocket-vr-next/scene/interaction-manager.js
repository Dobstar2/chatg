import {
  clamp,
  rayPlaneIntersection,
  v3Add,
  v3Distance,
  v3Dot,
  v3Length,
  v3Normalize,
  v3Scale,
  v3Sub,
} from '../core/math.js';

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function raySphere(origin, direction, center, radius) {
  const oc = v3Sub(origin, center);
  const b = 2 * v3Dot(oc, direction);
  const c = v3Dot(oc, oc) - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) return null;
  const sqrt = Math.sqrt(discriminant);
  const t0 = (-b - sqrt) / 2;
  const t1 = (-b + sqrt) / 2;
  const t = t0 > 0 ? t0 : (t1 > 0 ? t1 : null);
  return t == null ? null : { distance: t, point: v3Add(origin, v3Scale(direction, t)) };
}

export class InteractionManager extends EventTarget {
  constructor() {
    super();
    this.panel = {
      center: { x: 0, y: 0, z: -1.25 },
      width: 1.16,
      height: 0.72,
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
      grabbedBy: new Set(),
      oneHandOffsets: new Map(),
      twoHand: null,
    };
  }

  _makeHandRuntime() {
    return {
      lastPinchSerial: -1,
      lastPinched: false,
      previousPlaneDistance: null,
      currentObjectId: null,
    };
  }

  resetObjects() {
    for (const object of this.objects) {
      object.position = { ...object.initialPosition };
      object.size = object.initialSize;
      object.rotationZ = 0;
      object.grabbedBy.clear();
      object.oneHandOffsets.clear();
      object.twoHand = null;
    }
    for (const runtime of Object.values(this.handRuntime)) runtime.currentObjectId = null;
  }

  update(hands) {
    for (const button of this.buttons) {
      button.hoveredBy.clear();
      button.pressedBy.clear();
    }

    for (const side of ['left', 'right']) {
      this._updateHand(side, hands[side], hands);
    }

    this._updateHeldObjects(hands);
  }

  _updateHand(side, hand, hands) {
    const runtime = this.handRuntime[side];
    if (!hand?.interacting || !hand.tracked) {
      this._releaseHand(side);
      hand.target = null;
      hand.interactionMode = 'none';
      runtime.previousPlaneDistance = null;
      return;
    }

    const indexMcp = hand.jointsWorld[5];
    const indexPip = hand.jointsWorld[6];
    const indexTip = hand.jointsWorld[8];
    const thumbTip = hand.jointsWorld[4];
    const pinchPoint = midpoint(indexTip, thumbTip);
    const direction = v3Normalize(v3Sub(indexTip, indexPip || indexMcp));
    const panelHit = rayPlaneIntersection(indexMcp, direction, this.panel.center, this.panel.normal);
    const localHit = panelHit ? {
      x: panelHit.point.x - this.panel.center.x,
      y: panelHit.point.y - this.panel.center.y,
    } : null;
    const button = localHit ? this._buttonAt(localHit.x, localHit.y) : null;

    const planeDistance = Math.abs(indexTip.z - this.panel.center.z);
    const nearPanel = planeDistance < 0.085
      && Math.abs(indexTip.x - this.panel.center.x) <= this.panel.width / 2
      && Math.abs(indexTip.y - this.panel.center.y) <= this.panel.height / 2;

    if (button) {
      button.hoveredBy.add(side);
      hand.target = button.id;
      hand.interactionMode = nearPanel ? 'near' : 'far';
    } else {
      hand.target = null;
      hand.interactionMode = 'none';
    }

    const isPinched = hand.gesture.pinchPhase === 'start' || hand.gesture.pinchPhase === 'held';
    const pinchStarted = hand.gesture.pinchPhase === 'start'
      && runtime.lastPinchSerial !== hand.gesture.pinchSerial;
    const pinchReleased = hand.gesture.pinchPhase === 'release'
      && runtime.lastPinchSerial !== hand.gesture.pinchSerial;

    if (pinchStarted) {
      runtime.lastPinchSerial = hand.gesture.pinchSerial;
      if (button) {
        button.pressedBy.add(side);
        this.dispatchEvent(new CustomEvent('action', { detail: { action: button.id, side } }));
      } else {
        const object = this._pickObject(pinchPoint, indexMcp, direction);
        if (object) this._grabObject(side, object, pinchPoint, hands);
      }
    }

    const crossedPlane = runtime.previousPlaneDistance != null
      && runtime.previousPlaneDistance > 0.045
      && planeDistance <= 0.025;
    if (crossedPlane && nearPanel && button && !isPinched) {
      button.pressedBy.add(side);
      this.dispatchEvent(new CustomEvent('action', { detail: { action: button.id, side, mode: 'poke' } }));
    }

    if (pinchReleased || (!isPinched && runtime.lastPinched)) {
      runtime.lastPinchSerial = hand.gesture.pinchSerial;
      this._releaseHand(side);
    }

    runtime.lastPinched = isPinched;
    runtime.previousPlaneDistance = planeDistance;
  }

  _buttonAt(x, y) {
    return this.buttons.find((button) => (
      Math.abs(x - button.x) <= button.w / 2
      && Math.abs(y - button.y) <= button.h / 2
    )) || null;
  }

  _pickObject(pinchPoint, rayOrigin, rayDirection) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const object of this.objects) {
      const directDistance = v3Distance(pinchPoint, object.position);
      if (directDistance <= object.size * 1.8 && directDistance < nearestDistance) {
        nearest = object;
        nearestDistance = directDistance;
        continue;
      }
      const rayHit = raySphere(rayOrigin, rayDirection, object.position, object.size * 0.9);
      if (rayHit && rayHit.distance < nearestDistance && rayHit.distance < 1.7) {
        nearest = object;
        nearestDistance = rayHit.distance;
      }
    }
    return nearest;
  }

  _grabObject(side, object, pinchPoint, hands) {
    const runtime = this.handRuntime[side];
    runtime.currentObjectId = object.id;
    object.grabbedBy.add(side);
    object.oneHandOffsets.set(side, v3Sub(object.position, pinchPoint));

    if (object.grabbedBy.size === 2) {
      const leftPoint = this._pinchPoint(hands.left);
      const rightPoint = this._pinchPoint(hands.right);
      if (leftPoint && rightPoint) {
        const vector = v3Sub(rightPoint, leftPoint);
        object.twoHand = {
          initialDistance: Math.max(0.12, v3Length(vector)),
          initialAngle: Math.atan2(vector.y, vector.x),
          initialSize: object.size,
          initialRotation: object.rotationZ,
          initialMidpointOffset: v3Sub(object.position, midpoint(leftPoint, rightPoint)),
        };
      }
    }
  }

  _releaseHand(side) {
    const runtime = this.handRuntime[side];
    if (!runtime.currentObjectId) return;
    const object = this.objects.find((candidate) => candidate.id === runtime.currentObjectId);
    if (object) {
      object.grabbedBy.delete(side);
      object.oneHandOffsets.delete(side);
      object.twoHand = null;
    }
    runtime.currentObjectId = null;
  }

  _updateHeldObjects(hands) {
    for (const object of this.objects) {
      if (object.grabbedBy.size === 2) {
        const leftPoint = this._pinchPoint(hands.left);
        const rightPoint = this._pinchPoint(hands.right);
        if (!leftPoint || !rightPoint || !object.twoHand) continue;
        const vector = v3Sub(rightPoint, leftPoint);
        const distance = Math.max(0.12, v3Length(vector));
        const angle = Math.atan2(vector.y, vector.x);
        const scale = clamp(distance / object.twoHand.initialDistance, 0.45, 2.4);
        object.size = clamp(object.twoHand.initialSize * scale, 0.065, 0.34);
        object.rotationZ = object.twoHand.initialRotation + (angle - object.twoHand.initialAngle);
        object.position = v3Add(midpoint(leftPoint, rightPoint), object.twoHand.initialMidpointOffset);
      } else if (object.grabbedBy.size === 1) {
        const [side] = [...object.grabbedBy];
        const pinchPoint = this._pinchPoint(hands[side]);
        if (!pinchPoint) continue;
        const offset = object.oneHandOffsets.get(side) || { x: 0, y: 0, z: 0 };
        object.position = v3Add(pinchPoint, offset);
      }
    }
  }

  _pinchPoint(hand) {
    if (!hand?.interacting || !hand.tracked) return null;
    return midpoint(hand.jointsWorld[4], hand.jointsWorld[8]);
  }
}
