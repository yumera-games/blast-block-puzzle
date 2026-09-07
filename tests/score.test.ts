import { describe, expect, it } from 'vitest';
import { BALANCE, chainMultiplier } from '../src/data/balance';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('スコア', () => {
  it('通常 1 セル = 10 点、CHAIN 1 は倍率 1.0', () => {
    const { result } = playOne(rows({ 7: 'RBYGPRB.' }), 'dot', 'red', 7, 7);
    expect(result.totalScore).toBe(8 * BALANCE.score.perCell);
  });

  it('COLOR BLAST に含まれるセルは 1.25 倍', () => {
    // 8 セルのうち 4 セルが COLOR BLAST 成分（うち 1 セルはライン外）。
    const { result } = playOne(rows({ 6: '.R......', 7: '.RRBYGPR' }), 'dot', 'red', 7, 0);
    const removed = result.events[0]!.removed;
    const blastCells = removed.filter((r) => r.source === 'blast').length;
    const lineCells = removed.filter((r) => r.source === 'line').length;
    expect(blastCells).toBe(4);
    const expected = Math.round(
      (lineCells * BALANCE.score.perCell + blastCells * BALANCE.score.perCell * BALANCE.score.colorBlastMultiplier) * 1.0,
    );
    expect(result.events[0]!.score).toBe(expected);
  });

  it('特殊起爆で消えたセルは 1.5 倍、CHAIN 2 の倍率が乗る', () => {
    const { result } = playOne(
      rows({ 0: '..Y.....', 1: '..Y.....', 2: '..Y.....', 3: '..Y.....', 7: 'RB^YGPR.' }),
      'dot',
      'blue',
      7,
      7,
    );
    const wave2 = result.events[1]!;
    expect(wave2.chainIndex).toBe(2);
    expect(wave2.chainMultiplier).toBe(chainMultiplier(2));
    const cells = wave2.removed.length;
    expect(cells).toBe(4);
    expect(wave2.score).toBe(
      Math.round(cells * BALANCE.score.perCell * BALANCE.score.specialMultiplier * chainMultiplier(2)),
    );
  });

  it('CHAIN 倍率表', () => {
    expect(chainMultiplier(1)).toBe(1.0);
    expect(chainMultiplier(2)).toBe(1.2);
    expect(chainMultiplier(3)).toBe(1.5);
    expect(chainMultiplier(4)).toBe(2.0);
    expect(chainMultiplier(5)).toBe(3.0);
    expect(chainMultiplier(9)).toBe(3.0);
  });
});
