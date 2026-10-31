/*
 * Takes the real app's screens while something drives it: the app's E2E, or a person tapping through. Polls the
 * simulators or emulators for screenshots and keeps a screen once it has settled (two polls alike), or, once per
 * stretch of movement, after it has kept moving for a few seconds (video, a progress bar); never one like the last
 * few kept on that device. Each frame records the test that reached it: an XCTest case from the command's output, an
 * Android test from the device's logcat (TestRunner), which Gradle and fastlane runs do not print.
 * Run it from the app's repo, wrapping only the step that drives the app, after the repo's own setup:
 *   node <OUT>/server/capture.ts --out <OUT>/ios/refs --ios <udid> -- make e2e ONLY=HomeTests
 *   node <OUT>/server/capture.ts --out <OUT>/android/refs --android emulator-5554 -- ./gradlew connectedProdDebugAndroidTest
 *   node <OUT>/server/capture.ts --out <OUT>/ios/refs --ios booted        until Ctrl-C, while a person drives the app
 * --ios takes a simulator's UDID, or booted: every booted one, the runner's parallel clones too, looked up again as the
 * run boots more. --android takes an adb serial, or all. Name the device when other simulators, emulators or phones
 * are up, or their screens are captured too. --every sets the poll in ms (700).
 * Writes <out>/NNNN.webp (the PNG the device hands over, stored as lossless WebP at once) and <out>/frames.json,
 * [{ file, device, at, test, line }], adding to an earlier run's. Needs libwebp's cwebp (brew install webp).
 * The command runs unchanged, from the current folder; its exit code is this one's, or 1 when no frame was kept.
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { System } from '../app/types.ts';
import { decode, grid } from './png.ts';
import { needWebp, toWebp } from './webp.ts';

type Device = { kind: System; id: string; set: string | null };
type Frame = { file: string; device: string; at: string; test: string | null; line: string };

const sh = promisify(execFile);
needWebp();
const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash >= 0 ? argv.slice(0, dash) : argv;
const command = dash >= 0 ? argv.slice(dash + 1) : [];
const flag = (name: string) => { const i = own.indexOf(name); return i >= 0 ? own[i + 1] ?? null : null; };
const out = flag('--out');
const ios = flag('--ios');
const android = flag('--android');
const every = Number(flag('--every') ?? '700');
if (!out || (!ios && !android)) {
  console.error('usage: node server/capture.ts --out <dir> (--ios <udid>|booted | --android <serial>|all) [--every ms] [-- command ...]');
  process.exit(2);
}
const home = process.env.HOME ?? '';
const testing = join(home, 'Library/Developer/XCTestDevices');
const onPath = (tool: string) => { try { return execFileSync('which', [tool], { encoding: 'utf8' }).trim() || null; } catch { return null; } };
/* adb from the SDK the environment names, else the usual SDK folders, else PATH. */
const adb = !android ? '' : [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(home, 'Library/Android/sdk'), join(home, 'Android/Sdk'), '/opt/homebrew/share/android-commandlinetools']
  .flatMap((sdk) => (sdk ? [join(sdk, 'platform-tools', 'adb')] : [])).find((path) => existsSync(path)) ?? onPath('adb');
if (android && !adb) { console.error('[capture] no adb: set ANDROID_HOME to the Android SDK'); process.exit(2); }
if (ios && !onPath('xcrun')) { console.error('[capture] no xcrun: the iOS simulator needs Xcode'); process.exit(2); }

/* The devices to watch: named, or every booted simulator (the default set and the E2E's clones) or adb device. */
async function devices(): Promise<Device[]> {
  const list: Device[] = [];
  if (ios && ios !== 'booted') list.push({ kind: System.ios, id: ios, set: null });
  if (ios === 'booted') {
    for (const set of existsSync(testing) ? [null, testing] : [null]) {
      try {
        const { stdout } = await sh('xcrun', ['simctl', ...(set ? ['--set', set] : []), 'list', 'devices', 'booted', '-j']);
        const runtimes = JSON.parse(stdout).devices as Record<string, { udid: string }[]>;
        for (const d of Object.values(runtimes).flat()) list.push({ kind: System.ios, id: d.udid, set });
      } catch { /* no simulators in this set */ }
    }
  }
  if (android && android !== 'all') list.push({ kind: System.android, id: android, set: null });
  if (android === 'all') {
    try {
      const { stdout } = await sh(adb as string, ['devices']);
      for (const line of stdout.split('\n').slice(1)) { const [id, state] = line.trim().split(/\s+/); if (id && state === 'device') list.push({ kind: System.android, id, set: null }); }
    } catch { /* adb not running yet */ }
  }
  return list;
}

const scratch = join(tmpdir(), `brandbook-capture-${process.pid}.png`);
async function screenshot(d: Device): Promise<Buffer | null> {
  try {
    if (d.kind === System.android) return (await sh(adb as string, ['-s', d.id, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 64 << 20 })).stdout;
    const file = `${scratch}.${d.id}`;
    await sh('xcrun', ['simctl', ...(d.set ? ['--set', d.set] : []), 'io', d.id, 'screenshot', '--type=png', file]);
    const png = readFileSync(file);
    rmSync(file, { force: true });
    return png;
  } catch { return null; }
}

/* A screenshot as a 24 × 48 grid of mean luminance. */
const COLS = 24;
const ROWS = 48;
function signature(png: Buffer): Float32Array | null {
  const img = decode(png);
  if (!img) return null;
  const g = grid(img, COLS, ROWS);
  return new Float32Array(COLS * ROWS).map((_, i) => (g[i * 3] * 2 + g[i * 3 + 1] * 5 + g[i * 3 + 2]) / 8);
}

