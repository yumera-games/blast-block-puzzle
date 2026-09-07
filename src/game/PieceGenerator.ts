import { BALANCE } from '../data/balance';
import { PIECE_SHAPES } from '../data/pieces';
import type { Board } from './Board';
import { createPiece, pieceFromSpec } from './Piece';
import { Rng } from './Rng';
import { COLORS, type Piece, type PieceSpec, type SetEvaluation } from './types';

/**
 * 候補ピースの生成。
 *
 * 方針:
 *  - 完全ランダムだけにはしない。Safe / Risky / Dead を評価できるようにする。
 *  - 通常生成では Dead セット（提示直後から進行不能）を避ける。
 *  - ただし**「必ずクリアできるピース」を配る救済AIにはしない**。
 *    避けるのは Dead だけで、Risky はそのまま出す。
 *  - seed 付き疑似乱数を使い、同じ seed なら同じ候補列を再現できる。
 */
export class PieceGenerator {
  private readonly rng: Rng;
  private readonly fixedSets: readonly (readonly PieceSpec[])[];
  private setIndex = 0;
  private lastEvaluation: SetEvaluation = 'safe';
  private lastRetries = 0;

  constructor(seed: number, fixedSets: readonly (readonly PieceSpec[])[] = []) {
    this.rng = new Rng(seed);
    this.fixedSets = fixedSets;
  }

  get seed(): number {
    return this.rng.seed;
  }
  /** これまでに配ったセット数。 */
  get sets(): number {
    return this.setIndex;
  }
  get evaluation(): SetEvaluation {
    return this.lastEvaluation;
  }
  get retries(): number {
    return this.lastRetries;
  }

  /**
   * 次の3個を配る。
   * ステージデータで固定 piece 列が指定されていれば、その順に使い切ってから乱数へ移る。
   */
  next(board: Board): Piece[] {
    const fixed = this.fixedSets[this.setIndex];
    if (fixed) {
      this.setIndex++;
      const pieces = fixed.map(pieceFromSpec);
      this.lastEvaluation = evaluateSet(board, pieces);
      this.lastRetries = 0;
      return pieces;
    }

    this.setIndex++;
    const size = BALANCE.tray.size;

    // 盤面に空きが1つも無ければ、何を配っても Dead。再抽選しても無駄なので即返す。
    const hasSpace = board.countFilled() < board.size;

    let candidate: Piece[] = [];
    let evaluation: SetEvaluation = 'dead';
    let tries = 0;
    for (; tries <= BALANCE.tray.deadRetries; tries++) {
      candidate = [];
      for (let i = 0; i < size; i++) {
        const shape = this.rng.weighted(PIECE_SHAPES);
        const color = this.rng.pick(COLORS);
        candidate.push(createPiece(shape, color));
      }
      evaluation = evaluateSet(board, candidate);
      if (!hasSpace || evaluation !== 'dead') break;
    }
    this.lastEvaluation = evaluation;
    this.lastRetries = tries;
    return candidate;
  }
}

/**
 * 提示セットの評価。
 *   safe  … 3個すべてに合法配置が1か所以上ある
 *   risky … 一部だけ置ける
 *   dead  … 1個も置けない（提示直後から進行不能）
 */
export function evaluateSet(board: Board, pieces: readonly Piece[]): SetEvaluation {
  if (pieces.length === 0) return 'dead';
  let placeable = 0;
  for (const p of pieces) if (board.hasAnyPlacement(p.shape.cells)) placeable++;
  if (placeable === pieces.length) return 'safe';
  if (placeable === 0) return 'dead';
  return 'risky';
}

/** 残っている候補のどれも置けない＝詰み。 */
export function isStuck(board: Board, remaining: readonly Piece[]): boolean {
  if (remaining.length === 0) return false;
  return remaining.every((p) => !board.hasAnyPlacement(p.shape.cells));
}
