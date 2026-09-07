/**
 * seed 付き疑似乱数（mulberry32）。
 *
 * **同じ seed なら同じ候補列が再現できること**が Phase 1 の要件なので、
 * Math.random() をロジック側で直接呼ばないこと。
 */
export class Rng {
  private state: number;
  private readonly seed0: number;

  constructor(seed: number) {
    this.seed0 = seed >>> 0;
    this.state = this.seed0;
  }

  get seed(): number {
    return this.seed0;
  }

  reset(): void {
    this.state = this.seed0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, n) の整数 */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  /** 重み付き抽選。weight は正の数であること。 */
  weighted<T extends { weight: number }>(items: readonly T[]): T {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1]!;
  }
}
