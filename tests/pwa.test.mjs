import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodePng } from '../tools/png.mjs';
import { ICONS } from '../tools/make-icons.mjs';

/**
 * ホーム画面からの起動まわりの静的検査（工程 W-7）。
 *
 * **実機の「ホーム画面に追加」は機械では試せない。** ここで見るのは、
 * 追加できるために必要な材料（Manifest・アイコン・メタ情報・Service Worker）が
 * 正しく揃っていて、**公開サブパスの外を指していない**ことだけ。
 */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const readBin = (p) => readFileSync(new URL(`../${p}`, import.meta.url));

/** 公開先。相対指定がここへ解決できることを確かめる基準にする。 */
const PAGES = 'https://yumera-games.github.io/blast-block-puzzle/';
const LOCAL = 'http://localhost:5173/';

describe('pwa: Web App Manifest', () => {
  const raw = read('public/manifest.webmanifest');
  const m = JSON.parse(raw);

  it('有効な JSON で、必須の項目がある', () => {
    expect(typeof m).toBe('object');
    for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
      expect(m[key], key).toBeDefined();
    }
  });

  it('名前・表示方法・向き・配色が指定どおり', () => {
    expect(m.name).toBe('BLAST BLOCK');
    expect(m.short_name).toBe('BLAST BLOCK');
    expect(m.display).toBe('standalone');
    expect(m.orientation).toBe('portrait');
    // 画面の背景と同じ値（style.css の --bg）。新しい色を作っていない。
    expect(m.theme_color).toBe('#0b0d18');
    expect(m.background_color).toBe('#0b0d18');
  });

  it('**start_url と scope が公開サブパスの内側へ解決する**', () => {
    expect(new URL(m.start_url, PAGES).href).toBe(PAGES);
    expect(new URL(m.scope, PAGES).href).toBe(PAGES);
  });

  it('同じ指定がローカル開発でも成立する（相対指定だから）', () => {
    expect(new URL(m.start_url, LOCAL).href).toBe(LOCAL);
    expect(new URL(m.scope, LOCAL).href).toBe(LOCAL);
  });

  it('アイコンの src も外へ出ない', () => {
    expect(m.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of m.icons) {
      expect(icon.src.startsWith('./'), icon.src).toBe(true);
      expect(new URL(icon.src, PAGES).href.startsWith(PAGES), icon.src).toBe(true);
      expect(icon.type).toBe('image/png');
    }
  });

  it('192・512・maskable が揃っている', () => {
    const any = m.icons.filter((i) => i.purpose === 'any').map((i) => i.sizes);
    expect(any).toContain('192x192');
    expect(any).toContain('512x512');
    const mask = m.icons.filter((i) => i.purpose === 'maskable');
    expect(mask).toHaveLength(1);
    expect(mask[0].sizes).toBe('512x512');
  });
});

describe('pwa: アイコン', () => {
  it('4 点とも PNG として読め、寸法が指定どおりの正方形', () => {
    for (const icon of ICONS) {
      const png = decodePng(readBin(`public/icons/${icon.file}`));
      expect(png.width, icon.file).toBe(icon.size);
      expect(png.height, icon.file).toBe(icon.size);
    }
  });

  it('**透明な外周が無い**（全画素が不透明）', () => {
    for (const icon of ICONS) {
      const png = decodePng(readBin(`public/icons/${icon.file}`));
      let minAlpha = 255;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i] < minAlpha) minAlpha = png.data[i];
      expect(minAlpha, icon.file).toBe(255);
    }
  });

  it('四隅まで濃紺で塗られている（縁が欠けていない）', () => {
    const png = decodePng(readBin('public/icons/icon-512.png'));
    const bg = { r: 0x11, g: 0x18, b: 0x38 };
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511], [255, 0], [0, 255]]) {
      expect(png.at(x, y), `${x},${y}`).toEqual({ ...bg, a: 255 });
    }
  });

  it('ゲームで使っている 4 色だけが載っている', () => {
    const png = decodePng(readBin('public/icons/icon-512.png'));
    const allowed = new Set(['17,24,56', '217,83,79', '74,144,217', '217,179,74', '79,179,106']);
    // 角の丸みは背景と混ざるので、ブロックの中心付近だけを見る。
    const spots = [[160, 160], [352, 160], [160, 352], [352, 352]];
    for (const [x, y] of spots) {
      const c = png.at(x, y);
      expect(allowed.has(`${c.r},${c.g},${c.b}`), `${x},${y} = ${c.r},${c.g},${c.b}`).toBe(true);
    }
  });

  it('**maskable の中身が中央 80% の安全域に収まっている**', () => {
    const png = decodePng(readBin('public/icons/icon-512-maskable.png'));
    const cx = png.width / 2;
    const cy = png.height / 2;
    const safe = png.width * 0.4; // 直径 80% の円の半径
    let worst = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const c = png.at(x, y);
        // 背景そのもの以外＝図柄。角の中間色も図柄として厳しく数える。
        if (c.r === 0x11 && c.g === 0x18 && c.b === 0x38) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > worst) worst = d;
      }
    }
    expect(worst).toBeLessThan(safe);
  });

  it('maskable は通常アイコンより図柄が小さい（切り抜き対策）', () => {
    const count = (file) => {
      const png = decodePng(readBin(`public/icons/${file}`));
      let n = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (!(png.data[i] === 0x11 && png.data[i + 1] === 0x18 && png.data[i + 2] === 0x38)) n++;
      }
      return n;
    };
    expect(count('icon-512-maskable.png')).toBeLessThan(count('icon-512.png'));
  });
});

