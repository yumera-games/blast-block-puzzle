import { BALANCE } from '../data/balance';
import type { Board } from './Board';
import {
  type BlastComponent,
  type Color,
  type Detonation,
  type LineRef,
  type RocketDir,
  type SpawnInfo,
  type SpecialInstance,
  type SpecialKind,
  COLORS,
} from './types';

/* ==========================================================================
   生成（spawn）
   特殊ピースは生成された瞬間には起爆せず、盤面へ残る。
   ========================================================================== */

export interface SpawnContext {
  readonly board: Board;
  readonly lines: readonly LineRef[];
  readonly blasts: readonly BlastComponent[];
  /** 今回置いた piece を構成するセル。wave 2 以降は空でよい。 */
  readonly placedCells: readonly number[];
  /** piece 中心（盤面座標、小数可）。 */
  readonly placedCenter: { row: number; col: number } | null;
  /** この wave で消去される予定のセル。 */
  readonly removal: ReadonlySet<number>;
  readonly nextUid: () => number;
}

/**
 * この wave で生成する特殊ピースを1つ決める。
 *
 * 優先順位は Rainbow > Bomb > Rocket。
 * （Phase 1 の暫定仕様：複数条件を同時に満たしても生成は1個までとする。）
 */
export function decideSpawn(ctx: SpawnContext): SpawnInfo | null {
  const lineCount = ctx.lines.length;
  const maxBlast = ctx.blasts.reduce((m, b) => Math.max(m, b.size), 0);
  const cfg = BALANCE.specials;

  let kind: SpecialKind | null = null;
  let reason = '';

  if (maxBlast >= cfg.rainbow.blastSize) {
    kind = 'rainbow';
    reason = `colorBlast>=${cfg.rainbow.blastSize} (${maxBlast})`;
  } else if (lineCount >= cfg.rainbow.linesRequired) {
    kind = 'rainbow';
    reason = `lines>=${cfg.rainbow.linesRequired} (${lineCount})`;
  } else if (maxBlast >= cfg.bomb.blastSize) {
    kind = 'bomb';
    reason = `colorBlast>=${cfg.bomb.blastSize} (${maxBlast})`;
  } else if (lineCount >= cfg.bomb.linesRequired) {
    kind = 'bomb';
    reason = `lines>=${cfg.bomb.linesRequired} (${lineCount})`;
  } else if (lineCount === cfg.rocket.linesRequired) {
    kind = 'rocket';
    reason = `lines==${cfg.rocket.linesRequired}`;
  }

  if (kind === null) return null;

  const index = pickSpawnIndex(ctx);
  if (index === null) return null;

  const color = ctx.board.at(index).color;
  const dir = kind === 'rocket' ? pickRocketDirection(ctx, index) : null;

  return { index, kind, color, dir, uid: ctx.nextUid(), reason };
}

/**
 * 生成位置：
 *   原則 = 「今回置いた piece のセルのうち、今回の消去領域に含まれ、piece 中心に最も近いセル」
 *   fallback 1 = 消去領域のうち通常セルで、piece 中心（無ければ盤面中心）に最も近いセル
 *   fallback 2 = 消去領域の最小 index
 * いずれも tie-break は (距離, row, col) の昇順で、**必ず決定論**になる。
 */
export function pickSpawnIndex(ctx: SpawnContext): number | null {
  const board = ctx.board;
  const center = ctx.placedCenter ?? { row: (board.rows - 1) / 2, col: (board.cols - 1) / 2 };

  const primary = ctx.placedCells.filter((i) => ctx.removal.has(i) && board.at(i).kind === 'normal');
  const best = nearest(board, primary, center);
  if (best !== null) return best;

  const secondary = [...ctx.removal].filter((i) => board.at(i).kind === 'normal');
  const best2 = nearest(board, secondary, center);
  if (best2 !== null) return best2;

  const all = [...ctx.removal].sort((a, b) => a - b);
  return all.length > 0 ? all[0]! : null;
}

function nearest(board: Board, indices: readonly number[], center: { row: number; col: number }): number | null {
  let best: number | null = null;
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity];
  for (const i of indices) {
    const r = board.rowOf(i);
    const c = board.colOf(i);
    const d = (r - center.row) ** 2 + (c - center.col) ** 2;
    const key: [number, number, number] = [d, r, c];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = i;
      bestKey = key;
    }
  }
  return best;
}

