import Phaser from 'phaser';
import { GameScene, type SceneHooks } from './scenes/GameScene';
import { Hud } from './ui/Hud';
import { TutorialOverlay } from './ui/TutorialOverlay';
import type { AttackPlacement } from './game/attack';
import { isUnlocked, loadProgress, saveProgress, withCleared, withCurrent } from './game/progress';
import { loadSettings, saveSettings } from './game/settings';
import { ENDLESS_ID, createEndlessStage, newEndlessSeed } from './game/endless';
import { loadStats, saveStats, withAllClear, withEndlessRun } from './game/stats';
import { Sfx, createWebAudioBackend } from './audio/sfx';
import { DebugPanel } from './ui/DebugPanel';
import { PlayMetrics } from './ui/PlayMetrics';
import { computeLayout, type Layout } from './ui/layout';
import { previewPlacement } from './game/Preview';
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

/** 保存された進行。**壊れていても既定値で起動する**（progress.ts）。 */
let progress = loadProgress();
let currentStage = progress.current;

/** プレイ記録（工程 W-3）。**進行データとも音設定とも別のキー**（stats.ts）。 */
let stats = loadStats();

/** いまエンドレスを遊んでいるか。**進行データには一切書かない。** */
let endlessMode = false;

/** 音の設定。**進行データとは別のキー**（settings.ts）。 */
let settings = loadSettings();
/** 効果音。**最初のユーザー操作まで AudioContext を作らない。** */
const sfx = new Sfx(createWebAudioBackend(), { enabled: settings.sound });

/** 開発用 UI を出すか。`?debug=1`（または `#debug`）のときだけ。
 *  **消すのではなく、通常のプレイヤーから隠すだけ。** */
