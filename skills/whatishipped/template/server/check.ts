/*
 * Opens brandbook pages in headless Chrome and reports what broke: uncaught errors, console errors, drawings that
 * threw (.b-broken), files that did not load. With --shot, saves a screenshot of each page next to the report.
 *   node server/check.ts http://localhost:4321/ios/screens/home-feed [more urls] [--shot /tmp/shots] [--width 1600]
 *   node server/check.ts --all http://localhost:4321   every page: the front, and per platform its overview, journeys,
 *                                                       foundations, component groups, features, screens, navigation
 *   --deep with --all adds every component's own page, which draws all its stories
 * Pages are opened with ?all, so every lazy drawing renders. Exits 1 when any page had a problem.
 *
 *   node server/check.ts --compare http://localhost:4321 [--screens home-feed,android:player] [--shot /tmp/match]
 * measures each state paired with a screenshot of the app (its app field, or refs.json's state), on every screen or
 * the ones --screens names (an id, on every platform that has it, or <platform>:<id>): draws the state alone at the
 * screenshot's pixel size and prints how much of the screen's content matches (match.ts), worst first, with the rows
 * that differ most. Writes the scores to each platform's match.json, which the pages show. With --shot, two pictures
 * per state and screenshot: the app, the drawing and what differs in red side by side at 1:1 points; -zoom, the same
 * three for the rows that differ most, at the screenshot's own scale; and -drawing, the drawing alone at that scale.
 * The screenshot's scale is Foundations.device.density (pixels per point), else its width over the device's. It warns when a screenshot looks taken on another phone (an iPhone screenshot not at 2× or 3×
 * of the board's width, or of another height) or names a colour profile other than sRGB.
 * CHROME names another Chrome binary.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slug } from '../app/model.ts';
import { MATCHED, System } from '../app/types.ts';
import type { Index } from '../app/types.ts';
import { match, picture, zoom } from './match.ts';
import { crop, decode, encode, profile } from './png.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const shots = flag('--shot', '');
const width = Number(flag('--width', '1600'));
const height = Number(flag('--height', '1200'));
const deep = args.includes('--deep');
const base = flag('--all', '');
const compare = flag('--compare', '');
const only = flag('--screens', '').split(',').filter(Boolean);
const urls = args.filter((a) => a !== '--deep');
if (base) urls.push(...(await every(base, deep)));

/* Every page the brandbook has, from its index. */
async function every(root: string, components: boolean) {
  const index = await (await fetch(`${root}/api/index`)).json() as Index;
  const out = [`${root}/`];
  for (const p of index.platforms) {
    const at = `${root}/${p.id}`;
    out.push(`${at}/`, `${at}/journeys`, ...p.journeys.map((j) => `${at}/journeys/${encodeURIComponent(j.id)}`));
    out.push(...['colour', 'type', 'shape', 'icons'].map((x) => `${at}/foundations/${x}`));
    const groups = [...new Set(p.components.map((c) => c.group))];
    out.push(`${at}/components`, ...groups.map((g) => `${at}/components/${slug(g)}`));
    if (components) out.push(...p.components.map((c) => `${at}/components/${slug(c.group)}/${slug(c.name)}`));
    out.push(`${at}/screens`, ...p.features.map((f) => `${at}/features/${slug(f)}`), ...p.screens.map((x) => `${at}/screens/${encodeURIComponent(x.id)}`));
    out.push(`${at}/navigation`, ...p.features.map((f) => `${at}/navigation?feature=${slug(f)}`));
  }
  return out;
}
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);

