import {
  qAxisAngle,
  qClone,
  qFromEulerYXZ,
  qMultiply,
  qNormalize,
  qRelative,
  quat,
} from '../core/math.js';

const DEG = Math.PI / 180;

function screenAngleRadians() {
  const angle = screen.orientation?.angle;
  if (Number.isFinite(angle)) return angle * DEG;
  if (Number.isFinite(window.orientation)) return Number(window.orientation) * DEG;
  return 0;
}

function deviceQuaternion(alpha, beta, gamma) {
  const euler = qFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  const cameraCorrection = qAxisAngle(1, 0, 0, -Math.PI / 2);
  const screenCorrection = qAxisAngle(0, 0, 1, -screenAngleRadians());
  return qNormalize(qMultiply(qMultiply(euler, cameraCorrection), screenCorrection));
}

export class HeadTrackingManager extends EventTarget {
  constructor() {
    super();
    this.current = quat();
    this.baseline = null;
    this.relative = quat();
    this.running = false;
    this.sampleCount = 0;
    this.source = 'none';
    this._onOrientation = this._onOrientation.bind(this);
  }

  async requestPermission() {
    const requests = [];
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      requests.push(DeviceMotionEvent.requestPermission());
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      requests.push(DeviceOrientationEvent.requestPermission());
    }
    const results = await Promise.all(requests);
    if (results.some((value) => value !== 'granted')) {
      throw new Error('Motion and orientation permission are required for head tracking.');
    }
  }

  start() {
    if (this.running) return;
    window.addEventListener('deviceorientation', this._onOrientation, { capture: true, passive: true });
    this.running = true;
    this.source = 'deviceorientation';
  }

  stop() {
    window.removeEventListener('deviceorientation', this._onOrientation, true);
    this.running = false;
  }

  recenter() {
    this.baseline = qClone(this.current);
    this.relative = quat();
    this.dispatchEvent(new CustomEvent('recenter'));
  }

  getOrientation() {
    return this.relative;
  }

  _onOrientation(event) {
    const alpha = Number.isFinite(event.alpha) ? event.alpha : 0;
    const beta = Number.isFinite(event.beta) ? event.beta : 0;
    const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
    this.current = deviceQuaternion(alpha, beta, gamma);
    if (!this.baseline) this.baseline = qClone(this.current);
    this.relative = qRelative(this.baseline, this.current);
    this.sampleCount += 1;
    this.dispatchEvent(new CustomEvent('pose', { detail: this.relative }));
  }
}
