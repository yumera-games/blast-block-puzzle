import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

/**
 * (7,1) から積み上げる順序。1つ前に置いたセルと必ず上下左右で隣り合うので、
 * 先頭から n-1 個ぶん埋めれば「(7,1) を含むちょうど n セルの連結成分」になる。
 * 行 0〜1 と 列 4 以降は使わないので、赤を増やしても行・列は完成しない。
 */
const RED_ORDER: readonly (readonly [number, number])[] = [
  [6, 1], [5, 1], [4, 1], [3, 1], [2, 1],
  [6, 2], [5, 2], [4, 2], [3, 2], [2, 2],
  [6, 3], [5, 3], [4, 3], [3, 3], [2, 3],
];

/** 赤の連結成分がちょうど n セルの盤面。行 7 は (7,0) だけ空いている。 */
function redBlob(n: number): string[] {
  const grid = rows({ 7: '.RYBGPYB' }).map((line) => line.split(''));
  for (let i = 0; i < n - 1; i++) {
    const [r, c] = RED_ORDER[i]!;
    grid[r]![c] = 'R';
  }
  return grid.map((g) => g.join(''));
}

/** 行 7 を green の dot で閉じて resolution を回す。green は必ず孤立するので赤だけが成分になる。 */
const blastOf = (n: number) => playOne(redBlob(n), 'dot', 'green', 7, 0);

describe('COLOR BLAST', () => {
  it('閾値は 5（Phase 2A で 4 から引き上げた）', () => {
    expect(BALANCE.colorBlast.minSize).toBe(5);
  });

  it('4セルでは発生せず、ライン外の同色は残る', () => {
    const { board, result } = blastOf(4);
    expect(result.events[0]!.blasts.length).toBe(0);
    // ライン外の 3 セルはそのまま残る
    expect(board.get(6, 1).kind).toBe('normal');
    expect(board.get(5, 1).kind).toBe('normal');
    expect(board.get(4, 1).kind).toBe('normal');
    expect(board.countFilled()).toBe(3);
  });

  it('5セルで発生し、ライン外の同色まで消える', () => {
    const { board, result } = blastOf(5);
    const blasts = result.events[0]!.blasts;
    expect(blasts.length).toBe(1);
    expect(blasts[0]!.size).toBe(5);
    expect(blasts[0]!.color).toBe('red');
    // ライン外の 4 セルも消えて、盤面は空になる
    expect(board.get(6, 1).kind).toBe('empty');
    expect(board.get(3, 1).kind).toBe('empty');
    expect(board.countFilled()).toBe(0);
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

  it('band 区分は 5-7=small / 8-10=medium / 11+=large', () => {
    expect(blastOf(5).result.events[0]!.blasts[0]!.band).toBe('small');
    expect(blastOf(7).result.events[0]!.blasts[0]!.band).toBe('small');
    expect(blastOf(8).result.events[0]!.blasts[0]!.band).toBe('medium');
    expect(blastOf(10).result.events[0]!.blasts[0]!.band).toBe('medium');
    expect(blastOf(11).result.events[0]!.blasts[0]!.band).toBe('large');
  });
});

describe('COLOR BLAST のサイズによる特殊生成（Phase 2A）', () => {
  /** その盤面で生まれた特殊の種類（0 個なら null）。 */
  const created = (n: number) => blastOf(n).result.specialsCreated[0] ?? null;

  it('5〜7 は特殊を生まない（COLOR BLAST そのものが報酬）', () => {
    expect(created(5)).toBeNull();
    expect(created(6)).toBeNull();
    expect(created(7)).toBeNull();
  });

  it('8〜10 は ROCKET', () => {
    expect(created(8)).toBe('rocket');
    expect(created(9)).toBe('rocket');
    expect(created(10)).toBe('rocket');
  });

  it('11〜14 は BOMB', () => {
    expect(created(11)).toBe('bomb');
    expect(created(12)).toBe('bomb');
    expect(created(14)).toBe('bomb');
  });

  it('15以上は RAINBOW', () => {
    expect(created(15)).toBe('rainbow');
    expect(created(16)).toBe('rainbow');
  });

  it('閾値は balance.ts に集約されている', () => {
    expect(BALANCE.specials.rocket.blastSize).toBe(8);
    expect(BALANCE.specials.bomb.blastSize).toBe(11);
    expect(BALANCE.specials.rainbow.blastSize).toBe(15);
  });

  it('生成は 1 wave につき 1 個だけ', () => {
    expect(blastOf(15).result.specialsCreated.length).toBe(1);
  });
});