/* The largest and the mean change of the cells below the status bar, whose clock would make every frame new. */
const SKIP = Math.ceil(ROWS * 0.07) * COLS;
const change = (a: Float32Array, b: Float32Array) => { let most = 0; for (let i = SKIP; i < a.length; i += 1) most = Math.max(most, Math.abs(a[i] - b[i])); return most; };
const mean = (a: Float32Array, b: Float32Array) => { let sum = 0; for (let i = SKIP; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]); return sum / (a.length - SKIP); };
const SETTLED = 4;
const ALIKE = 10;
/* A screen that keeps moving is kept once, after MOVING ms, if it is another screen altogether (mean change over APART). */
const MOVING = 5000;
const APART = 6;
const RECENT = 12;

mkdirSync(out, { recursive: true });
const index = join(out, 'frames.json');
const frames: Frame[] = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : [];
const before = frames.length;
const seen = new Map<string, { last: Float32Array | null; kept: Float32Array[]; moving: number | null }>();
let test: string | null = null;
const tests = new Map<string, string>();
const tails = new Map<string, ChildProcess>();

/* An Android device's tests, from its logcat: the runner logs "started: method(class)" for each. */
function follow(d: Device, key: string) {
  if (d.kind !== System.android || tails.has(key)) return;
  const tail = spawn(adb as string, ['-s', d.id, 'logcat', '-v', 'brief', '-T', '1', '-s', 'TestRunner:I'], { stdio: ['ignore', 'pipe', 'ignore'] });
  tail.stdout?.on('data', (b: Buffer) => { for (const m of b.toString().matchAll(/started: ([\w$]+)\(([\w.$]+)\)/g)) tests.set(key, `${m[2]}.${m[1]}`); });
  tail.on('exit', () => tails.delete(key));
  tails.set(key, tail);
}
let line = '';
let klass = '';

/* What the command is doing: the XCTest case or instrumentation test it started last, and its last line. */
function read(text: string) {
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    line = l.slice(0, 200);
    const xc = /Test [Cc]ase '-\[(\S+) (\S+)\]' started/.exec(l) ?? /Test [Cc]ase '([^']+)' started/.exec(l);
    if (xc) test = xc[2] ? `${xc[1]}.${xc[2]}` : xc[1];
    const cls = /INSTRUMENTATION_STATUS: class=(\S+)/.exec(l);
    if (cls) klass = cls[1];
    const t = /INSTRUMENTATION_STATUS: test=(\S+)/.exec(l);
    if (t) test = `${klass}.${t[1]}`;
  }
}

async function poll(d: Device) {
  const png = await screenshot(d);
  const sig = png ? signature(png) : null;
  if (!png || !sig) return;
  const key = `${d.kind}:${d.id}`;
  const s = seen.get(key) ?? { last: null, kept: [], moving: Date.now() };
  seen.set(key, s);
  const settled = s.last !== null && change(sig, s.last) < SETTLED;
  /* moving: when this stretch of movement began, or null once a frame of it is kept */
  if (settled) s.moving = Date.now();
  s.last = sig;
  const keep = settled
    ? !s.kept.some((k) => change(sig, k) < ALIKE)
    : s.moving !== null && Date.now() - s.moving > MOVING && !s.kept.some((k) => mean(sig, k) < APART);
  if (!keep) return;
  if (!settled) s.moving = null;
  s.kept = [...s.kept.slice(-(RECENT - 1)), sig];
  const file = `${String(frames.length + 1).padStart(4, '0')}.webp`;
  writeFileSync(join(out as string, file), await toWebp(png));
  const named = tests.get(key) ?? test;
  frames.push({ file, device: key, at: new Date().toISOString(), test: named, line });
  writeFileSync(index, `${JSON.stringify(frames, null, 1)}\n`);
  console.log(`[capture] ${file}  ${named ?? line}${settled ? '' : '  (still moving)'}`);
}

let running = true;
let exit = 0;
if (command.length) {
  const child = spawn(command[0], command.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] });
  child.stdout.on('data', (b: Buffer) => { process.stdout.write(b); read(b.toString()); });
  child.stderr.on('data', (b: Buffer) => { process.stderr.write(b); read(b.toString()); });
  child.on('exit', (code) => { exit = code ?? 1; running = false; });
} else {
  process.on('SIGINT', () => { running = false; });
  console.log('[capture] watching until Ctrl-C');
}

let watched: Device[] = [];
let looked = 0;
let alone = Date.now();
while (running) {
  const tick = Date.now();
  if (tick - looked > 5000) {
    const now = await devices();
    if (now.map((d) => d.id).join() !== watched.map((d) => d.id).join()) console.log(`[capture] watching ${now.map((d) => `${d.kind}:${d.id}`).join(', ') || 'nothing yet'}`);
    watched = now;
    looked = tick;
    for (const d of watched) follow(d, `${d.kind}:${d.id}`);
  }
  if (watched.length) alone = tick;
  else if (tick - alone > 30000) { console.log(`[capture] no ${[ios && 'booted simulator', android && 'adb device'].filter(Boolean).join(' or ')} to watch yet`); alone = tick; }
  await Promise.all(watched.map(poll));
  await new Promise((r) => setTimeout(r, Math.max(0, every - (Date.now() - tick))));
}
for (const tail of tails.values()) tail.kill();
const added = frames.length - before;
if (added) console.log(`[capture] ${added} new frames, ${frames.length} in ${index}`);
else console.error('[capture] no frames: no device was up, or --ios/--android named another one');
process.exit(exit || (added ? 0 : 1));
