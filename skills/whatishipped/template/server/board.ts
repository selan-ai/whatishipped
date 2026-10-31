/*
 * Reads each platform's board the way a browser would, in a sandbox without a page: runs its files, draws every
 * screen state and component story to HTML, and works out from that HTML what uses what.
 *   A component is found in a drawing by the classes on its own first elements that no other component's carry, or
 *   by a call to its window.C function.
 *   A colour is found by its custom property, written inline or read by the CSS of a class the drawing carries,
 *   through any custom property that points at it.
 * Sources ("Features/X.swift:88") are matched to files in the app's repo (brandbook.json, platforms[].repo) and the
 * matches kept in the platform's sources.json, so a copy hosted without the repo still links to the code.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import { componentKey, merge } from '../app/model.ts';
import { hows, System, systems } from '../app/types.ts';
import type { Foundations, Group, Index, IndexComponent, IndexPlatform, Journey, Ref, Screen, Source } from '../app/types.ts';

type Config = {
  name: string; sub: string; same: string[][];
  platforms: { id: string; label: string; repo: string | null; web: string | null }[];
};
type Board = { F: Foundations; catalog: Group[]; screens: Screen[]; journeys: Journey[]; C: Record<string, unknown> };

let cache: { stamp: number; index: Index } | null = null;

export async function readBrandbook(root: string): Promise<Index> {
  const config = JSON.parse(readFileSync(join(root, 'brandbook.json'), 'utf8')) as Config;
  const stamp = Math.max(mtime(join(root, 'brandbook.json')), newest(join(root, 'app')), ...config.platforms.map((p) => newest(join(root, p.id))));
  if (cache?.stamp === stamp) return cache.index;
  const index: Index = { name: config.name, sub: config.sub, same: config.same, platforms: config.platforms.map((p) => readPlatform(root, p)) };
  cache = { stamp, index };
  return index;
}

const mtime = (path: string) => (existsSync(path) ? statSync(path).mtimeMs : 0);
const newest = (dir: string) => Math.max(0, ...(existsSync(dir) ? readdirSync(dir).filter((f) => /\.(js|css|json)$/.test(f)).map((f) => mtime(join(dir, f))) : []));

/* The board's files, run in the order the page runs them. */
export function load(root: string, id: string, problems: string[]): Board {
  const dir = join(root, id);
  const quiet = () => undefined;
  const ctx = vm.createContext({
    console: { log: quiet, info: quiet, warn: quiet, error: quiet },
    Catalog: [], Screens: [], Journeys: [], C: {}, Areas: [],
    document: { documentElement: { style: { setProperty: quiet }, dataset: {} }, querySelector: () => null, createElement: () => ({ style: {}, dataset: {} }) },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    localStorage: { getItem: () => null, setItem: quiet },
  });
  ctx.window = ctx;
  const run = (path: string) => {
    if (!existsSync(path)) return;
    try { vm.runInContext(readFileSync(path, 'utf8'), ctx, { filename: path, timeout: 10000 }); } catch (e) { problems.push(`${relative(root, path)}: ${(e as Error).message}`); }
  };
  run(join(root, 'app', 'icons.js'));
  run(join(dir, 'icons.js'));
  run(join(root, 'app', 'frame.js'));
  for (const f of ['foundations.js', 'components.js', 'areas.js']) run(join(dir, f));
  for (const area of ctx.Areas as string[]) run(join(dir, area.endsWith('.js') ? area : `${area}.js`));
  run(join(dir, 'journeys.js'));
  const F = ctx.Foundations as Foundations;
  return { F, catalog: merge(ctx.Catalog as Group[], F), screens: [...(ctx.Screens as Screen[])].sort((a, b) => a.order - b.order), journeys: ctx.Journeys as Journey[], C: ctx.C as Record<string, unknown> };
}

