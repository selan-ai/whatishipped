/*
 * The brandbook in the browser. One page answers every address (server.ts): it reads the address, loads that
 * platform's board files into window, then draws the chrome (platforms, search, the tree on the left) and the page.
 *   /                                        every platform side by side
 *   /<platform>/                             the platform's overview
 *   /<platform>/journeys[/<id>]
 *   /<platform>/foundations/colour[/<token>] | type | shape | icons
 *   /<platform>/components[/<group>[/<component>[/<story>]]]   ?ground=screen|dark|light|checker
 *   /<platform>/screens[/<id>[/<state>]]  /<platform>/features/<feature>   ?bare draws the one state alone, 1:1
 *   /<platform>/navigation                   ?feature=<feature>
 * Within a platform, links redraw in place; another platform's styles would clash, so switching loads afresh.
 */
import { model, slug, twin } from './model.ts';
import type { Model } from './model.ts';
import { componentPage, componentsPage, findEntry, groupPage, storyPage } from './pages/components.ts';
import { colourPage, iconsPage, shapePage, tokenPage, typePage } from './pages/foundations.ts';
import { homePage, overviewPage } from './pages/home.ts';
import { journeyPage, journeysPage } from './pages/journeys.ts';
import { navigationPage } from './pages/navigation.ts';
import type { Page } from './pages/page.ts';
import { featurePage, screenPage, screensPage } from './pages/screens.ts';
import { search } from './search.ts';
import { closed, Ground, grounds } from './types.ts';
import type { Foundations, Group, Index, Journey, Screen } from './types.ts';
import { esc, hydrate, resetLazy, url } from './ui.ts';

const sections = closed(['journeys', 'foundations', 'components', 'screens', 'features', 'navigation']);
const Section = sections.names;
const parts = closed(['colour', 'type', 'shape', 'icons']);
const Part = parts.names;
const zooms = [0.5, 0.65, 0.8, 1];

type Board = { Foundations: Foundations; Catalog: Group[]; Screens: Screen[]; Journeys: Journey[]; Areas: string[] };
const w = window as unknown as Board & Record<string, unknown>;
const path = () => location.pathname.split('/').filter(Boolean).map(decodeURIComponent);

const index: Index = await (await fetch('/api/index.json')).json();
const platform = index.platforms.some((p) => p.id === path()[0]) ? path()[0] : null;
let m: Model | null = null;
if (platform) {
  await load(platform);
  m = model(index, platform, w);
  const root = document.documentElement;
  root.dataset.platform = m.F.platform;
  /* Which way the device stands: the board's CSS lays thumbnails, cards and pairs out by it. */
  root.dataset.orientation = m.orientation;
  root.style.setProperty('--phone-w', `${m.F.device.width}px`);
  root.style.setProperty('--phone-h', `${m.F.device.height}px`);
  root.style.setProperty('--status-h', `${m.F.device.status}px`);
}
draw();
addEventListener('popstate', draw);
document.addEventListener('click', follow);
document.addEventListener('keydown', keys);

/* The platform's files in the order its page always ran them: icons, frame, foundations, components, areas, journeys. */
async function load(p: string) {
  Object.assign(w, { Catalog: [], Screens: [], Journeys: [], C: {}, Areas: [] });
  const css = (href: string) => new Promise<void>((ok) => {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
    l.onload = () => ok();
    l.onerror = () => ok();
    document.head.appendChild(l);
  });
  const js = (src: string) => new Promise<void>((ok) => {
    const s = Object.assign(document.createElement('script'), { src });
    s.onload = () => ok();
    s.onerror = () => { console.error(`${src} did not load`); ok(); };
    document.body.appendChild(s);
  });
  await Promise.all([css(`/${p}/tokens.css`), css(`/${p}/components.css`)]);
  for (const src of ['/app/icons.js', `/${p}/icons.js`, '/app/frame.js', `/${p}/foundations.js`, `/${p}/components.js`, `/${p}/areas.js`]) await js(src);
  for (const area of w.Areas) {
    if (!area.endsWith('.js')) css(`/${p}/${area}.css`);
    await js(`/${p}/${area.endsWith('.js') ? area : `${area}.js`}`);
  }
  await js(`/${p}/journeys.js`);
}

