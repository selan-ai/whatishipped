/* Screens: by feature, one feature, one screen in every state with what opens it, what it opens and what it is made of. */
import { cover, twin } from '../model.ts';
import type { Model } from '../model.ts';
import { componentLink, esc, how, matchChip, mini, phoneAt, plural, screenLink, sources, url } from '../ui.ts';
import { graph } from './navigation.ts';
import type { Page } from './page.ts';

const thumb = (m: Model, id: string, zoom: number) => {
  const s = m.byId.get(id);
  if (!s) return '';
  return `<a class="b-thumb" href="${url.screen(m.here.id, s.id)}">${phoneAt(() => s.states[cover(s, null)].render(), s.name, mini(m, zoom))}<span class="b-thumb__name">${esc(s.name)}</span><span class="b-thumb__n">${plural(s.states.length, 'state', 'states')}</span></a>`;
};

export function screensPage(m: Model): Page {
  const p = m.here.id;
  const cards = m.features.map((f) => {
    const list = m.screens.filter((s) => s.feature === f);
    const states = list.reduce((n, s) => n + s.states.length, 0);
    return `<a class="b-card b-feature" href="${url.feature(p, f)}">
      <div class="b-feature__thumbs">${list.slice(0, 4).map((s) => phoneAt(() => s.states[cover(s, null)].render(), s.name, mini(m, 0.2))).join('')}</div>
      <div class="b-card__title">${esc(f)}</div><div class="b-card__meta">${plural(list.length, 'screen', 'screens')} · ${plural(states, 'state', 'states')}</div>
      <div class="b-card__list">${list.map((s) => esc(s.name)).join(' · ')}</div></a>`;
  }).join('');
  return { title: 'Screens', kicker: `${plural(m.counts.screens, 'screen', 'screens')} in ${plural(m.features.length, 'feature', 'features')}, ${m.counts.states} states`, crumbs: [], actions: '', body: `<div class="b-cards b-cards--wide">${cards}</div>` };
}

export function featurePage(m: Model, feature: string): Page {
  const p = m.here.id;
  const list = m.screens.filter((s) => s.feature === feature);
  const ids = new Set(list.map((s) => s.id));
  const journeys = m.journeys.filter((j) => j.feature === feature || j.steps.some((st) => ids.has(st.screen)));
  const edges = m.edges.filter((e) => ids.has(e.fromId) || ids.has(e.to));
  return {
    title: feature,
    kicker: `${plural(list.length, 'screen', 'screens')} · ${plural(list.reduce((n, s) => n + s.states.length, 0), 'state', 'states')}`,
    crumbs: [['Screens', url.screens(p)]],
    actions: '',
    body: `<div class="b-thumbs">${list.map((s) => thumb(m, s.id, 0.36)).join('')}</div>
      ${journeys.length ? `<h2 class="b-h2">Journeys through ${esc(feature)}</h2><div class="b-chips">${journeys.map((j) => `<a class="b-chip b-chip--journey" href="${url.journey(p, j.id)}">${esc(j.name)}</a>`).join('')}</div>` : ''}
      ${edges.length ? `<h2 class="b-h2">How these screens connect</h2>${graph(m, m.screens.filter((s) => ids.has(s.id) || edges.some((e) => e.fromId === s.id || e.to === s.id)), edges)}` : ''}`,
  };
}

