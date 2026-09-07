# Project BLAST BLOCK — Phase 1 Gray Box

**目的はアートではなく、コアルールが面白いかをスマートフォンで検証すること。**

「ブロック配置 × LINE CLEAR × COLOR BLAST × 特殊ピース連鎖」だけを、
グレーボックス表示で最短に確かめるための実装です。

> **独立した新規プロジェクト**です。他プロジェクトのコードもアセットも使っていません。
> Phase 1 は `okashi-no-kuni.github.io` リポジトリの `blast-block/` で作られ、
> そのあとこのリポジトリへ履歴ごと移送されました。

## 動かす

```bash
npm install
npm run dev        # http://localhost:5173/
npm run verify     # typecheck + unit test + build
npm run smoke      # dev/preview サーバへ Playwright で実操作テスト
```

`npm run smoke` は起動中のサーバへ接続します（既定 `http://localhost:5183/`。
第1引数で URL を渡せます）。

## 構造

**コアロジックは描画から完全に切り離してあります。** `src/game/` は Phaser も DOM も
import しません。だから resolution はブラウザ無しでテストできます。

```
src/
  game/          コアロジック（純 TypeScript・描画非依存）
    types.ts         セル / ピース / resolution の型
    Board.ts         8x8 盤面。配置判定、完成ライン探索
    Piece.ts         ピース生成と配置
    PieceGenerator.ts seed 付き生成、Safe / Risky / Dead 評価
    Rng.ts           mulberry32（同じ seed なら同じ候補列）
    ColorBlast.ts    完成ライン起点の同色連結成分探索（上下左右のみ）
    Specials.ts      特殊の生成位置 / 向き / 起爆効果 / 特殊 x 特殊
    Resolver.ts      wave ループ。LINE CLEAR → COLOR BLAST → 起爆 → CHAIN
    Score.ts         セル単位の倍率と CHAIN 倍率
    StageState.ts    盤面 + トレイ + 手数 + 目的の達成度
  data/          データ駆動（将来数千ステージへ増やすのはここだけ）
    balance.ts       閾値・倍率・条件。**数値をロジックへ散在させない**
    pieces.ts        ピース形状（セル相対座標）。回転違いは別 shape
    stages.ts        Stage 1〜10 の目的 / seed / 固定 piece 列 / 初期盤面 / 文言
  scenes/
    GameScene.ts     Gray Box 表示とドラッグ＆ドロップ
  ui/
    Hud.ts           Stage / Objective / Moves / Score / Chain
    PieceTray.ts     候補ピース置き場の寸法と当たり判定
    TutorialOverlay.ts 推奨配置と intro（文言はステージデータ側）
    DebugPanel.ts    seed / chain / last resolution / Safe-Risky-Dead など
    layout.ts        盤面とトレイの寸法計算
    colors.ts        Gray Box の識別色
  main.ts        DOM UI と Phaser シーンの接続だけ（ルールは 1 行も書かない）
tests/           vitest（コアロジックのみ。ブラウザ不要）
tools/smoke.mjs  Playwright での実機サイズ確認と通しプレイ
```

## resolution の構造（ここが核）

1 回の配置につき、以下を安定するまで繰り返します。1 周が CHAIN 1 回です。

1. 完成ライン（行・列）を**確定**する。**探索中にセルを消さない**
2. 完成ライン上の通常セルを起点に COLOR BLAST を探索する（上下左右のみ）
3. 前の wave で消去に巻きこまれた特殊ピースを起爆する
4. 特殊ピースの生成位置を決める（**生成セルは消さずに残す**）
5. まとめて消去し、消去に巻きこまれた特殊を次の wave へ送る

特殊が別の特殊を巻きこむ限り wave が続きます。同じ特殊が同一 resolution 内で
二重起爆しないよう `uid` で管理し、`BALANCE.resolution.maxWaves` で無限ループを止めます。

## Phase 1 で暫定的に決めたこと

仕様書で明示されていなかったため、**実装を壊さない最小の暫定値**を置いた箇所です。
Phase 2 で見直す前提。

| # | 決めたこと | 理由 |
|---|---|---|
| 1 | **CHAIN の単位 = 消去 1 波**。CHAIN 2 以降は「特殊の起爆」で進む | このゲームには重力が無く、消去でセルが増えないため、配置以外の要因で新しい完成ラインは発生しない。実装は毎 wave でライン探索をしているので、将来重力を入れれば仕様書の例（Rocket → 新規 LINE CLEAR）もそのまま動く |
| 2 | 特殊生成は **1 wave につき最大 1 個**、優先順位 Rainbow > Bomb > Rocket | 「2 ライン同時 + 9 セル BLAST」のように条件が重なったときの挙動が未定義だったため |
| 3 | Rocket の向き：完成ラインが行だけ→縦 / 列だけ→横 / 混在→生成セルの行列で埋まっている方向 | 仕様書で「暫定でよい」と指定。`pickRocketDirection()` 1 か所に閉じてある |
| 4 | 特殊 x 特殊 の combo 条件 = **同じ wave で起爆する特殊のうち、盤面上で上下左右に隣接しているもの** | 「相互に影響した場合」の定義が未定だったため。隣接していない特殊は同じ wave でも別々に起爆する |
| 5 | Rainbow の対象色 = combo 相手の色 → 自分の色 → 今回置いた piece の色 → 盤面最多色 → COLORS 先頭 | 「resolution event から決定可能」を満たしつつ決定論にするため |
| 6 | スコアのセル倍率は **1 セルにつき 1 つだけ**（special 1.5 > blast 1.25 > line 1.0） | 倍率の積算方法が未定義だったため。CHAIN 倍率だけが上から掛かる |
| 7 | `deadRetries = 64` | 24 では「空きが 1 マスだけ」の盤面で Dead セットを配ることが実測であった。避けるのは Dead のみで Risky は出すので、救済にはならない |
| 8 | 1 ピース内の通常セルは**完全に同一色**（例外なし） | 仕様書の「原則として同一色」を最小実装した |

## 既知の問題 / Phase 2 への申し送り

- **COLOR BLAST が起きやすい。** ピースが単色で `colorBlast.minSize = 4` なので、
  4 セル以上のピース（h4 / v4 / o4 / T / S / Z / 大L）でラインを完成させると、
  そのピース自身が 4 連結になり**ほぼ必ず** COLOR BLAST が発生する。
  面白さの検証で「BLAST が特別に感じられない」なら、`minSize` を 5 にするか、
  1 ピース内に副色を混ぜるかの判断が要る。
- 重力が無いため、**CHAIN は特殊の起爆でしか伸びない**（上記 #1）。
  仕様書の CHAIN の例をそのまま成立させたいなら、重力の有無自体が設計判断になる。
- Rainbow が盤面に残ったまま対象色が 1 つも無くなると、起爆しても自分のマスしか消えない。
- 演出は最低限（ライン強調・縮小フェード・起爆範囲のフラッシュ・CHAIN 文字）。
  Rocket / Bomb の方向や範囲は「範囲を塗る」だけで、飛翔体などは無い。
- Stage 4〜10 の想定解は固定 piece 列の中で完結する。固定列を使い切った後は
  seed 乱数になるため、別解を試すと候補が変わる。

## 検証

```bash
npm run test    # コアロジック 70 ケース（ブラウザ不要）
npm run smoke   # 320/375/393/430 px での表示 + 実ドラッグでの Stage 1〜10 通しプレイ
```

`tests/stages.test.ts` は Stage 1〜10 の**想定解**を持っていて、
目的が実際に達成できることを毎回確かめます。ここが落ちたら、
ステージデータかコアルールのどちらかが壊れています。
