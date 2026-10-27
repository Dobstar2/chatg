import { execFileSync } from 'node:child_process';
import { BUILD } from '../core/version.js';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const candidate = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(candidate, '..');
const dist = resolve(candidate, 'dist');
if (!dist.startsWith(candidate + sep)) throw Error('Build destination outside candidate');
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'pocket-os-030'), { recursive: true });
for (const name of [
  'index.html',
  'app.js',
  'app-c2.js',
  'styles-rc.css',
  'manifest.webmanifest',
  'apps',
  'core',
  'scene',
  'assets',
])
  await cp(resolve(candidate, name), resolve(dist, 'pocket-os-030', name), { recursive: true });
for (const name of ['core', 'tracking'])
  await cp(resolve(repo, 'pocket-vr-next', name), resolve(dist, 'pocket-vr-next', name), {
    recursive: true,
  });
await writeFile(
  resolve(dist, 'index.html'),
  '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket VR preview</title><style>body{font:20px system-ui;background:#13272b;color:#edf3ed;padding:10vh 8vw}a{color:#b8dcc9}</style><h1>Pocket VR 1.0 RC1</h1><p><a href="./pocket-os-030/">Open Pocket VR</a></p>',
);
await writeFile(
  resolve(dist, 'build.json'),
  JSON.stringify(
    {
      build: BUILD,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    },
    null,
    2,
  ) + '\n',
);
console.log('Static candidate built at pocket-os-030/dist. Serve the whole dist directory.');
