/**
 * コアルールの統計測定（Phase 2A の前後比較用）。
 *
 *   npx vite-node tools/stats.ts
 *
 * **ゲーム本体には一切影響しない。** src/game のロジックを import して回すだけで、
 * ここで測った値がゲームへ戻ることはない。Phase 1 と Phase 2A で同じ条件を回して
 * 比べられるよう、使う API は両方に存在するものだけに限っている。
 *
 * 測るもの:
 *   - COLOR BLAST の発生率とサイズ分布
 *   - 特殊の生成数（rocket / bomb / rainbow）と起爆数
 *   - combo の成立数と成立率
 *   - CHAIN 2 以上 / 3 以上の発生率
 *   - 貪欲配置とランダム配置での生存手数
 */
import { Board } from '../src/game/Board';
import { PieceGenerator } from '../src/game/PieceGenerator';
import { canPlacePiece, placePiece } from '../src/game/Piece';
import { resolveBoard } from '../src/game/Resolver';
import type { Piece } from '../src/game/types';

const SIZE = 8;
const MAX_MOVES = 400;
const GREEDY_TRIALS = 120;
const RANDOM_TRIALS = 200;

/** 空きセルの孤立を嫌う指標。貪欲 AI の tie-break に使う。 */
function openness(b: Board): number {
  let s = 0;
  for (let i = 0; i < b.rows * b.cols; i++) {
    if (!b.isEmptyAt(i)) continue;
    const n = b.neighbors(i);
    s += n.filter((j) => b.isEmptyAt(j)).length + (4 - n.length) * 0.5;
  }
  return s;
}

interface Stats {
  moves: number;
  lines: number;
  blastEvents: number;
  blastSizes: number[];
  created: Record<string, number>;
  detonatedSpecials: number;
  detonationGroups: number;
  comboGroups: number;
  chain2: number;
  chain3: number;
  survived: number[];
}

const emptyStats = (): Stats => ({
  moves: 0, lines: 0, blastEvents: 0, blastSizes: [], created: {},
  detonatedSpecials: 0, detonationGroups: 0, comboGroups: 0,
  chain2: 0, chain3: 0, survived: [],
});

/** 盤面を最も空けられる手を選ぶ貪欲プレイヤー。上限手数まで、または詰むまで打つ。 */
function playGreedy(seed: number, acc: Stats): void {
  const board = new Board(SIZE, SIZE);
  const gen = new PieceGenerator(seed);
  let tray: (Piece | null)[] = gen.next(board);
  let moves = 0;

  for (let m = 0; m < MAX_MOVES; m++) {
    let best: { i: number; r: number; c: number; k: number } | null = null;
    for (let i = 0; i < tray.length; i++) {
      const p = tray[i];
      if (!p) continue;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (!canPlacePiece(board, p, r, c)) continue;
          const sim = board.clone();
          const cells = placePiece(sim, p, r, c);
          const res = resolveBoard(sim, { placedCells: cells, placedColor: p.color });
          const k = res.totalCleared * 1000 + (SIZE * SIZE - sim.countFilled()) * 10 + openness(sim);
          if (!best || k > best.k) best = { i, r, c, k };
        }
      }
    }
    if (!best) break; // どこにも置けない = ゲームオーバー
    const p = tray[best.i]!;
    const cells = placePiece(board, p, best.r, best.c);
    const res = resolveBoard(board, { placedCells: cells, placedColor: p.color });
    tray[best.i] = null;
    moves++;
    acc.moves++;
    acc.lines += res.rowsCleared + res.colsCleared;

    let sawBlast = false;
    for (const e of res.events) {
      for (const b of e.blasts) {
        acc.blastSizes.push(b.size);
        sawBlast = true;
      }
      for (const d of e.detonations) {
        acc.detonationGroups++;
        acc.detonatedSpecials += d.group.length;
        if (d.group.length >= 2) acc.comboGroups++;
      }
      if (e.spawned) acc.created[e.spawned.kind] = (acc.created[e.spawned.kind] ?? 0) + 1;
    }
    if (sawBlast) acc.blastEvents++;
    if (res.maxChain >= 2) acc.chain2++;
    if (res.maxChain >= 3) acc.chain3++;

    if (tray.every((x) => x === null)) tray = gen.next(board);
  }
  acc.survived.push(moves);
}

