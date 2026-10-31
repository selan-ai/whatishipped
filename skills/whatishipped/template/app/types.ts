/*
 * The shapes a platform's board files declare (window.Foundations, Catalog, Screens, Journeys) and the index the
 * server reads from them. The board files are plain JavaScript written by people and agents, so every field the
 * shell reads is checked where it is read (model.ts), never assumed.
 */

/* A closed set: one declaration gives the values, the type and the names (How.push), so no literal is compared. */
export const closed = <const T extends readonly string[]>(values: T) => ({
  values,
  names: Object.fromEntries(values.map((v) => [v, v])) as { [K in T[number]]: K },
  parse: (x: unknown, fallback: T[number]): T[number] => ((values as readonly unknown[]).includes(x) ? (x as T[number]) : fallback),
});

export const hows = closed(['push', 'sheet', 'modal', 'tab', 'replace', 'deeplink', 'external']);
export type How = (typeof hows.values)[number];
export const How = hows.names;

/* A state matching its screenshot this much (check.ts --compare) is done, once nothing in its red picture is a shape. */
export const MATCHED = 95;

/* The device's system: Foundations.platform. A web board's device is a desktop viewport, with no phone around it. */
export const systems = closed(['ios', 'android', 'web']);
export type System = (typeof systems.values)[number];
export const System = systems.names;

/* Which way the device stands: Foundations.device wider than tall is landscape (an iPad game, a tablet app). */
export const orientations = closed(['portrait', 'landscape']);
export type Orientation = (typeof orientations.values)[number];
export const Orientation = orientations.names;

/* What a state on a screen page shows: the drawing, the app's screenshot, the drawing greyed with what differs from
   the screenshot in red, or the app beside the drawing. */
export const views = closed(['drawing', 'app', 'diff', 'both']);
export type View = (typeof views.values)[number];
export const View = views.names;

/* What a story or a step stands on in the canvas. */
export const grounds = closed(['screen', 'dark', 'light', 'checker']);
export type Ground = (typeof grounds.values)[number];
export const Ground = grounds.names;

export type Open = { to: string; how: How; from: string; source: string };
/* app: a screenshot of the real app showing this state ("refs/0012.webp"), or null. */
export type State = { name: string; note: string; app: string | null; render: () => string };
export type Screen = { id: string; order: number; feature: string; name: string; source: string; desc: string; opens: Open[]; states: State[] };
export type Demo = { label: string; render: () => string; wide: boolean; bleed: boolean };
export type Component = { name: string; source: string; desc: string; demos: Demo[] };
export type Group = { group: string; items: Component[] };
export type Step = { screen: string; state: string; action: string };
export type Journey = { id: string; name: string; feature: string; who: string; goal: string; steps: Step[] };

export type Token = { name: string; css: string | null; value: string | null };
export type Foundations = {
  platform: string;
  device: { name: string; width: number; height: number; status: number; clock: string; home: boolean; density: number };
  scenario: string;
  systems: { name: string; use: string }[];
  app: { name: string; mark: string };
  colours: { group: string; tokens: Token[] }[];
  type: { name: string; spec: string; cls: string; style: string; sample: string }[];
  radii: Token[];
  spacing: Token[];
  groupOrder: string[];
  itemOrder: string[];
};

/* A place in the app's code: the text the board wrote, and the file it names when the server found it in the repo. */
export type Source = { text: string; path: string | null; line: number | null };

/* A screenshot of the real app (<platform>/refs.json), the drawn state it shows, if one does, and what differs (diff:
   red on transparent, written by check.ts --compare). */
export type Ref = { file: string; state: string | null; note: string; match: number | null; diff: string | null };
export type IndexScreen = {
  id: string; name: string; feature: string; desc: string; source: Source[]; states: string[]; opens: Open[];
  components: string[]; tokens: string[]; refs: Ref[];
};
export type IndexComponent = {
  key: string; group: string; name: string; desc: string; source: Source[]; stories: string[];
  usedIn: { screen: string; states: number[] }[]; uses: string[]; usedBy: string[]; tokens: string[];
};
export type IndexPlatform = {
  id: string; label: string;
  /* Where a source path opens: the repo on the web (…/-/blob/<commit>/), and the repo on this machine for an editor link. */
  web: string | null; editor: string | null;
  device: string; size: Foundations['device']; system: System; scenario: string; features: string[];
  screens: IndexScreen[]; components: IndexComponent[]; journeys: Journey[];
  tokens: { name: string; css: string; group: string }[];
  problems: string[];
};
export type Index = { name: string; sub: string; platforms: IndexPlatform[]; same: string[][] };