const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=/tmp/brandbook-check-${port}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
let ws: WebSocket | null = null;
for (let i = 0; i < 50 && !ws; i += 1) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    const page = list.find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch { /* not up yet */ }
}
if (!ws) { console.error('Chrome did not start'); proc.kill(); process.exit(2); }
const socket = ws;
await new Promise((r) => socket.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map<number, (v: unknown) => void>();
const problems: string[] = [];
socket.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)?.(msg.result); waiting.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') problems.push(`error: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push(`console: ${msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ')}`);
  if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) problems.push(`not loaded: ${msg.params.errorText}`);
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) problems.push(`${msg.params.response.status}: ${msg.params.response.url}`);
});
const send = (method: string, params: object) => new Promise<any>((ok) => { id += 1; waiting.set(id, ok); socket.send(JSON.stringify({ id, method, params })); });
const value = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
await send('Runtime.enable', {});
await send('Network.enable', {});
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
if (shots) mkdirSync(shots, { recursive: true });

const bad = compare ? await measure(compare) : await pages();
socket.close();
proc.kill();
process.exit(bad ? 1 : 0);

async function pages() {
  let failed = 0;
  for (const [n, raw] of urls.entries()) {
    problems.length = 0;
    const u = new URL(raw);
    u.searchParams.set('all', '');
    await send('Page.navigate', { url: u.toString() });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      ready = await value("!!document.querySelector('.b-main, .b-bare') && document.querySelectorAll('[data-lazy]:not(.b-lazy--on)').length === 0") === true;
    }
    await new Promise((r) => setTimeout(r, 400));
    const broken = await value("[...document.querySelectorAll('.b-broken')].map(b => b.textContent).join(' | ')");
    if (broken) problems.push(`drawings that threw: ${broken}`);
    if (!ready) problems.push('the page did not finish drawing in 20 s');
    if (shots) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(shots, `${String(n + 1).padStart(2, '0')}.png`), Buffer.from(shot.data, 'base64'));
    }
    if (problems.length || !base) console.log(`${problems.length ? '✗' : '✓'} ${raw}${problems.length ? `\n  ${[...new Set(problems)].join('\n  ')}` : ''}`);
    if (problems.length) failed += 1;
  }
  console.log(`${urls.length - failed} of ${urls.length} pages drew without a problem`);
  return failed;
}

/* Each state refs.json pairs with a screenshot, drawn alone at the screenshot's size and set beside it. */
async function measure(root: string) {
  const index = await (await fetch(`${root}/api/index`)).json() as Index;
  const here = join(import.meta.dirname, '..');
  const rows: { score: number; line: string }[] = [];
  let failed = 0;
  for (const p of index.platforms) {
    const file = join(here, p.id, 'match.json');
    const scores: Record<string, Record<string, number>> = only.length && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const measured = p.screens.filter((x) => !only.length || only.includes(x.id) || only.includes(`${p.id}:${x.id}`));
    for (const s of measured) delete scores[s.id];
    for (const s of measured) for (const r of s.refs) {
      const at = r.state === null ? -1 : s.states.indexOf(r.state);
      if (at < 0) continue;
      const what = `${p.id}  ${s.name} · ${r.state}  ${r.file}`;
      const png = Buffer.from(await (await fetch(`${root}/${p.id}/${r.file}`)).arrayBuffer());
      const app = decode(png);
      if (!app) { console.log(`✗ ${what}: not an 8-bit PNG`); failed += 1; continue; }
      problems.length = 0;
      /* The phone at the screenshot's exact size in points (411.43 dp at 2.625), the page a whole number of points around
         it, and the shot cropped to the screenshot: nothing is resampled. */
      const density = Number(p.size.density) || 0;
      const scale = density > 0 ? density : app.width / p.size.width;
      const w = app.width / scale;
      const h = app.height / scale;
      await send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: scale, mobile: false });
      await send('Page.navigate', { url: `${root}/${p.id}/screens/${encodeURIComponent(s.id)}/${at + 1}?bare&w=${w}&h=${h}` });
      let ready = false;
      for (let i = 0; i < 50 && !ready; i += 1) {
        await new Promise((ok) => setTimeout(ok, 200));
        ready = await value("!!document.querySelector('.b-bare') && document.fonts.status === 'loaded' && [...document.images].every((i) => i.complete)") === true;
      }
      await new Promise((ok) => setTimeout(ok, 300));
      const shot = decode(Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      const drawn = shot ? crop(shot, app.width, app.height) : null;
      if (!ready || !drawn || problems.length) { console.log(`✗ ${what}: ${ready ? '' : 'did not draw in 10 s '}${[...new Set(problems)].join('; ')}`); failed += 1; continue; }
      const result = match(app, drawn, p.size.status, scale);
      const rowsOff = result.worst.map((w) => `${Math.round(w.from / scale)}–${Math.round(w.to / scale)}`).join(', ');
      (scores[s.id] ??= {})[r.file] = result.score;
      const notes = [
        Math.abs(w - p.size.width) > 1 ? `the screenshot is ${Math.round(w * 10) / 10} wide at ${Math.round(scale * 1000) / 1000}×, the board's phone ${p.size.width}: another phone?` : '',
        Math.abs(h - p.size.height) > p.size.height * 0.01 ? `the screenshot is ${Math.round(h)} tall, the board's phone ${p.size.height}: another phone?` : '',
        !density && p.system === System.ios && Math.abs(scale - Math.round(scale)) > 0.02 ? `${app.width} px wide is not ${p.size.width} at 2× or 3×: another phone? (Foundations.device.density says)` : '',
        profile(png) ? `colour profile ${profile(png)}: convert it to sRGB` : '',
      ].filter(Boolean);
      if (rowsOff) notes.unshift(`differs most at y ${rowsOff}`);
      rows.push({ score: result.score, line: `${String(result.score).padStart(4)}%  ${what}${notes.length ? `  (${notes.join('; ')})` : ''}` });
      if (shots) {
        const name = join(shots, `${p.id}-${slug(s.id)}-${at + 1}-${slug(r.file.replace(/^.*\//, '').replace(/\.png$/i, ''))}`);
        writeFileSync(`${name}.png`, encode(picture(app, drawn, result, Math.round(w), Math.round(h))));
        writeFileSync(`${name}-drawing.png`, encode(drawn));
        const close = zoom(app, drawn, result);
        if (close) writeFileSync(`${name}-zoom.png`, encode(close));
      }
    }
    if (existsSync(join(here, p.id))) writeFileSync(file, `${JSON.stringify(scores, null, 1)}\n`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  rows.sort((a, b) => a.score - b.score);
  for (const r of rows) console.log(r.line);
  const mean = rows.length ? Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length) : 0;
  console.log(rows.length ? `${rows.length} states compared: ${mean}% on average, ${rows.filter((r) => r.score < MATCHED).length} below ${MATCHED}%` : "No state is paired with a screenshot of the app (a state's app field, or refs.json's state).");
  return failed;
}
