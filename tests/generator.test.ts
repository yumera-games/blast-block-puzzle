import { describe, expect, it } from 'vitest';
import { Board } from '../src/game/Board';
import { PieceGenerator, evaluateSet, isStuck } from '../src/game/PieceGenerator';
import { createPiece } from '../src/game/Piece';
import { shapeById } from '../src/data/pieces';
import { Rng } from '../src/game/Rng';

const signature = (gen: PieceGenerator, board: Board, sets: number): string =>
  Array.from({ length: sets }, () => gen.next(board).map((p) => `${p.shape.id}:${p.color}`).join(','))
    .join('|');

describe('PieceGenerator', () => {
  it('同じ seed なら同じ候補列を再現する', () => {
    const a = signature(new PieceGenerator(12345), new Board(), 20);
    const b = signature(new PieceGenerator(12345), new Board(), 20);
    expect(a).toBe(b);
  });

  it('seed が違えば候補列も変わる', () => {
    const a = signature(new PieceGenerator(1), new Board(), 20);
    const b = signature(new PieceGenerator(2), new Board(), 20);
    expect(a).not.toBe(b);
  });

  it('Rng も同じ seed で同じ数列を返す', () => {
    const a = Array.from({ length: 10 }, () => new Rng(7).next());
    expect(new Set(a).size).toBe(1); // 毎回作り直せば必ず同じ初手
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(Array.from({ length: 50 }, () => r1.next())).toEqual(Array.from({ length: 50 }, () => r2.next()));
  });

  it('固定セットを先に配り、使い切ったら乱数へ移る', () => {
    const gen = new PieceGenerator(999, [
      [
        { shape: 'dot', color: 'red' },
        { shape: 'h2', color: 'blue' },
        { shape: 'v2', color: 'green' },
      ],
    ]);
    const board = new Board();
    const first = gen.next(board);
    expect(first.map((p) => p.shape.id)).toEqual(['dot', 'h2', 'v2']);
    expect(first.map((p) => p.color)).toEqual(['red', 'blue', 'green']);
    const second = gen.next(board);
    expect(second.length).toBe(3);
  });

  it('Safe / Risky / Dead を評価できる', () => {
    const empty = new Board();
    const pieces = [
      createPiece(shapeById('dot'), 'red'),
      createPiece(shapeById('h4'), 'blue'),
      createPiece(shapeById('l5a'), 'green'),
    ];
    expect(evaluateSet(empty, pieces)).toBe('safe');

    // 1 マスだけ空いた盤面
    const almostFull = Board.fromStrings([
      'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR',
      'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRR.',
    ]);
    expect(evaluateSet(almostFull, [pieces[0]!, pieces[1]!, pieces[2]!])).toBe('risky');
    expect(evaluateSet(almostFull, [pieces[1]!, pieces[2]!])).toBe('dead');
  });

  it('通常生成では Dead セットを避ける', () => {
    // 1 マスだけ空いている盤面では dot 以外置けない。Dead を避けるなら dot を含むはず。
    const almostFull = Board.fromStrings([
      'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR',
      'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRR.',
    ]);
    let deadSets = 0;
    for (let seed = 0; seed < 40; seed++) {
      const gen = new PieceGenerator(seed);
      gen.next(almostFull);
      if (gen.evaluation === 'dead') deadSets++;
    }
    expect(deadSets).toBe(0);
  });

  it('盤面に空きが無ければ Dead を返す（無限に再抽選しない）', () => {
    const full = Board.fromStrings(Array.from({ length: 8 }, () => 'RRRRRRRR'));
    const gen = new PieceGenerator(1);
    gen.next(full);
    expect(gen.evaluation).toBe('dead');
    expect(gen.retries).toBe(0);
  });

  it('詰み判定：残った候補がどれも置けない', () => {
    const almostFull = Board.fromStrings([
      'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR',
      'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRR.',
    ]);
    expect(isStuck(almostFull, [createPiece(shapeById('h2'), 'red')])).toBe(true);
    expect(isStuck(almostFull, [createPiece(shapeById('dot'), 'red')])).toBe(false);
    expect(isStuck(almostFull, [])).toBe(false);
  });
});
