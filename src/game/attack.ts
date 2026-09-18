import { isComboEffect } from '../data/combos';
import type { ResolutionResult } from './types';

/**
 * ネイの attack 表示の規則（2B 7-5-9 ／ 工程 V-3）。
 *
 * **時間もサイズも位置も、ここ 1 か所だけが決める。**
 * GameScene は「いつ呼ぶか」だけを持ち、値を組み立て直さない。
 */

/**
 * 表示を始める時刻の**仕様値**（2B 7-5-9 の 3）。
 * 実装は「波 1 の `showLines` の直後」に呼ぶことで実現しており、
 * その波の開始は `GameScene` の `TIMING.snap` が決める。
 * **両者が同じ値であることは実ブラウザの計測（tools/smoke.mjs ⑨）で確かめる。**
 * ここに 90 を書き写しているのは仕様の記録であって、実装の入力ではない。
 */
export const ATTACK_START_MS = 90;
/** 表示時間。2B 7-5-9 の 3 で確定。**既存 TIMING とは独立**。 */
export const ATTACK_DURATION_MS = 400;
/** 波 2 の `showLines` の時刻（`TIMING` から導かれる既存値）。attack はこれより前に終わる。 */
export const WAVE2_MS = 550;

/**
 * 表示を終える時刻。**波 2 に依存させず、開始時刻＋表示時間で独立に決める。**
 * `GameScene` は `attackEndMs(TIMING.snap)` を渡すので、
 * `TIMING.snap` が動いても「波 1 と同時に始まり 400ms で終わる」関係は崩れない。
 */
export function attackEndMs(startMs: number): number {
  return startMs + ATTACK_DURATION_MS;
}

/** 人物 α 外接に対する画布の比。正本は 1596x2592 の画布に 1404x2400 の外接（四辺 96px）。 */
const MASTER_CANVAS_W = 1596;
const MASTER_CANVAS_H = 2592;
const MASTER_BBOX_W = 1404;
const MASTER_BBOX_H = 2400;
const MASTER_MARGIN = 96;

/** 盤面の一辺に対する外接高の比（2B 7-5-8 の「大」）。 */
const HEIGHT_RATIO = 0.63;
/** 盤面の右端・下端から内側へ寄せる量（cell 比。2B 7-5-9 の P-1）。 */
const INSET_RATIO = 0.25;

/** round-half-up。**正の値にだけ使う。**`Math.round` の丸め方を明示するために置く。 */
function roundHalfUp(v: number): number {
  return Math.floor(v + 0.5);
}

/**
 * この手で attack を出すか。
 *
 * **判定は `Detonation.effect` を `isComboEffect()` に通した結果だけ**（2B 7-5-9 の 4）。
 * 表示文字列や `comboName()` の戻り値で判定しない。`group.length` でも判定しない
 * （両者が一致することはテストで押さえる）。
 * **1 手につき最大 1 回**なので、1 件でも見つかった時点で true を返す。
 */
export function hasCombo(result: ResolutionResult | null | undefined): boolean {
  if (!result) return false;
  for (const ev of result.events) {
    for (const d of ev.detonations) {
      if (isComboEffect(d.effect)) return true;
    }
  }
  return false;
}

/** 人物 α 外接の矩形（CSS px）。 */
export interface AttackBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface AttackPlacement {
  /** 人物 α 外接。**整数**（幅と高さだけを丸める）。 */
  readonly bbox: AttackBounds;
  /** img 要素の矩形。**小数 CSS px のまま**。透明余白を含む。 */
  readonly img: AttackBounds;
  /** 等方倍率。縦横で別の倍率を使わない。 */
  readonly scale: number;
}

/**
 * attack 開始時に 1 回だけ呼ぶ。**表示中は呼び直さない。**
 *
 * 盤面は正方なので一辺 `boardSide` だけを受け取る。
 * **大きさも位置も、この 1 つの盤面辺から決まる**（工程 V-3 の【甲】）。
 * viewport ごとの表引きや分岐は持たない。中間幅でも同じ式で一意に決まる。
 */
export function attackPlacement(boardLeft: number, boardTop: number, boardSide: number): AttackPlacement {
  const cell = boardSide / 8;
  const height = roundHalfUp(boardSide * HEIGHT_RATIO);
  const width = roundHalfUp((height * MASTER_BBOX_W) / MASTER_BBOX_H);
  const inset = roundHalfUp(cell * INSET_RATIO);

  const right = boardLeft + boardSide - inset;
  const bottom = boardTop + boardSide - inset;
  const left = right - width;
  const top = bottom - height;

  const scale = height / MASTER_BBOX_H;
  return {
    bbox: { left, top, width, height },
    img: {
      left: left - MASTER_MARGIN * scale,
      top: top - MASTER_MARGIN * scale,
      width: MASTER_CANVAS_W * scale,
      height: MASTER_CANVAS_H * scale,
    },
    scale,
  };
}
