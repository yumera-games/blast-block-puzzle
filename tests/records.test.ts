import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECORDS,
  LIMITS,
  hasUpdate,
  isStageId,
  loadRecords,
  recordFor,
  saveRecords,
  shouldRecordClear,
  withClear,
  type Records,
} from '../src/game/records';
import { FIRST_STAGE, LAST_STAGE } from '../src/data/stages';

/** localStorage の代わり。実ブラウザに依存せず保存・復元を確かめる。 */
function fakeStore(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('blast-block:records', initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  };
}

const clear = (score: number, movesUsed: number, maxChain: number) => ({ score, movesUsed, maxChain });

describe('records: 未記録と初回クリア', () => {
  it('未クリアのステージは記録を持たない（0 の記録を作らない）', () => {
    expect(recordFor(EMPTY_RECORDS, 1)).toBeNull();
    expect(EMPTY_RECORDS.stages).toEqual({});
  });

  it('初回クリアは 3 項目とも新記録になる', () => {
    const { records, update } = withClear(EMPTY_RECORDS, 1, clear(500, 4, 2));
    expect(recordFor(records, 1)).toEqual({
      bestScore: 500,
      bestMovesUsed: 4,
      bestMaxChain: 2,
      clearCount: 1,
    });
    expect(update).toEqual({ score: true, movesUsed: true, maxChain: true });
    expect(hasUpdate(update)).toBe(true);
  });
});

describe('records: 項目ごとの更新', () => {
  const base = withClear(EMPTY_RECORDS, 1, clear(500, 4, 2)).records;

  it('高いスコアで bestScore が更新される', () => {
    const { records, update } = withClear(base, 1, clear(700, 5, 1));
    expect(recordFor(records, 1)!.bestScore).toBe(700);
    expect(update.score).toBe(true);
  });

  it('低いスコアでは bestScore が維持される', () => {
    const { records, update } = withClear(base, 1, clear(200, 5, 1));
    expect(recordFor(records, 1)!.bestScore).toBe(500);
    expect(update.score).toBe(false);
  });

  it('少ない手数で bestMovesUsed が更新される', () => {
    const { records, update } = withClear(base, 1, clear(100, 3, 1));
    expect(recordFor(records, 1)!.bestMovesUsed).toBe(3);
    expect(update.movesUsed).toBe(true);
  });

  it('多い手数では bestMovesUsed が維持され、同じ手数も更新としない', () => {
    expect(withClear(base, 1, clear(100, 9, 1)).records.stages[1]!.bestMovesUsed).toBe(4);
    expect(withClear(base, 1, clear(100, 9, 1)).update.movesUsed).toBe(false);
    expect(withClear(base, 1, clear(100, 4, 1)).update.movesUsed).toBe(false);
  });

  it('大きい CHAIN で bestMaxChain が更新される', () => {
    const { records, update } = withClear(base, 1, clear(100, 9, 5));
    expect(recordFor(records, 1)!.bestMaxChain).toBe(5);
    expect(update.maxChain).toBe(true);
  });

  it('小さい CHAIN では bestMaxChain が維持される', () => {
    const { records, update } = withClear(base, 1, clear(100, 9, 1));
    expect(recordFor(records, 1)!.bestMaxChain).toBe(2);
    expect(update.maxChain).toBe(false);
  });

  it('1 回のクリアで複数項目が同時に更新されてよい（指示の例）', () => {
    // 前回 SCORE 500 / MOVES USED 4 / MAX CHAIN 2、今回 450 / 3 / 3
    const { records, update } = withClear(base, 1, clear(450, 3, 3));
    expect(recordFor(records, 1)).toEqual({
      bestScore: 500,
      bestMovesUsed: 3,
      bestMaxChain: 3,
      clearCount: 2,
    });
    expect(update).toEqual({ score: false, movesUsed: true, maxChain: true });
  });

  it('clearCount はクリア 1 回につき 1 だけ増える', () => {
    let r: Records = EMPTY_RECORDS;
    for (let i = 0; i < 3; i++) r = withClear(r, 1, clear(10, 9, 1)).records;
    expect(recordFor(r, 1)!.clearCount).toBe(3);
  });

  it('同じ結果から作り直しても元の記録は変わらない（再描画で増えない）', () => {
    // 同じ入力から 2 回作っても、**元の `base` は書き換わらない**。
    // 画面側は「クリア確定の 1 か所」でだけ呼ぶので、再描画では増えない。
    const a = withClear(base, 1, clear(700, 3, 4));
    const b = withClear(base, 1, clear(700, 3, 4));
    expect(a.records.stages[1]!.clearCount).toBe(2);
    expect(b.records.stages[1]!.clearCount).toBe(2);
    expect(recordFor(base, 1)!.clearCount).toBe(1);
  });

  it('ステージごとに独立している', () => {
    const r = withClear(withClear(EMPTY_RECORDS, 1, clear(500, 4, 2)).records, 2, clear(100, 9, 1)).records;
    expect(recordFor(r, 1)!.bestScore).toBe(500);
    expect(recordFor(r, 2)!.bestScore).toBe(100);
    expect(recordFor(r, 3)).toBeNull();
  });

  it('1〜12 以外のステージ番号は記録しない', () => {
    expect(withClear(EMPTY_RECORDS, 0, clear(999, 1, 1)).records.stages).toEqual({});
    expect(withClear(EMPTY_RECORDS, 13, clear(999, 1, 1)).records.stages).toEqual({});
    expect(withClear(EMPTY_RECORDS, 1.5, clear(999, 1, 1)).records.stages).toEqual({});
    expect(isStageId(FIRST_STAGE)).toBe(true);
    expect(isStageId(LAST_STAGE)).toBe(true);
    expect(isStageId(LAST_STAGE + 1)).toBe(false);
  });

  it('記録値は上限で頭打ちになる（保存値の改変で表示が壊れない）', () => {
    const { records } = withClear(EMPTY_RECORDS, 1, clear(1e12, 1e12, 1e12));
    expect(recordFor(records, 1)).toEqual({
      bestScore: LIMITS.score,
      bestMovesUsed: LIMITS.movesUsed,
      bestMaxChain: LIMITS.maxChain,
      clearCount: 1,
    });
  });
});

