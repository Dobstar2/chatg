import { clamp } from '../core/math.js';

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerExtended(landmarks, tip, pip, mcp, wrist = 0) {
  const wristToTip = distance2(landmarks[wrist], landmarks[tip]);
  const wristToPip = distance2(landmarks[wrist], landmarks[pip]);
  const mcpToTip = distance2(landmarks[mcp], landmarks[tip]);
  const mcpToPip = distance2(landmarks[mcp], landmarks[pip]);
  return wristToTip > wristToPip * 1.12 && mcpToTip > mcpToPip * 1.18;
}

export class GestureDetector {
  constructor() {
    this.states = {
      left: { pinched: false, serial: 0 },
      right: { pinched: false, serial: 0 },
    };
  }

  process(side, landmarks) {
    const state = this.states[side];
    const palm = Math.max(distance2(landmarks[5], landmarks[17]), 0.02);
    const pinchRatio = distance2(landmarks[4], landmarks[8]) / palm;
    const pinchStrength = clamp(1 - (pinchRatio - 0.18) / 0.50, 0, 1);
    const nextPinched = state.pinched ? pinchRatio < 0.54 : pinchRatio < 0.34;

    let pinchPhase = nextPinched ? 'held' : 'open';
    if (nextPinched && !state.pinched) {
      pinchPhase = 'start';
      state.serial += 1;
    } else if (!nextPinched && state.pinched) {
      pinchPhase = 'release';
      state.serial += 1;
    }
    state.pinched = nextPinched;

    const index = fingerExtended(landmarks, 8, 6, 5);
    const middle = fingerExtended(landmarks, 12, 10, 9);
    const ring = fingerExtended(landmarks, 16, 14, 13);
    const pinky = fingerExtended(landmarks, 20, 18, 17);
    const thumb = distance2(landmarks[4], landmarks[5]) > distance2(landmarks[3], landmarks[5]) * 1.12;
    const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;

    let name = 'open';
    if (nextPinched) name = 'pinch';
    else if (index && !middle && !ring && !pinky) name = 'point';
    else if (extendedCount <= 1) name = 'fist';
    else if (extendedCount <= 2) name = 'grab';
    else if (extendedCount >= 4) name = 'open';
    else name = 'relaxed';

    return {
      name,
      pinchPhase,
      pinchStrength,
      pinchSerial: state.serial,
      fingers: { thumb, index, middle, ring, pinky },
    };
  }

  reset(side) {
    const state = this.states[side];
    if (state.pinched) state.serial += 1;
    state.pinched = false;
  }
}
