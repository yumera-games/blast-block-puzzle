import { BALANCE } from '../data/balance';
import type { Piece } from '../game/types';
import type { Layout } from './layout';

export interface TraySlot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 画面下部の候補ピース置き場。
 * **形状はデータ（piece.shape.cells）だけを見る。**ここに形をハードコードしない。
 */
export class PieceTray {
  constructor(private layout: Layout) {}

  setLayout(layout: Layout): void {
    this.layout = layout;
  }

  get slotCount(): number {
    return BALANCE.tray.size;
  }

  slot(i: number): TraySlot {
    const l = this.layout;
    const w = l.width / this.slotCount;
    return { x: i * w, y: l.trayY, w, h: l.trayH };
  }

  /** スロット内に収まるセルサイズ。 */
  cellSize(piece: Piece, slot: TraySlot): number {
    const maxW = (slot.w * 0.82) / piece.shape.width;
    const maxH = (slot.h * 0.82) / piece.shape.height;
    return Math.min(maxW, maxH, this.layout.cell * 0.62);
  }

  /** スロット内でピースを中央に置いたときの左上座標。 */
  origin(piece: Piece, slot: TraySlot, cell: number): { x: number; y: number } {
    return {
      x: slot.x + (slot.w - piece.shape.width * cell) / 2,
      y: slot.y + (slot.h - piece.shape.height * cell) / 2,
    };
  }

  /** 座標がどのスロットにあたるか。トレイ外なら null。 */
  hitTest(x: number, y: number): number | null {
    const l = this.layout;
    if (y < l.trayY || y > l.trayY + l.trayH) return null;
    for (let i = 0; i < this.slotCount; i++) {
      const s = this.slot(i);
      if (x >= s.x && x <= s.x + s.w) return i;
    }
    return null;
  }
}
