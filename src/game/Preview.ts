import type { Board } from './Board';
import { canPlacePiece, placePiece } from './Piece';
import { resolveBoard } from './Resolver';
import { detonate } from './Specials';
import { isSpecialKind, type Piece, type ResolutionEvent } from './types';

/**
 * ドラッグ中の予告。**盤面もゲーム状態も一切変更しない。**
 *
 * 非破壊であることの担保:
 *   1. 受け取った board を clone してからしか触らない
 *   2. resolveBoard の nextUid を省略すると clone 自身の maxUid から採番されるので、
 *      本番の uid 採番（StageState.uidSeq）を消費しない
 *   3. piece は既にトレイにあるものを読むだけ。createPiece を呼ばないので piece uid も進まない
 *   4. PieceGenerator に触らないので RNG もトレイ順も動かない
 *
 * **combo 判定はここで書き直さない。** 実際の resolveBoard を clone 上で回し、
 * その結果（Detonation.effect / group）を読むだけなので、
 * Phase 2A の groupByEffectReach() と必ず同じ規則になる。
 */
export interface PreviewResult {
  /** この配置で完成する行・列のセル。 */
  readonly lineCells: readonly number[];
  /** 最初に起爆する特殊の位置（消去に巻きこまれて起爆待ちになるもの）。 */
  readonly triggerCells: readonly number[];
  /** その特殊が単独で起爆したときに効果が届く範囲。 */
  readonly reachCells: readonly number[];
  /** その範囲に入っていて combo へ取り込まれる特殊の位置。 */
  readonly comboCells: readonly number[];
  /** 予測される combo の effect。単独起爆なら null。 */
  readonly effect: string | null;
}

const EMPTY: PreviewResult = {
  lineCells: [], triggerCells: [], reachCells: [], comboCells: [], effect: null,
};

/**
 * 置けない場所なら null（＝予告を出さない）。
 * 置ける場合は、その配置で何が起きるかの要約を返す。
 */
export function previewPlacement(
  board: Board,
  piece: Piece,
  row: number,
  col: number,
): PreviewResult | null {
  if (!canPlacePiece(board, piece, row, col)) return null;

  const sim = board.clone();
  const placed = placePiece(sim, piece, row, col);
  const result = resolveBoard(sim, { placedCells: placed, placedColor: piece.color });
  if (result.events.length === 0) return EMPTY;

  const first = result.events[0]!;
  const lineCells: number[] = [];
  for (const line of first.lines) lineCells.push(...sim.lineIndices(line));

  // 最初に起爆が起きる wave を探す。無ければライン表示だけ返す。
  const waveIndex = result.events.findIndex((e) => e.detonations.length > 0);
  if (waveIndex < 0) return { ...EMPTY, lineCells };

  const wave = result.events[waveIndex]!;
  const group = wave.detonations[0]!.group;

  // その wave で「起爆待ちだった」uid ＝ 直前の wave の消去に巻きこまれた特殊。
  // 起爆待ちでなかったメンバーが「効果で取り込まれた側」になる。
  const pending = pendingUids(result.events[waveIndex - 1]);
  const triggerCells: number[] = [];
  const comboCells: number[] = [];
  for (const s of group) (pending.has(s.uid) ? triggerCells : comboCells).push(s.index);

  // 起点の単独効果＝「なぜ届くのか」。combo 後の合成範囲ではなく単独範囲を出す。
  const seed = group.find((s) => pending.has(s.uid)) ?? group[0]!;
  const reachCells = detonate([seed], { board: sim, fallbackColor: piece.color }).cells;

  return {
    lineCells,
    triggerCells,
    reachCells,
    comboCells,
    effect: group.length >= 2 ? wave.detonations[0]!.effect : null,
  };
}

function pendingUids(prev: ResolutionEvent | undefined): Set<number> {
  const out = new Set<number>();
  if (!prev) return out;
  for (const r of prev.removed) if (isSpecialKind(r.cell.kind)) out.add(r.cell.uid);
  return out;
}
