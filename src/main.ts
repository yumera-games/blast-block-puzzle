import Phaser from 'phaser';
import { GameScene, type SceneHooks } from './scenes/GameScene';
import { Hud } from './ui/Hud';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { DebugPanel } from './ui/DebugPanel';
import { computeLayout, type Layout } from './ui/layout';
import { FIRST_STAGE, LAST_STAGE, STAGES } from './data/stages';
import type { StageState } from './game/StageState';

/**
 * Phase 1 Gray Box のエントリポイント。
 *
 * 役割は「DOM の UI」と「Phaser のシーン」を繋ぐことだけ。
 * ゲームのルールはここに 1 行も書かない（src/game 以下に閉じている）。
 */

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const hud = new Hud($('hud'));
const tutorial = new TutorialOverlay($('hint'));
const overlay = $('overlay');
const overlayCard = $('overlayCard');

let currentStage = FIRST_STAGE;
let layout: Layout = computeLayout(360, 640, 1);

const hooks: SceneHooks = {
  onUpdate(state, chainNow) {
    const hint = tutorial.currentHint(state);
    scene.setHint(hint);
    tutorial.renderHintText(hint);
    hud.update(state, chainNow);
    debug.render({ state, lastResult: state.lastResult, chainNow, fps: Math.round(game.loop.actualFps) });
  },
  onStageStart(state) {
    const intro = tutorial.takeIntro(state.def);
    if (intro) showCard({ title: `STAGE ${state.def.id}`, body: intro, buttons: [{ label: 'START', primary: true }] });
    else hideCard();
  },
  onStageEnd(state) {
    if (state.status === 'cleared') showClear(state);
    else showFailed(state);
  },
};

const scene = new GameScene(hooks);

const debug = new DebugPanel($('debug'), (id) => {
  currentStage = id;
  hideCard();
  scene.loadStage(id);
});

const game = new Phaser.Game({
  type: Phaser.CANVAS, // Gray Box は矩形だけなので CANVAS で十分（依存を減らす）
  parent: 'game',
  width: layout.width,
  height: layout.height,
  backgroundColor: '#14161c',
  scene: scene,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / layout.dpr },
  banner: false,
  audio: { noAudio: true },
});

/* ------------------------------------------------------------------ 画面サイズ */

function resize(): void {
  const wrap = $('stage-wrap');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const availW = wrap.clientWidth || window.innerWidth;
  const availH = wrap.clientHeight || window.innerHeight * 0.6;
  layout = computeLayout(availW, availH, dpr);

  game.scale.setZoom(1 / dpr);
  game.scale.resize(layout.width, layout.height);
  game.canvas.style.width = `${layout.cssWidth}px`;
  game.canvas.style.height = `${layout.cssHeight}px`;
  scene.applyLayout(layout);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

/* -------------------------------------------------------------- オーバーレイ */

interface CardButton {
  readonly label: string;
  readonly primary?: boolean;
  readonly onClick?: () => void;
}

function showCard(opts: { title: string; titleClass?: string; body?: string; stats?: string; buttons: CardButton[] }): void {
  overlayCard.innerHTML =
    `<h2 class="${opts.titleClass ?? ''}">${escapeHtml(opts.title)}</h2>` +
    (opts.body ? `<p>${escapeHtml(opts.body)}</p>` : '') +
    (opts.stats ? `<div class="stats">${escapeHtml(opts.stats)}</div>` : '') +
    `<div class="btns">${opts.buttons
      .map((b, i) => `<button class="btn${b.primary ? ' primary' : ''}" data-i="${i}">${escapeHtml(b.label)}</button>`)
      .join('')}</div>`;
  overlayCard.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-i'));
      hideCard();
      opts.buttons[i]?.onClick?.();
    });
  });
  overlay.classList.add('on');
}

function hideCard(): void {
  overlay.classList.remove('on');
}

function showClear(state: StageState): void {
  const isLast = state.def.id >= LAST_STAGE;
  showCard({
    title: 'STAGE CLEAR',
    titleClass: 'ok',
    stats: `SCORE ${state.score}   MOVES USED ${state.movesUsed}   MAX CHAIN ${state.maxChain}`,
    buttons: isLast
      ? [
          { label: 'RETRY', onClick: () => scene.retry() },
          { label: 'STAGE 1', primary: true, onClick: () => goStage(FIRST_STAGE) },
        ]
      : [
          { label: 'RETRY', onClick: () => scene.retry() },
          { label: 'NEXT STAGE', primary: true, onClick: () => goStage(state.def.id + 1) },
        ],
  });
}

function showFailed(state: StageState): void {
  const reason = state.moves <= 0 ? 'MOVES がなくなりました' : 'どの候補も置けません';
  showCard({
    title: 'FAILED',
    titleClass: 'ng',
    body: reason,
    stats: `SCORE ${state.score}`,
    buttons: [{ label: 'RETRY', primary: true, onClick: () => scene.retry() }],
  });
}

function goStage(id: number): void {
  currentStage = Math.max(FIRST_STAGE, Math.min(LAST_STAGE, id));
  scene.loadStage(currentStage);
}

/* -------------------------------------------------------------------- 操作 */

$('btnRetry').addEventListener('click', () => {
  hideCard();
  tutorial.forgetIntro(currentStage);
  scene.retry();
});

$('btnStages').addEventListener('click', () => {
  showCard({
    title: 'STAGE SELECT',
    buttons: STAGES.map((s) => ({ label: `${s.id}`, onClick: () => goStage(s.id) })),
  });
});

$('btnDebug').addEventListener('click', () => {
  const on = debug.toggle();
  $('btnDebug').textContent = on ? 'DBG*' : 'DBG';
});

/* ------------------------------------------------------------------ 立ち上げ */

game.events.once('ready', () => {
  resize();
  scene.loadStage(currentStage);
});

// 検証用の入口。Phase 1 の自動確認（Playwright など）から状態を読むために出す。
declare global {
  interface Window {
    __blast?: unknown;
  }
}
window.__blast = {
  scene,
  goStage,
  retry: () => scene.retry(),
  toggleDebug: () => debug.toggle(),
  state: () => {
    const s = scene.stageState;
    return {
      stage: s.def.id,
      status: s.status,
      score: s.score,
      moves: s.moves,
      maxChain: s.maxChain,
      busy: scene.isBusy,
      board: s.board.toStrings(),
      tray: s.tray.map((p) => p && { shape: p.shape.id, color: p.color }),
      objectives: s.objectiveProgress().map((o) => ({ label: o.objective.label, current: o.current, target: o.target })),
      layout,
    };
  },
  place: (trayIndex: number, row: number, col: number) => scene.stageState.canPlace(trayIndex, row, col),
  /** 直前の resolution の要約（自動確認から意図したルールが起きたか読むため）。 */
  last: () => {
    const r = scene.stageState.lastResult;
    if (!r) return null;
    return {
      maxChain: r.maxChain,
      lines: r.rowsCleared + r.colsCleared,
      simultaneous: Math.max(0, ...r.events.map((e) => e.lines.length)),
      blastSizes: r.events.flatMap((e) => e.blasts.map((b) => b.size)),
      created: [...r.specialsCreated],
      detonated: [...r.specialsDetonated],
      aborted: r.aborted,
    };
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
