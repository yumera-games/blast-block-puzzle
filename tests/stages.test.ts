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
  10: [{ t: 0, r: 7, c: 2 }], // 行 7 → ROCKET が巻きこまれ、射線が BOMB へ届いて COMBO（CHAIN 2）
  11: [
    { t: 0, r: 6, c: 3 }, // v2 → 行 6・7 同時完成 → たて ROCKET（列 3 に向く）
    { t: 1, r: 6, c: 0 }, // h3 → 行 6 を埋める
    { t: 2, r: 6, c: 4 }, // h4 → 行 6 完成 → ROCKET の射線が BOMB(3,3) へ届いて COMBO
  ],
  12: [
    { t: 0, r: 0, c: 3 }, // v2 → 行 0・1 同時完成 → たて ROCKET（列 3 に向く）
    { t: 1, r: 0, c: 0 }, // h3 → 行 0 を埋める
    { t: 2, r: 0, c: 4 }, // h4 → 行 0 完成 → ROCKET の射線が BOMB(5,3) へ届いて COMBO
  ],
};

describe('ステージデータの健全性', () => {
  it('Stage 1〜12 が定義されている', () => {
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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

  it('ガイドを常時表示するのは基本操作 (1〜3) と教材ステージ (5・8・9・10・11) だけ', () => {
    // Stage 12 は転移確認なのでガイドを出さない。
    const withGuide = new Set([1, 2, 3, 5, 8, 9, 10, 11]);
    for (const s of STAGES) expect(s.tutorial.showGuide, `stage ${s.id}`).toBe(withGuide.has(s.id));
  });

  it('Stage 9 のヒントは着地点を光らせず、文だけ出す', () => {
    const t = stageById(9).tutorial;
    expect(t.showGuide).toBe(true);
    expect(t.hints?.length).toBe(3);
    for (const h of t.hints ?? []) {
      expect(h.showCell, `move ${h.move}`).toBe(false);
      expect(h.text, `move ${h.move}`).toBeTruthy();
    }
    // 教材ステージのヒントは既定どおり着地点を光らせる（Stage 9 だけが例外）
    for (const id of [1, 5, 8, 10, 11])
      for (const h of stageById(id).tutorial.hints ?? [])
        expect(h.showCell, `stage ${id} move ${h.move}`).not.toBe(false);
  });

  it('Stage 9 をガイド付きにしても、盤面・fixedSets・moves・想定解・スコアは変わらない', () => {
    const def = stageById(9);
    expect(def.moves).toBe(8);
    expect(def.initialBoard).toEqual([
      '........', '........', '........', '.RRR....',
      '.RRR....', '.RRR....', '.RRBBB..', 'YRYB.GPB',
    ]);
    expect(def.fixedSets?.length).toBe(1);
    expect(def.fixedSets?.[0]?.map((x) => `${x.shape}:${x.color}`)).toEqual([
      'dot:yellow', 'h4:purple', 'h3:green',
    ]);
    const st = play(9, SOLUTIONS[9]!);
    expect(st.status).toBe('cleared');
    expect(st.score).toBe(344);
    expect(st.movesUsed).toBe(3);
  });

  it('新システム登場ステージには intro がある', () => {
    for (const id of [5, 6, 8, 9, 10, 11]) expect(stageById(id).tutorial.intro, `stage ${id}`).toBeTruthy();
  });

  it('教材ステージには「何が起きたか」を答え合わせする outro がある', () => {
    for (const id of [5, 8, 9, 10, 11]) expect(stageById(id).tutorial.outro, `stage ${id}`).toBeTruthy();
    // 転移確認ステージは答えを一切出さない
    expect(stageById(12).tutorial.outro).toBeUndefined();
  });

  it('同じ seed から同じ初期トレイが再現される', () => {
    for (const s of STAGES) {
      const a = new StageState(s).tray.map((p) => p && `${p.shape.id}:${p.color}`);
      const b = new StageState(s).tray.map((p) => p && `${p.shape.id}:${p.color}`);
      expect(a).toEqual(b);
    }
  });
});

describe('Stage 1〜12 を想定解で通しプレイする', () => {
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

  it('Stage 10: COMBO だけを教える。CHAIN は 2 で止まり、CHAIN objective も無い', () => {
    const st = play(10, SOLUTIONS[10]!);
    const r = st.lastResult!;

    // CHAIN と COMBO を切り分けるため、3 個目の ROCKET を外して wave を 2 で終わらせた。
    expect(r.maxChain).toBe(2);
    expect(r.events.length).toBe(2);

    // wave1: ライン消去だけ。巻きこまれる特殊は ROCKET 1 個で、まだ起爆はしない。
    expect(r.events[0]!.detonations.length).toBe(0);

    // wave2: その ROCKET が起爆待ちになり、射線上の BOMB を取り込んで combo になる。
    const w2 = r.events[1]!.detonations;
    expect(w2.length).toBe(1);
    expect(w2[0]!.effect).toBe('rocket+bomb');
    expect(w2[0]!.group.map((g) => g.kind)).toEqual(['bomb', 'rocket']);

    // 二重起爆していない（2 個の特殊がそれぞれ 1 回だけ）
    const uids = r.events.flatMap((e) => e.detonations.flatMap((d) => d.group.map((g) => g.uid)));
    expect(uids.length).toBe(2);
    expect(new Set(uids).size).toBe(2);
    expect(r.aborted).toBe(false);

    // スコアは wave ごとに積み上がる（どの wave も 0 点で終わらない）
    for (const e of r.events) expect(e.score).toBeGreaterThan(0);

    // 目的は COMBO だけ。CHAIN objective は置かない（同時達成すると区別を学べない）。
    expect(st.def.objectives.map((o) => o.kind)).toEqual(['combo']);
    expect(st.def.objectives.some((o) => o.kind === 'chain')).toBe(false);
    expect(st.def.objectives[0]!.effect).toBe('rocket+bomb');
    expect(st.objectiveProgress().every((o) => o.done)).toBe(true);
  });

  it('Stage 5 と Stage 10 は同じ CHAIN 2 でも、COMBO の有無が違う', () => {
    const solo = play(5, SOLUTIONS[5]!);
    const combo = play(10, SOLUTIONS[10]!);
    const groups = (st: StageState) =>
      st.lastResult!.events.flatMap((e) => e.detonations.filter((d) => d.group.length >= 2));

    expect(solo.lastResult!.maxChain).toBe(2);
    expect(combo.lastResult!.maxChain).toBe(2);
    // 単独起爆でも CHAIN 2 は起きる。COMBO かどうかは起爆した特殊の数で決まる。
    expect(groups(solo).length).toBe(0);
    expect(groups(combo).length).toBe(1);
  });

  it('Stage 11 は「特殊を残す」ことを文章で教えるガイド付き教材', () => {
    const t = stageById(11).tutorial;
    expect(t.showGuide).toBe(true);
    expect(t.hints?.length).toBe(3);
    // 「なぜ残すか」を 1 組の因果として出す（Stage 5・8・9 の「起爆させる」と逆なので）
    expect(t.intro).toContain('残そう');
    expect(t.intro).toContain('いっしょに 起爆');
    expect(t.intro).toContain('COMBO');
    expect(t.outro).toContain('COMBO');
    // ROCKET 生成後のヒントでも「そのまま残す」と「矢印を届かせる」が読める
    const hints = t.hints ?? [];
    expect(hints[0]?.text).toContain('BOMBは 残す');
    expect(hints[1]?.text).toContain('BOMBは そのまま');
    expect(hints[2]?.text).toContain('届かせよう');
  });

  it('Stage 12 には Stage 11 の「残す」説明もヒントも出ない', () => {
    const t = stageById(12).tutorial;
    expect(t.intro).toBeUndefined();
    expect(t.outro).toBeUndefined();
    expect(t.hints).toBeUndefined();
    expect(t.showGuide).toBe(false);
    // Stage 11 の文言が混ざっていないこと
    const eleven = stageById(11).tutorial;
    expect(JSON.stringify(t)).not.toContain('残そう');
    expect(eleven.intro).toContain('残そう');
  });

  it('objective の表示文だけを日本語化し、集計条件は変えない', () => {
    const ten = stageById(10).objectives[0]!;
    expect(ten.kind).toBe('combo');
    expect(ten.effect).toBe('rocket+bomb'); // effect 指定は据え置き
    expect(ten.target).toBe(1);
    expect(ten.label).toBe('ROCKET と BOMB を いっしょに起爆（COMBO）');

    const eleven = stageById(11).objectives[0]!;
    expect(eleven.kind).toBe('combo');
    expect(eleven.effect).toBeUndefined();
    expect(eleven.label).toBe('BOMBを残して 特殊2個を いっしょに起爆');

    const twelve = stageById(12).objectives[0]!;
    expect(twelve.kind).toBe('combo');
    expect(twelve.effect).toBeUndefined();
    expect(twelve.label).toBe('特殊2個を いっしょに起爆（COMBO）');

    // 文言を変えても達成判定は変わらない
    expect(play(10, SOLUTIONS[10]!).objectiveProgress()[0]!.done).toBe(true);
    expect(play(12, SOLUTIONS[12]!).objectiveProgress()[0]!.done).toBe(true);
  });

  it('Stage 11: 想定解では ROCKET を作って残し、BOMB へ届かせて COMBO になる', () => {
    const st = new StageState(stageById(11));

    // 1 手目: 行 6・7 を同時に消して たて ROCKET を作る。BOMB はまだ残す。
    st.place(0, 6, 3);
    expect(st.lastResult!.events[0]!.lines.length).toBe(2);
    expect(st.lastResult!.specialsCreated).toEqual(['rocket']);
    expect(st.board.specialIndices().length).toBe(2); // ROCKET と BOMB が並存
    expect(st.status).toBe('playing');

    // 2〜3 手目: ROCKET の行をそろえて巻きこむ
    st.place(1, 6, 0);
    st.place(2, 6, 4);
    const d = st.lastResult!.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rocket+bomb');
    expect(d.group.length).toBe(2);
    expect(st.status).toBe('cleared');
  });

  it('Stage 11: 1 手では BOMB を単独起爆させられない（無言の詰みを作らない）', () => {
    // 行 3 の空きは (3,5) と (3,7) の 2 マスで連続していない。
    // どのピースを 1 個置いても行 3 は完成せず、列 3 も 7 マス空いているので完成しない。
    const root = new StageState(stageById(11));
    for (let t = 0; t < root.tray.length; t++) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const st = new StageState(stageById(11));
          if (!st.canPlace(t, r, c)) continue;
          st.place(t, r, c);
          expect(st.board.specialIndices().length, `t${t} r${r} c${c}`).toBeGreaterThanOrEqual(1);
          expect(st.lastResult!.specialsDetonated, `t${t} r${r} c${c}`).not.toContain('bomb');
        }
      }
    }
  });

  it('Stage 11: 代表的な誤操作（v2 を捨てる）でも、残り手数で立て直せる', () => {
    const st = new StageState(stageById(11));
    // 誤操作: v2 を (5,3) へ置いてしまい、行 6 だけが単独で消える（特殊は生まれない）
    st.place(0, 5, 3);
    expect(st.lastResult!.specialsCreated.length).toBe(0);
    expect(st.status).toBe('playing');

    // 立て直し: 行 6 を作り直し、2 セット目の v2 で 行 6・7 を同時に消す
    for (const m of [[1, 6, 0], [2, 6, 4], [0, 6, 3], [1, 6, 0], [2, 6, 4]] as const) {
      const out = st.place(m[0], m[1], m[2]);
      expect(out.ok, `move ${m}`).toBe(true);
    }
    expect(st.movesUsed).toBe(6);
    expect(st.movesUsed).toBeLessThanOrEqual(stageById(11).moves);
    expect(st.objectiveProgress()[0]!.current).toBe(1);
    expect(st.status).toBe('cleared');
  });

  it('Stage 12: 案内なしの転移確認（intro もガイドも無い）', () => {
    const st = new StageState(stageById(12));
    expect(st.status).toBe('playing');
    expect(st.objectiveProgress().every((o) => o.done)).toBe(false);
    expect(st.def.tutorial.showGuide).toBe(false);
    expect(st.def.tutorial.intro).toBeUndefined();
    expect(st.def.tutorial.hints).toBeUndefined();
    expect(st.def.objectives.map((o) => o.kind)).toEqual(['combo']);
    // 特定の組み合わせに縛らない＝「特殊 x 特殊 なら何でも」
    expect(st.def.objectives[0]!.effect).toBeUndefined();
  });

  it('Stage 12: 想定解で COMBO になり、二重起爆しない', () => {
    const st = play(12, SOLUTIONS[12]!);
    const r = st.lastResult!;
    expect(r.maxChain).toBe(2);
    const d = r.events[1]!.detonations[0]!;
    expect(d.effect).toBe('rocket+bomb');
    expect(d.group.length).toBe(2);

    const uids = r.events.flatMap((e) => e.detonations.flatMap((g) => g.group.map((x) => x.uid)));
    expect(uids.length).toBe(2);
    expect(new Set(uids).size).toBe(2);
    expect(st.status).toBe('cleared');
  });

  it('Stage 12: 1 手では BOMB を単独起爆させられない', () => {
    const root = new StageState(stageById(12));
    for (let t = 0; t < root.tray.length; t++) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const st = new StageState(stageById(12));
          if (!st.canPlace(t, r, c)) continue;
          st.place(t, r, c);
          expect(st.lastResult!.specialsDetonated, `t${t} r${r} c${c}`).not.toContain('bomb');
        }
      }
    }
  });

  it('Stage 12: 代表的な誤操作（行 1 だけ消す）後にも回復経路がある', () => {
    const st = new StageState(stageById(12));
    // 誤操作: v2 を (1,3) へ置いて 行 1 だけを消す（1 ライン＝特殊は生まれない）
    st.place(0, 1, 3);
    expect(st.lastResult!.events[0]!.lines.length).toBe(1);
    expect(st.lastResult!.specialsCreated.length).toBe(0);
    expect(st.status).toBe('playing');

    // 立て直し: 行 1 を作り直し、2 セット目の v2 で 行 0・1 を同時に消す
    for (const m of [[1, 1, 0], [2, 1, 4], [0, 0, 3], [1, 0, 0], [2, 0, 4]] as const) {
      const out = st.place(m[0], m[1], m[2]);
      expect(out.ok, `move ${m}`).toBe(true);
    }
    expect(st.movesUsed).toBe(6);
    expect(st.movesUsed).toBeLessThanOrEqual(stageById(12).moves);
    expect(st.objectiveProgress()[0]!.current).toBe(1);
    expect(st.status).toBe('cleared');
  });
});

