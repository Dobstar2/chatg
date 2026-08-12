import { clamp } from './math.js';

const SNAP = {
  center: { x: 0, y: 0.02, z: -1.45 },
  left: { x: -0.62, y: 0.02, z: -1.55 },
  right: { x: 0.62, y: 0.02, z: -1.55 },
  above: { x: 0, y: 0.52, z: -1.65 },
  near: { x: 0, y: 0.02, z: -1.05 },
  far: { x: 0, y: 0.02, z: -2.15 },
};

export class WindowManager {
  constructor() {
    this.windows = new Map();
    this.focusedId = null;
    this.manipulation = null;
  }

  open(id, options = {}) {
    const existing = this.windows.get(id);
    const window = existing || {
      id,
      title: options.title || id,
      position: { ...(options.position || SNAP.center) },
      width: options.width || 0.92,
      height: options.height || 0.58,
      scale: 1,
      pinned: false,
      visible: true,
    };
    this.windows.set(id, window);
    this.focusedId = id;
    return window;
  }

  close(id) {
    this.windows.delete(id);
    if (this.focusedId === id) this.focusedId = [...this.windows.keys()].at(-1) || null;
  }

  focus(id) {
    if (!this.windows.has(id)) return false;
    this.focusedId = id;
    return true;
  }

  togglePin(id) {
    const window = this.windows.get(id);
    if (!window) return false;
    window.pinned = !window.pinned;
    return window.pinned;
  }

  snap(id, slot) {
    const window = this.windows.get(id);
    const position = SNAP[slot];
    if (!window || !position) return false;
    window.position = { ...position };
    return true;
  }

  beginMove(id) {
    if (!this.windows.has(id)) return false;
    this.manipulation = { type: 'move', id };
    return true;
  }

  beginResize(id, aimDirection = { y: 0 }) {
    const window = this.windows.get(id);
    if (!window) return false;
    this.manipulation = {
      type: 'resize',
      id,
      startScale: window.scale,
      startAimY: Number(aimDirection?.y) || 0,
    };
    return true;
  }

  updateManipulation({ aimDirection, resizeDelta = null } = {}) {
    if (!this.manipulation) return false;
    const window = this.windows.get(this.manipulation.id);
    if (!window) return false;
    if (this.manipulation.type === 'move' && aimDirection) {
      const depth = clamp(-window.position.z, 0.85, 2.4);
      const denom = Math.max(0.2, -aimDirection.z);
      window.position.x = clamp(aimDirection.x / denom * depth, -1.2, 1.2);
      window.position.y = clamp(aimDirection.y / denom * depth, -0.65, 0.8);
    } else if (this.manipulation.type === 'resize') {
      if (aimDirection) {
        const deltaY = (Number(aimDirection.y) || 0) - this.manipulation.startAimY;
        window.scale = clamp(this.manipulation.startScale + deltaY * 1.8, 0.65, 1.6);
      } else if (Number.isFinite(resizeDelta)) {
        window.scale = clamp(window.scale + resizeDelta, 0.65, 1.6);
      }
    }
    return true;
  }

  endManipulation() {
    const previous = this.manipulation;
    this.manipulation = null;
    return previous;
  }
}

export { SNAP as WINDOW_SNAP_POSITIONS };
