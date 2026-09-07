import { describe, expect, it } from 'vitest';
import { CHAIN_NOTICE_MIN, chainNote, comboNote, waveNotice } from '../src/data/resultText';
import { stageById } from '../src/data/stages';
import { StageState } from '../src/game/StageState';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

/** 1 手打って、wave ごとの中央表示を並べる。 */
const noticesOf = (stageId: number, moves: readonly (readonly [number, number, number])[]) => {
  const st = new StageState(stageById(stageId));
  for (const [t, r, c] of moves) st.place(t, r, c);
  return st.lastResult!.events.map((e) => waveNotice(e));
};

describe('CHAIN と COMBO の意味表示（文言と条件は resultText 1 か所）', () => {
  it('CHAIN の説明は「特殊の種類」ではなく「続いた回数」を言う', () => {
    expect(chainNote(2)).toBe('消去が 2回 つづいた！');
    expect(chainNote(3)).toBe('消去が 3回 つづいた！');
    expect(chainNote(1)).toBeNull(); // 1 波で終わった手には出さない
    expect(chainNote(0)).toBeNull();
    expect(CHAIN_NOTICE_MIN).toBe(2);
  });

  it('COMBO の説明は「爆発の種類」ではなく「特殊が何個 いっしょに起爆したか」を言う', () => {
    expect(comboNote(2)).toBe('特殊 2個が いっしょに起爆！');
    expect(comboNote(3)).toBe('特殊 3個が いっしょに起爆！');
    expect(comboNote(1)).toBeNull(); // 単独起爆は COMBO ではない
  });

  it('単独特殊の CHAIN 2 では、CHAIN 説明は出るが COMBO 説明は出ない（Stage 5）', () => {
    const n = noticesOf(5, [[0, 6, 7], [1, 6, 0], [2, 6, 4]]);
    expect(n.length).toBe(2);
    expect(n[0]).toEqual({ comboName: null, comboNote: null, chainLabel: null, chainNote: null });
    expect(n[1]!.chainLabel).toBe('CHAIN 2');
    expect(n[1]!.chainNote).toBe('消去が 2回 つづいた！');
    expect(n[1]!.comboName).toBeNull();
    expect(n[1]!.comboNote).toBeNull();
  });

  it('rocket+bomb では CHAIN 説明と COMBO 説明が別々に出る（Stage 10）', () => {
    const n = noticesOf(10, [[0, 7, 2]]);
    expect(n.length).toBe(2);
    // wave1 はライン消去だけ。まだどちらも出ない。
    expect(n[0]).toEqual({ comboName: null, comboNote: null, chainLabel: null, chainNote: null });
    // wave2 で 4 行すべてが揃う
    expect(n[1]!.comboName).toBe('ROCKET + BOMB');
    expect(n[1]!.comboNote).toBe('特殊 2個が いっしょに起爆！');
    expect(n[1]!.chainLabel).toBe('CHAIN 2');
    expect(n[1]!.chainNote).toBe('消去が 2回 つづいた！');
  });

  it('COMBO 説明の個数は Detonation.group の実数と一致する', () => {
    for (const [stage, moves] of [
      [10, [[0, 7, 2]]],
      [11, [[0, 6, 3], [1, 6, 0], [2, 6, 4]]],
      [12, [[0, 0, 3], [1, 0, 0], [2, 0, 4]]],
    ] as const) {
      const st = new StageState(stageById(stage));
      for (const [t, r, c] of moves) st.place(t, r, c);
      for (const ev of st.lastResult!.events) {
        const det = ev.detonations.find((d) => d.group.length >= 2);
        const notice = waveNotice(ev);
        if (det) expect(notice.comboNote, `stage ${stage}`).toBe(`特殊 ${det.group.length}個が いっしょに起爆！`);
        else expect(notice.comboNote, `stage ${stage}`).toBeNull();
      }
    }
  });

  it('3 個いっしょに起爆したら「特殊 3個」と出る', () => {
    // 列 2 の Rocket が起爆 → 射線上の Bomb と、その 3x3 が届く先の Rocket まで 1 グループ
    const { result } = playOne(
      rows({ 2: '..^.....', 3: '..*.....', 4: '..>.....', 7: 'RB^YGPR.' }),
      'dot',
      'blue',
      7,
      7,
    );
    const det = result.events[1]!.detonations[0]!;
    expect(det.group.length).toBeGreaterThanOrEqual(3);
    expect(waveNotice(result.events[1]!).comboNote).toBe(`特殊 ${det.group.length}個が いっしょに起爆！`);
  });

  it('COMBO 説明は次の wave へ持ち越さない（wave2 は combo・wave3 は単独）', () => {
    // Phase 2C 以前の Stage 10 と同じ形。wave2 で combo、wave3 は届いた先の単独起爆。
    const { result } = playOne(
      rows({ 0: 'YY..>.YY', 2: '..R.R...', 3: '..R*R...', 4: '..R.R...', 7: 'RB.^YGPB' }),
      'dot',
      'green',
      7,
      2,
    );
    expect(result.events.length).toBe(3);
    const n = result.events.map((e) => waveNotice(e));
    expect(n[1]!.comboName).toBe('ROCKET + BOMB');
    expect(n[1]!.chainLabel).toBe('CHAIN 2');
    // wave3 は単独起爆。COMBO 表示は消え、CHAIN だけが 3 になる。
    expect(result.events[2]!.detonations.every((d) => d.group.length === 1)).toBe(true);
    expect(n[2]!.comboName).toBeNull();
    expect(n[2]!.comboNote).toBeNull();
    expect(n[2]!.chainLabel).toBe('CHAIN 3');
    expect(n[2]!.chainNote).toBe('消去が 3回 つづいた！');
  });

  it('表示側で combo を判定し直さない（Detonation.effect / group だけを見る）', () => {
    // effect が combo 名でなければ、group が 2 以上でも COMBO 表示にはならない
    const solo = { chainIndex: 2, lines: [], blasts: [], removed: [], spawned: null, score: 0, chainMultiplier: 1,
      detonations: [{ effect: 'rocket', group: [{ uid: 1, kind: 'rocket', index: 0, color: null, dir: 'v' }], cells: [] }] } as never;
    const n = waveNotice(solo);
    expect(n.comboName).toBeNull();
    expect(n.comboNote).toBeNull();
    expect(n.chainLabel).toBe('CHAIN 2');
  });
});
