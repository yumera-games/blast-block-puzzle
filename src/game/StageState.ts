import type { Objective, StageDef } from '../data/stages';
import { Board } from './Board';
import { PieceGenerator, isStuck } from './PieceGenerator';
import { canPlacePiece, placePiece } from './Piece';
import { resolveBoard, summarizeEvents } from './Resolver';
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
 * **表示用の途中経過。**論理状態（score / status / objectiveProgress）とは別物。
 *
 * 直前の resolution を「先頭 n wave まで再生したところ」の見え方を表す。
 * 論理状態は place() の時点で確定しているが、HUD はこちらを描く。
 * そうしないと CHAIN 演出が始まる前に最終スコアと目的の達成が出てしまう。
 */
export interface Presentation {
  readonly score: number;
  /** 再生中の CHAIN（= wave 番号）。まだ何も再生していなければ 0。 */
  readonly chain: number;
  readonly objectives: readonly ObjectiveProgress[];
  /** 最終 wave まで再生し終えたか。クリア／失敗カードはこれが true になってから。 */
  readonly settled: boolean;
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
  /** 直前の resolution を適用する **前** のスコアと目的進捗。表示の途中経過を組み立てる土台。 */
  private scoreBefore!: number;
  private progressBefore!: number[];

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
    this.scoreBefore = 0;
    this.progressBefore = [...this.progress];
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
    this.scoreBefore = this.score;
    this.progressBefore = [...this.progress];
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

  /**
   * 直前の resolution を先頭 `waves` 個まで再生した時点の**表示用**スナップショット。
   *
   * 論理状態は一切動かさない。集計に summarizeEvents と measure をそのまま使うので、
   * waves が最終 wave に達したときは必ず論理状態（score / objectiveProgress）と一致する。
   */
  presentation(waves: number): Presentation {
    const r = this.lastResult;
    if (!r || r.events.length === 0) {
      return { score: this.score, chain: 0, objectives: this.objectiveProgress(), settled: true };
    }
    const n = Math.max(0, Math.min(Math.floor(waves), r.events.length));
    const prefix = r.events.slice(0, n);
    const partial = summarizeEvents(prefix);

    const objectives = this.def.objectives.map((objective, i) => {
      const raw = (this.progressBefore[i] ?? 0) + measure(objective, partial);
      const current = Math.min(raw, objective.target);
      return { objective, current, target: objective.target, done: current >= objective.target };
    });

    return {
      score: this.scoreBefore + partial.totalScore,
      chain: n > 0 ? prefix[n - 1]!.chainIndex : 0,
      objectives,
      settled: n >= r.events.length,
    };
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
    case 'combo': {
      // 特殊 x 特殊 で起爆したグループを数える。effect 指定があればその組み合わせだけ。
      // 1 グループ＝1 回なので、同じ combo を二重に数えることはない。
      let n = 0;
      for (const e of r.events)
        for (const d of e.detonations)
          if (d.group.length >= 2 && (!obj.effect || d.effect === obj.effect)) n++;
      return n;
    }
    case 'chain':
      return r.maxChain >= (obj.param ?? 2) ? 1 : 0;
  }
}
