import type { Objective, StageDef } from '../data/stages';
import { Board } from './Board';
import { PieceGenerator, isStuck } from './PieceGenerator';
import { canPlacePiece, placePiece } from './Piece';
import { resolveBoard } from './Resolver';
import type { Piece, ResolutionResult, SetEvaluation } from './types';

export type StageStatus = 'playing' | 'cleared' | 'failed';

export interface PlaceOutcome {
  readonly ok: boolean;
  readonly reason?: 'illegal' | 'no-piece' | 'not-playing';
  readonly result?: ResolutionResult;
  /** 3個すべて使い切って次のセットを配ったか。 */
  readonly refilled: boolean;
}

export interface ObjectiveProgress {
  readonly objective: Objective;
  readonly current: number;
  readonly target: number;
  readonly done: boolean;
}

/**
 * 1ステージぶんの進行状態。**描画を知らない。**
 * 盤面・トレイ・手数・目的の達成度をここで持ち、シーンは表示だけを担当する。
 */
export class StageState {
  readonly def: StageDef;
  board!: Board;
  private generator!: PieceGenerator;
  tray!: (Piece | null)[];
  moves!: number;
  movesUsed!: number;
  score!: number;
  status!: StageStatus;
  maxChain!: number;
  lastResult!: ResolutionResult | null;
  private progress!: number[];
  private uidSeq!: number;

  constructor(def: StageDef) {
    this.def = def;
    this.reset();
  }

  reset(): void {
    this.board = this.def.initialBoard ? Board.fromStrings(this.def.initialBoard) : new Board();
    this.generator = new PieceGenerator(this.def.seed, this.def.fixedSets ?? []);
    this.moves = this.def.moves;
    this.movesUsed = 0;
    this.score = 0;
    this.status = 'playing';
    this.maxChain = 0;
    this.lastResult = null;
    this.progress = this.def.objectives.map(() => 0);
    this.uidSeq = this.board.maxUid();
    this.tray = this.generator.next(this.board);
    this.updateStatus();
  }

  get seed(): number {
    return this.generator.seed;
  }
  get setEvaluation(): SetEvaluation {
    return this.generator.evaluation;
  }
  get setsDealt(): number {
    return this.generator.sets;
  }

  remainingPieces(): Piece[] {
    return this.tray.filter((p): p is Piece => p !== null);
  }

  canPlace(trayIndex: number, row: number, col: number): boolean {
    const piece = this.tray[trayIndex];
    if (!piece || this.status !== 'playing') return false;
    return canPlacePiece(this.board, piece, row, col);
  }

  /** ピースを置き、resolution を最後まで走らせる。 */
  place(trayIndex: number, row: number, col: number): PlaceOutcome {
    if (this.status !== 'playing') return { ok: false, reason: 'not-playing', refilled: false };
    const piece = this.tray[trayIndex];
    if (!piece) return { ok: false, reason: 'no-piece', refilled: false };
    if (!canPlacePiece(this.board, piece, row, col)) return { ok: false, reason: 'illegal', refilled: false };

    const placedCells = placePiece(this.board, piece, row, col);
    this.tray[trayIndex] = null;
    this.moves--;
    this.movesUsed++;

    const result = resolveBoard(this.board, {
      placedCells,
      placedColor: piece.color,
      nextUid: () => ++this.uidSeq,
    });
    this.applyResolution(result);

    let refilled = false;
    if (this.tray.every((p) => p === null)) {
      this.tray = this.generator.next(this.board);
      refilled = true;
    }

    this.updateStatus();
    return { ok: true, result, refilled };
  }

  private applyResolution(result: ResolutionResult): void {
    this.lastResult = result;
    this.score += result.totalScore;
    if (result.maxChain > this.maxChain) this.maxChain = result.maxChain;

    this.def.objectives.forEach((obj, i) => {
      this.progress[i] = (this.progress[i] ?? 0) + measure(obj, result);
    });
  }

  objectiveProgress(): ObjectiveProgress[] {
    return this.def.objectives.map((objective, i) => {
      const current = Math.min(this.progress[i] ?? 0, objective.target);
      return { objective, current, target: objective.target, done: current >= objective.target };
    });
  }

  isCleared(): boolean {
    return this.objectiveProgress().every((p) => p.done);
  }

  /** 残っている候補のどれも置けないか。 */
  isStuck(): boolean {
    return isStuck(this.board, this.remainingPieces());
  }

  private updateStatus(): void {
    if (this.status !== 'playing') return;
    // クリア判定を先に行う。手数が 0 になっても目的を満たしていればクリア。
    if (this.isCleared()) {
      this.status = 'cleared';
      return;
    }
    if (this.moves <= 0 || this.isStuck()) {
      this.status = 'failed';
    }
  }
}

/** 目的1件ぶんの、この resolution での増分。 */
function measure(obj: Objective, r: ResolutionResult): number {
  switch (obj.kind) {
    case 'linesTotal':
      return r.rowsCleared + r.colsCleared;
    case 'linesRow':
      return r.rowsCleared;
    case 'linesCol':
      return r.colsCleared;
    case 'simultaneousLines': {
      const need = obj.param ?? 2;
      return r.events.filter((e) => e.lines.length >= need).length;
    }
    case 'colorBlast': {
      const need = obj.param ?? 4;
      return r.events.reduce((a, e) => a + e.blasts.filter((b) => b.size >= need).length, 0);
    }
    case 'specialCreated':
      return r.specialsCreated.filter((k) => !obj.special || k === obj.special).length;
    case 'specialDetonated':
      return r.specialsDetonated.filter((k) => !obj.special || k === obj.special).length;
    case 'chain':
      return r.maxChain >= (obj.param ?? 2) ? 1 : 0;
  }
}
