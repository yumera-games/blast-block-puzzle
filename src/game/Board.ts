import { BALANCE } from '../data/balance';
import {
  type Cell,
  type Color,
  type LineRef,
  type RocketDir,
  type SpecialKind,
  type Vec,
  isOccupied,
  isSpecialKind,
} from './types';

/**
 * 8x8 の盤面。描画を一切知らない純粋なデータ構造。
 *
 * index = row * cols + col。row / col はともに 0 始まり。
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  private readonly cells: Cell[];

  constructor(rows: number = BALANCE.board.rows, cols: number = BALANCE.board.cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells = new Array<Cell>(rows * cols);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = emptyCell();
  }

  get size(): number {
    return this.rows * this.cols;
  }

  idx(row: number, col: number): number {
    return row * this.cols + col;
  }
  rowOf(index: number): number {
    return Math.floor(index / this.cols);
  }
  colOf(index: number): number {
    return index % this.cols;
  }
  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  at(index: number): Cell {
    return this.cells[index]!;
  }
  get(row: number, col: number): Cell {
    return this.cells[this.idx(row, col)]!;
  }

  setAt(index: number, cell: Cell): void {
    this.cells[index] = cell;
  }
  clearAt(index: number): void {
    this.cells[index] = emptyCell();
  }

  isEmptyAt(index: number): boolean {
    return this.cells[index]!.kind === 'empty';
  }

  /** 上下左右の隣接 index（斜めは含めない）。 */
  neighbors(index: number): number[] {
    const r = this.rowOf(index);
    const c = this.colOf(index);
    const out: number[] = [];
    if (r > 0) out.push(index - this.cols);
    if (r < this.rows - 1) out.push(index + this.cols);
    if (c > 0) out.push(index - 1);
    if (c < this.cols - 1) out.push(index + 1);
    return out;
  }

  rowIndices(row: number): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.cols; c++) out.push(this.idx(row, c));
    return out;
  }
  colIndices(col: number): number[] {
    const out: number[] = [];
    for (let r = 0; r < this.rows; r++) out.push(this.idx(r, col));
    return out;
  }
  lineIndices(line: LineRef): number[] {
    return line.kind === 'row' ? this.rowIndices(line.index) : this.colIndices(line.index);
  }

  /** 形状 `cells` を (row, col) を左上原点として置けるか。盤面外・占有セルは不可。 */
  canPlace(cells: readonly Vec[], row: number, col: number): boolean {
    for (const v of cells) {
      const r = row + v.y;
      const c = col + v.x;
      if (!this.inBounds(r, c)) return false;
      if (isOccupied(this.get(r, c))) return false;
    }
    return true;
  }

  /** 置ける場所が1か所でもあるか。 */
  hasAnyPlacement(cells: readonly Vec[]): boolean {
    return this.findPlacements(cells, 1).length > 0;
  }

  /** 合法な配置位置を列挙する。`limit` を渡すとその数で打ち切る。 */
  findPlacements(cells: readonly Vec[], limit = Number.POSITIVE_INFINITY): { row: number; col: number }[] {
    const out: { row: number; col: number }[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.canPlace(cells, r, c)) {
          out.push({ row: r, col: c });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  /**
   * 形状を配置する。呼ぶ前に `canPlace` で確認すること。
   * @returns 埋めた index の配列（形状定義の順）。
   */
  place(cells: readonly Vec[], row: number, col: number, color: Color): number[] {
    if (!this.canPlace(cells, row, col)) {
      throw new Error(`illegal placement at row=${row} col=${col}`);
    }
    const out: number[] = [];
    for (const v of cells) {
      const i = this.idx(row + v.y, col + v.x);
      this.cells[i] = { kind: 'normal', color, dir: null, uid: 0 };
      out.push(i);
    }
    return out;
  }

  putSpecial(index: number, kind: SpecialKind, uid: number, color: Color | null, dir: RocketDir | null): void {
    this.cells[index] = { kind, color, dir, uid };
  }

  /** 8セルすべて埋まっている行・列。**探索中にセルを消さないこと**（呼び出し側で確定後に消去）。 */
  findFullLines(): LineRef[] {
    const out: LineRef[] = [];
    for (let r = 0; r < this.rows; r++) {
      let full = true;
      for (let c = 0; c < this.cols; c++) {
        if (!isOccupied(this.get(r, c))) {
          full = false;
          break;
        }
      }
      if (full) out.push({ kind: 'row', index: r });
    }
    for (let c = 0; c < this.cols; c++) {
      let full = true;
      for (let r = 0; r < this.rows; r++) {
        if (!isOccupied(this.get(r, c))) {
          full = false;
          break;
        }
      }
      if (full) out.push({ kind: 'col', index: c });
    }
    return out;
  }

  countFilled(): number {
    let n = 0;
    for (const c of this.cells) if (isOccupied(c)) n++;
    return n;
  }

  /** 盤面上の特殊ピースの index 一覧。 */
  specialIndices(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (isSpecialKind(this.cells[i]!.kind)) out.push(i);
    return out;
  }

  clone(): Board {
    const b = new Board(this.rows, this.cols);
    for (let i = 0; i < this.cells.length; i++) b.cells[i] = { ...this.cells[i]! };
    return b;
  }

  /**
   * デバッグ・テスト・ステージデータ用のテキスト表現。
   *   `.` = empty
   *   `R B Y G P` = normal（red / blue / yellow / green / purple）
   *   `>` = Rocket(横), `^` = Rocket(縦), `*` = Bomb, `@` = Rainbow
   */
  static fromStrings(lines: readonly string[], rows: number = BALANCE.board.rows, cols: number = BALANCE.board.cols): Board {
    const b = new Board(rows, cols);
    let uid = 1;
    for (let r = 0; r < rows; r++) {
      const line = lines[r] ?? '';
      for (let c = 0; c < cols; c++) {
        const ch = line[c] ?? '.';
        const i = b.idx(r, c);
        const color = CHAR_TO_COLOR[ch];
        if (color) {
          b.cells[i] = { kind: 'normal', color, dir: null, uid: 0 };
        } else if (ch === '>') {
          b.cells[i] = { kind: 'rocket', color: null, dir: 'h', uid: uid++ };
        } else if (ch === '^') {
          b.cells[i] = { kind: 'rocket', color: null, dir: 'v', uid: uid++ };
        } else if (ch === '*') {
          b.cells[i] = { kind: 'bomb', color: null, dir: null, uid: uid++ };
        } else if (ch === '@') {
          b.cells[i] = { kind: 'rainbow', color: null, dir: null, uid: uid++ };
        }
      }
    }
    return b;
  }

  toStrings(): string[] {
    const out: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let line = '';
      for (let c = 0; c < this.cols; c++) {
        const cell = this.get(r, c);
        if (cell.kind === 'empty') line += '.';
        else if (cell.kind === 'normal') line += COLOR_TO_CHAR[cell.color!];
        else if (cell.kind === 'rocket') line += cell.dir === 'v' ? '^' : '>';
        else if (cell.kind === 'bomb') line += '*';
        else line += '@';
      }
      out.push(line);
    }
    return out;
  }

  /** fromStrings で作った盤面の uid の最大値（続きの uid を採番するのに使う）。 */
  maxUid(): number {
    let m = 0;
    for (const c of this.cells) if (c.uid > m) m = c.uid;
    return m;
  }
}

function emptyCell(): Cell {
  return { kind: 'empty', color: null, dir: null, uid: 0 };
}

const CHAR_TO_COLOR: Record<string, Color | undefined> = {
  R: 'red',
  B: 'blue',
  Y: 'yellow',
  G: 'green',
  P: 'purple',
};

const COLOR_TO_CHAR: Record<Color, string> = {
  red: 'R',
  blue: 'B',
  yellow: 'Y',
  green: 'G',
  purple: 'P',
};
