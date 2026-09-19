import type { StageDef } from '../data/stages';

/**
 * エンドレスモード（工程 W-3）。
 *
 * **新しいルールを足さない。** 盤面・ピース生成・resolution・スコアは
 * 通常ステージとまったく同じものを使う。違いは次の 2 つだけ:
 *   1. 目的が無い（`objectives: []`）ので**クリアしない**
 *   2. 手数制限が実質無い（終わりは「どれも置けなくなったとき」だけ）
 *
 * 終了判定は StageState が既に持っている `isStuck()` をそのまま使う。
 * **同じ判定を別に書かない。** `updateStatus()` は配置 → resolution →
 * トレイ補充まで済んだ**安定した状態**で 1 回だけ呼ばれるので、
 * 「補充前の一瞬だけ置けない」状態を詰みと誤判定することがない。
 *
 * ステージ一覧（`STAGES`）には**入れない**。入れると `LAST_STAGE` が動き、
 * 全ステージクリアの判定と進行データの意味が変わってしまう。
 */

/** エンドレス専用のステージ番号。`STAGES` は 1 始まりなので衝突しない。 */
export const ENDLESS_ID = 0;

/** 手数制限が無いことを表す値。**HUD には数字ではなく ∞ を出す。** */
const ENDLESS_MOVES = Number.MAX_SAFE_INTEGER;

/**
 * 1 回ぶんのエンドレス。**毎回ちがう seed で作る**ので、同じ並びは繰り返さない。
 * seed を渡せば再現できる（テストと不具合の再現用）。
 */
export function createEndlessStage(seed: number): StageDef {
  return {
    id: ENDLESS_ID,
    name: 'エンドレス',
    endless: true,
    seed,
    moves: ENDLESS_MOVES,
    objectives: [],
    tutorial: {
      intro: 'おけなくなるまで つづきます。\nスコアを どこまで のばせるか ためしましょう。',
      showGuide: false,
    },
  };
}

/**
 * 新しい seed。**ロジック側で Math.random() を呼ばないため、ここだけに閉じる**
 * （src/game の他のコードは Rng 経由で seed から決まる）。
 */
export function newEndlessSeed(rand: () => number = Math.random): number {
  // Rng は seed を `>>> 0` で 32bit へ丸めるので、その範囲の正の整数にする。
  return 1 + Math.floor(rand() * 0xffffffe);
}
