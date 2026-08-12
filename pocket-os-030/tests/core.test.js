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

const { qFromYawPitch } = await import('../core/math.js');
const { HeadAimController } = await import('../core/head-aim.js');
const { InputManager, PinchLatch, INPUT_ACTIONS } = await import('../core/input-manager.js');
const { AppManager } = await import('../core/app-manager.js');
const { WindowManager } = await import('../core/window-manager.js');
const { sourceRectForEye, displayAspect, cycleCinemaFormat } = await import('../core/media.js');
const { APP_MANIFESTS, FEATURED_APPS, DOCK_APPS } = await import('../apps/catalog.js');

const identity = qFromYawPitch(0, 0);
const target = (id, x = 0, y = 0, z = -1.4, extra = {}) => ({
  id,
  label: id,
  position: { x, y, z },
  angularRadius: 0.045,
  ...extra,
});

const hands = ({ left = 'open', right = 'open', leftSerial = -1, rightSerial = -1 } = {}) => ({
  left: { tracked: left !== 'lost', gesture: { pinchPhase: left === 'lost' ? 'open' : left, pinchSerial: leftSerial } },
  right: { tracked: right !== 'lost', gesture: { pinchPhase: right === 'lost' ? 'open' : right, pinchSerial: rightSerial } },
});

test('head aim selects a target centered in view', () => {
  const aim = new HeadAimController();
  const result = aim.update(identity, [target('center')], 100);
  assert.equal(result.targetId, 'center');
});

test('head aim ignores disabled targets', () => {
  const aim = new HeadAimController();
  const result = aim.update(identity, [target('disabled', 0, 0, -1.4, { disabled: true })], 100);
  assert.equal(result.targetId, null);
});

test('head aim rejects targets well outside the assistance cone', () => {
  const aim = new HeadAimController({ maxAngleDeg: 8 });
  const result = aim.update(identity, [target('far-side', 1.1, 0, -1.1)], 100);
  assert.equal(result.targetId, null);
});

test('head aim priority can break a close angular tie', () => {
  const aim = new HeadAimController();
  const result = aim.update(identity, [
    target('near-center', 0.018, 0, -1.4),
    target('priority', 0.035, 0, -1.4, { priority: 4 }),
  ], 100);
  assert.equal(result.targetId, 'priority');
});

test('head aim target stickiness resists tiny neighbour jitter', () => {
  const aim = new HeadAimController({ stickinessMs: 240 });
  assert.equal(aim.update(identity, [target('a', 0.01), target('b', 0.06)], 100).targetId, 'a');
  const second = aim.update(identity, [target('a', 0.05), target('b', 0.045)], 180);
  assert.equal(second.targetId, 'a');
});

test('pinch start emits exactly one select', () => {
  const input = new InputManager();
  input.setAim({ targetId: 'x', target: target('x') }, 50);
  let selects = 0;
  input.addEventListener(INPUT_ACTIONS.SELECT, () => { selects += 1; });
  input.updateHands(hands({ left: 'start', leftSerial: 1 }), 100);
  input.updateHands(hands({ left: 'held', leftSerial: 1 }), 130);
  input.updateHands(hands({ left: 'held', leftSerial: 1 }), 260);
  assert.equal(selects, 1);
});

test('right-hand-only pinch selects', () => {
  const input = new InputManager();
  input.setAim({ targetId: 'x', target: target('x') }, 50);
  let sourceSide = null;
  input.addEventListener(INPUT_ACTIONS.SELECT, (event) => { sourceSide = event.detail.side; });
  input.updateHands(hands({ right: 'start', rightSerial: 4 }), 200);
  assert.equal(sourceSide, 'right');
});

test('pinch hold emits once after configured duration', () => {
  const input = new InputManager({ holdMs: 500 });
  input.setAim({ targetId: 'x', target: target('x') }, 10);
  let holds = 0;
  input.addEventListener(INPUT_ACTIONS.HOLD, () => { holds += 1; });
  input.updateHands(hands({ left: 'start', leftSerial: 2 }), 100);
  input.updateHands(hands({ left: 'held', leftSerial: 2 }), 450);
  input.updateHands(hands({ left: 'held', leftSerial: 2 }), 620);
  input.updateHands(hands({ left: 'held', leftSerial: 2 }), 900);
  assert.equal(holds, 1);
});

test('pinch release emits when the held hand disappears', () => {
  const latch = new PinchLatch({ holdMs: 500 });
  latch.update(hands({ left: 'start', leftSerial: 1 }), 100);
  const events = latch.update(hands({ left: 'lost', leftSerial: 1 }), 160);
  assert.ok(events.some((event) => event.type === 'release'));
});

test('touch confirmation activates the current head target', () => {
  const input = new InputManager();
  input.setAim({ targetId: 'touch-me', target: target('touch-me') }, 20);
  let detail = null;
  input.addEventListener(INPUT_ACTIONS.SELECT, (event) => { detail = event.detail; });
  input.touchSelect(200);
  assert.equal(detail.targetId, 'touch-me');
  assert.equal(detail.source, 'touch');
});

test('dwell mode selects only after dwell threshold', () => {
  const input = new InputManager({ dwellMs: 500 });
  input.setSelectionMethod('dwell');
  input.setAim({ targetId: 'dwell', target: target('dwell') }, 100);
  let selects = 0;
  input.addEventListener(INPUT_ACTIONS.SELECT, () => { selects += 1; });
  input.update(450);
  assert.equal(selects, 0);
  input.update(650);
  assert.equal(selects, 1);
  input.update(900);
  assert.equal(selects, 1);
});

