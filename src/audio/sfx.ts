/**
 * 効果音（工程 W-2）。
 *
 * **音源ファイルを持たない。**Web Audio API で短い合成音をその場で作る。
 * 外部通信なし。ライセンス確認の要る素材を使わない。
 *
 * Phaser の `audio: { noAudio: true }` は **Phaser の音声機能だけ**を切る設定なので、
 * ここで直接 Web Audio を使うぶんには関係しない。**その設定は変更していない。**
 *
 * 「いつ鳴らすか」の規則（`Sfx`）と「どう鳴らすか」（backend）を分けてある。
 * テストは差し替えた backend で規則だけを見る。実際のスピーカー出力に依存しない。
 */

export type SfxName = 'place' | 'line' | 'combo' | 'clear' | 'fail';

export interface SfxBackend {
  /** 1 音鳴らす。**失敗しても投げない。** */
  play(name: SfxName): void;
  /** 鳴っている音を安全に止める（OFF へ切り替えた瞬間など）。 */
  stop(): void;
  /** 最初のユーザー操作のあとに呼ぶ。自動再生制限（iOS）への対応。 */
  resume(): void;
}

/** 同じ音が短時間に重ならないようにする間隔。 */
const MIN_GAP_MS: Record<SfxName, number> = {
  place: 40,
  line: 80,
  combo: 200,
  clear: 400,
  fail: 400,
};

export class Sfx {
  private readonly backend: SfxBackend;
  private readonly now: () => number;
  private enabled: boolean;
  /** 音ごとの最後に鳴らした時刻。連打で同じ音が重ならないようにする。 */
  private lastAt = new Map<SfxName, number>();
  /** 「この結果で 1 回だけ」を守るための印。クリア・失敗に使う。 */
  private oncePerOutcome = new Set<SfxName>();
  /** 最初のユーザー操作を済ませたか。 */
  private unlocked = false;

  constructor(backend: SfxBackend, opts: { enabled: boolean; now?: () => number }) {
    this.backend = backend;
    this.enabled = opts.enabled;
    this.now = opts.now ?? (() => Date.now());
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 最初のユーザー操作で呼ぶ。**ここまで AudioContext を触らない。**
   * OFF のときは再開しない（不要に AudioContext を起こさない）。
   */
  unlock(): void {
    this.unlocked = true;
    if (this.enabled) this.backend.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.backend.stop();
      this.lastAt.clear();
      return;
    }
    if (this.unlocked) this.backend.resume();
  }

  /** 結果（クリア・失敗）の 1 回きり判定をやり直せるようにする。手番の開始で呼ぶ。 */
  resetOutcome(): void {
    this.oncePerOutcome.clear();
  }

  /** 演出の中断（Retry / Stage 変更 / shutdown）。**予約されていた音は持ち越さない。** */
  cancel(): void {
    this.backend.stop();
    this.lastAt.clear();
    this.oncePerOutcome.clear();
  }

  play(name: SfxName): void {
    if (!this.enabled || !this.unlocked) return;
    if (name === 'clear' || name === 'fail') {
      if (this.oncePerOutcome.has(name)) return;
      this.oncePerOutcome.add(name);
    }
    const t = this.now();
    const last = this.lastAt.get(name);
    if (last !== undefined && t - last < MIN_GAP_MS[name]) return;
    this.lastAt.set(name, t);
    this.backend.play(name);
  }
}

/* ------------------------------------------------------------ Web Audio 実装 */

interface Tone {
  readonly type: OscillatorType;
  readonly freqs: readonly number[];
  readonly dur: number;
  readonly gain: number;
  readonly step?: number;
}

const TONES: Record<SfxName, Tone> = {
  // 置く：短く柔らかいクリック。主張しない。
  place: { type: 'sine', freqs: [520], dur: 0.06, gain: 0.18 },
  // ライン消去：明るい上向き。置く音と区別できるよう 2 音。
  line: { type: 'triangle', freqs: [660, 990], dur: 0.09, gain: 0.22, step: 0.055 },
  // COMBO：きらめき（高い 3 音）＋低い手応え。attack と同じ COMBO 判定で鳴る。
  combo: { type: 'triangle', freqs: [880, 1175, 1568, 220], dur: 0.1, gain: 0.24, step: 0.06 },
  // クリア：短い上昇フレーズ。
  clear: { type: 'triangle', freqs: [523, 659, 784, 1047], dur: 0.13, gain: 0.24, step: 0.1 },
  // 失敗：短い下降。威圧的にしない。
  fail: { type: 'sine', freqs: [392, 330, 262], dur: 0.16, gain: 0.2, step: 0.12 },
};

/** 全体の音量。**極端に大きくならないよう、ここで一度絞る。** */
const MASTER_GAIN = 0.5;

export function createWebAudioBackend(): SfxBackend {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let live: { osc: OscillatorNode; gain: GainNode }[] = [];

  const ensure = (): boolean => {
    if (ctx) return true;
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  };

  return {
    resume(): void {
      if (!ensure() || !ctx) return;
      // iOS はユーザー操作のハンドラ内で resume したときだけ動く。
      void ctx.resume().catch(() => undefined);
    },
    stop(): void {
      const c = ctx;
      try {
        for (const n of live) {
          if (c) {
            n.gain.gain.cancelScheduledValues(c.currentTime);
            // 急に切るとプツッと鳴るので、ごく短く減衰させてから止める。
            n.gain.gain.setTargetAtTime(0, c.currentTime, 0.01);
            n.osc.stop(c.currentTime + 0.05);
          } else {
            n.osc.stop();
          }
        }
      } catch {
        /* 止められなくても進行は続ける */
      }
      live = [];
    },
    play(name: SfxName): void {
      // ページが見えていないときは鳴らさない（遅れて鳴るのを防ぐ）。
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch {
        /* document が無い環境は無視 */
      }
      if (!ensure()) return;
      const c = ctx;
      const m = master;
      if (!c || !m) return;
      if (c.state === 'suspended') return; // まだ解錠されていない
      const tone = TONES[name];
      const t0 = c.currentTime;
      try {
        tone.freqs.forEach((f, i) => {
          const at = t0 + i * (tone.step ?? 0);
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = tone.type;
          osc.frequency.setValueAtTime(f, at);
          // 立ち上がりを少し鈍らせてクリックノイズを避ける。
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(tone.gain, at + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.dur);
          osc.connect(gain);
          gain.connect(m);
          osc.start(at);
          osc.stop(at + tone.dur + 0.02);
          const node = { osc, gain };
          live.push(node);
          osc.onended = (): void => {
            live = live.filter((n) => n !== node);
          };
        });
      } catch {
        /* 音が出せなくてもゲームは進む */
      }
    },
  };
}
