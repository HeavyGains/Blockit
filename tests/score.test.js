import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyBoard, newScore, scorePlacement, clearedCellCount, boardEmpty,
} from '../js/logic.js';

const none = { rows: [], cols: [] };
const oneRow = { rows: [3], cols: [] };

test('placing without a clear scores 1 per cell', () => {
  const s = scorePlacement(newScore(), 4, none);
  assert.equal(s.score, 4);
  assert.equal(s.gained, 4);
  assert.equal(s.streak, 0);
});

test('one line clear scores 10 per cleared cell', () => {
  const s = scorePlacement(newScore(), 3, oneRow);
  assert.equal(s.clear, 90);
  assert.equal(s.score, 93);
  assert.equal(s.streak, 1);
});

test('cleared cells count a crossing cell once', () => {
  assert.equal(clearedCellCount(oneRow), 9);
  assert.equal(clearedCellCount({ rows: [1, 2], cols: [] }), 18);
  assert.equal(clearedCellCount({ rows: [4], cols: [4] }), 17);
});

test('multi-clear multiplies by the number of lines', () => {
  const two = scorePlacement(newScore(), 2, { rows: [1, 2], cols: [] });
  assert.equal(two.clear, 18 * 10 * 2);
  const cross = scorePlacement(newScore(), 5, { rows: [4], cols: [4] });
  assert.equal(cross.clear, 17 * 10 * 2);
});

test('streak grows x1, x2, x3 on back-to-back clears', () => {
  let s = newScore();
  s = scorePlacement(s, 1, oneRow);
  assert.equal(s.clear, 90);
  s = scorePlacement(s, 1, oneRow);
  assert.equal(s.streak, 2);
  assert.equal(s.clear, 180);
  s = scorePlacement(s, 1, oneRow);
  assert.equal(s.clear, 270);
});

test('streak survives 2 misses and resets on the 3rd', () => {
  let s = scorePlacement(newScore(), 1, oneRow);
  s = scorePlacement(s, 1, none);
  s = scorePlacement(s, 1, none);
  assert.equal(s.streak, 1);
  s = scorePlacement(s, 1, oneRow);
  assert.equal(s.streak, 2, 'clear after 2 misses keeps the streak');
  s = scorePlacement(s, 1, none);
  s = scorePlacement(s, 1, none);
  s = scorePlacement(s, 1, none);
  assert.equal(s.streak, 0);
  s = scorePlacement(s, 1, oneRow);
  assert.equal(s.streak, 1);
  assert.equal(s.clear, 90);
});

test('a clear that empties the board adds 500', () => {
  const s = scorePlacement(newScore(), 3, oneRow, true);
  assert.equal(s.bonus, 500);
  assert.equal(s.score, 3 + 90 + 500);
  const noClear = scorePlacement(newScore(), 1, none, true);
  assert.equal(noClear.bonus, 0);
});

test('boardEmpty', () => {
  const b = emptyBoard();
  assert.ok(boardEmpty(b));
  b[8][8] = 2;
  assert.ok(!boardEmpty(b));
});
