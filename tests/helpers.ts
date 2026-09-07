import { Board } from '../src/game/Board';
import { shapeById } from '../src/data/pieces';
import { resolveBoard, type ResolveOptions } from '../src/game/Resolver';
import type { Color, ResolutionResult } from '../src/game/types';

/** 盤面を作り、形状を1つ置いて resolution を回す。テスト用の最短経路。 */
export function playOne(
  lines: readonly string[],
  shape: string,
  color: Color,
  row: number,
  col: number,
  opts: ResolveOptions = {},
): { board: Board; result: ResolutionResult } {
  const board = Board.fromStrings(lines);
  const cells = shapeById(shape).cells;
  if (!board.canPlace(cells, row, col)) throw new Error(`illegal placement in test: ${row},${col}`);
  const placedCells = board.place(cells, row, col, color);
  const result = resolveBoard(board, { placedCells, placedColor: color, ...opts });
  return { board, result };
}

export function filledCount(board: Board): number {
  return board.countFilled();
}
