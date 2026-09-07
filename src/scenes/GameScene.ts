import Phaser from 'phaser';
import { Board } from '../game/Board';
import { StageState, type Presentation } from '../game/StageState';
import { stageById } from '../data/stages';
import type { TutorialHint } from '../data/stages';
import type { Cell, Piece, ResolutionEvent, ResolutionResult, SpecialInstance } from '../game/types';
import { comboPreviewLabel } from '../data/combos';
import { TEACH_PROMPT, type TeachKind, waveMark, waveNotice } from '../data/resultText';
import { previewPlacement, type PreviewResult } from '../game/Preview';
import { CELL_COLOR, CELL_EDGE, UI } from '../ui/colors';
import { PieceTray } from '../ui/PieceTray';
import type { Layout } from '../ui/layout';

/** 演出の長さ（ms）。Phase 1 は最低限。ロジック検証を優先する。 */
const TIMING = {
  snap: 90,
  lineHighlight: 130,
  removeFade: 240,
  blastDelay: 90,
  detonationFlash: 200,
  betweenChains: 90,
} as const;

/** ドラッグ中、指で隠れないようピースを持ち上げる量（セル比）。 */
const DRAG_LIFT = 1.15;

export interface SceneHooks {
  /** 盤面 / HUD の再描画が必要になったとき。
   *  `shown` は演出の進みに合わせた**表示用**の途中経過（論理状態とは別物）。 */
  onUpdate(state: StageState, chainNow: number, shown: Presentation): void;
  /** ステージ開始時（intro 表示のきっかけ）。 */
  onStageStart(state: StageState): void;
  /** クリア / 失敗が確定したとき。 */
  onStageEnd(state: StageState): void;
  /** 以下は計測用の任意フック。ゲーム進行には影響しない。 */
  /** `key` は `trayIndex:row:col`。**候補セル単位**で数えるためにシーン側が作る。 */
  onPreview?(key: string, preview: PreviewResult | null): void;
  onPlaced?(state: StageState, result: ResolutionResult | null, shownPreview: PreviewResult | null): void;
  onIllegalDrop?(): void;
}

interface FadingCell {
  readonly index: number;
  readonly cell: Cell;
  readonly startAt: number;
}

interface Flash {
  readonly cells: readonly number[];
  readonly color: number;
  readonly until: number;
}

/**
 * Gray Box の表示と入力。
 *
 * **ゲームロジックはここに書かない。** 盤面の決定は StageState / Resolver が行い、
 * このシーンは「表示用の盤面（view）」を resolution event に沿って追いかけるだけ。
 * そのため resolution は描画から完全に切り離してテストできる。
 */
