import type { Layout } from './layout';

/**
 * 盤面上の教材表示のための座標計算。**描画から切り離してテストできるようにする。**
 * ここには「どこへ線を引くか」だけを置き、何を意味するかは data 側が決める。
 */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** 矢印の両端をセル中心からどれだけ詰めるか（セル比）。0.5 未満なのでセルの内側に残る。 */
export const ARROW_PAD_RATIO = 0.42;

export function cellCenter(l: Layout, row: number, col: number): Pt {
  return { x: l.boardX + (col + 0.5) * l.cell, y: l.boardY + (row + 0.5) * l.cell };
}

/** セル 1 個ぶんの矩形。矢印の端がこの中に入っているかの判定に使う。 */
export function cellBounds(
  l: Layout,
  row: number,
  col: number,
): { left: number; right: number; top: number; bottom: number } {
  const x = l.boardX + col * l.cell;
  const y = l.boardY + row * l.cell;
  return { left: x, right: x + l.cell, top: y, bottom: y + l.cell };
}

/**
 * from → to の矢印の実際の始点と先端。
 * 両端をセル半分ぶん手前で止めるので、**始点は from のセル内、先端は to のセル内**に入る。
 * 近すぎて描く意味がないときは null。
 */
export function arrowEndpoints(from: Pt, to: Pt, cell: number): { tail: Pt; head: Pt } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const pad = cell * ARROW_PAD_RATIO;
  const tail = { x: from.x + ux * pad, y: from.y + uy * pad };
  const head = { x: to.x - ux * pad, y: to.y - uy * pad };
  if (Math.hypot(head.x - tail.x, head.y - tail.y) < 4) return null;
  return { tail, head };
}
