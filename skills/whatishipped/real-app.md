# Screenshots of the real app

Every drawing is matched against a screenshot of the app, so get them before anything is drawn. They go in
`<OUT>/<platform>/refs/`, and `<platform>/refs.json` says which screen each shows.

## Where they come from, cheapest first

1. **The repo.** UI test references, snapshot images (`__Snapshots__`, Paparazzi, Roborazzi), store screenshots
   (`fastlane/screenshots`). Copy them into `refs/` under their own names. They need no run and no question.
2. **The E2E or UI tests**, run while `server/capture.ts` takes each screen they reach.
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

## Capture

Do the repo's own setup first (environment, tools, the secret they hand over, which you delete afterwards). Then wrap
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
2. Convert any not in sRGB (`sips -g profile`; phones often save Display P3):

   ```sh
   sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" <in.png> --out <out.png>
   ```
3. Copy the ones that show the app into `<platform>/refs/` under their own names, and map them in refs.json with a
   note naming the phone and the account. New references are WebP (captured frames already are); a PNG still works.
   A screenshot of a screen not drawn yet goes on RECON's list for the next
   batch; one of a state the board lacks becomes a new state.
4. Pair each with its state (`app`) in the area file that draws it, and match (SKILL.md, step 8).