test('keyboard Enter maps to standard SELECT', () => {
  const input = new InputManager();
  input.setAim({ targetId: 'keyboard', target: target('keyboard') }, 10);
  let source = null;
  input.addEventListener(INPUT_ACTIONS.SELECT, (event) => { source = event.detail.source; });
  input.keyboardDown('Enter', 200);
  assert.equal(source, 'keyboard');
});

test('AppManager launches apps and records recents', () => {
  const apps = new AppManager(APP_MANIFESTS);
  assert.equal(apps.launch('cinema', 100), true);
  assert.equal(apps.activeAppId, 'cinema');
  assert.equal(apps.recents[0], 'cinema');
});

test('system overlays do not consume multitasking slots', () => {
  const apps = new AppManager(APP_MANIFESTS);
  apps.launch('cinema', 100);
  apps.launch('quick-settings', 150);
  assert.deepEqual(apps.running, ['home', 'cinema']);
  assert.equal(apps.activeAppId, 'quick-settings');
});

test('back from a system overlay restores previous running app', () => {
  const apps = new AppManager(APP_MANIFESTS);
  apps.launch('cinema', 100);
  apps.launch('quick-settings', 150);
  apps.back(200);
  assert.equal(apps.activeAppId, 'cinema');
});

test('AppManager caps expensive simultaneous apps', () => {
  const apps = new AppManager(APP_MANIFESTS);
  apps.launch('cinema', 100);
  apps.launch('gallery', 200);
  apps.launch('clock', 300);
  assert.equal(apps.running.length, 3);
  assert.ok(apps.running.includes('home'));
  assert.ok(apps.running.includes('gallery'));
  assert.ok(apps.running.includes('clock'));
});

test('WindowManager supports gaze-friendly snap positions', () => {
  const windows = new WindowManager();
  windows.open('settings');
  assert.equal(windows.snap('settings', 'left'), true);
  assert.ok(windows.windows.get('settings').position.x < 0);
});

test('WindowManager move mode follows aim direction with bounds', () => {
  const windows = new WindowManager();
  windows.open('settings');
  windows.beginMove('settings');
  windows.updateManipulation({ aimDirection: { x: 4, y: 3, z: -0.2 } });
  const p = windows.windows.get('settings').position;
  assert.ok(p.x <= 1.2 && p.x >= -1.2);
  assert.ok(p.y <= 0.8 && p.y >= -0.65);
});

test('WindowManager resize mode clamps scale', () => {
  const windows = new WindowManager();
  windows.open('settings');
  windows.beginResize('settings');
  windows.updateManipulation({ resizeDelta: 10 });
  assert.equal(windows.windows.get('settings').scale, 1.6);
});

test('2D cinema sends the full source frame to both eyes', () => {
  assert.deepEqual(sourceRectForEye(1920, 1080, '2d', 0), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
  assert.deepEqual(sourceRectForEye(1920, 1080, '2d', 1), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
});

test('SBS-LR maps left source half to left eye and right half to right eye', () => {
  assert.deepEqual(sourceRectForEye(3840, 1080, 'sbs-lr', 0), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
  assert.deepEqual(sourceRectForEye(3840, 1080, 'sbs-lr', 1), { sx: 1920, sy: 0, sw: 1920, sh: 1080 });
});

test('SBS-RL reverses source-eye assignment', () => {
  assert.equal(sourceRectForEye(3840, 1080, 'sbs-rl', 0).sx, 1920);
  assert.equal(sourceRectForEye(3840, 1080, 'sbs-rl', 1).sx, 0);
});

test('SBS display aspect is based on one eye image', () => {
  assert.ok(Math.abs(displayAspect(3840, 1080, 'sbs-lr') - (16 / 9)) < 0.001);
});

test('cinema format cycle exposes 2D, SBS-LR and SBS-RL', () => {
  assert.equal(cycleCinemaFormat('2d'), 'sbs-lr');
  assert.equal(cycleCinemaFormat('sbs-lr'), 'sbs-rl');
  assert.equal(cycleCinemaFormat('sbs-rl'), '2d');
});

test('flagship catalogue contains the eight requested first-party experiences', () => {
  assert.equal(FEATURED_APPS.length, 8);
  for (const id of ['planetarium', 'cinema', 'portal', 'hologram', 'arcade', 'music', 'passthrough', 'mini-worlds']) {
    assert.ok(FEATURED_APPS.includes(id));
  }
});

test('dock keeps primary system destinations compact', () => {
  assert.ok(DOCK_APPS.length <= 6);
  for (const id of ['home', 'library', 'cinema', 'settings']) assert.ok(DOCK_APPS.includes(id));
});

test('visible build label matches authoritative version module', () => {
  const version = fs.readFileSync(path.join(root, 'core/version.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const match = version.match(/BUILD_SHORT\s*=\s*'([^']+)'/);
  assert.ok(match);
  assert.ok(html.includes(match[1]));
});

test('candidate entry never registers a service worker', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.equal(/serviceWorker\s*\.\s*register|navigator\.serviceWorker\.register/.test(`${html}\n${app}`), false);
});

test('candidate entry uses GitHub Pages-safe relative asset paths', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('src="./app.js'));
  assert.ok(html.includes('href="./styles.css'));
  assert.equal(/(?:src|href)="\/(?!\/)/.test(html), false);
});
