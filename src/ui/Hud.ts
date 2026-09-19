import type { Presentation, StageState } from '../game/StageState';

/**
 * 画面上部の HUD（DOM）。
 * Stage / Objective progress / Moves / Score / Chain を出す。
 * **ゲームロジックを持たない。** 渡されたものを描くだけ。
 *
 * スコアと目的は StageState の論理値ではなく Presentation（演出の途中経過）を描く。
 * 論理値は配置した瞬間に確定してしまうので、そのまま描くと CHAIN 演出より先に
 * 最終スコアと達成マークが出てしまう。
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly stageV: HTMLElement;
  private readonly movesBox: HTMLElement;
  private readonly movesK: HTMLElement;
  private readonly movesV: HTMLElement;
  private readonly scoreV: HTMLElement;
  private readonly chainV: HTMLElement;
  private readonly objectives: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-row">
        <div class="hud-box grow hud-stage"><div class="k">STAGE</div><div class="v" id="hudStage">-</div></div>
        <div class="hud-box" id="movesBox"><div class="k">MOVES</div><div class="v" id="hudMoves">-</div></div>
        <div class="hud-box grow"><div class="k">SCORE</div><div class="v" id="hudScore">0</div></div>
        <div class="hud-box" id="chainBox"><div class="k">CHAIN</div><div class="v" id="hudChain">-</div></div>
      </div>
      <div id="objectives"></div>`;
    this.stageV = must('hudStage');
    this.movesBox = must('movesBox');
    this.movesK = this.movesBox.querySelector('.k') as HTMLElement;
    this.movesV = must('hudMoves');
    this.scoreV = must('hudScore');
    this.chainV = must('hudChain');
    this.objectives = must('objectives');
  }

  update(state: StageState, chainNow: number, shown: Presentation): void {
    // エンドレスはステージ番号を持たず、手数も減らない。
    // **残り手数の代わりに、いま何手目かを出す。**（∞ とだけ出しても読み取れない）
    const endless = state.def.endless === true;
    this.stageV.textContent = endless ? state.def.name : `${state.def.id}. ${state.def.name}`;
    this.movesK.textContent = endless ? 'TURNS' : 'MOVES';
    this.movesV.textContent = endless ? String(state.movesUsed) : String(state.moves);
    this.movesBox.classList.toggle('low', !endless && state.moves <= 2);
    this.scoreV.textContent = String(shown.score);
    this.chainV.textContent = chainNow > 0 ? String(chainNow) : '-';

    this.objectives.innerHTML = shown.objectives
      .map(
        (p) =>
          `<div class="obj${p.done ? ' done' : ''}">` +
          `<span class="mark">${p.done ? '✔' : '○'}</span>` +
          `<span class="lbl">${escapeHtml(p.objective.label)}</span>` +
          `<span class="num">${p.current} / ${p.target}</span></div>`,
      )
      .join('');
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
