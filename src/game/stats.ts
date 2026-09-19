/**
 * プレイ記録（工程 W-3）。
 *
 * **進行（`blast-block:progress`）と音設定（`blast-block:settings`）は変更しない。**
 * どちらも v1 のまま据え置き、記録は**別キー**へ独立して持つ。
 * そうしておけば、記録の項目が増えても進行データの版を上げずに済む。
 *
 * 保存するのは「結果の数字」だけで、**盤面・演出・途中経過は保存しない**
 * （progress.ts と同じ方針）。外部へは送らない。
 */

const KEY = 'blast-block:stats';
/** 保存形式の版。読めない版・壊れた値は既定値へ倒す。 */
const VERSION = 1;

export interface Stats {
  /** エンドレスの最高スコア。まだ遊んでいなければ 0。 */
  readonly endlessBest: number;
  /** エンドレスを**最後（置けなくなるまで）まで**遊んだ回数。途中でやめた回は数えない。 */
  readonly endlessRuns: number;
  /** 全ステージをクリアした回数。 */
  readonly allClearCount: number;
}

export const DEFAULT_STATS: Stats = { endlessBest: 0, endlessRuns: 0, allClearCount: 0 };

/** 記録に使える値へ丸める。**負の数・小数・非数はすべて 0 側へ倒す。** */
function clampCount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

/** 読む。**どんな壊れ方をしても例外を投げず、既定値を返す。** */
export function loadStats(storage?: Pick<Storage, 'getItem' | 'setItem'>): Stats {
  const store = storage ?? safeStorage();
  if (!store) return DEFAULT_STATS;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return DEFAULT_STATS;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_STATS;
    const o = data as Record<string, unknown>;
    if (o.version !== VERSION) return DEFAULT_STATS;
    return {
      endlessBest: clampCount(o.endlessBest),
      endlessRuns: clampCount(o.endlessRuns),
      allClearCount: clampCount(o.allClearCount),
    };
  } catch {
    return DEFAULT_STATS;
  }
}

/** 書く。失敗しても黙って諦める（進行は止めない）。 */
export function saveStats(s: Stats, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  const store = storage ?? safeStorage();
  if (!store) return;
  try {
    store.setItem(
      KEY,
      JSON.stringify({
        version: VERSION,
        endlessBest: clampCount(s.endlessBest),
        endlessRuns: clampCount(s.endlessRuns),
        allClearCount: clampCount(s.allClearCount),
      }),
    );
  } catch {
    /* 容量超過や書き込み禁止。プレイは続ける。 */
  }
}

/**
 * エンドレスを 1 回遊び終えたときの新しい記録。
 * `record` は**この回で最高記録を更新したか**。同点は更新としない（記録は後戻りしない）。
 */
export function withEndlessRun(s: Stats, score: number): { stats: Stats; record: boolean } {
  const v = clampCount(score);
  const record = v > s.endlessBest;
  return {
    stats: { ...s, endlessBest: Math.max(s.endlessBest, v), endlessRuns: s.endlessRuns + 1 },
    record,
  };
}

/** 全ステージクリアに到達したときの新しい記録。 */
export function withAllClear(s: Stats): Stats {
  return { ...s, allClearCount: s.allClearCount + 1 };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
