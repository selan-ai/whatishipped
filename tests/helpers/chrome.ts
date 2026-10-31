/*
 * A headless Chrome with one blank page, driven over CDP, for tests that look at the board as a person does.
 * close() ends the process and removes its profile. CHROME names another binary.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Runs a JavaScript expression in the page, waits for a promise it returns, and gives back its JSON value. */
export type Evaluate = (expression: string) => Promise<unknown>;
export type Chrome = { evaluate: Evaluate; close: () => Promise<void> };
export type Window = { width: number; height: number };

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function startChrome(binary: string, window: Window): Promise<Chrome> {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'brandbook-test-chrome-'));
  const proc = spawn(binary, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${window.width},${window.height}`, 'about:blank'], { stdio: 'ignore' });
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
  return { evaluate, close: async () => { open.close(); await close(); } };
}
