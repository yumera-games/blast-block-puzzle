import type { Color, PieceSpec, SpecialKind } from '../game/types';

/* ==========================================================================
   ステージデータ
   **ゲームロジック内に stage 番号の if 文を書かないこと。**
   目的・seed・固定 piece 列・初期盤面・チュートリアル文言はすべてここに持つ。
   将来数千ステージへ増やしても、増えるのはこの配列だけ。
   ========================================================================== */

export type ObjectiveKind =
  | 'linesTotal'
  | 'linesRow'
  | 'linesCol'
  | 'simultaneousLines'
  | 'colorBlast'
  | 'specialCreated'
  | 'specialDetonated'
  | 'chain';

export interface Objective {
  readonly kind: ObjectiveKind;
  /** 何回（何本）達成すればよいか。 */
  readonly target: number;
  /** kind ごとの閾値。simultaneousLines=同時本数 / colorBlast=セル数 / chain=CHAIN数。 */
  readonly param?: number;
  readonly special?: SpecialKind;
  /** HUD 表示文。データ側に持ち、コードへ散在させない。 */
  readonly label: string;
}

/** チュートリアルの推奨配置。move は 0 始まりの手数。 */
export interface TutorialHint {
  readonly move: number;
  readonly pieceIndex: number;
  readonly row: number;
  readonly col: number;
  readonly text?: string;
}

export interface StageTutorial {
  /** ステージ開始時に一度だけ出す説明。新システム登場時のみ設定する。 */
  readonly intro?: string;
  /** 推奨配置セルを常時表示するか（Stage 1〜3 のみ true）。 */
  readonly showGuide: boolean;
  readonly hints?: readonly TutorialHint[];
}

export interface StageDef {
  readonly id: number;
  readonly name: string;
  /** 固定 seed。同じ seed なら同じ候補列が再現される。 */
  readonly seed: number;
  readonly moves: number;
  /** 初期盤面。Board.fromStrings と同じ記法（. R B Y G P > ^ * @）。 */
  readonly initialBoard?: readonly string[];
  /** 最初の数セットを固定する。テスト再現性のため。使い切ったら seed 乱数へ移る。 */
  readonly fixedSets?: readonly (readonly PieceSpec[])[];
  readonly objectives: readonly Objective[];
  readonly tutorial: StageTutorial;
}

const p = (shape: string, color: Color): PieceSpec => ({ shape, color });

