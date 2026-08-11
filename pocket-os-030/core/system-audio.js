export class SystemAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.volume = 0.14;
    this.lastTargetToneAt = 0;
  }

  async unlock() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    if (!this.context) this.context = new AudioContextClass();
    await this.context.resume().catch(() => {});
    return this.context.state === 'running';
  }

  setEnabled(enabled) { this.enabled = Boolean(enabled); }
  setVolume(volume) { this.volume = Math.max(0, Math.min(0.35, Number(volume) || 0)); }

  target(now = performance.now()) {
    if (now - this.lastTargetToneAt < 100) return;
    this.lastTargetToneAt = now;
    this.tone(520, 0.018, 0.45);
  }

  select() { this.tone(760, 0.045, 0.85); }
  open() { this.tone(610, 0.055, 0.6); }
  back() { this.tone(360, 0.045, 0.55); }
  notify() { this.tone(880, 0.035, 0.5); }

  tone(frequency, duration, gainScale = 1) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.volume * gainScale), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.015);
  }
}
