/**
 * スマホ縦画面での表示・操作の確認（Phase 1）。
 *
 *   node tools/smoke.mjs [url]        # 既定 http://localhost:5183/
 *
 * 見るのは 6 つ。
 *   ① console error / pageerror が 0 件
 *   ② 320〜430px 幅で縦横にはみ出さない
 *   ③ 盤面とトレイが画面内に収まる
 *   ④ 実際にドラッグして配置できる（マウスとタッチの両方）
 *   ⑤ Stage 1〜12 を順に読み込める
 *   ⑥ debug 表示を ON / OFF できる
 *   ⑦ objective が省略されず、ゲーム領域と縦にも重ならない（Stage 1〜12 x 4 幅）
 */
import { existsSync } from 'fs';
import { mkdirSync } from 'fs';

const LOCAL_MOD = '/opt/node22/lib/node_modules/playwright/index.mjs';
const LOCAL_BIN = '/opt/pw-browsers/chromium';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || (existsSync(LOCAL_MOD) ? LOCAL_MOD : 'playwright'));
const launch = (o = {}) => chromium.launch(existsSync(LOCAL_BIN) ? { ...o, executablePath: LOCAL_BIN } : o);

const URL = process.argv[2] || 'http://localhost:5183/';
const ng = [];
const note = [];
const browser = await launch();

const SIZES = [
  [320, 568],
  [375, 667],
  [393, 852],
  [430, 932],
];

