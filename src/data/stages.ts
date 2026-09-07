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
  // ROCKET を「作る」だけでなく「残して、あとで巻きこんで起爆する」まで 1 ステージで見せる。
  // 2 行を同時に消すので Rocket は縦向きになる。縦向きは行では起爆させられないため、
  // 「行をそろえて巻きこむ → 縦に飛ぶ」という向きの関係がそのまま教材になる。
  {
    id: 5,
    name: 'ROCKET を 作って 起爆する',
    seed: 1005,
    moves: 6,
    initialBoard: [
      '.......R',
      '.......B',
      '.......Y',
      '.......G',
      '........',
      '........',
      'RBYGPRB.',
      'BYGPRBY.',
    ],
    fixedSets: [[p('v2', 'green'), p('h4', 'blue'), p('h3', 'purple')]],
    objectives: [
      { kind: 'specialCreated', target: 1, special: 'rocket', label: 'ROCKET を 作る' },
      { kind: 'specialDetonated', target: 1, special: 'rocket', label: 'ROCKET を 起爆する' },
    ],
    tutorial: {
      intro:
        '2ラインを 同時に 消すと ROCKET が 生まれます。\n' +
        'ROCKET は その場に 残ります。\n' +
        'あとで ラインに 巻きこむと、向いている 方向へ まとめて 消します。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 6, col: 7, text: 'たてに 置くと 2ライン 同時に そろいます' },
        { move: 1, pieceIndex: 1, row: 6, col: 0, text: 'ROCKET と 同じ行を うめていきます' },
        { move: 2, pieceIndex: 2, row: 6, col: 4, text: 'この行が そろうと ROCKET が たてに 飛びます' },
      ],
    },
  },

  // ---------------------------------------------------------------- Stage 6
  // COLOR BLAST 単体の教材。閾値 5 ちょうどではなく 7 マスの塊にして、
  // ライン外が 4 マス（2x2）まとめて消えるところを見せる。8 未満なので特殊は生まれない。
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
      '.RR.....',
      '.RR.....',
      '.RRBYGPY',
    ],
    fixedSets: [[p('dot', 'red'), p('h2', 'green'), p('v2', 'blue')]],
    objectives: [
      { kind: 'colorBlast', target: 1, param: 5, label: '5マス以上の COLOR BLAST を 1回' },
    ],
    tutorial: {
      intro:
        'ライン上の 同じ色が 5つ以上 つながっていると、\n' +
        'ライン外の 同色まで まとめて 消えます（COLOR BLAST）。',
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
      '.G......',
      '.GG.....',
      '.GGBYPRB',
      '.RR.....',
      '.RRBYGPR',
    ],
    fixedSets: [[p('dot', 'red'), p('dot', 'green'), p('h2', 'purple')]],
    objectives: [
      { kind: 'colorBlast', target: 2, param: 5, label: '5マス以上の COLOR BLAST を 2回' },
    ],
    tutorial: { showGuide: false },
  },

  // ---------------------------------------------------------------- Stage 8
  // Stage 5 と同じ「作って起爆する」だが、行と列の交点で作るので Rocket は横向きになる。
  // 横向きは列をそろえて巻きこむ。向きによって巻きこみ方が変わることを確かめさせる。
  {
    id: 8,
    name: 'ROCKET の 向きを 使う',
    seed: 1008,
    moves: 8,
    initialBoard: [
      'Y.......',
      'G.......',
      'P.......',
      'R.......',
      'B.......',
      'Y.......',
      'G.......',
      '.RBYGPRB',
    ],
    fixedSets: [
      [p('dot', 'purple'), p('h3', 'yellow'), p('v4', 'blue')],
      [p('v3', 'green'), p('dot', 'red'), p('h2', 'blue')],
    ],
    objectives: [
      { kind: 'specialCreated', target: 1, special: 'rocket', label: 'ROCKET を 作る' },
      { kind: 'specialDetonated', target: 1, special: 'rocket', label: 'ROCKET を 起爆する' },
    ],
    tutorial: {
      intro:
        '行と列を 同時に 消すと、よこ向きの ROCKET が 生まれます。\n' +
        'よこ向きは 列を そろえて 巻きこむと、その行を まとめて 消します。',
      showGuide: false,
    },
  },

  // ---------------------------------------------------------------- Stage 9
  // 赤の塊は Phase 1 で読みやすさが良かったので見せ方は踏襲し、
  // 新しい BOMB 閾値（11）に合わせて 12 マスへ増やす。青 3 マスは BOMB の 3x3 の的。
  {
    id: 9,
    name: 'BOMB を 起爆する',
    seed: 1009,
    moves: 8,
    initialBoard: [
      '........',
      '........',
      '........',
      '.RRR....',
      '.RRR....',
      '.RRR....',
      '.RRBBB..',
      'YRYB.GPB',
    ],
    fixedSets: [[p('dot', 'yellow'), p('h4', 'purple'), p('h3', 'green')]],
    objectives: [
      { kind: 'specialCreated', target: 1, special: 'bomb', label: 'BOMB を 作る' },
      { kind: 'specialDetonated', target: 1, special: 'bomb', label: 'BOMB を 起爆する' },
    ],
    tutorial: {
      intro:
        '11マス以上の COLOR BLAST で BOMB が 生まれます。\n' +
        'BOMB は 巻きこまれると まわりの 3x3 を 消します。',
      showGuide: false,
    },
  },

  // --------------------------------------------------------------- Stage 10
  // プレイヤーの 1 手で起爆が始まり、
  //   wave1 ライン消去（巻きこまれるのは ROCKET 1 個だけ）
  //   wave2 その ROCKET が起爆 → 射線(列 3)が盤面の BOMB へ直接届いて combo へ昇格
  //   wave3 combo の十字が 上の ROCKET へ届いて連鎖
  // と進む。「最初は 1 個 → 届いた相手を取り込んで combo → さらに連鎖」が 1 手で見える。
  {
    id: 10,
    name: 'CHAIN 3',
    seed: 1010,
    moves: 8,
    initialBoard: [
      'YY..>.YY',
      '........',
      '..R.R...',
      '..R*R...',
      '..R.R...',
      '........',
      '........',
      'RB.^YGPB',
    ],
    fixedSets: [[p('dot', 'green'), p('dot', 'purple'), p('dot', 'red')]],
    objectives: [{ kind: 'chain', target: 1, param: 3, label: 'CHAIN 3 以上を 1回' }],
    tutorial: {
      intro:
        '特殊の 効果が 別の 特殊へ 届くと、いっしょに 起爆します（combo）。\n' +
        'その先の 特殊へ さらに 届くと、CHAIN が のびていきます。',
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
