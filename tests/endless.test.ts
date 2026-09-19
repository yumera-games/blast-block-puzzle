import { describe, expect, it } from 'vitest';
import { ENDLESS_ID, createEndlessStage, newEndlessSeed } from '../src/game/endless';
import { STAGES, LAST_STAGE } from '../src/data/stages';
import { StageState } from '../src/game/StageState';

/** 置ける場所をひとつ探す。**本番の canPlace をそのまま使う**（別の判定を作らない）。 */
function firstLegalMove(st: StageState): { i: number; row: number; col: number } | null {
  for (let i = 0; i < st.tray.length; i++) {
    if (!st.tray[i]) continue;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (st.canPlace(i, row, col)) return { i, row, col };
      }
    }
  }
  return null;
}

/** 置けなくなるまで遊ぶ。**上限は無限ループ避けで、正常なら必ず手前で終わる。** */
function playToEnd(seed: number, maxMoves = 5000): { st: StageState; moves: number } {
  const st = new StageState(createEndlessStage(seed));
  let moves = 0;
  while (st.status === 'playing' && moves < maxMoves) {
    const m = firstLegalMove(st);
    if (!m) break;
    st.place(m.i, m.row, m.col);
    moves++;
  }
  return { st, moves };
}

describe('endless: ステージ定義', () => {
  it('エンドレスは STAGES に入っていない（LAST_STAGE を動かさない）', () => {
    expect(STAGES.some((s) => s.id === ENDLESS_ID)).toBe(false);
    expect(STAGES.some((s) => s.endless)).toBe(false);
    expect(LAST_STAGE).toBe(STAGES[STAGES.length - 1]!.id);
  });

  it('目的を持たず、手数制限が実質無い', () => {
    const def = createEndlessStage(1234);
    expect(def.id).toBe(ENDLESS_ID);
    expect(def.endless).toBe(true);
    expect(def.objectives).toEqual([]);
    expect(def.moves).toBeGreaterThan(100000);
    expect(def.initialBoard).toBeUndefined();
    expect(def.fixedSets).toBeUndefined();
  });

  it('seed は 32bit の正の整数の範囲に収まる', () => {
    expect(newEndlessSeed(() => 0)).toBe(1);
    const big = newEndlessSeed(() => 0.9999999);
    expect(Number.isInteger(big)).toBe(true);
    expect(big).toBeGreaterThan(0);
    expect(big >>> 0).toBe(big);
  });
});

describe('endless: 進行と終了', () => {
  it('目的が 0 件でも開始直後にクリアしない', () => {
    const st = new StageState(createEndlessStage(2026));
    expect(st.status).toBe('playing');
    expect(st.isCleared()).toBe(false);
    expect(st.objectiveProgress()).toEqual([]);
  });

  it('ラインを何本消してもクリアにならない', () => {
    const { st } = playToEnd(2026);
    expect(st.score).toBeGreaterThan(0);
    expect(st.status).not.toBe('cleared');
    expect(st.isCleared()).toBe(false);
  });

  it('終わりは「どれも置けなくなったとき」だけ（手数切れでは終わらない）', () => {
    const { st, moves } = playToEnd(2026);
    expect(st.status).toBe('failed');
    expect(st.isStuck()).toBe(true);
    expect(st.moves).toBeGreaterThan(0); // 手数は残ったまま終わる
    expect(moves).toBeGreaterThan(3);
  });

  it('終わったあとは置けない（status が playing でなくなる）', () => {
    const { st } = playToEnd(2026);
    const out = st.place(0, 0, 0);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('not-playing');
  });

  it('同じ seed なら同じ展開になる（不具合を再現できる）', () => {
    const a = playToEnd(777);
    const b = playToEnd(777);
    expect(b.moves).toBe(a.moves);
    expect(b.st.score).toBe(a.st.score);
    expect(b.st.board.toStrings()).toEqual(a.st.board.toStrings());
  });

  it('seed が違えば展開も変わる', () => {
    const a = playToEnd(777);
    const b = playToEnd(778);
    expect(b.st.board.toStrings()).not.toEqual(a.st.board.toStrings());
  });

  it('通常ステージの判定は変わっていない（目的 0 件の扱いはエンドレス限定）', () => {
    const st = new StageState(STAGES[0]!);
    expect(st.def.endless).toBeUndefined();
    expect(st.isCleared()).toBe(false);
    expect(st.objectiveProgress().length).toBeGreaterThan(0);
  });
});
