import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PIECES, emptyBoard, applyGravity, playGravityMove, scoreChain,
  scorePlacement, newScore, fullLines, clearLines, CLEAR_POINTS,
} from '../js/logic.js';

const piece = id => PIECES.find(p => p.id === id);

test('blocks drop to the bottom of their column, keeping their order', () => {
  const b = emptyBoard();
  b[1][0] = 1; b[3][0] = 2; b[7][2] = 3; b[0][5] = 4;
  const { board, falls } = applyGravity(b);
  assert.equal(board[7][0], 2);
  assert.equal(board[6][0], 1);
  assert.equal(board[7][2], 3);
  assert.equal(board[7][5], 4);
  assert.equal(board[1][0], null);
  assert.equal(falls[7][0], 4);
  assert.equal(falls[6][0], 5);
  assert.equal(falls[7][2], 0);
  assert.equal(falls[7][5], 7);
});

test('a cleared row lets the blocks above it fall', () => {
  const b = emptyBoard();
  for (let c = 0; c < SIZE; c++) b[7][c] = 0; // full bottom row
  b[6][3] = 1;
  const cleared = clearLines(b, fullLines(b));
  const { board } = applyGravity(cleared);
  assert.equal(board[7][3], 1);
  assert.equal(board[6][3], null);
});

test('dropping can fill a new line: a chain reaction', () => {
  const b = emptyBoard();
  // Row 7 is full except column 0; row 6 is full except column 7.
  // A dot at (6,7) clears row 6, then the block at (5,0) falls into row 7's gap,
  // which fills row 7 and clears it too.
  for (let c = 1; c < SIZE; c++) b[7][c] = 0;
  for (let c = 0; c < SIZE - 1; c++) b[6][c] = 0;
  b[5][0] = 2;
  const { board, clears } = playGravityMove(b, piece('dot'), 6, 7);
  assert.equal(clears, 2);
  assert.ok(board.every(line => line.every(v => v === null)));
});

test('a single clear with nothing to fall is one clear', () => {
  const b = emptyBoard();
  for (let c = 1; c < SIZE; c++) b[7][c] = 0;
  const { board, clears } = playGravityMove(b, piece('dot'), 7, 0);
  assert.equal(clears, 1);
  assert.ok(board.every(line => line.every(v => v === null)));
});

test('chain clears score more for each step', () => {
  let s = scorePlacement(newScore(), 1, { rows: [7], cols: [] });
  assert.equal(s.streak, 1);
  const before = s.score;
  s = scoreChain(s, { rows: [7], cols: [] }, 2);
  assert.equal(s.gained, CLEAR_POINTS * SIZE * 1 * 1 * 2);
  assert.equal(s.score, before + s.gained);
  assert.equal(s.streak, 1); // chain doesn't raise the streak
  const s3 = scoreChain(s, { rows: [7], cols: [] }, 3, true);
  assert.equal(s3.gained, CLEAR_POINTS * SIZE * 3 + 500);
});
