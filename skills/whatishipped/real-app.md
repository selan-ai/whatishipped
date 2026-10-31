# Screenshots of the real app

Every drawing is matched against a screenshot of the app, so get them before anything is drawn. They go in
`<OUT>/<platform>/refs/`, and `<platform>/refs.json` says which screen each shows.

## Where they come from, cheapest first

1. **The repo.** UI test references, snapshot images (`__Snapshots__`, Paparazzi, Roborazzi, Playwright
   `*-snapshots/` and `test-results/`), store screenshots (`fastlane/screenshots`). Store them in `refs/` under their
   own names as lossless WebP (copy them, then `node <OUT>/server/webp.ts`). They need no run and no question.
2. **The E2E or UI tests.** Native: run while `server/capture.ts` takes each screen they reach. Web: the repo's own
   approved E2E/UX suite (see "Web apps" below); `capture.ts` is native only and does not drive a browser.
3. **The person:** they tap through the app on a simulator or emulator while `capture.ts` watches, or they send
   screenshots. A phone that is not `Foundations.device` lays the screen out a little differently: `--compare` warns
   of it, the refs.json note names the phone, and those differences are noted, not drawn.

**Check each is as new as the code it shows.** A test that allows a few pixels of difference lets small UI changes
through without re-recording its reference, so compare the screenshot's last commit (`git log -1 -- <file>`) with
the last change to that screen's code. A screenshot older than a change shows the old UI: keep it, draw the code,
and say in the note which commit the screenshot predates.

**Read the device off the screenshots.** The density is pixels per point: an iPhone's 2 or 3, an Android device's
dpi / 160 (`adb shell wm density`, or the AVD's `hw.lcd.density`: 420 is 2.625). The screenshot's width over the
density is the device's width in points (1080 / 2.625 = 411.43); the status bar's height is the top inset, measured
on a screenshot. These go in `Foundations.device`, and `--compare` sizes each drawing from them. A landscape-only
app's screenshots are wider than tall, and so is its device (2360 × 1640 at 2 is an iPad (A16) at 1180 × 820). A
screenshot turned from the device shows a turned state: `--compare` measures it turned, and says when the drawing is not.

Screenshots show the account they were taken with. A person's own account goes into `refs/` and into anything hosted
from the brandbook: ask before keeping such screenshots in it.

## Web apps

A web front end has no simulator, and `capture.ts` (which watches an iOS simulator or Android emulator) is not used.
In order:
1. Playwright artefacts already checked in: `*-snapshots/` beside the specs, `e2e/` or `tests/` screenshots,
   `docs/` images. Convert the PNGs into `refs/` (`node <OUT>/server/webp.ts <in.png>... --out <OUT>/<platform>/refs`);
   it keeps each name and refuses a side over 16383 px, which WebP cannot hold.
2. The repository's approved E2E/UX suite, run as its README or CI config says (`npx playwright test`, or its own
   script), after asking as below. Take the screenshots it writes and convert them the same way; if the suite takes none,
   ask before adding `page.screenshot` calls outside the repo's tracked files (an ignored config or a copy of the spec).
3. The person's screenshots.

