/*
 * Opens brandbook pages in headless Chrome and reports what broke: uncaught errors, console errors, drawings that
 * threw (.b-broken), files that did not load, and the layout at every window width in --widths (1024, 1280, 1440,
 * 1920, 2560): a box that sticks out of its card or container, cards on top of each other, text under 120px wide that
 * wraps to more than two lines (a title squeezed to a word a line), a page that scrolls sideways. With --shot, saves a
 * screenshot of each page, as WebP, next to the report.
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
 * that differ most. Writes the scores to each platform's match.json and what differs to <platform>/diff/ (red on
 * transparent), which the screen pages show. With --shot, WebP pictures
 * per state and screenshot: the app, the drawing and what differs in red side by side at 1:1 points; -zoom, the same
 * three for the rows that differ most, at the screenshot's own scale; and -drawing, the drawing alone at that scale.
 * The screenshot's scale is Foundations.device.density (pixels per point), else its width over the device's. It warns when a screenshot looks taken on another phone (an iPhone screenshot not at 2× or 3×
 * of the board's width, or of another height) or names a colour profile other than sRGB. A screenshot the other way
 * round from Foundations.device (landscape on a portrait phone) is a turned state: the device is measured turned, and
 * it warns when the drawing is not (Frame.phone's turned).
 * A web board's screenshot is a viewport (Foundations.device is its width in CSS pixels): its own height is free, and it
 * warns only when the width is another viewport's. See viewport.ts.
 * Screenshots are read as WebP (server/webp.ts; a PNG is read too, and named so it gets converted).
 * CHROME names another Chrome binary.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { slug } from '../app/model.ts';
import { MATCHED } from '../app/types.ts';
import type { Index } from '../app/types.ts';
import { diffOf } from './board.ts';
import { mask, match, picture, zoom } from './match.ts';
import { crop, decode, profile } from './png.ts';
import { screenshotGeometry } from './viewport.ts';
import { encode, isWebp, needWebp, read, toWebp, webpProfile } from './webp.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const shots = flag('--shot', '');
const width = Number(flag('--width', '1600'));
const height = Number(flag('--height', '1200'));
const deep = args.includes('--deep');
const base = flag('--all', '');
const compare = flag('--compare', '');
const only = flag('--screens', '').split(',').filter(Boolean);
const widths = flag('--widths', '1024,1280,1440,1920,2560').split(',').map(Number).filter((n) => n > 0);
if (shots || compare) needWebp();

/*
 * The layout of the page in the window, as a list of findings: what sticks out of its card or container, cards on
 * top of each other, text squeezed to a word a line, a page that scrolls sideways. The drawings, and the board's own
 * scrollers (a journey's track, a story's canvas, a graph), are not its layout.
 */
