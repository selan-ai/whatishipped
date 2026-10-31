/*
 * Small pieces every page uses: escaping, addresses, links to the code, and drawings that wait until they scroll into
 * view, so a page with hundreds of phones costs only the ones on screen.
 */
import { slug } from './model.ts';
import type { Model } from './model.ts';
import type { How, Source } from './types.ts';
import { hows, MATCHED, Orientation, System } from './types.ts';

export const esc = (s: unknown) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const enc = encodeURIComponent;

export const url = {
  home: () => '/',
  overview: (p: string) => `/${p}/`,
  journeys: (p: string) => `/${p}/journeys`,
  journey: (p: string, id: string) => `/${p}/journeys/${enc(id)}`,
  foundations: (p: string, part: string) => `/${p}/foundations/${part}`,
  token: (p: string, css: string) => `/${p}/foundations/colour/${enc(css.replace(/^--/, ''))}`,
  components: (p: string) => `/${p}/components`,
  group: (p: string, group: string) => `/${p}/components/${slug(group)}`,
  component: (p: string, group: string, s: string) => `/${p}/components/${slug(group)}/${s}`,
  story: (p: string, group: string, s: string, i: number) => `/${p}/components/${slug(group)}/${s}/${i + 1}`,
  screens: (p: string) => `/${p}/screens`,
  feature: (p: string, feature: string) => `/${p}/features/${slug(feature)}`,
  screen: (p: string, id: string) => `/${p}/screens/${enc(id)}`,
  state: (p: string, id: string, i: number) => `/${p}/screens/${enc(id)}#state-${i + 1}`,
  /* One state alone, at 1:1 with no frame around it: what check.ts --compare puts beside the app's screenshot. */
  bare: (p: string, id: string, i: number) => `/${p}/screens/${enc(id)}/${i + 1}?bare`,
  navigation: (p: string) => `/${p}/navigation`,
};

/* How much of a state matches the app's screenshot (check.ts --compare), as a chip. */
export const matchChip = (score: number | null, system: System) => (score === null ? '' : `<span class="b-match b-match--${score >= MATCHED ? 'good' : score >= MATCHED - 10 ? 'fair' : 'poor'}" title="${system === System.web ? 'Share of the page' : 'Share of the screen below the status bar'} that matches the app's screenshot">${score}% match</span>`);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const how = (h: How) => `<span class="b-how b-how--${hows.parse(h, 'push')}">${esc(h)}</span>`;
export const screenLink = (m: Model, id: string) => {
  const s = m.byId.get(id);
  return s ? `<a class="b-chip" href="${url.screen(m.here.id, id)}">${esc(s.name)}</a>` : `<span class="b-chip b-chip--off" title="Not drawn on this board">${esc(id)}</span>`;
};
export const componentLink = (m: Model, key: string) => {
  const e = m.entry.get(key);
  return e ? `<a class="b-chip b-chip--comp" href="${url.component(m.here.id, e.group, e.slug)}">${esc(e.c.name)}</a>` : '';
};

