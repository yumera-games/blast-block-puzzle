import Phaser from 'phaser';
import { Board } from '../game/Board';
import { StageState, type Presentation } from '../game/StageState';
import { stageById } from '../data/stages';
import type { TutorialHint } from '../data/stages';
import type { Cell, Piece, ResolutionEvent, ResolutionResult } from '../game/types';
import { comboName, comboPreviewLabel } from '../data/combos';
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
  onPreview?(preview: PreviewResult | null): void;
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
  /** COMBO! の文字。CHAIN とは別の概念なので別の行に出す。 */
  private comboTagText!: Phaser.GameObjects.Text;
  /** ドラッグ予告の説明ラベル。指で隠れないよう盤面の上端に置く。 */
  private previewText!: Phaser.GameObjects.Text;

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
    this.comboTagText = centered('#ff6fc8');
    this.chainText = centered('#ffd166');
    this.previewText = this.add
      .text(0, 0, '', { fontFamily: 'ui-monospace, monospace', fontStyle: 'bold', color: '#cfe6ff' })
      .setOrigin(0.5, 0)
      .setAlpha(0);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
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
   * 中央表示の縦位置。COMBO 表示があるときは 3 行に積む。
   *   ROCKET + BOMB   ← 組み合わせ名
   *   COMBO!          ← 特殊 x 特殊 が成立したという合図
   *   CHAIN 2         ← resolution が何 wave 続いたか（別概念）
   */
  private layoutCenterTexts(): void {
    const l = this.layout;
    const cx = l.boardX + l.boardW / 2;
    const cy = l.boardY + l.boardH / 2;
    const combo = this.comboTagText.alpha > 0;
    this.comboNameText.setFontSize(Math.round(l.cell * 0.5));
    this.comboTagText.setFontSize(Math.round(l.cell * 0.72));
    this.chainText.setFontSize(Math.round(l.cell * 0.9));
    this.comboNameText.setPosition(cx, cy - l.cell * 1.05);
    this.comboTagText.setPosition(cx, cy - l.cell * 0.4);
    this.chainText.setPosition(cx, combo ? cy + l.cell * 0.5 : cy);
    this.previewText.setFontSize(Math.round(l.cell * 0.42));
    this.previewText.setPosition(cx, l.boardY + l.cell * 0.22);
  }

  private hideCenterTexts(): void {
    this.comboNameText.setAlpha(0);
    this.comboTagText.setAlpha(0);
    this.chainText.setAlpha(0);
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
    this.hooks.onPreview?.(result);
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
    let t = TIMING.snap;

    for (const ev of result.events) {
      const at = t;
      this.time.delayedCall(at, () => this.showLines(ev));
      this.time.delayedCall(at + TIMING.lineHighlight, () => this.applyEvent(ev));
      t = at + TIMING.lineHighlight + TIMING.removeFade + TIMING.betweenChains;
    }

    this.time.delayedCall(t, () => {
      this.busy = false;
      this.chainNow = 0;
      this.hideCenterTexts();
      this.syncView();
      this.finishTurn();
    });
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
    // COMBO と CHAIN は別概念。combo 判定は Detonation.effect だけを見る（盤面は見ない）。
    const combo = ev.detonations.map((d) => comboName(d.effect)).find((n) => n !== null) ?? null;
    if (combo) {
      this.comboNameText.setText(combo);
      this.comboTagText.setText('COMBO!');
      this.comboNameText.setAlpha(1);
      this.comboTagText.setAlpha(1);
    } else {
      this.comboNameText.setAlpha(0);
      this.comboTagText.setAlpha(0);
    }
    if (ev.chainIndex >= 2) {
      this.chainText.setText(`CHAIN ${ev.chainIndex}`);
      this.chainText.setAlpha(1);
    } else {
      this.chainText.setAlpha(0);
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
    if (this.hint) this.drawHint(g, this.hint);

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
    const shown = [this.comboNameText, this.comboTagText, this.chainText].filter((t) => t.alpha > 0);
    if (shown.length > 0) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const t of shown) {
        x0 = Math.min(x0, t.x - t.width / 2);
        y0 = Math.min(y0, t.y - t.height / 2);
        x1 = Math.max(x1, t.x + t.width / 2);
        y1 = Math.max(y1, t.y + t.height / 2);
      }
      g.fillStyle(UI.textPlate, 0.82);
      g.fillRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
    }
    if (this.previewText.alpha > 0) {
      const t = this.previewText;
      g.fillStyle(UI.textPlate, 0.86);
      g.fillRect(t.x - t.width / 2 - pad, t.y - pad * 0.5, t.width + pad * 2, t.height + pad);
    }
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
    } else if (pv.triggerCells.length > 0) {
      this.previewText.setText('起爆');
      this.previewText.setColor('#cfe6ff');
      this.previewText.setAlpha(1);
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
