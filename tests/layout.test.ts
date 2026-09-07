import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { LAYOUT_UNITS, computeLayout, type Layout } from '../src/ui/layout';

/**
 * 実機に合わせた「使える CSS ピクセル領域」。
 * #app は左右 8px の padding を持ち、HUD・ヒント行・操作ボタンが縦を食う。
 * 実測（Phase 2A の 393x852 / 320x568）に合わせた近似値で確かめる。
 */
const AVAIL = {
  '393x852': { w: 377, h: 680 },
  '320x568': { w: 304, h: 400 },
} as const;

const layoutFor = (k: keyof typeof AVAIL): Layout =>
  computeLayout(AVAIL[k].w, AVAIL[k].h, 2);

describe('レイアウト（予告ストリップ）', () => {
  it('予告ストリップの下端は盤面上端を越えない', () => {
    for (const key of Object.keys(AVAIL) as (keyof typeof AVAIL)[]) {
      const l = layoutFor(key);
      expect(l.stripH, key).toBeGreaterThan(0);
      expect(l.stripY + l.stripH, key).toBeLessThanOrEqual(l.boardY);
    }
  });

  it('予告の描画領域（ストリップ）は盤面と交差しない', () => {
    for (const key of Object.keys(AVAIL) as (keyof typeof AVAIL)[]) {
      const l = layoutFor(key);
      const strip = { top: l.stripY, bottom: l.stripY + l.stripH };
      const board = { top: l.boardY, bottom: l.boardY + l.boardH };
      // 縦方向に 1px も重ならない
      expect(strip.bottom, key).toBeLessThanOrEqual(board.top);
      expect(Math.max(0, Math.min(strip.bottom, board.bottom) - Math.max(strip.top, board.top)), key).toBe(0);
    }
  });

  it('ストリップは canvas の内側に収まる', () => {
    for (const key of Object.keys(AVAIL) as (keyof typeof AVAIL)[]) {
      const l = layoutFor(key);
      expect(l.stripY, key).toBeGreaterThanOrEqual(0);
      expect(l.stripY + l.stripH, key).toBeLessThanOrEqual(l.height);
      expect(l.boardX + l.boardW, key).toBeLessThanOrEqual(l.width);
    }
  });

  it('320x568 相当で canvas が利用可能領域に収まる', () => {
    const a = AVAIL['320x568'];
    const l = computeLayout(a.w, a.h, 2);
    expect(l.cssWidth).toBeLessThanOrEqual(a.w);
    expect(l.cssHeight).toBeLessThanOrEqual(a.h);
    // 盤面・トレイが潰れていない
    expect(l.boardW / l.dpr).toBeGreaterThan(180);
    expect(l.trayH).toBeGreaterThan(l.cell);
  });

  it('393x852 相当でも盤面幅と 8x8 を保つ', () => {
    const a = AVAIL['393x852'];
    const l = computeLayout(a.w, a.h, 2);
    expect(l.cssWidth).toBeLessThanOrEqual(a.w);
    expect(l.cssHeight).toBeLessThanOrEqual(a.h);
    expect(l.boardW).toBe(BALANCE.board.cols * l.cell);
    expect(l.boardH).toBe(BALANCE.board.rows * l.cell);
    // 幅で決まるサイズ（Phase 2A から変わっていないこと）
    expect(Math.round(l.cell / l.dpr)).toBe(45);
  });

  it('LAYOUT_UNITS はストリップぶんを含む', () => {
    // 盤面 8 行 + ストリップ + すき間 + 下の余白 + トレイ + 上下 padding
    expect(LAYOUT_UNITS).toBeGreaterThan(BALANCE.board.rows);
    const a = AVAIL['320x568'];
    const l = computeLayout(a.w, a.h, 2);
    // 高さの内訳が LAYOUT_UNITS と整合している（丸め誤差ぶんの許容つき）
    expect(l.height).toBeLessThanOrEqual(Math.ceil(l.cell * LAYOUT_UNITS) + 6);
  });

  it('予告の有無でレイアウトは変わらない（盤面位置が動かない）', () => {
    // computeLayout は予告の状態を引数に取らない＝盤面位置は予告に依存しない。
    const a = AVAIL['393x852'];
    const x = computeLayout(a.w, a.h, 2);
    const y = computeLayout(a.w, a.h, 2);
    expect(y).toEqual(x);
    expect(y.boardY).toBe(x.boardY);
    expect(y.stripY).toBe(x.stripY);
  });

  it('順序は ストリップ → 盤面 → すき間 → トレイ', () => {
    const l = layoutFor('393x852');
    expect(l.stripY).toBeLessThan(l.boardY);
    expect(l.boardY + l.boardH).toBeLessThanOrEqual(l.trayY);
    expect(l.trayY + l.trayH).toBeLessThanOrEqual(l.height);
  });
});
