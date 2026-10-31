import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { System, systems } from '../skills/whatishipped/template/app/types.ts';
import { readBrandbook } from '../skills/whatishipped/template/server/board.ts';

const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '..', 'skills', 'whatishipped', 'template');
const fixture = join(here, 'fixtures', 'web');

type FrameApi = { phone: (slots: Record<string, unknown>) => string; web: (slots: { body: string; style?: string }) => string };

/* frame.js as a page runs it, on a device of the given platform. */
function frame(platform: string): FrameApi {
  const ctx = vm.createContext({ Foundations: { platform, device: { clock: '9:41', home: true } } });
  (ctx as { window: unknown }).window = ctx;
  vm.runInContext(readFileSync(join(template, 'app', 'frame.js'), 'utf8'), ctx);
  return (ctx as unknown as { Frame: FrameApi }).Frame;
}

test('web is a system the board file can name', () => {
  assert.equal(systems.parse('web', System.ios), System.web);
});

test('an unknown system still falls back to the given default', () => {
  assert.equal(systems.parse('tvos', System.ios), System.ios);
});

test('Frame.web draws the body in a viewport with no status bar or home indicator', () => {
  const html = frame('web').web({ body: '<main id="page">Hi</main>', style: '--phone-w: 800px' });
  assert.match(html, /<main id="page">Hi<\/main>/);
  assert.match(html, /style="--phone-w: 800px"/);
  assert.doesNotMatch(html, /phone__(status|home|island|punch|icons|top|tabs)/);
});

test('Frame.phone markup is unchanged for iOS', () => {
  const html = frame('ios').phone({ body: 'B' });
  assert.match(html, /^<div class="phone phone--ios" style=""><div class="phone__top phone__top--bare"><div class="phone__status"><span>9:41<\/span><span class="phone__island"><\/span>/);
  assert.match(html, /<div class="phone__body"><div class="phone__page" style="margin-top:0px">B<\/div><\/div><div class="phone__home"><\/div><\/div>$/);
});

test('Frame.phone markup is unchanged for Android', () => {
  const html = frame('android').phone({ body: 'B' });
  assert.match(html, /^<div class="phone phone--android" style=""><div class="phone__top phone__top--bare"><div class="phone__status"><span>9:41<\/span><span class="phone__punch"><\/span>/);
  assert.match(html, /<div class="phone__body"><div class="phone__page" style="margin-top:0px">B<\/div><\/div><div class="phone__home"><\/div><\/div>$/);
});

test('a web board is indexed as the web system at its viewport', async () => {
  /* The board reads the shell's app/ beside the platform folders, as a scaffolded brandbook has it. */
  const root = mkdtempSync(join(tmpdir(), 'web-board-'));
  cpSync(fixture, root, { recursive: true });
  cpSync(join(template, 'app'), join(root, 'app'), { recursive: true });
  const index = await readBrandbook(root).finally(() => rmSync(root, { recursive: true }));
  const [web] = index.platforms;
  assert.equal(web.system, System.web);
  assert.equal(web.device, 'Desktop, 1440 × 900');
  assert.deepEqual([web.size.width, web.size.height, web.size.status, web.size.home], [1440, 900, 0, false]);
  assert.deepEqual(web.problems, []);
  assert.equal(web.screens[0].id, 'home');
  assert.equal(web.components[0].name, 'Button');
});

test('Frame.web draws an absent body as nothing, not as "undefined"', () => {
  const html = frame('web').web({ body: undefined as unknown as string });
  assert.ok(!html.includes('undefined'));
});
