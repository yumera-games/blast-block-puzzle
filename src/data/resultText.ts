import type { ResolutionEvent, SpecialInstance } from '../game/types';
import { comboName } from './combos';

/**
 * 演出中に出す文言と、盤面上の教材表示の種類。
 *
 * **文言も判定条件もここ 1 か所。** シーン側で盤面を見て数え直したり、
 * 文を組み立て直したりしないこと。使うのは resolution event が持っている値だけ
 * （`chainIndex` と `Detonation.effect` / `Detonation.group`）。
 *
 * 人間再評価で、文章による説明は読み流されることが分かった
 * （CHAIN 2 を「2列そろった」と受け取る／COMBO は「取れた」としか認識しない）。
 * そこで文章は最小限に切りつめ、意味は**盤面上の動き**で見せる方針へ変えている。
 * ここが持つのはその動きの種類（TeachKind）と、添える短い語だけ。
 */

/** 盤面上の教材表示。ステージデータ側で指定する。 */
export type TeachKind =
  /** wave に ①② と番号を振り、「消去 → 起爆」の順序を見せる（Stage 5）。 */
  | 'waveNumbers'
  /** 起爆した特殊どうしを同じ色の枠と矢印で結ぶ（Stage 10）。 */
  | 'comboLink'
  /** 盤面に残す特殊へ KEEP 印を付け、組み合わせ相手を小さな図で示す（Stage 11）。 */
  | 'keep';

/** CHAIN 表示を出す最小 wave 数。1 波で終わった手には出さない。 */
export const CHAIN_NOTICE_MIN = 2;

const MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'] as const;

/**
 * wave 番号の丸数字。**1 wave = 1 個**。
 * 同じ wave で 2 ライン同時に消えても番号は 1 つ（「2列そろった＝CHAIN 2」の誤解を作らない）。
 */
export function waveMark(chainIndex: number): string {
  return MARKS[chainIndex - 1] ?? `(${chainIndex})`;
}

/** CHAIN の意味を順序で言う。`①→② CHAIN 2`。 */
export function chainSequenceNote(chainIndex: number): string | null {
  if (chainIndex < CHAIN_NOTICE_MIN) return null;
  const seq = Array.from({ length: chainIndex }, (_, i) => waveMark(i + 1)).join('→');
  return `${seq}  CHAIN ${chainIndex}`;
}

/** COMBO の意味。いっしょに起爆した特殊の**実数**を出す（3 個なら「3個同時」）。 */
export function comboNote(groupSize: number): string | null {
  if (groupSize < 2) return null;
  return `${groupSize}個同時＝COMBO`;
}

/** KEEP 教材に添える語。文章にしない。 */
export const KEEP_NOTE = 'BOMBは 残す';

/** 教材表示を止めているあいだの案内。 */
export const TEACH_PROMPT = 'タップで つづける';

/** 1 wave ぶんの中央表示。null の行は出さない。 */
export interface WaveNotice {
  /** COMBO の組み合わせ名（ROCKET + BOMB など）。単独起爆なら null。 */
  readonly comboName: string | null;
  /** COMBO の意味（2個同時＝COMBO）。単独起爆なら null。 */
  readonly comboNote: string | null;
  /** CHAIN の数。1 波で終わったなら null。 */
  readonly chainLabel: string | null;
  /** CHAIN の意味。1 波で終わったなら null。 */
  readonly chainNote: string | null;
  /** この wave で一緒に起爆した特殊の数（COMBO でなければ 0）。 */
  readonly comboSize: number;
}

/**
 * その wave に出す中央表示を決める。**wave 単位で独立**しており、
 * 前の wave の内容は持ち越さない（持ち越すと COMBO が起きていない波にも
 * COMBO 表示が残ってしまう）。
 *
 * `teach` に 'waveNumbers' が入っていると、CHAIN の説明を丸数字の順序
 * （①→② CHAIN 2）にする。盤面に振った番号と同じ記号なので、
 * 「何が 2 回続いたのか」が文章を読まなくても対応づけられる。
 */
export function waveNotice(ev: ResolutionEvent, teach: readonly TeachKind[] = []): WaveNotice {
  // combo 判定は再実装しない。Detonation.effect が combo 名を持つかどうかだけを見る。
  const det = ev.detonations.find((d) => comboName(d.effect) !== null) ?? null;
  const chained = ev.chainIndex >= CHAIN_NOTICE_MIN;
  return {
    comboName: det ? comboName(det.effect) : null,
    comboNote: det ? comboNote(det.group.length) : null,
    chainLabel: chained ? `CHAIN ${ev.chainIndex}` : null,
    chainNote: teach.includes('waveNumbers') ? chainSequenceNote(ev.chainIndex) : plainChainNote(ev.chainIndex),
    comboSize: det ? det.group.length : 0,
  };
}

/** 教材ステージ以外で使う、そのままの言い方。 */
function plainChainNote(chainIndex: number): string | null {
  if (chainIndex < CHAIN_NOTICE_MIN) return null;
  return `消去が ${chainIndex}回 つづいた！`;
}

/** 旧名との互換のため残す（テストから使う）。 */
export const chainNote = plainChainNote;

/**
 * COMBO で結ばれた特殊と、**因果の向き**。
 *
 * `Detonation.group` は決定論のため index 昇順に並べてあるだけで、
 * 配列順に因果の意味は無い（それを向きとして使うと矢印が逆になる）。
 * 向きは resolution が残した消去記録から取る。
 *
 *   起点   … 前の波でラインに巻きこまれて消えており、この波で起爆した側。
 *            だから **この波の removed には入っていない**。
 *   取り込まれた側 … 盤面に残っていたところへ効果が届いた側。
 *            **この波の removed に入る**（起爆範囲に含まれて消える）。
 *
 * 起爆待ちどうしが結ばれた場合は両方が起点なので取り込まれた側が居ない。
 * そのときは向きが定まらないので `directed: false` を返す
 * （表示側は片方向の矢印を出さず、向きのない線で結ぶ）。
 *
 * **combo かどうかの判定はここでやり直さない。** 見るのは Detonation.effect だけ。
 */
export interface ComboLink {
  /** 効果を届かせた側（矢印の始点）。 */
  readonly from: readonly SpecialInstance[];
  /** 効果が届いて取り込まれた側（矢印の先端）。 */
  readonly to: readonly SpecialInstance[];
  /** 片方向の矢印を出してよいか。false なら向きは示さない。 */
  readonly directed: boolean;
  /** 結ばれた特殊すべて（枠を描く対象）。 */
  readonly all: readonly SpecialInstance[];
}

export function comboLinkOf(ev: ResolutionEvent): ComboLink | null {
  const det = ev.detonations.find((d) => comboName(d.effect) !== null);
  if (!det) return null;
  const removed = new Set(ev.removed.map((r) => r.index));
  const to = det.group.filter((g) => removed.has(g.index));
  const from = det.group.filter((g) => !removed.has(g.index));
  return { from, to, directed: from.length > 0 && to.length > 0, all: det.group };
}
