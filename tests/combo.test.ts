import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/Board';
import { COMBO_EFFECTS, COMBO_NAMES, comboName, comboPreviewLabel, isComboEffect } from '../src/data/combos';
import { stageById } from '../src/data/stages';
import { shapeById } from '../src/data/pieces';
import { previewPlacement } from '../src/game/Preview';
import { StageState } from '../src/game/StageState';
import { playOne } from './helpers';

const EMPTY = '........';
const rows = (map: Record<number, string>): string[] =>
  Array.from({ length: 8 }, (_, i) => map[i] ?? EMPTY);

describe('COMBO の表示名（対応表は 1 か所）', () => {
  it('特殊 x 特殊 の 6 通りすべてに名前がある', () => {
    expect(COMBO_EFFECTS.sort()).toEqual(
      ['bomb+bomb', 'rainbow+bomb', 'rainbow+rainbow', 'rainbow+rocket', 'rocket+bomb', 'rocket+rocket'].sort(),
    );
    expect(COMBO_NAMES['rocket+rocket']).toBe('ROCKET + ROCKET');
    expect(COMBO_NAMES['rocket+bomb']).toBe('ROCKET + BOMB');
    expect(COMBO_NAMES['bomb+bomb']).toBe('BOMB + BOMB');
    expect(COMBO_NAMES['rainbow+rocket']).toBe('RAINBOW + ROCKET');
    expect(COMBO_NAMES['rainbow+bomb']).toBe('RAINBOW + BOMB');
    expect(COMBO_NAMES['rainbow+rainbow']).toBe('RAINBOW + RAINBOW');
    for (const e of COMBO_EFFECTS) expect(comboName(e)).toBe(COMBO_NAMES[e]);
  });

  it('単独起爆では COMBO 名を出さない', () => {
    for (const solo of ['rocket', 'bomb', 'rainbow', 'none']) {
      expect(comboName(solo), solo).toBeNull();
      expect(isComboEffect(solo), solo).toBe(false);
      expect(comboPreviewLabel(solo), solo).toBeNull();
    }
    expect(comboName(null)).toBeNull();
    expect(comboName(undefined)).toBeNull();
  });

  it('予告ラベルは矢印つきになる', () => {
    expect(comboPreviewLabel('rocket+bomb')).toBe('ROCKET → BOMB COMBO');
  });

  it('実際の resolution が返す effect は、combo なら必ず名前を持つ', () => {
    // 射線が届いて combo になるケース
    const { result } = playOne(rows({ 3: '..*.....', 7: 'RB^YGPR.' }), 'dot', 'blue', 7, 7);
    const d = result.events[1]!.detonations[0]!;
    expect(d.group.length).toBe(2);
    expect(comboName(d.effect)).toBe('ROCKET + BOMB');
  });

  it('単独起爆した resolution の effect は名前を持たない', () => {
    const { result } = playOne(rows({ 6: '.GPG....', 7: 'RB*YGPR.' }), 'dot', 'blue', 7, 7);
    const d = result.events[1]!.detonations[0]!;
    expect(d.group.length).toBe(1);
    expect(comboName(d.effect)).toBeNull();
  });
});

