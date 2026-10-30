/*
 * The map of what opens what. First the features against each other, how many ways lead from one to another; a
 * feature's own map shows its screens and their neighbours, in columns by how far each is from a screen nothing opens.
 */
import type { Edge, Model } from '../model.ts';
import { slug } from '../model.ts';
import type { How, Screen } from '../types.ts';
import { hows } from '../types.ts';
import { esc, how, plural, screenLink, url } from '../ui.ts';
import type { Page } from './page.ts';

type Node = { id: string; name: string; rank: number; href: string };
type Arrow = { fromId: string; to: string; how: How; title: string };

function draw(nodes: Node[], arrows: Arrow[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inside = arrows.filter((e) => byId.has(e.fromId) && byId.has(e.to) && e.fromId !== e.to);
  if (!inside.length) return '<p class="b-muted">No arrows between these.</p>';
  const into = new Set(inside.map((e) => e.to));
  const depth = new Map<string, number>();
  const queue = nodes.filter((n) => !into.has(n.id)).map((n) => n.id);
  if (!queue.length) queue.push(nodes[0].id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift() as string;
    for (const e of inside) if (e.fromId === id && !depth.has(e.to)) { depth.set(e.to, (depth.get(id) ?? 0) + 1); queue.push(e.to); }
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0);
  const cols: Node[][] = [];
  for (const n of nodes) (cols[depth.get(n.id) ?? 0] ??= []).push(n);
  const W = 196, H = 34, GX = 96, GY = 12;
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((col, c) => col.sort((a, b) => a.rank - b.rank).forEach((n, r) => pos.set(n.id, { x: 20 + c * (W + GX), y: 20 + r * (H + GY) })));
  const width = 40 + cols.length * (W + GX) - GX;
  const height = 40 + Math.max(...cols.map((c) => c.length)) * (H + GY);
  const paths = inside.map((e) => {
    const a = pos.get(e.fromId) as { x: number; y: number };
    const b = pos.get(e.to) as { x: number; y: number };
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
    const d = x2 <= a.x ? `M${a.x},${y1} C${a.x - 60},${y1} ${b.x + W + 60},${y2} ${b.x + W},${y2}` : `M${x1},${y1} C${x1 + 48},${y1} ${x2 - 48},${y2} ${x2},${y2}`;
    return `<path class="b-edge b-edge--${hows.parse(e.how, 'push')}" d="${d}"><title>${esc(e.title)}</title></path>`;
  }).join('');
  const boxes = [...pos].map(([id, { x, y }]) => `<a href="${byId.get(id)?.href}"><rect class="b-node" x="${x}" y="${y}" width="${W}" height="${H}" rx="9"/><text class="b-node__text" x="${x + 12}" y="${y + 21}">${esc(byId.get(id)?.name)}</text></a>`).join('');
  return `<div class="b-legend">${hows.values.map(how).join('')}</div><div class="b-graph"><svg width="${width}" height="${height}">${paths}${boxes}</svg></div>`;
}

/* Screens and the arrows between them. */
export function graph(m: Model, screens: Screen[], edges: Edge[]) {
  const names = new Map(m.screens.map((s) => [s.id, s.name]));
  return draw(
    screens.map((s) => ({ id: s.id, name: s.name, rank: m.features.indexOf(s.feature), href: url.screen(m.here.id, s.id) })),
    edges.map((e) => ({ fromId: e.fromId, to: e.to, how: e.how, title: `${names.get(e.fromId)} → ${names.get(e.to) ?? e.to} (${e.how}${e.from ? `, ${e.from}` : ''})` })),
  );
}

/* Features against features: how many ways lead from a row's screens to a column's, darker for more. */
function matrix(m: Model) {
  const feature = new Map(m.screens.map((s) => [s.id, s.feature]));
  const count = (a: string, b: string) => m.edges.filter((e) => feature.get(e.fromId) === a && feature.get(e.to) === b);
  const cells = m.features.map((a) => m.features.map((b) => count(a, b)));
  const max = Math.max(1, ...cells.flat().map((list) => list.length));
  const kinds = (list: Edge[]) => hows.values.map((h) => [h, list.filter((e) => e.how === h).length] as const).filter(([, n]) => n).map(([h, n]) => `${n} ${h}`).join(', ');
  const head = m.features.map((f) => `<th><span>${esc(f)}</span></th>`).join('');
  const rows = m.features.map((a, i) => `<tr><th><a href="${url.navigation(m.here.id)}?feature=${slug(a)}">${esc(a)}</a></th>${m.features.map((b, j) => {
    const list = cells[i][j];
    if (!list.length) return '<td></td>';
    const tone = i === j ? 'background:rgba(255,255,255,.04)' : `background:rgba(139,108,255,${(0.1 + 0.75 * (list.length / max)).toFixed(2)})`;
    return `<td style="${tone}" title="${esc(`${a} → ${b}: ${plural(list.length, 'way', 'ways')} (${kinds(list)})`)}"><a href="${url.navigation(m.here.id)}?feature=${slug(a)}">${list.length}</a></td>`;
  }).join('')}</tr>`).join('');
  return `<table class="b-matrix"><thead><tr><th class="b-matrix__corner">From ↓ · to →</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function navigationPage(m: Model, feature: string | null): Page {
  const p = m.here.id;
  const all = feature === 'all';
  const f = m.features.find((x) => slug(x) === feature) ?? null;
  const ids = new Set(m.screens.filter((s) => all || s.feature === f).map((s) => s.id));
  const edges = m.edges.filter((e) => all || ids.has(e.fromId) || ids.has(e.to));
  const shown = m.screens.filter((s) => ids.has(s.id) || edges.some((e) => e.fromId === s.id || e.to === s.id));
  const off = [...new Set(edges.filter((e) => !m.byId.has(e.to)).map((e) => e.to))].sort();
  const table = `<table class="b-navtable"><thead><tr><th>From</th><th>How</th><th>To</th></tr></thead><tbody>${edges.map((e) => `<tr><td>${screenLink(m, e.fromId)}</td><td>${how(e.how)}</td><td>${screenLink(m, e.to)}</td></tr>`).join('')}</tbody></table>`;
  const tab = (key: string | null, label: string, on: boolean) => `<a class="${on ? 'on' : ''}" href="${url.navigation(p)}${key ? `?feature=${key}` : ''}">${esc(label)}</a>`;
  return {
    title: f ?? (all ? 'Navigation · every screen' : 'Navigation'),
    kicker: !m.edges.length ? 'No screen on this board says what it opens yet.' : f ? `${plural(edges.length, 'way', 'ways')} into, out of and inside ${f}` : plural(m.edges.length, 'way', 'ways'),
    crumbs: f || all ? [['Navigation', url.navigation(p)]] : [], actions: '',
    body: `<div class="b-seg b-seg--wrap">${tab(null, 'Features', !f && !all)}${m.features.map((x) => tab(slug(x), x, x === f)).join('')}${tab('all', 'Every screen', all)}</div>
      ${!m.edges.length ? '' : f || all ? graph(m, shown, edges) : matrix(m)}
      ${off.length ? `<h2 class="b-h2">Opened but not drawn <span class="b-count">${off.length}</span></h2><div class="b-chips">${off.map((id) => screenLink(m, id)).join('')}</div>` : ''}
      ${edges.length ? `<details class="b-details"><summary>Every way in and out, as a table (${edges.length})</summary>${table}</details>` : ''}`,
  };
}
