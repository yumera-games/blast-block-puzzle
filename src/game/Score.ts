import { BALANCE, chainMultiplier } from '../data/balance';
import type { RemovedCell, ResolutionEvent } from './types';

/** セル1個あたりの倍率。special > blast > line の順に強い。 */
export function sourceMultiplier(source: RemovedCell['source']): number {
  switch (source) {
    case 'special':
      return BALANCE.score.specialMultiplier;
    case 'blast':
      return BALANCE.score.colorBlastMultiplier;
    case 'line':
      return 1;
  }
}

/** 1 wave ぶんの得点。端数はここで1回だけ丸める。 */
export function scoreRemoval(removed: readonly RemovedCell[], chainIndex: number): number {
  const chain = chainMultiplier(chainIndex);
  let sum = 0;
  for (const r of removed) sum += BALANCE.score.perCell * sourceMultiplier(r.source);
  return Math.round(sum * chain);
}

export function totalScore(events: readonly ResolutionEvent[]): number {
  return events.reduce((a, e) => a + e.score, 0);
}
