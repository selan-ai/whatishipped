/*
 * What a page draws from: the platform's board files (window.Foundations, Catalog, Screens, Journeys), merged and
 * ordered, beside the server's index of every platform (what uses what, sources, the other platforms' screens).
 * Pure functions: the server imports merge and componentKey too.
 */
import { Orientation } from './types.ts';
import type { Component, Foundations, Group, Index, IndexComponent, IndexPlatform, IndexScreen, Journey, Open, Screen } from './types.ts';

export const componentKey = (group: string, name: string) => `${group}/${name}`;
export const orientation = (device: Foundations['device']): Orientation => (device.width > device.height ? Orientation.landscape : Orientation.portrait);
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Groups declared in several files become one, in Foundations.groupOrder, their components in itemOrder. */
export function merge(groups: Group[], F: Foundations): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    const had = out.find((x) => x.group === g.group);
    if (had) had.items.push(...g.items);
    else out.push({ group: g.group, items: [...g.items] });
  }
  const rank = (list: string[], x: string) => (list.includes(x) ? list.indexOf(x) : list.length);
  out.sort((a, b) => rank(F.groupOrder ?? [], a.group) - rank(F.groupOrder ?? [], b.group));
  for (const g of out) g.items.sort((a, b) => rank(F.itemOrder ?? [], a.name) - rank(F.itemOrder ?? [], b.name));
  return out;
}

export type Edge = Open & { fromId: string };
export type Entry = { key: string; group: string; c: Component; ix: IndexComponent; slug: string };
export type Model = {
  index: Index; here: IndexPlatform; F: Foundations; orientation: Orientation;
  catalog: Group[]; entries: Entry[]; entry: Map<string, Entry>;
  screens: Screen[]; byId: Map<string, Screen>; screenIx: Map<string, IndexScreen>;
  features: string[]; edges: Edge[]; journeys: Journey[];
  counts: { screens: number; states: number; components: number; stories: number; edges: number; journeys: number };
};

export function model(index: Index, platform: string, w: { Foundations: Foundations; Catalog: Group[]; Screens: Screen[]; Journeys: Journey[] }): Model {
  const here = index.platforms.find((p) => p.id === platform) as IndexPlatform;
  const F = w.Foundations;
  const catalog = merge(w.Catalog, F);
  const ixByKey = new Map(here.components.map((c) => [c.key, c]));
  const entries: Entry[] = [];
  for (const g of catalog) {
    const taken = new Set<string>();
    for (const c of g.items) {
      let s = slug(c.name) || 'component';
      for (let n = 2; taken.has(s); n += 1) s = `${slug(c.name)}-${n}`;
      taken.add(s);
      const key = componentKey(g.group, c.name);
      const ix = ixByKey.get(key) ?? { key, group: g.group, name: c.name, desc: c.desc, source: [], stories: c.demos.map((d) => d.label), usedIn: [], uses: [], usedBy: [], tokens: [] };
      entries.push({ key, group: g.group, c, ix, slug: s });
    }
  }
  const screens = [...w.Screens].sort((a, b) => a.order - b.order);
  for (const s of screens) s.feature = s.feature || 'Screens';
  const edges = screens.flatMap((s) => (s.opens ?? []).map((o) => ({ ...o, fromId: s.id })));
  const states = screens.reduce((n, s) => n + s.states.length, 0);
  return {
    index, here, F, orientation: orientation(F.device), catalog, entries, entry: new Map(entries.map((e) => [e.key, e])),
    screens, byId: new Map(screens.map((s) => [s.id, s])), screenIx: new Map(here.screens.map((s) => [s.id, s])),
    features: [...new Set(screens.map((s) => s.feature))], edges, journeys: w.Journeys,
    counts: { screens: screens.length, states, components: entries.length, stories: entries.reduce((n, e) => n + e.c.demos.length, 0), edges: edges.length, journeys: w.Journeys.length },
  };
}

/* The state a screen is shown by in a thumbnail: its scenario state, else the first that is not still loading. */
const waiting = /loading|first \d+ ?ms|preparing|opening|skeleton|placeholder|nothing loaded/i;
export function cover(s: Screen, among: number[] | null) {
  const list = among ?? s.states.map((_, i) => i);
  return list.find((i) => /scenario/i.test(s.states[i].name)) ?? list.find((i) => !waiting.test(s.states[i].name)) ?? list[0] ?? 0;
}

/* The same screen on another platform: brandbook.json's pairs, else the same id. */
export function twin(index: Index, from: string, id: string, to: string): string | null {
  const pair = index.same.find((ids) => ids.includes(`${from}:${id}`));
  const named = pair?.find((x) => x.startsWith(`${to}:`));
  if (named) return named.slice(to.length + 1);
  const other = index.platforms.find((p) => p.id === to);
  return other?.screens.some((s) => s.id === id) ? id : null;
}