for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__blast, null, { timeout: 10000 });
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    const r = canvas.getBoundingClientRect();
    const ctrl = document.getElementById('controls').getBoundingClientRect();
    return {
      overflowY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      overflowX: Math.round(document.documentElement.scrollWidth - window.innerWidth),
      canvas: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) },
      gapBottom: Math.round(window.innerHeight - ctrl.bottom),
      state: window.__blast.state(),
    };
  });

  if (errs.length) ng.push(`${w}x${h}: エラー ${errs.length} 件 — ${errs[0]}`);
  if (m.overflowY > 2) ng.push(`${w}x${h}: 縦に ${m.overflowY}px はみ出す`);
  if (m.overflowX > 2) ng.push(`${w}x${h}: 横に ${m.overflowX}px はみ出す`);
  if (m.canvas.top < 0) ng.push(`${w}x${h}: 盤面の上が ${-m.canvas.top}px 切れている`);
  if (m.canvas.bottom > h) ng.push(`${w}x${h}: 盤面の下が ${m.canvas.bottom - h}px はみ出す`);
  if (m.canvas.w < 180) ng.push(`${w}x${h}: 盤面が ${m.canvas.w}px しかない`);
  if (m.gapBottom < 4) ng.push(`${w}x${h}: 操作ボタンの下に余白がない`);
  note.push(`  ${w}x${h}: canvas ${m.canvas.w}x${m.canvas.h} / 下の余白 ${m.gapBottom}px / stage ${m.state.stage}`);

  // ⑦ objective の収まり。横（省略）と縦（ゲーム領域との重なり）の両方を見る。
  //
  //   横: .obj .lbl は nowrap + text-overflow: ellipsis なので、はみ出すと無言で「…」になる。
  //   縦: canvas の寸法は #stage-wrap の実寸から決まるが、#stage-wrap の高さは
  //       目的の本数とヒント行の折り返しで変わる。作り直さないと canvas がはみ出し、
  //       overflow: visible + align-items: center なので objective 行の上へ重なる。
  //       #stage-wrap は DOM 順で #hud より後ろなので、重なった canvas が上に描かれる。
  let objChecked = 0;
  const ngBefore = ng.length;
  for (let id = 1; id <= 12; id++) {
    await page.evaluate((n) => window.__blast.goStage(n), id);
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const ov = document.querySelector('#overlay');
      if (ov.classList.contains('on')) ov.querySelector('button')?.click();
    });
    await page.waitForTimeout(150);

    const f = await page.evaluate(() => {
      const overlapY = (a, b) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const wrap = document.querySelector('#stage-wrap').getBoundingClientRect();
      const canvas = document.querySelector('#game canvas').getBoundingClientRect();
      const ctrl = document.getElementById('controls').getBoundingClientRect();
      const rows = [...document.querySelectorAll('#objectives .obj')].map((el) => {
        const lbl = el.querySelector('.lbl');
        const r = el.getBoundingClientRect();
        return {
          text: lbl.textContent,
          lblClientWidth: lbl.clientWidth,
          lblScrollWidth: lbl.scrollWidth,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          bottom: r.bottom,
          overlapWrap: +overlapY(r, wrap).toFixed(2),
          overlapCanvas: +overlapY(r, canvas).toFixed(2),
        };
      });
      return {
        rows,
        wrapTop: wrap.top,
        canvasW: Math.round(canvas.width),
        canvasInWrap: canvas.top >= wrap.top - 0.5 && canvas.bottom <= wrap.bottom + 0.5,
        hintOverlapCanvas: +overlapY(document.getElementById('hint').getBoundingClientRect(), canvas).toFixed(2),
        gapBottom: Math.round(window.innerHeight - ctrl.bottom),
        overflowY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
        overflowX: Math.round(document.documentElement.scrollWidth - window.innerWidth),
      };
    });

    for (const r of f.rows) {
      objChecked++;
      if (r.lblScrollWidth > r.lblClientWidth)
        ng.push(`${w}x${h}: Stage ${id} の objective が横に省略「${r.text}」 ${r.lblScrollWidth} > ${r.lblClientWidth}px`);
      if (r.scrollHeight > r.clientHeight)
        ng.push(`${w}x${h}: Stage ${id} の objective が縦にクリップ「${r.text}」 ${r.scrollHeight} > ${r.clientHeight}px`);
      if (r.bottom > f.wrapTop + 0.5)
        ng.push(`${w}x${h}: Stage ${id} の objective 下端がゲーム領域上端を越えた ${r.bottom.toFixed(2)} > ${f.wrapTop.toFixed(2)}`);
      if (r.overlapWrap > 0 || r.overlapCanvas > 0)
        ng.push(`${w}x${h}: Stage ${id} の objective がゲーム領域と縦に ${Math.max(r.overlapWrap, r.overlapCanvas)}px 重なる「${r.text}」`);
    }
    if (!f.canvasInWrap) ng.push(`${w}x${h}: Stage ${id} の canvas が #stage-wrap からはみ出している`);
    if (f.hintOverlapCanvas > 0) ng.push(`${w}x${h}: Stage ${id} のヒント行が canvas と ${f.hintOverlapCanvas}px 重なる`);
    if (f.canvasW < 180) ng.push(`${w}x${h}: Stage ${id} の盤面が ${f.canvasW}px しかない`);
    if (f.gapBottom < 4) ng.push(`${w}x${h}: Stage ${id} で操作ボタンの下に余白がない`);
    if (f.overflowY > 2) ng.push(`${w}x${h}: Stage ${id} で縦に ${f.overflowY}px はみ出す`);
    if (f.overflowX > 2) ng.push(`${w}x${h}: Stage ${id} で横に ${f.overflowX}px はみ出す`);
    if ([10, 11, 12].includes(id))
      for (const r of f.rows)
        note.push(`  ${w}x${h}: Stage ${id} objective「${r.text}」 scrollWidth ${r.lblScrollWidth} <= clientWidth ${r.lblClientWidth} / ゲーム領域との縦交差 ${r.overlapCanvas}px`);
  }
  note.push(
    ng.length === ngBefore
      ? `  ${w}x${h}: Stage 1〜12 の objective ${objChecked} 行すべてが省略なし・ゲーム領域と縦交差 0`
      : `  ${w}x${h}: objective ${objChecked} 行を検査し、${ng.length - ngBefore} 件の問題を検出`,
  );

  await ctx.close();
}

/* ---------------------------------------------- 実際に触って確認（393x852） */
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__blast, null, { timeout: 10000 });
await page.waitForTimeout(400);

/** 盤面座標（row, col）→ 画面座標 */
async function geom() {
  return page.evaluate(() => {
    const r = document.querySelector('#game canvas').getBoundingClientRect();
    const l = window.__blast.state().layout;
    const k = r.width / l.width; // デバイスピクセル → CSS ピクセル
    return { left: r.left, top: r.top, k, l };
  });
}

/** 任意の page でトレイ i を (row,col) へドラッグする（⑧ の別ページ用）。 */
async function dragOn(p, i, row, col) {
  const g = await p.evaluate(() => {
    const r = document.querySelector('#game canvas').getBoundingClientRect();
    const l = window.__blast.state().layout;
    return { left: r.left, top: r.top, k: r.width / l.width, l };
  });
  const dims = await p.evaluate((idx) => {
    const s = window.__blast.scene.stageState.tray[idx];
    return { w: s.shape.width, h: s.shape.height };
  }, i);
  const trayCx = g.left + ((i + 0.5) * (g.l.width / 3)) * g.k;
  const trayCy = g.top + (g.l.trayY + g.l.trayH / 2) * g.k;
  const x = g.left + (g.l.boardX + col * g.l.cell + (dims.w * g.l.cell) / 2) * g.k;
  const y = g.top + (g.l.boardY + row * g.l.cell + (dims.h * g.l.cell) / 2 + g.l.cell * 1.15) * g.k;
  await p.mouse.move(trayCx, trayCy);
  await p.mouse.down();
  await p.mouse.move((trayCx + x) / 2, (trayCy + y) / 2, { steps: 6 });
  await p.mouse.move(x, y, { steps: 6 });
  await p.mouse.up();
}

