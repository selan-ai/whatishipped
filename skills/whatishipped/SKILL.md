---
name: whatishipped
description: Use when asked for a brandbook, design board, design-system inventory or a catalogue of the screens, states, components or user journeys of a native mobile app (iOS SwiftUI or UIKit, Android Jetpack Compose or XML views); to recreate an app's UI as it ships, on one platform or across iOS and Android repos; or to add screens, flows, screenshots or a platform to such a brandbook.
---

# whatishipped

## Overview

Recreate a mobile app's UI as it ships: every screen in every state, its components, its foundations and the journeys
through it, as one brandbook for all its platforms. The brandbook is a small Node app (`npm start`, no dependencies)
that anyone can run or host. Each platform has its own pages:
- **Overview**, and a front page comparing the platforms feature by feature.
- **Journeys:** what a person does, step by step, through real screens and states.
- **Foundations:** colours grouped by meaning (each with what paints with it), type in real copy, shape, icons.
- **Components**, laid out as Storybook does: every story, where it is defined, the screens and components that use it.
- **Screens:** every state in a phone frame, beside the app's own screenshot of it, with what opens the screen, what it
  opens and what it is made of.
- **Navigation:** features against features, then each feature's map.

There are two sources: the code, and the running app. Code read alone gets layout, spacing and variants wrong in ways
no check catches; a board drawn blind matched its app about 80%. So every screen the app can be made to show is drawn
against a screenshot of it, and how closely it matches is measured. **`example/*.png` shows the shape: read all three
images before building anything.** They are pages of one app's brandbook (Selan Reactor): read them for how the
pages are laid out, and take nothing from them about the app they show, even when you are drawing that app. A table
of tokens or a list of lint findings is not a brandbook, however accurate.

## The request sets the scope

Read what the person asked for before anything else, and draw that:

| They ask for | Draw | Ask them |
|---|---|---|
| A screen, a flow or a feature ("the player", "checkout") | Those screens in every state, the components they use, the foundations those need | How to get screenshots (step 3) |
| The whole app | Every screen; with more than about 25 screens on a platform, the journeys they pick | Screenshots and journeys, in one question (steps 3, 4) |
| The design system: components, colours, type | Foundations and the components with every state (step 5), no screens | Nothing, unless screenshots would show the components |
| More in a brandbook that exists (the folder with `brandbook.json`) | Only what is new: see Extending | How to get screenshots of it |

