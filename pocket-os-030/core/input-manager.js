import { clamp } from './math.js';

export const INPUT_ACTIONS = Object.freeze({
  AIM: 'AIM',
  SELECT: 'SELECT',
  HOLD: 'HOLD',
  RELEASE: 'RELEASE',
  BACK: 'BACK',
  MENU: 'MENU',
  SECONDARY: 'SECONDARY',
  MOVE_X: 'MOVE_X',
  MOVE_Y: 'MOVE_Y',
  LOOK: 'LOOK',
});

function emit(target, type, detail) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export class PinchLatch {
  constructor({ holdMs = 620 } = {}) {
    this.holdMs = holdMs;
    this.active = false;
    this.startedAt = 0;
    this.holdSent = false;
    this.lastSerialBySide = { left: -1, right: -1 };
  }

  update(hands, now) {
    this.blocked ||= new Set();
    const valid = (side) => {
      const h = hands?.[side];
      return (
        h &&
        h.tracked !== false &&
        h.interactionSafe !== false &&
        (h.confidence === undefined || h.confidence >= 0.45)
      );
    };
    const phase = (side) => hands?.[side]?.gesture?.pinchPhase || 'open';
    const events = [];
    for (const side of ['left', 'right']) {
      if (!valid(side)) this.blocked.add(side);
      else if (phase(side) === 'open' || phase(side) === 'release') this.blocked.delete(side);
    }
    if (this.active) {
      if (!valid(this.owner) || !['held', 'start'].includes(phase(this.owner))) {
        events.push({ type: 'release', side: this.owner });
        this.active = false;
        this.owner = null;
        this.holdSent = false;
      } else if (!this.holdSent && now - this.startedAt >= this.holdMs) {
        this.holdSent = true;
        events.push({ type: 'hold', side: this.owner });
      }
      // A second hand cannot inherit the first hand's hold or release it.
      for (const side of ['left', 'right'])
        if (phase(side) === 'start') this.lastSerialBySide[side] = hands[side].gesture.pinchSerial;
      return events;
    }
    for (const side of ['left', 'right']) {
      const serial = hands?.[side]?.gesture?.pinchSerial ?? -1;
      if (
        valid(side) &&
        !this.blocked.has(side) &&
        phase(side) === 'start' &&
        serial !== this.lastSerialBySide[side]
      ) {
        this.lastSerialBySide[side] = serial;
        this.active = true;
        this.owner = side;
        this.startedAt = now;
        this.holdSent = false;
        events.push({ type: 'start', side });
        break;
      }
    }
    return events;
  }
}

export class InputManager extends EventTarget {
  constructor({ holdMs = 620, dwellMs = 1100 } = {}) {
    super();
    this.aim = null;
    this.selectionMethod = 'pinch';
    this.selectSource = 'pinch';
    this.aimSource = 'head';
    this.pinchLatch = new PinchLatch({ holdMs });
    this.pinchTarget = null;
    this.dwellEnabled = false;
    this.dwellMs = dwellMs;
    this.dwellTargetId = null;
    this.dwellSince = 0;
    this.dwellFired = false;
    this.lastSelectAt = 0;
    this.touchEnabled = true;
    this.gamepadIndex = null;
    this.previousGamepadButtons = [];
    this.keys = new Set();
  }

  setSelectionMethod(method) {
    const allowed = new Set(['pinch', 'touch', 'dwell', 'gamepad', 'experimental-hands']);
    this.selectionMethod = allowed.has(method) ? method : 'pinch';
    this.dwellEnabled = this.selectionMethod === 'dwell';
    this.selectSource = this.dwellEnabled ? 'dwell' : this.selectionMethod;
  }

  setHoldDuration(ms) {
    this.pinchLatch.holdMs = clamp(ms, 350, 1200);
  }