const devMode = (() => {
  try {
    return new URLSearchParams(location.search).get('debug') === '1' || location.hash === '#debug';
  } catch {
    return false;
  }
})();
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
  onAttack(placement) {
    setAttack(placement);
  },
  onSfx(name) {
    sfx.play(name);
  },
  onStageStart(state) {
    // RETRY・STAGE SELECT・次ステージのいずれもここを通る。失敗演出を捨てる。
    clearFailEffect();
    // 新しい手番なので「この結果で 1 回」をやり直す。古い予約音も持ち越さない。
    sfx.cancel();
    preloadFigure();
    preloadAttack();
    const intro = tutorial.takeIntro(state.def);
    // エンドレスはステージ番号を持たないので、見出しに番号を出さない。
    const title = state.def.endless ? state.def.name : `STAGE ${state.def.id}`;
    if (intro) showCard({ title, body: intro, buttons: [{ label: 'START', primary: true }] });
    else hideCard();
  },
  onStageEnd(state) {
    // エンドレスは進行データを一切動かさない。終わりは「置けなくなったとき」だけ。
    if (endlessMode) {
      sfx.play('fail');
      endEndlessRun(state);
      return;
    }
    // クリアしたら進行を進める。**失敗では進めない。**演出の途中経過は保存しない。
    if (state.status === 'cleared') {
      progress = withCleared(progress, state.def.id);
      saveProgress(progress);
      sfx.play('clear');
    } else if (state.status === 'failed') {
      sfx.play('fail');
    }
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
  // **canvas を塗りつぶさない**（工程 W-3）。盤面・トレイはそれぞれ自前の面を描くので、
  // 残るのは盤面の外側の余白だけになり、そこへ CSS の静的背景がそのまま見える。
  // 背景を canvas 側にも描くと二重管理になるため、**背景は CSS の 1 か所だけ**にする。
  transparent: true,
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
  if (boardDim.classList.contains('on')) placeBoardDim();
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

/* ------------------------------------------------------------ 人物画像（装飾） */

/**
 * 勝利リザルトにだけ出す装飾。**情報ではない。**
 * 読めなくても結果画面が成立することを壊さない（2B 4-1 / 4-10-1）。
 * 表示は 125x296 CSS px 固定で、人物外接の実表示高は 274px（2B 4-2）。
 */
const FIGURE_W = 125;
const FIGURE_H = 296;
// public/ はそのまま配信されるので、base './' を壊さない BASE_URL から組み立てる。
const FIGURE_BASE = `${import.meta.env.BASE_URL}characters/`;
/** 方式 A の受け入れ済み静止画。**削除しない。**方式 C が読めないときのフォールバック
 *  として残す（2B 7-3-1 の「将来シイを独立して動かす場合の方針」2）。 */
const FIGURE_1X = `${FIGURE_BASE}nei-result-1x.webp`;
const FIGURE_2X = `${FIGURE_BASE}nei-result-2x.webp`;
/** 方式 C の 3 レイヤー。**重ね順は head ＞ upper ＞ lower**（2B 7-4-1 の 5-1）。
 *  DOM の後ろほど手前になるので、この配列の順に書き出す。 */
const FIGURE_LAYERS = ['lower', 'upper', 'head'] as const;

/** 320〜374px では出さない（2B 4-16 の案 1）。**先読みもしない。** */
function figureAllowed(): boolean {
  return window.matchMedia('(min-width: 375px)').matches;
}

/** 取得に失敗したと分かっている間は、最初から差し込まない。 */
let figureBroken = false;

function layerSrc(name: string, scale: '1x' | '2x'): string {
  return `${FIGURE_BASE}nei-result-${name}-${scale}.webp`;
}

/** ステージ開始時に読んでおく。結果画面の表示を待たせない（2B 4-10-1）。
 *  **フォールバックの静止画は先読みしない。**1 端末が取る 1 セットを増やさない
 *  （2B 7-3-1 の 7）。 */
/** attack の配信用派生を先読みする。**srcset なので 1 端末が取るのは 1 点だけ。** */
function preloadAttack(): void {
  if (attackBroken) return;
  const img = new Image();
  img.srcset = `${ATTACK_1X} 1x, ${ATTACK_2X} 2x`;
  img.src = ATTACK_1X;
}

function preloadFigure(): void {
  if (figureBroken || !figureAllowed()) return;
  for (const name of FIGURE_LAYERS) {
    const img = new Image();
    img.srcset = `${layerSrc(name, '1x')} 1x, ${layerSrc(name, '2x')} 2x`;
    img.src = layerSrc(name, '1x');
  }
}

/**
 * alt は空、aria-hidden は true。**装飾なので支援技術へ読ませない**（2B 4-18）。
 * width / height 属性を付けて、読み込み中でもレイアウトが動かないようにする。
 *
 * 入れ子は 2 関節の骨組み（2B 7-4-1 の 4・6）。
 *   .figStack … 呼吸 0.6% を**ここ 1 か所だけ**に当てる（6 の 1〜7）
 *   .layUpper … talk の上体反応。基準は腰 y=1370（master）
 *   .layHead  … 上体に追従したうえでの首の追加回転。基準は首 y=470（master）
 * head を upper の子にしているので、**上体が動いても首が離れない。**
 */
function figureHtml(force = false): string {
  if (figureBroken || (!force && !figureAllowed())) return '';
  const lay = (name: string): string =>
    `<img class="lay lay-${name}" alt="" aria-hidden="true" width="${FIGURE_W}" height="${FIGURE_H}" ` +
    `src="${layerSrc(name, '1x')}" srcset="${layerSrc(name, '1x')} 1x, ${layerSrc(name, '2x')} 2x">`;
  return (
    '<div class="fig"><div class="figStack">' +
    lay('lower') +
    `<div class="layUpper">${lay('upper')}<div class="layHead">${lay('head')}</div></div>` +
    '</div></div>'
  );
}

/**
 * レイヤーが 1 枚でも読めなければ、**受け入れ済みの静止画 1 枚へ戻す**。
 * その静止画も読めなければ枠ごと消す。125x296 の空白を残さない（2B 4-10-1）。
 */
function watchFigure(): void {
  const stack = overlayCard.querySelector<HTMLElement>('.figStack');
  if (!stack) return;
  const dropFigure = (): void => {
    figureBroken = true;
    stack.closest('.fig')?.remove();
  };
  const toFlat = (): void => {
    if (stack.classList.contains('flat')) return;
    stack.classList.add('flat');
    stack.innerHTML =
      `<img alt="" aria-hidden="true" width="${FIGURE_W}" height="${FIGURE_H}" ` +
      `src="${FIGURE_1X}" srcset="${FIGURE_1X} 1x, ${FIGURE_2X} 2x">`;
    stack.querySelector('img')?.addEventListener('error', dropFigure);
  };
  stack.querySelectorAll('img').forEach((img) => img.addEventListener('error', toFlat));
}

/* ------------------------------------------------ ネイの attack（2B 7-5-9） */

/** 配信用派生。**srcset で 1 端末が取るのは片方だけ**（2B 7-5-2 の 5）。 */
const ATTACK_1X = `${FIGURE_BASE}nei-attack-1x.webp`;
const ATTACK_2X = `${FIGURE_BASE}nei-attack-2x.webp`;

/**
 * attack の表示要素。**document flow へ参加しない。**
 * `position: fixed` なので HUD・目的欄・ヒント行・操作列・canvas の矩形を変えない。
 * 装飾なので `aria-hidden`、操作を遮らないよう `pointer-events: none`。
 *
 * **`idle` は「この要素が非表示の状態」**（2B 7-5-9。常時表示の idle 素材は無い）。
 * 要素は 1 つだけ作り、出し入れで使い回す。勝利カードの `.figStack` とは別物で、
 * 互いに触らない。
 */
const attackImg = document.createElement('img');
attackImg.id = 'attackFigure';
attackImg.alt = '';
attackImg.setAttribute('aria-hidden', 'true');
attackImg.decoding = 'async';
attackImg.src = ATTACK_1X;
attackImg.srcset = `${ATTACK_1X} 1x, ${ATTACK_2X} 2x`;
document.body.appendChild(attackImg);

/** 取得に失敗したら二度と出さない。**ゲーム進行は止めない**（2B 7-3-1 の 6）。 */
let attackBroken = false;
attackImg.addEventListener('error', () => {
  attackBroken = true;
  attackImg.classList.remove('on');
});

/**
 * attack の出し入れ。**表示の責務はこの関数 1 つだけ。**
 * 後から reduced-motion の分岐を足すときも、ここ 1 か所で済むようにしている
 * （具体値は未確定。2B 7-5-9 の 12）。
 */
function setAttack(place: AttackPlacement | null): void {
  if (!place || attackBroken) {
    attackImg.classList.remove('on');
    return;
  }
  // GameScene は **canvas 左上を原点**にした値を渡す。`position: fixed` は
  // viewport 原点なので、ここで canvas の現在位置を足す。
  // 小数 CSS px のまま渡す。丸めるのは外接の幅・高さと R・B だけ（2B 7-5-9 の 5）。
  const canvas = document.querySelector('#game canvas');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  attackImg.style.left = `${r.left + place.img.left}px`;
  attackImg.style.top = `${r.top + place.img.top}px`;
  attackImg.style.width = `${place.img.width}px`;
  attackImg.style.height = `${place.img.height}px`;
  attackImg.classList.add('on');
}

/* --------------------------------------------------- ネイの talk（2B 7-4-1） */

/** 確定台詞は 1 文だけ（2B 7-4-1 の 3）。**2 文目以降は未確定なので作らない。** */
const TALK_SPEAKER = 'ネイ';
const TALK_LINE = '記録完了。次も確かめよう。';
/** カード表示から台詞を出すまで。**仮値。**7-4-1 の 9 の 2 は未確定のまま。 */
const TALK_DELAY_MS = 220;

/** A 案 1 行（2B 7-4-1 の 2）。**320px でも出す。**人物の有無とは別（同 2）。 */
function talkHtml(): string {
  return (
    '<div class="talk">' +
    `<span class="who">${escapeHtml(TALK_SPEAKER)}</span>` +
    `<span class="line">${escapeHtml(TALK_LINE)}</span>` +
    '</div>'
  );
}

/** talk 用の未完了タイマー。破棄の条件は 7-4-1 の 7。 */
let talkTimers: number[] = [];
/** カードが差し替わったことを検出する通し番号。detached DOM を触らないために使う。 */
let cardSerial = 0;

function cancelTalkTimers(): void {
  talkTimers.forEach((id) => clearTimeout(id));
  talkTimers = [];
}

/**
 * 台詞と M2 の上体反応を始める。**進行の条件にはしない**（7-3-1 の 6）。
 * `prefers-reduced-motion` では**待たせずに台詞だけ出す**（7-4-1 の 6 の 11）。
 * 動きの停止は CSS 側のメディアクエリが行う。
 */
function startTalk(): void {
  cancelTalkTimers();
  const serial = cardSerial;
  const run = (): void => {
    // 別のカードへ変わっている／閉じているなら何もしない（7-4-1 の 7 の 4・5）。
    if (serial !== cardSerial || !overlay.classList.contains('on')) return;
    overlayCard.classList.add('talking');
  };
  if (reduceMotion()) {
    run();
    return;
  }
  talkTimers.push(window.setTimeout(run, TALK_DELAY_MS));
}

/* ------------------------------------------------------ 失敗 A の演出（3-16-4） */

/**
 * **盤面 canvas の表示領域だけ**を覆う暗転。HUD・操作列・結果カードは対象にしない。
 * 盤面の画素は書き換えず、上へ半透明の面を重ねるだけ（2B 3-16-4-1 の 8）。
 */
const boardDim = document.createElement('div');
boardDim.id = 'boardDim';
boardDim.setAttribute('aria-hidden', 'true');
document.body.appendChild(boardDim);

/** 失敗演出の未完了タイマー。破棄の条件は 3-16-4-1 の 10。 */
let failTimers: number[] = [];

const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 保留中のタイマーだけ捨てる。**暗転は消さない**（210ms のカード表示で使うため）。 */
function cancelFailTimers(): void {
  failTimers.forEach((id) => clearTimeout(id));
  failTimers = [];
}

/** タイマーも暗転も捨てる。ステージが変わるときと、カードを閉じるとき。 */
function clearFailEffect(): void {
  cancelFailTimers();
  boardDim.classList.remove('on', 'instant');
}

/** 盤面の矩形へ合わせる。layout は**デバイスピクセル**なので dpr で割る。 */
function placeBoardDim(): void {
  const r = game.canvas.getBoundingClientRect();
  const k = 1 / layout.dpr;
  boardDim.style.left = `${r.left + layout.boardX * k}px`;
  boardDim.style.top = `${r.top + layout.boardY * k}px`;
  boardDim.style.width = `${layout.boardW * k}px`;
  boardDim.style.height = `${layout.boardH * k}px`;
}

/* -------------------------------------------------------------- オーバーレイ */

interface CardButton {
  readonly label: string;
  readonly primary?: boolean;
  /** 行いっぱいに広げる。ボタンが 3 個以上になるカードで、320px でも文字を潰さない。 */
  readonly wide?: boolean;
  readonly onClick?: () => void;
}

function showCard(opts: {
  title: string;
  titleClass?: string;
  /** カードに足すクラス。勝利だけ 'win'（2B 3-16-2 の面色）。毎回入れ替える。 */
  cardClass?: string;
  /** 人物画像を見出しの下へ入れる。勝利リザルトだけ true（2B 4-1 / 4-7）。 */
  figure?: boolean;
  /** ネイの talk 欄を人物の直下へ入れる。勝利リザルトだけ true（2B 7-4-1 の 2）。 */
  talk?: boolean;
  body?: string;
  stats?: string;
  /** ボタン列の前へ差し込む HTML。音 ON/OFF の切り替えに使う。 */
  extraHtml?: string;
  buttons: CardButton[];
}): void {
  // 前のカードのクラスを残さない。intro や失敗カードへ勝利の面色が移らないようにする。
  overlayCard.className = opts.cardClass ? `card ${opts.cardClass}` : 'card';
  // 幕は #overlay が持つ。勝利 `rgba(30,24,41,0.62)`（3-16-2-1）と
  // 失敗 `rgba(30,24,41,0.58)`（3-16-4-1）。ここで毎回 toggle するので、
  // 次のカードへ前の幕が残らず、勝利と失敗が同時に付くこともない。
  overlay.classList.toggle('win', opts.cardClass === 'win');
  overlay.classList.toggle('failed', opts.cardClass === 'failed');
  // タイトルだけ幕を不透明にする。**盤面を見せない。**
  overlay.classList.toggle('titleScreen', opts.cardClass === 'title');
  // 別のカードが出た時点で、保留中の失敗演出は捨てる。
  // 古いタイマーが別ステージへ失敗カードを出さないようにする（3-16-4-1 の 10）。
  cancelFailTimers();
  // talk も同じ。**前のカードの talk 状態を次のカードへ持ち越さない**（7-4-1 の 7 の 4）。
  cancelTalkTimers();
  cardSerial++;
  overlayCard.innerHTML =
    `<h2 class="${opts.titleClass ?? ''}">${escapeHtml(opts.title)}</h2>` +
    (opts.figure ? figureHtml(opts.cardClass === 'title') : '') +
    (opts.talk ? talkHtml() : '') +
    (opts.body ? `<p>${escapeHtml(opts.body)}</p>` : '') +
    (opts.stats ? `<div class="stats">${escapeHtml(opts.stats)}</div>` : '') +
    (opts.extraHtml ?? '') +
    `<div class="btns">${opts.buttons
      .map(
        (b, i) =>
          `<button class="btn${b.primary ? ' primary' : ''}${b.wide ? ' wide' : ''}" data-i="${i}">` +
          `${escapeHtml(b.label)}</button>`,
      )
      .join('')}</div>`;
  watchFigure();
  // **`data-i` を持つボタンだけ**を結線する。音トグルはカードを閉じない。
  overlayCard.querySelectorAll('button[data-i]').forEach((btn) => {
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
  // 勝利・失敗の幕も落とす。閉じている間も状態を残さない（3-16-2-1 / 3-16-4-1）。
  overlay.classList.remove('win', 'failed', 'titleScreen');
  clearFailEffect();
  // talk 反応を即時中断し、タイマーを全部捨てる（7-4-1 の 7 の 1・2）。
  // カード DOM は次の showCard で作り直すので、talk 用要素も同時に消える（同 3）。
  cancelTalkTimers();
  cardSerial++;
  overlayCard.classList.remove('talking');
}

/* ------------------------------------------------------ タイトルと音（W-2） */

/** 正式名は README と CLAUDE.md の「BLAST BLOCK」。**新しい名前を作らない。** */
const GAME_TITLE = 'BLAST BLOCK';

/** 音 ON / OFF のボタンを作る。**カードのボタン列とは別に、見出しの下へ置く。** */
function soundToggleHtml(): string {
  const on = settings.sound;
  return (
    `<button type="button" id="btnSound" class="soundToggle" ` +
    `aria-pressed="${on ? 'true' : 'false'}" aria-label="効果音を${on ? 'オフ' : 'オン'}にする">` +
    `<span class="mark" aria-hidden="true">${on ? '♪' : '✕'}</span>` +
    `<span class="lbl">おと ${on ? 'ON' : 'OFF'}</span></button>`
  );
}

/**
 * 音トグルを押したときの共通処理。
 * **タイトル・カード内のボタンと、プレイ画面の操作列のボタンは同じ設定を見る。**
 * 通常モードでもデバッグモードでも同じ。
 */
function toggleSound(): void {
  settings = { ...settings, sound: !settings.sound };
  saveSettings(settings);
  sfx.setEnabled(settings.sound);
  const inCard = document.getElementById('btnSound');
  if (inCard) {
    inCard.outerHTML = soundToggleHtml();
    bindSoundToggle();
  }
  syncSoundMain();
}

/** プレイ画面（操作列）の音ボタンを設定へ合わせる。**ラベル幅は変えない。** */
function syncSoundMain(): void {
  const btn = document.getElementById('btnSoundMain');
  if (!btn) return;
  const on = settings.sound;
  btn.textContent = on ? '♪' : '✕';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', `効果音を${on ? 'オフ' : 'オン'}にする`);
}

function bindSoundToggle(): void {
  const btn = document.getElementById('btnSound');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // 音を出す前に、必ずユーザー操作の中で AudioContext を起こす（iOS 対応）。
    sfx.unlock();
    toggleSound();
  });
}

/**
 * 結果の数字の並び。**1 行 1 項目**にして、左に項目名・右に数字で読ませる。
 * 既存の `stats` 欄は 1 行の文字列なので、項目が増えると 320px で折り返して読みにくい。
 */
function statListHtml(rows: readonly (readonly [string, string])[]): string {
  return (
    '<div class="statList">' +
    rows
      .map(([k, v]) => `<div class="statRow"><span class="k">${escapeHtml(k)}</span>` +
        `<span class="v">${escapeHtml(v)}</span></div>`)
      .join('') +
    '</div>'
  );
}

/**
 * エンドレスを遊べるか。**全ステージをクリアしたときだけ**開く。
 * 解放用の旗は作らない。進行データの `cleared` だけで決める（別の保存値を増やさない）。
 */
function endlessUnlocked(): boolean {
  return progress.cleared >= LAST_STAGE;
}

/** タイトル・ステージ選択・全クリアに出すエンドレスの入口。開発時は常に出す。 */
function endlessButton(): CardButton[] {
  if (!endlessUnlocked() && !devMode) return [];
  const best = stats.endlessBest;
  return [
    {
      label: best > 0 ? `エンドレス（さいこう ${best}）` : 'エンドレス',
      wide: true,
      onClick: () => {
        sfx.unlock();
        goEndless();
      },
    },
  ];
}

/**
 * タイトル画面。**ページを開いた直後に盤面を見せない。**
 * 既存の結果カードと同じ仕組みを使い、幕だけ不透明にする。
 * 人物は**勝利カード用のネイをそのまま再利用**する（新規画像を作らない）。
 */
function showTitle(): void {
  const hasProgress = progress.cleared > 0;
  const start = (): void => {
    // 最初のユーザー操作。ここで初めて AudioContext を起こす。
    sfx.unlock();
    hideCard();
    goStage(progress.current);
  };
  showCard({
    title: GAME_TITLE,
    cardClass: 'title',
    figure: true,
    body: hasProgress
      ? `ステージ ${progress.cleared} まで クリア\nつぎは ステージ ${progress.current}`
      : 'ブロックを ならべて ラインを けそう',
    extraHtml: soundToggleHtml(),
    buttons: hasProgress
      ? [
          { label: 'ステージをえらぶ', onClick: () => { sfx.unlock(); showStageSelect(); } },
          { label: 'つづきから', primary: true, onClick: start },
          ...endlessButton(),
        ]
      : [{ label: 'はじめる', primary: true, onClick: start }, ...endlessButton()],
  });
  bindSoundToggle();
}

/** ステージ選択。**到達済み＋次の 1 つ**まで。開発時だけ全件。 */
function showStageSelect(): void {
  const open = Math.min(LAST_STAGE, progress.cleared + 1);
  showCard({
    title: 'ステージをえらぶ',
    body: devMode ? undefined : `クリアすると つぎの ステージが ひらきます（いま ${open} まで）`,
    extraHtml: soundToggleHtml(),
    buttons: [
      ...STAGES.filter((st) => devMode || isUnlocked(progress, st.id)).map((st) => ({
        label: `${st.id}`,
        primary: st.id === currentStage && !endlessMode,
        onClick: () => goStage(st.id),
      })),
      ...endlessButton(),
    ],
  });
  bindSoundToggle();
}

/**
 * 全ステージクリアの締め。**進行データは消さない。**
 * 「もう一度あそぶ」は Stage 1 を開くだけで、クリア済みの記録はそのまま残る。
 */
function showAllClear(state: StageState): void {
  // 全クリアの回数を記録する。**進行データ（どこまで開いたか）は動かさない。**
  stats = withAllClear(stats);
  saveStats(stats);
  const times = stats.allClearCount;
  showCard({
    title: 'ぜんステージ クリア',
    titleClass: 'ok',
    cardClass: 'win',
    figure: true,
    body:
      `ぜん ${LAST_STAGE} ステージを クリアしました。\nさいごの ステージ ${state.def.id} も とっぱです。` +
      (times > 1 ? `\nぜんクリア ${times} 回目。` : '\nエンドレスが あそべるように なりました。'),
    stats: `SCORE ${state.score}   MOVES USED ${state.movesUsed}   MAX CHAIN ${state.maxChain}`,
    extraHtml: soundToggleHtml(),
    buttons: [
      { label: 'ステージをえらぶ', onClick: () => showStageSelect() },
      { label: 'もう一度あそぶ', primary: true, onClick: () => goStage(FIRST_STAGE) },
      ...endlessButton(),
    ],
  });
  bindSoundToggle();
}

function showClear(state: StageState): void {
  const isLast = state.def.id >= LAST_STAGE;
  // 最終ステージのクリアは締めの画面にする。**Stage 1 へ即座に戻さない。**
  if (isLast) {
    showAllClear(state);
    startTalk();
    return;
  }
  showCard({
    title: 'STAGE CLEAR',
    titleClass: 'ok',
    cardClass: 'win',
    figure: true,
    talk: true,
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
  // 表示のあとに始める。**カードの表示を待たせない**（7-3-1 の 6）。
  startTalk();
}

/**
 * 失敗 A（3-16-4 / 3-16-4-1）。**ゲームの失敗確定は時刻 0** で、入力は
 * `GameScene.onDown` が `status !== 'playing'` で弾いている。ここは演出だけ。
 *
 *   0〜90ms   失敗確定（すでに済んでいる）
 *   90ms      盤面暗転の開始 → 120ms linear
 *   210ms     結果カードの表示開始 → 200ms
 *   410ms     完了
 *
 * `prefers-reduced-motion: reduce` では待たせず、暗転の最終状態とカードを即時出す。
 */
function showFailed(state: StageState): void {
  const reason = state.moves <= 0 ? 'MOVES がなくなりました' : 'どの候補も置けません';
  presentFailCard(() =>
    showCard({
      title: 'FAILED',
      titleClass: 'ng',
      cardClass: 'failed',
      // ネイは失敗画面にも出す（工程 W-3）。**勝利カード用の既存画像をそのまま使い、
      // 新しい画像も切り抜きも作らない。**呼吸と talk は勝利カードだけなので、
      // ここでは静止のまま出る（CSS の対象が `.card.win` に限定されている）。
      figure: true,
      body: reason,
      stats: `SCORE ${state.score}`,
      buttons: [{ label: 'RETRY', primary: true, onClick: () => retryStage() }],
    }),
  );
}

/**
 * 失敗 A の時間割（3-16-4-1）。**カードの中身だけを差し替えて使い回す。**
 * 通常ステージの FAILED とエンドレスのゲームオーバーで、暗転とカードの間合いを揃える。
 *
 *   0〜90ms   失敗確定（すでに済んでいる）
 *   90ms      盤面暗転の開始 → 120ms linear
 *   210ms     結果カードの表示開始 → 200ms
 *   410ms     完了
 *
 * `prefers-reduced-motion: reduce` では待たせず、暗転の最終状態とカードを即時出す。
 */
function presentFailCard(card: () => void): void {
  // 連続して呼ばれても重ねない（3-16-4-1 の 10）。
  clearFailEffect();
  placeBoardDim();

  if (reduceMotion()) {
    boardDim.classList.add('instant', 'on');
    card();
    return;
  }
  failTimers.push(window.setTimeout(() => boardDim.classList.add('on'), 90));
  failTimers.push(window.setTimeout(card, 210));
}

/* ------------------------------------------------------- エンドレス（W-3） */

/**
 * エンドレスを 1 回始める。**毎回ちがう seed** なので同じ並びは繰り返さない。
 * 進行データ（`current` / `cleared`）には書かない。ステージ選択の状態も変えない。
 */
function goEndless(): void {
  endlessMode = true;
  clearFailEffect();
  metrics.begin(ENDLESS_ID, false);
  scene.loadStageDef(createEndlessStage(newEndlessSeed()));
}

/**
 * エンドレスが終わったとき（どの候補も置けなくなったとき）。
 * **記録はここで 1 回だけ更新する。**途中でタイトルやステージへ戻った回は数えない。
 */
function endEndlessRun(state: StageState): void {
  const { stats: next, record } = withEndlessRun(stats, state.score);
  stats = next;
  saveStats(stats);
  presentFailCard(() => {
    showCard({
      title: 'ゲームオーバー',
      titleClass: 'ng',
      cardClass: 'failed',
      body: 'おけるところが なくなりました。',
      extraHtml:
        (record ? '<div class="record">ハイスコア こうしん！</div>' : '') +
        statListHtml([
          ['SCORE', String(state.score)],
          ['HIGH SCORE', String(stats.endlessBest)],
          ['TURNS', String(state.movesUsed)],
          ['MAX CHAIN', String(state.maxChain)],
          ['PLAYED', `${stats.endlessRuns} 回`],
        ]) +
        soundToggleHtml(),
      buttons: [
        { label: 'タイトルへ', onClick: () => goTitle() },
        { label: 'もういちど', primary: true, onClick: () => goEndless() },
      ],
    });
    // カードを組み立てた直後に結線する。**表示の経路（即時／210ms 後）は問わない。**
    bindSoundToggle();
  });
}

/** エンドレスを終えてタイトルへ戻る。進行データは読むだけで、書き換えない。 */
function goTitle(): void {
  endlessMode = false;
  clearFailEffect();
  showTitle();
}

function retryStage(): void {
  // エンドレスの「もう一度」は**新しい seed で仕切り直す**。同じ並びを繰り返さない。
  if (endlessMode) {
    goEndless();
    return;
  }
  metrics.begin(currentStage, true);
  scene.retry();
}

function goStage(id: number): void {
  endlessMode = false;
  currentStage = Math.max(FIRST_STAGE, Math.min(LAST_STAGE, id));
  progress = withCurrent(progress, currentStage);
  saveProgress(progress);
  metrics.begin(currentStage, false);
  scene.loadStage(currentStage);
}

/* -------------------------------------------------------------------- 操作 */

$('btnRetry').addEventListener('click', () => {
  hideCard();
  if (endlessMode) {
    goEndless();
    return;
  }
  tutorial.forgetIntro(currentStage);
  metrics.begin(currentStage, true);
  scene.retry();
});

$('btnStages').addEventListener('click', () => {
  sfx.unlock();
  showStageSelect();
});

// プレイ画面からも音を切り替えられる。**カード内のボタンと同じ設定。**
$('btnSoundMain').addEventListener('click', () => {
  sfx.unlock();
  toggleSound();
});
syncSoundMain();

// 開発用。**通常のプレイヤーには出さない。**`?debug=1` でだけ現れる。
if (devMode) {
  $('btnDebug').addEventListener('click', () => {
    const on = debug.toggle();
    $('btnDebug').textContent = on ? 'DBG*' : 'DBG';
  });
} else {
  $('btnDebug').remove();
}

/* ------------------------------------------------------------------ 立ち上げ */

game.events.once('ready', () => {
  resize();
  // **まずタイトルを出す。**盤面はその後ろで読み込まれるが、幕が不透明なので見えない。
  // 入力も #overlay が受け止めるので、背後で手が進むことはない。
  // 演出の途中や awaitingTeach からは復元しない（progress.ts）。
  metrics.begin(currentStage, false);
  scene.loadStage(currentStage);
  // `?debug=1&skipTitle=1` のときだけタイトルを飛ばす。**通常起動には影響しない。**
  const skip = devMode && new URLSearchParams(location.search).get('skipTitle') === '1';
  if (skip) return;
  showTitle();
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
      /** 教材表示を読ませるために止まっているか（自動確認はタップで進める）。 */
      awaitingTeach: scene.isAwaitingTeach,
      board: s.board.toStrings(),
      tray: s.tray.map((p) => p && { shape: p.shape.id, color: p.color }),
      objectives: s.objectiveProgress().map((o) => ({ label: o.objective.label, current: o.current, target: o.target })),
      layout,
    };
  },
  place: (trayIndex: number, row: number, col: number) => scene.stageState.canPlace(trayIndex, row, col),
  /**
   * その配置で何が起きるかの下読み。**盤面もゲーム状態も一切変更しない**
   * （`previewPlacement` は clone 上の純粋関数。Preview.ts の 1〜4）。
   * 自動確認が「ラインを消さない手」を選ぶために読む。
   * **到達できない状態を作るための改変ではない。**
   */
  preview: (trayIndex: number, row: number, col: number) => {
    const st = scene.stageState;
    const piece = st.tray[trayIndex];
    if (!piece) return null;
    const r = previewPlacement(st.board, piece, row, col);
    if (!r) return null;
    return { lines: r.lineCells.length, detonations: r.triggerCells.length, effect: r.effect };
  },
  /** 保存された進行と開発モード（自動確認から読むため）。 */
  progress: () => ({ ...progress, devMode, sound: settings.sound, endless: endlessMode }),
  /** プレイ記録（自動確認から読むため）。 */
  stats: () => ({ ...stats }),
  /** エンドレスを始める。**通常は全ステージクリアで開くが、検証用にここからも入れる。** */
  goEndless: () => goEndless(),
  showTitle: () => showTitle(),
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