/** トレイ i のピースを (row,col) へドラッグする。ドラッグ中の持ち上げ量も合わせる。 */
async function drag(i, row, col, useTouch) {
  const g = await geom();
  const slotW = g.l.width / 3;
  const trayCx = g.left + ((i + 0.5) * slotW) * g.k;
  const trayCy = g.top + (g.l.trayY + g.l.trayH / 2) * g.k;
  const piece = await page.evaluate((idx) => {
    const t = window.__blast.state().tray[idx];
    return t ? { shape: t.shape } : null;
  }, i);
  if (!piece) throw new Error(`tray ${i} is empty`);
  const dims = await page.evaluate((idx) => {
    const s = window.__blast.scene.stageState.tray[idx];
    return { w: s.shape.width, h: s.shape.height };
  }, i);
  // シーンが使う式の逆算： originX = x - w*cell/2 → x = boardX + col*cell + w*cell/2
  const x = g.left + (g.l.boardX + col * g.l.cell + (dims.w * g.l.cell) / 2) * g.k;
  const y = g.top + (g.l.boardY + row * g.l.cell + (dims.h * g.l.cell) / 2 + g.l.cell * 1.15) * g.k;

  if (useTouch) {
    // touchscreen.tap ではドラッグできないので CDP 経由で touch イベントを送る
    const client = await page.context().newCDPSession(page);
    const pt = (type, px, py) =>
      client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }],
      });
    await pt('touchStart', trayCx, trayCy);
    await pt('touchMove', (trayCx + x) / 2, (trayCy + y) / 2);
    await pt('touchMove', x, y);
    await pt('touchEnd', x, y);
    await client.detach();
  } else {
    await page.mouse.move(trayCx, trayCy);
    await page.mouse.down();
    await page.mouse.move((trayCx + x) / 2, (trayCy + y) / 2, { steps: 6 });
    await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.up();
  }
  await page.waitForTimeout(900);
}

// ④-a マウスで Stage 1 をクリアする
await page.evaluate(() => window.__blast.goStage(1));
await page.waitForTimeout(300);
// intro カードが出ていたら閉じる
await page.evaluate(() => {
  const b = document.querySelector('#overlayCard button');
  if (b) b.click();
});
await drag(0, 7, 7, false);
let st = await page.evaluate(() => window.__blast.state());
if (st.status !== 'cleared') ng.push(`マス操作(マウス)で Stage 1 がクリアできない: status=${st.status}`);
else note.push(`  マウス操作: Stage 1 クリア（score ${st.score}）`);

// ④-b タッチで Stage 1 をクリアする
await page.evaluate(() => window.__blast.goStage(1));
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
await drag(0, 7, 7, true);
st = await page.evaluate(() => window.__blast.state());
if (st.status !== 'cleared') ng.push(`タッチ操作で Stage 1 がクリアできない: status=${st.status}`);
else note.push(`  タッチ操作: Stage 1 クリア（score ${st.score}）`);

// 置けない場所へのドラッグは配置されない
await page.evaluate(() => window.__blast.goStage(2));
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
const before = await page.evaluate(() => window.__blast.state().board.join(''));
await drag(0, 7, 0, false); // すでに埋まっているマス
const after = await page.evaluate(() => window.__blast.state().board.join(''));
if (before !== after) ng.push('occupied セルへドラッグしたのに配置されてしまった');
else note.push('  配置不可の位置へ落としても盤面が変わらない');

// ⑤ Stage 1〜12 を順に読み込む
for (let id = 1; id <= 12; id++) {
  await page.evaluate((n) => window.__blast.goStage(n), id);
  await page.waitForTimeout(160);
  const s = await page.evaluate(() => window.__blast.state());
  if (s.stage !== id) ng.push(`Stage ${id} を読み込めない`);
  if (s.status !== 'playing') ng.push(`Stage ${id} が開始直後に ${s.status} になっている`);
  if (s.objectives.length === 0) ng.push(`Stage ${id} に objective がない`);
}
note.push('  Stage 1〜12 をすべて読み込めた');

