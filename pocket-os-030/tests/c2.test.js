import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail;
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const { PreferenceStore, DEFAULT_PREFERENCES, sanitizePreferences } = await import('../core/preferences.js');
const { filterLibraryApps, appMatchesSearch } = await import('../core/library-search.js');
const { WindowManager } = await import('../core/window-manager.js');
const { APP_MANIFESTS } = await import('../apps/catalog.js');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

test('preference sanitizer rejects unsupported control modes and environments', () => {
  const safe = sanitizePreferences({ selectionMethod: 'magic-hands', environment: 'fake-room' });
  assert.equal(safe.selectionMethod, DEFAULT_PREFERENCES.selectionMethod);
  assert.equal(safe.environment, DEFAULT_PREFERENCES.environment);
});

test('preference sanitizer clamps tuning values', () => {
  const safe = sanitizePreferences({ assist: 99, stickinessMs: -4, holdMs: 9999, worldBrightness: 5 });
  assert.equal(safe.assist, 1.4);
  assert.equal(safe.stickinessMs, 60);
  assert.equal(safe.holdMs, 1200);
  assert.equal(safe.worldBrightness, 1.15);
});

test('PreferenceStore persists only the sanitized Pocket settings object', () => {
  const storage = new MemoryStorage();
  const store = new PreferenceStore(storage);
  const saved = store.save({ ...DEFAULT_PREFERENCES, selectionMethod: 'touch', highContrast: true, holdMs: 800, unknownSecret: 'nope' });
  assert.equal(saved.selectionMethod, 'touch');
  assert.equal(saved.highContrast, true);
  const loaded = store.load();
  assert.equal(loaded.holdMs, 800);
  assert.equal(Object.hasOwn(loaded, 'unknownSecret'), false);
});

test('Library search matches app name, id and category text', () => {
  const cinema = APP_MANIFESTS.find((app) => app.id === 'cinema');
  assert.equal(appMatchesSearch(cinema, 'cinema'), true);
  assert.equal(appMatchesSearch(cinema, 'featured'), true);
  assert.equal(appMatchesSearch(cinema, 'planet'), false);
});

test('Library Recent filter follows actual recents instead of category', () => {
  const result = filterLibraryApps(APP_MANIFESTS, { filter: 'Recent', recents: ['clock', 'cinema'] });
  assert.deepEqual(result.map((app) => app.id).sort(), ['cinema', 'clock']);
});

test('Library Favourites filter follows favourite app set', () => {
  const result = filterLibraryApps(APP_MANIFESTS, { filter: 'Favourites', favourites: new Set(['portal', 'focus']) });
  assert.deepEqual(result.map((app) => app.id).sort(), ['focus', 'portal']);
});

test('Library text search combines with category filter', () => {
  const result = filterLibraryApps(APP_MANIFESTS, { filter: 'Utility', query: 'focus' });
  assert.deepEqual(result.map((app) => app.id), ['focus']);
});

test('window resize uses hold-start head direction as an absolute baseline', () => {
  const windows = new WindowManager();
  windows.open('clock');
  assert.equal(windows.beginResize('clock', { y: 0.1 }), true);
  windows.updateManipulation({ aimDirection: { x: 0, y: 0.3, z: -1 } });
  const first = windows.windows.get('clock').scale;
  windows.updateManipulation({ aimDirection: { x: 0, y: 0.3, z: -1 } });
  assert.equal(windows.windows.get('clock').scale, first, 'holding the same head pose must not accumulate resize every frame');
  assert.ok(first > 1);
});

test('window resize remains clamped during extreme head motion', () => {
  const windows = new WindowManager();
  windows.open('clock');
  windows.beginResize('clock', { y: 0 });
  windows.updateManipulation({ aimDirection: { x: 0, y: 10, z: -1 } });
  assert.equal(windows.windows.get('clock').scale, 1.6);
});

test('window pin toggles without changing placement', () => {
  const windows = new WindowManager();
  const window = windows.open('clock');
  const position = { ...window.position };
  assert.equal(windows.togglePin('clock'), true);
  assert.deepEqual(windows.windows.get('clock').position, position);
  assert.equal(windows.togglePin('clock'), false);
});

test('C2 adds Focus and Environments without changing the eight flagship list contract', async () => {
  const { FEATURED_APPS } = await import('../apps/catalog.js');
  assert.ok(APP_MANIFESTS.some((app) => app.id === 'focus'));
  assert.ok(APP_MANIFESTS.some((app) => app.id === 'environments'));
  assert.equal(FEATURED_APPS.length, 8);
});

test('C2 visible version and authoritative BUILD_SHORT match', () => {
  const version = fs.readFileSync(path.join(root, 'core/version.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const match = version.match(/BUILD_SHORT\s*=\s*'([^']+)'/);
  assert.ok(match);
  assert.equal(match[1], 'POCKET OS 0.3 C2');
  assert.ok(html.includes(match[1]));
});

test('stable app entry routes to C2 implementation', () => {
  const entry = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(entry.includes("./app-c2.js"));
});

test('C2 entry and runtime do not register a service worker', () => {
  const files = ['index.html', 'app.js', 'app-c2.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.equal(/serviceWorker\s*\.\s*register|navigator\.serviceWorker\.register/.test(files), false);
});

test('C2 includes a trusted native Library search input instead of a spatial keyboard', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('id="searchInput"'));
  assert.ok(html.includes('type="search"'));
  assert.ok(html.includes('enterkeyhint="search"'));
});
