# Brandbook

An app's UI as it ships, recreated from its code and its running screens: every screen in every state, its
components, foundations and journeys, one folder per platform. Made by the [whatishipped](https://github.com/selan-ai/whatishipped) skill.

## Run it

```sh
npm start                 # http://localhost:4321; Node 22.18 or later, nothing to install
PORT=8080 npm start       # another port
```

To host it, run the same on any machine with Node, build the image (`docker build -t brandbook . && docker run -p
8080:8080 brandbook`), or build static files for any host that serves a folder:

```sh
npm run build             # dist/; the host answers any address without a file with dist/index.html
```

On Cloudflare that is a Worker with only assets, `"assets": { "directory": "dist", "not_found_handling":
"single-page-application" }`, and Cloudflare Access on its hostname to keep it to your team. The repos are not needed
to serve it; links to the code use each platform's `web` address. Everything in the platform folders is served, the
screenshots in `<platform>/refs/` and the RECON notes too: keep out what should not be public, such as screenshots of
a person's own account.

## Check it

```sh
npm run check -- --all http://localhost:4321                         # every page draws without an error
npm run check -- --compare http://localhost:4321 --shot /tmp/match   # each drawn state against the app's screenshot
```

Screenshots while the app's tests run, from the app's repo, so the command runs there:

```sh
node <this folder>/server/capture.ts --out <this folder>/android/refs --android emulator-5554 -- <the E2E command>
```

## What is where

| Path | Holds |
|---|---|
| `brandbook.json` | The app's name; each platform's id, label, repo (on this machine) and `web` (its code at the commit drawn); `same`, screens that are one screen under two ids |
| `<platform>/tokens.css`, `foundations.js` | Tokens, and colours by meaning, type, shape, the device (wider than tall for a landscape app), the scenario every screen is drawn in, the design systems |
| `<platform>/icons.js` | The app's icons |
| `<platform>/components.js`, `components.css` | The components most screens share, each with its stories |
| `<platform>/areas.js` | The area files, in order; each `area-<name>.js` and `.css` draws a few screens and the components only they use |
| `<platform>/journeys.js` | Journeys: steps through screens and states |
| `<platform>/refs/`, `refs.json` | Screenshots of the real app, and the screens they show; a state names its own with `app` |
| `<platform>/match.json` | How much of each paired state matches its screenshot, written by `check.ts --compare` |
| `<platform>/RECON.md` | What the code holds: screens, what opens what, journeys, sources, gaps |
| `<platform>/sources.json`, `assets/` | Source paths found in the repo; fonts and images the drawings use |
| `app/` | The brandbook in the browser: `shell.ts` routes and draws, `pages/*.ts` one file per kind of page, `frame.js` the phone |
| `server.ts`, `server/` | The server; `board.ts` reads the platforms into `/api/index.json`; `build.ts` writes the static files; `check.ts`, `capture.ts`, `png.ts`, `image.ts`, `webp.ts` are tools |

## Extend it

- **Screens, a flow, a feature:** a new `area-<name>.js` (and `.css`), its stem added to `<platform>/areas.js`.
- **Screenshots:** files in `<platform>/refs/`, each mapped to its screen in `refs.json`; the state a screenshot shows
  names it (`{ name, app: 'refs/0012.webp', render }`).
- **A platform:** a copy of the skill's `template/platform` starter, and an entry in `brandbook.json`.
- **A kind of page:** a function returning a `Page` in `app/pages/`, a section in `shell.ts` (`sections`, `page()`
  and `tree()`), and its addresses in `ui.ts` (`url`). The data it needs comes from the platform files through
  `model.ts`, or from the server's index (`server/board.ts`, typed in `app/types.ts`).

`package.json`'s `version` is the template's: the skill updates `app/` and `server/` from a newer one and leaves the
platform folders alone. The board files are plain JavaScript (`window.Screens.push`, `window.Catalog.push`,
`Object.assign(window.C, ...)`), so the skill or a person can add to them without building anything.