describe('ドラッグ予告（preview）', () => {
  /** Stage 11 の 3 手目直前＝ROCKET を巻きこんで COMBO になる局面を作る。 */
  const beforeComboMove = () => {
    const st = new StageState(stageById(11));
    st.place(0, 6, 3);
    st.place(1, 6, 0);
    return st;
  };

  it('置けない場所では予告を出さない', () => {
    const st = new StageState(stageById(11));
    // (3,0) は初期盤面で埋まっている
    expect(previewPlacement(st.board, st.tray[0]!, 3, 0)).toBeNull();
    // 盤外
    expect(previewPlacement(st.board, st.tray[0]!, 7, 7)).toBeNull();
  });

  it('実盤面を変更しない', () => {
    const st = beforeComboMove();
    const before = st.board.toStrings();
    const filled = st.board.countFilled();
    previewPlacement(st.board, st.tray[2]!, 6, 4);
    expect(st.board.toStrings()).toEqual(before);
    expect(st.board.countFilled()).toBe(filled);
  });

  it('RNG・uid・トレイを消費しない', () => {
    const st = beforeComboMove();
    const seed = st.seed;
    const sets = st.setsDealt;
    const maxUid = st.board.maxUid();
    const tray = st.tray.map((p) => p && `${p.shape.id}:${p.color}`);
    const moves = st.moves;

    // 同じ候補を何度予告しても状態は動かない
    for (let i = 0; i < 5; i++) previewPlacement(st.board, st.tray[2]!, 6, 4);

    expect(st.seed).toBe(seed);
    expect(st.setsDealt).toBe(sets);
    expect(st.board.maxUid()).toBe(maxUid);
    expect(st.tray.map((p) => p && `${p.shape.id}:${p.color}`)).toEqual(tray);
    expect(st.moves).toBe(moves);
    expect(st.movesUsed).toBe(2);
    expect(st.lastResult!.events.length).toBe(0); // 直前の手（resolution 無し）のまま
  });

  it('予告した内容と、実際に置いたあとの最初の起爆・combo が一致する', () => {
    const st = beforeComboMove();
    const pv = previewPlacement(st.board, st.tray[2]!, 6, 4)!;
    expect(pv.effect).toBe('rocket+bomb');
    expect(pv.triggerCells).toEqual([st.board.idx(6, 3)]); // 巻きこまれる ROCKET
    expect(pv.comboCells).toEqual([st.board.idx(3, 3)]);   // 取り込まれる BOMB
    expect(pv.reachCells).toContain(st.board.idx(3, 3));   // 射線が BOMB へ届く
    expect(pv.lineCells.length).toBe(8);                   // 行 6 が完成する

    // 実際に置くと、予告どおりの起爆になる
    const out = st.place(2, 6, 4);
    const d = out.result!.events[1]!.detonations[0]!;
    expect(d.effect).toBe(pv.effect);
    expect(d.group.map((g) => g.index).sort((a, b) => a - b)).toEqual(
      [...pv.triggerCells, ...pv.comboCells].sort((a, b) => a - b),
    );
  });

  it('単独起爆になる配置では combo 予告を出さない', () => {
    // 相手の居ない BOMB。行をそろえると巻きこまれるが、届く先に特殊が無い。
    const board = Board.fromStrings(rows({ 3: 'RBY*GPR.' }));
    const pv = previewPlacement(board, { shape: shapeById('dot'), color: 'blue', uid: 999 }, 3, 7)!;
    expect(pv.effect).toBeNull();
    expect(comboName(pv.effect)).toBeNull();
    expect(pv.triggerCells).toEqual([board.idx(3, 3)]); // BOMB は巻きこまれる
    expect(pv.comboCells).toEqual([]);                  // 相手は居ない
  });

  it('Stage 12 でも、想定解の 3 手目だけ combo 予告が出る', () => {
    const st = new StageState(stageById(12));
    st.place(0, 0, 3);
    st.place(1, 0, 0);
    const pv = previewPlacement(st.board, st.tray[2]!, 0, 4)!;
    expect(pv.effect).toBe('rocket+bomb');
    expect(pv.comboCells).toEqual([st.board.idx(5, 3)]); // 取り込まれる BOMB
    // 別の場所ではラベルを出さない
    expect(previewPlacement(st.board, st.tray[2]!, 4, 0)!.effect).toBeNull();
  });

  it('起爆が起きない配置ではライン予告だけになる', () => {
    const st = new StageState(stageById(1));
    const pv = previewPlacement(st.board, st.tray[0]!, 7, 7)!;
    expect(pv.lineCells.length).toBe(8);
    expect(pv.triggerCells).toEqual([]);
    expect(pv.comboCells).toEqual([]);
    expect(pv.effect).toBeNull();
  });

  it('combo 判定は Preview 側で書き直さず、resolveBoard の結果をそのまま使う', () => {
    // 届かない配置では combo にならない（groupByEffectReach と同じ規則になっている証拠）
    const board = new StageState(stageById(11)).board;
    const pv = previewPlacement(board, { shape: shapeById('v2'), color: 'green', uid: 999 }, 6, 3)!;
    // 1 手目は ROCKET を作るだけ。まだ何も起爆しない。
    expect(pv.triggerCells).toEqual([]);
    expect(pv.effect).toBeNull();
  });
});

