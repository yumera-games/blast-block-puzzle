import { FIRST_STAGE, LAST_STAGE } from '../data/stages';
import type { StageDef } from '../data/stages';
import type { StageStatus } from './StageState';

/**
 * 通常ステージ（1〜12）の自己記録（工程 W-4）。
 *
 * **進行 `blast-block:progress` v1 / 音設定 `blast-block:settings` v1 /
 * 記録 `blast-block:stats` v1 は変更しない。**ステージごとの記録は別キーへ持つ。
 *
 * **進行と記録を混同しない。**
 *   進行（progress）＝どこまで開いたか。後戻りさせない。
 *   記録（records）  ＝各ステージをどれだけ上手くやれたか。解放状況には影響しない。
 *
 * 保存するのは**正規にクリアしたときの結果の数字だけ**で、失敗・途中離脱・
 * 盤面の途中状態・timer・attack の状態は保存しない（progress.ts と同じ方針）。
 */

const KEY = 'blast-block:records';
/** 保存形式の版。読めない版・壊れた値は既定値へ倒す。 */
const VERSION = 1;

/**
 * 記録値の上限。**保存値を書き換えられても表示が壊れないようにする。**
 * 実プレイで届く値より十分大きく、桁が増えても 320px のカードに収まる範囲にした。
 */
export const LIMITS = {
  score: 9_999_999,
  movesUsed: 9_999,
  maxChain: 999,
  clearCount: 99_999,
} as const;

export interface StageRecord {
  /** 最高スコア。 */
  readonly bestScore: number;
  /** 最少使用手数。**小さいほど良い。** */
  readonly bestMovesUsed: number;
  /** 最大 CHAIN。 */
  readonly bestMaxChain: number;
  /** クリア回数。1 以上（0 の記録は「未クリア」として持たない）。 */
  readonly clearCount: number;
}

export interface Records {
  /** ステージ番号 → 記録。**未クリアのステージはキーを持たない。** */
  readonly stages: Readonly<Record<number, StageRecord>>;
}

export const EMPTY_RECORDS: Records = { stages: {} };

/** 1 回のクリア結果。StageState から読む値だけで足りる。 */
export interface ClearResult {
  readonly score: number;
  readonly movesUsed: number;
  readonly maxChain: number;
}

/** どの項目が更新されたか。**項目ごとに独立して判定する。** */
export interface RecordUpdate {
  readonly score: boolean;
  readonly movesUsed: boolean;
  readonly maxChain: boolean;
}

export const NO_UPDATE: RecordUpdate = { score: false, movesUsed: false, maxChain: false };

export function hasUpdate(u: RecordUpdate): boolean {
  return u.score || u.movesUsed || u.maxChain;
}

/** 記録として扱えるステージ番号か。**1〜12 以外は記録しない。** */
export function isStageId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id >= FIRST_STAGE && id <= LAST_STAGE;
}

/**
 * 記録を更新してよい結果か。
 * **通常ステージを正規にクリアしたときだけ。** エンドレス・失敗・進行中では更新しない。
 */
export function shouldRecordClear(def: Pick<StageDef, 'id' | 'endless'>, status: StageStatus): boolean {
  if (def.endless) return false;
  if (status !== 'cleared') return false;
  return isStageId(def.id);
}

/** そのステージの記録。まだ無ければ null（**0 の記録を作らない**）。 */
export function recordFor(r: Records, id: number): StageRecord | null {
  return r.stages[id] ?? null;
}

/**
 * クリア 1 回ぶんを反映した新しい記録。
 * **各項目は独立して更新する。**1 回のクリアで複数項目が同時に更新されてよい。
 * 初回クリアは 3 項目とも新記録として扱う。
 */
