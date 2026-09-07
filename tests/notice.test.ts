import { describe, expect, it } from 'vitest';
import {
  CHAIN_NOTICE_MIN,
  KEEP_NOTE,
  chainNote,
  chainSequenceNote,
  comboNote,
  waveMark,
  waveNotice,
} from '../src/data/resultText';
import { STAGES, stageById } from '../src/data/stages';
import { StageState } from '../src/game/StageState';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

const play = (stageId: number, moves: readonly (readonly [number, number, number])[]) => {
  const st = new StageState(stageById(stageId));
  for (const [t, r, c] of moves) st.place(t, r, c);
  return st;
};

const SOL = {
  5: [[0, 6, 7], [1, 6, 0], [2, 6, 4]],
  10: [[0, 7, 2]],
  11: [[0, 6, 3], [1, 6, 0], [2, 6, 4]],
  12: [[0, 0, 3], [1, 0, 0], [2, 0, 4]],
} as const;

describe('wave 番号（1 wave = 番号 1 個）', () => {
  it('2 ライン同時消去でも wave は 1 つ、番号も ① だけ', () => {
    const st = new StageState(stageById(5));
    st.place(0, 6, 7); // 行 6 と行 7 が同時にそろう
    const r = st.lastResult!;
    expect(r.events.length).toBe(1);
    expect(r.events[0]!.lines.length).toBe(2); // 消えたラインは 2 本
    expect(r.events[0]!.chainIndex).toBe(1); // でも wave は 1
    expect(waveMark(r.events[0]!.chainIndex)).toBe('①');
    expect(r.maxChain).toBe(1);
    // 1 波で終わった手には CHAIN 表示を出さない（「2列そろった＝CHAIN 2」を作らない）
    expect(waveNotice(r.events[0]!, ['waveNumbers']).chainLabel).toBeNull();
  });

  it('ライン消去が ①、次の ROCKET 起爆が ②', () => {
    const st = play(5, SOL[5]);
    const ev = st.lastResult!.events;
    expect(ev.length).toBe(2);
    expect(ev[0]!.detonations.length).toBe(0); // ① はライン消去
    expect(ev[1]!.detonations.map((d) => d.effect)).toEqual(['rocket']); // ② は起爆
    expect(ev.map((e) => waveMark(e.chainIndex))).toEqual(['①', '②']);
  });

  it('CHAIN の説明は順序で言う（①→②  CHAIN 2）', () => {
    expect(chainSequenceNote(2)).toBe('①→②  CHAIN 2');
    expect(chainSequenceNote(3)).toBe('①→②→③  CHAIN 3');
    expect(chainSequenceNote(1)).toBeNull();
    expect(CHAIN_NOTICE_MIN).toBe(2);
  });

  it('教材ステージ以外はそのままの言い方（丸数字を出さない）', () => {
    expect(chainNote(2)).toBe('消去が 2回 つづいた！');
    const st = play(5, SOL[5]);
    const last = st.lastResult!.events[1]!;
    expect(waveNotice(last, ['waveNumbers']).chainNote).toBe('①→②  CHAIN 2');
    expect(waveNotice(last, []).chainNote).toBe('消去が 2回 つづいた！');
  });
});

