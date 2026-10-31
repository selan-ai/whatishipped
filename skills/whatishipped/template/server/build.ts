/*
 * The brandbook as static files, for any host that serves a folder: `npm run build` writes dist/ (or the folder named
 * first). It does once what server.ts does per request: the app's TypeScript becomes JavaScript, the platforms are
 * read into api/index.json, and index.html is the page for every address, so the host must answer any path without
 * a file with it (Cloudflare's `not_found_handling: "single-page-application"`).
 * Every image goes as lossless WebP: one a platform folder still holds as PNG or JPEG is converted in dist/ and the
 * paths that name it there rewritten (node server/webp.ts does the same to the folders themselves, for good). Last, it
 * checks that every image the hosted board names is in dist/, and exits 1 when one is not.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Index } from '../app/types.ts';
import { readBrandbook } from './board.ts';
import { convert, needWebp, rewrite } from './webp.ts';

needWebp();
const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(root, 'dist'));
const index = await readBrandbook(root);

await rm(out, { recursive: true, force: true });
for (const p of index.platforms) await cp(join(root, p.id), join(out, p.id), { recursive: true });

const folders = index.platforms.map((p) => join(out, p.id));
const { converted, before, after } = await convert(folders);
rewrite(folders, out);
for (const p of index.platforms) for (const s of p.screens) for (const r of s.refs) if (converted.has(join(out, p.id, r.file))) r.file = r.file.replace(/\.(png|jpe?g)$/i, '.webp');
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
if (converted.size) console.log(`${converted.size} images in the platform folders are PNG or JPEG: dist/ has them as lossless WebP (${mb(before)} → ${mb(after)}). node server/webp.ts stores them as WebP for good.`);

// The browser asks for each module by the name it imports, so ./ui.ts is written as ./ui.js.
const js = (code: string) => code.replace(/((?:from|import)\s*['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2');
for (const entry of await readdir(join(root, 'app'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const from = join(entry.parentPath, entry.name);
  const to = join(out, 'app', relative(join(root, 'app'), from));
  await mkdir(dirname(to), { recursive: true });
  if (from.endsWith('.ts')) await writeFile(to.replace(/\.ts$/, '.js'), js(stripTypeScriptTypes(await readFile(from, 'utf8'), { mode: 'strip' })));
  else await cp(from, to);
}
await writeFile(join(out, 'index.html'), (await readFile(join(root, 'app', 'index.html'), 'utf8')).replace('/app/shell.ts', '/app/shell.js'));
await mkdir(join(out, 'api'));
await writeFile(join(out, 'api', 'index.json'), JSON.stringify(index));

const missing = absent(out, index);
const size = (dir: string): number => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((n, e) => n + statSync(join(e.parentPath, e.name)).size, 0);
console.log(`${relative(process.cwd(), out) || '.'}: ${index.platforms.map((p) => p.id).join(', ')}, ${mb(size(out))}`);
if (missing.length) {
  console.error(`${missing.length} images the board names are not in dist/:\n  ${missing.slice(0, 40).join('\n  ')}`);
  process.exitCode = 1;
}

/*
 * Every image the hosted board names that dist/ lacks: each screenshot in the index, and each image path in a platform's
 * files that points into the board (from the platform folder, from the file itself, or from the root).
 */
function absent(dist: string, ix: Index): string[] {
  const out: string[] = [];
  for (const p of ix.platforms) {
    for (const s of p.screens) for (const r of s.refs) if (!existsSync(join(dist, p.id, r.file))) out.push(`api/index.json: ${p.id}/${r.file} (${s.name})`);
    const folder = join(dist, p.id);
    const texts = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.(js|css|json|html)$/i.test(e.name)).map((e) => join(e.parentPath, e.name));
    for (const file of texts) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/[^\s"'`()<>,;=\\]*\.(?:png|jpe?g|webp|gif|svg|avif)(?![\w-])/gi)) {
        const path = m[0];
        if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.includes('${')) continue;
        const clean = (() => { try { return decodeURIComponent(path); } catch { return path; } })();
        const from = clean.startsWith('/') ? [join(dist, clean)] : [folder, dirname(file)].map((b) => resolve(b, clean));
        if (from.some((f) => f.startsWith(dist + sep) && existsSync(f))) continue;
        const first = clean.replace(/^\.\//, '').split('/')[0];
        const hosted = clean.startsWith('/') || clean.startsWith('../') || [folder, dirname(file)].some((b) => existsSync(join(b, first)) && statSync(join(b, first)).isDirectory());
        if (hosted) out.push(`${relative(dist, file)}:${text.slice(0, m.index).split('\n').length}: ${path}`);
      }
    }
  }
  return out;
}
