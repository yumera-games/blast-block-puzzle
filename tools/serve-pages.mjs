/**
 * GitHub Pages と同じ**サブパス**で dist/ を配信する確認用サーバー（工程 W-6）。
 *
 *   node tools/serve-pages.mjs [port] [basePath]
 *   既定: http://localhost:5184/blast-block-puzzle/
 *
 * 公開先は https://yumera-games.github.io/blast-block-puzzle/ なので、
 * **`/` 直下で確認しても足りない。**サブパスでも HTML・JS・CSS・WebP が
 * 解決できることを、配信と同じ形で確かめるために使う。
 *
 * 外部依存なし（Node の http と fs だけ）。本番のコードには含まれない。
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2] || 5184);
const BASE = (process.argv[3] || '/blast-block-puzzle/').replace(/\/*$/, '/');
const ROOT = new URL('../dist/', import.meta.url).pathname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);

  // GitHub Pages のプロジェクトサイトと同じ挙動：サブパス外は 404、
  // 末尾スラッシュ無しはスラッシュ付きへ 301。
  if (path + '/' === BASE) {
    res.writeHead(301, { Location: BASE });
    res.end();
    return;
  }
  if (!path.startsWith(BASE)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 (サブパスの外)');
    return;
  }

  let rel = path.slice(BASE.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = join(ROOT, normalize('/' + rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    statSync(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`dist/ を http://localhost:${PORT}${BASE} で配信しています（Ctrl+C で終了）`);
});
