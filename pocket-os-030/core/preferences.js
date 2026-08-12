const STORAGE_KEY = 'pocket-vr-os030-preferences-v2';

export const DEFAULT_PREFERENCES = Object.freeze({
  selectionMethod: 'pinch',
  dwell: false,
  assist: 0.85,
  stickinessMs: 180,
  holdMs: 620,
  experimentalHands: false,
  uiSound: true,
  environment: 'glass',
  worldBrightness: 1,
  reduceMotion: false,
  reduceTransparency: false,
  highContrast: false,
});

function clamp(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

export function sanitizePreferences(value = {}) {
  const allowedSelection = new Set(['pinch', 'touch', 'dwell']);
  const allowedEnvironment = new Set(['glass', 'dark', 'space', 'ocean', 'void', 'minimal']);
  return {
    selectionMethod: allowedSelection.has(value.selectionMethod) ? value.selectionMethod : DEFAULT_PREFERENCES.selectionMethod,
    dwell: Boolean(value.dwell),
    assist: clamp(value.assist ?? DEFAULT_PREFERENCES.assist, 0.25, 1.4),
    stickinessMs: clamp(value.stickinessMs ?? DEFAULT_PREFERENCES.stickinessMs, 60, 480),
    holdMs: clamp(value.holdMs ?? DEFAULT_PREFERENCES.holdMs, 350, 1200),
    experimentalHands: Boolean(value.experimentalHands),
    uiSound: value.uiSound !== false,
    environment: allowedEnvironment.has(value.environment) ? value.environment : DEFAULT_PREFERENCES.environment,
    worldBrightness: clamp(value.worldBrightness ?? DEFAULT_PREFERENCES.worldBrightness, 0.45, 1.15),
    reduceMotion: Boolean(value.reduceMotion),
    reduceTransparency: Boolean(value.reduceTransparency),
    highContrast: Boolean(value.highContrast),
  };
}

export class PreferenceStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  load() {
    try {
      const raw = this.storage?.getItem?.(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PREFERENCES };
      return sanitizePreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
    } catch (_) {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  save(value) {
    const safe = sanitizePreferences(value);
    try { this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}
    return safe;
  }

  clear() {
    try { this.storage?.removeItem?.(STORAGE_KEY); } catch (_) {}
  }
}

export { STORAGE_KEY as PREFERENCE_STORAGE_KEY };
