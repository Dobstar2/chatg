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

test('C2 maps its versioned hand tracker to the canonical Safari-patched module', () => {
  const runtime = read('app-c2.js');
  const html = read('index.html');
  assert.ok(runtime.includes("hand-tracking-v020.js?v=os030c2"));
  assert.ok(html.includes('"../pocket-vr-next/tracking/hand-tracking-v020.js?v=os030c2": "../pocket-vr-next/tracking/hand-tracking-v020.js"'));
});

test('C2 keeps service-worker registration absent after hand runtime repair', () => {
  const files = ['index.html', 'app.js', 'app-c2.js'].map(read).join('\n');
  assert.equal(/serviceWorker\s*\.\s*register|navigator\.serviceWorker\.register/.test(files), false);
});
