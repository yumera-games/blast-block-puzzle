import { describe, expect, it } from 'vitest';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('COLOR BLAST', () => {
  it('4セル以上でライン外の同色も消える', () => {
    const { board, result } = playOne(rows({ 6: '.R......', 7: '.RRBYGPR' }), 'dot', 'red', 7, 0);
    const blasts = result.events[0]!.blasts;
    expect(blasts.length).toBe(1);
    expect(blasts[0]!.size).toBe(4);
    expect(blasts[0]!.color).toBe('red');
    expect(blasts[0]!.band).toBe('small');
    // ライン外の (6,1) も消えている
    expect(board.get(6, 1).kind).toBe('empty');
    expect(board.countFilled()).toBe(0);
  });

  it('3セルでは発生せず、ライン外の同色は残る', () => {
    // (6,1)=R はライン上の R 2つと連結するが、成分は 3 セルなので閾値未満。
    const { board, result } = playOne(rows({ 6: '.R......', 7: '.RRBYGPY' }), 'dot', 'blue', 7, 0);
    expect(result.events[0]!.blasts.length).toBe(0);
    expect(board.get(6, 1).kind).toBe('normal');
    expect(board.countFilled()).toBe(1);
  });

  it('斜めの同色は接続扱いにならない', () => {
    // (6,1)=R は (7,0)=R の斜め。上下左右では繋がらないので成分サイズは 1。
    const { board, result } = playOne(rows({ 6: '.R......', 7: '.BYGPRBY' }), 'dot', 'red', 7, 0);
    expect(result.events[0]!.blasts.length).toBe(0);
    expect(board.get(6, 1).kind).toBe('normal'); // ライン外なので生き残る
  });

  it('COLOR BLAST は LINE CLEAR がなければ単独で発生しない', () => {
    // 大きな赤の塊があるが、ラインは完成していない。
    const { board, result } = playOne(
      rows({ 4: '.RRR....', 5: '.RRR....', 6: '.RRR....', 7: '.RR.....' }),
      'dot',
      'red',
      7,
      3,
    );
    expect(result.events.length).toBe(0);
    expect(board.countFilled()).toBe(12);
  });

  it('9セルで Bomb 条件を満たす', () => {
    const { board, result } = playOne(
      rows({ 4: '.RRR....', 5: '.RRR....', 6: '.RR.....', 7: '.RYBGPYB' }),
      'dot',
      'green',
      7,
      0,
    );
    const blast = result.events[0]!.blasts.find((b) => b.color === 'red');
    expect(blast?.size).toBe(9);
    expect(blast?.band).toBe('large');
    expect(result.specialsCreated).toEqual(['bomb']);
    expect(board.specialIndices().length).toBe(1);
  });

  it('13セルで Rainbow 条件を満たす', () => {
    const { result } = playOne(
      rows({ 3: '.RRR....', 4: '.RRR....', 5: '.RRR....', 6: '.RRR....', 7: '.RYBGPYB' }),
      'dot',
      'green',
      7,
      0,
    );
    const blast = result.events[0]!.blasts.find((b) => b.color === 'red');
    expect(blast?.size).toBe(13);
    expect(result.specialsCreated).toEqual(['rainbow']);
  });

  it('band 区分は 4-5=small / 6-8=medium / 9+=large', () => {
    const medium = playOne(rows({ 5: '.R......', 6: '.RR.....', 7: '.RRBYGPY' }), 'dot', 'red', 7, 0);
    const b = medium.result.events[0]!.blasts.find((x) => x.color === 'red');
    expect(b?.size).toBe(6);
    expect(b?.band).toBe('medium');
  });
});
