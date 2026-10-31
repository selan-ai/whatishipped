import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CHROME, startChrome } from './helpers/chrome.ts';
import type { Chrome } from './helpers/chrome.ts';

const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '..', 'skills', 'whatishipped', 'template');
const port = 4600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;

let root: string;
let server: ChildProcess;
let chrome: Chrome;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, check: () => Promise<unknown>) {
  for (let i = 0; i < 100; i += 1) { if (await check()) return; await sleep(100); }
  throw new Error(`timed out waiting for ${what}`);
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'journey-zoom-'));
  cpSync(template, root, { recursive: true });
  cpSync(join(here, 'fixtures', 'web'), root, { recursive: true });
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.ts', String(port)], { cwd: root, stdio: 'ignore' });
  await until('the board server', async () => (await fetch(`${base}/api/index.json`).catch(() => null))?.ok);
  /* Wide enough that the board's zoom is the one chosen: a narrower window scales the page down to fit (shell.ts, setZoom). */
  chrome = await startChrome(CHROME, { width: 2560, height: 1600 });
});
after(async () => { await chrome?.close(); server?.kill(); rmSync(root, { recursive: true, force: true }); });

type Drawing = { width: number; height: number; child: number };
/* The journey page's drawing and the box it stands in, as a person sees them. */
const measure = () => chrome.evaluate(`(() => {
  const el = document.querySelector('.b-step .b-mini.b-lazy--on');
  const r = el?.getBoundingClientRect();
  return r ? { width: r.width, height: r.height, child: Number(getComputedStyle(el.firstElementChild).zoom) } : null;
})()`) as Promise<Drawing | null>;
async function zoomTo(zoom: string): Promise<Drawing> {
  await chrome.evaluate(`document.querySelector('[data-zoom="${zoom}"]').click()`);
  await sleep(200);
  return await measure() as Drawing;
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.5, `${actual} is not ${expected}`);

test('zoom buttons scale the journey drawing and its box, and 65% keeps the size it always had', async () => {
  await chrome.evaluate(`location.href = '${base}/web/journeys/open-home?all'`);
  await until('the drawing', measure);
  const at65 = await zoomTo('0.65');
  const at100 = await zoomTo('1');
  const at80 = await zoomTo('0.8');
  near(at65.width, 450);
  near(at65.height, 281.25);
  near(at100.width, at65.width / 0.65);
  near(at100.height, at65.height / 0.65);
  near(at100.child, at65.child / 0.65);
  near(at80.width, at65.width * (0.8 / 0.65));
  near(at80.child, at65.child * (0.8 / 0.65));
});
