/**
 * Project BLAST BLOCK — コア型定義
 *
 * ここは描画に一切依存しない純粋なデータ型のみ。
 * Phaser / DOM の型を import しないこと（テストとロジックの分離が壊れる）。
 */

/** 盤面の相対座標。x = 列オフセット, y = 行オフセット。 */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

export type Color = 'red' | 'blue' | 'yellow' | 'green' | 'purple';

/** 色の正準順序。tie-break を決定論にするため、この順序に依存してよい。 */
export const COLORS: readonly Color[] = ['red', 'blue', 'yellow', 'green', 'purple'];

export type SpecialKind = 'rocket' | 'bomb' | 'rainbow';

export type CellKind = 'empty' | 'normal' | SpecialKind;

export type RocketDir = 'h' | 'v';

/**
 * セル1つ分の状態。
 * - normal は color を必ず持つ。
 * - rocket / bomb は色を持ちうる（Rainbow の対象色決定に使う）。dir は rocket のみ。
 * - 特殊ピースは uid を持つ。同一 resolution 内での二重起爆防止に使う。
 */
export interface Cell {
  kind: CellKind;
  color: Color | null;
  dir: RocketDir | null;
  uid: number;
}

export const EMPTY_CELL: Readonly<Cell> = Object.freeze({
  kind: 'empty' as CellKind,
  color: null,
  dir: null,
  uid: 0,
});

export function isSpecialKind(kind: CellKind): kind is SpecialKind {
  return kind === 'rocket' || kind === 'bomb' || kind === 'rainbow';
}

export function isOccupied(cell: Cell): boolean {
  return cell.kind !== 'empty';
}

/** 完成した行 / 列の参照。 */
export interface LineRef {
  readonly kind: 'row' | 'col';
  readonly index: number;
}

/** COLOR BLAST で見つかった同色連結成分。 */
export interface BlastComponent {
  readonly color: Color;
  /** 成分に属する全セル（ライン内 / ライン外の両方）。 */
  readonly cells: readonly number[];
  readonly size: number;
  /** balance で定義される暫定区分。 */
  readonly band: 'small' | 'medium' | 'large';
}

/** 盤面に存在する特殊ピース1個の実体。起爆処理はこの単位で行う。 */
export interface SpecialInstance {
  readonly uid: number;
  readonly kind: SpecialKind;
  readonly index: number;
  readonly color: Color | null;
  readonly dir: RocketDir | null;
}

/** 起爆1回分の記録（combo の場合は group に2個以上入る）。 */
export interface Detonation {
  readonly group: readonly SpecialInstance[];
  /** 適用した効果の名前。combo 判定のデバッグ用。 */
  readonly effect: string;
  readonly cells: readonly number[];
}

/** 消去されたセルの、消去直前のスナップショット（演出用）。 */
export interface RemovedCell {
  readonly index: number;
  readonly cell: Cell;
  /** 得点計算に使った区分。special > blast > line の順に強い。 */
  readonly source: 'line' | 'blast' | 'special';
}

export interface SpawnInfo {
  readonly index: number;
  readonly kind: SpecialKind;
  readonly color: Color | null;
  readonly dir: RocketDir | null;
  readonly uid: number;
  /** 生成理由（デバッグ表示用）。 */
  readonly reason: string;
}

/** CHAIN 1回分＝1 wave の記録。 */
export interface ResolutionEvent {
  readonly chainIndex: number;
  readonly lines: readonly LineRef[];
  readonly blasts: readonly BlastComponent[];
  readonly detonations: readonly Detonation[];
  readonly removed: readonly RemovedCell[];
  readonly spawned: SpawnInfo | null;
  readonly score: number;
  readonly chainMultiplier: number;
}

export interface ResolutionResult {
  readonly events: readonly ResolutionEvent[];
  readonly maxChain: number;
  readonly totalScore: number;
  readonly totalCleared: number;
  readonly rowsCleared: number;
  readonly colsCleared: number;
  readonly specialsCreated: readonly SpecialKind[];
  readonly specialsDetonated: readonly SpecialKind[];
  /** 無限ループ防止で打ち切った場合 true。通常運用で true になってはいけない。 */
  readonly aborted: boolean;
}

/** ピースの形状定義（データ側で持つ。表示ロジックへハードコードしない）。 */
export interface PieceShape {
  readonly id: string;
  readonly label: string;
  readonly cells: readonly Vec[];
  readonly width: number;
  readonly height: number;
  /** 生成の出やすさ。 */
  readonly weight: number;
}

/** トレイに並ぶ候補ピース1個。通常セルは原則として同一色。 */
export interface Piece {
  readonly uid: number;
  readonly shape: PieceShape;
  readonly color: Color;
}

/** ステージデータから固定 piece 列を指定するための最小表現。 */
export interface PieceSpec {
  readonly shape: string;
  readonly color: Color;
}

export type SetEvaluation = 'safe' | 'risky' | 'dead';
