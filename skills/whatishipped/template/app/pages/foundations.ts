/* Foundations: colour (each token with what paints with it), type, shape and space, icons. */
import { cover } from '../model.ts';
import type { Model } from '../model.ts';
import type { Token } from '../types.ts';
import { componentLink, esc, mini, phoneAt, plural, url } from '../ui.ts';
import type { Page } from './page.ts';

const css = () => getComputedStyle(document.documentElement);
const value = (t: Token) => (t.css ? css().getPropertyValue(t.css).trim() : t.value ?? '');
const paint = (t: Token) => (t.css ? `var(${t.css})` : t.value ?? 'transparent');
const crumbs: [string, string][] = [];

/* Who paints with a colour, from the server's index. */
const users = (m: Model, cssVar: string) => ({
  components: m.here.components.filter((c) => c.tokens.includes(cssVar)).map((c) => c.key),
  screens: m.here.screens.filter((s) => s.tokens.includes(cssVar)).map((s) => s.id),
});

export function colourPage(m: Model): Page {
  const p = m.here.id;
  const body = m.F.colours.map((g) => `
    <section class="b-swgroup"><h2 class="b-h2">${esc(g.group)}</h2><div class="b-swatches">${g.tokens.map((t) => {
      const u = t.css ? users(m, t.css) : null;
      const inner = `<span class="b-sw__chip" style="background:${paint(t)}"></span><span class="b-sw__name">${esc(t.name)}</span><span class="b-sw__val">${esc(value(t))}</span>
        <span class="b-sw__use">${u ? (u.components.length + u.screens.length ? `${plural(u.components.length, 'component', 'components')} · ${plural(u.screens.length, 'screen', 'screens')}` : 'not used in any drawing') : 'a literal in the code'}</span>`;
      return t.css ? `<a class="b-sw" href="${url.token(p, t.css)}">${inner}</a>` : `<div class="b-sw">${inner}</div>`;
    }).join('')}</div></section>`).join('');
  return { title: 'Colour', kicker: '', crumbs, actions: '', body };
}

export function tokenPage(m: Model, name: string): Page {
  const p = m.here.id;
  const cssVar = `--${name}`;
  const group = m.F.colours.find((g) => g.tokens.some((t) => t.css === cssVar));
  const t = group?.tokens.find((x) => x.css === cssVar);
  if (!group || !t) return { title: 'No such colour', kicker: cssVar, crumbs: [['Colour', url.foundations(p, 'colour')]], actions: '', body: '' };
  const u = users(m, cssVar);
  return {
    title: t.name, kicker: `${group.group} · ${cssVar} · ${value(t)}`, crumbs: [['Colour', url.foundations(p, 'colour')]], actions: '',
    body: `<div class="b-bigswatch" style="background:${paint(t)}"></div>
      <h2 class="b-h2">Components that paint with it <span class="b-count">${u.components.length}</span></h2>
      <div class="b-chips">${u.components.map((k) => componentLink(m, k)).join('') || '<span class="b-muted">None.</span>'}</div>
      <h2 class="b-h2">Screens that show it <span class="b-count">${u.screens.length}</span></h2>
      <div class="b-thumbs">${u.screens.map((id) => {
        const s = m.byId.get(id);
        return s ? `<a class="b-thumb" href="${url.screen(p, id)}">${phoneAt(() => s.states[cover(s, null)].render(), s.name, mini(m, 0.24))}<span class="b-thumb__name">${esc(s.name)}</span></a>` : '';
      }).join('') || '<span class="b-muted">None.</span>'}</div>`,
  };
}

export function typePage(m: Model): Page {
  return {
    title: 'Type', kicker: plural(m.F.type.length, 'style', 'styles'), crumbs, actions: '',
    body: `<div class="b-type" style="background:var(--screen-ground)">${m.F.type.map((t) => `
      <div class="b-type__row"><div class="b-type__meta"><div>${esc(t.name)}</div><div class="b-mono">${esc(t.spec)}</div></div><div class="${esc(t.cls ?? '')}" style="${esc(t.style ?? '')}">${esc(t.sample)}</div></div>`).join('')}</div>`,
  };
}

export function shapePage(m: Model): Page {
  const F = m.F;
  return {
    title: 'Shape & space', kicker: '', crumbs, actions: '',
    body: `<div class="b-shape">
      <section><h2 class="b-h2">Radius</h2><div class="b-swatches">${F.radii.map((r) => `<div class="b-sw"><span class="b-radius" style="border-radius:${paint(r)}"></span><span class="b-sw__name">${esc(r.name)}</span><span class="b-sw__val">${esc(value(r))}</span></div>`).join('')}</div></section>
      <section><h2 class="b-h2">Spacing</h2><div class="b-space">${F.spacing.map((s) => `<div class="b-space__row"><span class="b-mono">${esc(s.name)}</span><span class="b-space__bar" style="width:${paint(s)}"></span><span class="b-mono">${esc(value(s))}</span></div>`).join('')}</div></section>
    </div>`,
  };
}

export function iconsPage(m: Model): Page {
  const I = (window as unknown as { Icons: { names: string[]; icon: (n: string, s: number, w: string) => string; source: (n: string) => string } }).Icons;
  return {
    title: 'Icons', kicker: plural(I.names.length, 'icon', 'icons'), crumbs, actions: '',
    body: `<div class="b-icons">${I.names.map((n) => `<div class="b-icon">${I.icon(n, 24, 'medium')}<span>${esc(n)}</span><span class="b-icon__sym">${esc(I.source(n))}</span></div>`).join('')}</div>`,
  };
}
