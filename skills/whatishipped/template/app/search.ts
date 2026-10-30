/*
 * ⌘K: one box for every screen, state, component, journey, feature and colour, on this platform first and then on
 * the others. Every word typed must appear; a name that starts with the words ranks first.
 */
import type { Model } from './model.ts';
import { slug } from './model.ts';
import type { Index } from './types.ts';
import { esc, url } from './ui.ts';

type Hit = { label: string; sub: string; kind: string; href: string; rank: number };

function hits(index: Index, m: Model | null): Hit[] {
  const out: Hit[] = [];
  const order = [...index.platforms].sort((a, b) => Number(b.id === m?.here.id) - Number(a.id === m?.here.id));
  order.forEach((p, n) => {
    const where = n === 0 && m ? '' : ` · ${p.label}`;
    const add = (label: string, sub: string, kind: string, href: string) => out.push({ label, sub: sub + where, kind, href, rank: n });
    for (const j of p.journeys) add(j.name, j.feature, 'Journey', url.journey(p.id, j.id));
    for (const f of p.features) add(f, 'Feature', 'Feature', url.feature(p.id, f));
    for (const s of p.screens) {
      add(s.name, s.feature, 'Screen', url.screen(p.id, s.id));
      s.states.forEach((st, i) => add(`${s.name} · ${st}`, s.feature, 'State', url.state(p.id, s.id, i)));
    }
    for (const c of p.components) add(c.name, c.group, 'Component', `/${p.id}/components/${slug(c.group)}/${m && m.here.id === p.id ? (m.entry.get(c.key)?.slug ?? slug(c.name)) : slug(c.name)}`);
    for (const t of p.tokens) add(t.name, `${t.group} · ${t.css}`, 'Colour', url.token(p.id, t.css));
  });
  return out;
}

export function search(index: Index, m: Model | null) {
  if (document.querySelector('.b-palette')) return;
  const all = hits(index, m);
  const box = document.createElement('div');
  box.className = 'b-palette';
  box.innerHTML = '<div class="b-palette__panel"><input placeholder="Search screens, states, components, journeys, colours" aria-label="Search"><div class="b-palette__list"></div></div>';
  document.body.appendChild(box);
  const input = box.querySelector('input') as HTMLInputElement;
  const list = box.querySelector('.b-palette__list') as HTMLElement;
  let shown: Hit[] = [];
  let at = 0;
  const close = () => box.remove();
  const go = (h: Hit | undefined) => {
    if (!h) return;
    close();
    const a = Object.assign(document.createElement('a'), { href: h.href });
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const paint = () => {
    list.innerHTML = shown.map((h, i) => `<a class="b-palette__hit${i === at ? ' on' : ''}" href="${h.href}" data-i="${i}"><i>${esc(h.kind)}</i><span>${esc(h.label)}</span><em>${esc(h.sub)}</em></a>`).join('') || '<div class="b-palette__none">Nothing by that name.</div>';
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const find = () => {
    const q = input.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const kinds = ['Journey', 'Screen', 'Component', 'Feature', 'Colour', 'State'];
    shown = (words.length ? all.filter((h) => words.every((w) => `${h.label} ${h.sub} ${h.kind}`.toLowerCase().includes(w))) : all.filter((h) => h.kind !== 'State'))
      .map((h) => ({ h, score: h.rank * 10 + (h.label.toLowerCase().startsWith(q) ? 0 : 3) + kinds.indexOf(h.kind) * 0.1 }))
      .sort((a, b) => a.score - b.score).slice(0, 60).map((x) => x.h);
    at = 0;
    paint();
  };
  input.addEventListener('input', find);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { at = Math.min(shown.length - 1, at + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { at = Math.max(0, at - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter') go(shown[at]);
    if (e.key === 'Escape') close();
  });
  list.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!a) return;
    e.preventDefault();
    go(shown[Number(a.dataset.i)]);
  });
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  find();
  input.focus();
}
