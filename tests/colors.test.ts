import { describe, expect, it } from 'vitest';
import { CELL_COLOR, CELL_DEEP, CELL_EDGE, UI } from '../src/ui/colors';
import type { Color } from '../src/game/types';

const COLORS: Color[] = ['red', 'blue', 'yellow', 'green', 'purple'];

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}
/** 0〜360 の色相。識別が色相差でも成り立っていることを見る。 */
function hue(hex: number): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}
function luma(hex: number): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('colors: 5 色の識別（工程 W-2 で見た目を整えても意味は変えない）', () => {
  it('5 色そろっている', () => {
    for (const c of COLORS) {
      expect(CELL_COLOR[c], c).toBeTypeOf('number');
      expect(CELL_EDGE[c], c).toBeTypeOf('number');
      expect(CELL_DEEP[c], c).toBeTypeOf('number');
    }
  });

  it('どの 2 色も色相が十分に離れている（明度差だけに頼らない）', () => {
    for (let i = 0; i < COLORS.length; i++) {
      for (let j = i + 1; j < COLORS.length; j++) {
        const gap = hueGap(hue(CELL_COLOR[COLORS[i]!]), hue(CELL_COLOR[COLORS[j]!]));
        expect(gap, `${COLORS[i]} と ${COLORS[j]}`).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('空セルと青ブロックを混同しない（明度が大きく離れている）', () => {
    expect(luma(CELL_COLOR.blue) - luma(UI.cellEmpty)).toBeGreaterThan(60);
  });

  it('空セルはほぼ無彩色（色ブロックと取り違えない）', () => {
    const [r, g, b] = rgb(UI.cellEmpty);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(24);
  });

  it('CELL_DEEP は同じ色の暗い版（色相を変えていない）', () => {
    for (const c of COLORS) {
      expect(hueGap(hue(CELL_DEEP[c]), hue(CELL_COLOR[c])), c).toBeLessThan(12);
      expect(luma(CELL_DEEP[c]), c).toBeLessThan(luma(CELL_COLOR[c]));
    }
  });

  it('CELL_EDGE は同じ色の明るい版（上辺ハイライト用）', () => {
    for (const c of COLORS) {
      expect(hueGap(hue(CELL_EDGE[c]), hue(CELL_COLOR[c])), c).toBeLessThan(12);
      expect(luma(CELL_EDGE[c]), c).toBeGreaterThan(luma(CELL_COLOR[c]));
    }
  });

  it('盤面の面・外周・空セルが互いに区別できる', () => {
    expect(UI.boardBg).not.toBe(UI.cellEmpty);
    expect(luma(UI.cellEmpty)).toBeGreaterThan(luma(UI.boardBg));
    expect(luma(UI.cellEmptyTop)).toBeLessThan(luma(UI.cellEmpty));
    expect(UI.boardEdge).toBeTypeOf('number');
  });

  it('特殊ブロックの面は通常ブロックより暗い（色だけに頼らず面でも分かる）', () => {
    for (const c of COLORS) expect(luma(UI.special), c).toBeLessThan(luma(CELL_COLOR[c]));
  });
});