// ⑥ debug の ON/OFF
const dbgOn = await page.evaluate(() => {
  document.getElementById('btnDebug').click();
  return document.getElementById('debug').classList.contains('on');
});
const dbgOff = await page.evaluate(() => {
  document.getElementById('btnDebug').click();
  return document.getElementById('debug').classList.contains('on');
});
if (!dbgOn || dbgOff) ng.push('debug 表示を ON/OFF できない');
else note.push('  debug 表示を ON/OFF できた');

/* ------------------------------- Stage 1〜12 を実際にドラッグして通しプレイ ---- */
const SOLUTIONS = {
  1: [[0, 7, 7]],
  2: [[0, 7, 7], [1, 6, 0]],
  3: [[0, 7, 0], [1, 7, 7]],
  4: [[0, 7, 0], [1, 5, 3], [2, 3, 5]],
  5: [[0, 6, 7], [1, 6, 0], [2, 6, 4]],
  6: [[0, 7, 0]],
  7: [[0, 7, 0], [1, 5, 0]],
  8: [[0, 7, 0], [1, 7, 4], [2, 0, 0], [0, 4, 0]],
  9: [[0, 7, 4], [1, 7, 0], [2, 7, 5]],
  10: [[0, 7, 2]],
  11: [[0, 6, 3], [1, 6, 0], [2, 6, 4]],
  12: [[0, 0, 3], [1, 0, 0], [2, 0, 4]],
};

