import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('Pocket OS maps the queried hand tracker to the canonical patched module', () => {
  const app = read('app.js');
  const html = read('index.html');
  assert.ok(app.includes("hand-tracking-v020.js?v=os030"), 'candidate still imports the versioned hand tracker');
  assert.ok(html.includes('"../pocket-vr-next/tracking/hand-tracking-v020.js?v=os030": "../pocket-vr-next/tracking/hand-tracking-v020.js"'));
});

test('Safari continuous and MediaPipe runtime patches target the canonical hand tracker', () => {
  const repoRoot = path.resolve(root, '..');
  const safariPatch = fs.readFileSync(path.join(repoRoot, 'pocket-vr-next/tracking/safari-continuous-v022.js'), 'utf8');
  const runtimePatch = fs.readFileSync(path.join(repoRoot, 'pocket-vr-next/tracking/mediapipe-runtime-v020.js'), 'utf8');
  assert.ok(safariPatch.includes("from './hand-tracking-v020.js'"));
  assert.ok(safariPatch.includes("scheduler: 'media-time timer'"));
  assert.ok(runtimePatch.includes("from './hand-tracking-v020.js'"));
  assert.ok(runtimePatch.includes('@mediapipe/tasks-vision@0.10.35'));
});

test('hand fix has a unique visible build marker and no service worker registration', () => {
  const html = read('index.html');
  const version = read('core/version.js');
  assert.ok(html.includes('POCKET OS 0.3 C1-H1'));
  assert.ok(version.includes("BUILD_SHORT = 'POCKET OS 0.3 C1-H1'"));
  assert.equal(/serviceWorker\s*\.\s*register|navigator\.serviceWorker\.register/.test(html), false);
});
