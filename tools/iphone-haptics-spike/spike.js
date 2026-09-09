/* iPhone 触覚スパイク。技術検証専用で、本番ゲームには読み込まれない。
   外部通信・分析・トラッカーなし。端末を一意に追跡する識別子は作らない・保存しない。 */
(function () {
  'use strict';

  var VERSION = 'iphone-haptics-spike v1 (2026-09-09)';
  var STORE_KEY = 'iphone-haptics-spike/v1';   // このスパイクのページ内だけで使う
  var errors = [];

  window.addEventListener('error', function (e) {
    errors.push({ type: 'error', message: String(e.message || ''), at: new Date().toISOString() });
  });
  window.addEventListener('unhandledrejection', function (e) {
    errors.push({ type: 'unhandledrejection', message: String((e.reason && e.reason.message) || e.reason || ''), at: new Date().toISOString() });
  });

  /* ---------- 機能検出（非公開 API は使わない） ---------- */
  var switchSupported = (function () {
    try { return 'switch' in document.createElement('input'); } catch (e) { return false; }
  })();

  function displayMode() {
    var modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser'];
    for (var i = 0; i < modes.length; i++) {
      try { if (window.matchMedia('(display-mode: ' + modes[i] + ')').matches) return modes[i]; } catch (e) {}
    }
    return 'unknown';
  }
  function iosStandalone() {
    return (typeof navigator.standalone === 'boolean') ? navigator.standalone : null;
  }
  function presentation() {
    var dm = displayMode(), st = iosStandalone();
    if (dm === 'standalone' || dm === 'fullscreen' || st === true) return 'home-screen（ホーム画面追加）';
    if (dm === 'browser' || st === false) return 'safari-tab（Safari 通常表示）';
    return 'unknown';
  }
  /* UA からの推定のみ。端末固有の識別子は取得しない。 */
  function osVersionBestEffort() {
    var m = /(?:iPhone |CPU )OS (\d+)[._](\d+)(?:[._](\d+))?/.exec(navigator.userAgent);
    if (!m) return null;
    return m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '');
  }

  /* ---------- テスト定義 ---------- */
  var TESTS = [
    { id: 'B', name: 'Test B：同期操作',
      desc: 'ボタンを押した<b>同じユーザー操作の中で</b>スイッチを操作します。',
      method: 'click ハンドラ内で同期的に switch.click()',
      run: function (ctx) { ctx.pulse(0); } },
    { id: 'C', name: 'Test C：短い遅延（約 80ms）',
      desc: 'ボタンのタップから<b>約 80ms 後</b>にスイッチを操作します。',
      method: 'setTimeout(80ms) 後に switch.click()',
      run: function (ctx) { ctx.pulse(80); } },
    { id: 'D', name: 'Test D：演出途中（約 280ms）',
      desc: 'タップから<b>約 280ms 後</b>。COMBO 主爆発相当のタイミングで使えるかを見ます。',
      method: 'setTimeout(280ms) 後に switch.click()',
      run: function (ctx) { ctx.pulse(280); } },
    { id: 'E', name: 'Test E：二段予告',
      desc: '<b>接続予告と主爆発</b>を想定し、2 回に分けて操作します。',
      method: 'setTimeout(120ms) と setTimeout(300ms) の 2 回',
      run: function (ctx) { ctx.pulse(120); ctx.pulse(300); } },
    { id: 'F', name: 'Test F：連続抑制',
      desc: '<b>短時間に 6 回</b>要求します。キュー・抑制・統合が必要かを見ます（抑制なしの素の挙動）。',
      method: '0/70/140/210/280/350ms の 6 回。抑制もキューも入れていない',
      run: function (ctx) { [0, 70, 140, 210, 280, 350].forEach(function (d) { ctx.pulse(d); }); } }
  ];

  /* ---------- 記録 ---------- */
  var results = {};   // id -> { count, runs:[{at,offsetMs,toggled}], answer, note }
  function blank() { return { count: 0, runs: [], answer: '', note: '' }; }
  ['A'].concat(TESTS.map(function (t) { return t.id; })).forEach(function (id) { results[id] = blank(); });

  var storageUsed = false, storageError = null;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(results));
      storageUsed = true;
    } catch (e) { storageError = String(e && e.message || e); }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var got = JSON.parse(raw);
      Object.keys(results).forEach(function (id) {
        if (got[id]) results[id] = { count: got[id].count | 0, runs: got[id].runs || [], answer: got[id].answer || '', note: got[id].note || '' };
      });
      storageUsed = true;
    } catch (e) { storageError = String(e && e.message || e); }
  }

  /* ---------- UI 部品 ---------- */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function answerBlock(id, onChange) {
    var fs = el('fieldset');
    fs.appendChild(el('legend', null, '実機での体感（あなたの回答だけが根拠です）'));
    var ch = el('div', 'choices');
    [['felt', '感じた'], ['not', '感じない'], ['unsure', '不明']].forEach(function (p) {
      var lb = el('label');
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'ans-' + id; r.value = p[0];
      r.checked = results[id].answer === p[0];
      r.addEventListener('change', function () { results[id].answer = p[0]; onChange(); });
      lb.appendChild(r); lb.appendChild(document.createTextNode(p[1]));
      ch.appendChild(lb);
    });
    fs.appendChild(ch);
    var tx = document.createElement('input');
    tx.type = 'text'; tx.placeholder = '自由記入（強さ、遅れ、違和感など）';
    tx.value = results[id].note; tx.style.marginTop = '8px';
    tx.addEventListener('input', function () { results[id].note = tx.value; onChange(); });
    fs.appendChild(tx);
    return fs;
  }

  /* ---------- 描画 ---------- */
  var envList = document.getElementById('envList');
  var testsRoot = document.getElementById('tests');
  var jsonOut = document.getElementById('jsonOut');
  var copyState = document.getElementById('copyState');

  function renderEnv() {
    var vv = window.visualViewport;
    var rows = [
      ['userAgent', navigator.userAgent],
      ['viewport (CSS px)', window.innerWidth + ' × ' + window.innerHeight],
      ['visualViewport', vv ? (Math.round(vv.width) + ' × ' + Math.round(vv.height)) : '取得不可'],
      ['devicePixelRatio', String(window.devicePixelRatio)],
      ['display-mode', displayMode()],
      ['navigator.standalone', String(iosStandalone())],
      ['表示形態', presentation()],
      ['OS バージョン（UA 推定）', osVersionBestEffort() || '取得不可']
    ];
    envList.innerHTML = '';
    rows.forEach(function (r) {
      envList.appendChild(el('dt', null, r[0]));
      envList.appendChild(el('dd', null, String(r[1]).replace(/</g, '&lt;')));
    });
    document.getElementById('switchSupport').innerHTML = switchSupported
      ? '<b>input の switch 属性：サポートあり</b>（＝ Safari 18 以降の系統）。'
        + 'ただし<b>触覚が出るかどうかは、これでは分かりません。</b>'
      : '<b>input の switch 属性：サポートなし</b>。この環境では Test A〜F は触覚の判定材料になりません。';
  }

  function renderTest(t) {
    var card = el('section', 'card');
    card.appendChild(el('h2', null, t.name));
    card.appendChild(el('p', 'desc', t.desc));

    var sw = document.createElement('input');
    sw.type = 'checkbox';
    if (switchSupported) sw.setAttribute('switch', '');
    sw.id = 'sw-' + t.id;
    var swrow = el('label', 'swrow');
    swrow.appendChild(sw);
    swrow.appendChild(el('span', null, 'このテストが操作するスイッチ（目視用。直接触っても構いません）'));
    card.appendChild(swrow);

    var btn = el('button', 'btn primary run', t.name.split('：')[0] + ' を実行');
    btn.type = 'button';
    card.appendChild(btn);

    var meta = el('div', 'meta');
    function metaRow(k) { var b = el('b', null, '—'); meta.appendChild(el('span', null, k)); meta.appendChild(b); return b; }
    var mCount = metaRow('実行回数');
    var mTime = metaRow('最終実行時刻');
    var mMethod = metaRow('実行方式');
    mMethod.textContent = t.method;
    card.appendChild(meta);

    var state = el('div', 'state', 'まだ実行していません。');
    card.appendChild(state);

    function refreshMeta() {
      mCount.textContent = String(results[t.id].count);
      var last = results[t.id].runs[results[t.id].runs.length - 1];
      mTime.textContent = last ? last.at : '—';
    }
    var ans = answerBlock(t.id, function () { save(); renderJson(); });
    card.appendChild(ans);

    var ctx = {
      pulse: function (delay) {
        var fire = function () {
          var before, after, toggled = false, err = null;
          try {
            before = sw.checked;
            sw.click();                 // 非公開 API ではなく、通常の click
            after = sw.checked;
            toggled = (before !== after);
          } catch (e) { err = String(e && e.message || e); errors.push({ type: 'pulse', message: err, at: new Date().toISOString() }); }
          results[t.id].count += 1;
          results[t.id].runs.push({ at: new Date().toISOString(), offsetMs: delay, toggled: toggled, error: err });
          if (results[t.id].runs.length > 60) results[t.id].runs.splice(0, results[t.id].runs.length - 60);
          state.className = 'state ' + (toggled && !err ? 'ok' : 'ng');
          state.innerHTML = toggled && !err
            ? '<b>コード上は実行された</b>（switch の checked が ' + String(before) + ' → ' + String(after) + ' に変化）。'
              + '<br><b>触覚が出たかどうかは、これでは分かりません。</b>下の回答欄で答えてください。'
            : '<b>コード上、切り替えを確認できませんでした</b>' + (err ? '（' + err + '）' : '') + '。';
          refreshMeta(); save(); renderJson();
        };
        if (delay > 0) setTimeout(fire, delay); else fire();
      }
    };
    btn.addEventListener('click', function () { t.run(ctx); });

    refreshMeta();
    return card;
  }

  /* ---------- 結果 JSON ---------- */
  function buildJson() {
    var vv = window.visualViewport;
    var perTest = {};
    Object.keys(results).forEach(function (id) {
      perTest[id] = {
        count: results[id].count,
        runs: results[id].runs,
        felt: results[id].answer || null,   // 'felt' | 'not' | 'unsure' | null
        note: results[id].note || ''
      };
    });
    return {
      spike: VERSION,
      note: 'コード上の実行と、実際の触覚の有無は別。felt はユーザーの実機回答であり自動判定ではない。',
      capturedAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visualViewport: vv ? { width: Math.round(vv.width), height: Math.round(vv.height) } : null,
        devicePixelRatio: window.devicePixelRatio,
        displayMode: displayMode(),
        navigatorStandalone: iosStandalone(),
        presentation: presentation(),
        osVersionBestEffort: osVersionBestEffort(),
        switchAttributeSupported: switchSupported
      },
      tests: perTest,
      errors: errors,
      storage: { used: storageUsed, key: storageUsed ? STORE_KEY : null, error: storageError }
    };
  }
  function renderJson() { jsonOut.value = JSON.stringify(buildJson(), null, 2); }

  /* ---------- 起動 ---------- */
  load();
  renderEnv();
  TESTS.forEach(function (t) { testsRoot.appendChild(renderTest(t)); });

  // Test A（基準）の回答欄
  var baseSwitch = document.getElementById('baseSwitch');
  if (!switchSupported) baseSwitch.removeAttribute('switch');
  baseSwitch.addEventListener('change', function () {
    results.A.count += 1;
    results.A.runs.push({ at: new Date().toISOString(), offsetMs: null, toggled: true, error: null, method: 'ユーザーが直接操作' });
    save(); renderJson();
  });
  document.querySelector('.ans[data-test="A"]').appendChild(answerBlock('A', function () { save(); renderJson(); }));

  document.getElementById('copyBtn').addEventListener('click', function () {
    renderJson();
    var txt = jsonOut.value;
    function ok() { copyState.textContent = 'コピーしました（外部へは送信していません）。'; }
    function ng() {
      jsonOut.focus(); jsonOut.select();
      copyState.textContent = '自動コピーできませんでした。下の欄を選択して手動でコピーしてください。';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, ng);
    } else { ng(); }
  });
  document.getElementById('resetBtn').addEventListener('click', function () {
    Object.keys(results).forEach(function (id) { results[id] = blank(); });
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    copyState.textContent = '記録をリセットしました。ページを再読み込みすると表示も戻ります。';
    renderJson();
  });

  ['resize', 'orientationchange'].forEach(function (ev) { window.addEventListener(ev, renderEnv); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', renderEnv);

  document.getElementById('storeNote').innerHTML = storageUsed
    ? '記録は <code>localStorage</code>（キー <code>' + STORE_KEY + '</code>）へ<b>このスパイク内だけ</b>保存しています。'
      + '「記録をリセット」で消せます。<b>外部へは送信しません。</b>'
    : '<b>localStorage は使えていません</b>（' + (storageError || '理由不明') + '）。記録はページを離れると消えます。';
  document.getElementById('verNote').textContent = VERSION;
  renderJson();
})();