const LAYOUT = `(() => {
  const main = document.querySelector('.b-main');
  if (!main) return [];
  const out = [];
  const say = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    return el.tagName.toLowerCase() + cls + (text ? ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"' : '');
  };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    /* What runs past the window, drawings included: the outermost such boxes, named with the card they are in. */
    const past = [...main.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > de.clientWidth + 1);
    const outer = past.filter((el) => !past.includes(el.parentElement)).slice(0, 3);
    const where = outer.map((el) => { const card = el.closest('.b-card, .b-ref, .b-story, .b-panel, .b-step, .b-phone, .b-thumb'); return say(el).split(' ')[0] + (card ? ' in ' + say(card).split(' ')[0] + (card.id ? '#' + card.id : '') : ''); });
    out.push('the page scrolls sideways by ' + (de.scrollWidth - de.clientWidth) + 'px' + (where.length ? ' (' + where.join(', ') + ')' : ''));
  }
  /* Drawings and the board's own scrollers are not the board's layout. */
  const SKIP = '.b-lazy, .phone, svg, .b-story__canvas, .b-canvas, .b-preview, .b-graph, .b-matrix, .b-palette';
  const BOX = '.b-card, .b-ref, .b-story, .b-panel, .b-step, .b-phone, .b-thumb, .b-sw, .b-system, .b-icon, .b-gaps, .b-stats > *, .b-type__row, td, th, .b-main';
  const CARD = '.b-card, .b-ref, .b-story, .b-panel, .b-step, .b-phone, .b-thumb, .b-sw, .b-system, .b-icon';
  const clips = (el) => { const s = getComputedStyle(el); return s.overflowX !== 'visible' || s.overflowY !== 'visible'; };
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const cards = [];
  /* Sticks out of the card or container it sits in, where nothing between them clips it. */
  const stickOut = (el, r) => {
    let box = el.parentElement;
    let clipped = false;
    while (box && box !== main && !box.matches(BOX)) { if (clips(box)) clipped = true; box = box.parentElement; }
    if (!box || clipped) return;
    const b = box.getBoundingClientRect();
    const over = Math.max(b.left - r.left, r.right - b.right, box === main ? 0 : r.bottom - b.bottom);
    if (over > 1.5) out.push(say(el) + ' sticks out of ' + say(box).split(' ')[0] + ' by ' + Math.round(over) + 'px');
  };
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (el.matches(CARD)) cards.push([el, r]);
    stickOut(el, r);
    /* Text squeezed into a narrow column: under 120px wide and more than two lines. */
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    /* Text that runs out of its own box, a long name that cannot wrap. */
    if (own.length && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') out.push(say(el) + ' runs ' + (el.scrollWidth - el.clientWidth) + 'px out of its box');
    if (own.length && r.width < 120) {
      const range = document.createRange();
      const tops = new Set();
      for (const t of own) { range.selectNodeContents(t); for (const q of range.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top)); }
      if (tops.size > 2) out.push(say(el) + ' is ' + Math.round(r.width) + 'px wide and wraps to ' + tops.size + ' lines');
    }
  }
  /* A drawing, a canvas or a graph as a whole sticks out no more than any other box. */
  for (const el of main.querySelectorAll(SKIP)) {
    if (el.parentElement.closest(SKIP)) continue;
    const r = el.getBoundingClientRect();
    if (r.width || r.height) stickOut(el, r);
  }
  /* Cards on top of each other. */
  for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
    const [a, ra] = cards[i];
    const [b, rb] = cards[j];
    if (a.contains(b) || b.contains(a)) continue;
    const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (x > 1 && y > 1) out.push(say(a) + ' overlaps ' + say(b));
  }
  return [...new Set(out)];
})()`;
const urls = args.filter((a) => a !== '--deep');
if (base) urls.push(...(await every(base, deep)));

/* Every page the brandbook has, from its index. */
async function every(root: string, components: boolean) {
  const index = await (await fetch(`${root}/api/index.json`)).json() as Index;
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
    if (ready) {
      problems.push(...await audit(''));
      /* A screen page again with Compare on: every state with a screenshot beside its drawing. */
      if (await value("!!document.querySelector('[data-compare][aria-pressed=\"false\"]')")) {
        await value("document.querySelector('[data-compare]').click()");
        problems.push(...await audit(' with Compare on'));
        await value("document.querySelector('[data-compare]').click()");
      }
    }
    if (shots) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(shots, `${String(n + 1).padStart(2, '0')}.webp`), await toWebp(Buffer.from(shot.data, 'base64')));
    }
    if (problems.length || !base) console.log(`${problems.length ? '✗' : '✓'} ${raw}${problems.length ? `\n  ${[...new Set(problems)].join('\n  ')}` : ''}`);
    if (problems.length) failed += 1;
  }
  console.log(`${urls.length - failed} of ${urls.length} pages drew without a problem${widths.length ? `, laid out at ${widths.join(', ')} wide` : ''}`);
  return failed;
}

/*
 * The page's layout at each width, by what a person would see: the same finding at several widths is one line. The
 * drawings themselves, and the board's own scrollers (a journey's track, a graph, a story's canvas), are left out.
 */
async function audit(how: string) {
  const found = new Map<string, number[]>();
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height, deviceScaleFactor: 1, mobile: false });
    await send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true });
    await new Promise((r) => setTimeout(r, 120));
    for (const line of (await value(LAYOUT)) as string[]) found.set(line, [...(found.get(line) ?? []), w]);
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true });
  return [...found].map(([line, at]) => `layout at ${at.join(', ')}${how}: ${line}`);
}

