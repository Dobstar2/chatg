import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadAimController } from '../core/head-aim.js';
import { PinchLatch, InputManager } from '../core/input-manager.js';
import { PreferenceStore, sanitizePreferences } from '../core/preferences.js';
import { AppManager } from '../core/app-manager.js';
import { WindowManager } from '../core/window-manager.js';
import { CameraCoordinator } from '../core/camera-coordinator.js';
import { filterLibraryApps } from '../core/library-search.js';
import { qFromYawPitch } from '../core/math.js';
import { APP_MANIFESTS } from '../apps/catalog.js';
import { createLayout } from '../scene/layout.js';
const hand = (phase, serial = 1, extra = {}) => ({
  tracked: true,
  interactionSafe: true,
  confidence: 0.9,
  gesture: { pinchPhase: phase, pinchSerial: serial },
  ...extra,
});

test('removed, invisible and disabled targets are immediately unselectable', () => {
  const aim = new HeadAimController();
  const q = qFromYawPitch(0, 0);
  const t = { id: 'old', position: { x: 0, y: 0, z: -1 } };
  assert.equal(aim.update(q, [t], 100).targetId, 'old');
  assert.equal(aim.update(q, [], 101).targetId, null);
  assert.equal(aim.update(q, [{ ...t, disabled: true }], 102).targetId, null);
  assert.equal(aim.update(q, [{ ...t, visible: false }], 103).targetId, null);
  assert.equal(aim.update(q, [{ ...t, occluded: true }], 104).targetId, null);
});
test('confidence and interaction safety reject unsafe pinch starts', () => {
  for (const extra of [{ tracked: false }, { interactionSafe: false }, { confidence: 0.1 }])
    assert.deepEqual(new PinchLatch().update({ left: hand('start', 1, extra) }, 100), []);
});
test('another hand cannot release or duplicate the controlling hold', () => {
  const latch = new PinchLatch({ holdMs: 350 });
  assert.equal(latch.update({ left: hand('start'), right: hand('open') }, 100)[0].side, 'left');
  assert.deepEqual(latch.update({ left: hand('held'), right: hand('start', 2) }, 150), []);
  assert.equal(
    latch.update({ left: hand('held'), right: hand('release', 3) }, 460)[0].type,
    'hold',
  );
  assert.equal(latch.active, true);
  assert.equal(
    latch.update(
      { left: hand('held', 1, { interactionSafe: false }), right: hand('held', 2) },
      480,
    )[0].type,
    'release',
  );
  assert.equal(latch.active, false);
  assert.deepEqual(latch.update({ right: hand('held', 2) }, 490), []);
});
test('loss and reacquisition require an open hand before another start', () => {
  const latch = new PinchLatch();
  latch.update({ left: hand('start') }, 100);
  latch.update({}, 120);
  assert.deepEqual(latch.update({ left: hand('start', 2) }, 130), []);
  latch.update({ left: hand('open', 3) }, 140);
  assert.equal(latch.update({ left: hand('start', 4) }, 150)[0].type, 'start');
});
test('dwell cancels on target change and fires only once until gaze leaves', () => {
  const input = new InputManager({ dwellMs: 200 });
  input.setSelectionMethod('dwell');
  let selects = [];
  input.addEventListener('SELECT', (e) => selects.push(e.detail.targetId));
  const aim = (id) => ({ targetId: id, target: { id } });
  input.setAim(aim('a'), 100);
  input.update(250);
  input.setAim(aim('b'), 260);
  input.update(400);
  assert.equal(selects.length, 0);
  input.update(500);
  input.update(900);
  assert.deepEqual(selects, ['b']);
  input.setAim(null, 910);
  input.update(1200);
  assert.equal(selects.length, 1);
});
test('storage getter failure and null JSON are nonfatal', () => {
  assert.equal(sanitizePreferences(null).viewScale, 1);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('private mode');
      },
    });
    assert.equal(new PreferenceStore().load().assist, 0.85);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
  const store = new PreferenceStore({
    getItem() {
      return 'null';
    },
    setItem() {
      throw Error();
    },
  });
  assert.equal(store.load().selectionMethod, 'pinch');
  store.save({});
});
test('recent library entries use actual focus order', () => {
  const apps = new AppManager(APP_MANIFESTS);
  apps.launch('clock');
  apps.launch('cinema');
  apps.focus('clock');
  assert.deepEqual(
    filterLibraryApps(APP_MANIFESTS, { filter: 'Recent', recents: apps.recents }).map((a) => a.id),
    ['clock', 'cinema'],
  );
});
test('pinned windows cannot resize, close releases manipulation', () => {
  const w = new WindowManager();
  w.open('clock');
  w.togglePin('clock');
  assert.equal(w.beginResize('clock'), false);
  w.togglePin('clock');
  w.beginResize('clock');
  w.close('clock');
  assert.equal(w.manipulation, null);
});
test('camera cancellation stops late streams before attaching hardware', async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let resolve,
    stops = 0;
  const video = {
    srcObject: null,
    play: async () => {
      throw Error('must not play');
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise((r) => (resolve = r)) } },
  });
  try {
    const camera = new CameraCoordinator(video, { timeoutMs: 100 });
    const pending = camera.startTracking();
    camera.stop();
    resolve({
      getTracks: () => [
        {
          stop() {
            stops++;
          },
        },
      ],
    });
    await assert.rejects(pending, /cancelled/);
    assert.equal(stops, 1);
    assert.equal(video.srcObject, null);
    assert.equal(camera.state, 'NONE');
  } finally {
    Object.defineProperty(globalThis, 'navigator', old);
  }
});
test('ignored camera prompt has a deadline and late result is disposed', async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let resolve,
    stops = 0;
  const video = { srcObject: null };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise((r) => (resolve = r)) } },
  });
  try {
    const camera = new CameraCoordinator(video, { timeoutMs: 10 });
    await assert.rejects(camera.startTracking(), /waiting/);
    resolve({
      getTracks: () => [
        {
          stop() {
            stops++;
          },
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(stops, 1);
    assert.equal(video.srcObject, null);
  } finally {
    Object.defineProperty(globalThis, 'navigator', old);
  }
});
function state(app = 'library') {
  const appManager = new AppManager(APP_MANIFESTS);
  appManager.launch(app);
  return {
    appManager,
    apps: { library: { filter: 'All', query: '', page: 0 } },
    windows: new WindowManager(),
    settings: {},
    media: { images: [] },
    performance: { mode: 'balanced' },
  };
}
test('all Library results remain reachable through paging', () => {
  const s = state(),
    seen = new Set();
  for (let page = 0; page < 4; page++) {
    s.apps.library.page = page;
    for (const t of createLayout(s).controls)
      if (t.id.startsWith('app:') && !t.system) seen.add(t.id.slice(4));
  }
  const expected = filterLibraryApps(APP_MANIFESTS, { filter: 'All' }).map((a) => a.id);
  assert.deepEqual([...seen].sort(), expected.sort());
});
test('visible app targets follow the same window transform as the surface', () => {
  const s = state();
  s.windows.open('library', { position: { x: 0.2, y: 0.1, z: -1.8 } });
  const before = createLayout(s);
  const b = before.controls.find((t) => t.id === 'library:search');
  s.windows.windows.get('library').position.x += 0.25;
  s.windows.windows.get('library').scale = 1.1;
  const after = createLayout(s),
    a = after.controls.find((t) => t.id === b.id);
  assert.ok(a.position.x > b.position.x);
  assert.ok(a.width > b.width);
  assert.equal(after.surface.position.x, 0.45);
});
