import { describe, expect, it } from 'vitest';
import { stageById } from '../src/data/stages';
import { StageState } from '../src/game/StageState';
import { summarizeEvents } from '../src/game/Resolver';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('resolution の集計', () => {
  it('全体の合計スコアは event 別スコアの合計と一致する', () => {
    const { result } = playOne(
      rows({ 2: '..YYY...', 3: '..Y*Y...', 4: '..YYY...', 7: 'RB.^YGPB' }),
      'dot',
      'green',
      7,
      2,
    );
    expect(result.events.length).toBeGreaterThan(1);
    expect(result.totalScore).toBe(result.events.reduce((a, e) => a + e.score, 0));
  });

  it('先頭 n wave の集計は、n が最終 wave のとき全体の集計と一致する', () => {
    const st = new StageState(stageById(10));
    st.place(0, 7, 2);
    const r = st.lastResult!;
    const full = summarizeEvents(r.events, r.aborted);
    expect(full.totalScore).toBe(r.totalScore);
    expect(full.maxChain).toBe(r.maxChain);
    expect(full.specialsCreated).toEqual(r.specialsCreated);
    expect(full.specialsDetonated).toEqual(r.specialsDetonated);
    expect(full.rowsCleared).toBe(r.rowsCleared);
    expect(full.colsCleared).toBe(r.colsCleared);
  });
});

describe('演出中の表示は wave 単位で進む', () => {
  /** Stage 10 は 1 手で 3 wave 進むので、途中経過の検証に使える。 */
  const stage10 = () => {
    const st = new StageState(stageById(10));
    st.place(0, 7, 2);
    return st;
  };

  it('配置直後（0 wave 再生）は、まだスコアも目的も動かない', () => {
    const st = stage10();
    const p = st.presentation(0);
    expect(p.score).toBe(0);
    expect(p.chain).toBe(0);
    expect(p.objectives[0]!.current).toBe(0);
    expect(p.objectives[0]!.done).toBe(false);
    expect(p.settled).toBe(false);
    // 論理状態のほうは、この時点ですでに確定している
    expect(st.score).toBeGreaterThan(0);
    expect(st.status).toBe('cleared');
  });

  it('スコアは wave ごとに積み上がる', () => {
    const st = stage10();
    const waveScores = st.lastResult!.events.map((e) => e.score);
    let running = 0;
    for (let n = 1; n <= waveScores.length; n++) {
      running += waveScores[n - 1]!;
      const p = st.presentation(n);
      expect(p.score, `wave ${n}`).toBe(running);
      expect(p.chain).toBe(n);
    }
    expect(st.presentation(waveScores.length).score).toBe(st.score);
  });

  it('CHAIN 3 の目的は、最後の wave を再生するまで達成にならない', () => {
    const st = stage10();
    expect(st.presentation(1).objectives[0]!.done).toBe(false);
    expect(st.presentation(2).objectives[0]!.done).toBe(false);
    expect(st.presentation(3).objectives[0]!.done).toBe(true);
    expect(st.presentation(3).settled).toBe(true);
  });

  it('最終 wave まで再生すれば、表示は論理状態と完全に一致する', () => {
    const st = stage10();
    const p = st.presentation(st.lastResult!.events.length);
    expect(p.score).toBe(st.score);
    expect(p.objectives.map((o) => [o.current, o.done])).toEqual(
      st.objectiveProgress().map((o) => [o.current, o.done]),
    );
    expect(p.settled).toBe(true);
  });

  it('wave 数がはみ出しても最終状態で頭打ちになる', () => {
    const st = stage10();
    expect(st.presentation(99).score).toBe(st.score);
    expect(st.presentation(-5).score).toBe(0);
    expect(st.presentation(-5).chain).toBe(0);
  });

  it('前の手のスコアを土台にして積み上がる（複数手のステージ）', () => {
    const st = new StageState(stageById(5));
    st.place(0, 6, 7); // 2 ライン同時 → Rocket 生成
    const afterFirst = st.score;
    expect(st.presentation(1).score).toBe(afterFirst);

    st.place(1, 6, 0); // resolution が起きない手
    st.place(2, 6, 4); // 行 6 完成 → Rocket 起爆（2 wave）
    expect(st.presentation(0).score).toBe(afterFirst);
    expect(st.presentation(1).score).toBe(afterFirst + st.lastResult!.events[0]!.score);
    expect(st.presentation(2).score).toBe(st.score);
  });

  it('resolution が起きなかった手では、そのまま確定状態を返す', () => {
    const st = new StageState(stageById(5));
    st.place(0, 6, 7);
    st.place(1, 6, 0); // ラインが完成しないので events は空
    expect(st.lastResult!.events.length).toBe(0);
    const p = st.presentation(0);
    expect(p.score).toBe(st.score);
    expect(p.settled).toBe(true);
  });

  it('目的の達成マークも wave 単位で点く（Stage 5 の ROCKET 起爆）', () => {
    const st = new StageState(stageById(5));
    st.place(0, 6, 7);
    st.place(1, 6, 0);
    st.place(2, 6, 4);
    // wave1 はライン消去だけ。起爆は wave2 なので、そこで初めて 2 つ目の目的が埋まる。
    const objAt = (n: number) => st.presentation(n).objectives.map((o) => o.done);
    expect(objAt(1)).toEqual([true, false]);
    expect(objAt(2)).toEqual([true, true]);
  });
});