describe('ROCKET の 向き（intro の説明とコードの挙動が一致する）', () => {
  it('Stage 5: 行だけ 2 本 同時 → たて向き。intro も「たて向き」と書いてある', () => {
    const st = new StageState(stageById(5));
    st.place(0, 6, 7);
    const spawn = st.lastResult!.events[0]!.spawned!;
    expect(st.lastResult!.events[0]!.lines.every((l) => l.kind === 'row')).toBe(true);
    expect(spawn.kind).toBe('rocket');
    expect(spawn.dir).toBe('v');
    expect(stageById(5).tutorial.intro).toContain('たて向き');
    expect(stageById(5).tutorial.intro).not.toContain('よこ向きの ROCKET が 生まれます');
  });

  it('Stage 8: 行と列を 1 本ずつ 同時 → よこ向き。intro も「よこ向き」と書いてある', () => {
    const st = new StageState(stageById(8));
    st.place(0, 7, 0);
    const ev = st.lastResult!.events[0]!;
    const spawn = ev.spawned!;
    expect(ev.lines.filter((l) => l.kind === 'row').length).toBe(1);
    expect(ev.lines.filter((l) => l.kind === 'col').length).toBe(1);
    expect(spawn.kind).toBe('rocket');
    expect(spawn.dir).toBe('h');
    expect(stageById(8).tutorial.intro).toContain('よこ向き');
    expect(stageById(8).tutorial.intro).toContain('たて向き'); // Stage 5 との対比を書く
  });

  it('Stage 5 と Stage 8 で、同じ ROCKET でも消える向きが逆になる', () => {
    const five = play(5, SOLUTIONS[5]!);
    const eight = play(8, SOLUTIONS[8]!);
    // たて向きは列 7 の残り 4 セル、よこ向きは行 7 の的を消す
    expect(five.lastResult!.events[1]!.detonations[0]!.effect).toBe('rocket');
    expect(eight.lastResult!.events[1]!.detonations[0]!.effect).toBe('rocket');
    const cellsOf = (st: StageState) => st.lastResult!.events[1]!.detonations[0]!.cells;
    const sameCol = (cs: readonly number[]) => new Set(cs.map((i) => i % 8)).size === 1;
    const sameRow = (cs: readonly number[]) => new Set(cs.map((i) => Math.floor(i / 8))).size === 1;
    expect(sameCol(cellsOf(five))).toBe(true);
    expect(sameRow(cellsOf(eight))).toBe(true);
  });
});

describe('回帰: 不正な配置は状態を動かさない', () => {
  it('置けない場所へ落としても、盤面・トレイ・手数が変わらない', () => {
    const st = new StageState(stageById(11));
    const board = st.board.toStrings();
    const tray = st.tray.map((p) => p && `${p.shape.id}:${p.color}`);
    const moves = st.moves;
    const seed = st.seed;

    for (const [t, r, c] of [[0, 3, 0], [0, 7, 7], [1, 6, 1], [2, -1, 0], [0, 0, 9]] as const) {
      expect(st.canPlace(t, r, c), `t${t} r${r} c${c}`).toBe(false);
      const out = st.place(t, r, c);
      expect(out.ok, `t${t} r${r} c${c}`).toBe(false);
      expect(out.reason).toBe('illegal');
    }

    expect(st.board.toStrings()).toEqual(board);
    expect(st.tray.map((p) => p && `${p.shape.id}:${p.color}`)).toEqual(tray);
    expect(st.moves).toBe(moves);
    expect(st.movesUsed).toBe(0);
    expect(st.seed).toBe(seed);
    expect(st.status).toBe('playing');
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
