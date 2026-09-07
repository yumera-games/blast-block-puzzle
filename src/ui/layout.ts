import { BALANCE } from '../data/balance';

/**
 * 盤面とトレイの寸法。**すべてデバイスピクセル**（canvas のバッキング解像度）で持つ。
 * CSS ピクセルとの変換はポインタ座標の取得時だけ行う。
 */
export interface Layout {
  readonly dpr: number;
  readonly cell: number;
  readonly boardX: number;
  readonly boardY: number;
  readonly boardW: number;
  readonly boardH: number;
  readonly trayY: number;
  readonly trayH: number;
  readonly width: number;
  readonly height: number;
  /** CSS ピクセルでの表示サイズ。 */
  readonly cssWidth: number;
  readonly cssHeight: number;
}

/** 盤面の下の余白（セル比）。 */
const GAP_RATIO = 0.42;
/** トレイの高さ（セル比）。縦に長いピースがつぶれない程度に確保する。 */
const TRAY_RATIO = 2.3;
const PAD_RATIO = 0.12;

export const LAYOUT_UNITS = BALANCE.board.rows + GAP_RATIO + TRAY_RATIO + PAD_RATIO * 2;

/**
 * 使える CSS ピクセル領域から寸法を決める。
 * 320px 幅でも破綻しないよう、セルサイズに下限を設ける。
 */
export function computeLayout(availCssW: number, availCssH: number, dpr: number): Layout {
  const cols = BALANCE.board.cols;
  const rows = BALANCE.board.rows;
  const byW = availCssW / (cols + PAD_RATIO * 2);
  const byH = availCssH / LAYOUT_UNITS;
  const cssCell = Math.max(16, Math.floor(Math.min(byW, byH)));

  const cell = Math.round(cssCell * dpr);
  const pad = Math.round(cell * PAD_RATIO);
  const gap = Math.round(cell * GAP_RATIO);
  const trayH = Math.round(cell * TRAY_RATIO);

  const boardW = cols * cell;
  const boardH = rows * cell;
  const width = boardW + pad * 2;
  const boardX = pad;
  const boardY = pad;
  const trayY = boardY + boardH + gap;
  const height = trayY + trayH + pad;

  return {
    dpr,
    cell,
    boardX,
    boardY,
    boardW,
    boardH,
    trayY,
    trayH,
    width,
    height,
    cssWidth: Math.round(width / dpr),
    cssHeight: Math.round(height / dpr),
  };
}
