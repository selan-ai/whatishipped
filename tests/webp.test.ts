import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeImage, frameFile } from '../skills/whatishipped/template/server/image.ts';
import { encode } from '../skills/whatishipped/template/server/png.ts';
import { CHROME, convertAll, decodeWebp, encodeWebp, MAX_SIDE, startChrome } from '../skills/whatishipped/template/server/webp.ts';
import type { Chrome } from '../skills/whatishipped/template/server/webp.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pixelWebp = readFileSync(join(here, 'fixtures', 'pixel.webp'));
/* red, blue / green, white */
const PIXELS = [255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255];

let chrome: Chrome;
before(async () => { chrome = await startChrome(CHROME); });
after(async () => { await chrome.close(); });

test('a checked-in WebP decodes to its dimensions and pixels through Chrome', async () => {
  const image = await decodeImage(pixelWebp, chrome.evaluate);
  assert.ok(image);
  assert.deepEqual([image.width, image.height], [2, 2]);
  assert.deepEqual([...image.rgba], PIXELS);
});

test('a PNG is still accepted', async () => {
  const png = encode({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) });
  const image = await decodeImage(png, chrome.evaluate);
  assert.deepEqual([...(image?.rgba ?? [])], PIXELS);
});

test('malformed input fails cleanly rather than throwing', async () => {
  assert.equal(await decodeImage(Buffer.from('not an image at all, just text'), chrome.evaluate), null);
  assert.equal(await decodeImage(pixelWebp.subarray(0, 20), chrome.evaluate), null);
  assert.equal(await decodeWebp(Buffer.from('RIFF....WEBPjunk'), chrome.evaluate), null);
});

test('a PNG frame is encoded to a WebP that decodes to the same pixels', async () => {
  const png = encode({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) });
  const webp = await encodeWebp(png, chrome.evaluate);
  assert.ok(webp);
  assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  assert.deepEqual([...((await decodeImage(webp, chrome.evaluate))?.rgba ?? [])], PIXELS);
});

test('encoding something that is not a PNG returns null', async () => {
  assert.equal(await encodeWebp(Buffer.from('nope'), chrome.evaluate), null);
});

test('newly kept native frames are named .webp', () => {
  assert.equal(frameFile(0), '0001.webp');
  assert.equal(frameFile(11), '0012.webp');
});

const cli = join(here, '..', 'skills', 'whatishipped', 'template', 'server', 'webp.ts');
const png = (width: number, height: number) => encode({ width, height, rgba: new Uint8Array(width * height * 4) });
let work: string;
before(() => { work = mkdtempSync(join(tmpdir(), 'webp-cli-')); });
after(() => { rmSync(work, { recursive: true, force: true }); });

/* The PNG-to-WebP command, in this file so no other Chrome starts beside the lifecycle tests below. */
test('PNGs convert to WebP files named after them, in an output directory that is created', async () => {
  const input = join(work, 'home.png');
  writeFileSync(input, encode({ width: 2, height: 2, rgba: new Uint8Array(PIXELS) }));
  const out = join(work, 'nested', 'refs');
  const results = await convertAll([input], out, chrome.evaluate);
  assert.deepEqual(results, [{ input, output: join(out, 'home.webp'), failure: null }]);
  assert.equal(readFileSync(join(out, 'home.webp')).toString('ascii', 8, 12), 'WEBP');
});

test('a side above the WebP limit is refused with its size and the limit, and nothing is written', async () => {
  const input = join(work, 'tall.png');
  writeFileSync(input, png(1, MAX_SIDE + 1));
  const out = join(work, 'tall-out');
  const [result] = await convertAll([input], out, chrome.evaluate);
  assert.match(result.failure ?? '', new RegExp(`1 × ${MAX_SIDE + 1}.*${MAX_SIDE}`));
  assert.equal(existsSync(join(out, 'tall.webp')), false);
});

test('a missing file and a non-PNG fail cleanly while the others still convert', async () => {
  const good = join(work, 'good.png');
  const text = join(work, 'text.png');
  writeFileSync(good, png(2, 2));
  writeFileSync(text, 'not a png');
  const out = join(work, 'mixed');
  const results = await convertAll([join(work, 'absent.png'), text, good], out, chrome.evaluate);
  assert.deepEqual(results.map((r) => r.failure === null), [false, false, true]);
  assert.match(results[0].failure ?? '', /absent\.png/);
  assert.match(results[1].failure ?? '', /not a PNG/);
  assert.ok(existsSync(join(out, 'good.webp')));
});

test('the command converts, and exits 1 naming each failure', () => {
  const good = join(work, 'cli-good.png');
  const bad = join(work, 'cli-bad.png');
  writeFileSync(good, png(2, 2));
  writeFileSync(bad, png(1, MAX_SIDE + 1));
  const out = join(work, 'cli-out');
  execFileSync('node', [cli, good, '--out', out]);
  assert.ok(existsSync(join(out, 'cli-good.webp')));
  const failed = spawnSync('node', [cli, good, bad, '--out', out], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /cli-bad\.png/);
  assert.match(failed.stderr, new RegExp(String(MAX_SIDE)));
});

test('the command without --out or inputs prints its usage and exits 2', () => {
  const run = spawnSync('node', [cli], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage: node server\/webp\.ts/);
});

/* Lifecycle: these start their own Chromes, apart from the shared one above. */
const within = <T>(work: Promise<T>, ms: number) => Promise.race([work, new Promise<never>((_, no) => setTimeout(() => no(new Error(`still pending after ${ms} ms`)), ms))]);
const profiles = () => readdirSync(tmpdir()).filter((name) => name.startsWith('brandbook-webp-'));

test('a Chrome binary that does not exist rejects with the startup error and leaves no profile behind', async () => {
  const before = profiles();
  await assert.rejects(within(startChrome('/nonexistent/chrome'), 5000), /Chrome did not start/);
  assert.deepEqual(profiles(), before);
});

test('Chrome dying mid-run settles waiting and later calls with null, and close still returns', async () => {
  const doomed = await startChrome(CHROME);
  const waiting = doomed.evaluate('new Promise(() => {})');
  process.kill(doomed.pid, 'SIGKILL');
  assert.equal(await within(waiting, 5000), null);
  assert.equal(await within(doomed.evaluate('1 + 1'), 5000), null);
  await within(doomed.close(), 5000);
});

test('a Chrome whose socket closes before it opens rejects rather than returning a dead handle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fake-chrome-'));
  const binary = join(dir, 'chrome.mjs');
  writeFileSync(binary, `#!/usr/bin/env node
import { createServer } from 'node:http';
const port = Number(process.argv.find((a) => a.startsWith('--remote-debugging-port=')).split('=')[1]);
const server = createServer((req, res) => res.end(JSON.stringify([{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:' + port + '/devtools/page/x' }])));
server.on('upgrade', (req, socket) => socket.destroy());
server.listen(port, '127.0.0.1');
`);
  chmodSync(binary, 0o755);
  try {
    await assert.rejects(within(startChrome(binary), 10000), /Chrome/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