export function withClear(r: Records, id: number, result: ClearResult): { records: Records; update: RecordUpdate } {
  if (!isStageId(id)) return { records: r, update: NO_UPDATE };
  const score = clamp(result.score, 0, LIMITS.score);
  const movesUsed = clamp(result.movesUsed, 0, LIMITS.movesUsed);
  const maxChain = clamp(result.maxChain, 0, LIMITS.maxChain);

  const prev = r.stages[id];
  if (!prev) {
    const next: StageRecord = { bestScore: score, bestMovesUsed: movesUsed, bestMaxChain: maxChain, clearCount: 1 };
    return {
      records: { stages: { ...r.stages, [id]: next } },
      update: { score: true, movesUsed: true, maxChain: true },
    };
  }

  const update: RecordUpdate = {
    score: score > prev.bestScore,
    // **手数は少ないほど良い。**同じ手数は更新としない（記録は後戻りも同点扱いもしない）。
    movesUsed: movesUsed < prev.bestMovesUsed,
    maxChain: maxChain > prev.bestMaxChain,
  };
  const next: StageRecord = {
    bestScore: Math.max(prev.bestScore, score),
    bestMovesUsed: Math.min(prev.bestMovesUsed, movesUsed),
    bestMaxChain: Math.max(prev.bestMaxChain, maxChain),
    clearCount: Math.min(LIMITS.clearCount, prev.clearCount + 1),
  };
  return { records: { stages: { ...r.stages, [id]: next } }, update };
}

/** 読む。**どんな壊れ方をしても例外を投げず、既定値を返す。** */
export function loadRecords(storage?: Pick<Storage, 'getItem' | 'setItem'>): Records {
  const store = storage ?? safeStorage();
  if (!store) return EMPTY_RECORDS;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return EMPTY_RECORDS;
    const data: unknown = JSON.parse(raw);
    if (!isPlainObject(data)) return EMPTY_RECORDS;
    if (data.version !== VERSION) return EMPTY_RECORDS;
    const stagesRaw = data.stages;
    if (!isPlainObject(stagesRaw)) return EMPTY_RECORDS;

    const stages: Record<number, StageRecord> = {};
    for (const [key, value] of Object.entries(stagesRaw)) {
      const id = Number(key);
      // **1〜12 以外のキーは捨てる。**保存値からステージ番号を増やさない。
      if (!isStageId(id)) continue;
      const rec = sanitize(value);
      if (rec) stages[id] = rec;
    }
    return { stages };
  } catch {
    return EMPTY_RECORDS;
  }
}

/** 書く。失敗しても黙って諦める（進行は止めない）。 */
export function saveRecords(r: Records, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  const store = storage ?? safeStorage();
  if (!store) return;
  const stages: Record<string, StageRecord> = {};
  for (const [key, value] of Object.entries(r.stages)) {
    const id = Number(key);
    if (!isStageId(id) || !value) continue;
    stages[String(id)] = value;
  }
  try {
    store.setItem(KEY, JSON.stringify({ version: VERSION, stages }));
  } catch {
    /* 容量超過や書き込み禁止。プレイは続ける。 */
  }
}

/**
 * 1 ステージぶんの保存値を安全な記録へ直す。**直せなければ null（未クリア扱い）。**
 *
 * `bestMovesUsed` だけは 0 側へ倒さない。**0 手のクリアは実プレイで起きえず、
 * 二度と更新できない記録になってしまう**ので、壊れていれば上限（最悪値）にする。
 */
function sanitize(value: unknown): StageRecord | null {
  if (!isPlainObject(value)) return null;
  const clearCount = clamp(value.clearCount, 0, LIMITS.clearCount);
  // クリア回数が 1 以上でなければ記録として持たない（0 の記録を作らない）。
  if (clearCount < 1) return null;
  const movesRaw = clamp(value.bestMovesUsed, 0, LIMITS.movesUsed);
  return {
    bestScore: clamp(value.bestScore, 0, LIMITS.score),
    bestMovesUsed: movesRaw >= 1 ? movesRaw : LIMITS.movesUsed,
    bestMaxChain: clamp(value.bestMaxChain, 0, LIMITS.maxChain),
    clearCount,
  };
}

/** 数として使える値へ丸める。**非数・小数・負数・Infinity をここで吸収する。** */
function clamp(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