export class GameScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private state!: StageState;
  /** 表示用の盤面。演出のあいだ、論理盤面より遅れて追従する。 */
  private view!: Board;
  private layout!: Layout;
  private tray!: PieceTray;

  private g!: Phaser.GameObjects.Graphics;
  private chainText!: Phaser.GameObjects.Text;
  /** COMBO の組み合わせ名（ROCKET + BOMB など）。 */
  private comboNameText!: Phaser.GameObjects.Text;
  /** COMBO の意味（2個同時＝COMBO）。語だけでは伝わらないため添える。 */
  private comboNoteText!: Phaser.GameObjects.Text;
  /** CHAIN の意味（消去が 2回 つづいた！）。COMBO とは別の枠に出す。 */
  private chainNoteText!: Phaser.GameObjects.Text;
  /** ドラッグ予告の説明ラベル。指で隠れないよう盤面の上端に置く。 */
  private previewText!: Phaser.GameObjects.Text;
  /** 教材表示を止めているあいだの案内（タップで つづける）。 */
  private teachPromptText!: Phaser.GameObjects.Text;
  /** KEEP 教材の小さな図に添える語。 */
  private keepLabelText!: Phaser.GameObjects.Text;
  /** wave 番号（①②）。盤面のセルの上に置く。 */
  private badgeTexts: Phaser.GameObjects.Text[] = [];

  /** このステージで出す盤面上の教材表示。 */
  private teach: readonly TeachKind[] = [];
  /** この resolution で振った wave 番号。1 wave = 1 個。 */
  private waveBadges: { index: number; wave: number }[] = [];
  /** いっしょに起爆した特殊。枠と矢印で結ぶ。 */
  private comboLink: { specials: readonly SpecialInstance[] } | null = null;
  /** 教材表示を読ませるために演出を止めているあいだの解除関数。 */
  private teachHold: (() => void) | null = null;
  /** このステージで教材の一時停止をもう出したか（繰り返して邪魔にしない）。 */
  private teachHeld = false;

  /** ドラッグ予告のキャッシュ。対象セルが変わったときだけ作り直す。 */
  private preview: { key: string; result: PreviewResult | null } | null = null;

  private drag: { trayIndex: number; x: number; y: number } | null = null;
  private busy = false;
  private fading: FadingCell[] = [];
  private flashes: Flash[] = [];
  private chainNow = 0;
  /** HUD へ出してよい wave 数。演出が1波進むごとに増える（論理状態は先に確定している）。 */
  private shownWaves = 0;
  private hint: TutorialHint | null = null;

  constructor(hooks: SceneHooks) {
    super('game');
    this.hooks = hooks;
  }

  // ---------------------------------------------------------------- lifecycle

  // Phaser.Scene の型定義に create は無い（実行時にフックされる）ので override は付けない
  create(): void {
    this.g = this.add.graphics();
    const centered = (color: string) =>
      this.add
        .text(0, 0, '', { fontFamily: 'ui-monospace, monospace', fontStyle: 'bold', color })
        .setOrigin(0.5)
        .setAlpha(0);
    this.comboNameText = centered('#ff9ede');
    this.comboNoteText = centered('#ff6fc8');
    this.chainText = centered('#ffd166');
    this.chainNoteText = centered('#ffe4a8');
    this.teachPromptText = centered('#cfe6ff');
    this.keepLabelText = centered('#7ab8ff');
    this.badgeTexts = Array.from({ length: 6 }, () => centered('#1a1e26'));
    this.previewText = this.add
      .text(0, 0, '', { fontFamily: 'ui-monospace, monospace', fontStyle: 'bold', color: '#cfe6ff' })
      .setOrigin(0.5, 0.5)
      .setAlpha(0);

    // 教材の一時停止はタップで解除する。busy 判定より先に見る。
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.teachHold) {
        this.teachHold();
        return;
      }
      this.onDown(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  override update(): void {
    const now = this.time.now;
    this.fading = this.fading.filter((f) => now - f.startAt < TIMING.removeFade);
    this.flashes = this.flashes.filter((f) => now < f.until);
    this.draw();
  }

  // ------------------------------------------------------------------- stage

  loadStage(id: number): void {
    this.state = new StageState(stageById(id));
    this.view = this.state.board.clone();
    this.teach = this.state.def.tutorial.teach ?? [];
    this.teachHeld = false;
    this.resetTeachVisuals();
    this.busy = false;
    this.drag = null;
    this.fading = [];
    this.flashes = [];
    this.chainNow = 0;
    this.shownWaves = 0;
    this.preview = null;
    if (this.chainText) this.hideCenterTexts();
    this.refreshHint();
    this.hooks.onStageStart(this.state);
    this.emit();
  }

  retry(): void {
    this.state.reset();
    this.view = this.state.board.clone();
    this.teachHeld = false;
    this.resetTeachVisuals();
    this.busy = false;
    this.drag = null;
    this.fading = [];
    this.flashes = [];
    this.chainNow = 0;
    this.shownWaves = 0;
    this.preview = null;
    if (this.chainText) this.hideCenterTexts();
    this.refreshHint();
    this.emit();
  }

  get stageState(): StageState {
    return this.state;
  }
  get currentChain(): number {
    return this.chainNow;
  }
  get isBusy(): boolean {
    return this.busy;
  }

  setHint(hint: TutorialHint | null): void {
    this.hint = hint;
  }

  /** 外から呼ぶ寸法更新。canvas のリサイズは main.ts 側が行う。 */
  applyLayout(layout: Layout): void {
    this.layout = layout;
    if (this.tray) this.tray.setLayout(layout);
    else this.tray = new PieceTray(layout);
    if (this.chainText) this.layoutCenterTexts();
  }

  /** 表示側への通知。**論理状態ではなく、演出の進みに合わせた途中経過を渡す。** */
  private emit(): void {
    this.hooks.onUpdate(this.state, this.chainNow, this.state.presentation(this.shownWaves));
  }

  /**
   * 中央表示の縦位置。**出ている行だけ**を上から順に積み、全体を盤面中央へ寄せる。
   *   ROCKET + BOMB        ← 組み合わせ名
   *   COMBO!               ← 特殊 x 特殊 が成立したという合図
   *   特殊 2個が いっしょに起爆！ ← COMBO の意味
   *   （ここだけ広く空ける。COMBO と CHAIN は別概念なので枠も分ける）
   *   CHAIN 2              ← resolution が何 wave 続いたか
   *   消去が 2回 つづいた！    ← CHAIN の意味
   */
  private layoutCenterTexts(): void {
    const l = this.layout;
    const cx = l.boardX + l.boardW / 2;
    const cy = l.boardY + l.boardH / 2;
    // 行の並び。size はセル比の文字サイズ、gap は次の行とのすき間（セル比）。
    const rows = [
      { t: this.comboNameText, size: 0.62, gap: 0.1 },
      { t: this.comboNoteText, size: 0.46, gap: 0.42 },
      { t: this.chainText, size: 0.9, gap: 0.1 },
      { t: this.chainNoteText, size: 0.4, gap: 0 },
    ];
    for (const r of rows) {
      r.t.setFontSize(Math.max(9, Math.round(l.cell * r.size)));
      this.fitToBoard(r.t);
    }
    const visible = rows.filter((r) => r.t.alpha > 0);
    let total = 0;
    visible.forEach((r, i) => {
      total += r.t.displayHeight + (i < visible.length - 1 ? r.gap * l.cell : 0);
    });
    // combo を結んだ線と枠は盤面の真ん中を通る。文字で隠すと「何と何が結ばれたか」が
    // 読めなくなるので、そのときだけ盤面の上端へ寄せる。
    let y = this.comboLink ? l.boardY + l.cell * 0.12 : cy - total / 2;
    visible.forEach((r, i) => {
      r.t.setPosition(cx, y + r.t.displayHeight / 2);
      y += r.t.displayHeight + (i < visible.length - 1 ? r.gap * l.cell : 0);
    });

    // 「タップで つづける」は盤面の外（盤面とトレイのすき間）へ。盤面を隠さない。
    this.teachPromptText.setFontSize(Math.max(9, Math.round(l.cell * 0.34)));
    this.fitToBoard(this.teachPromptText);
    this.teachPromptText.setPosition(cx, (l.boardY + l.boardH + l.trayY) / 2);

    // 予告は盤面ではなく専用ストリップの中央へ置く。
    this.previewText.setFontSize(Math.max(9, Math.round(l.stripH * 0.62)));
    this.previewText.setPosition(cx, l.stripY + l.stripH / 2);
    this.fitPreviewText();
  }

  /** 中央表示が盤面幅を越えないよう縮める。 */
  private fitToBoard(t: Phaser.GameObjects.Text): void {
    t.setScale(1);
    const maxW = this.layout.boardW - this.layout.cell * 0.3;
    if (t.width > maxW && t.width > 0) t.setScale(maxW / t.width);
  }

  /** 長いラベルでも canvas 外へはみ出さないよう、盤面幅に収まるまで縮める。 */
  private fitPreviewText(): void {
    const l = this.layout;
    this.previewText.setScale(1);
    const maxW = l.boardW - l.cell * 0.3;
    const w = this.previewText.width;
    if (w > maxW && w > 0) this.previewText.setScale(maxW / w);
  }

  private hideCenterTexts(): void {
    for (const t of [this.comboNameText, this.comboNoteText, this.chainText, this.chainNoteText, this.teachPromptText])
      t.setAlpha(0);
  }

  /** wave 番号と combo の結び付けを消す。次の手へ持ち越さない。 */
  private resetTeachVisuals(): void {
    this.waveBadges = [];
    this.comboLink = null;
    this.teachHold = null;
    if (this.badgeTexts.length > 0) for (const t of this.badgeTexts) t.setAlpha(0);
  }

  /** wave 番号の丸数字をセルの上へ載せ直す。 */
  private syncBadgeTexts(): void {
    const l = this.layout;
    this.badgeTexts.forEach((t, i) => {
      const b = this.waveBadges[i];
      if (!b || !l) {
        t.setAlpha(0);
        return;
      }
      t.setText(waveMark(b.wave));
      t.setFontSize(Math.max(10, Math.round(l.cell * 0.52)));
      t.setPosition(this.cellX(b.index) + l.cell / 2, this.cellY(b.index) + l.cell / 2);
      t.setAlpha(1);
    });
  }

  /** そのセルたちの重心にいちばん近いマス。 */
  private centroidIndex(cells: readonly number[]): number | null {
    if (cells.length === 0) return null;
    let r = 0;
    let c = 0;
    for (const i of cells) {
      r += this.view.rowOf(i);
      c += this.view.colOf(i);
    }
    const row = Math.round(r / cells.length);
    const col = Math.round(c / cells.length);
    return this.view.idx(row, col);
  }

  private refreshHint(): void {
    // ヒントの中身は main.ts の TutorialOverlay が決める。ここでは再問い合わせを促すだけ。
    this.emit();
  }

  // ------------------------------------------------------------------- input

  /**
   * **Phaser の pointer.x / y をそのまま使わない。**
   * canvas の表示位置は resize / scroll でしか更新されないため、HUD の高さが変わると
   * タップ位置がずれ、何のエラーも出ないまま「反応しない」状態になる。
   * 毎回 getBoundingClientRect から換算する（タップ 1 回につき 1 度だけなので軽い）。
   */
  private toLocal(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    const canvas = this.game.canvas;
    const ev = p.event as PointerEvent | TouchEvent | undefined;
    const touch = ev && 'changedTouches' in ev ? ev.changedTouches[0] : (ev as PointerEvent | undefined);
    if (!canvas || !touch || touch.clientX === undefined) return { x: p.x, y: p.y };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const k = this.layout.width / rect.width;
    return { x: (touch.clientX - rect.left) * k, y: (touch.clientY - rect.top) * k };
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.busy || !this.state || this.state.status !== 'playing') return;
    const q = this.toLocal(p);
    if (!q) return;
    const slot = this.tray.hitTest(q.x, q.y);
    if (slot === null || !this.state.tray[slot]) return;
    this.drag = { trayIndex: slot, x: q.x, y: q.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const q = this.toLocal(p);
    if (!q) return;
    this.drag.x = q.x;
    this.drag.y = q.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const q = this.toLocal(p);
    if (q) {
      this.drag.x = q.x;
      this.drag.y = q.y;
    }
    const target = this.dragTarget();
    const dragged = this.drag;
    this.drag = null; // 置けなければ候補は元の位置へ戻る（消さない）
    const shown = this.preview;
    this.preview = null;
    if (target && target.ok) {
      this.commitPlacement(dragged.trayIndex, target.row, target.col, shown?.result ?? null);
    } else {
      this.hooks.onIllegalDrop?.();
    }
  }

  /**
   * ドラッグ予告。**対象セルが変わったときだけ**作り直す（毎フレーム総当たりしない）。
   * 置けない場所では null にして何も出さない。
   */
  private currentPreview(): PreviewResult | null {
    const target = this.dragTarget();
    if (!this.drag || !target || !target.ok) {
      this.preview = null;
      return null;
    }
    const key = `${this.drag.trayIndex}:${target.row}:${target.col}`;
    if (this.preview?.key === key) return this.preview.result;
    const piece = this.state.tray[this.drag.trayIndex];
    if (!piece) return null;
    // 盤面の clone に対する純粋関数。本番の StageState・RNG・uid・トレイを一切触らない。
    const result = previewPlacement(this.state.board, piece, target.row, target.col);
    this.preview = { key, result };
    this.hooks.onPreview?.(key, result);
    return result;
  }

  /** ドラッグ中のピースが着地するマス。 */
  private dragTarget(): { row: number; col: number; ok: boolean } | null {
    if (!this.drag) return null;
    const piece = this.state.tray[this.drag.trayIndex];
    if (!piece) return null;
    const l = this.layout;
    const originX = this.drag.x - (piece.shape.width * l.cell) / 2;
    const originY = this.drag.y - l.cell * DRAG_LIFT - (piece.shape.height * l.cell) / 2;
    const col = Math.round((originX - l.boardX) / l.cell);
    const row = Math.round((originY - l.boardY) / l.cell);
    return { row, col, ok: this.state.canPlace(this.drag.trayIndex, row, col) };
  }

  private commitPlacement(
    trayIndex: number,
    row: number,
    col: number,
    shownPreview: PreviewResult | null,
  ): void {
    const piece = this.state.tray[trayIndex];
    if (!piece) return;
    const outcome = this.state.place(trayIndex, row, col);
    if (!outcome.ok) {
      this.hooks.onIllegalDrop?.();
      return;
    }
    this.hooks.onPlaced?.(this.state, outcome.result ?? null, shownPreview);

    // 表示用の盤面にも同じ配置を反映する（resolution は event を追って適用する）。
    // スコアと目的は、この時点ではまだ 1 波も出さない（演出より先に結果を見せないため）。
    this.shownWaves = 0;
    this.view.place(piece.shape.cells, row, col, piece.color);
    this.emit();

    if (outcome.result && outcome.result.events.length > 0) this.playResolution(outcome.result);
    else this.finishTurn();
  }

  // --------------------------------------------------------------- resolution

  /** resolution 中はユーザー入力を無効化する。 */
  private playResolution(result: ResolutionResult): void {
    this.busy = true;
    this.resetTeachVisuals();
    let t = TIMING.snap;

    for (const ev of result.events) {
      const at = t;
      this.time.delayedCall(at, () => this.showLines(ev));
      this.time.delayedCall(at + TIMING.lineHighlight, () => this.applyEvent(ev));
      t = at + TIMING.lineHighlight + TIMING.removeFade + TIMING.betweenChains;
    }

    this.time.delayedCall(t, () => {
      this.chainNow = 0;
      this.syncView();

      // 教材の山場（①→② が出そろった／特殊が結ばれた）が起きた手だけ、
      // 読み終わるまで止める。**そのステージで 1 回だけ**なのでテンポは落ちない。
      const moment = this.waveBadges.length >= 2 || this.comboLink !== null;
      if (moment && !this.teachHeld) {
        this.teachHeld = true;
        this.teachPromptText.setText(TEACH_PROMPT).setAlpha(1);
        this.layoutCenterTexts();
        this.teachHold = () => {
          this.teachHold = null;
          this.busy = false;
          this.hideCenterTexts();
          this.resetTeachVisuals();
          this.finishTurn();
        };
        this.emit();
        return;
      }

      this.busy = false;
      this.hideCenterTexts();
      this.resetTeachVisuals();
      this.finishTurn();
    });
  }

  /** 教材の一時停止中か（自動確認から読むため）。 */
  get isAwaitingTeach(): boolean {
    return this.teachHold !== null;
  }

  private showLines(ev: ResolutionEvent): void {
    this.chainNow = ev.chainIndex;
    if (ev.lines.length > 0) {
      const cells: number[] = [];
      for (const line of ev.lines) cells.push(...this.view.lineIndices(line));
      this.flashes.push({ cells, color: UI.lineHighlight, until: this.time.now + TIMING.lineHighlight + 60 });
    }
    for (const d of ev.detonations) {
      this.flashes.push({ cells: d.cells, color: UI.detonation, until: this.time.now + TIMING.detonationFlash });
    }
    // COMBO と CHAIN は別概念。何を出すかは waveNotice が wave 単位で決める
    // （ここで盤面を見たり combo を判定し直したりしない）。
    const notice = waveNotice(ev, this.teach);
    const line = (t: Phaser.GameObjects.Text, text: string | null) => {
      t.setText(text ?? '');
      t.setAlpha(text ? 1 : 0);
    };
    line(this.comboNameText, notice.comboName);
    line(this.comboNoteText, notice.comboNote);
    line(this.chainText, notice.chainLabel);
    // combo を結ぶ線を出すステージでは CHAIN の言い換えまでは出さない。
    // 行数が増えると盤面を覆ってしまい、肝心の「結ばれた 2 個」が見えなくなる。
    line(this.chainNoteText, this.teach.includes('comboLink') ? null : notice.chainNote);

    // 盤面上の教材表示。**この wave で実際に起きたことだけ**を記録する。
    if (this.teach.includes('waveNumbers')) {
      // 1 wave = 番号 1 個。2 ライン同時に消えても ① のまま（CHAIN の数と混同させない）。
      const cells =
        ev.detonations.length > 0
          ? ev.detonations.flatMap((d) => [...d.cells])
          : ev.lines.flatMap((li) => [...this.view.lineIndices(li)]);
      const at = this.centroidIndex(cells);
      if (at !== null) this.waveBadges.push({ index: at, wave: ev.chainIndex });
      this.syncBadgeTexts();
    }
    if (this.teach.includes('comboLink')) {
      const d = ev.detonations.find((x) => x.group.length >= 2);
      if (d) this.comboLink = { specials: [...d.group] };
    }
    this.layoutCenterTexts();
    this.emit();
  }

  private applyEvent(ev: ResolutionEvent): void {
    const now = this.time.now;
    for (const r of ev.removed) {
      // COLOR BLAST の対象セルは少し遅らせて消す（ライン→広がる、が読み取れるように）。
      const delay = r.source === 'blast' ? TIMING.blastDelay : 0;
      this.fading.push({ index: r.index, cell: r.cell, startAt: now + delay });
      this.view.clearAt(r.index);
    }
    if (ev.spawned) {
      const s = ev.spawned;
      this.view.putSpecial(s.index, s.kind, s.uid, s.color, s.dir);
    }
    this.shownWaves = ev.chainIndex;
    this.emit();
  }

  /** 念のため論理盤面と表示盤面を突き合わせる（ズレたら論理盤面を正とする）。 */
  private syncView(): void {
    this.view = this.state.board.clone();
  }

  private finishTurn(): void {
    this.emit();
    if (this.state.status !== 'playing') this.hooks.onStageEnd(this.state);
  }

  // ------------------------------------------------------------------ drawing

  private draw(): void {
    if (!this.layout || !this.state) return;
    const l = this.layout;
    const g = this.g;
    g.clear();

    // 盤面の下地
    g.fillStyle(UI.boardBg, 1);
    g.fillRect(l.boardX, l.boardY, l.boardW, l.boardH);

    for (let r = 0; r < this.view.rows; r++) {
      for (let c = 0; c < this.view.cols; c++) {
        const x = l.boardX + c * l.cell;
        const y = l.boardY + r * l.cell;
        g.fillStyle(UI.cellEmpty, 1);
        g.fillRect(x + 1, y + 1, l.cell - 2, l.cell - 2);
      }
    }

    // チュートリアルの推奨配置
    // showCell: false のヒントは文だけ出す（Stage 1 のような完全な答え表示にしない）。
    if (this.hint && this.hint.showCell !== false) this.drawHint(g, this.hint);

    // 盤面のセル
    for (let i = 0; i < this.view.size; i++) {
      const cell = this.view.at(i);
      if (cell.kind === 'empty') continue;
      this.drawCell(g, this.cellX(i), this.cellY(i), l.cell, cell, 1);
    }

    // 消えていくセル
    const now = this.time.now;
    for (const f of this.fading) {
      const t = Math.max(0, now - f.startAt) / TIMING.removeFade;
      const k = 1 - t;
      const size = l.cell * (0.35 + 0.65 * k);
      const off = (l.cell - size) / 2;
      this.drawCell(g, this.cellX(f.index) + off, this.cellY(f.index) + off, size, f.cell, k);
    }

    // ライン強調 / 起爆範囲
    for (const f of this.flashes) {
      g.fillStyle(f.color, 0.22);
      for (const i of f.cells) g.fillRect(this.cellX(i), this.cellY(i), l.cell, l.cell);
    }

    // 盤面上の教材表示（wave 番号 / combo の結び付け / KEEP 印）
    this.drawTeach(g);

    // ドラッグ予告（起爆・combo）→ その上にゴースト
    this.drawPreview(g);
    this.drawGhost(g);

    // 中央表示と予告ラベルの下敷き。Gray Box のセルに文字が埋もれるのを防ぐ。
    this.drawTextPlates(g);

    // トレイ
    this.drawTray(g);
  }

  /**
   * 文字の下敷き。Text は Graphics より後に生成しているので必ず上へ重なる。
   * 盤面を隠しすぎないよう、**文字が出ている行だけ**を暗くする。
   */
  private drawTextPlates(g: Phaser.GameObjects.Graphics): void {
    const pad = this.layout.cell * 0.22;
    // COMBO と CHAIN は別概念なので、**別々の板**に載せる（ひと続きに見せない）。
    const plate = (texts: readonly Phaser.GameObjects.Text[]) => {
      const shown = texts.filter((t) => t.alpha > 0);
      if (shown.length === 0) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const t of shown) {
        x0 = Math.min(x0, t.x - t.displayWidth / 2);
        y0 = Math.min(y0, t.y - t.displayHeight / 2);
        x1 = Math.max(x1, t.x + t.displayWidth / 2);
        y1 = Math.max(y1, t.y + t.displayHeight / 2);
      }
      g.fillStyle(UI.textPlate, 0.82);
      g.fillRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
    };
    plate([this.comboNameText, this.comboNoteText]);
    plate([this.chainText, this.chainNoteText]);
    plate([this.teachPromptText]);
    if (this.previewText.alpha > 0) {
      // **専用ストリップの中だけ**を塗る。盤面セルへは 1px も重ねない。
      const l = this.layout;
      const t = this.previewText;
      const w = Math.min(t.displayWidth + pad * 2, l.boardW);
      g.fillStyle(UI.textPlate, 0.86);
      g.fillRect(t.x - w / 2, l.stripY, w, l.stripH);
    }
  }

  /**
   * **盤面の上でルールを見せる。** 文章ではなく、番号・枠・矢印で示す。
   *   waveNumbers … ① ② と wave に番号を振る。1 wave = 1 個
   *   comboLink   … いっしょに起爆した特殊を同じ枠で囲み、矢印で結ぶ
   *   keep        … 残す特殊へ印を付け、組み合わせ相手を小さな図で示す
   * どれを出すかはステージデータの tutorial.teach だけが決める。
   */
  private drawTeach(g: Phaser.GameObjects.Graphics): void {
    const l = this.layout;
    const now = this.time.now;

    // --- wave 番号。CHAIN の文字と同じ色にして盤面と中央表示を対応づける ---
    const at = (i: number) => ({ x: this.cellX(i) + l.cell / 2, y: this.cellY(i) + l.cell / 2 });
    for (let i = 1; i < this.waveBadges.length; i++) {
      this.arrow(g, at(this.waveBadges[i - 1]!.index), at(this.waveBadges[i]!.index), UI.lineHighlight, 0.85);
    }
    for (const b of this.waveBadges) {
      const c = at(b.index);
      const r = l.cell * 0.33;
      g.fillStyle(UI.lineHighlight, 0.95);
      g.fillCircle(c.x, c.y, r);
      g.lineStyle(Math.max(2, l.cell * 0.06), UI.textPlate, 0.85);
      g.strokeCircle(c.x, c.y, r);
    }

    // --- COMBO。2 個を同じ枠・同じ色・同じ脈動で結ぶ ---
    if (this.comboLink) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 260));
      const sp = this.comboLink.specials;
      for (let i = 1; i < sp.length; i++) this.arrow(g, at(sp[i - 1]!.index), at(sp[i]!.index), UI.previewCombo, pulse);
      for (const x of sp) {
        const px = this.cellX(x.index);
        const py = this.cellY(x.index);
        // すでに消えた側は残像で位置を示す。どれとどれが結ばれたのかを見せるため。
        if (this.view.at(x.index).kind === 'empty')
          this.drawCell(g, px, py, l.cell, { kind: x.kind, color: x.color, dir: x.dir, uid: x.uid }, 0.55);
        g.lineStyle(Math.max(3, l.cell * 0.12), UI.previewCombo, pulse);
        g.strokeRect(px + 2, py + 2, l.cell - 4, l.cell - 4);
      }
    }

    // --- KEEP。考える時間のあいだだけ出す（演出中は出さない） ---
    if (this.teach.includes('keep') && !this.busy) this.drawKeep(g);
    else this.keepLabelText.setAlpha(0);
  }

  /** 残す特殊の印と、「これと もう1個 で COMBO」の小さな図。 */
  private drawKeep(g: Phaser.GameObjects.Graphics): void {
    const l = this.layout;
    const kept = this.view.specialIndices();
    if (kept.length === 0) {
      this.keepLabelText.setAlpha(0);
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 520); // 弱い脈動

    // 盤面に残っている特殊へ、四隅のブラケット（盾）と薄い塗り。アイコンは隠さない。
    for (const i of kept) {
      const x = this.cellX(i);
      const y = this.cellY(i);
      const m = l.cell * 0.08;
      const arm = l.cell * 0.28;
      g.fillStyle(UI.hint, 0.08 + 0.06 * pulse);
      g.fillRect(x + m, y + m, l.cell - m * 2, l.cell - m * 2);
      g.lineStyle(Math.max(2, l.cell * 0.08), UI.hint, 0.55 + 0.3 * pulse);
      const x0 = x + m;
      const y0 = y + m;
      const x1 = x + l.cell - m;
      const y1 = y + l.cell - m;
      g.lineBetween(x0, y0, x0 + arm, y0); g.lineBetween(x0, y0, x0, y0 + arm);
      g.lineBetween(x1, y0, x1 - arm, y0); g.lineBetween(x1, y0, x1, y0 + arm);
      g.lineBetween(x0, y1, x0 + arm, y1); g.lineBetween(x0, y1, x0, y1 - arm);
      g.lineBetween(x1, y1, x1 - arm, y1); g.lineBetween(x1, y1, x1, y1 - arm);
    }

    // 「[残す特殊] ＋ [もう1個] → COMBO」。相手の種類は決めつけず、
    // まだ無ければ点線の枠にする（作るべきものが 1 個ある、とだけ伝える）。
    const row = this.emptyRowForDiagram();
    if (row === null) {
      this.keepLabelText.setAlpha(0);
      return;
    }
    const icon = l.cell * 0.78;
    const gap = l.cell * 0.26;
    const plusW = l.cell * 0.3;
    const arrowW = l.cell * 0.62;
    const size = Math.max(10, Math.round(l.cell * 0.42));
    if (this.keepLabelText.style.fontSize !== `${size}px`) this.keepLabelText.setFontSize(size);
    this.keepLabelText.setText('COMBO');
    const total = icon + gap + plusW + gap + icon + gap + arrowW + gap + this.keepLabelText.width;
    let x = l.boardX + (l.boardW - total) / 2;
    const y = l.boardY + row * l.cell + (l.cell - icon) / 2;
    const midY = y + icon / 2;

    const first = this.view.at(kept[0]!);
    this.drawCell(g, x, y, icon, first, 1);
    x += icon + gap;
    g.fillStyle(UI.hint, 0.9); // ＋
    g.fillRect(x, midY - plusW * 0.09, plusW, plusW * 0.18);
    g.fillRect(x + plusW * 0.41, midY - plusW / 2, plusW * 0.18, plusW);
    x += plusW + gap;
    const partner = kept.length > 1 ? this.view.at(kept[1]!) : null;
    if (partner) this.drawCell(g, x, y, icon, partner, 1);
    else {
      // まだ作っていない相手。点線ふうの枠だけ。
      g.lineStyle(Math.max(2, icon * 0.09), UI.hint, 0.5 + 0.3 * pulse);
      const step = icon / 7;
      for (let k = 0; k < 7; k += 2) {
        g.lineBetween(x + k * step, y, x + (k + 1) * step, y);
        g.lineBetween(x + k * step, y + icon, x + (k + 1) * step, y + icon);
        g.lineBetween(x, y + k * step, x, y + (k + 1) * step);
        g.lineBetween(x + icon, y + k * step, x + icon, y + (k + 1) * step);
      }
    }
    x += icon + gap;
    this.arrow(g, { x: x - l.cell * 0.42, y: midY }, { x: x + arrowW + l.cell * 0.42, y: midY }, UI.hint, 0.9);
    x += arrowW + gap;
    this.keepLabelText.setPosition(x + this.keepLabelText.width / 2, midY);
    this.keepLabelText.setAlpha(0.95);
  }

  /** 小さな図を置ける、いちばん上の空き行。無ければ null。 */
  private emptyRowForDiagram(): number | null {
    const rows: number[] = [];
    for (let r = 0; r < this.view.rows; r++) {
      let empty = true;
      for (let c = 0; c < this.view.cols; c++) if (this.view.get(r, c).kind !== 'empty') empty = false;
      if (empty) rows.push(r);
    }
    if (rows.length === 0) return null;
    // 盤面の上端に貼りつかないよう、空き行が続くなら 2 行目を使う。
    return rows.length > 1 && rows[1] === rows[0]! + 1 ? rows[1]! : rows[0]!;
  }

  /** from → to の矢印。セル中心どうしを結ぶので、両端をセル半分ぶん詰める。 */
  private arrow(
    g: Phaser.GameObjects.Graphics,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    alpha: number,
  ): void {
    const l = this.layout;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const pad = l.cell * 0.42;
    const x0 = from.x + ux * pad;
    const y0 = from.y + uy * pad;
    const x1 = to.x - ux * pad;
    const y1 = to.y - uy * pad;
    if (Math.hypot(x1 - x0, y1 - y0) < 4) return;
    g.lineStyle(Math.max(2, l.cell * 0.07), color, alpha);
    g.lineBetween(x0, y0, x1, y1);
    const hh = l.cell * 0.2;
    g.fillStyle(color, alpha);
    g.fillTriangle(
      x1, y1,
      x1 - ux * hh - uy * hh * 0.55, y1 - uy * hh + ux * hh * 0.55,
      x1 - ux * hh + uy * hh * 0.55, y1 - uy * hh - ux * hh * 0.55,
    );
  }

  private cellX(index: number): number {
    return this.layout.boardX + this.view.colOf(index) * this.layout.cell;
  }
  private cellY(index: number): number {
    return this.layout.boardY + this.view.rowOf(index) * this.layout.cell;
  }

  private drawHint(g: Phaser.GameObjects.Graphics, hint: TutorialHint): void {
    const piece = this.state.tray[hint.pieceIndex];
    if (!piece) return;
    const l = this.layout;
    const pulse = 0.26 + 0.14 * Math.sin(this.time.now / 220);
    for (const v of piece.shape.cells) {
      const x = l.boardX + (hint.col + v.x) * l.cell;
      const y = l.boardY + (hint.row + v.y) * l.cell;
      g.fillStyle(UI.hint, pulse);
      g.fillRect(x + 1, y + 1, l.cell - 2, l.cell - 2);
      g.lineStyle(Math.max(2, l.cell * 0.07), UI.hint, 0.85);
      g.strokeRect(x + 2, y + 2, l.cell - 4, l.cell - 4);
    }
  }

  /**
   * 起爆・combo の予告。**Gray Box のまま**色・枠・半透明だけで表す。点滅はさせない。
   * 説明ラベルは盤面の上端に出す（指とピースは下側にあるので隠れない）。
   */
  private drawPreview(g: Phaser.GameObjects.Graphics): void {
    const pv = this.currentPreview();
    if (!pv) {
      this.previewText.setAlpha(0);
      return;
    }
    const l = this.layout;
    const box = (i: number, color: number, alpha: number) => {
      g.fillStyle(color, alpha);
      g.fillRect(this.cellX(i), this.cellY(i), l.cell, l.cell);
    };
    const frame = (i: number, color: number) => {
      g.lineStyle(Math.max(2, l.cell * 0.09), color, 0.95);
      g.strokeRect(this.cellX(i) + 2, this.cellY(i) + 2, l.cell - 4, l.cell - 4);
    };

    for (const i of pv.lineCells) box(i, UI.previewLine, 0.16);
    for (const i of pv.reachCells) box(i, UI.previewReach, 0.20);
    for (const i of pv.triggerCells) frame(i, UI.previewTrigger);
    for (const i of pv.comboCells) frame(i, UI.previewCombo);

    const label = comboPreviewLabel(pv.effect);
    if (label) {
      this.previewText.setText(label);
      this.previewText.setColor('#ff9ede');
      this.previewText.setAlpha(1);
      this.fitPreviewText();
    } else if (pv.triggerCells.length > 0) {
      this.previewText.setText('起爆');
      this.previewText.setColor('#cfe6ff');
      this.previewText.setAlpha(1);
      this.fitPreviewText();
    } else {
      this.previewText.setAlpha(0);
    }
  }

  private drawGhost(g: Phaser.GameObjects.Graphics): void {
    const target = this.dragTarget();
    if (!target || !this.drag) return;
    const piece = this.state.tray[this.drag.trayIndex];
    if (!piece) return;
    const l = this.layout;

    for (const v of piece.shape.cells) {
      const row = target.row + v.y;
      const col = target.col + v.x;
      if (row < 0 || row >= this.view.rows || col < 0 || col >= this.view.cols) continue;
      const x = l.boardX + col * l.cell;
      const y = l.boardY + row * l.cell;
      if (target.ok) {
        g.fillStyle(CELL_COLOR[piece.color], 0.5);
        g.fillRect(x + 1, y + 1, l.cell - 2, l.cell - 2);
        g.lineStyle(Math.max(2, l.cell * 0.06), UI.ghostOk, 0.9);
        g.strokeRect(x + 1, y + 1, l.cell - 2, l.cell - 2);
      } else {
        // 配置不可は別状態で表示する（指を離しても置かれない）
        g.lineStyle(Math.max(2, l.cell * 0.06), UI.ghostNg, 0.9);
        g.strokeRect(x + 2, y + 2, l.cell - 4, l.cell - 4);
      }
    }

    // 指の少し上に、実サイズのピース本体を出す
    const originX = this.drag.x - (piece.shape.width * l.cell) / 2;
    const originY = this.drag.y - l.cell * DRAG_LIFT - (piece.shape.height * l.cell) / 2;
    this.drawPiece(g, piece, originX, originY, l.cell, 0.95);
  }

  private drawTray(g: Phaser.GameObjects.Graphics): void {
    const l = this.layout;
    g.fillStyle(UI.trayBg, 1);
    g.fillRect(0, l.trayY, l.width, l.trayH);

    for (let i = 0; i < this.tray.slotCount; i++) {
      const slot = this.tray.slot(i);
      g.lineStyle(1, UI.gridLine, 1);
      g.strokeRect(slot.x + 3, slot.y + 3, slot.w - 6, slot.h - 6);

      const piece = this.state.tray[i];
      if (!piece) continue;
      if (this.drag && this.drag.trayIndex === i) continue; // ドラッグ中は指の位置に出す

      const cell = this.tray.cellSize(piece, slot);
      const origin = this.tray.origin(piece, slot, cell);
      // どこにも置けない候補は薄くする（なぜ詰んだかが見えるように）
      const alpha = this.view.hasAnyPlacement(piece.shape.cells) ? 1 : 0.35;
      this.drawPiece(g, piece, origin.x, origin.y, cell, alpha);
    }
  }

  private drawPiece(
    g: Phaser.GameObjects.Graphics,
    piece: Piece,
    originX: number,
    originY: number,
    cell: number,
    alpha: number,
  ): void {
    for (const v of piece.shape.cells) {
      this.drawCell(
        g,
        originX + v.x * cell,
        originY + v.y * cell,
        cell,
        { kind: 'normal', color: piece.color, dir: null, uid: 0 },
        alpha,
      );
    }
  }

  /** Gray Box の 1 セル。特殊ピースは形で見分けられるようにする。 */
  private drawCell(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, cell: Cell, alpha: number): void {
    const inset = Math.max(1, size * 0.06);
    const w = size - inset * 2;
    const color = cell.color ? CELL_COLOR[cell.color] : 0x6b7383;
    const edge = cell.color ? CELL_EDGE[cell.color] : 0x99a1b2;

    if (cell.kind === 'rainbow') {
      const stripes = [CELL_COLOR.red, CELL_COLOR.yellow, CELL_COLOR.green, CELL_COLOR.blue, CELL_COLOR.purple];
      const h = w / stripes.length;
      for (let i = 0; i < stripes.length; i++) {
        g.fillStyle(stripes[i]!, alpha);
        g.fillRect(x + inset, y + inset + i * h, w, h + 0.5);
      }
      g.lineStyle(Math.max(2, size * 0.09), 0xffffff, alpha);
      g.strokeRect(x + inset, y + inset, w, w);
      return;
    }

    if (cell.kind === 'rocket' || cell.kind === 'bomb') {
      g.fillStyle(UI.special, alpha);
      g.fillRect(x + inset, y + inset, w, w);
      g.lineStyle(Math.max(2, size * 0.09), color, alpha);
      g.strokeRect(x + inset, y + inset, w, w);
      const cx = x + size / 2;
      const cy = y + size / 2;
      if (cell.kind === 'rocket') {
        const a = w * 0.22;
        g.fillStyle(edge, alpha);
        if (cell.dir === 'v') {
          g.fillTriangle(cx, cy - a * 1.5, cx - a, cy - a * 0.2, cx + a, cy - a * 0.2);
          g.fillTriangle(cx, cy + a * 1.5, cx - a, cy + a * 0.2, cx + a, cy + a * 0.2);
        } else {
          g.fillTriangle(cx - a * 1.5, cy, cx - a * 0.2, cy - a, cx - a * 0.2, cy + a);
          g.fillTriangle(cx + a * 1.5, cy, cx + a * 0.2, cy - a, cx + a * 0.2, cy + a);
        }
      } else {
        g.fillStyle(edge, alpha);
        g.fillCircle(cx, cy, w * 0.24);
        g.lineStyle(Math.max(1, size * 0.05), edge, alpha);
        g.strokeCircle(cx, cy, w * 0.38);
      }
      return;
    }

    g.fillStyle(color, alpha);
    g.fillRect(x + inset, y + inset, w, w);
    g.fillStyle(edge, alpha * 0.9);
    g.fillRect(x + inset, y + inset, w, Math.max(1, size * 0.09));
  }
}