/**
 * Rocket の向き決定（Phase 1 の暫定ロジック）。
 * **ハードコードせず、ここ1か所に閉じる。**
 *   - 完成ラインが行のみ  → 縦 Rocket（行を消した後、列方向へ効かせるため）
 *   - 完成ラインが列のみ  → 横 Rocket
 *   - 行と列が混在        → 生成セルの行/列のうち、埋まっているセルが多い方向へ
 *   - 上記で決まらない    → 'h'
 */
export function pickRocketDirection(ctx: SpawnContext, index: number): RocketDir {
  const rows = ctx.lines.filter((l) => l.kind === 'row').length;
  const cols = ctx.lines.filter((l) => l.kind === 'col').length;
  if (rows > 0 && cols === 0) return 'v';
  if (cols > 0 && rows === 0) return 'h';

  const board = ctx.board;
  const r = board.rowOf(index);
  const c = board.colOf(index);
  let rowFilled = 0;
  let colFilled = 0;
  for (let i = 0; i < board.cols; i++) if (board.get(r, i).kind !== 'empty') rowFilled++;
  for (let i = 0; i < board.rows; i++) if (board.get(i, c).kind !== 'empty') colFilled++;
  if (rowFilled > colFilled) return 'h';
  if (colFilled > rowFilled) return 'v';
  return 'h';
}

/* ==========================================================================
   起爆（detonation）
   特殊ピースはタップでは起動しない。LINE CLEAR / COLOR BLAST / 他特殊の効果で
   消去対象へ巻き込まれたときだけ起爆する。
   ========================================================================== */

/**
 * 同一 wave で起爆する特殊を、盤面上の上下左右の隣接でグループ化する。
 * グループのサイズが 2 以上なら「特殊×特殊」の combo として扱う。
 */
