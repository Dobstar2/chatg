import { clamp } from '../core/math.js';
import { OneEuroScalar } from './filters-v020.js';

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerExtended(landmarks, tip, pip, mcp, wrist = 0) {
  const wristToTip = distance2(landmarks[wrist], landmarks[tip]);
  const wristToPip = distance2(landmarks[wrist], landmarks[pip]);
  const mcpToTip = distance2(landmarks[mcp], landmarks[tip]);
  const mcpToPip = distance2(landmarks[mcp], landmarks[pip]);
  return wristToTip > wristToPip * 1.10 && mcpToTip > mcpToPip * 1.14;
}

function makeState() {
  return {
    pinched: false,
    serial: 0,
    ratioFilter: new OneEuroScalar({ minCutoff: 3.4, beta: 0.55, derivativeCutoff: 2.0 }),
    lastRatio: 1,
  };
}

export class GestureDetectorV2 {
  constructor() {
    this.states = { left: makeState(), right: makeState() };
    this.pinchStart = 0.33;
    this.pinchRelease = 0.49;
  }

  process(side, landmarks, nowMs, quality = 1) {
    const state = this.states[side];
    const palm = Math.max(distance2(landmarks[5], landmarks[17]), 0.02);
    const rawPinchRatio = distance2(landmarks[4], landmarks[8]) / palm;
    const pinchRatio = state.ratioFilter.filter(rawPinchRatio, nowMs, quality);
    state.lastRatio = pinchRatio;

    // Low-quality frames are allowed to maintain an existing pinch briefly, but
    // are never allowed to create a new click transition.
    let nextPinched = state.pinched;
    if (quality >= 0.42) {
      nextPinched = state.pinched
        ? pinchRatio < this.pinchRelease
        : pinchRatio < this.pinchStart;
    } else if (state.pinched && pinchRatio > this.pinchRelease + 0.12) {
      nextPinched = false;
    }

    let pinchPhase = nextPinched ? 'held' : 'open';
    if (nextPinched && !state.pinched) {
      pinchPhase = 'start';
      state.serial += 1;
    } else if (!nextPinched && state.pinched) {
      pinchPhase = 'release';
      state.serial += 1;
    }
    state.pinched = nextPinched;

    // Continuous feedback remains useful even when we are outside the discrete
    // click thresholds.
    const pinchStrength = clamp(1 - (pinchRatio - 0.20) / 0.42, 0, 1);

    const index = fingerExtended(landmarks, 8, 6, 5);
    const middle = fingerExtended(landmarks, 12, 10, 9);
    const ring = fingerExtended(landmarks, 16, 14, 13);
    const pinky = fingerExtended(landmarks, 20, 18, 17);
    const thumb = distance2(landmarks[4], landmarks[5]) > distance2(landmarks[3], landmarks[5]) * 1.08;
    const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;

    let name = 'relaxed';
    if (nextPinched) name = 'pinch';
    else if (index && !middle && !ring && !pinky) name = 'point';
    else if (extendedCount <= 1) name = 'fist';
    else if (extendedCount <= 2) name = 'grab';
    else if (extendedCount >= 4) name = 'open';

    return {
      name,
      pinchPhase,
      pinchStrength,
      pinchRatio,
      pinchSerial: state.serial,
      fingers: { thumb, index, middle, ring, pinky },
    };
  }

  reset(side, nowMs = performance.now()) {
    const state = this.states[side];
    if (state.pinched) state.serial += 1;
    state.pinched = false;
    state.ratioFilter.reset(1, nowMs);
    state.lastRatio = 1;
  }
}