/* Each state refs.json pairs with a screenshot, drawn alone at the screenshot's size and set beside it. */
async function measure(root: string) {
  const index = await (await fetch(`${root}/api/index.json`)).json() as Index;
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
      const bytes = Buffer.from(await (await fetch(`${root}/${p.id}/${r.file}`)).arrayBuffer());
      const app = await read(bytes);
      if (!app) { console.log(`✗ ${what}: not a WebP or an 8-bit PNG`); failed += 1; continue; }
      problems.length = 0;
      /* The phone at the screenshot's exact size in points (411.43 dp at 2.625), the page a whole number of points around
         it, and the shot cropped to the screenshot: nothing is resampled. */
      const { width: w, height: h, scale, turned, bare, status, notes: geometry } = screenshotGeometry({ system: p.system, size: p.size }, app);
      await send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: scale, mobile: false });
      /* A turned phone stands as --phone-h × --phone-w, so a turned screenshot's sides go in the other way round. */
      await send('Page.navigate', { url: `${root}/${p.id}/screens/${encodeURIComponent(s.id)}/${at + 1}?bare&w=${bare.width}&h=${bare.height}` });
      let ready = false;
      for (let i = 0; i < 50 && !ready; i += 1) {
        await new Promise((ok) => setTimeout(ok, 200));
        ready = await value("!!document.querySelector('.b-bare') && document.fonts.status === 'loaded' && [...document.images].every((i) => i.complete)") === true;
      }
      await new Promise((ok) => setTimeout(ok, 300));
      const drewTurned = await value("!!document.querySelector('.b-bare > .phone--turned')") === true;
      const shot = decode(Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      const drawn = shot ? crop(shot, app.width, app.height) : null;
      if (!ready || !drawn || problems.length) { console.log(`✗ ${what}: ${ready ? '' : 'did not draw in 10 s '}${[...new Set(problems)].join('; ')}`); failed += 1; continue; }
      const result = match(app, drawn, status, scale);
      const rowsOff = result.worst.map((w) => `${Math.round(w.from / scale)}–${Math.round(w.to / scale)}`).join(', ');
      (scores[s.id] ??= {})[r.file] = result.score;
      /* What differs, for the screen page's Diff. */
      const diff = join(here, p.id, diffOf(r.file));
      if (existsSync(join(here, p.id))) { mkdirSync(dirname(diff), { recursive: true }); writeFileSync(diff, await encode(mask(result, app.width, app.height))); }
      const notes = [
        turned && !drewTurned ? 'the screenshot is turned from Foundations.device and the drawing is not: draw the state with Frame.phone({ turned: true })' : '',
        drewTurned && !turned ? 'the drawing is turned and the screenshot is not: draw the state unturned' : '',
        ...geometry,
        (isWebp(bytes) ? webpProfile(bytes) : profile(bytes)) ? `colour profile ${isWebp(bytes) ? webpProfile(bytes) : profile(bytes)}: convert it to sRGB` : '',
        isWebp(bytes) ? '' : 'stored as PNG: node server/webp.ts stores it as WebP',
      ].filter(Boolean);
      if (rowsOff) notes.unshift(`differs most at y ${rowsOff}`);
      rows.push({ score: result.score, line: `${String(result.score).padStart(4)}%  ${what}${notes.length ? `  (${notes.join('; ')})` : ''}` });
      if (shots) {
        const name = join(shots, `${p.id}-${slug(s.id)}-${at + 1}-${slug(r.file.replace(/^.*\//, '').replace(/\.(webp|png)$/i, ''))}`);
        writeFileSync(`${name}.webp`, await encode(picture(app, drawn, result, Math.round(w), Math.round(h))));
        writeFileSync(`${name}-drawing.webp`, await encode(drawn));
        const close = zoom(app, drawn, result);
        if (close) writeFileSync(`${name}-zoom.webp`, await encode(close));
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