/* A source as text, linked to the file on the web and in the editor when the server found it. */
export function sources(m: Model, list: Source[]) {
  if (!list.length) return '';
  return `<span class="b-sources">${list.map((s) => {
    if (!s.path) return `<span class="b-src">${esc(s.text)}</span>`;
    const line = s.line ? `#L${s.line}` : '';
    const web = m.here.web ? `<a class="b-src__go" href="${esc(m.here.web + s.path + line)}" target="_blank" rel="noreferrer" title="Open in the repo">web</a>` : '';
    const editor = m.here.editor ? `<a class="b-src__go" href="${esc(`vscode://file/${m.here.editor}/${s.path}${s.line ? `:${s.line}` : ''}`)}" title="Open in VS Code">editor</a>` : '';
    return `<span class="b-src" title="${esc(s.path)}">${esc(s.path)}${s.line ? `:${s.line}` : ''}${web}${editor}</span>`;
  }).join('')}</span>`;
}

/* One drawing that throws shows its error in place; the rest of the page still draws. */
export function safe(render: () => string, what: string) {
  try { return render(); } catch (e) { console.error(what, e); return `<div class="b-broken">${esc(what)}: ${esc((e as Error).message)}</div>`; }
}

let pending = new Map<string, () => string>();
let seq = 0;
let observer: IntersectionObserver | null = null;
export const eager = new URLSearchParams(location.search).has('all');

/* A drawing that renders when it comes near the viewport (?all draws everything at once, for screenshots). */
export function lazy(render: () => string, what: string, cls: string, style: string) {
  const id = `l${(seq += 1)}`;
  pending.set(id, () => safe(render, what));
  return `<div class="b-lazy ${cls}" data-lazy="${id}" style="${style}"></div>`;
}
export function hydrate(root: HTMLElement) {
  observer?.disconnect();
  const fill = (el: HTMLElement) => {
    const draw = pending.get(el.dataset.lazy ?? '');
    if (draw) el.innerHTML = draw();
    el.classList.add('b-lazy--on');
    /* A full-size phone takes the size it drew at (a turned one is the other way round from its placeholder). */
    if (el.classList.contains('b-full')) el.removeAttribute('style');
    /* So does a thumbnail of a turned state: its box turns with it. */
    else if (el.classList.contains('b-mini') && el.querySelector(':scope > .phone--turned')) Object.assign(el.style, { width: 'calc(var(--phone-h) * var(--mini))', height: 'calc(var(--phone-w) * var(--mini))' });
    if (landscape() && el.matches(fits)) fit(el);
  };
  const els = [...root.querySelectorAll<HTMLElement>('[data-lazy]')];
  if (eager) { els.forEach(fill); return; }
  observer = new IntersectionObserver((seen) => {
    for (const e of seen) if (e.isIntersecting) { fill(e.target as HTMLElement); observer?.unobserve(e.target); }
  }, { rootMargin: '900px 0px' });
  els.forEach((el) => observer?.observe(el));
}
export function resetLazy() { pending = new Map(); }

/*
 * On a landscape device a story can be wider than the room it stands in (an overlay as wide as the tablet): it takes
 * the whole row of stories, then is scaled down until it fits, never up; a component card's preview fits its box both
 * ways. A portrait board draws every story at its own size, as it always has.
 */
const fits = '.b-story__canvas > .b-lazy, .b-canvas > .b-lazy, .b-preview > .b-lazy';
const landscape = () => document.documentElement.dataset.orientation === Orientation.landscape;
function fit(el: HTMLElement) {
  const box = el.parentElement as HTMLElement;
  /* Its own size first: a preview's box would cap it at the box's width. */
  Object.assign(el.style, { zoom: '', maxWidth: 'none' });
  const drawn = el.getBoundingClientRect();
  if (!drawn.width || !drawn.height) return;
  const pad = getComputedStyle(box);
  const bleed = el.classList.contains('b-demo__in--bleed');
  const room = box.clientWidth - (bleed ? 0 : parseFloat(pad.paddingLeft) + parseFloat(pad.paddingRight));
  const story = box.closest<HTMLElement>('.b-story');
  if (story && drawn.width > room && !story.classList.contains('b-story--span')) {
    story.classList.add('b-story--span');
    fit(el);
    return;
  }
  const tall = box.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
  const scale = Math.min(1, room / drawn.width, box.classList.contains('b-preview') ? tall / drawn.height : 1);
  if (scale < 1) el.style.zoom = String(Number(getComputedStyle(el).zoom || 1) * scale);
}
addEventListener('resize', () => {
  if (landscape()) document.querySelectorAll<HTMLElement>(fits).forEach((el) => { if (el.classList.contains('b-lazy--on')) fit(el); });
});

/*
 * The zoom a thumbnail is drawn at. Pages name it for a portrait phone; a landscape device takes the zoom that makes
 * it as wide as it would be standing up, so it keeps the room a row of thumbnails, a card or a step gives it.
 */
export const mini = (m: Model, zoom: number) => (m.orientation === Orientation.landscape ? Math.round((zoom * m.F.device.height / m.F.device.width) * 1e4) / 1e4 : zoom);

/* A phone drawn at a fraction of its size, sized before it draws so the page does not jump. */
export const phoneAt = (render: () => string, what: string, zoom: number) =>
  lazy(render, what, zoom === 1 ? 'b-full' : 'b-mini', `width:calc(var(--phone-w) * ${zoom});height:calc(var(--phone-h) * ${zoom});--mini:${zoom}`);

/* The board's zoom until a person picks another (board.css and shell.ts start there too). */
export const DEFAULT_ZOOM = 0.65;

/* The zoom a drawing follows: `zoom` at the default, scaling with the board's zoom buttons from there. */
export const followingZoom = (zoom: number) => `calc(var(--zoom) * ${zoom} / ${DEFAULT_ZOOM})`;

/* A phone drawn at `scale` (a CSS number), so a drawing that follows the zoom buttons keeps its box in step. */
export const phoneScaled = (render: () => string, what: string, scale: string) =>
  lazy(render, what, 'b-mini', `--mini:${scale};width:calc(var(--phone-w) * var(--mini));height:calc(var(--phone-h) * var(--mini))`);
