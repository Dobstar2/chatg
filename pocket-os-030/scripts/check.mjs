import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() && !['node_modules', 'test-results', 'dist'].includes(e.name)
      ? walk(join(dir, e.name))
      : e.isFile() && /\.(js|cjs|mjs)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}
for (const path of walk('.'))
  execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
console.log('All candidate JavaScript passed syntax checks.');