Pair by viewport and density: read the viewport (`use.viewport`, `deviceScaleFactor`) from the Playwright config or
the project the test ran in; the screenshot's width over `deviceScaleFactor` is the viewport in CSS pixels, and
`Foundations.device` is the main one (`density` the factor, `1` by default). A screenshot at another viewport pairs
with a state drawn at that viewport; `--compare` warns when the width differs (a different height is
valid for a full-page image, and does not warn). Prefer full-page images (`fullPage: true`): the state sets its
height, `Frame.web({ body, style: '--phone-h: 2310px' })` (the screenshot's height over its density), and the match
covers all of it. Without that override the drawing stands at `Foundations.device.height` and a taller page is
cropped there; `--compare` sizes the page it draws from the screenshot, but a height the state sets itself wins, so it
must equal the screenshot's. A screenshot of only
the viewport pairs with a state that is scrolled to the top.

## Ask before running anything

A run can need a secret only the person has (a CI token file), writes to shared backends and test accounts, and can
take hours. If RECON does not say how the E2E runs, read the CI config first: it holds the whole sequence (setup,
build, emulator, tests, teardown). Then ask in one question, together with step 4's if there is one. With tests, the
options are:
- run them while capturing (recommended; name the command, the secret and the backends, and how long it takes);
- they run them, you capture;
- they send screenshots of the main screens;
- draw from the code only, which the overview then says.

Without tests: they tap through while you capture, or they send screenshots. Screenshots already in the repo are used
in every case.

## Capture (native)

For a web front end, take the screenshots from the suite instead (Web apps, above). Do the repo's own setup first (environment, tools, the secret they hand over, which you delete afterwards). Then wrap
only the step that drives the app, from the repo, unedited, and run the teardown after it:

```sh
node <OUT>/server/capture.ts --out <OUT>/android/refs --android emulator-5554 -- ./gradlew connectedProdDebugAndroidTest
node <OUT>/server/capture.ts --out <OUT>/ios/refs --ios <udid> -- make e2e ONLY=HomeTests
node <OUT>/server/capture.ts --out <OUT>/ios/refs --ios booted      # no command: watches until Ctrl-C
```

- Name the device when anything else is up (`adb devices`, `xcrun simctl list devices booted`); `--ios booted` and
  `--android all` take every device, and the runner's parallel clones.
- Run anything over ten minutes in the background.
- Where the runner allows, run only the test classes of the screens being drawn. A suite that needs no account is a
  cheap first pass.

Each screen that settles, or keeps moving (video), is kept once in `refs/frames.json`, with the test that reached it
and the time.

## Sort and pair

- **Sort** (with subagents when there are hundreds of frames): write `refs.json`, mapping each screen being drawn to
  its frames, `{ "home-feed": [{ "file": "refs/0012.webp", "state": null, "note": "HomeTests.testOpens; the free QA
  account" }] }`. Delete frames that show no screen of the app (launcher, launch, system sheets). List in RECON, for
  the next batch, the frames of screens not drawn yet, and the screens no frame reaches.
- **Pair:** whoever draws a state names the screenshot that shows it, in the state itself: `{ name, note, app:
  'refs/0012.webp', render }`. Pick the frame closest to the scenario (its account, loaded). A screenshot named after
  its state (`accounts-several.webp`) pairs at once. The state's `app` is the pairing; refs.json's `state` does the
  same for a state you are not editing, and `app` wins where both say.
- **A screenshot of a screen outside the request** that a requested flow passes through (sign-in lands on the home
  screen): draw that screen in the state the screenshot shows, so the journey reads through, and say in its desc
  that it is drawn only that far.
- **Measure:** `node <OUT>/server/check.ts --compare <URL> --screens <ids> --shot <dir>` (SKILL.md, step 8).
  `--screens` takes `<id>` or `<platform>:<id>`.

## Screenshots that come later

1. Look at every one, and find its screen, state and variant (account, flag, sheet height, scroll).
2. Convert any phone screenshot not in sRGB (`sips -g profile`; phones often save Display P3), then store each as
   lossless WebP and delete the original:

   ```sh
   sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" <in.png> --out <srgb.png>
   cwebp -quiet -lossless -exact -metadata icc <srgb.png> -o <platform>/refs/<name>.webp
   ```
3. Keep the ones that show the app in `<platform>/refs/` under their own names, as WebP, and map them in refs.json
   with a note naming the phone and the account. PNGs already in sRGB (a web app's) convert in one go:
   `node <OUT>/server/webp.ts <in.png>... --out <OUT>/<platform>/refs`; captured frames already are WebP.
   A screenshot of a screen not drawn yet goes on RECON's list for the next
   batch; one of a state the board lacks becomes a new state.
4. Pair each with its state (`app`) in the area file that draws it, and match (SKILL.md, step 8).
