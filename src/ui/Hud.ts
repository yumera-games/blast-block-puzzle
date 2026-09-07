import type { StageState } from '../game/StageState';

/**
 * 画面上部の HUD（DOM）。
 * Stage / Objective progress / Moves / Score / Chain を出す。
 * **ゲームロジックを持たない。** StageState を読むだけ。
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly stageV: HTMLElement;
  private readonly movesBox: HTMLElement;
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
    this.movesV = must('hudMoves');
    this.scoreV = must('hudScore');
    this.chainV = must('hudChain');
    this.objectives = must('objectives');
  }

  update(state: StageState, chainNow: number): void {
    this.stageV.textContent = `${state.def.id}. ${state.def.name}`;
    this.movesV.textContent = String(state.moves);
    this.movesBox.classList.toggle('low', state.moves <= 2);
    this.scoreV.textContent = String(state.score);
    this.chainV.textContent = chainNow > 0 ? String(chainNow) : '-';

    const progress = state.objectiveProgress();
    this.objectives.innerHTML = progress
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
