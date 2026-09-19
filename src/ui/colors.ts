import type { Color } from '../game/types';

/**
 * ブロックの色。**識別が第一。**5 色は明度だけでなく**色相**でも離す
 * （赤 0° / 青 210° / 黄 45° / 緑 135° / 紫 270° 付近）。
 * 工程 W-2 で見た目を整えたが、**色の意味は変えていない。**
 */
export const CELL_COLOR: Record<Color, number> = {
  red: 0xd9534f,
  blue: 0x4a90d9,
  yellow: 0xd9b34a,
  green: 0x4fb36a,
  purple: 0x9b6dd9,
};

export const CELL_EDGE: Record<Color, number> = {
  red: 0xf2938f,
  blue: 0x8ec2f2,
  yellow: 0xf2dc9a,
  green: 0x93dda8,
  purple: 0xc6a5f2,
};

/** ブロックの底（縦グラデーションの下側）。**同系色を暗くしただけ。** */
export const CELL_DEEP: Record<Color, number> = {
  red: 0x8f3330,
  blue: 0x2c5c8f,
  yellow: 0x8f7328,
  green: 0x2f7543,
  purple: 0x63428f,
};

export const UI = {
  /** 盤面の面。**空セルより暗くして、盤の外形が分かるようにする。** */
  boardBg: 0x161a22,
  /** 盤面の外周。弱い色差だけ。光らせない。 */
  boardEdge: 0x3a3350,
  /** 空セル。**青ブロックと混同しないよう、彩度をほぼ持たせない。** */
  cellEmpty: 0x20242e,
  /** 空セルの上辺。へこんで見せるための弱い陰影。 */
  cellEmptyTop: 0x191d25,
  gridLine: 0x2f3644,
  trayBg: 0x1a1e26,
  ghostOk: 0xffffff,
  ghostNg: 0xff7a7a,
  lineHighlight: 0xffd166,
  /** ドラッグ予告（Gray Box。アートではなく読み取り用の識別色）。 */
  previewLine: 0xffffff,
  previewReach: 0x7ab8ff,
  previewTrigger: 0xffd166,
  previewCombo: 0xff6fc8,
  /** 中央表示・予告ラベルの下敷き。 */
  textPlate: 0x0d1016,
  detonation: 0xffffff,
  hint: 0x7ab8ff,
  special: 0x11151c,
} as const;
