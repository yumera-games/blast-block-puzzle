import { shapeById } from '../data/pieces';
import type { Board } from './Board';
import type { Piece, PieceShape, PieceSpec, Color, Vec } from './types';

let uidSeq = 0;

/** テストで uid を安定させたいときに使う。 */
export function resetPieceUid(value = 0): void {
  uidSeq = value;
}

export function createPiece(shape: PieceShape, color: Color): Piece {
  return { uid: ++uidSeq, shape, color };
}

export function pieceFromSpec(spec: PieceSpec): Piece {
  return createPiece(shapeById(spec.shape), spec.color);
}

/** 形状の中心（セル座標の平均）。ドラッグ時のオフセット計算にも使う。 */
export function shapeCenter(shape: PieceShape): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const c of shape.cells) {
    x += c.x;
    y += c.y;
  }
  return { x: x / shape.cells.length, y: y / shape.cells.length };
}

export function cellsAt(cells: readonly Vec[], row: number, col: number): { row: number; col: number }[] {
  return cells.map((v) => ({ row: row + v.y, col: col + v.x }));
}

export function canPlacePiece(board: Board, piece: Piece, row: number, col: number): boolean {
  return board.canPlace(piece.shape.cells, row, col);
}

export function placePiece(board: Board, piece: Piece, row: number, col: number): number[] {
  return board.place(piece.shape.cells, row, col, piece.color);
}
