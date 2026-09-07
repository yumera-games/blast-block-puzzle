/**
 * Phase 1 の暫定バランス値。
 *
 * **数値をロジック側へ散在させないこと。** 区分値・倍率・条件はすべてここに集約し、
 * Board / Resolver / Score は必ずこの定数を参照する。
 */
export const BALANCE = {
  board: {
    rows: 8,
    cols: 8,
  },

  tray: {
    /** 同時に提示する候補ピース数。 */
    size: 3,
    /** Dead セットを避けるための再抽選回数の上限。これを超えたら諦めてそのまま出す
     *  （「必ずクリアできるピース」を配る救済AIにはしない、という方針のため）。
     *  24 では「空きが 1 マスだけ」の極端な盤面で Dead を配ってしまうことが実測であった
     *  （dot の抽選確率は 10/160。25 回連続で外す確率が約 0.8%）。避けるのは Dead だけで
     *  Risky はそのまま出すので、回数を増やしても救済にはならない。 */
    deadRetries: 64,
  },

  colorBlast: {
    /** connected component がこのサイズ以上のとき、ライン外セルも消去対象へ含める。 */
    minSize: 4,
    /** 暫定区分。band 名はスコアには影響せず、いまは計測とデバッグ表示にのみ使う。 */
    bands: {
      smallMin: 4,
      mediumMin: 6,
      largeMin: 9,
    },
  },

  specials: {
    rocket: {
      /** 同時完成ライン数がちょうどこの数のとき Rocket を生成。 */
      linesRequired: 2,
    },
    bomb: {
      /** 同時完成ライン数がこの数以上、または */
      linesRequired: 3,
      /** COLOR BLAST connected component がこのサイズ以上で Bomb。 */
      blastSize: 9,
      /** 単体起爆の効果半径（1 = 3x3）。 */
      radius: 1,
    },
    rainbow: {
      /** 同時完成ライン数がこの数以上、または */
      linesRequired: 4,
      /** COLOR BLAST connected component がこのサイズ以上で Rainbow。 */
      blastSize: 13,
    },
    combo: {
      /** Bomb + Bomb の半径（2 = 5x5）。 */
      bombBombRadius: 2,
      /** Rocket + Bomb の十字の太さ（1 = 3列ぶん）。 */
      rocketBombHalfWidth: 1,
    },
  },

  score: {
    perCell: 10,
    colorBlastMultiplier: 1.25,
    specialMultiplier: 1.5,
    /** chainIndex（1始まり）で引く。範囲外は末尾の値を使う。 */
    chainMultipliers: [1.0, 1.0, 1.2, 1.5, 2.0, 3.0] as readonly number[],
  },

  resolution: {
    /** 無限ループ防止。1回の resolution で処理する wave 数の上限。 */
    maxWaves: 32,
  },
} as const;

export type BlastBand = 'small' | 'medium' | 'large';

/** connected component サイズから暫定区分を求める。 */
export function blastBand(size: number): BlastBand {
  const b = BALANCE.colorBlast.bands;
  if (size >= b.largeMin) return 'large';
  if (size >= b.mediumMin) return 'medium';
  return 'small';
}

/** chainIndex（1始まり）に対応する得点倍率。 */
export function chainMultiplier(chainIndex: number): number {
  const table = BALANCE.score.chainMultipliers;
  if (chainIndex < 1) return table[1] ?? 1;
  return table[Math.min(chainIndex, table.length - 1)] ?? 1;
}
