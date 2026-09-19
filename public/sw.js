/**
 * Service Worker（工程 W-7）。**最低限のオフライン起動だけ。**
 *
 * 目的は「一度ふつうに開いたあとなら、通信が切れてもタイトルから遊べる」こと。
 * ゲームのルール・保存データ・音・画像には一切関与しない。
 * `localStorage`（blast-block:progress / :settings / :stats / :records）には触らない。
 *
 * 規則はこのファイルの先頭 3 つの定数だけで決まる。**増やすときもここ 1 か所。**
 *
 *   VERSION … 上げると、有効化のときに**これ以外のキャッシュを全部消す**
 *   CACHE   … この版で使う唯一のキャッシュ名
 *   SCOPE   … この Service Worker が置かれた場所（GitHub Pages ではサブパス）
 *
 * 扱うのは**同じ origin の、SCOPE 配下の GET だけ**。それ以外は素通しする。
 * 外部通信は増やさない（このゲームは外部 CDN も外部音源も使っていない）。
 *
 * 更新の当たり方:
 *   ・HTML（ページ遷移）は**ネットワーク優先**。新しい版が出ていれば必ずそれを読む。
 *     取れなければキャッシュのページを返す（＝オフライン起動）。
 *   ・ハッシュ付きの JS / CSS と WebP は**キャッシュ優先**。内容が変わればファイル名が
 *     変わるので、古い名前を返してしまうことがない。
 *   ・`skipWaiting()` も `clients.claim()` も呼ばない。**遊んでいる最中に
 *     いきなり再読み込みさせない。**新しい版はタブを閉じた次の起動から有効になる。
 */

const VERSION = 'v1';
const CACHE = `blast-block-${VERSION}`;
const SCOPE = new URL('./', self.location).href;

/** 起動に必要な最小限。ハッシュ付きの資産は実際に読んだときに入れる。 */
const PRECACHE = ['./'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // 1 つでも失敗したら install ごと失敗するのを避ける（オフラインでの登録など）。
      Promise.all(PRECACHE.map((p) => cache.add(p).catch(() => undefined))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('blast-block-') && k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
});

/** この Service Worker が面倒を見る要求か。 */
function handled(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  // **SCOPE の外へは出さない。**サブパス外のものはキャッシュしない。
  return url.href.startsWith(SCOPE);
}

/** 内容が変わればファイル名も変わるもの（＝そのまま保存してよいもの）。 */
function immutable(url) {
  return /\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname) || /\.(?:webp|png)$/.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (err) {
    // ページ遷移は、そのページ → 起点ページ の順で代わりを探す。
    const hit = (await cache.match(request)) || (await cache.match('./'));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!handled(request)) return; // 素通し。**ここで何もしないのが正しい。**
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (immutable(new URL(request.url))) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
