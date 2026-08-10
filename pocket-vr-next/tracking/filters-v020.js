import { clamp } from '../core/math.js';

function smoothingAlpha(cutoffHz, dtSeconds) {
  const cutoff = Math.max(0.001, cutoffHz);
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / Math.max(0.001, dtSeconds));
}

export class OneEuroScalar {
  constructor({ minCutoff = 1.3, beta = 0.35, derivativeCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.initialized = false;
    this.raw = 0;
    this.value = 0;
    this.derivative = 0;
    this.timeMs = 0;
  }

  reset(value = 0, timeMs = performance.now()) {
    this.initialized = true;
    this.raw = value;
    this.value = value;
    this.derivative = 0;
    this.timeMs = timeMs;
    return value;
  }

  filter(value, timeMs, confidence = 1) {
    if (!Number.isFinite(value)) return this.value;
    if (!this.initialized) return this.reset(value, timeMs);

    const dt = clamp((timeMs - this.timeMs) / 1000, 1 / 240, 0.12);
    const rawDerivative = (value - this.raw) / dt;
    const derivativeAlpha = smoothingAlpha(this.derivativeCutoff, dt);
    this.derivative += (rawDerivative - this.derivative) * derivativeAlpha;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    let alpha = smoothingAlpha(cutoff, dt);
    // Poor observations should influence the reliable pose less, without adding
    // latency when confidence is high.
    alpha *= 0.22 + 0.78 * clamp(confidence, 0, 1);
    alpha = clamp(alpha, 0.035, 0.98);

    this.value += (value - this.value) * alpha;
    this.raw = value;
    this.timeMs = timeMs;
    return this.value;
  }
}

export class AdaptiveVec3Filter {
  constructor({
    xy = { minCutoff: 1.5, beta: 0.42, derivativeCutoff: 1.0 },
    z = { minCutoff: 0.9, beta: 0.22, derivativeCutoff: 0.8 },
  } = {}) {
    this.x = new OneEuroScalar(xy);
    this.y = new OneEuroScalar(xy);
    this.z = new OneEuroScalar(z);
  }

  reset(value, timeMs = performance.now()) {
    return {
      x: this.x.reset(value.x, timeMs),
      y: this.y.reset(value.y, timeMs),
      z: this.z.reset(value.z, timeMs),
    };
  }

  filter(value, timeMs, confidence = 1) {
    return {
      x: this.x.filter(value.x, timeMs, confidence),
      y: this.y.filter(value.y, timeMs, confidence),
      z: this.z.filter(value.z, timeMs, confidence),
    };
  }
}

export class RobustDepthFilter {
  constructor() {
    this.filterCore = new OneEuroScalar({ minCutoff: 0.72, beta: 0.18, derivativeCutoff: 0.65 });
    this.lastRaw = 0.55;
    this.lastTime = 0;
  }

  reset(value, timeMs = performance.now()) {
    this.lastRaw = value;
    this.lastTime = timeMs;
    return this.filterCore.reset(value, timeMs);
  }

  filter(value, timeMs, confidence = 1) {
    if (!this.lastTime) return this.reset(value, timeMs);
    const dt = clamp((timeMs - this.lastTime) / 1000, 1 / 240, 0.12);
    // Reject single-frame monocular depth spikes. The allowed range grows with
    // elapsed time and remains large enough for intentional fast hand motion.
    const maxStep = 0.035 + 2.5 * dt;
    const bounded = clamp(value, this.lastRaw - maxStep, this.lastRaw + maxStep);
    this.lastRaw = bounded;
    this.lastTime = timeMs;
    return this.filterCore.filter(bounded, timeMs, confidence);
  }
}

export class VelocityEstimator {
  constructor({ windowSize = 5, maxSpeed = 3.0 } = {}) {
    this.windowSize = windowSize;
    this.maxSpeed = maxSpeed;
    this.samples = [];
  }

  reset() {
    this.samples.length = 0;
  }

  push(position, timeMs) {
    this.samples.push({ position: { ...position }, timeMs });
    while (this.samples.length > this.windowSize) this.samples.shift();
    return this.getVelocity();
  }

  getVelocity() {
    if (this.samples.length < 2) return { x: 0, y: 0, z: 0 };
    const newest = this.samples[this.samples.length - 1];
    // Use a short multi-frame baseline to reduce throw spikes from one bad frame.
    const oldest = this.samples[Math.max(0, this.samples.length - 4)];
    const dt = Math.max(0.016, (newest.timeMs - oldest.timeMs) / 1000);
    let velocity = {
      x: (newest.position.x - oldest.position.x) / dt,
      y: (newest.position.y - oldest.position.y) / dt,
      z: (newest.position.z - oldest.position.z) / dt,
    };
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed > this.maxSpeed && speed > 0) {
      const scale = this.maxSpeed / speed;
      velocity = { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale };
    }
    return velocity;
  }
}

export function median(values) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return NaN;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}
