import { describe, expect, it } from 'vitest';
import { Sfx, playsSoloDetonation, type SfxBackend, type SfxName } from '../src/audio/sfx';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/game/settings';

/** スピーカーへ出さない backend。**鳴らす規則だけ**を見る。 */
function fakeBackend() {
  const played: SfxName[] = [];
  let stops = 0;
  let resumes = 0;
  const backend: SfxBackend = {
    play: (n) => void played.push(n),
    stop: () => void stops++,
    resume: () => void resumes++,
  };
  return {
    backend,
    played,
    get stops() {
      return stops;
    },
    get resumes() {
      return resumes;
    },
  };
}

/** 実時間に依存しない時計。 */
function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** 現在の効果音の全種類。**増えたらここも増やす。** */
const ALL_SOUNDS: readonly SfxName[] = ['place', 'line', 'special', 'detonate', 'combo', 'clear', 'fail'];

describe('sfx: 単独起爆と COMBO の優先', () => {
  it('COMBO の手では単独起爆の音を鳴らさない', () => {
    expect(playsSoloDetonation(1, true)).toBe(false);
    expect(playsSoloDetonation(3, true)).toBe(false);
  });

  it('COMBO でない手なら、起爆があるときだけ鳴らす', () => {
    expect(playsSoloDetonation(1, false)).toBe(true);
    expect(playsSoloDetonation(0, false)).toBe(false);
  });
});

describe('sfx: 鳴らす規則', () => {
  it('最初のユーザー操作の前は鳴らない（自動再生制限への対応）', () => {
    const f = fakeBackend();
    const s = new Sfx(f.backend, { enabled: true, now: () => 0 });
    s.play('place');
    expect(f.played).toEqual([]);
    expect(f.resumes).toBe(0);
    s.unlock();
    expect(f.resumes).toBe(1);
    s.play('place');
    expect(f.played).toEqual(['place']);
  });

  it('OFF では 7 種類とも鳴らない', () => {
    const f = fakeBackend();
    const s = new Sfx(f.backend, { enabled: false, now: () => 0 });
    s.unlock();
    for (const n of ALL_SOUNDS) s.play(n);
    expect(f.played).toEqual([]);
  });

  it('ON なら 7 種類とも鳴る（工程 W-3 で足した 2 種類を含む）', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    for (const n of ALL_SOUNDS) {
      s.play(n);
      c.advance(500); // 連打抑止にかからない間隔
    }
    expect(f.played).toEqual([...ALL_SOUNDS]);
  });

  it('特殊生成と単独起爆は、短い間隔の連打を 1 回にまとめる', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    s.play('special');
    c.advance(50);
    s.play('special'); // 90ms 未満なので出ない
    c.advance(50);
    s.play('special'); // 100ms 経過したので出る
    expect(f.played).toEqual(['special', 'special']);
  });

  it('特殊生成と単独起爆は「1 結果に 1 回」ではない（クリア・失敗とは別扱い）', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    for (let i = 0; i < 3; i++) {
      s.play('detonate');
      c.advance(200);
    }
    expect(f.played).toEqual(['detonate', 'detonate', 'detonate']);
  });

  it('OFF のときは AudioContext を起こさない', () => {
    const f = fakeBackend();
    const s = new Sfx(f.backend, { enabled: false, now: () => 0 });
    s.unlock();
    expect(f.resumes).toBe(0);
  });

  it('ON では対応イベントで 1 回ずつ鳴る', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    for (const n of ['place', 'line', 'combo', 'clear', 'fail'] as SfxName[]) {
      c.advance(1000);
      s.play(n);
    }
    expect(f.played).toEqual(['place', 'line', 'combo', 'clear', 'fail']);
  });

  it('OFF へ切り替えると鳴っている音を止める', () => {
    const f = fakeBackend();
    const s = new Sfx(f.backend, { enabled: true, now: () => 0 });
    s.unlock();
    s.setEnabled(false);
    expect(f.stops).toBe(1);
    expect(s.isEnabled).toBe(false);
    s.play('line');
    expect(f.played).toEqual([]);
  });

  it('同じ音が短時間に重ならない', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    s.play('place');
    c.advance(10);
    s.play('place'); // 40ms 未満なので捨てる
    c.advance(60);
    s.play('place');
    expect(f.played).toEqual(['place', 'place']);
  });

  it('COMBO 音は 1 手につき最大 1 回（間隔でも守られる）', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    s.play('combo');
    c.advance(50);
    s.play('combo');
    expect(f.played).toEqual(['combo']);
  });

  it('クリア音と失敗音は 1 結果につき 1 回', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    s.play('clear');
    c.advance(5000);
    s.play('clear'); // 同じ結果のうちは 2 回目を鳴らさない
    expect(f.played).toEqual(['clear']);
    s.resetOutcome();
    c.advance(5000);
    s.play('clear');
    expect(f.played).toEqual(['clear', 'clear']);
  });

  it('Retry / Stage 変更で古い予約音を持ち越さない', () => {
    const f = fakeBackend();
    const c = clock();
    const s = new Sfx(f.backend, { enabled: true, now: c.now });
    s.unlock();
    s.play('clear');
    s.cancel();
    expect(f.stops).toBe(1);
    // cancel のあとは「1 結果 1 回」の印も消えるので、新しい手番で鳴らせる
    c.advance(1000);
    s.play('clear');
    expect(f.played).toEqual(['clear', 'clear']);
  });

  it('backend が例外を投げてもゲームは進む', () => {
    const s = new Sfx(
      {
        play: () => {
          throw new Error('no audio');
        },
        stop: () => undefined,
        resume: () => undefined,
      },
      { enabled: true, now: () => 0 },
    );
    s.unlock();
    expect(() => s.play('place')).toThrow(); // backend の例外はここでは握りつぶさない
    // 実装側（createWebAudioBackend）は内部で try/catch している。
  });
});

describe('settings: 音設定の保存と復元', () => {
  function store(initial?: string) {
    const m = new Map<string, string>();
    if (initial !== undefined) m.set('blast-block:settings', initial);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  }
  it('初回は ON', () => {
    expect(loadSettings(store())).toEqual({ sound: true });
    expect(DEFAULT_SETTINGS.sound).toBe(true);
  });
  it('保存した値を読み戻せる', () => {
    const st = store();
    saveSettings({ sound: false }, st);
    expect(loadSettings(st)).toEqual({ sound: false });
  });
  it('壊れた値でも既定値へ倒れる', () => {
    for (const raw of ['x', 'null', '[]', '{}', '{"version":9,"sound":false}', '{"version":1,"sound":"no"}']) {
      expect(loadSettings(store(raw))).toEqual(DEFAULT_SETTINGS);
    }
  });
  it('localStorage が例外を投げても起動する', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings({ sound: false }, bad)).not.toThrow();
  });
  it('進行データとは別のキーを使う（進行の version を上げない）', () => {
    const m = new Map<string, string>();
    saveSettings({ sound: false }, { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
    expect([...m.keys()]).toEqual(['blast-block:settings']);
  });
});
