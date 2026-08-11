import { clamp } from './math.js';

export class PerformanceManager extends EventTarget {
  constructor() {
    super();
    this.mode = 'balanced';
    this.frameTimes = [];
    this.fps = 60;
    this.lowSince = 0;
    this.highSince = 0;
    this.quality = {
      dprCap: 1.35,
      particles: 1,
      glass: 1,
      secondaryWindows: true,
    };
  }

  setMode(mode) {
    if (!['quality', 'balanced', 'performance'].includes(mode)) return this.mode;
    this.mode = mode;
    this._applyMode();
    this.dispatchEvent(new CustomEvent('change', { detail: { mode, quality: { ...this.quality } } }));
    return this.mode;
  }

  cycleMode() {
    const order = ['quality', 'balanced', 'performance'];
    return this.setMode(order[(order.indexOf(this.mode) + 1) % order.length]);
  }

  frame(now = performance.now()) {
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    this.fps = Math.max(0, this.frameTimes.length - 1);

    if (this.fps > 0 && this.fps < 42) {
      if (!this.lowSince) this.lowSince = now;
      this.highSince = 0;
    } else if (this.fps > 54) {
      if (!this.highSince) this.highSince = now;
      this.lowSince = 0;
    } else {
      this.lowSince = 0;
      this.highSince = 0;
    }

    if (this.mode !== 'performance' && this.lowSince && now - this.lowSince > 2200) {
      this.setMode(this.mode === 'quality' ? 'balanced' : 'performance');
      this.lowSince = 0;
    }
    return this.fps;
  }

  dpr(devicePixelRatio = 1) {
    return clamp(devicePixelRatio, 1, this.quality.dprCap);
  }

  _applyMode() {
    if (this.mode === 'quality') {
      this.quality = { dprCap: 1.8, particles: 1.25, glass: 1, secondaryWindows: true };
    } else if (this.mode === 'performance') {
      this.quality = { dprCap: 1, particles: 0.48, glass: 0.45, secondaryWindows: false };
    } else {
      this.quality = { dprCap: 1.35, particles: 0.8, glass: 0.75, secondaryWindows: true };
    }
  }
}