describe('COMBO の表示', () => {
  it('COMBO の説明は短く、個数は group の実数', () => {
    expect(comboNote(2)).toBe('2個同時＝COMBO');
    expect(comboNote(3)).toBe('3個同時＝COMBO');
    expect(comboNote(1)).toBeNull();
  });

  it('Stage 5 は CHAIN 説明だけで COMBO 説明を出さない', () => {
    const st = play(5, SOL[5]);
    const n = st.lastResult!.events.map((e) => waveNotice(e, stageById(5).tutorial.teach ?? []));
    expect(n[0]).toMatchObject({ comboName: null, comboNote: null, chainLabel: null });
    expect(n[1]!.chainLabel).toBe('CHAIN 2');
    expect(n[1]!.chainNote).toBe('①→②  CHAIN 2');
    expect(n[1]!.comboName).toBeNull();
    expect(n[1]!.comboNote).toBeNull();
    expect(n[1]!.comboSize).toBe(0);
  });

  it('Stage 10 は CHAIN と COMBO を別々に出す', () => {
    const st = play(10, SOL[10]);
    const teach = stageById(10).tutorial.teach ?? [];
    const n = st.lastResult!.events.map((e) => waveNotice(e, teach));
    expect(n.length).toBe(2);
    expect(n[0]).toMatchObject({ comboName: null, comboNote: null, chainLabel: null, chainNote: null });
    // COMBO 側
    expect(n[1]!.comboName).toBe('ROCKET + BOMB');
    expect(n[1]!.comboNote).toBe('2個同時＝COMBO');
    // CHAIN 側は別の行。waveNumbers 教材ではないので丸数字にはしない
    expect(n[1]!.chainLabel).toBe('CHAIN 2');
    expect(n[1]!.chainNote).toBe('消去が 2回 つづいた！');
    expect(teach).toEqual(['comboLink']);
  });

  it('Stage 10 で結び付ける 2 個は ROCKET と BOMB（盤面上の位置つき）', () => {
    const st = play(10, SOL[10]);
    const d = st.lastResult!.events[1]!.detonations[0]!;
    expect(d.group.length).toBe(2);
    expect(d.group.map((g) => g.kind).sort()).toEqual(['bomb', 'rocket']);
    // 表示はこの index をそのまま使って枠と矢印を描く
    const bomb = d.group.find((g) => g.kind === 'bomb')!;
    const rocket = d.group.find((g) => g.kind === 'rocket')!;
    expect([Math.floor(bomb.index / 8), bomb.index % 8]).toEqual([3, 3]);
    expect([Math.floor(rocket.index / 8), rocket.index % 8]).toEqual([7, 3]);
    expect(rocket.dir).toBe('v'); // 射線は列 3。だから BOMB へ届く
  });

  it('COMBO 表示は次の wave へ持ち越さない（wave2 は combo・wave3 は単独）', () => {
    const { result } = playOne(
      rows({ 0: 'YY..>.YY', 2: '..R.R...', 3: '..R*R...', 4: '..R.R...', 7: 'RB.^YGPB' }),
      'dot',
      'green',
      7,
      2,
    );
    expect(result.events.length).toBe(3);
    const n = result.events.map((e) => waveNotice(e, ['comboLink']));
    expect(n[1]!.comboName).toBe('ROCKET + BOMB');
    expect(n[2]!.comboName).toBeNull();
    expect(n[2]!.comboNote).toBeNull();
    expect(n[2]!.chainLabel).toBe('CHAIN 3');
  });

  it('表示側で combo を判定し直さない（effect / group だけを見る）', () => {
    const solo = {
      chainIndex: 2, lines: [], blasts: [], removed: [], spawned: null, score: 0, chainMultiplier: 1,
      detonations: [{ effect: 'rocket', group: [{ uid: 1, kind: 'rocket', index: 0, color: null, dir: 'v' }], cells: [] }],
    } as never;
    const n = waveNotice(solo);
    expect(n.comboName).toBeNull();
    expect(n.comboNote).toBeNull();
    expect(n.comboSize).toBe(0);
    expect(n.chainLabel).toBe('CHAIN 2');
  });
});

describe('盤面上の教材表示はステージデータだけが決める', () => {
  it('teach を持つのは Stage 5・10・11 だけ', () => {
    const map = Object.fromEntries(STAGES.map((s) => [s.id, s.tutorial.teach ?? null]));
    expect(map[5]).toEqual(['waveNumbers']);
    expect(map[10]).toEqual(['comboLink']);
    expect(map[11]).toEqual(['keep']);
    for (const id of [1, 2, 3, 4, 6, 7, 8, 9, 12]) expect(map[id], `stage ${id}`).toBeNull();
  });

  it('KEEP 教材は Stage 11 だけ。Stage 12 には教材表示が一切混入しない', () => {
    const keepers = STAGES.filter((s) => (s.tutorial.teach ?? []).includes('keep')).map((s) => s.id);
    expect(keepers).toEqual([11]);

    const t12 = stageById(12).tutorial;
    expect(t12.teach).toBeUndefined();
    expect(t12.intro).toBeUndefined();
    expect(t12.outro).toBeUndefined();
    expect(t12.hints).toBeUndefined();
    expect(t12.showGuide).toBe(false);
  });

  it('Stage 11 の文章は「BOMBは 残す」まで短縮してある', () => {
    const t = stageById(11).tutorial;
    expect(t.hints?.[0]?.text).toBe(KEEP_NOTE);
    expect(t.hints?.[1]?.text).toBe(KEEP_NOTE);
    for (const h of t.hints ?? []) expect(h.text!.length).toBeLessThanOrEqual(20);
    expect(t.intro!.length).toBeLessThanOrEqual(60);
  });

  it('教材表示はスコア・目的達成・resolution に影響しない', () => {
    for (const [id, moves] of [[5, SOL[5]], [10, SOL[10]], [11, SOL[11]], [12, SOL[12]]] as const) {
      const def = stageById(id);
      const withTeach = new StageState(def);
      // teach を外しただけの同じステージ
      const without = new StageState({ ...def, id: 900 + id, tutorial: { ...def.tutorial, teach: undefined } });
      for (const [t, r, c] of moves) {
        withTeach.place(t, r, c);
        without.place(t, r, c);
      }
      expect(withTeach.score, `stage ${id}`).toBe(without.score);
      expect(withTeach.status, `stage ${id}`).toBe(without.status);
      expect(withTeach.maxChain, `stage ${id}`).toBe(without.maxChain);
      expect(withTeach.board.toStrings(), `stage ${id}`).toEqual(without.board.toStrings());
      expect(withTeach.objectiveProgress().map((o) => [o.current, o.done])).toEqual(
        without.objectiveProgress().map((o) => [o.current, o.done]),
      );
      expect(withTeach.lastResult!.events.length).toBe(without.lastResult!.events.length);
    }
  });
});
