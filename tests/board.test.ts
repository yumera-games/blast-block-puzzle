import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/Board';
import { shapeById } from '../src/data/pieces';

describe('Board 配置判定', () => {
  it('board 外への配置を拒否する', () => {
    const b = new Board();
    const h4 = shapeById('h4').cells;
    expect(b.canPlace(h4, 0, 4)).toBe(true);
    expect(b.canPlace(h4, 0, 5)).toBe(false); // 右へはみ出す
    expect(b.canPlace(h4, 0, -1)).toBe(false);
    const v4 = shapeById('v4').cells;
    expect(b.canPlace(v4, 4, 0)).toBe(true);
    expect(b.canPlace(v4, 5, 0)).toBe(false); // 下へはみ出す
  });

  it('occupied セルへの配置を拒否する', () => {
    const b = Board.fromStrings(['..R.....']);
    expect(b.canPlace(shapeById('h3').cells, 0, 0)).toBe(false);
    expect(b.canPlace(shapeById('h3').cells, 0, 3)).toBe(true);
    expect(b.canPlace(shapeById('dot').cells, 0, 2)).toBe(false);
  });

  it('place は埋めた index を返し、盤面へ色を書く', () => {
    const b = new Board();
    const idx = b.place(shapeById('h3').cells, 2, 1, 'blue');
    expect(idx).toEqual([b.idx(2, 1), b.idx(2, 2), b.idx(2, 3)]);
    expect(b.get(2, 2).kind).toBe('normal');
    expect(b.get(2, 2).color).toBe('blue');
    expect(b.countFilled()).toBe(3);
  });

  it('fromStrings / toStrings が往復する', () => {
    const lines = ['R.B.....', '..>.*..@', '.......^', '........', '........', '........', '........', 'GGGGGGGG'];
    expect(Board.fromStrings(lines).toStrings()).toEqual(lines);
  });

  it('neighbors は上下左右のみ（斜めを含まない）', () => {
    const b = new Board();
    const center = b.idx(3, 3);
    expect(b.neighbors(center).sort((a, x) => a - x)).toEqual(
      [b.idx(2, 3), b.idx(3, 2), b.idx(3, 4), b.idx(4, 3)].sort((a, x) => a - x),
    );
    expect(b.neighbors(b.idx(0, 0)).length).toBe(2);
  });
});
