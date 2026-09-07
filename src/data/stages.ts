import type { Color, PieceSpec, SpecialKind } from '../game/types';
import type { ComboEffect } from './combos';

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
  | 'combo'
  | 'chain';

export interface Objective {
  readonly kind: ObjectiveKind;
  /** 何回（何本）達成すればよいか。 */
  readonly target: number;
  /** kind ごとの閾値。simultaneousLines=同時本数 / colorBlast=セル数 / chain=CHAIN数。 */
  readonly param?: number;
  readonly special?: SpecialKind;
  /** kind='combo' のとき、特定の組み合わせだけを数えたい場合に指定する。
   *  省略すると「特殊 x 特殊 ならどれでも」になる。 */
  readonly effect?: ComboEffect;
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
  /** 盤面上の推奨セルを光らせるか。省略時 true。
   *  false にすると**文だけ**出す＝「いまの目的」は伝えるが着地点は教えない。 */
  readonly showCell?: boolean;
}

export interface StageTutorial {
  /** ステージ開始時に一度だけ出す説明。新システム登場時のみ設定する。 */
  readonly intro?: string;
  /** クリアカードへ出す「いま盤面で何が起きたか」のまとめ。教材ステージだけ設定する。
   *  intro が「これから起きること」なのに対し、outro は「起きたことの答え合わせ」。 */
  readonly outro?: string;
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
  //
  // 向きは pickRocketDirection() が決める。ここは「行だけを 2 本」なので必ず 'v'（たて向き）。
  // intro の文言はその条件（行だけ → たて）と結果（矢印の列を消す）を両方書く。
  // ピースを「たてに置く」ことと「たて向き ROCKET」は別の話なので、hint では
  // 置き方ではなく「2 行が同時にそろう」という結果だけを言う。
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
        'ラインを 2本 同時に 消すと ROCKET が 生まれます。\n' +
        '\n' +
        '消したのが 横のライン（行）だけの ときは、\n' +
        'ROCKET は たて向き（↑↓）に なります。\n' +
        'たて向きの ROCKET は、起爆すると その列を まとめて 消します。\n' +
        '\n' +
        'ROCKET は 生まれた 瞬間には 起爆せず、その場に 残ります。\n' +
        'ROCKET が 入っている ラインを そろえると、巻きこまれて 起爆します。\n' +
        '\n' +
        '盤面の 上の 帯に「起爆」と 出たら、その置き方で 特殊が 起爆します。',
      outro:
        'いま 起きたこと\n' +
        '\n' +
        'wave 1  行が そろって 消え、ROCKET が 巻きこまれた\n' +
        'wave 2  ROCKET が たてに 飛び、その列が 消えた\n' +
        '\n' +
        '解決が 何波 続いたか、それが CHAIN です。だから CHAIN 2。\n' +
        '起爆した 特殊が 1個だけでも CHAIN は 起きます。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 6, col: 7, text: 'この1手で 下の 2行が 同時に そろいます' },
        { move: 1, pieceIndex: 1, row: 6, col: 0, text: 'ROCKET と 同じ行を うめていきます' },
        { move: 2, pieceIndex: 2, row: 6, col: 4, text: '行が そろうと ROCKET が たてに 飛びます' },
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
  // Stage 5 の裏返し。行と列を 1 本ずつ同時に消すので pickRocketDirection() は
  // 行/列が混在した経路へ入り、8x8 では生成セルの行も列も 8 マス埋まっている（＝同数）ため
  // 必ず 'h'（よこ向き）になる。Stage 5 と並べて「消したラインで向きが決まる」を見せる。
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
        'ROCKET の 向きは、消した ラインで 決まります。\n' +
        '\n' +
        '横のライン（行）だけ 2本 → たて向き（↑↓）… Stage 5\n' +
        '行と 列を 1本ずつ 同時に → よこ向き（←→）… ここ\n' +
        '\n' +
        'よこ向きの ROCKET は、起爆すると その行を まとめて 消します。\n' +
        '\n' +
        '起爆の させかたは どちらも 同じです。\n' +
        'ROCKET が 入った ラインを そろえれば 巻きこまれます。\n' +
        '変わるのは「そのあと どこが 消えるか」だけです。',
      outro:
        'たて向きは 列を、よこ向きは 行を 消しました。\n' +
        '\n' +
        '矢印の 向きへ 1本ぶん 効果が 届きます。\n' +
        'だから「どの向きで 作るか」で、届く 相手が 変わります。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 7, col: 0, text: '行と 列が 同時に そろいます' },
        { move: 1, pieceIndex: 1, row: 7, col: 4, text: '起爆したとき 消える 行に 的を 置きます' },
        { move: 2, pieceIndex: 2, row: 0, col: 0, text: 'ROCKET の 列を うめはじめます' },
        { move: 3, pieceIndex: 0, row: 4, col: 0, text: '列が そろうと ROCKET が よこに 飛びます' },
      ],
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
        'BOMB は 巻きこまれると まわりの 3x3 を 消します。\n' +
        '\n' +
        '起爆の させかたは ROCKET と 同じです。\n' +
        'BOMB が 入った ラインを そろえれば 巻きこまれます。',
      outro:
        'ここまでの CHAIN 2 は、どれも 起爆した 特殊が 1個だけでした。\n' +
        '\n' +
        '次は 特殊が 2個 いっしょに 起爆します。それが COMBO です。',
      // 人間プレイ評価でここだけ初手 8 手を使い切って失敗した（preview 候補も最多）。
      // 着地点は光らせず（showCell: false）、「いまの目的」だけを 1 行で出す。
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 7, col: 4, showCell: false, text: '赤の まとまりを ライン消去に つなげよう' },
        { move: 1, pieceIndex: 1, row: 7, col: 0, showCell: false, text: 'BOMBの ある 行を うめていこう' },
        { move: 2, pieceIndex: 2, row: 7, col: 5, showCell: false, text: '行が そろうと BOMBが 起爆する' },
      ],
    },
  },

  // --------------------------------------------------------------- Stage 10
  // COMBO **だけ**を教える。CHAIN と同時に達成させると両者の区別がつかないので、
  // CHAIN の objective は置かず、wave も 2 で終わらせる（3 個目の ROCKET を盤面から外した）。
  //   wave1 行 7 が消えて ROCKET(7,3) が巻きこまれる … 起爆した特殊はまだ 1 個
  //   wave2 その ROCKET の射線(列 3)が BOMB(3,3) へ届き、2 個がいっしょに起爆 = COMBO
  // Stage 5 と同じ CHAIN 2 でありながら、こちらだけ COMBO になる。これが比較の土台。
  {
    id: 10,
    name: 'ROCKET + BOMB の COMBO',
    seed: 1010,
    moves: 8,
    initialBoard: [
      '........',
      '........',
      '..R.R...',
      '..R*R...',
      '..R.R...',
      '........',
      '........',
      'RB.^YGPB',
    ],
    fixedSets: [[p('dot', 'green'), p('dot', 'purple'), p('dot', 'red')]],
    objectives: [
      { kind: 'combo', target: 1, effect: 'rocket+bomb', label: 'ROCKET と BOMB を いっしょに起爆（COMBO）' },
    ],
    tutorial: {
      intro:
        'CHAIN と COMBO は 別の ものです。\n' +
        '\n' +
        'CHAIN … 消去や 起爆が 何波 続いたか\n' +
        'COMBO … 1回の 起爆の 波で、特殊が 2個以上 いっしょに 起爆すること\n' +
        '\n' +
        'Stage 5 も CHAIN 2 でしたが、起爆した 特殊は 1個。\n' +
        'あれは COMBO では ありません。\n' +
        '\n' +
        '特殊の 効果が 別の 特殊へ 届くと、その2つは いっしょに 起爆します。\n' +
        'これが COMBO です。\n' +
        '\n' +
        'ドラッグ中に 出る 予告で、どこへ 届くかを 確かめられます。',
      outro:
        'いま 起きたこと\n' +
        '\n' +
        'wave 1  行が 消えて ROCKET が 巻きこまれた（起爆した 特殊は 1個）\n' +
        'wave 2  ROCKET の 射線が BOMB へ 届き、2個が いっしょに 起爆した\n' +
        '\n' +
        'CHAIN は 2。COMBO は 1回。\n' +
        '\n' +
        'Stage 5 も CHAIN 2 でしたが、特殊は 1個なので COMBO なし。\n' +
        'ここは 特殊が 2個 いっしょに 起爆したので COMBO あり。\n' +
        'CHAIN の 数と COMBO の 有無は 別に 数えます。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 7, col: 2, text: 'この行が そろうと ROCKET が 巻きこまれます' },
      ],
    },
  },

  // --------------------------------------------------------------- Stage 11
  // 「特殊を すぐ 起爆させずに 残す」ことだけを教えるガイド付き教材。
  // Stage 5・8・9 は「特殊は作ったら起爆させるもの」を 3 回続けて教えるので、
  // その逆の判断（残す）はここで明示的に教えないと Stage 12 で突然要求することになる。
  //
  //   ねらいの手順: 行 6・7 を同時に消して たて ROCKET を作る（列 3 に向く）
  //                 → BOMB(3,3) を残したまま 行 6 をそろえる
  //                 → ROCKET の射線が BOMB へ届いて COMBO
  //
  // **1 手で 詰みへ入らないこと**を盤面側で保証する:
  //   - 行 3 の空きは (3,5) と (3,7) の 2 マスで、間の (3,6) が埋まっている。
  //     連続していないので、どのピースを 1 個置いても行 3 は完成しない
  //     （＝1 手で BOMB を単独起爆させられない）。
  //   - 列 3 の空きは 7 マス。1 手（最大 4 セル）では完成しない。
  //   - ROCKET を作る手段（v2）を 2 セット目にも入れ、手数を 8 にしてある。
  //     1 手目を無駄にしても、行 6 を作り直して v2 → 行 6 完成、まで届く。
  {
    id: 11,
    name: '特殊を 残して COMBO を 作る',
    seed: 1011,
    moves: 8,
    initialBoard: [
      '........',
      '........',
      '........',
      'RBY*G.R.',
      '........',
      '........',
      'RBY.GPRB',
      'BYG.PRBY',
    ],
    fixedSets: [
      [p('v2', 'blue'), p('h3', 'yellow'), p('h4', 'purple')],
      // 立て直し用。1 セット目と同じ 3 種類なので、v2 を無駄にしても作り直せる。
      [p('v2', 'red'), p('h3', 'green'), p('h4', 'blue')],
    ],
    objectives: [{ kind: 'combo', target: 1, label: 'BOMBを残して 特殊2個を いっしょに起爆' }],
    tutorial: {
      intro:
        'BOMBを 今は 消さずに 残そう。\n' +
        'あとで ROCKETと いっしょに 起爆すると COMBOに なるよ。\n' +
        '\n' +
        'COMBO＝特殊が 2個以上 いっしょに 起爆すること。\n' +
        'BOMBを 先に 1個だけ 消してしまうと、相手が 居なくなる。',
      outro:
        'BOMB を 残して おいたので、ROCKET の 射線が 届き、\n' +
        '2個が いっしょに 起爆しました。これが COMBO です。\n' +
        '\n' +
        '先に BOMB だけを 消していたら、相手が 居ません。\n' +
        'その場合 CHAIN は 起きても COMBO には なりません。',
      showGuide: true,
      hints: [
        { move: 0, pieceIndex: 0, row: 6, col: 3, text: 'BOMBは 残す。下の 2行を 同時に そろえよう' },
        { move: 1, pieceIndex: 1, row: 6, col: 0, text: 'BOMBは そのまま。ROCKETの 行を うめよう' },
        { move: 2, pieceIndex: 2, row: 6, col: 4, text: 'ROCKETの 矢印を BOMBへ 届かせよう' },
      ],
    },
  },

  // --------------------------------------------------------------- Stage 12
  // 転移確認。案内なしで、Stage 11 の考え方（特殊を残す・向きを予測する）を
  // 別の盤面へ移せるかを見る。**わなは置かない。**
  //   ねらいの手順: 行 0・1 を同時に消して たて ROCKET を作る（列 3 に向く、下向きに届く）
  //                 → BOMB(5,3) を残したまま 行 0 をそろえる → COMBO
  //
  // 1 手で詰みへ入らないこと:
  //   - 行 0 / 行 1 の空きは各 1 マス（col 3）。ここへ入る 1 セルのピースは
  //     1 セット目にも 2 セット目にも無く、v2 を (0,3) へ置く以外に行は完成しない。
  //     v2 を (1,3) へ置いて行 1 だけ消してしまっても、h3 + h4 で行 1 を作り直し、
  //     2 セット目の v2 で同じ形に戻せる（最悪 6 手。moves は 7）。
  //   - 行 5（BOMB の行）の空きは 7 マス、列 3 の空きは 6 マス。1 手では完成しない。
  {
    id: 12,
    name: 'COMBO を 自分で 作る',
    seed: 1012,
    moves: 7,
    initialBoard: [
      'RBY.GPRB',
      'BYG.PRBY',
      '........',
      '........',
      '........',
      '...*....',
      '........',
      '........',
    ],
    fixedSets: [
      [p('v2', 'blue'), p('h3', 'yellow'), p('h4', 'purple')],
      [p('v2', 'red'), p('h3', 'green'), p('h4', 'blue')],
    ],
    objectives: [{ kind: 'combo', target: 1, label: '特殊2個を いっしょに起爆（COMBO）' }],
    // 答えは書かない。文字ヒントも intro も出さない。予告は既存仕様のまま。
    tutorial: { showGuide: false },
  },
];

export function stageById(id: number): StageDef {
  const s = STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown stage id: ${id}`);
  return s;
}

export const FIRST_STAGE = STAGES[0]!.id;
export const LAST_STAGE = STAGES[STAGES.length - 1]!.id;