/** 置ける場所からランダムに選ぶだけのプレイヤー（腕の下限の目安）。 */
function playRandom(seed: number): number {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const board = new Board(SIZE, SIZE);
  const gen = new PieceGenerator(seed);
  let tray: (Piece | null)[] = gen.next(board);
  let moves = 0;

  for (let m = 0; m < MAX_MOVES; m++) {
    const opts: { i: number; r: number; c: number }[] = [];
    for (let i = 0; i < tray.length; i++) {
      const p = tray[i];
      if (!p) continue;
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) if (canPlacePiece(board, p, r, c)) opts.push({ i, r, c });
    }
    if (opts.length === 0) break;
    const o = opts[Math.floor(rnd() * opts.length)]!;
    const p = tray[o.i]!;
    const cells = placePiece(board, p, o.r, o.c);
    resolveBoard(board, { placedCells: cells, placedColor: p.color });
    tray[o.i] = null;
    moves++;
    if (tray.every((x) => x === null)) tray = gen.next(board);
  }
  return moves;
}

const pct = (n: number, of: number) => (of === 0 ? '0.00%' : ((n / of) * 100).toFixed(2) + '%');
const avg = (a: readonly number[]) => (a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length);
const median = (a: readonly number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
};

const acc = emptyStats();
for (let i = 0; i < GREEDY_TRIALS; i++) playGreedy(90000 + i * 7, acc);

const sizeHist: Record<string, number> = {};
for (const b of acc.blastSizes) {
  const k = b >= 15 ? '15+' : b >= 11 ? '11-14' : b >= 8 ? '8-10' : b >= 5 ? '5-7' : '4以下';
  sizeHist[k] = (sizeHist[k] ?? 0) + 1;
}
const randomMoves = Array.from({ length: RANDOM_TRIALS }, (_, i) => playRandom(4200 + i * 11));

console.log(`[8x8 / 貪欲 ${GREEDY_TRIALS} 試行・上限 ${MAX_MOVES} 手]`);
console.log(` 総手数                 : ${acc.moves}`);
console.log(` 消したライン           : ${acc.lines} (${(acc.lines / acc.moves).toFixed(3)} 本/手)`);
console.log(` COLOR BLAST 発生率     : ${pct(acc.blastEvents, acc.moves)}  (${acc.blastEvents} 手)`);
console.log(` COLOR BLAST 総数       : ${acc.blastSizes.length} / 平均サイズ ${avg(acc.blastSizes).toFixed(2)}`);
console.log(` COLOR BLAST サイズ分布 : ${JSON.stringify(sizeHist)}`);
console.log(` 特殊の生成             : ${JSON.stringify(acc.created)} = ${pct(Object.values(acc.created).reduce((a, b) => a + b, 0), acc.moves)} の手`);
console.log(` 特殊の起爆             : ${acc.detonatedSpecials} 個 / ${acc.detonationGroups} グループ`);
console.log(` combo 成立             : ${acc.comboGroups} グループ = 起爆グループの ${pct(acc.comboGroups, acc.detonationGroups)}`);
console.log(` CHAIN 2 以上           : ${pct(acc.chain2, acc.moves)}  / CHAIN 3 以上: ${pct(acc.chain3, acc.moves)}`);
console.log(` 貪欲プレイヤー生存手数 : 平均 ${avg(acc.survived).toFixed(1)} / 中央値 ${median(acc.survived)} / 最短 ${Math.min(...acc.survived)}`);
console.log(`\n[8x8 / ランダム ${RANDOM_TRIALS} 試行]`);
console.log(` ランダム生存手数       : 平均 ${avg(randomMoves).toFixed(1)} / 中央値 ${median(randomMoves)} / 最短 ${Math.min(...randomMoves)}`);
