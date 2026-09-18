import { describe, expect, it } from 'vitest';
import {
  ATTACK_DURATION_MS,
  ATTACK_START_MS,
  WAVE2_MS,
  attackEndMs,
  attackPlacement,
  hasCombo,
} from '../src/game/attack';
import { Board } from '../src/game/Board';
import { detonate } from '../src/game/Specials';
import { isComboEffect } from '../src/data/combos';
import type { Color, Detonation, ResolutionResult, SpecialInstance } from '../src/game/types';
import { playOne } from './helpers';

/** detonation だけを持つ最小の ResolutionResult。hasCombo は events と detonations しか見ない。 */
function resultOf(...waves: Detonation[][]): ResolutionResult {
  return {
    events: waves.map((detonations, i) => ({
      chainIndex: i + 1,
      lines: [],
      blasts: [],
      detonations,
      removed: [],
      spawned: null,
      score: 0,
      chainMultiplier: 1,
    })),
    maxChain: waves.length,
    totalScore: 0,
    totalCleared: 0,
    rowsCleared: 0,
    colsCleared: 0,
    specialsCreated: [],
    specialsDetonated: [],
    aborted: false,
  };
}

function special(kind: SpecialInstance['kind'], index: number, uid: number, color: Color | null = null, dir: 'h' | 'v' | null = null): SpecialInstance {
  return { kind, index, uid, color, dir } as SpecialInstance;
}
const ctx = { board: Board.fromStrings(['RRRRRRRR', ...Array(7).fill('........')]), fallbackColor: 'red' as Color };

describe('attack: COMBO 判定（2B 7-5-9 の 4）', () => {
  it('COMBO 成立手では true（Stage 10 と同じ盤面。ROCKET が巻きこまれ BOMB と一緒に起爆）', () => {
    const { result } = playOne(
      ['........', '........', '..R.R...', '..R*R...', '..R.R...', '........', '........', 'RB.^YGPB'],
      'dot', 'green', 7, 2,
    );
    const effects = result.events.flatMap((e) => e.detonations.map((d) => d.effect));
    expect(effects).toContain('rocket+bomb');
    expect(hasCombo(result)).toBe(true);
  });

  it('単独起爆だけの CHAIN 2 では false', () => {
    const { result } = playOne(
      ['........', '........', '........', '........', '........', '........', '........', 'RB.^YGPB'],
      'dot', 'green', 7, 2,
    );
    expect(result.maxChain).toBeGreaterThanOrEqual(2);
    const effects = result.events.flatMap((e) => e.detonations.map((d) => d.effect));
    expect(effects.every((e) => !isComboEffect(e))).toBe(true);
    expect(hasCombo(result)).toBe(false);
  });

  it('特殊が起爆しない通常手では false', () => {
    const { result } = playOne(
      ['........', '........', '........', '........', '........', '........', '........', 'RBYGPRB.'],
      'dot', 'red', 7, 7,
    );
    expect(hasCombo(result)).toBe(false);
  });

  it('波数 0（何も消えない手）では false', () => {
    expect(hasCombo(resultOf())).toBe(false);
    expect(hasCombo(null)).toBe(false);
    expect(hasCombo(undefined)).toBe(false);
  });

  it('同一手に COMBO が 2 件あっても true は 1 つ（呼び出しは 1 手 1 回）', () => {
    const a = detonate([special('rocket', 0, 1, null, 'h'), special('bomb', 1, 2)], ctx);
    const b = detonate([special('bomb', 20, 3), special('bomb', 21, 4)], ctx);
    const r = resultOf([a], [b]);
    expect(r.events.flatMap((e) => e.detonations).filter((d) => isComboEffect(d.effect))).toHaveLength(2);
    expect(hasCombo(r)).toBe(true);
  });

  it('CHAIN 3 以上でも true（COMBO が第 3 波にあっても 1 回）', () => {
    const solo = detonate([special('rocket', 0, 1, null, 'h')], ctx);
    const combo = detonate([special('rocket', 10, 2, null, 'h'), special('bomb', 11, 3)], ctx);
    expect(hasCombo(resultOf([solo], [solo], [combo]))).toBe(true);
  });

  it('RAINBOW + RAINBOW でも true', () => {
    const d = detonate([special('rainbow', 0, 1), special('rainbow', 5, 2)], ctx);
    expect(d.effect).toBe('rainbow+rainbow');
    expect(hasCombo(resultOf([d]))).toBe(true);
  });

  it('effect と group.length が一致する（COMBO ⟺ 2 個以上）', () => {
    const cases: SpecialInstance[][] = [
      [special('rocket', 0, 1, null, 'h')],
      [special('bomb', 0, 1)],
      [special('rainbow', 0, 1)],
      [special('rocket', 0, 1, null, 'h'), special('rocket', 9, 2, null, 'v')],
      [special('rocket', 0, 1, null, 'h'), special('bomb', 9, 2)],
      [special('bomb', 0, 1), special('bomb', 9, 2)],
      [special('rainbow', 0, 1), special('rocket', 9, 2, null, 'h')],
      [special('rainbow', 0, 1), special('bomb', 9, 2)],
      [special('rainbow', 0, 1), special('rainbow', 9, 2)],
    ];
    for (const g of cases) {
      const d = detonate(g, ctx);
      expect(isComboEffect(d.effect), `${d.effect} / group=${g.length}`).toBe(g.length >= 2);
    }
  });
});

