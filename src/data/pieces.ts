import type { PieceShape, Vec } from '../game/types';

/**
 * ピース形状のデータ定義。
 *
 * **形状を表示ロジックへハードコードしないこと。** 描画も配置判定も生成も、
 * すべてこの配列から得た `cells`（セル相対座標）だけを見る。
 * 回転違いは別 shape として定義する（実行時回転は Phase 1 では持たない）。
 */
function shape(id: string, label: string, weight: number, rows: readonly string[]): PieceShape {
  const cells: Vec[] = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') cells.push({ x, y });
    }
  }
  if (cells.length === 0) throw new Error(`shape ${id} has no cells`);
  const width = Math.max(...cells.map((c) => c.x)) + 1;
  const height = Math.max(...cells.map((c) => c.y)) + 1;
  return { id, label, cells, width, height, weight };
}

export const PIECE_SHAPES: readonly PieceShape[] = [
  shape('dot', '1セル', 10, ['#']),

  shape('h2', '横2', 12, ['##']),
  shape('h3', '横3', 10, ['###']),
  shape('h4', '横4', 6, ['####']),

  shape('v2', '縦2', 12, ['#', '#']),
  shape('v3', '縦3', 10, ['#', '#', '#']),
  shape('v4', '縦4', 6, ['#', '#', '#', '#']),

  shape('o4', '2x2', 10, ['##', '##']),

  // 小L（3セル）— 4方向
  shape('l3a', '小L-a', 8, ['#.', '##']),
  shape('l3b', '小L-b', 8, ['##', '#.']),
  shape('l3c', '小L-c', 8, ['##', '.#']),
  shape('l3d', '小L-d', 8, ['.#', '##']),

  // 大L（5セル）— 4方向
  shape('l5a', '大L-a', 4, ['#..', '#..', '###']),
  shape('l5b', '大L-b', 4, ['..#', '..#', '###']),
  shape('l5c', '大L-c', 4, ['###', '#..', '#..']),
  shape('l5d', '大L-d', 4, ['###', '..#', '..#']),

  // T（4セル）— 4方向
  shape('t4a', 'T-a', 5, ['###', '.#.']),
  shape('t4b', 'T-b', 5, ['.#.', '###']),
  shape('t4c', 'T-c', 5, ['#.', '##', '#.']),
  shape('t4d', 'T-d', 5, ['.#', '##', '.#']),

  // Z / S（4セル）— 各2方向
  shape('s4h', 'S-横', 4, ['.##', '##.']),
  shape('z4h', 'Z-横', 4, ['##.', '.##']),
  shape('s4v', 'S-縦', 4, ['#.', '##', '.#']),
  shape('z4v', 'Z-縦', 4, ['.#', '##', '#.']),
];

const BY_ID = new Map<string, PieceShape>(PIECE_SHAPES.map((s) => [s.id, s]));

export function shapeById(id: string): PieceShape {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`unknown shape id: ${id}`);
  return s;
}

export function hasShape(id: string): boolean {
  return BY_ID.has(id);
}
