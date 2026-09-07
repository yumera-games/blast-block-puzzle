import type { PreviewResult } from '../game/Preview';
import type { StageState } from '../game/StageState';
import type { ResolutionResult } from '../game/types';

/**
 * 人間プレイ観察用のローカル計測。
 *
 * **メモリ上だけ。** 外部送信もしないし localStorage へも書かない。
 * ページを再読み込みすれば消える。ゲームの進行・判定には一切影響しない
 * （このクラスは読むだけで、StageState を書き換えるメソッドを持たない）。
 * 値は DBG パネルから JSON として取り出す。
 */
export interface AttemptMetrics {
  stage: number;
  /** そのステージで何回目の挑戦か（0 = 最初）。 */
  retry: number;
  movesUsed: number;
  illegalDrops: number;
  soloDetonations: number;
  combos: number;
  comboKinds: Record<string, number>;
  /** 最初の combo が成立した手数（1 始まり）。未成立なら null。 */
  firstComboAtMove: number | null;
  /** 特殊ごとの「生成から起爆までの手数」。 */
  specialLifetimes: number[];
  /** 予告を出した候補セル数（同じセルは 1 回だけ数える）。 */
  previewsShown: number;
  /** そのうち combo 予告だったもの。 */
  comboPreviewsShown: number;
  /** combo 予告を見て、その配置をそのまま選んだか。 */
  choseAfterComboPreview: boolean;
  result: 'playing' | 'cleared' | 'failed';
}

export class PlayMetrics {
  private readonly attempts: AttemptMetrics[] = [];
  private current: AttemptMetrics | null = null;
  private readonly retryCount = new Map<number, number>();
  private born = new Map<number, number>();
  private seenPreview = new Set<string>();
  private lastPreviewWasCombo = false;

  /** ステージ開始／リトライ。ここで 1 挑戦ぶんを初期化する。 */
  begin(stageId: number, isRetry: boolean): void {
    this.flush();
    const n = isRetry ? (this.retryCount.get(stageId) ?? 0) + 1 : 0;
    this.retryCount.set(stageId, n);
    this.born = new Map();
    this.seenPreview = new Set();
    this.lastPreviewWasCombo = false;
    this.current = {
      stage: stageId, retry: n, movesUsed: 0, illegalDrops: 0,
      soloDetonations: 0, combos: 0, comboKinds: {}, firstComboAtMove: null,
      specialLifetimes: [], previewsShown: 0, comboPreviewsShown: 0,
      choseAfterComboPreview: false, result: 'playing',
    };
  }

  onIllegalDrop(): void {
    if (this.current) this.current.illegalDrops++;
  }

  /** 予告を出したとき。同じ候補セルの再表示は数えない（呼び出し側でセルが変わったときだけ呼ぶ）。 */
  onPreview(key: string, preview: PreviewResult | null): void {
    const c = this.current;
    if (!c) return;
    this.lastPreviewWasCombo = preview?.effect != null;
    if (this.seenPreview.has(key)) return;
    this.seenPreview.add(key);
    c.previewsShown++;
    if (this.lastPreviewWasCombo) c.comboPreviewsShown++;
  }

  /** 1 手打ったあと。resolution から起爆と combo を数える。 */
  onPlaced(state: StageState, result: ResolutionResult | null, shownPreview: PreviewResult | null): void {
    const c = this.current;
    if (!c) return;
    c.movesUsed = state.movesUsed;
    if (shownPreview?.effect != null) c.choseAfterComboPreview = true;

    if (result) {
      for (const e of result.events) {
        if (e.spawned) this.born.set(e.spawned.uid, state.movesUsed);
        for (const d of e.detonations) {
          if (d.group.length >= 2) {
            c.combos++;
            c.comboKinds[d.effect] = (c.comboKinds[d.effect] ?? 0) + 1;
            if (c.firstComboAtMove === null) c.firstComboAtMove = state.movesUsed;
          } else {
            c.soloDetonations++;
          }
          for (const g of d.group) {
            const b = this.born.get(g.uid);
            if (b !== undefined) {
              c.specialLifetimes.push(state.movesUsed - b);
              this.born.delete(g.uid);
            }
          }
        }
        // 巻きこまれた（removed）だけでは寿命を確定させない。起爆は次の wave なので、
        // ここで born を消すと生成〜起爆の手数を取りこぼす。
        // 初期盤面の特殊は born に居ないため、そもそも数に入らない。
      }
    }
    c.result = state.status;
  }

  /** 進行中のものを確定させて一覧へ移す。 */
  private flush(): void {
    if (this.current) this.attempts.push(this.current);
    this.current = null;
  }

  /** DBG から取り出す JSON。進行中の挑戦も含める。 */
  toJSON(): string {
    const all = this.current ? [...this.attempts, this.current] : [...this.attempts];
    return JSON.stringify(all, null, 1);
  }

  get count(): number {
    return this.attempts.length + (this.current ? 1 : 0);
  }
}