export function groupAdjacentSpecials(board: Board, specials: readonly SpecialInstance[]): SpecialInstance[][] {
  const byIndex = new Map<number, SpecialInstance>();
  for (const s of specials) byIndex.set(s.index, s);

  const seen = new Set<number>();
  const groups: SpecialInstance[][] = [];
  // index 昇順で走査してグループ順序を決定論にする。
  const ordered = [...specials].sort((a, b) => a.index - b.index);

  for (const s of ordered) {
    if (seen.has(s.index)) continue;
    const group: SpecialInstance[] = [];
    const stack = [s.index];
    seen.add(s.index);
    while (stack.length > 0) {
      const i = stack.pop()!;
      group.push(byIndex.get(i)!);
      for (const n of board.neighbors(i)) {
        if (!byIndex.has(n) || seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    group.sort((a, b) => a.index - b.index);
    groups.push(group);
  }
  return groups;
}

export interface DetonationContext {
  readonly board: Board;
  /** Rainbow の対象色を決めるときの最後のよりどころ。 */
  readonly fallbackColor: Color | null;
}

/**
 * 1グループぶんの起爆効果セルを求める。
 *
 * 「特殊×特殊」の組み合わせはここ1か所で分岐する。
 */
export function detonate(group: readonly SpecialInstance[], ctx: DetonationContext): Detonation {
  const board = ctx.board;
  const cells = new Set<number>();
  for (const s of group) cells.add(s.index);

  const rockets = group.filter((s) => s.kind === 'rocket');
  const bombs = group.filter((s) => s.kind === 'bomb');
  const rainbows = group.filter((s) => s.kind === 'rainbow');
  const cfg = BALANCE.specials;
  let effect: string;

  if (rainbows.length >= 2) {
    // Rainbow + Rainbow → 盤面全体
    effect = 'rainbow+rainbow';
    for (let i = 0; i < board.size; i++) cells.add(i);
  } else if (rainbows.length === 1 && rockets.length > 0) {
    // Rainbow + Rocket → 対象色セルを Rocket 相当として連続起爆
    effect = 'rainbow+rocket';
    const color = rainbowTargetColor(group, ctx);
    const dirs = uniqueDirs(rockets);
    for (const i of colorCells(board, color)) {
      cells.add(i);
      for (const d of dirs) addLine(board, cells, i, d);
    }
  } else if (rainbows.length === 1 && bombs.length > 0) {
    // Rainbow + Bomb → 対象色セルを Bomb 相当として処理
    effect = 'rainbow+bomb';
    const color = rainbowTargetColor(group, ctx);
    for (const i of colorCells(board, color)) {
      cells.add(i);
      addSquare(board, cells, i, cfg.bomb.radius);
    }
  } else if (rainbows.length === 1) {
    // Rainbow 単体 → 対象色を盤面から消す
    effect = 'rainbow';
    const color = rainbowTargetColor(group, ctx);
    for (const i of colorCells(board, color)) cells.add(i);
  } else if (bombs.length >= 2) {
    // Bomb + Bomb → 単体より大きい範囲
    effect = 'bomb+bomb';
    for (const b of bombs) addSquare(board, cells, b.index, cfg.combo.bombBombRadius);
  } else if (bombs.length === 1 && rockets.length > 0) {
    // Rocket + Bomb → 通常 Rocket より太い十字
    effect = 'rocket+bomb';
    const half = cfg.combo.rocketBombHalfWidth;
    const b = bombs[0]!;
    addBand(board, cells, b.index, 'h', half);
    addBand(board, cells, b.index, 'v', half);
  } else if (rockets.length >= 2) {
    // Rocket + Rocket → 縦横クロス
    effect = 'rocket+rocket';
    for (const r of rockets) {
      addLine(board, cells, r.index, 'h');
      addLine(board, cells, r.index, 'v');
    }
  } else if (rockets.length === 1) {
    effect = 'rocket';
    addLine(board, cells, rockets[0]!.index, rockets[0]!.dir ?? 'h');
  } else if (bombs.length === 1) {
    effect = 'bomb';
    addSquare(board, cells, bombs[0]!.index, cfg.bomb.radius);
  } else {
    effect = 'none';
  }

  return { group, effect, cells: [...cells].sort((a, b) => a - b) };
}

/**
 * Rainbow の対象色。resolution event から決定論的に決まること。
 *   1. 同じ combo グループにいる特殊が色を持っていればその色
 *   2. Rainbow 自身が色を持っていればその色
 *   3. resolution のきっかけになった色（置いた piece の色）
 *   4. 盤面に最も多い通常色（同数なら COLORS の並び順）
 *   5. COLORS の先頭
 */
export function rainbowTargetColor(group: readonly SpecialInstance[], ctx: DetonationContext): Color {
  for (const s of group) {
    if (s.kind !== 'rainbow' && s.color) return s.color;
  }
  for (const s of group) {
    if (s.color) return s.color;
  }
  if (ctx.fallbackColor) return ctx.fallbackColor;

  const counts = new Map<Color, number>();
  for (let i = 0; i < ctx.board.size; i++) {
    const c = ctx.board.at(i);
    if (c.kind === 'normal' && c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
  }
  let best: Color = COLORS[0]!;
  let bestN = -1;
  for (const color of COLORS) {
    const n = counts.get(color) ?? 0;
    if (n > bestN) {
      best = color;
      bestN = n;
    }
  }
  return best;
}

function uniqueDirs(rockets: readonly SpecialInstance[]): RocketDir[] {
  const set = new Set<RocketDir>();
  for (const r of rockets) set.add(r.dir ?? 'h');
  return [...set].sort();
}

function colorCells(board: Board, color: Color): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.size; i++) {
    const c = board.at(i);
    if (c.kind === 'normal' && c.color === color) out.push(i);
  }
  return out;
}

function addLine(board: Board, out: Set<number>, index: number, dir: RocketDir): void {
  if (dir === 'h') for (const i of board.rowIndices(board.rowOf(index))) out.add(i);
  else for (const i of board.colIndices(board.colOf(index))) out.add(i);
}

function addSquare(board: Board, out: Set<number>, index: number, radius: number): void {
  const r0 = board.rowOf(index);
  const c0 = board.colOf(index);
  for (let r = r0 - radius; r <= r0 + radius; r++) {
    for (let c = c0 - radius; c <= c0 + radius; c++) {
      if (board.inBounds(r, c)) out.add(board.idx(r, c));
    }
  }
}

/** 太い十字の片側。dir='h' なら行方向の帯（上下 half 行ぶん）。 */
function addBand(board: Board, out: Set<number>, index: number, dir: RocketDir, half: number): void {
  const r0 = board.rowOf(index);
  const c0 = board.colOf(index);
  if (dir === 'h') {
    for (let r = r0 - half; r <= r0 + half; r++) {
      if (r < 0 || r >= board.rows) continue;
      for (const i of board.rowIndices(r)) out.add(i);
    }
  } else {
    for (let c = c0 - half; c <= c0 + half; c++) {
      if (c < 0 || c >= board.cols) continue;
      for (const i of board.colIndices(c)) out.add(i);
    }
  }
}
