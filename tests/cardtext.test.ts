import { describe, expect, it } from 'vitest';
import { allCleared, stageRows, titleBody } from '../src/ui/cardText';
import { DEFAULT_PROGRESS, withCleared, withCurrent, type Progress } from '../src/game/progress';
import { DEFAULT_STATS } from '../src/game/stats';
import { EMPTY_RECORDS, withClear } from '../src/game/records';
import { LAST_STAGE, STAGES } from '../src/data/stages';

const prog = (cleared: number, current: number): Progress => ({ cleared, current });
const stats = (endlessBest: number) => ({ ...DEFAULT_STATS, endlessBest });

describe('cardText: タイトルの本文', () => {
  it('まだクリアが無ければ遊び方の 1 行', () => {
    expect(titleBody(DEFAULT_PROGRESS, DEFAULT_STATS)).toBe('ブロックを ならべて ラインを けそう');
  });

  it('途中まででは、到達状況と次のステージを出す', () => {
    const body = titleBody(prog(5, 6), DEFAULT_STATS);
    expect(body).toContain('ステージ 5 まで クリア');
    expect(body).toContain('つぎは ステージ 6');
  });

  it('**全クリア後は「つぎは ステージ 12」を出さない**', () => {
    const body = titleBody(prog(LAST_STAGE, LAST_STAGE), stats(0));
    expect(body).not.toContain('つぎは');
    expect(body).toContain(`ぜん ${LAST_STAGE} ステージ クリア`);
    expect(body).toContain('つづきから は ステージ 12');
  });

  it('全クリア後はエンドレスの最高記録を出す。記録が無ければ出さない', () => {
    expect(titleBody(prog(LAST_STAGE, 12), stats(8375))).toContain('エンドレス さいこう 8375');
    expect(titleBody(prog(LAST_STAGE, 12), stats(0))).not.toContain('エンドレス');
  });

  it('全クリア後に過去ステージを選んでも、本文は全クリアのまま', () => {
    const body = titleBody(prog(LAST_STAGE, 3), stats(100));
    expect(body).toContain(`ぜん ${LAST_STAGE} ステージ クリア`);
    expect(body).toContain('つづきから は ステージ 3');
    expect(body).not.toContain('つぎは');
  });

  it('allCleared は cleared だけで決まる', () => {
    expect(allCleared(prog(LAST_STAGE - 1, 12))).toBe(false);
    expect(allCleared(prog(LAST_STAGE, 1))).toBe(true);
  });
});

describe('cardText: ステージ選択の一覧', () => {
  const recs = withClear(withClear(EMPTY_RECORDS, 1, { score: 300, movesUsed: 3, maxChain: 2 }).records, 2, {
    score: 640,
    movesUsed: 5,
    maxChain: 1,
  }).records;

  it('12 件すべてを返し、名前は既存のステージ名を使う', () => {
    const rows = stageRows(prog(2, 3), recs, 3);
    expect(rows).toHaveLength(STAGES.length);
    expect(rows[0]!.name).toBe(STAGES[0]!.name);
  });

  it('クリア済みには BEST SCORE とクリア回数が出る', () => {
    const rows = stageRows(prog(2, 3), recs, 3);
    expect(rows[0]).toMatchObject({ id: 1, cleared: true, bestScore: 300, clearCount: 1, label: 'クリア済み' });
    expect(rows[1]).toMatchObject({ id: 2, cleared: true, bestScore: 640, clearCount: 1 });
  });

  it('未クリア（解放済み）は記録を持たない', () => {
    const rows = stageRows(prog(2, 3), recs, 3);
    expect(rows[2]).toMatchObject({ id: 3, locked: false, cleared: false, bestScore: null, label: '未クリア' });
  });

  it('**未解放のステージは名前も記録も出さない**', () => {
    const rows = stageRows(prog(2, 3), recs, 3);
    const locked = rows.filter((r) => r.locked);
    expect(locked.map((r) => r.id)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const r of locked) {
      expect(r.name).toBeNull();
      expect(r.bestScore).toBeNull();
      expect(r.clearCount).toBeNull();
      expect(r.label).toBe('未解放');
    }
  });

  it('未解放のステージは、記録が残っていても画面へ出さない', () => {
    // 進行データだけを戻した状態（解放は 1 まで）。記録は残っている。
    const rows = stageRows(prog(0, 1), recs, 1);
    expect(rows[1]).toMatchObject({ id: 2, locked: true, name: null, bestScore: null });
  });

  it('いま選ばれている行が分かる（色以外の情報として持つ）', () => {
    const rows = stageRows(prog(5, 3), recs, 3);
    expect(rows.filter((r) => r.current).map((r) => r.id)).toEqual([3]);
  });

  it('全クリア後は 12 件すべて選べる', () => {
    const rows = stageRows(prog(LAST_STAGE, 12), recs, 12);
    expect(rows.every((r) => !r.locked)).toBe(true);
    expect(rows.every((r) => r.cleared)).toBe(true);
  });

  it('開発モードでは全件を解放して扱う', () => {
    const rows = stageRows(prog(0, 1), recs, 1, { devMode: true });
    expect(rows.every((r) => !r.locked)).toBe(true);
    expect(rows[11]!.name).toBe(STAGES[11]!.name);
  });
});

describe('cardText: 再挑戦しても進行は後退しない', () => {
  it('全クリア後に Stage 3 を開いても cleared は 12 のまま', () => {
    let p: Progress = prog(LAST_STAGE, 12);
    p = withCurrent(p, 3);
    expect(p.cleared).toBe(LAST_STAGE);
    expect(p.current).toBe(3);
    expect(allCleared(p)).toBe(true);
    expect(stageRows(p, EMPTY_RECORDS, 3).every((r) => !r.locked)).toBe(true);
  });

  it('過去ステージを再クリアしても cleared は下がらない', () => {
    let p: Progress = prog(LAST_STAGE, 3);
    p = withCleared(p, 3);
    expect(p.cleared).toBe(LAST_STAGE);
    expect(allCleared(p)).toBe(true);
  });
});
