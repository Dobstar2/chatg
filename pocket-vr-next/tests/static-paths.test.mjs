import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

test('GitHub Pages entry point uses relative local assets', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const matches = [...html.matchAll(/(?:src|href)="(\.\/[^"?#]+)[^"]*"/g)].map((match) => match[1]);
  assert.ok(matches.includes('./styles.css'));
  assert.ok(matches.includes('./app.js'));
  assert.ok(matches.includes('./manifest.webmanifest'));
  for (const relativePath of matches) {
    assert.equal(await exists(resolve(root, relativePath)), true, `${relativePath} should exist`);
  }
});

test('all local module imports resolve inside the static folder', async () => {
  const files = [
    'app.js',
    'tracking/head-tracking.js',
    'tracking/camera-manager.js',
    'tracking/hand-tracking.js',
    'tracking/gesture-detector.js',
    'scene/interaction-manager.js',
    'scene/stereo-renderer.js',
  ];
  for (const file of files) {
    const fullPath = resolve(root, file);
    const source = await readFile(fullPath, 'utf8');
    const imports = [...source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map((match) => match[1]);
    for (const specifier of imports) {
      assert.equal(await exists(resolve(dirname(fullPath), specifier)), true, `${file}: ${specifier} should resolve`);
    }
  }
});
