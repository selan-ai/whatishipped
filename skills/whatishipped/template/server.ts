/*
 * The brandbook's server: `npm start` (node server.ts), then http://localhost:4321. No dependencies.
 *   /                   the brandbook's pages: every path without a file extension gets app/index.html
 *   /api/index          what each platform's board holds, read by server/board.ts
 *   /app/*.ts           the brandbook's own code, served as JavaScript (Node strips the types; nothing is built ahead)
 *   /<platform>/*       a platform's board files as they are
 * PORT or the first argument picks another port.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { readBrandbook } from './server/board.ts';

const root = import.meta.dirname;
const port = Number(process.argv[2] ?? process.env.PORT ?? 4321);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://brandbook').pathname);
  const headers = { 'cache-control': 'no-store' };
  try {
    if (path === '/api/index') {
      res.writeHead(200, { ...headers, 'content-type': types['.json'] }).end(JSON.stringify(await readBrandbook(root)));
      return;
    }
    const ext = extname(path);
    const file = normalize(join(root, ext ? path : '/app/index.html'));
    if (!file.startsWith(root + sep) || path.includes('/server/') || path.endsWith('/server.ts')) {
      res.writeHead(404, headers).end();
      return;
    }
    const body = await readFile(file);
    const out = ext === '.ts' ? stripTypeScriptTypes(body.toString(), { mode: 'strip' }) : body;
    res.writeHead(200, { ...headers, 'content-type': types[ext || '.html'] ?? 'application/octet-stream' }).end(out);
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    if (!missing) console.error(path, e);
    res.writeHead(missing ? 404 : 500, headers).end(missing ? '' : String(e));
  }
}).listen(port, () => console.log(`Brandbook on http://localhost:${port}`));
