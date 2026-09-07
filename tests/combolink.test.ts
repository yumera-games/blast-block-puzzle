import { describe, expect, it } from 'vitest';
import { comboLinkOf } from '../src/data/resultText';
import { stageById } from '../src/data/stages';
import { StageState } from '../src/game/StageState';
import { Board } from '../src/game/Board';
import { shapeById } from '../src/data/pieces';
import { resolveBoard } from '../src/game/Resolver';
import type { Color, ResolutionEvent, SpecialInstance } from '../src/game/types';
import { computeLayout } from '../src/ui/layout';
import { arrowEndpoints, cellBounds, cellCenter } from '../src/ui/teachDraw';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

const rc = (s: SpecialInstance) => [Math.floor(s.index / 8), s.index % 8];

/** 盤面を組んで 1 手置き、combo が起きた wave の結び付きを返す。 */
function linkOf(lines: readonly string[], shape: string, color: Color, row: number, col: number) {
  const board = Board.fromStrings(lines);
  const placed = board.place(shapeById(shape).cells, row, col, color);
  const r = resolveBoard(board, { placedCells: placed, placedColor: color });
  for (const ev of r.events) {
    const link = comboLinkOf(ev);
    if (link) return { link, ev };
  }
  throw new Error('combo が起きていない');
}

describe('COMBO の因果の向き（group の配列順は使わない）', () => {
  it('group は index 昇順に並んでいるだけで、因果の向きではない', () => {
    const st = new StageState(stageById(10));
    st.place(0, 7, 2);
    const d = st.lastResult!.events[1]!.detonations[0]!;
    // 配列順は index 昇順。ここでは BOMB(3,3) が先、ROCKET(7,3) が後。
    expect(d.group.map((g) => g.kind)).toEqual(['bomb', 'rocket']);
    expect(d.group.map((g) => g.index)).toEqual([...d.group.map((g) => g.index)].sort((a, b) => a - b));
    // だが因果は ROCKET → BOMB。配列順をそのまま向きに使うと逆になる。
    const link = comboLinkOf(st.lastResult!.events[1]!)!;
    expect(link.from.map((g) => g.kind)).toEqual(['rocket']);
    expect(link.to.map((g) => g.kind)).toEqual(['bomb']);
  });

  it('Stage 10: 起点は ROCKET(7,3)、届いた先は BOMB(3,3)', () => {
    const st = new StageState(stageById(10));
    st.place(0, 7, 2);
    const link = comboLinkOf(st.lastResult!.events[1]!)!;
    expect(link.directed).toBe(true);
    expect(rc(link.from[0]!)).toEqual([7, 3]);
    expect(rc(link.to[0]!)).toEqual([3, 3]);
  });

  it('上下を反転しても、画面の上下ではなく因果に従う（ROCKET が上・BOMB が下）', () => {
    const { link } = linkOf(rows({ 0: 'RB.^YGPB', 4: '...*....' }), 'dot', 'green', 0, 2);
    expect(link.directed).toBe(true);
    expect(link.from.map((g) => g.kind)).toEqual(['rocket']);
    expect(rc(link.from[0]!)).toEqual([0, 3]); // 起点は上
    expect(rc(link.to[0]!)).toEqual([4, 3]);   // 先端は下
  });

  it('横方向でも因果に従う（よこ ROCKET → 同じ行の BOMB）', () => {
    const { link } = linkOf(
      rows({ 0: '..R.....', 1: '..B.....', 2: '..Y.....', 3: '..G.....', 4: '..P.....', 5: '..>...*.', 6: '..R.....' }),
      'dot', 'green', 7, 2,
    );
    expect(link.directed).toBe(true);
    expect(rc(link.from[0]!)).toEqual([5, 2]);
    expect(rc(link.to[0]!)).toEqual([5, 6]);
  });

  it('起爆待ちどうしは向きが決まらないので片方向の矢印を出さない', () => {
    const { link } = linkOf(rows({ 7: 'R^*YGPR.' }), 'dot', 'green', 7, 7);
    expect(link.all.length).toBe(2);
    expect(link.to.length).toBe(0); // 取り込まれた側が居ない
    expect(link.directed).toBe(false);
  });

  it('単独起爆では結び付きを作らない', () => {
    const st = new StageState(stageById(5));
    for (const [t, r, c] of [[0, 6, 7], [1, 6, 0], [2, 6, 4]] as const) st.place(t, r, c);
    for (const ev of st.lastResult!.events) expect(comboLinkOf(ev)).toBeNull();
  });

  it('combo 判定を作り直していない（effect が combo 名でなければ結ばない）', () => {
    const fake = {
      chainIndex: 2, lines: [], blasts: [], spawned: null, score: 0, chainMultiplier: 1,
      removed: [{ index: 27 }],
      detonations: [{
        effect: 'rocket',
        cells: [],
        group: [
          { uid: 1, kind: 'rocket', index: 59, color: null, dir: 'v' },
          { uid: 2, kind: 'bomb', index: 27, color: null, dir: null },
        ],
      }],
    } as unknown as ResolutionEvent;
    expect(comboLinkOf(fake)).toBeNull();
  });
});