function readPlatform(root: string, p: Config['platforms'][number]): IndexPlatform {
  const problems: string[] = [];
  const board = load(root, p.id, problems);
  const { F, catalog, screens } = board;
  const dir = join(root, p.id);
  const source = sourceReader(dir, p.repo);

  /* Every drawing, with the window.C functions it called. */
  const calls = new Set<string>();
  for (const [name, f] of Object.entries(board.C)) {
    if (typeof f === 'function') board.C[name] = function traced(this: unknown, ...args: unknown[]) { calls.add(name); return f.apply(this, args); };
  }
  let unreadable = 0;
  const draw = (render: () => string) => {
    calls.clear();
    try { return { html: String(render()), calls: new Set(calls) }; } catch { unreadable += 1; return { html: '', calls: new Set<string>() }; }
  };
  const components = catalog.flatMap((g) => g.items.map((c) => ({ key: componentKey(g.group, c.name), group: g.group, c, drawn: c.demos.map((d) => draw(d.render)) })));
  const states = screens.map((s) => s.states.map((st) => draw(st.render)));

  /* A component's signature: classes on its first elements that no other component's first elements carry. */
  const firsts = components.map((x) => new Set(x.drawn.flatMap((d) => firstClasses(d.html))));
  const owners = new Map<string, number>();
  for (const set of firsts) for (const c of set) owners.set(c, (owners.get(c) ?? 0) + 1);
  const signature = firsts.map((set) => [...set].filter((c) => owners.get(c) === 1));
  const byCall = new Map(components.map((x) => [x.c.name.replace(/\s+/g, ''), x.key]));
  const found = (drawn: { html: string; calls: Set<string> }[], self: string | null) => {
    const classes = new Set(drawn.flatMap((d) => [...classesOf(d.html)]));
    const keys = new Set<string>();
    components.forEach((x, i) => { if (x.key !== self && signature[i].some((c) => classes.has(c))) keys.add(x.key); });
    for (const d of drawn) for (const name of d.calls) { const key = byCall.get(name); if (key && key !== self) keys.add(key); }
    return keys;
  };

  const colours = new Map(F.colours.flatMap((g) => g.tokens.filter((t) => t.css).map((t) => [t.css as string, { name: t.name, css: t.css as string, group: g.group }])));
  const tokensOf = tokenReader([dir, join(root, 'app')], colours);

  const indexComponents: IndexComponent[] = components.map((x) => ({
    key: x.key, group: x.group, name: x.c.name, desc: x.c.desc ?? '', source: source(x.c.source), stories: x.c.demos.map((d) => d.label),
    usedIn: [], uses: [...found(x.drawn, x.key)], usedBy: [], tokens: tokensOf(x.drawn.map((d) => d.html)),
  }));
  const byKey = new Map(indexComponents.map((c) => [c.key, c]));
  for (const c of indexComponents) for (const used of c.uses) byKey.get(used)?.usedBy.push(c.key);
  const refs = refReader(dir, screens, problems, readJson(join(dir, 'match.json')) as Record<string, Record<string, number>>);
  const indexScreens = screens.map((s, i) => {
    const perState = states[i].map((d) => found([d], null));
    const keys = new Set(perState.flatMap((set) => [...set]));
    for (const key of keys) byKey.get(key)?.usedIn.push({ screen: s.id, states: perState.flatMap((set, n) => (set.has(key) ? [n] : [])) });
    return {
      id: s.id, name: s.name, feature: s.feature ?? 'Screens', desc: s.desc ?? '', source: source(s.source),
      states: s.states.map((st) => st.name),
      opens: (s.opens ?? []).map((o) => ({ to: o.to, how: hows.parse(o.how, 'push'), from: o.from ?? '', source: o.source ?? '' })),
      components: [...keys], tokens: tokensOf(states[i].map((d) => d.html)), refs: refs.get(s.id) ?? [],
    };
  });

  const ids = new Map(screens.map((s) => [s.id, s]));
  for (const j of board.journeys) for (const [n, step] of j.steps.entries()) {
    const s = ids.get(step.screen);
    if (!s) problems.push(`Journey "${j.name}", step ${n + 1}: no screen "${step.screen}"`);
    else if (!s.states.some((st) => st.name === step.state)) problems.push(`Journey "${j.name}", step ${n + 1}: ${s.name} has no state "${step.state}"`);
  }
  for (const s of screens) if (!s.feature) problems.push(`Screen "${s.id}" has no feature`);
  if (unreadable) console.log(`${p.id}: ${unreadable} drawings need a page to draw; their references are left out`);
  source.save();

  const repo = p.repo && existsSync(p.repo) ? p.repo : null;
  return {
    id: p.id, label: p.label, web: p.web, editor: repo,
    device: `${F.device.name}, ${F.device.width} × ${F.device.height}`, size: F.device, system: systems.parse(F.platform, System.ios), scenario: F.scenario,
    features: [...new Set(indexScreens.map((s) => s.feature))],
    screens: indexScreens, components: indexComponents, journeys: board.journeys,
    tokens: [...colours.values()], problems,
  };
}

/*
 * Screenshots of the real app per screen, from refs.json ({ "<screen id>": [{ "file": "refs/0012.webp", "state": "<state
 * name>" | null, "note": "…" }] }) and from the states themselves ({ name, app: "refs/0012.webp", render }), which pair
 * a screenshot with the state it shows. match.json, which check.ts --compare writes: { "<screen id>": { "<file>": the
 * percent of the screen that matches } }.
 */
