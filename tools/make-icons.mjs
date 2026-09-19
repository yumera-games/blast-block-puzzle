/**
 * ホーム画面用アイコンの生成（工程 W-7）。**このスクリプトがアイコンの正本。**
 *
 *   node tools/make-icons.mjs
 *
 * 外部素材・外部サービス・生成 AI を使わず、リポジトリ内だけで再現できる。
 * 出力は public/icons/ の PNG 4 点で、生成結果を手で置き換えないこと。
 *
 * 図案（この工程で固定。**新しいロゴも名前も作らない**）:
 *   ・正方形。外周まで濃紺で塗る（透明な縁を残さない）
 *   ・中央に角丸ブロックを 2x2。盤面に置いた 1 手を表す
 *   ・色は**ゲームで実際に使っている CELL_COLOR の 4 色だけ**
 *   ・写真・文字・細かい装飾は入れない。小さく出しても形が分かることだけを狙う
 *   ・人物画像は使わない
 *
 * maskable は OS が円や角丸へ切り抜くので、ブロックを小さくして
 * **中央 80%（半径 0.4）の安全域の内側**へ収める。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodePng } from './png.mjs';

/** 背景。style.css の背景勾配の上端 #111838（濃紺）をそのまま使う。 */
const BG = [0x11, 0x18, 0x38];

/** ブロックの色。src/ui/colors.ts の CELL_COLOR と同じ値。 */
const BLOCKS = [
  [0xd9, 0x53, 0x4f], // red
  [0x4a, 0x90, 0xd9], // blue
  [0xd9, 0xb3, 0x4a], // yellow
  [0x4f, 0xb3, 0x6a], // green
];

/** 図形は 4x4 の超過標本で描いてから縮小する（角の階段を消すため）。 */
const SS = 4;

/** 角丸正方形の内側か。x,y は矩形左上からの相対座標。 */
function insideRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const cx = x < r ? r : x > w - r ? w - r : x;
  const cy = y < r ? r : y > h - r ? h - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * 1 枚ぶんの RGBA を作る。
 * `cluster` は 2x2 のまとまりの一辺（画像サイズに対する比）。
 */
function render(size, cluster) {
  const S = size * SS;
  const acc = new Float64Array(size * size * 3);
  const C = S * cluster;
  const gap = C * 0.06;
  const b = (C - gap) / 2;
  const r = b * 0.22;
  const left = (S - C) / 2;
  const top = (S - C) / 2;

  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      let color = BG;
      for (let i = 0; i < 4; i++) {
        const bx = left + (i % 2) * (b + gap);
        const by = top + Math.floor(i / 2) * (b + gap);
        if (insideRoundRect(sx - bx, sy - by, b, b, r)) {
          color = BLOCKS[i];
          break;
        }
      }
      const o = (Math.floor(sy / SS) * size + Math.floor(sx / SS)) * 3;
      acc[o] += color[0];
      acc[o + 1] += color[1];
      acc[o + 2] += color[2];
    }
  }

  const n = SS * SS;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = Math.round(acc[i * 3] / n);
    rgba[i * 4 + 1] = Math.round(acc[i * 3 + 1] / n);
    rgba[i * 4 + 2] = Math.round(acc[i * 3 + 2] / n);
    rgba[i * 4 + 3] = 255; // **全面不透明。**透明な外周を残さない
  }
  return rgba;
}

/** 通常アイコンのまとまり比。maskable は安全域へ収めるため小さくする。 */
export const CLUSTER = { normal: 0.62, maskable: 0.5 };

export const ICONS = [
  { file: 'icon-192.png', size: 192, cluster: CLUSTER.normal },
  { file: 'icon-512.png', size: 512, cluster: CLUSTER.normal },
  { file: 'icon-512-maskable.png', size: 512, cluster: CLUSTER.maskable },
  { file: 'apple-touch-icon-180.png', size: 180, cluster: CLUSTER.normal },
];

export function buildIcon(size, cluster) {
  return encodePng(size, size, render(size, cluster));
}

function main() {
  const out = new URL('../public/icons/', import.meta.url).pathname;
  mkdirSync(out, { recursive: true });
  for (const icon of ICONS) {
    const png = buildIcon(icon.size, icon.cluster);
    const path = join(out, icon.file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, png);
    console.log(`${icon.file}  ${icon.size}x${icon.size}  ${png.length} バイト`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('make-icons.mjs')) main();
