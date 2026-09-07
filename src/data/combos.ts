/**
 * 特殊 x 特殊（COMBO）の表示名。
 *
 * **combo 名の対応表はここ 1 か所だけ。** 表示側で盤面を見て判定し直したり、
 * 名前を組み立て直したりしないこと。判定に使うのは常に `Detonation.effect`。
 *
 * `Detonation.effect` は Specials.detonate() が付ける文字列で、
 * 単独起爆なら 'rocket' / 'bomb' / 'rainbow' / 'none'、
 * 特殊 x 特殊 なら下の COMBO_NAMES のキーになる。
 */

export type ComboEffect =
  | 'rocket+rocket'
  | 'rocket+bomb'
  | 'bomb+bomb'
  | 'rainbow+rocket'
  | 'rainbow+bomb'
  | 'rainbow+rainbow';

/** effect → 中央表示に出す名前。 */
export const COMBO_NAMES: Record<ComboEffect, string> = {
  'rocket+rocket': 'ROCKET + ROCKET',
  'rocket+bomb': 'ROCKET + BOMB',
  'bomb+bomb': 'BOMB + BOMB',
  'rainbow+rocket': 'RAINBOW + ROCKET',
  'rainbow+bomb': 'RAINBOW + BOMB',
  'rainbow+rainbow': 'RAINBOW + RAINBOW',
};

export const COMBO_EFFECTS = Object.keys(COMBO_NAMES) as ComboEffect[];

export function isComboEffect(effect: string): effect is ComboEffect {
  return Object.prototype.hasOwnProperty.call(COMBO_NAMES, effect);
}

/**
 * combo の表示名。**単独起爆なら null**（COMBO 表示を出してはいけない合図）。
 * 予告と結果表示の両方がこの 1 関数だけを使う。
 */
export function comboName(effect: string | null | undefined): string | null {
  if (!effect) return null;
  return isComboEffect(effect) ? COMBO_NAMES[effect] : null;
}

/** 予告用の短いラベル。'ROCKET → BOMB COMBO' の形。 */
export function comboPreviewLabel(effect: string | null | undefined): string | null {
  const name = comboName(effect);
  return name === null ? null : `${name.replace(' + ', ' → ')} COMBO`;
}