describe('pwa: index.html', () => {
  const html = read('index.html');

  it('Manifest と Apple 用のメタ情報がある', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="BLAST BLOCK"');
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png"');
    expect(html).toContain('name="theme-color" content="#0b0d18"');
  });

  it('**既存の viewport 設定を変えていない**', () => {
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no">',
    );
  });

  it('操作列のボタンは従来どおり 4 つ', () => {
    for (const id of ['btnRetry', 'btnStages', 'btnSoundMain', 'btnDebug']) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});

/**
 * 注釈を取り除いたコード本体。
 * 「使っていない」を見る検査は**注釈に書いた語を拾ってはいけない**ので、
 * ブロック注釈と行頭の行注釈を落としてから見る。
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('pwa: Service Worker', () => {
  const sw = read('public/sw.js');
  const swCode = codeOnly(sw);

  it('キャッシュ名と版は 1 か所で決まる', () => {
    expect(sw).toMatch(/const VERSION = '[^']+';/);
    expect(sw).toContain('const CACHE = `blast-block-${VERSION}`;');
  });

  it('**古いキャッシュを有効化時に消す**', () => {
    expect(sw).toContain("keys.filter((k) => k.startsWith('blast-block-') && k !== CACHE)");
    expect(sw).toContain('caches.delete(k)');
  });

  it('**scope の外と他 origin と GET 以外は扱わない**', () => {
    expect(sw).toContain("if (request.method !== 'GET') return false;");
    expect(sw).toContain('if (url.origin !== self.location.origin) return false;');
    expect(sw).toContain('return url.href.startsWith(SCOPE);');
    expect(sw).toContain("const SCOPE = new URL('./', self.location).href;");
  });

  it('HTML はネットワーク優先、ハッシュ付き資産はキャッシュ優先', () => {
    expect(sw).toContain("if (request.mode === 'navigate')");
    expect(sw).toContain('networkFirst(request)');
    expect(sw).toContain('cacheFirst(request)');
  });

  it('**遊んでいる最中に強制で再読み込みさせない**', () => {
    expect(swCode).not.toContain('skipWaiting');
    expect(swCode).not.toContain('clients.claim');
  });

  it('保存データには触らない', () => {
    expect(swCode).not.toContain('localStorage');
    expect(swCode).not.toContain('blast-block:');
  });

  it('外部 origin への通信を増やしていない', () => {
    expect(swCode).not.toMatch(/https?:\/\//);
  });
});

describe('pwa: 保存データの扱いを変えていない', () => {
  it('localStorage の 4 キーと version はそのまま', () => {
    expect(read('src/game/progress.ts')).toContain("const KEY = 'blast-block:progress'");
    expect(read('src/game/settings.ts')).toContain("const KEY = 'blast-block:settings'");
    expect(read('src/game/stats.ts')).toContain("const KEY = 'blast-block:stats'");
    expect(read('src/game/records.ts')).toContain("const KEY = 'blast-block:records'");
    for (const f of ['progress', 'settings', 'stats', 'records']) {
      expect(read(`src/game/${f}.ts`), f).toContain('const VERSION = 1');
    }
  });
});