/** 教材の一時停止（タップ待ち）を見つけたら 1 回タップして進める。 */
let teachHeldAt = [];
async function waitIdle() {
  await page.waitForFunction(
    () => { const s = window.__blast.state(); return !s.busy || s.awaitingTeach; },
    null,
    { timeout: 8000 },
  );
  if (await page.evaluate(() => window.__blast.state().awaitingTeach)) {
    teachHeldAt.push(await page.evaluate(() => window.__blast.state().stage));
    const box = await page.evaluate(() => {
      const r = document.querySelector('#game canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(80);
    await page.waitForFunction(() => !window.__blast.state().busy, null, { timeout: 8000 });
  }
}

async function closeCard() {
  await page.evaluate(() => {
    const b = document.querySelector('#overlayCard button');
    if (b) b.click();
  });
  await page.waitForTimeout(80);
}

const played = [];
teachHeldAt = [];
for (let id = 1; id <= 12; id++) {
  await page.evaluate((n) => window.__blast.goStage(n), id);
  await page.waitForTimeout(200);
  await closeCard();
  const acc = { maxChain: 0, simultaneous: 0, blast: 0, created: [], detonated: [], lines: 0, aborted: false, effects: [], waveScores: [] };
  for (const [t, r, c] of SOLUTIONS[id]) {
    await drag(t, r, c, false);
    await waitIdle();
    const last = await page.evaluate(() => window.__blast.last());
    if (last) {
      acc.maxChain = Math.max(acc.maxChain, last.maxChain);
      acc.simultaneous = Math.max(acc.simultaneous, last.simultaneous);
      acc.blast = Math.max(acc.blast, ...(last.blastSizes.length ? last.blastSizes : [0]));
      acc.created.push(...last.created);
      acc.detonated.push(...last.detonated);
      acc.lines += last.lines;
      acc.effects.push(...last.effects);
      if (last.waveScores.length > acc.waveScores.length) acc.waveScores = last.waveScores;
      acc.aborted = acc.aborted || last.aborted;
    }
  }
  const s = await page.evaluate(() => window.__blast.state());
  if (s.status !== 'cleared') ng.push(`Stage ${id}: 実操作でクリアできない（status=${s.status}）`);
  if (acc.aborted) ng.push(`Stage ${id}: resolution が打ち切られた`);
  played.push(
    `  Stage ${id}: ${s.status} score=${s.score} lines=${acc.lines} maxChain=${acc.maxChain} ` +
      `blast=${acc.blast} created=[${acc.created}] detonated=[${acc.detonated}] ` +
      `effects=[${acc.effects}] waveScores=[${acc.waveScores}]`,
  );

  // 意図したルールが起きたかを個別に確認する
  if (id === 5 && acc.simultaneous < 2) ng.push('Stage 5: 2ライン同時完成が起きていない');
  if (id === 5 && !(acc.created.includes('rocket') && acc.detonated.includes('rocket')))
    ng.push('Stage 5: Rocket の生成 or 起爆が同じステージ内で起きていない');
  if (id === 6 && acc.blast < 5) ng.push('Stage 6: 5セル以上の COLOR BLAST が起きていない');
  if (id === 6 && acc.created.length) ng.push('Stage 6: COLOR BLAST 教材なのに特殊が生まれている');
  if (id === 8 && !(acc.created.includes('rocket') && acc.detonated.includes('rocket')))
    ng.push('Stage 8: Rocket の生成 or 起爆が起きていない');
  if (id === 9 && !(acc.blast >= 11 && acc.detonated.includes('bomb')))
    ng.push('Stage 9: 11セル COLOR BLAST or Bomb 起爆が起きていない');
  // Stage 10 は COMBO だけを教える教材にしたので、CHAIN は 2 で止まるのが正しい。
  if (id === 10 && acc.maxChain !== 2) ng.push(`Stage 10: CHAIN が 2 で止まっていない (${acc.maxChain})`);
  if (id === 10 && !acc.effects.includes('rocket+bomb'))
    ng.push('Stage 10: 効果到達型 combo (rocket+bomb) が起きていない');
  if (id === 10 && !(acc.waveScores.length === 2 && acc.waveScores.every((v) => v > 0)))
    ng.push(`Stage 10: wave ごとのスコアが積み上がっていない (${acc.waveScores})`);
  if (id === 11 && !acc.effects.some((e) => e.includes('+')))
    ng.push('Stage 11: 特殊 x 特殊 の COMBO が起きていない');
  if (id === 11 && !acc.created.includes('rocket'))
    ng.push('Stage 11: BOMB を残したまま ROCKET を作る手順になっていない');
  if (id === 12 && !acc.effects.some((e) => e.includes('+')))
    ng.push('Stage 12: 特殊 x 特殊 の COMBO が起きていない');
  if (id === 12 && !acc.created.includes('rocket'))
    ng.push('Stage 12: ROCKET を作る手順になっていない');

  await closeCard();
}
note.push(...played);

// 盤面上の教材表示。読ませるために止まるのは教材ステージだけで、転移確認ステージでは止まらない。
const heldSet = [...new Set(teachHeldAt)].sort((a, b) => a - b);
for (const id of [5, 10]) if (!heldSet.includes(id)) ng.push(`Stage ${id}: 教材表示の一時停止が出ていない`);
for (const id of [1, 2, 3, 4, 6, 7, 8, 9, 11, 12]) {
  if (heldSet.includes(id)) ng.push(`Stage ${id}: 教材表示の一時停止が出てはいけない`);
}
note.push(`  盤面上の教材で一時停止したステージ: ${heldSet.join(', ') || 'なし'}（Stage 12 は含まれない）`);

// リトライできる
await page.evaluate(() => window.__blast.goStage(1));
await page.waitForTimeout(200);
await closeCard();
await drag(0, 7, 7, false);
await waitIdle();
await page.evaluate(() => document.getElementById('btnRetry').click());
await page.waitForTimeout(200);
const afterRetry = await page.evaluate(() => window.__blast.state());
if (afterRetry.status !== 'playing' || afterRetry.score !== 0)
  ng.push(`リトライで初期状態に戻らない（status=${afterRetry.status} score=${afterRetry.score}）`);
else note.push('  RETRY で初期状態へ戻る');

// スクリーンショット
mkdirSync('tools/out', { recursive: true });
await page.evaluate(() => window.__blast.goStage(10));
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
await page.screenshot({ path: 'tools/out/stage10.png' });
await page.evaluate(() => window.__blast.goStage(1));
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
await page.screenshot({ path: 'tools/out/stage01.png' });


/* ------------------------------ ⑧ 演出タイマーの世代管理（中断しても残らない） ----
 *
 * `GameScene.playResolution()` が積む TimerEvent は Scene の Clock に載るだけなので、
 * 演出の途中でステージが変わると古い callback が新しい StageState へ作用しうる。
 * ここは**実ブラウザで**その中断経路を踏み、残存タイマー 0 件・古い callback 実行 0 件・
 * 表示盤面と論理盤面の一致を確認する。
 */
{
  const tctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tctx.newPage();
  const terrs = [];
  tp.on('pageerror', (e) => terrs.push(String(e.message)));
  tp.on('console', (m) => { if (m.type() === 'error') terrs.push('console: ' + m.text()); });
  await tp.goto(URL, { waitUntil: 'networkidle' });
  await tp.waitForFunction(() => !!window.__blast, null, { timeout: 10000 });
  await tp.waitForTimeout(400);

  /** showLines / applyEvent / syncView の呼び出しを数える（ゲーム側は書き換えない）。 */
  const arm = () =>
    tp.evaluate(() => {
      const sc = window.__blast.scene;
      if (window.__t) { window.__t.calls.length = 0; return; }
      window.__t = { calls: [] };
      for (const n of ['showLines', 'applyEvent', 'syncView']) {
        const orig = sc[n].bind(sc);
        sc[n] = function (...a) { window.__t.calls.push(n); return orig(...a); };
      }
    });
  const probe = () =>
    tp.evaluate(() => {
      const sc = window.__blast.scene;
      const b = sc.stageState.board.toStrings().join('|');
      const v = sc.view.toStrings().join('|');
      return {
        calls: window.__t.calls.slice(),
        owned: sc.resolutionTimers.size,
        clockActive: sc.time._active.length + sc.time._pendingInsertion.length,
        boardEqualsView: b === v,
        stage: sc.stageState.def.id,
        busy: sc.busy, chainNow: sc.chainNow, fading: sc.fading.length, flashes: sc.flashes.length,
        teachHold: sc.teachHold !== null,
      };
    });
  const start = async (id) => {
    await tp.evaluate((n) => window.__blast.goStage(n), id);
    await tp.waitForTimeout(220);
    await tp.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
    await tp.waitForTimeout(80);
  };
  /** そのステージの想定解を、最後の 1 手を残して打つ。 */
  const playToLast = async (id) => {
    const mv = SOLUTIONS[id];
    for (let i = 0; i < mv.length - 1; i++) {
      await dragOn(tp, ...mv[i]);
      await tp.waitForTimeout(1300);
      await tp.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
    }
    return mv[mv.length - 1];
  };

  // (1) 正常な resolution では callback が予定どおりの回数だけ動く（CHAIN 2 ＝ 2 波）
  await start(9);
  const last9 = await playToLast(9);
  await arm();
  await dragOn(tp, ...last9);
  await tp.waitForTimeout(1800);
  const normal = await probe();
  const n = (x) => normal.calls.filter((c) => c === x).length;
  if (!(n('showLines') === 2 && n('applyEvent') === 2 && n('syncView') === 1))
    ng.push(`演出タイマー: 通常の CHAIN 2 で callback 回数が違う ${JSON.stringify(normal.calls)}`);
  else if (normal.owned !== 0)
    ng.push(`演出タイマー: 通常終了後に ${normal.owned} 件残っている`);
  else note.push('  演出タイマー: 通常の CHAIN 2 で showLines 2 / applyEvent 2 / syncView 1、終了後の残存 0');

  // (2)(3) 演出の途中で RETRY → 残存 0・古い callback 0・表示盤面が論理盤面と一致
  for (const [label, id, at] of [['通常1wave', 2, 150], ['CHAIN2', 9, 300], ['COMBO', 12, 300]]) {
    await start(id);
    const lastMv = await playToLast(id);
    await dragOn(tp, ...lastMv);
    await tp.waitForTimeout(at);
    await arm();
    await tp.evaluate(() => document.getElementById('btnRetry').click());
    const justAfter = await probe();
    let worstMismatch = justAfter.boardEqualsView ? 0 : 1;
    for (let i = 0; i < 20; i++) {
      await tp.waitForTimeout(60);
      const s = await probe();
      if (!s.boardEqualsView) worstMismatch = 1;
    }
    const end = await probe();
    if (justAfter.owned !== 0 || justAfter.clockActive !== 0)
      ng.push(`演出タイマー: ${label} 中の RETRY 後に owned=${justAfter.owned} clock=${justAfter.clockActive} 残っている`);
    if (end.calls.length !== 0)
      ng.push(`演出タイマー: ${label} 中の RETRY 後に古い callback が ${end.calls.length} 回動いた ${JSON.stringify(end.calls)}`);
    if (worstMismatch)
      ng.push(`演出タイマー: ${label} 中の RETRY 後に表示盤面が論理盤面と食い違った`);
    if (end.busy || end.chainNow !== 0 || end.fading !== 0 || end.flashes !== 0 || end.teachHold)
      ng.push(`演出タイマー: ${label} 中の RETRY 後に演出状態が初期値でない ${JSON.stringify(end)}`);
  }
  note.push('  演出タイマー: 通常1wave / CHAIN2 / COMBO の演出中に RETRY しても残存 0・古い callback 0・表示盤面一致');

  // (4) 連続した破棄が安全（演出中に 2 回続けてステージを変える）
  await start(2);
  await dragOn(tp, 0, 7, 7);
  await tp.waitForTimeout(150);
  await arm();
  await tp.evaluate(() => { window.__blast.goStage(3); window.__blast.goStage(4); });
  await tp.waitForTimeout(1600);
  const multi = await probe();
  if (multi.stage !== 4 || multi.owned !== 0 || multi.calls.length !== 0 || !multi.boardEqualsView)
    ng.push(`演出タイマー: 連続ステージ変更が安全でない ${JSON.stringify(multi)}`);
  else note.push('  演出タイマー: 演出中に 2 回続けてステージを変えても残存 0・古い callback 0');

  // (5) Scene shutdown 後に callback が動かない
  await start(9);
  const last9b = await playToLast(9);
  await dragOn(tp, ...last9b);
  await tp.waitForTimeout(300);
  await arm();
  // Phaser は scene.stop() を次の step まで遅らせるので、1 フレーム待ってから数える。
  const before = await tp.evaluate(() => {
    const sc = window.__blast.scene;
    const n = sc.resolutionTimers.size;
    sc.scene.stop();
    return n;
  });
  await tp.waitForTimeout(1500);
  const owned = { before, after: await tp.evaluate(() => window.__blast.scene.resolutionTimers.size) };
  const afterStop = await tp.evaluate(() => window.__t.calls.slice());
  if (owned.before === 0) ng.push('演出タイマー: shutdown 検査の前提（演出中）が成立していない');
  else if (owned.after !== 0) ng.push(`演出タイマー: shutdown 後も ${owned.after} 件残っている`);
  else if (afterStop.length !== 0) ng.push(`演出タイマー: shutdown 後に callback が ${afterStop.length} 回動いた`);
  else note.push(`  演出タイマー: shutdown で ${owned.before} 件を破棄し、以後 callback は動かない`);

  if (terrs.length) ng.push(`演出タイマー検査中に エラー ${terrs.length} 件 — ${terrs[0]}`);
  await tctx.close();
}

/* ⑨ ネイの attack（2B 7-5-9 ／ 工程 V-3）。
   **時間分離が実機で成り立っているか**を、実操作で確かめる。
   単体テストは規則（大きさ・位置・COMBO 判定）だけを見るので、
   「中央文字と 1ms も同時に出ない」「表示中に動かない」はここで見る。 */
{
  const ATK = `(() => {
    const e = document.getElementById('attackFigure');
    const on = e && e.classList.contains('on');
    const sc = window.__blast.scene, l = window.__blast.state().layout, dpr = devicePixelRatio;
    const cv = document.querySelector('#game canvas').getBoundingClientRect();
    const b = on ? e.getBoundingClientRect() : null;
    return {
      on: !!on,
      r: b ? { x: +b.x.toFixed(3), y: +b.y.toFixed(3), w: +b.width.toFixed(3), h: +b.height.toFixed(3) } : null,
      txt: ['chainText','comboNameText','comboNoteText','chainNoteText','teachPromptText','keepLabelText']
        .filter((n) => { const t = sc[n]; return t && t.alpha > 0.01 && t.visible && t.text; }).length,
      link: !!sc.comboLink,
      board: { x: +(cv.x + l.boardX / dpr).toFixed(2), y: +(cv.y + l.boardY / dpr).toFixed(2), w: +(l.boardW / dpr).toFixed(2) },
      sy: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      sx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`;
  const rhu = (v) => Math.floor(v + 0.5);
  for (const [vw, vh] of [[320, 568], [393, 852], [430, 932]]) {
    const actx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
    const ap = await actx.newPage();
    await ap.goto(URL, { waitUntil: 'networkidle' });
    await ap.waitForFunction(() => !!window.__blast, null, { timeout: 10000 });
    await ap.evaluate(() => window.__blast.goStage(10));
    await ap.waitForTimeout(350);
    await ap.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
    await ap.waitForTimeout(400);

    const samples = [];
    await ap.evaluate(`(() => { window.__AT = []; const f = () => {
      window.__AT.push(${ATK}); requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    await dragOn(ap, 0, 7, 2);
    await ap.waitForTimeout(1600);
    samples.push(...(await ap.evaluate(() => window.__AT)));

    const shown = samples.filter((s) => s.on);
    const tag = `attack ${vw}x${vh}`;
    if (shown.length === 0) {
      ng.push(`${tag}: COMBO 成立手で attack が出ない`);
    } else {
      const first = shown[0];
      const side = first.board.w;
      const h = rhu(side * 0.63);
      const w = rhu((h * 1404) / 2400);
      const inset = rhu((side / 8) * 0.25);
      const sc = h / 2400;
      // img から α 外接を戻す（img は透明余白 96s を含む）
      const right = first.r.x + 96 * sc + 1404 * sc;
      const bottom = first.r.y + 96 * sc + 2400 * sc;
      if (Math.abs(1404 * sc - w) > 0.5 || Math.abs(2400 * sc - h) > 0.5)
        ng.push(`${tag}: 外接 ${(1404 * sc).toFixed(1)}x${(2400 * sc).toFixed(1)} が規則の ${w}x${h} と違う`);
      else if (Math.abs(right - (first.board.x + side - inset)) > 0.6 || Math.abs(bottom - (first.board.y + side - inset)) > 0.6)
        ng.push(`${tag}: P-1 位置がずれている（右端差 ${(right - (first.board.x + side - inset)).toFixed(2)}）`);
      else if (shown.some((s) => s.txt > 0 || s.link))
        ng.push(`${tag}: attack と中央文字 / comboLink が同時に出た`);
      else if (shown.some((s) => s.r.x !== first.r.x || s.r.y !== first.r.y || s.r.w !== first.r.w || s.r.h !== first.r.h))
        ng.push(`${tag}: 表示中に人物が動いた`);
      else if (shown.some((s) => s.board.x !== first.board.x || s.board.y !== first.board.y || s.board.w !== first.board.w))
        ng.push(`${tag}: 表示中に盤面矩形が動いた`);
      else if (shown.some((s) => s.r.x < 0 || s.r.y < 0 || s.r.x + s.r.w > vw || s.r.y + s.r.h > vh))
        ng.push(`${tag}: viewport の外へ欠けた`);
      else if (samples.some((s) => s.sy !== 0 || s.sx !== 0))
        ng.push(`${tag}: スクロールが発生した`);
      else if (samples.some((s) => !s.on && s.txt === 0 && s.link) )
        ng.push(`${tag}: comboLink が attack より先に出た`);
      else
        note.push(`  ${tag}: 外接 ${w}x${h}（盤面辺 ${side}）／表示 ${shown.length} フレーム／中央文字と同時 0／移動 0／欠け 0`);
    }

    // 単独起爆の CHAIN 2 では出ない
    await ap.evaluate(() => window.__blast.goStage(9));
    await ap.waitForTimeout(350);
    await ap.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
    await ap.waitForTimeout(400);
    await ap.evaluate(`(() => { window.__AT = []; const f = () => {
      window.__AT.push(${ATK}); requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    for (const m of [[0, 7, 4], [1, 7, 0], [2, 7, 5]]) {
      try { await dragOn(ap, ...m); } catch { /* 置けない手は飛ばす */ }
      await ap.waitForTimeout(1400);
    }
    const soloShown = (await ap.evaluate(() => window.__AT)).filter((s) => s.on).length;
    if (soloShown > 0) ng.push(`${tag}: 単独起爆の手で attack が ${soloShown} フレーム出た`);
    else note.push(`  ${tag}: 単独起爆の CHAIN 2 では出ない`);

    // 演出中の RETRY / ステージ変更で即時に消える
    for (const [label, act] of [
      ['RETRY', () => ap.evaluate(() => window.__blast.retry())],
      ['ステージ変更', () => ap.evaluate(() => window.__blast.goStage(12))],
    ]) {
      await ap.evaluate(() => window.__blast.goStage(10));
      await ap.waitForTimeout(350);
      await ap.evaluate(() => { const b = document.querySelector('#overlayCard button'); if (b) b.click(); });
      await ap.waitForTimeout(400);
      await dragOn(ap, 0, 7, 2);
      await ap.waitForTimeout(280);
      const mid = await ap.evaluate(ATK);
      await act();
      const now = await ap.evaluate(() => document.getElementById('attackFigure').classList.contains('on'));
      if (!mid.on) ng.push(`${tag}: ${label} 検査の前提（attack 表示中）が成立していない`);
      else if (now) ng.push(`${tag}: ${label} で attack が即時に消えない`);
      else note.push(`  ${tag}: ${label} で attack が即時に消える`);
    }
    await actx.close();
  }
}

if (errs.length) ng.push(`操作中に エラー ${errs.length} 件 — ${errs[0]}`);

await browser.close();
console.log(note.join('\n'));
if (ng.length) {
  console.error('\n✗ ' + ng.length + ' 件\n' + ng.map((s) => '  - ' + s).join('\n'));
  process.exit(1);
}
console.log('\n✓ すべて合格');
