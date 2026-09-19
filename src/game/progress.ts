import { FIRST_STAGE, LAST_STAGE } from '../data/stages';

/**
 * 進行状況の保存（工程 W-1）。
 *
 * **静的な Web ゲームなので localStorage だけを使う。**外部へ送らない。
 * 保存するのは「どこまで進んだか」だけで、**演出の途中経過は保存しない**
 * （解決中の盤面・attack の表示中か・timer・awaitingTeach・デバッグ状態）。
 * 再読み込みは必ず**ステージの開始状態**から始める。
 */

const KEY = 'blast-block:progress';
/** 保存形式の版。読めない版・壊れた値は既定値へ倒す。 */
const VERSION = 1;

export interface Progress {
  /** 次に遊ぶステージ。 */
  readonly current: number;
  /** クリア済みの最大ステージ。まだ 1 つもクリアしていなければ 0。 */
  readonly cleared: number;
}

export const DEFAULT_PROGRESS: Progress = { current: FIRST_STAGE, cleared: 0 };

/** ステージ番号として使える値へ丸める。 */
function clampStage(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : FIRST_STAGE;
  return Math.max(FIRST_STAGE, Math.min(LAST_STAGE, n));
}

/** クリア済み数へ丸める。0 は「まだ無い」。 */
function clampCleared(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  return Math.max(0, Math.min(LAST_STAGE, n));
}

/**
 * 保存値を読む。**どんな壊れ方をしても例外を投げず、既定値を返す。**
 * localStorage が使えない環境（プライベートモードなど）でも起動を止めない。
 */
export function loadProgress(storage?: Pick<Storage, 'getItem' | 'setItem'>): Progress {
  const store = storage ?? safeStorage();
  if (!store) return DEFAULT_PROGRESS;
  let raw: string | null = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return DEFAULT_PROGRESS;
  }
  if (!raw) return DEFAULT_PROGRESS;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return DEFAULT_PROGRESS;
    const o = data as Record<string, unknown>;
    if (o.version !== VERSION) return DEFAULT_PROGRESS;
    const cleared = clampCleared(o.cleared);
    // 「次に遊ぶ」は、クリア済みの次までしか進めない（飛び先を保存値で作らない）。
    const current = Math.min(clampStage(o.current), Math.min(LAST_STAGE, cleared + 1));
    return { current: Math.max(FIRST_STAGE, current), cleared };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

/** 保存する。失敗しても黙って諦める（進行は止めない）。 */
export function saveProgress(p: Progress, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  const store = storage ?? safeStorage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ version: VERSION, current: p.current, cleared: p.cleared }));
  } catch {
    /* 容量超過や書き込み禁止。進行は続ける。 */
  }
}

/** ステージをクリアしたときの新しい進行。**後戻りさせない。** */
export function withCleared(p: Progress, stageId: number): Progress {
  const id = clampStage(stageId);
  const cleared = Math.max(p.cleared, id);
  return { cleared, current: Math.min(LAST_STAGE, Math.max(p.current, id + 1)) };
}

/** ステージを開いたときの新しい進行。 */
export function withCurrent(p: Progress, stageId: number): Progress {
  return { ...p, current: clampStage(stageId) };
}

/** そのステージを遊べるか（クリア済みの次まで）。 */
export function isUnlocked(p: Progress, stageId: number): boolean {
  return stageId <= Math.min(LAST_STAGE, p.cleared + 1);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
