/*
 * The brandbook as static files, for any host that serves a folder: `npm run build` writes dist/ (or the folder named
 * first). It does once what server.ts does per request: the app's TypeScript becomes JavaScript, the platforms are
 * read into api/index.json, and index.html is the page for every address, so the host must answer any path without
 * a file with it (Cloudflare's `not_found_handling: "single-page-application"`).
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { readBrandbook } from './board.ts';

const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(root, 'dist'));
const index = await readBrandbook(root);

await rm(out, { recursive: true, force: true });
for (const p of index.platforms) await cp(join(root, p.id), join(out, p.id), { recursive: true });

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
console.log(`${relative(process.cwd(), out) || '.'}: ${index.platforms.map((p) => p.id).join(', ')}`);
