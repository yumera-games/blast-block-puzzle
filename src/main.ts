import Phaser from 'phaser';
import { GameScene, type SceneHooks } from './scenes/GameScene';
import { Hud } from './ui/Hud';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { DebugPanel } from './ui/DebugPanel';
import { PlayMetrics } from './ui/PlayMetrics';
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
/** 人間プレイ観察用。メモリ上だけで、外部送信も永続化もしない。 */
const metrics = new PlayMetrics();
const tutorial = new TutorialOverlay($('hint'));
const overlay = $('overlay');
const overlayCard = $('overlayCard');

let currentStage = FIRST_STAGE;
let layout: Layout = computeLayout(360, 640, 1);

const hooks: SceneHooks = {
  onUpdate(state, chainNow, shown) {
    const hint = tutorial.currentHint(state);
    scene.setHint(hint);
    tutorial.renderHintText(hint);
    hud.update(state, chainNow, shown);
    // HUD とヒント行の高さは、目的の本数やヒント文の折り返しで変わる。
    // canvas の寸法はそのとき残っていた高さから決めているので、作り直さないと
    // canvas が #stage-wrap をはみ出し、objective 行の上へ重なってしまう。
    fitToAvailableSpace();
    debug.render({ state, lastResult: state.lastResult, chainNow, fps: Math.round(game.loop.actualFps) });
  },
  onPreview(key, preview) {
    // キーはシーンが作った `trayIndex:row:col` をそのまま使う。
    // 予告の内容から作り直すと、別の座標が同じ 1 件にまとめられてしまう。
    metrics.onPreview(key, preview);
  },
  onPlaced(state, result, shownPreview) {
    metrics.onPlaced(state, result, shownPreview);
  },
  onIllegalDrop() {
    metrics.onIllegalDrop();
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

const debug = new DebugPanel(
  $('debug'),
  (id) => {
    currentStage = id;
    hideCard();
    scene.loadStage(id);
  },
  () => metrics.toJSON(),
);


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

/** 直前に layout を決めたときの表示領域。変わっていなければ計算し直さない。 */
let lastAvail = { w: -1, h: -1 };

function resize(): void {
  const wrap = $('stage-wrap');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const availW = wrap.clientWidth || window.innerWidth;
  const availH = wrap.clientHeight || window.innerHeight * 0.6;
  lastAvail = { w: availW, h: availH };
  layout = computeLayout(availW, availH, dpr);

  game.scale.setZoom(1 / dpr);
  game.scale.resize(layout.width, layout.height);
  game.canvas.style.width = `${layout.cssWidth}px`;
  game.canvas.style.height = `${layout.cssHeight}px`;
  scene.applyLayout(layout);
}

/**
 * 表示領域が変わっていたら layout を作り直す。
 *
 * **canvas の大きさは #stage-wrap の実寸から決まる。** ところが #stage-wrap の高さは
 * HUD（目的の本数）とヒント行（折り返し行数）で変わるため、ステージを切り替えたり
 * ヒントが出入りしたりすると、前の高さのまま作った canvas がはみ出す。
 * #stage-wrap は overflow: visible・align-items: center なので、はみ出しは上下へ均等に出て、
 * DOM 順で後ろにある canvas が objective 行の上へ描かれてしまう。
 *
 * #stage-wrap の高さは flex の残り幅で決まり canvas の大きさには依存しないので、
 * ここから resize() を呼んでも再帰しない（次の呼び出しでは寸法が一致して何もしない）。
 */
function fitToAvailableSpace(): void {
  const wrap = $('stage-wrap');
  if (wrap.clientWidth === lastAvail.w && wrap.clientHeight === lastAvail.h) return;
  resize();
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
    // 教材ステージだけ「いま盤面で何が起きたか」を答え合わせする。文言はステージデータ側。
    body: state.def.tutorial.outro,
    stats: `SCORE ${state.score}   MOVES USED ${state.movesUsed}   MAX CHAIN ${state.maxChain}`,
    buttons: isLast
      ? [
          { label: 'RETRY', onClick: () => retryStage() },
          { label: 'STAGE 1', primary: true, onClick: () => goStage(FIRST_STAGE) },
        ]
      : [
          { label: 'RETRY', onClick: () => retryStage() },
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
    buttons: [{ label: 'RETRY', primary: true, onClick: () => retryStage() }],
  });
}

function retryStage(): void {
  metrics.begin(currentStage, true);
  scene.retry();
}

function goStage(id: number): void {
  currentStage = Math.max(FIRST_STAGE, Math.min(LAST_STAGE, id));
  metrics.begin(currentStage, false);
  scene.loadStage(currentStage);
}

/* -------------------------------------------------------------------- 操作 */

$('btnRetry').addEventListener('click', () => {
  hideCard();
  tutorial.forgetIntro(currentStage);
  metrics.begin(currentStage, true);
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
  metrics.begin(currentStage, false);
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
  /** 計測 JSON（DBG と同じもの）。自動確認から読むため。 */
  metrics: () => metrics.toJSON(),
  /** 直前の resolution の要約（自動確認から意図したルールが起きたか読むため）。 */
  last: () => {
    const r = scene.stageState.lastResult;
    if (!r) return null;
    return {
      maxChain: r.maxChain,
      lines: r.rowsCleared + r.colsCleared,
      simultaneous: Math.max(0, ...r.events.map((e) => e.lines.length)),
      blastSizes: r.events.flatMap((e) => e.blasts.map((b) => b.size)),
      effects: r.events.flatMap((e) => e.detonations.map((d) => d.effect)),
      waveScores: r.events.map((e) => e.score),
      created: [...r.specialsCreated],
      detonated: [...r.specialsDetonated],
      aborted: r.aborted,
    };
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
