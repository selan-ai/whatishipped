/*
 * The brandbook's front page, across platforms, drawn from the server's index alone (no platform's styles are loaded
 * here, so no phones); and each platform's overview.
 */
import { cover } from '../model.ts';
import type { Model } from '../model.ts';
import type { Index } from '../types.ts';
import { esc, matchChip, mini, phoneAt, plural, url } from '../ui.ts';
import type { Page } from './page.ts';

export function homePage(index: Index): Page {
  const all = index.platforms;
  const features = [...new Set(all.flatMap((p) => p.features))];
  const journeys = [...new Map(all.flatMap((p) => p.journeys.map((j) => [j.id, j]))).values()];
  const cell = (p: Index['platforms'][number], f: string) => {
    const list = p.screens.filter((s) => s.feature === f);
    return list.length ? `<a href="${url.feature(p.id, f)}">${plural(list.length, 'screen', 'screens')} · ${list.reduce((n, s) => n + s.states.length, 0)} states</a>` : '<span class="b-muted">not drawn</span>';
  };
  const platforms = all.map((p) => {
    const states = p.screens.reduce((n, s) => n + s.states.length, 0);
    const stories = p.components.reduce((n, c) => n + c.stories.length, 0);
    const edges = p.screens.reduce((n, s) => n + s.opens.length, 0);
    return `<a class="b-card b-platform" href="${url.overview(p.id)}">
      <div class="b-platform__name">${esc(p.label)}</div><div class="b-card__meta">${esc(p.device)}</div>
      <div class="b-stats">${[[p.screens.length, 'screens'], [states, 'states'], [p.components.length, 'components'], [stories, 'stories'], [p.journeys.length, 'journeys'], [edges, 'arrows']].map(([n, l]) => `<div><b>${n}</b>${l}</div>`).join('')}</div>
      <span class="b-btn">Open ${esc(p.label)} →</span></a>`;
  }).join('');
  return {
    title: index.name, kicker: index.sub, crumbs: [], actions: '',
    body: `<div class="b-cards b-cards--two">${platforms}</div>
      ${journeys.length ? `<h2 class="b-h2">Journeys</h2><table class="b-table"><thead><tr><th>Journey</th>${all.map((p) => `<th>${esc(p.label)}</th>`).join('')}</tr></thead><tbody>${journeys.map((j) => `<tr><td><b>${esc(j.name)}</b></td>${all.map((p) => {
        const here = p.journeys.find((x) => x.id === j.id);
        return `<td>${here ? `<a href="${url.journey(p.id, j.id)}">${plural(here.steps.length, 'step', 'steps')}</a>` : '<span class="b-muted">not drawn</span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>` : ''}
      <h2 class="b-h2">Features</h2><table class="b-table"><thead><tr><th>Feature</th>${all.map((p) => `<th>${esc(p.label)}</th>`).join('')}</tr></thead><tbody>${features.map((f) => `<tr><td><b>${esc(f)}</b></td>${all.map((p) => `<td>${cell(p, f)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
  };
}

export function overviewPage(m: Model): Page {
  const p = m.here.id;
  const F = m.F;
  const c = m.counts;
  const tiles = [[c.screens, 'screens', url.screens(p)], [c.states, 'states', url.screens(p)], [c.components, 'components', url.components(p)], [c.stories, 'stories', url.components(p)], [c.journeys, 'journeys', url.journeys(p)], [c.edges, 'arrows', url.navigation(p)]]
    .map(([n, l, href]) => `<a href="${href}"><b>${n}</b>${l}</a>`).join('');
  const features = m.features.map((f) => {
    const list = m.screens.filter((s) => s.feature === f);
    return `<a class="b-card b-feature" href="${url.feature(p, f)}"><div class="b-feature__thumbs">${list.slice(0, 4).map((s) => phoneAt(() => s.states[cover(s, null)].render(), s.name, mini(m, 0.2))).join('')}</div>
      <div class="b-card__title">${esc(f)}</div><div class="b-card__meta">${plural(list.length, 'screen', 'screens')} · ${plural(list.reduce((n, s) => n + s.states.length, 0), 'state', 'states')}</div></a>`;
  }).join('');
  const problems = m.here.problems;
  /* How the drawings stand against the app's screenshots, worst first. */
  const shot = m.here.screens.filter((s) => s.refs.length);
  const measured = m.here.screens.flatMap((s) => s.refs.flatMap((r) => (r.match === null ? [] : [{ s, r }]))).sort((a, b) => (a.r.match as number) - (b.r.match as number));
  const mean = measured.length ? Math.round(measured.reduce((n, x) => n + (x.r.match as number), 0) / measured.length) : 0;
  const against = `<h2 class="b-h2">Against the app</h2>
    <p class="b-lede">${shot.length ? `${shot.length} of ${plural(m.here.screens.length, 'screen', 'screens')} with screenshots${measured.length ? ` · ${mean}% on average` : ''}` : 'No screenshot of the app'}</p>
    ${measured.length ? `<h3 class="b-h3">${measured.length > 8 ? `The 8 that match least, of ${measured.length}` : 'Each, the least matching first'}</h3><ul class="b-rows">${measured.slice(0, 8).map(({ s, r }) => `<li>${matchChip(r.match, m.here.system)} <a href="${url.state(p, s.id, s.states.indexOf(r.state as string))}">${esc(s.name)} · ${esc(r.state)}</a></li>`).join('')}</ul>` : ''}`;
  return {
    title: F.app.name, kicker: `${F.device.name}, ${F.device.width} × ${F.device.height}`, crumbs: [], actions: '',
    body: `<div class="b-stats b-stats--big">${tiles}</div>
      ${problems.length ? `<div class="b-gaps b-gaps--bad"><b>The board has problems</b><ul>${problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${m.journeys.length ? `<h2 class="b-h2">Journeys</h2><div class="b-chips">${m.journeys.map((j) => `<a class="b-chip b-chip--journey" href="${url.journey(p, j.id)}">${esc(j.name)}</a>`).join('')}</div>` : ''}
      ${against}
      <h2 class="b-h2">Features</h2><div class="b-cards b-cards--wide">${features}</div>
      ${F.systems.length > 1 ? `<h2 class="b-h2">Design systems in the code</h2><div class="b-systems">${F.systems.map((x) => `<div class="b-system"><div class="b-system__name">${esc(x.name)}</div><div class="b-system__use">${esc(x.use)}</div></div>`).join('')}</div>` : ''}`,
  };
}
