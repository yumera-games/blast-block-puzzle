import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/Board';
import { resolveBoard } from '../src/game/Resolver';
import { shapeById } from '../src/data/pieces';
import type { Color, ResolutionResult } from '../src/game/types';
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
});

/* ==========================================================================
   Phase 2A: combo の条件は「盤面で隣接」から「効果が実際に届く」へ変わった。
   ========================================================================== */

describe('combo は効果の到達で決まる', () => {
  it('離れていても、ROCKET の射線が BOMB へ届けば combo になる', () => {
    // (7,1) の横 ROCKET は行 7 全体へ届く。(7,5) の BOMB は 4 マス離れているが射線上。
    const { result } = playOne(rows({ 7: 'R>YGB*R.' }), 'dot', 'blue', 7, 7);
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('rocket+bomb');
    expect(dets[0]!.group.map((s) => s.kind)).toEqual(['rocket', 'bomb']);
  });

  it('届かない特殊どうしは、同じ wave でも combo にならない', () => {
    // (7,1) は縦 ROCKET なので効果は列 1。(7,4) の BOMB の 3x3 は列 3〜5。
    // どちらも相手へ届かないので、同じ wave でも別々に起爆する。
    const { result } = playOne(rows({ 7: 'R^YG*BR.' }), 'dot', 'blue', 7, 7);
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(2);
    expect(dets.map((d) => d.effect)).toEqual(['rocket', 'bomb']);
  });

  it('同じ resolution に居るだけでは combo にならない（別 wave なら別扱い）', () => {
    // 行 7 で ROCKET(縦) が起爆 → その射線が列 2 の BOMB を巻きこむ → 次の wave で BOMB。
    const { result } = playOne(rows({ 3: '..*.....', 7: 'RB^YGPR.' }), 'dot', 'blue', 7, 7);
    expect(result.maxChain).toBe(3);
    expect(result.events[1]!.detonations[0]!.effect).toBe('rocket');
    expect(result.events[2]!.detonations[0]!.effect).toBe('bomb');
  });

  it('到達は片方向でも成立する（BOMB の範囲が ROCKET を含む）', () => {
    // (7,2) の BOMB の 3x3 は (7,3) を含む。(7,3) の縦 ROCKET は列 3 なので BOMB へは届かない。
    const { result } = playOne(rows({ 7: 'RB*^GPR.' }), 'dot', 'blue', 7, 7);
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('rocket+bomb');
  });

  it('同じ特殊は 1 回の resolution で二重起爆しない', () => {
    const { result } = playOne(rows({ 7: 'RB**GPR.' }), 'dot', 'blue', 7, 7);
    expect(result.specialsDetonated).toEqual(['bomb', 'bomb']);
    expect(result.events[1]!.detonations.length).toBe(1); // 互いに届くので 1 グループ
    expect(result.events[1]!.detonations[0]!.effect).toBe('bomb+bomb');
    expect(result.maxChain).toBe(2); // 起爆済みを巻きこみ直して 3 波目に入らない
    expect(result.aborted).toBe(false);
  });

  it('combo 処理は決定論的（同じ盤面なら毎回同じ結果）', () => {
    const run = () => playOne(rows({ 3: '..*.....', 7: 'R>Y*B*R.' }), 'dot', 'blue', 7, 7).result;
    const shape = (r: ResolutionResult) =>
      JSON.stringify(
        r.events.map((e) => e.detonations.map((d) => ({ effect: d.effect, cells: d.cells, group: d.group.map((s) => s.uid) }))),
      );
    expect(shape(run())).toBe(shape(run()));
    expect(shape(run())).toBe(shape(run()));
  });

  it('グループ内の特殊は index 昇順に並ぶ', () => {
    const { result } = playOne(rows({ 7: 'R>YGB*R.' }), 'dot', 'blue', 7, 7);
    const idx = result.events[1]!.detonations[0]!.group.map((s) => s.index);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe('特殊 x 特殊 の効果内容', () => {
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

  it('Rainbow + Rainbow は盤面全体（対象色を持つ特殊へ届いたとき）', () => {
    // Rainbow の効果は「対象色のセル」なので、対象色を持つ特殊へも届くものとして扱う。
    // fromStrings の '@' は色を持たないため、ここは色つきで直接置く。
    const board = Board.fromStrings(rows({ 0: 'RYG.....', 7: 'RB..GPR.' }));
    board.putSpecial(board.idx(7, 2), 'rainbow', 1, 'blue', null);
    board.putSpecial(board.idx(7, 3), 'rainbow', 2, 'blue', null);
    const placed = board.place(shapeById('dot').cells, 7, 7, 'blue' as Color);
    const result = resolveBoard(board, { placedCells: placed, placedColor: 'blue' });

    const d = result.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rainbow+rainbow');
    expect(d.cells.length).toBe(64);
    expect(board.countFilled()).toBe(0);
    expect(result.aborted).toBe(false);
  });

  it('対象色が違う Rainbow どうしは combo にならない', () => {
    const board = Board.fromStrings(rows({ 0: 'RYG.....', 7: 'RB..GPR.' }));
    board.putSpecial(board.idx(7, 2), 'rainbow', 1, 'red', null);
    board.putSpecial(board.idx(7, 3), 'rainbow', 2, 'yellow', null);
    const placed = board.place(shapeById('dot').cells, 7, 7, 'blue' as Color);
    const result = resolveBoard(board, { placedCells: placed, placedColor: 'blue' });

    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(2);
    expect(dets.map((d) => d.effect)).toEqual(['rainbow', 'rainbow']);
  });
});
