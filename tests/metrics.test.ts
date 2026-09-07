import { describe, expect, it } from 'vitest';
import { stageById } from '../src/data/stages';
import { previewPlacement } from '../src/game/Preview';
import { StageState } from '../src/game/StageState';
import { PlayMetrics, type AttemptMetrics } from '../src/ui/PlayMetrics';

const parse = (m: PlayMetrics): AttemptMetrics[] => JSON.parse(m.toJSON()) as AttemptMetrics[];

/** Stage 11 を想定解で解きながら計測する。 */
function playStage11(m: PlayMetrics, isRetry: boolean): StageState {
  const st = new StageState(stageById(11));
  m.begin(11, isRetry);
  for (const [t, r, c] of [[0, 6, 3], [1, 6, 0], [2, 6, 4]] as const) {
    const pv = previewPlacement(st.board, st.tray[t]!, r, c);
    m.onPreview(`${t}:${r}:${c}`, pv);
    const out = st.place(t, r, c);
    m.onPlaced(st, out.result ?? null, pv);
  }
  return st;
}

describe('プレイ計測（メモリ上のみ）', () => {
  it('1 挑戦ぶんの値が集計される', () => {
    const m = new PlayMetrics();
    const st = playStage11(m, false);
    const a = parse(m)[0]!;

    expect(a.stage).toBe(11);
    expect(a.retry).toBe(0);
    expect(a.movesUsed).toBe(3);
    expect(a.result).toBe('cleared');
    expect(st.status).toBe('cleared');

    expect(a.combos).toBe(1);
    expect(a.comboKinds).toEqual({ 'rocket+bomb': 1 });
    expect(a.firstComboAtMove).toBe(3);
    expect(a.soloDetonations).toBe(0);
    // ROCKET は 1 手目に生まれ 3 手目に起爆した
    expect(a.specialLifetimes).toEqual([2]);
    // 3 手とも予告を見て、そのうち 1 手が combo 予告だった
    expect(a.previewsShown).toBe(3);
    expect(a.comboPreviewsShown).toBe(1);
    expect(a.choseAfterComboPreview).toBe(true);
  });

  it('retry ごとに初期化され、挑戦が積み上がる', () => {
    const m = new PlayMetrics();
    playStage11(m, false);
    playStage11(m, true);
    playStage11(m, true);
    const all = parse(m);

    expect(all.length).toBe(3);
    expect(all.map((a) => a.retry)).toEqual([0, 1, 2]);
    // 各挑戦は独立して数え直される（累積しない）
    for (const a of all) {
      expect(a.stage).toBe(11);
      expect(a.movesUsed).toBe(3);
      expect(a.combos).toBe(1);
      expect(a.illegalDrops).toBe(0);
    }
  });

  it('わなを選んだ挑戦は combo 0・単独起爆 1 として残る', () => {
    const m = new PlayMetrics();
    const st = new StageState(stageById(11));
    m.begin(11, false);
    const pv = previewPlacement(st.board, st.tray[0]!, 2, 7);
    m.onPreview('0:2:7', pv);
    const out = st.place(0, 2, 7);
    m.onPlaced(st, out.result ?? null, pv);

    const a = parse(m)[0]!;
    expect(a.combos).toBe(0);
    expect(a.soloDetonations).toBe(1);
    expect(a.firstComboAtMove).toBeNull();
    expect(a.comboPreviewsShown).toBe(0);
    expect(a.choseAfterComboPreview).toBe(false);
    expect(a.result).toBe('playing');
  });

  it('不正ドロップを数える', () => {
    const m = new PlayMetrics();
    m.begin(11, false);
    m.onIllegalDrop();
    m.onIllegalDrop();
    expect(parse(m)[0]!.illegalDrops).toBe(2);
  });

  it('同じ候補セルの予告は 1 回だけ数える', () => {
    const m = new PlayMetrics();
    const st = new StageState(stageById(11));
    m.begin(11, false);
    const pv = previewPlacement(st.board, st.tray[0]!, 6, 3);
    for (let i = 0; i < 5; i++) m.onPreview('0:6:3', pv);
    expect(parse(m)[0]!.previewsShown).toBe(1);
  });

  it('計測はゲームロジックへ影響しない（同じ手順なら結果が完全に一致する）', () => {
    const withMetrics = playStage11(new PlayMetrics(), false);

    const plain = new StageState(stageById(11));
    for (const [t, r, c] of [[0, 6, 3], [1, 6, 0], [2, 6, 4]] as const) plain.place(t, r, c);

    expect(withMetrics.score).toBe(plain.score);
    expect(withMetrics.status).toBe(plain.status);
    expect(withMetrics.movesUsed).toBe(plain.movesUsed);
    expect(withMetrics.board.toStrings()).toEqual(plain.board.toStrings());
    expect(withMetrics.seed).toBe(plain.seed);
    expect(withMetrics.setsDealt).toBe(plain.setsDealt);
    expect(withMetrics.objectiveProgress().map((o) => o.current)).toEqual(
      plain.objectiveProgress().map((o) => o.current),
    );
  });

  it('JSON として取り出せる（DBG からのコピー用）', () => {
    const m = new PlayMetrics();
    playStage11(m, false);
    const json = m.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();
    expect(m.count).toBe(1);
    expect(json).toContain('"stage": 11');
    expect(json).toContain('rocket+bomb');
  });
});