Map the request onto screens (RECON's ids, once there is a RECON) and ask when its edge is unclear: does "sign-in"
take in the welcome screen before it? What they say overrides this skill's defaults: the platforms, the scenario
(account, plan, flags), the device, how far to go. Ask only what the request and the repos leave open; when several
folders could be the brandbook they mean, ask which.

## Process

1. **Set up.** `<OUT>` is a new folder outside the app repos (`~/brandbooks/<app>`). Run `cp -R <this skill>/template
   <OUT>`, then make one folder per platform from the starter: `cp -R <OUT>/platform <OUT>/android` for a second
   platform, then `mv <OUT>/platform <OUT>/ios`. Fill `<OUT>/brandbook.json`: the app's name, each platform's `repo`
   (absolute path) and `web` (its blob URL at the commit drawn: `git rev-parse HEAD`, `git remote get-url origin`),
   and `same`, pairs of screens that are one screen under two ids; remove the starter's platforms and pairs you do
   not draw. `app/` and `server/` are the brandbook itself; `<OUT>/README.md` says what every file holds. The server
   runs on 4321; where that is taken, pick another (`PORT=4330 npm start`) and use it wherever this says 4321.
2. **Recon**, per platform, over what the request covers (a subagent per platform when that is more than a few
   screens). Write `<OUT>/<platform>/RECON.md`:
   - the UI tech, the token files (generated ones count), where the shared components live;
   - **the screens:** what a screen is here (anything that fills the phone or sits over it: a view controller, a
     Fragment, a routed composable, a sheet, a full-screen modal), and each screen with an id, its **feature** and
     roughly how many states it has. Features carry the same names on every platform, so the front page lines them
     up: a screen another platform already draws under the same id takes its feature, and new ones take the names
     the other platform uses;
   - **what opens what:** for every screen, each call that opens another (push, sheet, modal, tab, replace, deep
     link, external), the element or state it comes from, and its `file:line`;
   - **journeys:** the paths a person takes (onboarding, the core loop, search, buying, settings), each as the
     screens it passes through, read from what opens what and the entry points (tabs, deep links, notifications);
   - where states, sample words (fixtures, mocks, previews), fonts and images come from;
   - **the device** the UI tests run on, else the simulator or emulator the build scripts pick, as its screenshots
     show it: size, density (pixels per point), status bar height, clock, home indicator (`Foundations.device`);
   - **each design system** the app ships, and how much the app uses it by counting references (`Foundations.systems`);
   - **the real app:** screenshots already in the repo (snapshot or UI test references, store screenshots under
     `fastlane/`), and the E2E or UI tests: framework, the command (CI config holds the whole sequence), the
     simulator or emulator, what a run needs (a backend, an account, a secret, a fake server, an SDK) and writes to,
     roughly how long it takes, and which screens it reaches;
   - **one scenario** every screen is drawn in (account, plan, flags, tabs): `Foundations.scenario`. A screen that only
     exists in another setup (a paywall) is drawn in that one and says so;
   - **who owns each piece:** a component used by three or more features is shared (step 5); one used by two has one
     owner area. When two design systems both have, say, an `IconButton`, the newer one's functions live under `C.ds`;
   - gaps: uninitialised submodules, screens whose code lives elsewhere.

   Note any hand-drawn board, Storybook or Figma export in the repo. It is off limits for drawing.
3. **Get screenshots of the real app**, following `real-app.md`: the ones in the repo, else the E2E run under
   `server/capture.ts`, else the person's. Ask before running anything. They end up in `<platform>/refs/`, mapped to
   screens in `<platform>/refs.json`.
4. **Choose what to draw** when the request is the whole app. Propose journeys from RECON, the core ones first, each
   with the screens it passes through and their count; one journey covers every platform it exists on.
   - **More than about 25 screens on a platform:** ask which journeys to draw. A question takes at most four options,
     so offer the four strongest (the recommended first, marked so) and fold the rest into them or into a second
     question; "Other" lets the person name more. Draw the screens on the chosen journeys, each in all its states,
     list the screens left out, and offer them as a next batch.
   - Otherwise draw every screen.
5. **Foundations and shared components (yourself), per platform.**
   - `tokens.css`: every token, and `--screen-ground`. `foundations.js`: colour groups by meaning, type rows with real
     copy, radii, spacing, and every catalogue group in `groupOrder`.
   - `icons.js`: the icons the app uses, as shipped where the repo has SVG or vector drawables.
   - `components.js` and `components.css`: the components most screens share, each with every state. To find them,
     count the features that use each type, by type name.
   - Fonts and images are copied into `<platform>/assets/` and named relative to the platform folder.
6. **Areas.** Split the screens to draw, with the components only they use, into areas of 2–5 screens by feature
   (one, when a screen has more than about 15 states). Send each the brief in `area-brief.md`, all at once, with its
   screens' screenshots; without subagents, draw them one by one with the brief as the checklist. Each area's file
   stem (`area-player`) goes in its platform's `areas.js`.
7. **Journeys.** Write `<platform>/journeys.js` from the drawn boards: each step names a screen id and one of its
   states exactly (`curl localhost:4321/api/index.json` lists them), and the action that leads on. Use the same id for the
   same journey on every platform.
8. **Match.** Start the server (`npm start`, in the background) and run `node server/check.ts --compare
   http://localhost:4321 --shot /tmp/match`. It draws each state that has a screenshot (its `app` field) alone at the
   screenshot's size and prints how much of the screen's content matches, worst first, with the rows that differ
   most. For each, it saves the app, the drawing and every point that differs in red, side by side, and `-zoom`, the
   rows that differ most at the screenshot's own scale. Fix the worst first and run it again. A state is done when it
   is at 95% or above and its red picture shows no shape (a line, an edge, an icon, a box) that the drawing could
   still change, only speckle on text; or when what still differs comes from the screenshot rather than the code
   (its account's titles, covers, dates and avatars, or another phone, which `--compare` warns of), which the
   state's note then says. A drawing right to the point scores 97–100; one 2 points off, about 92; a wrong screen,
   below 75. The screen pages and the overview show every score.
9. **Check.** Run `node server/check.ts --all http://localhost:4321` (add `--deep` for every component's page,
   `--shot <dir>` for screenshots, `CHROME=<path>` for another Chrome). Fix until every page draws without a
   problem and no platform overview shows a "problems" box (a journey step, a feature or a screenshot that does not
   resolve). Read screenshots of every screen without an app screenshot. Check the state counts against RECON, that
   every arrow to a screen that is not drawn is one you meant to leave out, and that no component page says "used on
   no screen" for a component a screen draws (call it through `C.Name`).
10. **Show.** Leave the server running, `open http://localhost:4321/`, and report: the counts, the journeys, how many
    states were measured against the app and their average match, the screens drawn from the code alone, and what is
    approximated.

## Extending a brandbook

Add to a brandbook rather than drawing it again. Fixing a state until it matches its screenshot is part of adding;
redrawing a screen is not, unless the person asks for it.

**First, bring its tools up to date.** When `<OUT>/package.json` has no `version` or an older one than the
template's, look for local edits (`diff -r <this skill>/template/app <OUT>/app`, and the same for `server`), then
take the template's, and restart the brandbook's own server (`<PORT>`: 4321, or the one it runs on):

```sh
rsync -a --delete <this skill>/template/app/ <OUT>/app/
rsync -a --delete <this skill>/template/server/ <OUT>/server/
cp <this skill>/template/{server.ts,package.json,README.md,Dockerfile} <OUT>/
lsof -ti tcp:<PORT> | xargs kill; (cd <OUT> && PORT=<PORT> npm start &)    # a running server keeps the old code
```

Then run step 9 over the whole brandbook, and step 8: newer tools can score old states differently. Fix what the
request covers; report the rest. The platform folders are never touched by this.

| To add | Do |
|---|---|
| Screens, a flow or a feature | Recon around them, filling in what an older RECON lacks for them (what opens what, journeys); screenshots (step 3); one area or more through the brief (6); journeys (7); then match (8), check (9) and show (10) |
| Screenshots taken later | As `real-app.md`'s "Screenshots that come later" says, then match (8) |
| A platform | `cp -R <this skill>/template/platform <OUT>/<id>`, add it to brandbook.json with its `same` pairs, then steps 2–10 for it, with the feature names and journey ids the other platforms use. For one screen or flow: the tokens and components those screens use, and one area you draw yourself |
| A new kind of page | `<OUT>/README.md` says where |

When the app's repo has moved past the commit in brandbook.json's `web`, ask whether to draw the new part at that
commit (read it with `git show <commit>:<path>`) or to move the whole brandbook to the new one.

## Rules

- **Draw from the code and the running app.** A hand-drawn board, Figma or Storybook would show what someone drew,
  not what ships.
- **Where a screenshot and a drawing differ, fix the drawing**, unless the screenshot is older than the code: tests
  with a pixel tolerance let small UI changes through without re-recording. Compare the screenshot's last commit
  (`git log -1 --format=%h -- <file>`) with the code it shows; draw the code, and the note names the commit the
  screenshot predates. Where the screenshot shows another variant (a flag, an account), draw the scenario's and say
  so in the note.
- **Every state is a code branch, an enum case, a preview or a catalogue demo**, with a name and a note naming the
  branch. Put first the screen as the scenario sees it, loaded; it is the screen's thumbnail.
- **Take words from the repo's fixtures, mocks and previews**, or from the screenshots. Invent them only where none exist.
- **Use real sizes.** The phone is `Foundations.device`. A component demo that stands on the screen ground uses
  `wide`; a screen scrolled down uses `Frame.phone({ scroll })`.
- **Use one clock.** The status bar says the device's 9:41 (`Foundations.device.clock`, 09:41 on a 24-hour phone);
  write every time relative to it.
- **Say what you approximate** (SF Symbols, system sheets, the keyboard, animation), in RECON. Never drop anything
  silently.
- **Never change the app's tracked files.** Read the repos, build them and run their tests as they are. Setup may
  add ignored files (a secret, build output); remove what you added, and leave `git status` as you found it.
- **The board is pictures and names, no prose.** Nobody reads paragraphs there, so the shell shows none: a `desc`,
  `note` or `from` is a few words for whoever edits the files, and file paths go only in `source` fields. Anything
  longer (gaps, approximations, why a state differs from its screenshot) goes in RECON.
- **Check before you report.** Read every screenshot before calling a part done. Say a page is open only after
  running `open`.

## Common mistakes

| Mistake | Instead |
|---|---|
| Drawing the whole app when they asked for one flow | The request sets the scope |
| A token table and a thousand findings (raw values, duplicates) | Draw the brandbook; differences show as drawn states |
| One brandbook per platform | One brandbook, a folder per platform, the same journey ids |
| Drawing all 150 screens of a big app before asking | Propose journeys, ask which, draw those |
| Drawing blind while the repo has E2E tests | Ask to run them under `capture.ts`; draw each screen against its frames |
| "Every page drew without a problem" taken to mean "matches the app" | `check.ts --all` finds errors; `--compare` measures the match |
| Redrawing a brandbook to add one screen | Add an area; see Extending |
| Every screen on one long page | The shell pages by feature, screen, group and component; keep data in the platform files |
| Fonts and images read from the app repo by `../../` | Copy them into `<platform>/assets/` |
| The screen's gradient squeezed into a short component demo | `wide`, which slices the ground at phone size |
| "Opened it" with no `open` run | Start the server, then `open` the URL |
| Copying a hand-drawn board in the repo | Use it only to compare, after drawing from code |
| Each area draws its own copy of a shared piece | RECON names one owner; area-only classes carry the area's prefix |
| Areas draw different accounts or tab sets | Everything follows `Foundations.scenario` |
| Paragraphs in descs and notes, explanations on pages | A few words in the files; the rest in RECON |
