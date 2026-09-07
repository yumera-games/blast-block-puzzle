import { BALANCE, blastBand } from '../data/balance';
import type { Board } from './Board';
import type { BlastComponent, Color } from './types';

/**
 * COLOR BLAST の探索。
 *
 * 仕様上とても大事な点が3つある。
 *  1. **COLOR BLAST は単独では発生しない。** 完成ライン上の通常セルだけが起点になる。
 *  2. **斜めは接続と認めない。** 上下左右のみ。
 *  3. connected component が閾値以上のときだけ、**ライン外の同色接続セルも**消去対象になる。
 *
 * 探索は盤面を書き換えない。呼び出し側が確定後にまとめて消去する。
 */
export function findColorBlasts(board: Board, lineCells: readonly number[]): BlastComponent[] {
  const visited = new Set<number>();
  const out: BlastComponent[] = [];

  // 起点は index 昇順に見る（結果順序を決定論にするため）。
  const seeds = [...lineCells].sort((a, b) => a - b);

  for (const seed of seeds) {
    if (visited.has(seed)) continue;
    const cell = board.at(seed);
    if (cell.kind !== 'normal' || cell.color === null) continue;

    const component = floodSameColor(board, seed, cell.color, visited);
    if (component.length >= BALANCE.colorBlast.minSize) {
      out.push({
        color: cell.color,
        cells: component,
        size: component.length,
        band: blastBand(component.length),
      });
    }
  }
  return out;
}

/**
 * 同色の連結成分を上下左右だけで探索する。
 * `visited` は呼び出しをまたいで共有し、同じ成分を二重に数えないようにする。
 */
function floodSameColor(board: Board, start: number, color: Color, visited: Set<number>): number[] {
  const out: number[] = [];
  const stack = [start];
  visited.add(start);
  while (stack.length > 0) {
    const i = stack.pop()!;
    out.push(i);
    for (const n of board.neighbors(i)) {
      if (visited.has(n)) continue;
      const c = board.at(n);
      // 特殊ピースは「通常色セル」ではないので接続に含めない。
      if (c.kind !== 'normal' || c.color !== color) continue;
      visited.add(n);
      stack.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}
