import { describe, expect, it } from 'vitest';
import { FIRST_STAGE, LAST_STAGE } from '../src/data/stages';
import {
  DEFAULT_PROGRESS,
  isUnlocked,
  loadProgress,
  saveProgress,
  withCleared,
  withCurrent,
} from '../src/game/progress';

/** localStorage の代わり。実ブラウザに依存せず保存・復元を確かめる。 */
function fakeStore(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('blast-block:progress', initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  };
}

describe('progress: 保存と復元', () => {
  it('保存が無ければ最初のステージから', () => {
    expect(loadProgress(fakeStore())).toEqual(DEFAULT_PROGRESS);
    expect(DEFAULT_PROGRESS).toEqual({ current: FIRST_STAGE, cleared: 0 });
  });

  it('保存した進行をそのまま読み戻せる', () => {
    const store = fakeStore();
    saveProgress({ current: 5, cleared: 4 }, store);
    expect(loadProgress(store)).toEqual({ current: 5, cleared: 4 });
  });

  it('クリアで cleared と current が進み、後戻りしない', () => {
    let p = DEFAULT_PROGRESS;
    p = withCleared(p, 1);
    expect(p).toEqual({ cleared: 1, current: 2 });
    p = withCleared(p, 2);
    expect(p).toEqual({ cleared: 2, current: 3 });
    // 昔のステージをもう一度クリアしても下がらない
    p = withCleared(p, 1);
    expect(p).toEqual({ cleared: 2, current: 3 });
  });

  it('最終ステージをクリアしても範囲外へ進まない', () => {
    const p = withCleared({ current: LAST_STAGE, cleared: LAST_STAGE - 1 }, LAST_STAGE);
    expect(p.cleared).toBe(LAST_STAGE);
    expect(p.current).toBe(LAST_STAGE);
  });

  it('未到達のステージは開かない', () => {
    const p = { current: 1, cleared: 3 };
    expect(isUnlocked(p, 3)).toBe(true);
    expect(isUnlocked(p, 4)).toBe(true); // クリア済みの次までは遊べる
    expect(isUnlocked(p, 5)).toBe(false);
  });

  it('withCurrent は範囲へ丸める', () => {
    expect(withCurrent(DEFAULT_PROGRESS, 999).current).toBe(LAST_STAGE);
    expect(withCurrent(DEFAULT_PROGRESS, -5).current).toBe(FIRST_STAGE);
  });
});

describe('progress: 壊れた保存値から安全に復旧する', () => {
  const broken = [
    'not json',
    'null',
    '[]',
    '{}',
    '{"version":999,"current":5,"cleared":4}',
    '{"version":1,"current":"x","cleared":"y"}',
    '{"version":1,"current":null,"cleared":null}',
    '{"version":1,"current":1e400,"cleared":1e400}',
    '{"version":1}',
  ];
  for (const raw of broken) {
    it(`起動不能にならない: ${raw.slice(0, 34)}`, () => {
      const p = loadProgress(fakeStore(raw));
      expect(p.current).toBeGreaterThanOrEqual(FIRST_STAGE);
      expect(p.current).toBeLessThanOrEqual(LAST_STAGE);
      expect(p.cleared).toBeGreaterThanOrEqual(0);
      expect(p.cleared).toBeLessThanOrEqual(LAST_STAGE);
    });
  }

  it('範囲外の値は丸められ、未クリアのステージへは飛ばない', () => {
    // cleared=0 なのに current=12 という値が入っていても、遊べるのは 1 まで。
    expect(loadProgress(fakeStore('{"version":1,"current":12,"cleared":0}'))).toEqual({
      current: FIRST_STAGE,
      cleared: 0,
    });
    expect(loadProgress(fakeStore('{"version":1,"current":99,"cleared":99}'))).toEqual({
      current: LAST_STAGE,
      cleared: LAST_STAGE,
    });
  });

  it('localStorage が使えなくても既定値で起動する', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadProgress(throwing)).toEqual(DEFAULT_PROGRESS);
    expect(() => saveProgress({ current: 3, cleared: 2 }, throwing)).not.toThrow();
  });
});
