import { describe, expect, it } from 'vitest';
import { STAGES, stageById } from '../src/data/stages';
import { hasShape } from '../src/data/pieces';
import { StageState } from '../src/game/StageState';

interface Move {
  /** そのときのトレイ内の位置（0-2）。 */
  readonly t: number;
  readonly r: number;
  readonly c: number;
}

/** ステージを台本どおりに最後まで解く。 */
function play(stageId: number, script: readonly Move[]): StageState {
  const st = new StageState(stageById(stageId));
  script.forEach((m, i) => {
    const out = st.place(m.t, m.r, m.c);
    if (!out.ok) throw new Error(`stage ${stageId} move ${i} (t=${m.t} r=${m.r} c=${m.c}) failed: ${out.reason}`);
  });
  return st;
}

/**
 * Stage 1〜10 の想定解。
 * **ここが通らなくなったら、ステージデータかコアルールが壊れている。**
 */
const SOLUTIONS: Record<number, Move[]> = {
  1: [{ t: 0, r: 7, c: 7 }],
  2: [
    { t: 0, r: 7, c: 7 },
    { t: 1, r: 6, c: 0 },
  ],
  3: [
    { t: 0, r: 7, c: 0 },
    { t: 1, r: 7, c: 7 },
  ],
  4: [
    { t: 0, r: 7, c: 0 }, // dot   → 行 7
    { t: 1, r: 5, c: 3 }, // h2    → 行 5
    { t: 2, r: 3, c: 5 }, // h3    → 行 3
  ],
  5: [
    { t: 0, r: 6, c: 7 }, // v2 → 行 6 と 行 7 が同時完成 → たて向き Rocket
    { t: 1, r: 6, c: 0 }, // h4 → 行 6 を埋めはじめる
    { t: 2, r: 6, c: 4 }, // h3 → 行 6 完成、Rocket を巻きこんで列 7 を消す
  ],
  6: [{ t: 0, r: 7, c: 0 }], // 赤 7 連結 → COLOR BLAST（ライン外 4 マス）
  7: [
    { t: 0, r: 7, c: 0 }, // 赤 5 連結
    { t: 1, r: 5, c: 0 }, // 緑 6 連結
  ],
  8: [
    { t: 0, r: 7, c: 0 }, // 行 7 と 列 0 が同時完成 → よこ向き Rocket
    { t: 1, r: 7, c: 4 }, // h3 → Rocket の射線上に的を置く
    { t: 2, r: 0, c: 0 }, // v4 → 列 0 を埋めはじめる
    { t: 0, r: 4, c: 0 }, // v3（2セット目）→ 列 0 完成、Rocket を巻きこむ
  ],
  9: [
    { t: 0, r: 7, c: 4 }, // 赤 12 連結 → Bomb 生成
    { t: 1, r: 7, c: 0 }, // h4
    { t: 2, r: 7, c: 5 }, // h3 → 行 7 完成、Bomb を巻きこむ
  ],
  10: [{ t: 0, r: 7, c: 3 }], // 行 7 → rocket+bomb combo → 上の Rocket へ届いて CHAIN 3
};