  setAim(aim, now = performance.now()) {
    const previousId = this.aim?.targetId || null;
    this.aim = aim || null;
    const nextId = this.aim?.targetId || null;
    if (previousId !== nextId) {
      this.dwellTargetId = nextId;
      this.dwellSince = now;
      this.dwellFired = false;
    }
    emit(this, INPUT_ACTIONS.AIM, { aim: this.aim, source: this.aimSource, now });
  }

  updateHands(hands, now = performance.now()) {
    const events = this.pinchLatch.update(hands, now);
    for (const event of events) {
      if (event.type === 'start') {
        // Capture the initial target so a held Move/Resize survives a gaze shift.
        this.pinchTarget = this.aim?.target || null;
        if (this.selectionMethod === 'pinch' || this.selectionMethod === 'experimental-hands') {
          this._select('pinch', event.side, now);
        }
      } else if (event.type === 'hold') {
        emit(this, INPUT_ACTIONS.HOLD, {
          target: this.pinchTarget,
          side: event.side,
          source: 'pinch',
          now,
        });
      } else if (event.type === 'release') {
        emit(this, INPUT_ACTIONS.RELEASE, { target: this.pinchTarget, source: 'pinch', now });
        this.pinchTarget = null;
      }
    }
  }

  update(now = performance.now()) {
    if (this.dwellEnabled && this.aim?.targetId) {
      if (!this.dwellFired && now - this.dwellSince >= this.dwellMs) {
        this.dwellFired = true;
        this._select('dwell', null, now);
      }
    }
    this._pollGamepad(now);
  }

  touchSelect(now = performance.now()) {
    if (!this.touchEnabled) return false;
    this._select('touch', null, now);
    return true;
  }

  keyboardDown(code, now = performance.now()) {
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (code === 'Enter' || code === 'Space') this._select('keyboard', null, now);
    if (code === 'Escape') emit(this, INPUT_ACTIONS.BACK, { source: 'keyboard', now });
    if (code === 'KeyM') emit(this, INPUT_ACTIONS.MENU, { source: 'keyboard', now });
  }

  cancel() {
    if (this.pinchLatch.active)
      emit(this, INPUT_ACTIONS.RELEASE, { target: this.pinchTarget, source: 'cancel' });
    this.pinchLatch.active = false;
    this.pinchLatch.blocked = new Set(['left', 'right']);
    this.pinchTarget = null;
    this.setAim(null);
    this.keys.clear();
  }

  keyboardUp(code) {
    this.keys.delete(code);
  }

  _select(source, side, now) {
    if (!this.aim?.target || this.aim.target.disabled || this.aim.target.visible === false) return;
    if (now - this.lastSelectAt < 90) return;
    this.lastSelectAt = now;
    emit(this, INPUT_ACTIONS.SELECT, {
      target: this.aim?.target || null,
      targetId: this.aim?.targetId || null,
      source,
      side,
      now,
    });
  }

  _pollGamepad(now) {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    const pad = [...pads].find(Boolean);
    if (!pad) return;
    this.gamepadIndex = pad.index;
    const current = pad.buttons.map((button) => Boolean(button.pressed));
    const prev = this.previousGamepadButtons;
    if (current[0] && !prev[0]) this._select('gamepad', null, now);
    if (current[1] && !prev[1]) emit(this, INPUT_ACTIONS.BACK, { source: 'gamepad', now });
    if (current[9] && !prev[9]) emit(this, INPUT_ACTIONS.MENU, { source: 'gamepad', now });
    const x = Math.abs(pad.axes[0] || 0) > 0.15 ? pad.axes[0] : 0;
    const y = Math.abs(pad.axes[1] || 0) > 0.15 ? pad.axes[1] : 0;
    if (x) emit(this, INPUT_ACTIONS.MOVE_X, { value: x, source: 'gamepad', now });
    if (y) emit(this, INPUT_ACTIONS.MOVE_Y, { value: y, source: 'gamepad', now });
    this.previousGamepadButtons = current;
  }
}
