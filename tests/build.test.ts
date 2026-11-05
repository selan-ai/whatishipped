import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodePng } from './helpers/png.ts';

const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '..', 'skills', 'whatishipped', 'template');
const fixture = join(here, 'fixtures', 'web');
const boards: string[] = [];
after(() => { for (const b of boards) rmSync(b, { recursive: true, force: true }); });

/* The template with the web fixture as its one platform, in a folder of its own. */
function board(): string {
  const dir = mkdtempSync(join(tmpdir(), 'whatishipped-build-'));
  boards.push(dir);
  cpSync(template, dir, { recursive: true });
  rmSync(join(dir, 'platform'), { recursive: true, force: true });
  cpSync(fixture, dir, { recursive: true });
  return dir;
}

/* npm run build with no cwebp or dwebp on the PATH, as in a CI image that lacks Debian's webp package. */
const buildWithoutWebp = (dir: string) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(dir, 'server', 'build.ts')], { encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });

test('a board whose images are all WebP builds without cwebp and dwebp', () => {
  const dir = board();
  const run = buildWithoutWebp(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(join(dir, 'dist', 'index.html')));
  assert.ok(existsSync(join(dir, 'dist', 'api', 'index.json')));
});

test('a board still holding a PNG stops the build with what to install when cwebp and dwebp are missing', () => {
  const dir = board();
  writeFileSync(join(dir, 'web', 'shot.png'), encodePng({ width: 1, height: 1, rgba: new Uint8Array(4) }));
  const run = buildWithoutWebp(dir);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /cwebp and dwebp not found/);
  assert.match(run.stderr, /apt install webp/);
});
