import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeImage, frameFile } from '../skills/whatishipped/template/server/image.ts';
import { encode } from '../skills/whatishipped/template/server/png.ts';
import { CHROME, decodeWebp, encodeWebp, startChrome } from '../skills/whatishipped/template/server/webp.ts';
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