function page(): Page {
  if (!m) return homePage(index);
  const [, section, a, b, c] = path();
  const q = new URLSearchParams(location.search);
  const missing: Page = { title: 'Nothing here', kicker: location.pathname, crumbs: [], actions: '', body: '' };
  switch (sections.parse(section, Section.screens)) {
    case Section.journeys: return a ? journeyPage(m, a) : journeysPage(m);
    case Section.foundations:
      switch (parts.parse(a, Part.colour)) {
        case Part.type: return typePage(m);
        case Part.shape: return shapePage(m);
        case Part.icons: return iconsPage(m);
        case Part.colour: return b ? tokenPage(m, b) : colourPage(m);
      }
      return missing;
    case Section.components: {
      if (!a) return componentsPage(m);
      const group = m.catalog.find((g) => slug(g.group) === a);
      if (!group) return missing;
      if (!b) return groupPage(m, group.group);
      const e = findEntry(m, a, b);
      if (!e) return missing;
      return c ? storyPage(m, e, Number(c) - 1, grounds.parse(q.get('ground'), Ground.screen)) : componentPage(m, e);
    }
    case Section.features: {
      const f = m.features.find((x) => slug(x) === a);
      return f ? featurePage(m, f) : missing;
    }
    case Section.navigation: return navigationPage(m, q.get('feature'));
    case Section.screens:
      if (!section) return overviewPage(m);
      return a ? screenPage(m, a) : screensPage(m);
  }
  return missing;
}

function draw() {
  resetLazy();
  const app = document.getElementById('app') as HTMLElement;
  const [, section, a, n] = path();
  const s = m && section === Section.screens && a && n ? m.byId.get(a) : null;
  if (s && new URLSearchParams(location.search).has('bare')) {
    const st = s.states[Number(n) - 1];
    /* check.ts --compare sizes the phone to its screenshot exactly, in fractional points if need be */
    const q = new URLSearchParams(location.search);
    for (const [k, v] of [['--phone-w', q.get('w')], ['--phone-h', q.get('h')]]) if (v && Number(v) > 0) document.documentElement.style.setProperty(k as string, `${Number(v)}px`);
    app.className = 'b-bare';
    try { app.innerHTML = st ? st.render() : ''; } catch (e) { app.innerHTML = `<div class="b-broken">${esc((e as Error).message)}</div>`; }
    return;
  }
  if (s) history.replaceState(null, '', url.state(platform as string, s.id, Number(n) - 1));
  const p = page();
  document.title = p.title.startsWith(index.name) ? p.title : `${p.title} · ${index.name}`;
  const crumbs = p.crumbs.length ? `<div class="b-crumbs">${p.crumbs.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join('<span>/</span>')}</div>` : '';
  app.className = m ? 'b-app' : 'b-app b-app--home';
  app.innerHTML = `
    ${top()}
    ${m ? `<aside class="b-side"><input class="b-side__filter" placeholder="Filter" aria-label="Filter the list">${tree(m)}</aside>` : ''}
    <main class="b-main">${crumbs}<div class="b-head"><div><h1>${esc(p.title)}</h1>${p.kicker ? `<p class="b-lede">${esc(p.kicker)}</p>` : ''}</div><div class="b-actions">${p.actions}</div></div>${p.body}</main>`;
  hydrate(app.querySelector('.b-main') as HTMLElement);
  wire(app);
  const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (target) target.scrollIntoView();
  else scrollTo(0, 0);
  app.querySelector('.b-side a.on')?.scrollIntoView({ block: 'center' });
}

function top() {
  const zoom = Number(localStorage.getItem('brandbook-zoom') ?? 0.65);
  return `<header class="b-top">
    <a class="b-brand" href="/"><span class="b-brand__name">${esc(index.name)}</span><span class="b-brand__tag">Brandbook</span></a>
    <nav class="b-platforms">${index.platforms.map((x) => `<a class="${x.id === platform ? 'on' : ''}" href="${switchTo(x.id)}">${esc(x.label)}<span>${x.screens.length}</span></a>`).join('')}</nav>
    <button class="b-searchbtn" type="button">Search screens, states, components, colours<kbd>⌘K</kbd></button>
    ${m ? `<div class="b-seg b-zoom" title="Phone size">${zooms.map((z) => `<button type="button" data-zoom="${z}" class="${z === zoom ? 'on' : ''}">${Math.round(z * 100)}%</button>`).join('')}</div>` : ''}
  </header>`;
}

/* The same place on another platform, as near as it has one. */
function switchTo(target: string) {
  const other = index.platforms.find((x) => x.id === target);
  const [p, section, a, b] = path();
  if (!other || !m || !p) return url.overview(target);
  const rest = location.pathname.slice(p.length + 1);
  switch (sections.parse(section, Section.screens)) {
    case Section.screens: {
      if (!section || !a) return `/${target}${rest}`;
      const id = twin(index, p, a, target);
      const feature = m.byId.get(a)?.feature ?? '';
      return id ? url.screen(target, id) : other.features.includes(feature) ? url.feature(target, feature) : url.screens(target);
    }
    case Section.features: return other.features.some((f) => slug(f) === a) ? `/${target}${rest}` : url.screens(target);
    case Section.journeys: return !a || other.journeys.some((j) => j.id === a) ? `/${target}${rest}` : url.journeys(target);
    case Section.components: {
      const group = m.catalog.find((g) => slug(g.group) === a)?.group;
      const name = m.entries.find((e) => slug(e.group) === a && e.slug === b)?.c.name;
      if (!group) return url.components(target);
      if (name && other.components.some((c) => c.group === group && c.name === name)) return `/${target}${rest}`;
      return other.components.some((c) => c.group === group) ? url.group(target, group) : url.components(target);
    }
    case Section.foundations:
    case Section.navigation: return `/${target}${rest}`;
  }
  return url.overview(target);
}

