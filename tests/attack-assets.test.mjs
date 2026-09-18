import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

/* 素材の検査。**node の fs / crypto を使うので TypeScript の対象外**（.mjs）。
   tsconfig に @types/node を足さずに済ませるため、この 1 ファイルだけ分けている。 */

describe('attack: 素材', () => {
  const MASTER = 'docs/design/assets/production/nei/nei-attack-master-v2.png';
  it('正本 PNG が変わっていない', () => {
    const buf = readFileSync(MASTER);
    expect(statSync(MASTER).size).toBe(2264720);
    expect(createHash('sha256').update(buf).digest('hex')).toBe(
      '060ca0416dc954ef13c88c40e94df6539645d967c3451f8aeaacfded763e8aec',
    );
  });

  it('配信用 WebP が 1x / 2x とも存在し、120,000 バイト以内', () => {
    for (const [f, w, h] of [
      ['public/characters/nei-attack-1x.webp', 168, 272],
      ['public/characters/nei-attack-2x.webp', 335, 544],
    ]) {
      const buf = readFileSync(f);
      expect(buf.length, f).toBeLessThanOrEqual(120000);
      // WebP の VP8X/VP8L ヘッダから寸法を読む（デコーダに依存せず形式も確かめる）
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
      const vp8x = buf.indexOf('VP8X');
      expect(vp8x, `${f} は VP8X（α つき）であること`).toBeGreaterThan(0);
      expect(buf[vp8x + 8] & 0x10, `${f} に ALPHA フラグ`).toBe(0x10);
      const cw = 1 + (buf[vp8x + 12] | (buf[vp8x + 13] << 8) | (buf[vp8x + 14] << 16));
      const ch = 1 + (buf[vp8x + 15] | (buf[vp8x + 16] << 8) | (buf[vp8x + 17] << 16));
      expect([f, cw, ch]).toEqual([f, w, h]);
    }
  });

  it('1x / 2x とも正本の画布比を 1px 以内で保つ（等方縮小・切り抜きなし）', () => {
    // 整数画素へ丸める以上、比は完全一致しない。**1px 以内**であることを見る。
    for (const [w, h] of [
      [168, 272],
      [335, 544],
    ]) {
      expect(Math.abs(w - (h * 1596) / 2592), `${w}x${h}`).toBeLessThanOrEqual(1);
    }
    // 2x は 1x の 2 倍の画素数帯にある（別の基準で作っていない）
    expect(Math.abs(335 - 168 * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(544 - 272 * 2)).toBeLessThanOrEqual(1);
  });
});
