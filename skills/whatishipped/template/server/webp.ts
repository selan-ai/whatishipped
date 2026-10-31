/*
 * Every image the brandbook stores or ships is lossless WebP: the screenshots of the app, the pictures check.ts writes,
 * the images a drawing uses. libwebp's cwebp and dwebp do the work (brew install webp, apt install webp); there is no
 * PNG fallback. The PNGs Chrome, simctl and adb hand over are read in memory by png.ts and stored as WebP at once.
 *
 *   node server/webp.ts [<folder>...]
 * moves a brandbook over: every PNG and JPEG in the platform folders (or the folders named) becomes a lossless WebP
 * beside it, pixel for pixel, the original is deleted, and every path that names it in the folders' text files
 * (refs.json, match.json, frames.json, the board's .js and .css, RECON.md) is rewritten. It prints any path it could not
 * resolve, to fix by hand. Running it again does nothing.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { decode as decodePng } from './png.ts';
import type { Image } from './png.ts';

/* Stops with what to install when cwebp or dwebp is missing. */
export function needWebp() {
  const missing = ['cwebp', 'dwebp'].filter((tool) => { const r = spawnSync(tool, ['-version']); return Boolean(r.error) || r.status !== 0; });
  if (!missing.length) return;
  console.error(`${missing.join(' and ')} not found. The brandbook stores every image as lossless WebP with libwebp's tools: brew install webp (macOS), apt install webp (Debian, Ubuntu).`);
  process.exit(2);
}

function run(tool: string, args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const p = spawn(tool, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (b: Buffer) => out.push(b));
    p.stderr.on('data', (b: Buffer) => err.push(b));
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(`${tool}: ${Buffer.concat(err).toString().trim() || `exit ${code}`}`))));
    p.stdin.on('error', () => undefined);
    p.stdin.end(input);
  });
}

/* Lossless, the exact pixels (transparent ones too), and the colour profile kept so a non-sRGB screenshot still says so. */
const LOSSLESS = ['-quiet', '-lossless', '-exact', '-metadata', 'icc', '-mt'];

export const isWebp = (b: Buffer) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

/* A PNG or JPEG file's bytes as lossless WebP. */
export const toWebp = (image: Buffer) => run('cwebp', [...LOSSLESS, '-o', '-', '--', '-'], image);

/* Pixels as lossless WebP. */
export function encode(img: Image): Promise<Buffer> {
  const head = Buffer.from(`P7\nWIDTH ${img.width}\nHEIGHT ${img.height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`, 'ascii');
  return run('cwebp', [...LOSSLESS, '-o', '-', '--', '-'], Buffer.concat([head, img.rgba]));
}

/* A WebP's pixels, through dwebp's PAM. */
export async function decode(webp: Buffer): Promise<Image | null> {
  if (!isWebp(webp)) return null;
  const pam = await run('dwebp', ['-quiet', '-pam', '-o', '-', '--', '-'], webp);
  const end = pam.indexOf('ENDHDR\n');
  if (end < 0) return null;
  const head = pam.toString('ascii', 0, end);
  const field = (name: string) => Number(new RegExp(`${name} (\\d+)`).exec(head)?.[1] ?? 0);
  const width = field('WIDTH');
  const height = field('HEIGHT');
  if (field('DEPTH') !== 4 || !width || !height) return null;
  return { width, height, rgba: new Uint8Array(pam.subarray(end + 7, end + 7 + width * height * 4)) };
}

/* A screenshot in either format: WebP as stored, PNG as Chrome or an older brandbook hands it over. */
export const read = async (b: Buffer) => (isWebp(b) ? decode(b) : decodePng(b));

/* The colour profile a WebP carries (its ICCP chunk), or null when it has none or it is sRGB. */
export function webpProfile(webp: Buffer): string | null {
  if (!isWebp(webp)) return null;
  for (let at = 12; at + 8 <= webp.length;) {
    const kind = webp.toString('ascii', at, at + 4);
    const size = webp.readUInt32LE(at + 4);
    if (kind === 'ICCP') {
      const icc = webp.subarray(at + 8, at + 8 + size);
      const text = icc.toString('latin1') + icc.toString('utf16le') + icc.subarray(1).toString('utf16le');
      return /sRGB/i.test(text) ? null : (/(Display P3|Adobe RGB|P3)/i.exec(text)?.[1] ?? 'not sRGB');
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

/* Runs at most as many tasks at once as the machine has cores. */
export async function pool<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(items.length, Math.max(1, availableParallelism())) }, async () => {
    while (next < items.length) { const i = next; next += 1; out[i] = await work(items[i]); }
  });
  await Promise.all(lanes);
  return out;
}

