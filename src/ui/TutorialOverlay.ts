import type { StageDef, TutorialHint } from '../data/stages';
import type { StageState } from '../game/StageState';

/**
 * チュートリアル。**文言はステージデータ側に持ち、ここには書かない。**
 *
 * Stage 1〜3 は推奨配置セルを常時出す。Stage 4 以降は原則として出さず、
 * 新システムが出るステージだけ intro を一度表示する。
 */
export class TutorialOverlay {
  private readonly root: HTMLElement;
  private introShownFor = new Set<number>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** ステージ開始時の説明。まだ出していなければ表示する。 */
  takeIntro(def: StageDef): string | null {
    if (!def.tutorial.intro) return null;
    if (this.introShownFor.has(def.id)) return null;
    this.introShownFor.add(def.id);
    return def.tutorial.intro;
  }

  /** リトライ時に intro を出し直したい場合に使う。 */
  forgetIntro(stageId: number): void {
    this.introShownFor.delete(stageId);
  }

  /** いま出すべき推奨配置。ガイド無しステージでは常に null。 */
  currentHint(state: StageState): TutorialHint | null {
    const t = state.def.tutorial;
    if (!t.showGuide || !t.hints) return null;
    const hint = t.hints.find((h) => h.move === state.movesUsed);
    if (!hint) return null;
    // 推奨したピースがもう無い、または置けないならガイドを出さない。
    if (!state.tray[hint.pieceIndex]) return null;
    if (!state.canPlace(hint.pieceIndex, hint.row, hint.col)) return null;
    return hint;
  }

  /** ヒント文を盤面下の一行として出す。 */
  renderHintText(hint: TutorialHint | null): void {
    this.root.textContent = hint?.text ?? '';
    this.root.style.display = hint?.text ? 'block' : 'none';
  }
}
