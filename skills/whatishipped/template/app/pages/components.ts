/*
 * Components, laid out as Storybook does: groups, then a component's docs (its stories, where it is defined, which
 * screens and components use it, which colours it paints with), then one story alone on a canvas.
 */
import type { Entry, Model } from '../model.ts';
import { cover, slug } from '../model.ts';
import { Ground, grounds } from '../types.ts';
import type { Demo } from '../types.ts';
import { componentLink, esc, lazy, phoneAt, plural, sources, url } from '../ui.ts';
import type { Page } from './page.ts';

const demo = (e: Entry, d: Demo) => lazy(() => d.render(), `${e.c.name} · ${d.label}`, `b-demo__in${d.wide ? ' b-demo__in--wide' : ''}${d.bleed ? ' b-demo__in--bleed' : ''}`, '');
const preview = (e: Entry) => (e.c.demos[0] ? `<div class="b-preview">${demo(e, e.c.demos[0])}</div>` : '<div class="b-preview b-muted">No stories</div>');
const meta = (e: Entry) => `${plural(e.c.demos.length, 'story', 'stories')}${e.ix.usedIn.length ? ` · on ${plural(e.ix.usedIn.length, 'screen', 'screens')}` : ''}`;

export function componentsPage(m: Model): Page {
  const p = m.here.id;
  const cards = m.catalog.map((g) => {
    const list = m.entries.filter((e) => e.group === g.group);
    return `<a class="b-card" href="${url.group(p, g.group)}">${preview(list[0])}
      <div class="b-card__title">${esc(g.group)}</div>
      <div class="b-card__meta">${plural(list.length, 'component', 'components')} · ${plural(list.reduce((n, e) => n + e.c.demos.length, 0), 'story', 'stories')}</div>
      <div class="b-card__list">${list.slice(0, 12).map((e) => esc(e.c.name)).join(' · ')}${list.length > 12 ? ` · ${list.length - 12} more` : ''}</div></a>`;
  }).join('');
  return { title: 'Components', kicker: `${plural(m.counts.components, 'component', 'components')} in ${plural(m.catalog.length, 'group', 'groups')}, ${m.counts.stories} stories`, crumbs: [], actions: '', body: `<div class="b-cards">${cards}</div>` };
}

export function groupPage(m: Model, group: string): Page {
  const p = m.here.id;
  const list = m.entries.filter((e) => e.group === group);
  return {
    title: group, kicker: `${plural(list.length, 'component', 'components')}`, crumbs: [['Components', url.components(p)]], actions: '',
    body: `<div class="b-cards">${list.map((e) => `<a class="b-card" href="${url.component(p, e.group, e.slug)}">${preview(e)}
      <div class="b-card__title b-mono-title">${esc(e.c.name)}</div><div class="b-card__meta">${meta(e)}</div></a>`).join('')}</div>`,
  };
}

export function componentPage(m: Model, e: Entry): Page {
  const p = m.here.id;
  const used = e.ix.usedIn.map((u) => ({ u, s: m.byId.get(u.screen) })).filter((x) => x.s);
  const swatches = e.ix.tokens.map((css) => {
    const t = m.here.tokens.find((x) => x.css === css);
    return t ? `<a class="b-token" href="${url.token(p, css)}"><span class="b-token__chip" style="background:var(${css})"></span>${esc(t.name)}</a>` : '';
  }).join('');
  return {
    title: e.c.name, kicker: '', crumbs: [['Components', url.components(p)], [e.group, url.group(p, e.group)]], actions: '',
    body: `
      <div class="b-meta"><span>${meta(e)}</span><span class="b-meta__label">Defined in</span>${sources(m, e.ix.source)}</div>
      <h2 class="b-h2">Stories</h2>
      <div class="b-stories">${e.c.demos.map((d, i) => `
        <div class="b-story"><div class="b-story__canvas">${demo(e, d)}</div>
          <a class="b-story__label" href="${url.story(p, e.group, e.slug, i)}">${esc(d.label)}<span>Open ↗</span></a></div>`).join('')}
      </div>
      <h2 class="b-h2">Used on ${plural(used.length, 'screen', 'screens')}</h2>
      ${used.length ? `<div class="b-refs">${used.map(({ u, s }) => s ? `
        <div class="b-ref">${phoneAt(() => s.states[cover(s, u.states)].render(), s.name, 0.22)}
          <div><a class="b-ref__name" href="${url.screen(p, s.id)}">${esc(s.name)}</a><div class="b-muted">${esc(s.feature)}</div>
          <div class="b-ref__states">${u.states.map((i) => `<a href="${url.state(p, s.id, i)}">${esc(s.states[i].name)}</a>`).join('')}</div></div></div>` : '').join('')}</div>`
        : '<p class="b-muted">None</p>'}
      <div class="b-panels">
        <section class="b-panel"><h3>Made of</h3><div class="b-chips">${e.ix.uses.map((k) => componentLink(m, k)).join('') || '<span class="b-muted">None</span>'}</div></section>
        <section class="b-panel"><h3>Inside</h3><div class="b-chips">${e.ix.usedBy.map((k) => componentLink(m, k)).join('') || '<span class="b-muted">None</span>'}</div></section>
        <section class="b-panel"><h3>Colours</h3><div class="b-chips">${swatches || '<span class="b-muted">None</span>'}</div></section>
      </div>`,
  };
}

export function storyPage(m: Model, e: Entry, i: number, ground: Ground): Page {
  const p = m.here.id;
  const d = e.c.demos[i];
  if (!d) return componentPage(m, e);
  const here = url.story(p, e.group, e.slug, i);
  return {
    title: `${e.c.name} · ${d.label}`, kicker: '',
    crumbs: [['Components', url.components(p)], [e.group, url.group(p, e.group)], [e.c.name, url.component(p, e.group, e.slug)]],
    actions: `<div class="b-seg b-seg--caps">${grounds.values.map((g) => `<a class="${g === ground ? 'on' : ''}" href="${here}?ground=${g}">${esc(g)}</a>`).join('')}</div>`,
    body: `
      <div class="b-canvas b-canvas--${ground}">${demo(e, d)}</div>
      <div class="b-storylist">${e.c.demos.map((x, n) => `<a class="${n === i ? 'on' : ''}" href="${url.story(p, e.group, e.slug, n)}${ground === Ground.screen ? '' : `?ground=${ground}`}">${esc(x.label)}</a>`).join('')}</div>
      <div class="b-meta"><span class="b-meta__label">Defined in</span>${sources(m, e.ix.source)}</div>`,
  };
}

export const findEntry = (m: Model, groupSlug: string, nameSlug: string) => m.entries.find((e) => slug(e.group) === groupSlug && e.slug === nameSlug) ?? null;