function refReader(dir: string, screens: Screen[], problems: string[], match: Record<string, Record<string, number>>) {
  const out = new Map<string, Ref[]>();
  const path = join(dir, 'refs.json');
  let raw: Record<string, { file?: unknown; state?: unknown; note?: unknown }[]> = {};
  if (existsSync(path)) {
    try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { problems.push(`refs.json: ${(e as Error).message}`); }
  }
  const ids = new Map(screens.map((s) => [s.id, s]));
  for (const id of Object.keys(raw)) if (!ids.has(id)) problems.push(`refs.json: no screen "${id}"`);
  for (const s of screens) {
    const listed = (Array.isArray(raw[s.id]) ? raw[s.id] : []).map((r) => ({
      file: typeof r.file === 'string' ? r.file : '', state: typeof r.state === 'string' ? r.state : null, note: typeof r.note === 'string' ? r.note : '',
    }));
    for (const st of s.states) {
      const app = (st as { app?: unknown }).app;
      if (typeof app !== 'string' || !app) continue;
      const had = listed.find((r) => r.file === app);
      if (had) had.state = st.name;
      else listed.push({ file: app, state: st.name, note: '' });
    }
    const refs = listed.flatMap((r) => {
      if (!r.file || !existsSync(join(dir, r.file))) { problems.push(`${s.name}: no screenshot file "${r.file}"`); return []; }
      if (r.state !== null && !s.states.some((st) => st.name === r.state)) problems.push(`refs.json: ${s.name} has no state "${r.state}"`);
      const score = match[s.id]?.[r.file];
      return [{ ...r, match: typeof score === 'number' && r.state !== null ? score : null }];
    });
    if (refs.length) out.set(s.id, refs);
  }
  return out;
}

const readJson = (path: string): unknown => { try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}; } catch { return {}; } };

const CLASS = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
function classesOf(html: string) {
  const out = new Set<string>();
  for (const m of html.matchAll(CLASS)) for (const c of (m[1] ?? m[2]).split(/\s+/)) if (c) out.add(c);
  return out;
}
function firstClasses(html: string) {
  return [...html.matchAll(CLASS)].slice(0, 3).flatMap((m) => (m[1] ?? m[2]).split(/\s+/).filter(Boolean));
}

/* Which colour tokens some HTML paints with: its inline var()s and its classes' CSS (the platform's, and the phone
 * frame's, which paints the ground), through every alias. */
function tokenReader(dirs: string[], colours: Map<string, unknown>) {
  const css = dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'board.css').map((f) => readFileSync(join(dir, f), 'utf8'))).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const byClass = new Map<string, Set<string>>();
  const alias = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string) => { if (!map.has(key)) map.set(key, new Set()); map.get(key)?.add(value); };
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars = [...rule[2].matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    for (const c of rule[1].matchAll(/\.([\w-]+)/g)) for (const v of vars) add(byClass, c[1], v);
    for (const d of rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) for (const v of d[2].matchAll(/var\(\s*(--[\w-]+)/g)) add(alias, d[1], v[1]);
  }
  return (htmls: string[]) => {
    const seen = new Set<string>();
    const walk = (v: string) => { if (seen.has(v)) return; seen.add(v); for (const next of alias.get(v) ?? []) walk(next); };
    for (const html of htmls) {
      for (const m of html.matchAll(/var\(\s*(--[\w-]+)/g)) walk(m[1]);
      for (const c of classesOf(html)) for (const v of byClass.get(c) ?? []) walk(v);
    }
    return [...seen].filter((v) => colours.has(v));
  };
}

/* "Features/X.swift:88; Y.kt" → the files it names, found in the repo by their path's tail. Nothing after the extension
   forces backtracking, so a longer extension must come before the one it starts with (tsx before ts, html before h). */
const FILE = /([\w@+.\-/]*[\w@+-]+\.(?:swift|kt|kts|java|xml|mdx|m|mm|html|h|tsx|ts|js|dart|xcstrings|strings|css|scss|sass|less|vue|svelte|astro))(?::(\d+))?/g;
/* The files a source text names, with the line when it gives one. */
export const sourceMentions = (text: string) => [...text.matchAll(FILE)].map((m) => ({ text: m[0], file: m[1], line: m[2] ? Number(m[2]) : null }));
function sourceReader(dir: string, repo: string | null) {
  const cacheFile = join(dir, 'sources.json');
  const known: Record<string, string | null> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  let byName: Map<string, string[]> | null = null;
  if (repo && existsSync(repo)) {
    try {
      byName = new Map();
      for (const f of execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n')) {
        const name = f.slice(f.lastIndexOf('/') + 1);
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name)?.push(f);
      }
    } catch { byName = null; }
  }
  const find = (path: string) => {
    if (path in known || !byName) return known[path] ?? null;
    const hits = (byName.get(path.slice(path.lastIndexOf('/') + 1)) ?? []).filter((f) => f === path || f.endsWith(`/${path}`));
    known[path] = hits.length === 1 ? hits[0] : null;
    return known[path];
  };
  const read = (text: string | undefined): Source[] => {
    const s = String(text ?? '');
    const out = sourceMentions(s).map((x) => ({ text: x.text, path: find(x.file), line: x.line }));
    return out.length ? out : s ? [{ text: s, path: null, line: null }] : [];
  };
  read.save = () => { if (byName) writeFileSync(cacheFile, `${JSON.stringify(known, null, 1)}\n`); };
  return read;
}

