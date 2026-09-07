import { BALANCE } from '../data/balance';
import type { Board } from './Board';
import { findColorBlasts } from './ColorBlast';
import { scoreRemoval } from './Score';
import { decideSpawn, detonate, groupAdjacentSpecials } from './Specials';
import { chainMultiplier } from '../data/balance';
import {
  type Cell,
  type Color,
  type Detonation,
  type RemovedCell,
  type ResolutionEvent,
  type ResolutionResult,
  type SpecialInstance,
  type SpecialKind,
  isSpecialKind,
} from './types';

export interface ResolveOptions {
  /** 今回置いた piece のセル（特殊生成位置の決定に使う）。 */
  placedCells?: readonly number[];
  /** 今回置いた piece の色（Rainbow 対象色の fallback）。 */
  placedColor?: Color | null;
  /** 特殊ピースの uid 採番。省略時は盤面の最大 uid の続きから。 */
  nextUid?: () => number;
}

/**
 * 1回の配置に対する resolution を最後まで実行する。**盤面を破壊的に更新する。**
 *
 * wave（= CHAIN 1回）の構造:
 *   1. 完成ラインを確定する（探索中には消さない）
 *   2. 完成ライン上の通常セルから COLOR BLAST を探索する
 *   3. 前の wave で消去対象へ巻き込まれた特殊ピースを起爆する
 *   4. 特殊ピースの生成位置を決める（生成セルは消さずに残す）
 *   5. まとめて消去し、消去に巻き込まれた特殊を次の wave へ送る
 *
 * 特殊起爆が新たな特殊を巻き込む限り wave が続く＝これが CHAIN。
 * 同じ特殊が同一 resolution 内で二重起爆しないよう uid で管理する。
 */
export function resolveBoard(board: Board, opts: ResolveOptions = {}): ResolutionResult {
  const placedCells = opts.placedCells ?? [];
  const placedColor = opts.placedColor ?? null;

  let uidSeq = board.maxUid();
  const nextUid = opts.nextUid ?? (() => ++uidSeq);

  const placedCenter = centerOf(board, placedCells);

  const events: ResolutionEvent[] = [];
  const specialsCreated: SpecialKind[] = [];
  const specialsDetonated: SpecialKind[] = [];
  const detonatedUids = new Set<number>();

  let pending: SpecialInstance[] = [];
  let chainIndex = 0;
  let rowsCleared = 0;
  let colsCleared = 0;
  let aborted = false;

  for (let wave = 0; ; wave++) {
    if (wave >= BALANCE.resolution.maxWaves) {
      aborted = true;
      break;
    }

    const lines = board.findFullLines();
    if (lines.length === 0 && pending.length === 0) break;

    chainIndex++;

    // --- 1. LINE CLEAR ---
    const lineCells: number[] = [];
    for (const line of lines) lineCells.push(...board.lineIndices(line));

    // --- 2. COLOR BLAST（LINE CLEAR が必ずトリガー） ---
    const blasts = lines.length > 0 ? findColorBlasts(board, lineCells) : [];

    // --- 3. 前 wave から持ち越した特殊の起爆 ---
    const detonations: Detonation[] = [];
    const detonationCells = new Set<number>();
    if (pending.length > 0) {
      const groups = groupAdjacentSpecials(board, pending);
      for (const group of groups) {
        for (const s of group) {
          detonatedUids.add(s.uid);
          specialsDetonated.push(s.kind);
        }
        const d = detonate(group, { board, fallbackColor: placedColor });
        detonations.push(d);
        for (const i of d.cells) detonationCells.add(i);
      }
    }

    // --- 消去対象の確定（source の強さは special > blast > line） ---
    const source = new Map<number, RemovedCell['source']>();
    for (const i of lineCells) source.set(i, 'line');
    for (const b of blasts) for (const i of b.cells) if (source.get(i) !== 'special') source.set(i, 'blast');
    for (const i of detonationCells) source.set(i, 'special');

    const removal = new Set(source.keys());

    // --- 4. 特殊生成（生成セルは消さない） ---
    const spawn =
      lines.length > 0
        ? decideSpawn({ board, lines, blasts, placedCells, placedCenter, removal, nextUid })
        : null;
    if (spawn) {
      removal.delete(spawn.index);
      source.delete(spawn.index);
    }

    // --- 5. 消去に巻き込まれた特殊を次の wave へ ---
    const next = new Map<number, SpecialInstance>();
    for (const i of removal) {
      const cell = board.at(i);
      if (!isSpecialKind(cell.kind)) continue;
      if (detonatedUids.has(cell.uid)) continue; // 二重起爆の防止
      if (next.has(cell.uid)) continue;
      next.set(cell.uid, { uid: cell.uid, kind: cell.kind, index: i, color: cell.color, dir: cell.dir });
    }

    // --- 消去を適用 ---
    const removed: RemovedCell[] = [];
    for (const i of [...removal].sort((a, b) => a - b)) {
      const cell = board.at(i);
      if (cell.kind === 'empty') continue; // すでに空のセルは得点にも演出にもしない
      removed.push({ index: i, cell: snapshot(cell), source: source.get(i) ?? 'line' });
      board.clearAt(i);
    }
    if (spawn) {
      board.putSpecial(spawn.index, spawn.kind, spawn.uid, spawn.color, spawn.dir);
      specialsCreated.push(spawn.kind);
    }

    for (const l of lines) {
      if (l.kind === 'row') rowsCleared++;
      else colsCleared++;
    }

    events.push({
      chainIndex,
      lines,
      blasts,
      detonations,
      removed,
      spawned: spawn,
      score: scoreRemoval(removed, chainIndex),
      chainMultiplier: chainMultiplier(chainIndex),
    });

    pending = [...next.values()].sort((a, b) => a.index - b.index);
  }

  return {
    events,
    maxChain: events.length,
    totalScore: events.reduce((a, e) => a + e.score, 0),
    totalCleared: events.reduce((a, e) => a + e.removed.length, 0),
    rowsCleared,
    colsCleared,
    specialsCreated,
    specialsDetonated,
    aborted,
  };
}

function snapshot(cell: Cell): Cell {
  return { ...cell };
}

/** piece の中心（セル座標の平均）。空なら null。 */
function centerOf(board: Board, cells: readonly number[]): { row: number; col: number } | null {
  if (cells.length === 0) return null;
  let r = 0;
  let c = 0;
  for (const i of cells) {
    r += board.rowOf(i);
    c += board.colOf(i);
  }
  return { row: r / cells.length, col: c / cells.length };
}
