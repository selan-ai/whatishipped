/*
 * WebP in and out through the Chrome the brandbook already needs (check.ts): no cwebp, no sips (which cannot write WebP).
 * Chrome decodes a WebP onto a canvas and hands back a PNG, which png.ts reads; to encode, it draws a PNG and exports
 * it lossless. Both take an evaluate function: check.ts passes its own CDP session, startChrome() gives a short-lived
 * one (capture.ts shares one across every frame it keeps).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decode } from './png.ts';
import type { Image } from './png.ts';

/* Runs a JavaScript expression in a page, waits for a promise it returns, and gives back its JSON value. */
export type Evaluate = (expression: string) => Promise<unknown>;
export type Chrome = { pid: number; evaluate: Evaluate; close: () => Promise<void> };

const WEBP = 'image/webp';
const PNG = 'image/png';
const DATA_URL = `data:${PNG};base64,`;

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Draws the image at `url` on a canvas and exports it as `type`: a data URL, or null when Chrome cannot read it. */
const redraw = (url: string, type: string) => `(async () => {
  try {
    const bitmap = await createImageBitmap(await (await fetch(${JSON.stringify(url)})).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return canvas.toDataURL(${JSON.stringify(type)}, 1);
  } catch { return null; }
})()`;

const dataUrl = (bytes: Buffer, type: string) => `data:${type};base64,${bytes.toString('base64')}`;

export async function decodeWebp(webp: Buffer, evaluate: Evaluate): Promise<Image | null> {
  const url = await evaluate(redraw(dataUrl(webp, WEBP), PNG));
  return typeof url === 'string' && url.startsWith(DATA_URL) ? decode(Buffer.from(url.slice(DATA_URL.length), 'base64')) : null;
}

/* A PNG as a lossless WebP (quality 1 is lossless in Chrome), or null when it is not a PNG Chrome can read. */
export async function encodeWebp(png: Buffer, evaluate: Evaluate): Promise<Buffer | null> {
  const prefix = `data:${WEBP};base64,`;
  const url = await evaluate(redraw(dataUrl(png, PNG), WEBP));
  return typeof url === 'string' && url.startsWith(prefix) ? Buffer.from(url.slice(prefix.length), 'base64') : null;
}

/* A headless Chrome with one blank page, driven over CDP. close() ends the process and removes its profile. */
export async function startChrome(binary: string): Promise<Chrome> {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'brandbook-webp-'));
  const proc = spawn(binary, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  /* Over when the process exited (by code or by signal) or never started (ENOENT): either way nothing is left to wait for. */
  let over = false;
  const gone = new Promise<void>((done) => {
    const end = () => { over = true; done(); };
    proc.once('exit', end);
    proc.once('error', end);
  });
  process.once('exit', () => proc.kill());
  const close = async () => {
    if (!over) { proc.kill(); await gone; }
    rmSync(profile, { recursive: true, force: true });
  };
  let socket: WebSocket | null = null;
  for (let i = 0; i < 50 && !socket && !over; i += 1) {
    await Promise.race([new Promise((r) => setTimeout(r, 200)), gone]);
    if (over) break;
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page) socket = new WebSocket(page.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!socket) { await close(); throw new Error(`Chrome did not start (${binary}); CHROME names another binary`); }
  const open = socket;
  /* Once the socket is gone (Chrome killed, crashed or closed it) nothing will answer: settle every waiting call with null. */
  let id = 0;
  let dead = false;
  const waiting = new Map<number, (v: { result?: { value?: unknown } }) => void>();
  const settleAll = () => { dead = true; for (const answer of waiting.values()) answer({}); waiting.clear(); };
  open.addEventListener('close', settleAll);
  open.addEventListener('error', settleAll);
  gone.then(settleAll);
  open.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)?.(msg.result ?? {}); waiting.delete(msg.id); }
  });
  await new Promise((r) => { open.addEventListener('open', r, { once: true }); open.addEventListener('close', r, { once: true }); });
  const evaluate: Evaluate = (expression) => new Promise((ok) => {
    if (dead) { ok(null); return; }
    id += 1;
    waiting.set(id, (msg) => ok(msg.result?.value ?? null));
    open.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  return { pid: proc.pid as number, evaluate, close: async () => { open.close(); await close(); } };
}
