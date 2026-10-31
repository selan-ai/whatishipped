import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertFiles, decode, encode, frameFile, isWebp, MAX_SIDE, read, toWebp } from '../skills/whatishipped/template/server/webp.ts';
import { encodePng } from './helpers/png.ts';

const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '..', 'skills', 'whatishipped', 'template');
const pixelWebp = readFileSync(join(here, 'fixtures', 'pixel.webp'));
/* red, blue / green, white */
const PIXELS = [255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255];
const png = (width: number, height: number) => encodePng({ width, height, rgba: new Uint8Array(width * height * 4) });

test('a checked-in WebP decodes to its dimensions and pixels', async () => {
  const image = await read(pixelWebp);
  assert.ok(image);
  assert.deepEqual([image.width, image.height], [2, 2]);
  assert.deepEqual([...image.rgba], PIXELS);
});

test('a PNG is still read', async () => {
  const image = await read(encodePng({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) }));
  assert.deepEqual([...(image?.rgba ?? [])], PIXELS);
});

test('malformed input reads as null rather than throwing', async () => {
  assert.equal(await read(Buffer.from('not an image at all, just text')), null);
  assert.equal(await read(pixelWebp.subarray(0, 20)), null);
  assert.equal(await decode(Buffer.from('RIFF....WEBPjunk')), null);
});

test('a PNG frame is stored as a lossless WebP with the same pixels', async () => {
  const webp = await toWebp(encodePng({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) }));
  assert.ok(isWebp(webp));
  assert.deepEqual([...((await decode(webp))?.rgba ?? [])], PIXELS);
});

test('pixels are encoded as a lossless WebP with the same pixels', async () => {
  const webp = await encode({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) });
  assert.deepEqual([...((await decode(webp))?.rgba ?? [])], PIXELS);
});

test('bytes that are not an image are refused with cwebp\'s error', async () => {
  await assert.rejects(toWebp(Buffer.from('nope')), /cwebp/);
});

test('newly kept native frames are named .webp', () => {
  assert.equal(frameFile(0), '0001.webp');
  assert.equal(frameFile(11), '0012.webp');
});

let work: string;
before(() => { work = mkdtempSync(join(tmpdir(), 'webp-cli-')); });
after(() => { rmSync(work, { recursive: true, force: true }); });

test('PNGs convert to WebP files named after them, in an output directory that is created', async () => {
  const input = join(work, 'home.png');
  writeFileSync(input, encodePng({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) }));
  const out = join(work, 'nested', 'refs');
  const results = await convertFiles([input], out);
  assert.deepEqual(results, [{ input, output: join(out, 'home.webp'), failure: null }]);
  assert.deepEqual([...((await read(readFileSync(join(out, 'home.webp'))))?.rgba ?? [])], PIXELS);
});

test('a side above the WebP limit is refused with its size and the limit, and nothing is written', async () => {
  const input = join(work, 'tall.png');
  writeFileSync(input, png(1, MAX_SIDE + 1));
  const out = join(work, 'tall-out');
  const [result] = await convertFiles([input], out);
  assert.match(result.failure ?? '', new RegExp(`1 × ${MAX_SIDE + 1}.*${MAX_SIDE}`));
  assert.equal(existsSync(join(out, 'tall.webp')), false);
});

test('a missing file and a non-PNG fail cleanly while the others still convert', async () => {
  const good = join(work, 'good.png');
  const text = join(work, 'text.png');
  writeFileSync(good, png(2, 2));
  writeFileSync(text, 'not a png');
  const out = join(work, 'mixed');
  const results = await convertFiles([join(work, 'absent.png'), text, good], out);
  assert.deepEqual(results.map((r) => r.failure === null), [false, false, true]);
  assert.match(results[0].failure ?? '', /absent\.png/);
  assert.match(results[1].failure ?? '', /not a PNG/);
  assert.ok(existsSync(join(out, 'good.webp')));
});

const cli = join(template, 'server', 'webp.ts');

test('the command converts, and exits 1 naming each failure', () => {
  const good = join(work, 'cli-good.png');
  const bad = join(work, 'cli-bad.png');
  writeFileSync(good, png(2, 2));
  writeFileSync(bad, png(1, MAX_SIDE + 1));
  const out = join(work, 'cli-out');
  execFileSync(process.execPath, [cli, good, '--out', out]);
  assert.ok(existsSync(join(out, 'cli-good.webp')));
  const failed = spawnSync(process.execPath, [cli, good, bad, '--out', out], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /cli-bad\.png/);
  assert.match(failed.stderr, new RegExp(String(MAX_SIDE)));
});

test('the command with --out but no inputs, or no folder after --out, prints its usage and exits 2', () => {
  for (const args of [['--out', join(work, 'none')], [join(work, 'cli-good.png'), '--out']]) {
    const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(run.status, 2, args.join(' '));
    assert.match(run.stderr, /usage: node server\/webp\.ts/);
  }
});

test('the command given a file without --out prints its usage and exits 2, converting nothing', () => {
  const lone = join(work, 'lone.png');
  writeFileSync(lone, png(2, 2));
  const run = spawnSync(process.execPath, [cli, lone], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage: node server\/webp\.ts/);
  assert.ok(existsSync(lone));
});

test('the command without arguments still moves every platform folder over and rewrites the paths', () => {
  const board = join(work, 'board');
  cpSync(join(template, 'server'), join(board, 'server'), { recursive: true });
  cpSync(join(template, 'app'), join(board, 'app'), { recursive: true });
  writeFileSync(join(board, 'brandbook.json'), JSON.stringify({ name: 'T', platforms: [{ id: 'web' }] }));
  mkdirSync(join(board, 'web', 'refs'), { recursive: true });
  writeFileSync(join(board, 'web', 'refs', 'home.png'), png(2, 2));
  writeFileSync(join(board, 'web', 'refs.json'), JSON.stringify({ home: [{ file: 'refs/home.png', state: null, note: '' }] }));
  execFileSync(process.execPath, [join(board, 'server', 'webp.ts')], { encoding: 'utf8' });
  assert.ok(existsSync(join(board, 'web', 'refs', 'home.webp')));
  assert.equal(existsSync(join(board, 'web', 'refs', 'home.png')), false);
  assert.match(readFileSync(join(board, 'web', 'refs.json'), 'utf8'), /refs\/home\.webp/);
});

test('without cwebp and dwebp the command stops with what to install', () => {
  const run = spawnSync(process.execPath, [cli, '--out', join(work, 'x'), join(work, 'cli-good.png')], { encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /brew install webp/);
});