describe('ステージデータの健全性', () => {
  it('Stage 1〜10 が定義されている', () => {
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('seed は全ステージで固定されている', () => {
    for (const s of STAGES) expect(Number.isInteger(s.seed)).toBe(true);
  });

  it('固定 piece 列の shape id はすべて実在する', () => {
    for (const s of STAGES)
      for (const set of s.fixedSets ?? [])
        for (const spec of set) expect(hasShape(spec.shape), `${s.id}: ${spec.shape}`).toBe(true);
  });

  it('初期盤面は 8 行以内で、行の長さが 8 を超えない', () => {
    for (const s of STAGES) {
      if (!s.initialBoard) continue;
      expect(s.initialBoard.length).toBeLessThanOrEqual(8);
      for (const line of s.initialBoard) expect(line.length).toBeLessThanOrEqual(8);
    }
  });

  it('ガイドを常時表示するのは基本操作の Stage 1〜3 と、手順が 3 手ある Stage 5 だけ', () => {
    const withGuide = new Set([1, 2, 3, 5]);
    for (const s of STAGES) expect(s.tutorial.showGuide, `stage ${s.id}`).toBe(withGuide.has(s.id));
  });

  it('新システム登場ステージには intro がある', () => {
    for (const id of [5, 6, 8, 9, 10]) expect(stageById(id).tutorial.intro, `stage ${id}`).toBeTruthy();
  });

  it('同じ seed から同じ初期トレイが再現される', () => {
    for (const s of STAGES) {
      const a = new StageState(s).tray.map((p) => p && `${p.shape.id}:${p.color}`);
      const b = new StageState(s).tray.map((p) => p && `${p.shape.id}:${p.color}`);
      expect(a).toEqual(b);
    }
  });
});

describe('Stage 1〜10 を想定解で通しプレイする', () => {
  for (const stage of STAGES) {
    it(`Stage ${stage.id}: ${stage.name} をクリアできる`, () => {
      const st = play(stage.id, SOLUTIONS[stage.id]!);
      expect(st.status, `objectives: ${JSON.stringify(st.objectiveProgress())}`).toBe('cleared');
      expect(st.objectiveProgress().every((p) => p.done)).toBe(true);
      expect(st.moves).toBeGreaterThanOrEqual(0);
      expect(st.score).toBeGreaterThan(0);
    });
  }
});

describe('意図したルールが実際に発生する', () => {
  it('Stage 5: 2 ライン同時完成で Rocket が生まれ、同じステージ内で起爆まで見せる', () => {
    const st = new StageState(stageById(5));

    // 1 手目：2 ライン同時 → Rocket が生まれ、盤面に残る（まだ起爆しない）
    st.place(0, 6, 7);
    expect(st.lastResult!.events[0]!.lines.length).toBe(2);
    expect(st.lastResult!.specialsCreated).toEqual(['rocket']);
    expect(st.lastResult!.specialsDetonated.length).toBe(0);
    expect(st.board.specialIndices().length).toBe(1);
    expect(st.status).toBe('playing'); // 生成だけではクリアにしない

    // 2〜3 手目：Rocket と同じ行をそろえて巻きこむ
    st.place(1, 6, 0);
    st.place(2, 6, 4);
    expect(st.lastResult!.specialsDetonated).toEqual(['rocket']);
    expect(st.lastResult!.events[1]!.detonations[0]!.effect).toBe('rocket');
    // たて向きなので列 7 に残っていた 4 セルが消える
    expect(st.lastResult!.events[1]!.removed.length).toBe(4);
    expect(st.status).toBe('cleared');
  });

  it('Stage 6: 5 マス以上の COLOR BLAST が起き、ライン外が 4 マス消える', () => {
    const st = play(6, SOLUTIONS[6]!);
    const ev = st.lastResult!.events[0]!;
    expect(ev.blasts.length).toBe(1);
    expect(ev.blasts[0]!.size).toBeGreaterThanOrEqual(5);
    expect(ev.blasts[0]!.color).toBe('red');
    // ライン(行 7)の外で消えたセル数＝教材としての「見た目の差」
    const offLine = ev.removed.filter((r) => Math.floor(r.index / 8) !== 7).length;
    expect(offLine).toBe(4);
    // 5〜7 マスなので特殊は生まれない（COLOR BLAST だけを教える）
    expect(st.lastResult!.specialsCreated.length).toBe(0);
  });

  it('Stage 7: 5 マス以上の COLOR BLAST が 2 回起きる', () => {
    const st = new StageState(stageById(7));
    let count = 0;
    for (const m of SOLUTIONS[7]!) {
      st.place(m.t, m.r, m.c);
      count += st.lastResult!.events.reduce((a, e) => a + e.blasts.filter((b) => b.size >= 5).length, 0);
    }
    expect(count).toBe(2);
    expect(st.status).toBe('cleared');
  });

  it('Stage 8: 行と列の同時完成で よこ向き Rocket が生まれ、列で巻きこんで起爆する', () => {
    const st = new StageState(stageById(8));
    const created: string[] = [];
    const detonated: string[] = [];
    for (const m of SOLUTIONS[8]!) {
      st.place(m.t, m.r, m.c);
      created.push(...st.lastResult!.specialsCreated);
      detonated.push(...st.lastResult!.specialsDetonated);
    }
    expect(created).toEqual(['rocket']);
    expect(detonated).toEqual(['rocket']);
    expect(st.maxChain).toBeGreaterThanOrEqual(2);
    expect(st.status).toBe('cleared');
  });

  it('Stage 9: 11 マス以上の COLOR BLAST で Bomb が生まれ、同じステージ内で起爆する', () => {
    const st = new StageState(stageById(9));
    let blastSize = 0;
    const detonated: string[] = [];
    for (const m of SOLUTIONS[9]!) {
      st.place(m.t, m.r, m.c);
      for (const e of st.lastResult!.events)
        for (const b of e.blasts) blastSize = Math.max(blastSize, b.size);
      detonated.push(...st.lastResult!.specialsDetonated);
    }
    expect(blastSize).toBeGreaterThanOrEqual(11);
    expect(detonated).toEqual(['bomb']);
    expect(st.lastResult!.events[1]!.detonations[0]!.effect).toBe('bomb');
    expect(st.status).toBe('cleared');
  });

  it('Stage 10: 1 手で combo と連続起爆が起き、CHAIN 3 に届く', () => {
    const st = play(10, SOLUTIONS[10]!);
    const r = st.lastResult!;
    expect(r.maxChain).toBe(3);
    // wave2 は「射線が BOMB へ届いた」combo、wave3 はその効果が届いた先の Rocket
    expect(r.events[1]!.detonations[0]!.effect).toBe('rocket+bomb');
    expect(r.events[2]!.detonations[0]!.effect).toBe('rocket');
    expect(r.specialsDetonated).toEqual(['rocket', 'bomb', 'rocket']);
    expect(r.aborted).toBe(false);
    // スコアは wave ごとに積み上がる（どの wave も 0 点で終わらない）
    for (const e of r.events) expect(e.score).toBeGreaterThan(0);
  });
});

describe('ステージ失敗とリトライ', () => {
  it('moves が 0 になり目的未達なら FAILED', () => {
    const st = new StageState({
      ...stageById(1),
      id: 900,
      moves: 1,
      objectives: [{ kind: 'linesTotal', target: 5, label: 'test' }],
    });
    st.place(1, 0, 0); // ラインは完成しない置き方
    expect(st.moves).toBe(0);
    expect(st.status).toBe('failed');
  });

  it('残った候補がどれも置けなければ FAILED', () => {
    const st = new StageState({
      ...stageById(1),
      id: 901,
      moves: 9,
      initialBoard: [
        'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR',
        'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRR..',
      ],
      fixedSets: [[{ shape: 'h3', color: 'red' }, { shape: 'v2', color: 'blue' }, { shape: 'o4', color: 'green' }]],
      objectives: [{ kind: 'linesTotal', target: 5, label: 'test' }],
    });
    expect(st.isStuck()).toBe(true);
    expect(st.status).toBe('failed');
  });

  it('reset で初期状態へ戻る', () => {
    const st = play(1, SOLUTIONS[1]!);
    expect(st.status).toBe('cleared');
    st.reset();
    expect(st.status).toBe('playing');
    expect(st.score).toBe(0);
    expect(st.moves).toBe(stageById(1).moves);
    expect(st.board.toStrings()).toEqual(stageById(1).initialBoard);
  });
});
