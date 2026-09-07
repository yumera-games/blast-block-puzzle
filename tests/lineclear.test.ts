import { describe, expect, it } from 'vitest';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('LINE CLEAR', () => {
  it('1行完成で消える', () => {
    const { board, result } = playOne(rows({ 7: 'RBYGPRB.' }), 'dot', 'red', 7, 7);
    expect(result.rowsCleared).toBe(1);
    expect(result.colsCleared).toBe(0);
    expect(result.maxChain).toBe(1);
    expect(board.countFilled()).toBe(0);
  });

  it('1列完成で消える', () => {
    const { board, result } = playOne(
      rows({ 0: 'R.......', 1: 'B.......', 2: 'Y.......', 3: 'G.......', 4: 'P.......', 5: 'R.......', 6: 'B.......' }),
      'dot',
      'green',
      7,
      0,
    );
    expect(result.colsCleared).toBe(1);
    expect(result.rowsCleared).toBe(0);
    expect(board.countFilled()).toBe(0);
  });

  it('縦横同時完成を 1つの resolution event として扱う', () => {
    const { result } = playOne(
      rows({
        0: '.......Y', 1: '.......G', 2: '.......P', 3: '.......R',
        4: '.......B', 5: '.......Y', 6: '.......G', 7: 'RBYGPRB.',
      }),
      'dot',
      'purple',
      7,
      7,
    );
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events[0]!.lines.length).toBe(2);
    expect(result.rowsCleared).toBe(1);
    expect(result.colsCleared).toBe(1);
  });

  it('2ライン同時完成で Rocket が生成され、盤面に残る', () => {
    const { board, result } = playOne(
      rows({
        0: '.......Y', 1: '.......G', 2: '.......P', 3: '.......R',
        4: '.......B', 5: '.......Y', 6: '.......G', 7: 'RBYGPRB.',
      }),
      'dot',
      'purple',
      7,
      7,
    );
    expect(result.specialsCreated).toEqual(['rocket']);
    expect(board.get(7, 7).kind).toBe('rocket');
    // 生成された瞬間には起爆しない
    expect(result.specialsDetonated.length).toBe(0);
    expect(result.maxChain).toBe(1);
  });

  it('3ライン同時完成で Bomb が生成される', () => {
    const { board, result } = playOne(
      rows({
        0: '.......Y', 1: '.......G', 2: '.......P', 3: '.......R', 4: '.......B',
        5: '.......Y', 6: 'RBYGPRB.', 7: 'BYGPRBY.',
      }),
      'v2',
      'purple',
      6,
      7,
    );
    expect(result.events[0]!.lines.length).toBe(3);
    expect(result.specialsCreated).toEqual(['bomb']);
    expect(board.specialIndices().length).toBe(1);
  });

  it('4ライン同時完成で Rainbow が生成される', () => {
    const { board, result } = playOne(
      rows({
        0: '.......Y', 1: '.......G', 2: '.......P', 3: '.......R', 4: '.......B',
        5: 'RBYGPRB.', 6: 'BYGPRBY.', 7: 'YGPRBYG.',
      }),
      'v3',
      'purple',
      5,
      7,
    );
    expect(result.events[0]!.lines.length).toBe(4);
    expect(result.specialsCreated).toEqual(['rainbow']);
    expect(board.get(6, 7).kind === 'rainbow' || board.specialIndices().length === 1).toBe(true);
  });

  it('ラインが完成しなければ resolution は起きない', () => {
    const { result } = playOne(rows({ 7: 'RBYGPR..' }), 'dot', 'red', 7, 6);
    expect(result.events.length).toBe(0);
    expect(result.totalScore).toBe(0);
  });
});
