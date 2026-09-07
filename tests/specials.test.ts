import { describe, expect, it } from 'vitest';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('特殊ピースの起爆', () => {
  it('巻きこまれなければ起爆しない（タップでは起動しない）', () => {
    const { board, result } = playOne(rows({ 7: 'RB^YGP..' }), 'dot', 'blue', 0, 0);
    expect(result.events.length).toBe(0);
    expect(board.get(7, 2).kind).toBe('rocket');
  });

  it('Rocket: LINE CLEAR に巻きこまれて 1列を消す', () => {
    const { board, result } = playOne(
      rows({ 0: '..Y.....', 1: '..Y.....', 2: '..Y.....', 3: '..Y.....', 7: 'RB^YGPR.' }),
      'dot',
      'blue',
      7,
      7,
    );
    expect(result.maxChain).toBe(2);
    expect(result.specialsDetonated).toEqual(['rocket']);
    expect(result.events[1]!.detonations[0]!.effect).toBe('rocket');
    expect(board.countFilled()).toBe(0); // 列 2 の Y も消えた
  });

  it('Bomb: 中心を含む 3x3 を消す', () => {
    const { board, result } = playOne(rows({ 6: '.GPG....', 7: 'RB*YGPR.' }), 'dot', 'blue', 7, 7);
    expect(result.maxChain).toBe(2);
    expect(result.specialsDetonated).toEqual(['bomb']);
    expect(result.events[1]!.detonations[0]!.effect).toBe('bomb');
    expect(board.get(6, 1).kind).toBe('empty');
    expect(board.get(6, 3).kind).toBe('empty');
    expect(board.countFilled()).toBe(0);
  });

  it('Rainbow: 対象色を盤面から消す（対象色は resolution から決まる）', () => {
    const { board, result } = playOne(
      rows({ 0: 'BB......', 3: '.....B..', 7: 'RB@YGPR.' }),
      'dot',
      'blue',
      7,
      7,
    );
    expect(result.specialsDetonated).toEqual(['rainbow']);
    expect(result.events[1]!.detonations[0]!.effect).toBe('rainbow');
    expect(board.get(0, 0).kind).toBe('empty');
    expect(board.get(0, 1).kind).toBe('empty');
    expect(board.get(3, 5).kind).toBe('empty');
  });

  it('特殊から特殊への連鎖（CHAIN 3 以上）', () => {
    const { result } = playOne(
      rows({ 2: '..YYY...', 3: '..Y*Y...', 4: '..YYY...', 7: 'RB.^YGPB' }),
      'dot',
      'green',
      7,
      2,
    );
    expect(result.maxChain).toBeGreaterThanOrEqual(3);
    expect(result.specialsDetonated).toEqual(['rocket', 'bomb']);
    expect(result.events[1]!.detonations[0]!.effect).toBe('rocket');
    expect(result.events[2]!.detonations[0]!.effect).toBe('bomb');
    expect(result.aborted).toBe(false);
  });

  it('同じ特殊が同一 resolution 内で二重起爆しない（隣接 Bomb）', () => {
    const { result } = playOne(rows({ 7: 'RB**GPR.' }), 'dot', 'blue', 7, 7);
    expect(result.specialsDetonated).toEqual(['bomb', 'bomb']);
    expect(result.events[1]!.detonations.length).toBe(1); // 隣接なので 1 グループ
    expect(result.events[1]!.detonations[0]!.effect).toBe('bomb+bomb');
    expect(result.maxChain).toBe(2); // 相手を巻きこんで 3 波目に入らない
    expect(result.aborted).toBe(false);
  });

  it('離れた Bomb は別グループとして同じ波で起爆する', () => {
    const { result } = playOne(rows({ 7: 'RB*YG*R.' }), 'dot', 'blue', 7, 7);
    expect(result.events[1]!.detonations.length).toBe(2);
    expect(result.specialsDetonated.length).toBe(2);
    expect(result.maxChain).toBe(2);
  });
});

describe('特殊 x 特殊 の組み合わせ', () => {
  const combo = (line: string) => playOne(rows({ 7: line }), 'dot', 'blue', 7, 7).result;

  it('Rocket + Rocket は縦横クロス相当', () => {
    const r = combo('RB>^GPR.');
    expect(r.events[1]!.detonations[0]!.effect).toBe('rocket+rocket');
  });

  it('Rocket + Bomb は太い十字', () => {
    const r = combo('RB>*GPR.');
    const d = r.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rocket+bomb');
    // Bomb は (7,3)。盤面の下端なので帯は行 6-7 の 2 行ぶんだけになる。
    // 2 行(16) + 3 列(24) - 重なり(6) = 34
    expect(d.cells.length).toBe(34);
  });

  it('Bomb + Bomb は単体より大きい範囲', () => {
    const single = combo('RB*YGPR.');
    const pair = combo('RB**GPR.');
    const a = single.events[1]!.detonations[0]!.cells.length;
    const b = pair.events[1]!.detonations[0]!.cells.length;
    expect(b).toBeGreaterThan(a);
  });

  it('Rainbow + Rocket は対象色セルを Rocket 相当にする', () => {
    const { result } = playOne(rows({ 0: 'B.......', 7: 'RB@>GPR.' }), 'dot', 'blue', 7, 7);
    const d = result.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rainbow+rocket');
    // (0,0) が青なので、その行がまるごと対象に入る
    expect(d.cells).toContain(7); // (0,7)
  });

  it('Rainbow + Bomb は対象色セルを Bomb 相当にする', () => {
    const { result } = playOne(rows({ 3: '...B....', 7: 'RB@*GPR.' }), 'dot', 'blue', 7, 7);
    const d = result.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rainbow+bomb');
    expect(d.cells).toContain(2 * 8 + 3); // (2,3) は (3,3) の 3x3 に入る
  });

  it('Rainbow + Rainbow は盤面全体', () => {
    const { result, board } = playOne(rows({ 0: 'RYG.....', 7: 'RB@@GPR.' }), 'dot', 'blue', 7, 7);
    const d = result.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rainbow+rainbow');
    expect(d.cells.length).toBe(64);
    expect(board.countFilled()).toBe(0);
    expect(result.aborted).toBe(false);
  });
});
