import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/Board';
import { resolveBoard } from '../src/game/Resolver';
import { shapeById } from '../src/data/pieces';
import type { Color, ResolutionResult } from '../src/game/types';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('ROCKET の 向き決定ルール（pickRocketDirection 1 か所に閉じる）', () => {
  /** 2 ライン同時完成で生まれた Rocket の向きを読む。 */
  const spawnDir = (lines: readonly string[], shape: string, color: Color, row: number, col: number) => {
    const { result } = playOne(lines, shape, color, row, col);
    const sp = result.events[0]!.spawned!;
    expect(sp.kind).toBe('rocket');
    return { dir: sp.dir, lines: result.events[0]!.lines };
  };

  it('行だけを 2 本 同時に消すと たて向き（v）', () => {
    const r = spawnDir(rows({ 6: 'RBYGPRB.', 7: 'BYGPRBY.' }), 'v2', 'blue', 6, 7);
    expect(r.lines.every((l) => l.kind === 'row')).toBe(true);
    expect(r.dir).toBe('v');
  });

  it('列だけを 2 本 同時に消すと よこ向き（h）', () => {
    const r = spawnDir(
      rows({ 0: 'RB......', 1: 'BY......', 2: 'YG......', 3: 'GP......',
             4: 'PR......', 5: 'RB......', 6: 'BY......' }),
      'h2', 'green', 7, 0,
    );
    expect(r.lines.every((l) => l.kind === 'col')).toBe(true);
    expect(r.dir).toBe('h');
  });

  it('行と列を 1 本ずつ 同時に消すと よこ向き（h）— 8x8 では行も列も 8 マスで同数のため', () => {
    const r = spawnDir(
      rows({ 0: 'Y.......', 1: 'G.......', 2: 'P.......', 3: 'R.......',
             4: 'B.......', 5: 'Y.......', 6: 'G.......', 7: '.RBYGPRB' }),
      'dot', 'purple', 7, 0,
    );
    expect(r.lines.filter((l) => l.kind === 'row').length).toBe(1);
    expect(r.lines.filter((l) => l.kind === 'col').length).toBe(1);
    expect(r.dir).toBe('h');
  });

  it('向きは効果範囲に直結する（v は列、h は行を消す）', () => {
    const v = playOne(rows({ 0: '..Y.....', 7: 'RB^YGPR.' }), 'dot', 'blue', 7, 7).result;
    const h = playOne(rows({ 7: 'RB>YGPR.', 0: '..Y.....' }), 'dot', 'blue', 7, 7).result;
    const cells = (r: typeof v) => r.events[1]!.detonations[0]!.cells;
    expect(new Set(cells(v).map((i) => i % 8)).size).toBe(1);          // 列 2 に閉じる
    expect(new Set(cells(h).map((i) => Math.floor(i / 8))).size).toBe(1); // 行 7 に閉じる
  });
});

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

  it('射線が届いた BOMB は、次の wave ではなくその場で combo になる', () => {
    const { result } = playOne(
      rows({ 2: '..YYY...', 3: '..Y*Y...', 4: '..YYY...', 7: 'RB.^YGPB' }),
      'dot',
      'green',
      7,
      2,
    );
    expect(result.maxChain).toBe(2);
    expect(result.specialsDetonated).toEqual(['bomb', 'rocket']);
    expect(result.events[1]!.detonations[0]!.effect).toBe('rocket+bomb');
    expect(result.aborted).toBe(false);
  });

  it('combo の合成効果が別の特殊へ届けば CHAIN が伸びる', () => {
    // wave2 で rocket+bomb の combo。その十字が (4,5) の ROCKET を巻きこみ wave3 へ。
    // (4,5) は ROCKET の射線(列2)にも BOMB の 3x3 にも入らないので、取り込みではなく連鎖になる。
    const { result } = playOne(
      rows({ 0: '.....Y..', 1: '.....Y..', 3: '..*.....', 4: '.....^..', 7: 'RB^YGPR.' }),
      'dot',
      'blue',
      7,
      7,
    );
    expect(result.maxChain).toBe(3);
    expect(result.events[1]!.detonations[0]!.effect).toBe('rocket+bomb');
    expect(result.events[2]!.detonations[0]!.effect).toBe('rocket');
    expect(result.events[2]!.removed.length).toBe(2); // 列 5 に残っていた 2 セル
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

  it('起爆待ちが ROCKET だけでも、射線上の BOMB を取り込んで combo になる', () => {
    // 行 7 の ROCKET(縦) だけが起爆待ち。列 2 の BOMB は盤面に残っているだけだが、
    // 射線が直接届くので、次の wave へ送らずその場で combo にする。
    const { result } = playOne(rows({ 3: '..*.....', 7: 'RB^YGPR.' }), 'dot', 'blue', 7, 7);
    expect(result.maxChain).toBe(2); // 通常 CHAIN ではなく 1 回の combo
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('rocket+bomb');
    expect(dets[0]!.group.map((g) => g.kind)).toEqual(['bomb', 'rocket']); // index 昇順
  });

  it('起爆待ちが BOMB だけでも、範囲内の ROCKET を取り込んで combo になる', () => {
    // (7,2) の BOMB だけが起爆待ち。その 3x3 が (6,2) の ROCKET へ届く。
    const { result } = playOne(rows({ 6: '..^.....', 7: 'RB*YGPR.' }), 'dot', 'blue', 7, 7);
    expect(result.maxChain).toBe(2);
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('rocket+bomb');
    expect(dets[0]!.group.map((g) => g.kind)).toEqual(['rocket', 'bomb']);
  });

  it('A が B へ、B が C へ届くなら 3 個が同じ combo グループになる', () => {
    // (7,2) 縦 ROCKET → 列 2 の BOMB(3,2) → その 3x3 内の ROCKET(4,3)
    const { result } = playOne(rows({ 3: '..*.....', 4: '...^....', 7: 'RB^YGPR.' }), 'dot', 'blue', 7, 7);
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.group.length).toBe(3);
    expect(dets[0]!.group.map((g) => g.index)).toEqual([26, 35, 58]); // index 昇順
    expect(result.maxChain).toBe(2); // 3 個まとめて 1 回で起爆する
  });

  it('効果が届かない特殊は、同じ resolution 内でも取り込まれない', () => {
    // (7,2) の BOMB の 3x3 は行 6-7。(0,2) の BOMB へは届かないので盤面に残る。
    const { board, result } = playOne(rows({ 0: '..*.....', 7: 'RB*YGPR.' }), 'dot', 'blue', 7, 7);
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('bomb');
    expect(dets[0]!.group.length).toBe(1);
    expect(result.specialsDetonated).toEqual(['bomb']);
    expect(board.get(0, 2).kind).toBe('bomb'); // 巻きこまれず残っている
  });

  it('取り込まれた特殊は次の wave で二重起爆しない', () => {
    const { result } = playOne(rows({ 3: '..*.....', 4: '...^....', 7: 'RB^YGPR.' }), 'dot', 'blue', 7, 7);
    const uids = result.events.flatMap((e) => e.detonations.flatMap((d) => d.group.map((g) => g.uid)));
    expect(uids.length).toBe(3);
    expect(new Set(uids).size).toBe(uids.length); // 同じ uid は 1 回だけ
    expect(result.aborted).toBe(false);
  });

  /** 色つきの特殊を置いた盤面で、(7,7) へ dot を落として行 7 を完成させる。 */
  function withColoredSpecials(
    place: (b: Board) => void,
    map: Record<number, string> = { 7: 'RB.YGPR.' },
  ): ResolutionResult {
    const board = Board.fromStrings(rows(map));
    place(board);
    const placed = board.place(shapeById('dot').cells, 7, 7, 'blue' as Color);
    return resolveBoard(board, { placedCells: placed, placedColor: 'blue' });
  }

  it('RAINBOW は、対象色を持つ盤面の特殊を取り込む', () => {
    // RAINBOW(青) が起爆待ち。(3,3) の BOMB は青なので、対象色として届く扱いにする。
    const result = withColoredSpecials((b) => {
      b.putSpecial(b.idx(7, 2), 'rainbow', 1, 'blue', null);
      b.putSpecial(b.idx(3, 3), 'bomb', 2, 'blue', null);
    });
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('rainbow+bomb');
    expect(dets[0]!.group.map((g) => g.kind)).toEqual(['bomb', 'rainbow']); // index 昇順
  });

  it('RAINBOW の対象色と違う特殊は取り込まない', () => {
    // 同じ配置でも BOMB が赤なら、対象色（青）ではないので届かない。
    const result = withColoredSpecials((b) => {
      b.putSpecial(b.idx(7, 2), 'rainbow', 1, 'blue', null);
      b.putSpecial(b.idx(3, 3), 'bomb', 2, 'red', null);
    });
    const dets = result.events[1]!.detonations;
    expect(dets.length).toBe(1);
    expect(dets[0]!.effect).toBe('rainbow');
    expect(dets[0]!.group.length).toBe(1);
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
    // 盤面に残っている BOMB を取り込むケースを含めて、毎回同じ結果になることを見る。
    const run = () => playOne(rows({ 3: '..*.....', 4: '...^....', 7: 'R>Y*B*R.' }), 'dot', 'blue', 7, 7).result;
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
