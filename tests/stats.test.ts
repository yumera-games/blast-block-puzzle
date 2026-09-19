import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATS,
  loadStats,
  saveStats,
  withAllClear,
  withEndlessRun,
} from '../src/game/stats';

/** localStorage の代わり。実ブラウザに依存せず保存・復元を確かめる。 */
function fakeStore(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('blast-block:stats', initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  };
}

describe('stats: 保存と復元', () => {
  it('保存が無ければすべて 0', () => {
    expect(loadStats(fakeStore())).toEqual(DEFAULT_STATS);
    expect(DEFAULT_STATS).toEqual({ endlessBest: 0, endlessRuns: 0, allClearCount: 0 });
  });

  it('保存した記録をそのまま読み戻せる', () => {
    const store = fakeStore();
    saveStats({ endlessBest: 1234, endlessRuns: 7, allClearCount: 2 }, store);
    expect(loadStats(store)).toEqual({ endlessBest: 1234, endlessRuns: 7, allClearCount: 2 });
  });

  it('**進行データと音設定のキーには書かない**', () => {
    const store = fakeStore();
    saveStats({ endlessBest: 10, endlessRuns: 1, allClearCount: 0 }, store);
    expect([...store.raw.keys()]).toEqual(['blast-block:stats']);
  });

  it('壊れた JSON でも例外を投げず既定値', () => {
    expect(loadStats(fakeStore('{{{ broken'))).toEqual(DEFAULT_STATS);
  });

  it('知らない版は既定値へ倒す', () => {
    expect(loadStats(fakeStore(JSON.stringify({ version: 2, endlessBest: 999 })))).toEqual(DEFAULT_STATS);
  });

  it('負の数・小数・非数は 0 側へ丸める', () => {
    const raw = JSON.stringify({
      version: 1,
      endlessBest: -5,
      endlessRuns: 3.9,
      allClearCount: 'x',
    });
    expect(loadStats(fakeStore(raw))).toEqual({ endlessBest: 0, endlessRuns: 3, allClearCount: 0 });
  });

  it('保存に失敗しても投げない（容量超過や書き込み禁止）', () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => saveStats({ endlessBest: 1, endlessRuns: 1, allClearCount: 1 }, store)).not.toThrow();
  });

  it('storage が無くても既定値を返し、投げない', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(loadStats(broken)).toEqual(DEFAULT_STATS);
  });
});

describe('stats: エンドレスの記録', () => {
  it('1 回遊ぶごとに回数が増え、最高スコアが更新される', () => {
    let s = DEFAULT_STATS;
    let r = withEndlessRun(s, 120);
    s = r.stats;
    expect(r.record).toBe(true);
    expect(s).toEqual({ endlessBest: 120, endlessRuns: 1, allClearCount: 0 });

    r = withEndlessRun(s, 90);
    s = r.stats;
    expect(r.record).toBe(false);
    expect(s).toEqual({ endlessBest: 120, endlessRuns: 2, allClearCount: 0 });
  });

  it('同点は更新としない（記録は後戻りも同点扱いもしない）', () => {
    const first = withEndlessRun(DEFAULT_STATS, 500);
    const same = withEndlessRun(first.stats, 500);
    expect(same.record).toBe(false);
    expect(same.stats.endlessBest).toBe(500);
    expect(same.stats.endlessRuns).toBe(2);
  });

  it('0 点で終わっても回数は数える', () => {
    const r = withEndlessRun(DEFAULT_STATS, 0);
    expect(r.record).toBe(false);
    expect(r.stats.endlessRuns).toBe(1);
    expect(r.stats.endlessBest).toBe(0);
  });

  it('全クリアの回数は別枠で増え、エンドレスの記録に触れない', () => {
    const base = withEndlessRun(DEFAULT_STATS, 300).stats;
    const s = withAllClear(withAllClear(base));
    expect(s).toEqual({ endlessBest: 300, endlessRuns: 1, allClearCount: 2 });
  });
});