describe('矢印の座標（始点は起点のセル内、先端は届いた先のセル内）', () => {
  const AVAIL = {
    '320x568': { w: 304, h: 400 },
    '375x667': { w: 359, h: 500 },
    '393x852': { w: 377, h: 680 },
    '430x932': { w: 414, h: 750 },
  } as const;

  const check = (
    label: string,
    fromRC: readonly [number, number],
    toRC: readonly [number, number],
  ) => {
    for (const key of Object.keys(AVAIL) as (keyof typeof AVAIL)[]) {
      const a = AVAIL[key];
      const l = computeLayout(a.w, a.h, 2);
      const ends = arrowEndpoints(cellCenter(l, ...fromRC), cellCenter(l, ...toRC), l.cell)!;
      expect(ends, `${label} ${key}`).not.toBeNull();
      const src = cellBounds(l, ...fromRC);
      const dst = cellBounds(l, ...toRC);
      const inside = (p: { x: number; y: number }, b: ReturnType<typeof cellBounds>) =>
        p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
      expect(inside(ends.tail, src), `${label} ${key} tail が起点セルの中`).toBe(true);
      expect(inside(ends.head, dst), `${label} ${key} head が届いた先のセルの中`).toBe(true);
      expect(inside(ends.head, src), `${label} ${key} head は起点セルの中ではない`).toBe(false);
      expect(inside(ends.tail, dst), `${label} ${key} tail は届いた先のセルの中ではない`).toBe(false);
      // 盤面の外へはみ出さない
      for (const p of [ends.tail, ends.head]) {
        expect(p.x, `${label} ${key}`).toBeGreaterThanOrEqual(l.boardX);
        expect(p.x, `${label} ${key}`).toBeLessThanOrEqual(l.boardX + l.boardW);
        expect(p.y, `${label} ${key}`).toBeGreaterThanOrEqual(l.boardY);
        expect(p.y, `${label} ${key}`).toBeLessThanOrEqual(l.boardY + l.boardH);
      }
    }
  };

  it('Stage 10 の実データ: tail は ROCKET(7,3) の中、head は BOMB(3,3) の中', () => {
    const st = new StageState(stageById(10));
    st.place(0, 7, 2);
    const link = comboLinkOf(st.lastResult!.events[1]!)!;
    const from = rc(link.from[0]!) as [number, number];
    const to = rc(link.to[0]!) as [number, number];
    expect(from).toEqual([7, 3]);
    expect(to).toEqual([3, 3]);
    check('Stage 10', from, to);
    // 先端は上（BOMB 側）を向く
    const l = computeLayout(377, 680, 2);
    const ends = arrowEndpoints(cellCenter(l, ...from), cellCenter(l, ...to), l.cell)!;
    expect(ends.head.y).toBeLessThan(ends.tail.y);
  });

  it('反転した盤面では先端が下（BOMB 側）を向く', () => {
    const { link } = linkOf(rows({ 0: 'RB.^YGPB', 4: '...*....' }), 'dot', 'green', 0, 2);
    const from = rc(link.from[0]!) as [number, number];
    const to = rc(link.to[0]!) as [number, number];
    check('反転', from, to);
    const l = computeLayout(377, 680, 2);
    const ends = arrowEndpoints(cellCenter(l, ...from), cellCenter(l, ...to), l.cell)!;
    expect(ends.head.y).toBeGreaterThan(ends.tail.y);
  });

  it('横方向では先端が右（BOMB 側）を向く', () => {
    const { link } = linkOf(
      rows({ 0: '..R.....', 1: '..B.....', 2: '..Y.....', 3: '..G.....', 4: '..P.....', 5: '..>...*.', 6: '..R.....' }),
      'dot', 'green', 7, 2,
    );
    const from = rc(link.from[0]!) as [number, number];
    const to = rc(link.to[0]!) as [number, number];
    check('横', from, to);
    const l = computeLayout(377, 680, 2);
    const ends = arrowEndpoints(cellCenter(l, ...from), cellCenter(l, ...to), l.cell)!;
    expect(ends.head.x).toBeGreaterThan(ends.tail.x);
    expect(Math.abs(ends.head.y - ends.tail.y)).toBeLessThan(1);
  });

  it('同じセルどうしなら描かない', () => {
    const l = computeLayout(377, 680, 2);
    expect(arrowEndpoints(cellCenter(l, 3, 3), cellCenter(l, 3, 3), l.cell)).toBeNull();
  });
});