export function screenPage(m: Model, id: string): Page {
  const p = m.here.id;
  const s = m.byId.get(id);
  if (!s) return { title: 'No such screen', kicker: id, crumbs: [['Screens', url.screens(p)]], actions: '', body: '' };
  const ix = m.screenIx.get(id);
  const list = m.screens.filter((x) => x.feature === s.feature);
  const at = list.indexOf(s);
  const prev = list[at - 1];
  const next = list[at + 1];
  const from = m.edges.filter((e) => e.to === s.id);
  const row = (e: { how: Parameters<typeof how>[0] }, target: string) => `<li>${how(e.how)} ${screenLink(m, target)}</li>`;
  const others = m.index.platforms.filter((x) => x.id !== p).map((x) => ({ x, id: twin(m.index, p, s.id, x.id) })).filter((t) => t.id);
  const journeys = m.journeys.filter((j) => j.steps.some((st) => st.screen === s.id));
  /* Screenshots of the real app: beside the state they show, or on their own before the states. */
  const refs = ix?.refs ?? [];
  const app = (file: string) => `<img class="b-shot" src="${esc(file)}" alt="${esc(s.name)} in the app" loading="lazy">`;
  const loose = refs.filter((r) => !s.states.some((st) => st.name === r.state)).map((r, i) => `
    <figure class="b-phone" id="app-${i + 1}">
      <div class="b-phone__frame">${app(r.file)}</div>
      <figcaption><span class="b-phone__idx">App</span><span class="b-phone__name">In the app</span></figcaption>
    </figure>`).join('');
  const states = s.states.map((st, i) => {
    const shots = refs.filter((r) => r.state === st.name);
    return `
    <figure class="b-phone${shots.length ? ' b-phone--pair' : ''}" id="state-${i + 1}" style="--shots:${shots.length}">
      <div class="b-phone__frame">${shots.map((r) => app(r.file)).join('')}${phoneAt(() => st.render(), `${s.name} · ${st.name}`, 1)}</div>
      <figcaption><a class="b-phone__idx" href="#state-${i + 1}">${i + 1}</a><span class="b-phone__name">${esc(st.name)}${shots.length ? ` <span class="b-muted">· the app, then the drawing</span> ${shots.map((r) => matchChip(r.match)).join(' ')}` : ''}</span></figcaption>
    </figure>`;
  }).join('');
  const comps = ix?.components ?? [];
  return {
    title: s.name,
    kicker: '',
    crumbs: [['Screens', url.screens(p)], [s.feature, url.feature(p, s.feature)]],
    actions: `${prev ? `<a class="b-btn" href="${url.screen(p, prev.id)}" data-key="ArrowLeft">← ${esc(prev.name)}</a>` : ''}${next ? `<a class="b-btn" href="${url.screen(p, next.id)}" data-key="ArrowRight">${esc(next.name)} →</a>` : ''}`,
    body: `
      <div class="b-meta">
        <span>${plural(s.states.length, 'state', 'states')}</span>
        ${refs.length ? `<span>${plural(refs.length, 'screenshot', 'screenshots')} of the app</span>` : '<span class="b-muted">No screenshot of the app</span>'}
        ${others.map((t) => `<a class="b-chip b-chip--platform" href="${url.screen(t.x.id, t.id as string)}">Same screen on ${esc(t.x.label)} →</a>`).join('')}
        ${sources(m, ix?.source ?? [])}
      </div>
      <nav class="b-jump">${loose ? '<a href="#app-1">In the app</a>' : ''}${s.states.map((st, i) => `<a href="#state-${i + 1}">${i + 1}. ${esc(st.name)}</a>`).join('')}</nav>
      <div class="b-phones">${loose}${states}</div>
      <div class="b-panels">
        <section class="b-panel"><h3>Opened from</h3><ul class="b-rows">${from.map((e) => row(e, e.fromId)).join('') || '<li class="b-muted">Nothing</li>'}</ul></section>
        <section class="b-panel"><h3>Opens</h3><ul class="b-rows">${(s.opens ?? []).map((e) => row(e, e.to)).join('') || '<li class="b-muted">Nothing</li>'}</ul></section>
        <section class="b-panel"><h3>Built from ${plural(comps.length, 'component', 'components')}</h3><div class="b-chips">${comps.map((k) => componentLink(m, k)).join('') || '<span class="b-muted">None</span>'}</div></section>
        ${journeys.length ? `<section class="b-panel"><h3>On ${plural(journeys.length, 'journey', 'journeys')}</h3><div class="b-chips">${journeys.map((j) => `<a class="b-chip b-chip--journey" href="${url.journey(p, j.id)}">${esc(j.name)}</a>`).join('')}</div></section>` : ''}
      </div>`,
  };
}