describe('combo を objective にする', () => {
  const stage = (objective: { kind: 'combo'; target: number; effect?: 'rocket+bomb' | 'rocket+rocket'; label: string }) => ({
    ...stageById(11),
    id: 900,
    objectives: [objective],
  });

  it('generic な combo 目的は、どの特殊 x 特殊 でも進む', () => {
    const st = new StageState(stage({ kind: 'combo', target: 1, label: 'any' }));
    st.place(0, 6, 3);
    st.place(1, 6, 0);
    expect(st.objectiveProgress()[0]!.current).toBe(0);
    st.place(2, 6, 4); // rocket+bomb
    expect(st.objectiveProgress()[0]!.current).toBe(1);
    expect(st.status).toBe('cleared');
  });

  it('effect 指定の combo 目的は、その組み合わせだけで進む', () => {
    const match = new StageState(stage({ kind: 'combo', target: 1, effect: 'rocket+bomb', label: 'rb' }));
    match.place(0, 6, 3);
    match.place(1, 6, 0);
    match.place(2, 6, 4);
    expect(match.objectiveProgress()[0]!.current).toBe(1);

    const other = new StageState(stage({ kind: 'combo', target: 1, effect: 'rocket+rocket', label: 'rr' }));
    other.place(0, 6, 3);
    other.place(1, 6, 0);
    other.place(2, 6, 4); // 起きたのは rocket+bomb なので進まない
    expect(other.objectiveProgress()[0]!.current).toBe(0);
  });

  it('単独 ROCKET では combo 目的が進まない', () => {
    const st = new StageState({
      ...stageById(5),
      id: 901,
      objectives: [{ kind: 'combo', target: 1, label: 'any' }],
    });
    st.place(0, 6, 7);
    st.place(1, 6, 0);
    st.place(2, 6, 4); // ROCKET 単独起爆
    expect(st.lastResult!.events[1]!.detonations[0]!.group.length).toBe(1);
    expect(st.objectiveProgress()[0]!.current).toBe(0);
  });

  it('届かない ROCKET と BOMB では combo 目的が進まない', () => {
    const st = new StageState({
      ...stageById(1),
      id: 902,
      // (7,1) の縦 ROCKET は列 1、(7,4) の BOMB の 3x3 は列 3〜5。互いに届かない。
      initialBoard: ['........', '........', '........', '........', '........', '........', '........', 'R^YG*BR.'],
      fixedSets: [[{ shape: 'dot', color: 'blue' }, { shape: 'dot', color: 'red' }, { shape: 'dot', color: 'green' }]],
      moves: 3,
      objectives: [{ kind: 'combo', target: 1, label: 'any' }],
    });
    st.place(0, 7, 7);
    const dets = st.lastResult!.events[1]!.detonations;
    expect(dets.length).toBe(2); // 別々に起爆
    expect(dets.every((d) => d.group.length === 1)).toBe(true);
    expect(st.objectiveProgress()[0]!.current).toBe(0);
  });

  it('同じ combo を二重に数えない', () => {
    const st = new StageState(stage({ kind: 'combo', target: 5, label: 'many' }));
    st.place(0, 6, 3);
    st.place(1, 6, 0);
    st.place(2, 6, 4);
    // 1 回の resolution で成立した combo グループは 1 つ → 進捗も 1
    const groups = st.lastResult!.events.flatMap((e) => e.detonations.filter((d) => d.group.length >= 2));
    expect(groups.length).toBe(1);
    expect(st.objectiveProgress()[0]!.current).toBe(1);
  });
});