export const STAGES: readonly StageDef[] = [
  // ---------------------------------------------------------------- Stage 1
  {
    id: 1,
    name: 'ラインを 1本 消す',
    seed: 1001,
    moves: 5,
    initialBoard: [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'RBYGPRB.',
    ],
    fixedSets: [[p('dot', 'red'), p('h2', 'blue'), p('v2', 'green')]],
    objectives: [{ kind: 'linesTotal', target: 1, label: 'ラインを 1本 消す' }],
    tutorial: {
      intro: 'ピースを ドラッグして 盤面へ。\n横1列が 8マス 埋まると 消えます。',
      showGuide: true,
      hints: [{ move: 0, pieceIndex: 0, row: 7, col: 7, text: 'ここに 置くと 1列 そろいます' }],
    },
  },

  // ---------------------------------------------------------------- Stage 2
  {
    id: 2,
    name: 'ラインを 合計 2本',
    seed: 1002,
    moves: 6,
    initialBoard: [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.RBYGPRB',
      'RBYGPRB.',
    ],
    fixedSets: [[p('dot', 'red'), p('dot', 'green'), p('h2', 'blue')]],
    objectives: [{ kind: 'linesTotal', target: 2, label: 'ラインを 合計 2本 消す' }],
    tutorial: {
      intro: '3つの 候補は 好きな 順番で 置けます。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 7, col: 7 },
        { move: 1, pieceIndex: 1, row: 6, col: 0 },
      ],
    },
  },

  // ---------------------------------------------------------------- Stage 3
  {
    id: 3,
    name: 'たてのラインを 2本',
    seed: 1003,
    moves: 6,
    initialBoard: [
      'R......Y',
      'B......G',
      'Y......P',
      'G......R',
      'P......B',
      'R......Y',
      'B......G',
      '........',
    ],
    fixedSets: [[p('dot', 'green'), p('dot', 'purple'), p('v2', 'blue')]],
    objectives: [{ kind: 'linesCol', target: 2, label: 'たてのラインを 2本 消す' }],
    tutorial: {
      intro: 'ラインは たてでも 消えます。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 7, col: 0 },
        { move: 1, pieceIndex: 1, row: 7, col: 7 },
      ],
    },
  },

  // ---------------------------------------------------------------- Stage 4
  {
    id: 4,
    name: 'ラインを 合計 3本',
    seed: 1004,
    moves: 6,
    initialBoard: [
      '........',
      '........',
      '........',
      'RBYGP...',
      '........',
      'RBY..GPR',
      '........',
      '.YGPRBYG',
    ],
    fixedSets: [[p('dot', 'green'), p('h2', 'purple'), p('h3', 'blue')]],
    objectives: [{ kind: 'linesTotal', target: 3, label: 'ラインを 合計 3本 消す' }],
    tutorial: { showGuide: false },
  },

  // ---------------------------------------------------------------- Stage 5
  {
    id: 5,
    name: '2ライン 同時完成',
    seed: 1005,
    moves: 5,
    initialBoard: [
      '.......Y',
      '.......G',
      '.......P',
      '.......R',
      '.......B',
      '.......Y',
      '.......G',
      'RBYGPRB.',
    ],
    fixedSets: [[p('dot', 'purple'), p('h2', 'blue'), p('v2', 'green')]],
    objectives: [
      { kind: 'simultaneousLines', target: 1, param: 2, label: '2ラインを 同時に 消す' },
    ],
    tutorial: {
      intro: '2ラインを 同時に 消すと ROCKET が 生まれます。\nROCKET は その場に 残り、あとで 巻きこまれると 起爆します。',
      showGuide: false,
    },
  },

  // ---------------------------------------------------------------- Stage 6
  {
    id: 6,
    name: 'COLOR BLAST',
    seed: 1006,
    moves: 5,
    initialBoard: [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.R......',
      '.RRBYGPR',
    ],
    fixedSets: [[p('dot', 'red'), p('h2', 'green'), p('v2', 'blue')]],
    objectives: [
      { kind: 'colorBlast', target: 1, param: 4, label: '4マス以上の COLOR BLAST を 1回' },
    ],
    tutorial: {
      intro: 'ライン上の 同じ色が 4つ以上 つながっていると、\nライン外の 同色まで まとめて 消えます（COLOR BLAST）。',
      showGuide: false,
    },
  },

  // ---------------------------------------------------------------- Stage 7
  {
    id: 7,
    name: 'COLOR BLAST を 2回',
    seed: 1007,
    moves: 7,
    initialBoard: [
      '........',
      '........',
      '........',
      '........',
      '.G......',
      '.GGBYPRB',
      '.R......',
      '.RRBYGPR',
    ],
    fixedSets: [[p('dot', 'red'), p('dot', 'green'), p('h2', 'purple')]],
    objectives: [
      { kind: 'colorBlast', target: 2, param: 4, label: '4マス以上の COLOR BLAST を 2回' },
    ],
    tutorial: { showGuide: false },
  },

  // ---------------------------------------------------------------- Stage 8
  {
    id: 8,
    name: 'ROCKET を 起爆する',
    seed: 1008,
    moves: 8,
    initialBoard: [
      '.......Y',
      '.......G',
      '.......P',
      '.......R',
      '.......B',
      '.......Y',
      '.......G',
      'RBYGPRB.',
    ],
    fixedSets: [
      [p('dot', 'purple'), p('dot', 'green'), p('dot', 'yellow')],
      [p('h4', 'blue'), p('h3', 'yellow'), p('dot', 'green')],
    ],
    objectives: [
      { kind: 'specialCreated', target: 1, special: 'rocket', label: 'ROCKET を 作る' },
      { kind: 'specialDetonated', target: 1, special: 'rocket', label: 'ROCKET を 起爆する' },
    ],
    tutorial: {
      intro: '特殊ピースは タップでは 起動しません。\nあとから ラインなどで 巻きこむと 起爆します。',
      showGuide: false,
    },
  },

  // ---------------------------------------------------------------- Stage 9
  {
    id: 9,
    name: 'BOMB を 起爆する',
    seed: 1009,
    moves: 8,
    initialBoard: [
      '........',
      '........',
      '........',
      '........',
      '.RRR....',
      '.RRR....',
      '.RR.....',
      '.RYBGPYB',
    ],
    fixedSets: [
      [p('dot', 'green'), p('dot', 'purple'), p('dot', 'yellow')],
      [p('h4', 'blue'), p('h3', 'yellow'), p('dot', 'green')],
    ],
    objectives: [
      { kind: 'specialCreated', target: 1, special: 'bomb', label: 'BOMB を 作る' },
      { kind: 'specialDetonated', target: 1, special: 'bomb', label: 'BOMB を 起爆する' },
    ],
    tutorial: {
      intro: '9マス以上の COLOR BLAST で BOMB が 生まれます。',
      showGuide: false,
    },
  },

  // --------------------------------------------------------------- Stage 10
  {
    id: 10,
    name: 'CHAIN 3',
    seed: 1010,
    moves: 8,
    initialBoard: [
      '........',
      '........',
      '..YYY...',
      '..Y*Y...',
      '..YYY...',
      '........',
      '........',
      'RB.^YGPB',
    ],
    fixedSets: [[p('dot', 'green'), p('dot', 'purple'), p('dot', 'red')]],
    objectives: [{ kind: 'chain', target: 1, param: 3, label: 'CHAIN 3 以上を 1回' }],
    tutorial: {
      intro: '特殊が 別の 特殊を 巻きこむと CHAIN が つながります。',
      showGuide: false,
    },
  },
];

export function stageById(id: number): StageDef {
  const s = STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown stage id: ${id}`);
  return s;
}

export const FIRST_STAGE = STAGES[0]!.id;
export const LAST_STAGE = STAGES[STAGES.length - 1]!.id;
