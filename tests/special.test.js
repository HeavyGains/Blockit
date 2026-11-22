import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PIECES, emptyBoard, place, fullLines, resolveClear, addSpecials,
  specialPoints, colorOf, specialOf, applyGravity, STAR_BONUS, CLEAR_POINTS,
} from '../js/logic.js';

const piece = id => PIECES.find(p => p.id === id);
const fullRow = (b, r) => { for (let c = 0; c < SIZE; c++) b[r][c] = b[r][c] ?? 0; return b; };

test('a placed special cell is stored with its color and kind', () => {
  const p = { ...piece('bar2h'), special: { i: 1, s: 'bomb' } };
  const b = place(emptyBoard(), p, 0, 0, 3);
  assert.equal(b[0][0], 3);
  assert.deepEqual(b[0][1], { c: 3, s: 'bomb' });
  assert.equal(colorOf(b[0][1]), 3);
  assert.equal(specialOf(b[0][1]), 'bomb');
  assert.equal(specialOf(b[0][0]), null);
});

test('a plain clear works as before', () => {
  const b = fullRow(emptyBoard(), 7);
  b[6][0] = 1;
  const res = resolveClear(b, fullLines(b));
  assert.ok(res.board[7].every(v => v === null));
  assert.equal(res.board[6][0], 1);
  assert.equal(res.blast, 0);
});

test('a bomb in a cleared line also clears its 3x3', () => {
  const b = emptyBoard();
  b[7][3] = { c: 0, s: 'bomb' };
  fullRow(b, 7);
  b[6][2] = 1; b[6][3] = 1; b[6][4] = 1; b[6][5] = 1; b[5][3] = 1;
  const res = resolveClear(b, fullLines(b));
  assert.equal(res.board[6][2], null);
  assert.equal(res.board[6][3], null);
  assert.equal(res.board[6][4], null);
  assert.equal(res.board[6][5], 1); // outside the blast
  assert.equal(res.board[5][3], 1); // outside the blast
  assert.equal(res.blast, 3);
});

test('a bomb sets off a bomb in its blast', () => {
  const b = emptyBoard();
  b[7][0] = { c: 0, s: 'bomb' };
  fullRow(b, 7);
  b[6][1] = { c: 2, s: 'bomb' };
  b[5][2] = 4;
  const res = resolveClear(b, fullLines(b));
  assert.equal(res.board[5][2], null);
  assert.equal(res.blast, 2);
});

test('a stone cracks on the first clear and breaks on the second', () => {
  const b = emptyBoard();
  b[7][4] = { c: 5, s: 'stone' };
  fullRow(b, 7);
  let res = resolveClear(b, fullLines(b));
  assert.deepEqual(res.board[7][4], { c: 5, s: 'crack' });
  assert.equal(res.cracked, 1);
  const b2 = fullRow(res.board, 7);
  res = resolveClear(b2, fullLines(b2));
  assert.ok(res.board[7].every(v => v === null));
});

test('stars score a bonus; blast cells score like cleared cells', () => {
  const b = emptyBoard();
  b[7][1] = { c: 0, s: 'star' };
  fullRow(b, 7);
  const res = resolveClear(b, fullLines(b));
  assert.equal(res.stars, 1);
  assert.equal(specialPoints(res, 2), STAR_BONUS);
  assert.equal(specialPoints({ blast: 3, stars: 0 }, 2), 3 * CLEAR_POINTS * 2);
});

test('addSpecials gives some pieces one special cell', () => {
  const tray = [piece('dot'), piece('sq2'), piece('bar3h')];
  const all = addSpecials(tray, () => 0, 1); // chance 1: every piece
  assert.ok(all.every(p => p.special && p.special.i === 0 && p.special.s === 'bomb'));
  const none = addSpecials(tray, () => 0.99);
  assert.ok(none.every(p => !p.special));
  assert.ok(!tray[0].special); // originals untouched
});

test('special cells fall with gravity', () => {
  const b = emptyBoard();
  b[2][0] = { c: 1, s: 'star' };
  const { board } = applyGravity(b);
  assert.deepEqual(board[7][0], { c: 1, s: 'star' });
});