const RASTER = /\.(png|jpe?g)$/i;
/* A path in text that ends in .png or .jpg; a ${…} built in code may hold anything but a closing brace. */
const PATH = /(?:\$\{[^}]*\}|[^\s"'`()<>,;=\\])*\.(?:png|jpe?g)(?![\w-])/gi;
const TEXT = /\.(js|mjs|css|json|html|md|txt)$/i;
const files = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

/*
 * The PNGs and JPEGs under each folder, as lossless WebP beside them; the originals deleted. Returns each converted
 * file (absolute, original name) and the bytes before and after.
 */
export async function convert(folders: string[]) {
  const list = folders.flatMap(files).filter((f) => RASTER.test(f));
  let before = 0;
  let after = 0;
  await pool(list, async (file) => {
    const original = readFileSync(file);
    const webp = await toWebp(original);
    writeFileSync(file.replace(RASTER, '.webp'), webp);
    rmSync(file);
    before += original.length;
    after += webp.length;
  });
  return { converted: new Set(list), before, after };
}

/*
 * Rewrites, in every text file under the folders, each path to a PNG or JPEG that is now a WebP beside it: named from
 * the folder (a board names images from its platform folder), from the text file itself (a stylesheet's url()), or
 * from the brandbook's root (/ios/refs/…). A path built in code (`refs/${id}.png`) is rewritten when the folder it
 * names holds WebP and no PNG or JPEG. Returns the local-looking paths it left, as "file:line: path".
 */
export function rewrite(folders: string[], root: string) {
  const left: string[] = [];
  const exists = (f: string) => { try { return statSync(f).isFile(); } catch { return false; } };
  const listing = new Map<string, string[]>();
  const holds = (dir: string) => {
    if (!listing.has(dir)) { try { listing.set(dir, readdirSync(dir)); } catch { listing.set(dir, []); } }
    return listing.get(dir) as string[];
  };
  for (const folder of folders) {
    const all = files(folder);
    const webps = all.filter((f) => f.endsWith('.webp'));
    const rasters = all.filter((f) => RASTER.test(f));
    for (const file of all.filter((f) => TEXT.test(f))) {
      const text = readFileSync(file, 'utf8');
      if (!/\.(png|jpe?g)\b/i.test(text)) continue;
      const bases = [folder, dirname(file)];
      const moved = (path: string) => {
        const clean = (() => { try { return decodeURIComponent(path); } catch { return path; } })().replace(/^\.\//, '');
        const from = (p: string) => (clean.startsWith('/') ? [resolve(root, p.slice(1))] : bases.map((b) => resolve(b, p)));
        if (!clean.includes('${')) return from(clean).some((f) => !exists(f) && exists(f.replace(RASTER, '.webp')));
        /* A path built in code: its fixed end names a WebP and no PNG or JPEG (`${RES}/logo.png`), or the folder its
           fixed start names holds WebP and no PNG or JPEG (`refs/${id}.png`). */
        const tail = clean.slice(clean.lastIndexOf('}') + 1);
        if (/[^./]\.[a-z]+$/i.test(tail) && tail.includes('/')) {
          const webp = tail.replace(RASTER, '.webp');
          if (webps.some((f) => f.endsWith(webp)) && !rasters.some((f) => f.endsWith(tail))) return true;
        }
        const head = clean.slice(0, clean.indexOf('${'));
        const dir = head.includes('/') ? head.slice(0, head.lastIndexOf('/')) : '.';
        return from(dir).some((d) => { const names = holds(d); return names.some((n) => n.endsWith('.webp')) && !names.some((n) => RASTER.test(n)); });
      };
      let changed = false;
      const out = text.replace(PATH, (path, offset: number) => {
        if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path;
        if (moved(path)) { changed = true; return path.replace(RASTER, '.webp'); }
        const first = path.replace(/^\.\//, '').split('/')[0];
        const local = path.includes('${') || (path.includes('/') && bases.some((b) => holds(b).includes(first) && !exists(join(b, first))));
        if (local) left.push(`${relative(root, file)}:${text.slice(0, offset).split('\n').length}: ${path}`);
        return path;
      });
      if (changed) writeFileSync(file, out);
    }
  }
  return left;
}

/* The platform folders brandbook.json names. */
export function platforms(root: string): string[] {
  const config = JSON.parse(readFileSync(join(root, 'brandbook.json'), 'utf8')) as { platforms: { id: string }[] };
  return config.platforms.map((p) => join(root, p.id));
}

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  needWebp();
  const root = resolve(import.meta.dirname, '..');
  const folders = process.argv.slice(2).length ? process.argv.slice(2).map((f) => resolve(f)) : platforms(root);
  for (const f of folders) if (!f.startsWith(root + sep) && f !== root) console.log(`note: ${f} is outside the brandbook`);
  const { converted, before, after } = await convert(folders);
  const left = rewrite(folders, root);
  console.log(converted.size ? `${converted.size} images to lossless WebP: ${mb(before)} → ${mb(after)}` : 'Every image is WebP already.');
  if (left.length) console.log(`Paths left as they were; fix them by hand if they name an image of the board:\n  ${left.join('\n  ')}`);
}