describe('records: 更新してよい結果か', () => {
  it('通常ステージの正規クリアだけ記録する', () => {
    expect(shouldRecordClear({ id: 1 }, 'cleared')).toBe(true);
    expect(shouldRecordClear({ id: 12 }, 'cleared')).toBe(true);
  });

  it('FAILED では記録しない', () => {
    expect(shouldRecordClear({ id: 1 }, 'failed')).toBe(false);
    expect(shouldRecordClear({ id: 1 }, 'playing')).toBe(false);
  });

  it('エンドレスでは記録しない', () => {
    expect(shouldRecordClear({ id: 0, endless: true }, 'cleared')).toBe(false);
    expect(shouldRecordClear({ id: 0, endless: true }, 'failed')).toBe(false);
  });

  it('1〜12 以外のステージでは記録しない', () => {
    expect(shouldRecordClear({ id: 0 }, 'cleared')).toBe(false);
    expect(shouldRecordClear({ id: 99 }, 'cleared')).toBe(false);
  });
});

describe('records: 保存と復元', () => {
  it('保存した記録をそのまま読み戻せる', () => {
    const store = fakeStore();
    const r = withClear(EMPTY_RECORDS, 3, clear(480, 5, 2)).records;
    saveRecords(r, store);
    expect(loadRecords(store)).toEqual(r);
  });

  it('**進行・音設定・stats のキーには書かない**', () => {
    const store = fakeStore();
    saveRecords(withClear(EMPTY_RECORDS, 1, clear(1, 1, 1)).records, store);
    expect([...store.raw.keys()]).toEqual(['blast-block:records']);
  });

  it('壊れた JSON でも例外を投げず既定値', () => {
    expect(loadRecords(fakeStore('{{{ broken'))).toEqual(EMPTY_RECORDS);
  });

  it('知らない版は既定値へ倒す', () => {
    const raw = JSON.stringify({ version: 2, stages: { 1: { bestScore: 9, clearCount: 1 } } });
    expect(loadRecords(fakeStore(raw))).toEqual(EMPTY_RECORDS);
  });

  it('stages が配列・文字列など型違いでも既定値', () => {
    expect(loadRecords(fakeStore(JSON.stringify({ version: 1, stages: [1, 2] })))).toEqual(EMPTY_RECORDS);
    expect(loadRecords(fakeStore(JSON.stringify({ version: 1, stages: 'x' })))).toEqual(EMPTY_RECORDS);
    expect(loadRecords(fakeStore(JSON.stringify([1, 2, 3])))).toEqual(EMPTY_RECORDS);
  });

  it('1〜12 以外のキーは捨てる', () => {
    const raw = JSON.stringify({
      version: 1,
      stages: {
        0: { bestScore: 1, bestMovesUsed: 1, bestMaxChain: 1, clearCount: 1 },
        13: { bestScore: 1, bestMovesUsed: 1, bestMaxChain: 1, clearCount: 1 },
        x: { bestScore: 1, bestMovesUsed: 1, bestMaxChain: 1, clearCount: 1 },
        7: { bestScore: 70, bestMovesUsed: 3, bestMaxChain: 2, clearCount: 1 },
      },
    });
    const r = loadRecords(fakeStore(raw));
    expect(Object.keys(r.stages)).toEqual(['7']);
  });

  it('負数・小数・NaN・Infinity・型違いを安全な値へ直す', () => {
    const raw = JSON.stringify({
      version: 1,
      stages: {
        1: { bestScore: -50, bestMovesUsed: 3.9, bestMaxChain: 'x', clearCount: 2.7 },
        2: { bestScore: 1e300, bestMovesUsed: null, bestMaxChain: -3, clearCount: 1 },
        3: 'not an object',
        4: [1, 2, 3],
      },
    });
    const r = loadRecords(fakeStore(raw));
    expect(r.stages[1]).toEqual({ bestScore: 0, bestMovesUsed: 3, bestMaxChain: 0, clearCount: 2 });
    // **0 手のクリアは実プレイで起きない。**二度と更新できない記録にしないため上限へ倒す。
    expect(r.stages[2]).toEqual({
      bestScore: LIMITS.score,
      bestMovesUsed: LIMITS.movesUsed,
      bestMaxChain: 0,
      clearCount: 1,
    });
    expect(r.stages[3]).toBeUndefined();
    expect(r.stages[4]).toBeUndefined();
  });

  it('clearCount が 1 未満の記録は持たない', () => {
    const raw = JSON.stringify({ version: 1, stages: { 1: { bestScore: 10, clearCount: 0 } } });
    expect(loadRecords(fakeStore(raw)).stages).toEqual({});
  });

  it('壊れた記録のあとでも、その場から普通に記録できる', () => {
    const r = loadRecords(fakeStore(JSON.stringify({ version: 1, stages: { 1: { bestMovesUsed: 0, clearCount: 1 } } })));
    const next = withClear(r, 1, clear(300, 4, 2));
    expect(next.records.stages[1]!.bestMovesUsed).toBe(4);
    expect(next.update.movesUsed).toBe(true);
  });

  it('localStorage が例外を投げても起動を止めない', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadRecords(broken)).toEqual(EMPTY_RECORDS);
    expect(() => saveRecords(EMPTY_RECORDS, broken)).not.toThrow();
  });
});