describe('attack: 時間（2B 7-5-9 の 3）', () => {
  it('仕様値', () => {
    expect(ATTACK_START_MS).toBe(90);
    expect(ATTACK_DURATION_MS).toBe(400);
    expect(WAVE2_MS).toBe(550);
  });
  it('終了は開始 + 400ms で、波 2 より前', () => {
    expect(attackEndMs(ATTACK_START_MS)).toBe(490);
    expect(attackEndMs(ATTACK_START_MS)).toBeLessThan(WAVE2_MS);
    expect(WAVE2_MS - attackEndMs(ATTACK_START_MS)).toBe(60);
  });
  it('終了は波 2 に依存せず、開始時刻から決まる', () => {
    expect(attackEndMs(0)).toBe(400);
    expect(attackEndMs(123)).toBe(523);
  });
});

describe('attack: サイズと P-1 位置（工程 V-3 の【甲】）', () => {
  // 代表 6 viewport の「attack 開始時の盤面辺」と、そこから決まる本番外接寸法。
  const REPRESENTATIVE: [string, number, number, number][] = [
    ['320x568', 288, 106, 181],
    ['320x690', 288, 106, 181],
    ['375x667', 344, 127, 217],
    ['393x852', 360, 133, 227],
    ['402x874', 368, 136, 232],
    ['430x932', 400, 147, 252],
  ];

  it('代表 6 viewport の外接寸法', () => {
    for (const [name, side, w, h] of REPRESENTATIVE) {
      const p = attackPlacement(0, 0, side);
      expect([name, p.bbox.width, p.bbox.height]).toEqual([name, w, h]);
    }
  });

  it('外接は盤面の右下から 0.25cell 内側（P-1）', () => {
    for (const [name, side] of REPRESENTATIVE) {
      const p = attackPlacement(100, 200, side);
      const inset = Math.floor((side / 8) * 0.25 + 0.5);
      expect([name, p.bbox.left + p.bbox.width]).toEqual([name, 100 + side - inset]);
      expect([name, p.bbox.top + p.bbox.height]).toEqual([name, 200 + side - inset]);
    }
  });

  it('img 要素は透明余白ぶん外側へ広がり、等方倍率になる', () => {
    const p = attackPlacement(0, 0, 400);
    expect(p.scale).toBeCloseTo(252 / 2400, 12);
    expect(p.img.width).toBeCloseTo(1596 * p.scale, 9);
    expect(p.img.height).toBeCloseTo(2592 * p.scale, 9);
    // 画布と外接の比が保たれる ＝ 縦横別倍率になっていない
    expect(p.img.width / p.img.height).toBeCloseTo(1596 / 2592, 12);
    expect(p.bbox.left - p.img.left).toBeCloseTo(96 * p.scale, 9);
    expect(p.bbox.top - p.img.top).toBeCloseTo(96 * p.scale, 9);
  });

  it('中間の盤面辺でも一意・連続・単調（表引きや分岐を持たない）', () => {
    let prevH = 0;
    for (let side = 200; side <= 460; side++) {
      const p = attackPlacement(0, 0, side);
      expect(p.bbox.height).toBe(Math.floor(side * 0.63 + 0.5));
      expect(p.bbox.width).toBe(Math.floor((p.bbox.height * 1404) / 2400 + 0.5));
      expect(p.bbox.height).toBeGreaterThanOrEqual(prevH); // 単調非減少
      prevH = p.bbox.height;
      // 同じ入力なら常に同じ出力
      expect(attackPlacement(0, 0, side)).toEqual(p);
    }
  });

  it('外接高はつねに盤面辺の約 0.63（占有率の比率条件が維持される）', () => {
    for (let side = 200; side <= 460; side++) {
      const p = attackPlacement(0, 0, side);
      expect(Math.abs(p.bbox.height / side - 0.63)).toBeLessThan(0.0026);
    }
  });
});
