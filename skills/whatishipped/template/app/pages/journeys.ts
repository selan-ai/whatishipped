/*
 * Journeys: what a person does, step by step, as the screens and states they pass through. Between two steps, the
 * arrow the code has for that move (Screen.opens); a return to a screen already on the journey; or a mark that the
 * code's map does not have the move.
 */
import type { Model } from '../model.ts';
import type { Journey } from '../types.ts';
import { esc, how, mini, phoneAt, plural, url } from '../ui.ts';
import type { Page } from './page.ts';

const chain = (m: Model, j: Journey) => j.steps.map((st) => esc(m.byId.get(st.screen)?.name ?? st.screen)).filter((x, i, all) => x !== all[i - 1]).join(' → ');

export function journeysPage(m: Model): Page {
  const p = m.here.id;
  const cards = m.journeys.map((j) => `<a class="b-card b-journey" href="${url.journey(p, j.id)}">
      <div class="b-journey__thumbs">${j.steps.slice(0, 5).map((st) => {
        const s = m.byId.get(st.screen);
        const at = s ? Math.max(0, s.states.findIndex((x) => x.name === st.state)) : 0;
        return s ? phoneAt(() => s.states[at].render(), s.name, mini(m, 0.14)) : '';
      }).join('')}</div>
      <div class="b-card__title">${esc(j.name)}</div><div class="b-card__meta">${esc(j.feature)} · ${plural(j.steps.length, 'step', 'steps')} · ${esc(j.who)}</div>
      <div class="b-card__list">${chain(m, j)}</div></a>`).join('');
  return {
    title: 'Journeys', kicker: m.journeys.length ? plural(m.journeys.length, 'journey', 'journeys') : 'No journeys yet',
    crumbs: [], actions: '', body: `<div class="b-cards b-cards--wide">${cards}</div>`,
  };
}

export function journeyPage(m: Model, id: string): Page {
  const p = m.here.id;
  const j = m.journeys.find((x) => x.id === id);
  if (!j) return { title: 'No such journey', kicker: id, crumbs: [['Journeys', url.journeys(p)]], actions: '', body: '' };
  const others = m.index.platforms.filter((x) => x.id !== p && x.journeys.some((o) => o.id === j.id));
  const zoom = mini(m, 0.5);
  const steps = j.steps.map((st, i) => {
    const s = m.byId.get(st.screen);
    const at = s ? s.states.findIndex((x) => x.name === st.state) : -1;
    const next = j.steps[i + 1];
    const edge = next && next.screen !== st.screen ? m.edges.find((e) => e.fromId === st.screen && e.to === next.screen) : null;
    /* Back to a screen an earlier step was on: the sheet or page closes, which no opens entry says. */
    const back = Boolean(next && !edge && j.steps.slice(0, i).some((x) => x.screen === next.screen));
    const move = !next ? '' : `<div class="b-move">
        <div class="b-move__arrow">→</div>
        <div class="b-move__what">${esc(st.action)}</div>
        ${next.screen === st.screen ? '<span class="b-muted">same screen</span>' : edge ? how(edge.how) : back ? '<span class="b-muted">closes, back to where it came from</span>' : '<span class="b-chip b-chip--warn" title="No Screen.opens entry for this move">not in the code\'s map</span>'}
      </div>`;
    const phone = s && at >= 0 ? phoneAt(() => s.states[at].render(), `${s.name} · ${st.state}`, zoom) : `<div class="b-missing">${esc(st.screen)} · ${esc(st.state)}<br>not on this board</div>`;
    return `<div class="b-step"><div class="b-step__head"><span class="b-step__n">${i + 1}</span><div>${s ? `<a href="${url.state(p, s.id, at)}">${esc(s.name)}</a>` : esc(st.screen)}<div class="b-muted">${esc(st.state)}</div></div></div>${phone}</div>${move}`;
  }).join('');
  return {
    title: j.name, kicker: j.goal, crumbs: [['Journeys', url.journeys(p)]],
    actions: others.map((x) => `<a class="b-btn" href="${url.journey(x.id, j.id)}">Same journey on ${esc(x.label)} →</a>`).join(''),
    body: `<div class="b-meta"><span>${esc(j.who)}</span><span>${esc(j.feature)}</span><span>${plural(j.steps.length, 'step', 'steps')}</span></div><div class="b-track" style="--step:${zoom}">${steps}</div>`,
  };
}