/* The tree on the left, as Storybook's: sections, folders, and the open component's stories. */
function tree(m: Model) {
  const p = m.here.id;
  const here = location.pathname;
  const link = (href: string, label: string, n: number | string, cls: string) => `<a class="${cls}${decodeURIComponent(here) === decodeURIComponent(href) ? ' on' : ''}" href="${href}"><span>${esc(label)}</span>${n === '' ? '' : `<i>${n}</i>`}</a>`;
  const open = (prefix: string) => (here.startsWith(prefix) ? ' open' : '');
  const screens = m.features.map((f) => {
    const list = m.screens.filter((s) => s.feature === f);
    const inside = list.some((s) => here === url.screen(p, s.id)) || here === url.feature(p, f);
    return `<details class="b-tree__folder"${inside ? ' open' : ''}><summary>${esc(f)}<i>${list.length}</i></summary>
      ${link(url.feature(p, f), 'All in this feature', '', 'b-tree__all')}${list.map((s) => link(url.screen(p, s.id), s.name, s.states.length, '')).join('')}</details>`;
  }).join('');
  const components = m.catalog.map((g) => {
    const list = m.entries.filter((e) => e.group === g.group);
    const base = url.group(p, g.group);
    return `<details class="b-tree__folder"${here === base || here.startsWith(`${base}/`) ? ' open' : ''}><summary>${esc(g.group)}<i>${list.length}</i></summary>
      ${list.map((e) => {
        const href = url.component(p, e.group, e.slug);
        const active = here === href || here.startsWith(`${href}/`);
        return `${link(href, e.c.name, e.c.demos.length, 'b-tree__comp')}${active ? `<div class="b-tree__stories">${e.c.demos.map((d, i) => link(url.story(p, e.group, e.slug, i), d.label, '', 'b-tree__story')).join('')}</div>` : ''}`;
      }).join('')}</details>`;
  }).join('');
  return `<nav class="b-tree">
    ${link(url.overview(p), 'Overview', '', 'b-tree__top')}
    <details class="b-tree__section"${open(url.journeys(p))} open><summary>Journeys<i>${m.journeys.length}</i></summary>${m.journeys.map((j) => link(url.journey(p, j.id), j.name, j.steps.length, '')).join('')}</details>
    <details class="b-tree__section" open><summary>Foundations</summary>${[['colour', 'Colour'], ['type', 'Type'], ['shape', 'Shape & space'], ['icons', 'Icons']].map(([k, label]) => link(url.foundations(p, k), label, '', '')).join('')}</details>
    <details class="b-tree__section" open><summary><a href="${url.screens(p)}">Screens</a><i>${m.counts.screens}</i></summary>${screens}</details>
    <details class="b-tree__section" open><summary><a href="${url.components(p)}">Components</a><i>${m.counts.components}</i></summary>${components}</details>
    ${link(url.navigation(p), 'Navigation', m.counts.edges, 'b-tree__top')}
  </nav>`;
}

function wire(app: HTMLElement) {
  const filter = app.querySelector<HTMLInputElement>('.b-side__filter');
  filter?.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    app.querySelectorAll<HTMLElement>('.b-tree a').forEach((a) => { a.hidden = Boolean(q) && !a.textContent?.toLowerCase().includes(q); });
    app.querySelectorAll<HTMLDetailsElement>('.b-tree details').forEach((d) => {
      if (q) d.open = [...d.querySelectorAll('a')].some((a) => !a.hidden);
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    localStorage.setItem('brandbook-zoom', b.dataset.zoom ?? '0.65');
    setZoom();
    app.querySelectorAll('[data-zoom]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  app.querySelector('.b-searchbtn')?.addEventListener('click', () => search(index, m));
  setZoom();
}

function setZoom() { document.documentElement.style.setProperty('--zoom', localStorage.getItem('brandbook-zoom') ?? '0.65'); }

/* A link inside this platform redraws in place; one to another platform, or out, loads as usual. */
function follow(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.origin !== location.origin) return;
  const to = new URL(a.href);
  const samePlatform = (to.pathname.split('/')[1] || null) === platform && platform !== null;
  if (!samePlatform) return;
  if (to.pathname === location.pathname && to.search === location.search && to.hash) return;
  e.preventDefault();
  history.pushState(null, '', to);
  draw();
}

function keys(e: KeyboardEvent) {
  const typing = e.target instanceof Element ? e.target.closest('input, textarea') : null;
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    search(index, m);
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  document.querySelector<HTMLAnchorElement>(`.b-actions [data-key="${e.key}"]`)?.click();
}
