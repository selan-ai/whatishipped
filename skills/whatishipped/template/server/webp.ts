/*
 * WebP in and out through the Chrome the brandbook already needs (check.ts): no cwebp, no sips (which cannot write WebP).
 * Chrome decodes a WebP onto a canvas and hands back a PNG, which png.ts reads; to encode, it draws a PNG and exports
 * it lossless. `node server/webp.ts <in.png>... --out <dir>` converts PNG files that way. Both take an evaluate function: check.ts passes its own CDP session, startChrome() gives a short-lived
 * one (capture.ts shares one across every frame it keeps).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
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
  const opened = await new Promise<boolean>((done) => {
    open.addEventListener('open', () => done(true), { once: true });
    open.addEventListener('close', () => done(false), { once: true });
  });
  if (!opened) { await close(); throw new Error(`Chrome closed its debugging socket before it opened (${binary})`); }
  const evaluate: Evaluate = (expression) => new Promise((ok) => {
    if (dead) { ok(null); return; }
    id += 1;
    waiting.set(id, (msg) => ok(msg.result?.value ?? null));
    open.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  return { pid: proc.pid as number, evaluate, close: async () => { open.close(); await close(); } };
}

/* WebP stores each side in 14 bits. */
export const MAX_SIDE = 16383;

export type Conversion = { input: string; output: string | null; failure: string | null };

/* A PNG's width and height from its header, or null when the bytes are not a PNG. */
const pngSize = (bytes: Buffer) => (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null);

/* Converts each PNG to <outDir>/<its name>.webp; one that cannot be converted is reported and the rest carry on. */
export async function convertAll(inputs: string[], outDir: string, evaluate: Evaluate): Promise<Conversion[]> {
  const results: Conversion[] = [];
  for (const input of inputs) {
    const fail = (failure: string) => results.push({ input, output: null, failure });
    let png: Buffer;
    try { png = readFileSync(input); } catch (e) { fail(`${input}: cannot be read (${(e as Error).message})`); continue; }
    const size = pngSize(png);
    if (!size) { fail(`${input}: not a PNG`); continue; }
    if (size.width > MAX_SIDE || size.height > MAX_SIDE) { fail(`${input}: ${size.width} × ${size.height} is over WebP's limit of ${MAX_SIDE} pixels a side; split or scale the screenshot`); continue; }
    const webp = await encodeWebp(png, evaluate);
    if (!webp) { fail(`${input}: Chrome could not convert it`); continue; }
    const output = join(outDir, `${basename(input, extname(input))}.webp`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(output, webp);
    results.push({ input, output, failure: null });
  }
  return results;
}

/* node server/webp.ts <in.png>... --out <dir> */
async function main(argv: string[]) {
  const at = argv.indexOf('--out');
  const outDir = at >= 0 ? argv[at + 1] : undefined;
  const inputs = at < 0 ? argv : argv.filter((_, i) => i !== at && i !== at + 1);
  if (!outDir || !inputs.length) { console.error('usage: node server/webp.ts <in.png>... --out <dir>'); return 2; }
  let chrome: Chrome;
  try { chrome = await startChrome(CHROME); } catch (e) { console.error((e as Error).message); return 1; }
  try {
    const results = await convertAll(inputs, outDir, chrome.evaluate);
    for (const r of results) (r.failure ? console.error : console.log)(r.failure ?? `${r.input} -> ${r.output}`);
    return results.some((r) => r.failure) ? 1 : 0;
  } finally { await chrome.close(); }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
