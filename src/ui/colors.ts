import type { Color } from '../game/types';

/** Gray Box 用の色。**アートではなく識別のための色。** */
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

export const UI = {
  boardBg: 0x1a1e26,
  cellEmpty: 0x232833,
  gridLine: 0x2f3644,
  trayBg: 0x1a1e26,
  ghostOk: 0xffffff,
  ghostNg: 0xff7a7a,
  lineHighlight: 0xffd166,
  detonation: 0xffffff,
  hint: 0x7ab8ff,
  special: 0x11151c,
} as const;
