import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (!globalThis.CustomEvent) globalThis.CustomEvent = class CustomEvent extends Event {
  constructor(type, options = {}) { super(type); this.detail = options.detail; }
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { InputManager, INPUT_ACTIONS } = await import('../core/input-manager.js');
const { advanceFocusTimer } = await import('../core/focus-timer.js');
const hand = (phase, serial) => ({ gesture: { pinchPhase: phase, pinchSerial: serial } });

test('pinch hold remains attached to the target at pinch-down', () => {
  const input = new InputManager({ holdMs: 350 });
  const original = { id: 'window:move:clock' };
  input.setAim({ targetId: original.id, target: original }, 10);
  let held = null;
  input.addEventListener(INPUT_ACTIONS.HOLD, event => { held = event.detail.target; });
  input.updateHands({ left: hand('start', 1) }, 100);
  input.setAim({ targetId: 'app:library', target: { id: 'app:library' } }, 140);
  input.updateHands({ left: hand('held', 1) }, 480);
  assert.equal(held, original);
  input.updateHands({ left: hand('open', 1) }, 510);
  assert.equal(input.pinchTarget, null);
});

test('Focus counts real time when iOS throttles animation', () => {
  const focus = { running: true, remainingMs: 10000, lastTickAt: 100 };
  assert.equal(advanceFocusTimer(focus, 5100), false);
  assert.equal(focus.remainingMs, 5000);
  assert.equal(advanceFocusTimer(focus, 12100), true);
  assert.equal(focus.remainingMs, 0);
  assert.equal(focus.running, false);
  assert.equal(advanceFocusTimer(focus, 15000), false);
});

test('paused focus does not count elapsed time', () => {
  const focus = { running: false, remainingMs: 12000, lastTickAt: 100 };
  advanceFocusTimer(focus, 5000);
  focus.running = true;
  assert.equal(advanceFocusTimer(focus, 6000), false);
  assert.equal(focus.remainingMs, 11000);
});

test('C2 integrates current icon patch and synchronous native search focus', () => {
  const app = fs.readFileSync(path.join(root, 'app-c2.js'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(app.includes("import './scene/renderer-icon-patch-init.js'"));
  assert.match(app, /_showLibrarySearch\(\) \{[\s\S]*?this\.elements\.searchInput\.focus\(\);/);
  assert.ok(!app.includes('requestAnimationFrame(() => this.elements.searchInput.focus())'));
  assert.ok(entry.includes('./app-c2.js'));
});

test('C2 import specifiers resolve to repo files', () => {
  const source = fs.readFileSync(path.join(root, 'app-c2.js'), 'utf8');
  const imports = [...source.matchAll(/\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([.][^'"]+)['"]/g)];
  assert.ok(imports.length > 5);
  for (const [, specifier] of imports) {
    const resolved = path.resolve(root, specifier.split('?')[0]);
    assert.ok(fs.existsSync(resolved), 'missing browser module ' + specifier);
  }
});
