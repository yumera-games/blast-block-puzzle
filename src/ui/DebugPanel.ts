import type { StageState } from '../game/StageState';
import type { ResolutionResult } from '../game/types';
import { STAGES } from '../data/stages';

export interface DebugInfo {
  readonly state: StageState;
  readonly lastResult: ResolutionResult | null;
  readonly chainNow: number;
  readonly fps: number;
}

/**
 * デバッグ表示。**簡単に ON / OFF できること**が要件。
 * seed / chain / last resolution / line count / color blast size / Safe-Risky-Dead を出す。
 */
export class DebugPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private enabled = false;

  constructor(root: HTMLElement, onJumpStage: (id: number) => void) {
    this.root = root;
    this.root.innerHTML = `<div class="body"><div id="dbgRows"></div>
      <div class="stage-jump" id="dbgJump"></div></div>`;
    this.body = this.root.querySelector('#dbgRows') as HTMLElement;

    const jump = this.root.querySelector('#dbgJump') as HTMLElement;
    jump.innerHTML = STAGES.map((s) => `<button data-stage="${s.id}">S${s.id}</button>`).join('');
    jump.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const id = t.getAttribute('data-stage');
      if (id) onJumpStage(Number(id));
    });
  }

  get on(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.root.classList.toggle('on', this.enabled);
    return this.enabled;
  }

  render(info: DebugInfo): void {
    if (!this.enabled) return;
    const s = info.state;
    const r = info.lastResult;
    const lastLines = r ? r.rowsCleared + r.colsCleared : 0;
    const blastSizes = r ? r.events.flatMap((e) => e.blasts.map((b) => `${b.size}${b.band[0]}`)) : [];
    const detonations = r ? r.events.flatMap((e) => e.detonations.map((d) => d.effect)) : [];

    this.body.innerHTML = [
      row('seed', String(s.seed)),
      row('set / eval', `${s.setsDealt} / <span class="v ${s.setEvaluation}">${s.setEvaluation}</span>`),
      row('moves', `${s.moves} (used ${s.movesUsed})`),
      row('chain now / max', `${info.chainNow} / ${s.maxChain}`),
      row('last lines', String(lastLines)),
      row('color blast', blastSizes.length ? blastSizes.join(' ') : '-'),
      row('detonations', detonations.length ? detonations.join(' ') : '-'),
      row('last score', r ? String(r.totalScore) : '-'),
      row('last cleared', r ? String(r.totalCleared) : '-'),
      row('aborted', r ? String(r.aborted) : '-'),
      row('board filled', `${s.board.countFilled()} / ${s.board.size}`),
      row('specials', String(s.board.specialIndices().length)),
      row('status', s.status),
      row('fps', String(info.fps)),
    ].join('');
  }
}

function row(k: string, v: string): string {
  return `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}
