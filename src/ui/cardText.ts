import { LAST_STAGE, STAGES } from '../data/stages';
import { isUnlocked, type Progress } from '../game/progress';
import { recordFor, type Records } from '../game/records';
import type { Stats } from '../game/stats';

/**
 * カードに出す文と一覧の組み立て（工程 W-4）。
 *
 * **DOM を触らない純粋関数だけを置く。** 文言と状態の決め方をここへ集めておけば、
 * 実ブラウザを起こさずに「全クリア後に『つぎは』を出さない」「未解放の記録を出さない」
 * といった条件をそのまま試験できる。描画は main.ts の仕事。
 */

/** 全ステージをクリアしたか。**進行データの `cleared` だけで決める。** */
export function allCleared(p: Progress): boolean {
  return p.cleared >= LAST_STAGE;
}

/**
 * タイトルの本文。
 *
 * **全クリア後に「つぎは ステージ N」を出さない。** 次の通常ステージはもう無いので、
 * 「つづきから」が何を開くのかだけを示す。
 */
export function titleBody(p: Progress, s: Stats): string {
  if (p.cleared <= 0) return 'ブロックを ならべて ラインを けそう';
  const lines: string[] = [];
  if (allCleared(p)) {
    lines.push(`ぜん ${LAST_STAGE} ステージ クリア`);
    lines.push(`つづきから は ステージ ${p.current}`);
    if (s.endlessBest > 0) lines.push(`エンドレス さいこう ${s.endlessBest}`);
  } else {
    lines.push(`ステージ ${p.cleared} まで クリア`);
    lines.push(`つぎは ステージ ${p.current}`);
  }
  return lines.join('\n');
}

/** ステージ選択 1 行ぶんの表示内容。**未解放の行は中身を持たない。** */
export interface StageRow {
  readonly id: number;
  /** ステージ名。**未解放では null**（内部データを画面へ出さない）。 */
  readonly name: string | null;
  readonly locked: boolean;
  readonly cleared: boolean;
  /** いま選ばれているステージか。色だけでなく文字でも示すために持つ。 */
  readonly current: boolean;
  /** 未クリア／未解放では null。 */
  readonly bestScore: number | null;
  readonly clearCount: number | null;
  /** 状態の短い表示（未解放 / 未クリア / クリア済み）。 */
  readonly label: string;
}

/**
 * ステージ選択の一覧。**12 件すべてを返す。**
 * 未解放も行としては出すが、名前も記録も持たせない（何件あるかだけが分かる）。
 * `devMode` では全件を解放して扱う（開発用。通常のプレイヤーには影響しない）。
 */
export function stageRows(
  p: Progress,
  r: Records,
  currentStage: number,
  opts: { devMode?: boolean } = {},
): StageRow[] {
  return STAGES.map((st) => {
    const locked = !(opts.devMode === true || isUnlocked(p, st.id));
    const cleared = !locked && st.id <= p.cleared;
    const rec = locked ? null : recordFor(r, st.id);
    return {
      id: st.id,
      name: locked ? null : st.name,
      locked,
      cleared,
      current: !locked && st.id === currentStage,
      bestScore: rec ? rec.bestScore : null,
      clearCount: rec ? rec.clearCount : null,
      label: locked ? '未解放' : cleared ? 'クリア済み' : '未クリア',
    };
  });
}
