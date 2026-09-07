import type { ResolutionEvent } from '../game/types';
import { comboName } from './combos';

/**
 * 演出中に盤面中央へ出す「いま何が起きたか」の文言。
 *
 * **文言も判定条件もここ 1 か所。** シーン側で盤面を見て数え直したり、
 * 文を組み立て直したりしないこと。使うのは resolution event が持っている値だけ
 * （`chainIndex` と `Detonation.effect` / `Detonation.group`）。
 *
 * 人間プレイ評価で CHAIN と COMBO が「ROCKET と BOMB の違い」として
 * 受け取られていたため、語だけでなく**意味を発生した瞬間に**出す。
 */

/** CHAIN 表示を出す最小 wave 数。1 波で終わった手には出さない。 */
export const CHAIN_NOTICE_MIN = 2;

/** CHAIN の意味。「特殊の種類」ではなく「消去・起爆が続いた回数」と読める文にする。 */
export function chainNote(chainIndex: number): string | null {
  if (chainIndex < CHAIN_NOTICE_MIN) return null;
  return `消去が ${chainIndex}回 つづいた！`;
}

/** COMBO の意味。いっしょに起爆した特殊の**実数**を出す（3 個なら「特殊 3個」）。 */
export function comboNote(groupSize: number): string | null {
  if (groupSize < 2) return null;
  return `特殊 ${groupSize}個が いっしょに起爆！`;
}

/** 1 wave ぶんの中央表示。null の行は出さない。 */
export interface WaveNotice {
  /** COMBO の組み合わせ名（ROCKET + BOMB など）。単独起爆なら null。 */
  readonly comboName: string | null;
  /** COMBO の意味。単独起爆なら null。 */
  readonly comboNote: string | null;
  /** CHAIN の数。1 波で終わったなら null。 */
  readonly chainLabel: string | null;
  /** CHAIN の意味。1 波で終わったなら null。 */
  readonly chainNote: string | null;
}

/**
 * その wave に出す中央表示を決める。**wave 単位で独立**しており、
 * 前の wave の内容は持ち越さない（持ち越すと COMBO が起きていない波にも
 * COMBO 表示が残ってしまう）。
 */
export function waveNotice(ev: ResolutionEvent): WaveNotice {
  // combo 判定は再実装しない。Detonation.effect が combo 名を持つかどうかだけを見る。
  const det = ev.detonations.find((d) => comboName(d.effect) !== null) ?? null;
  return {
    comboName: det ? comboName(det.effect) : null,
    comboNote: det ? comboNote(det.group.length) : null,
    chainLabel: ev.chainIndex >= CHAIN_NOTICE_MIN ? `CHAIN ${ev.chainIndex}` : null,
    chainNote: chainNote(ev.chainIndex),
  };
}
