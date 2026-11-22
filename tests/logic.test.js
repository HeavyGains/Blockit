import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PIECES, emptyBoard, canPlace, place, fullLines, clearLines,
  fitsAnywhere, isGameOver, dealTray, trayEmpty, pieceSize,
} from '../js/logic.js';

const piece = id => PIECES.find(p => p.id === id);

// Fill every cell of row r except the listed columns.
function fillRow(board, r, except = []) {
  for (let c = 0; c < SIZE; c++) if (!except.includes(c)) board[r][c] = 0;
  return board;
}

test('board is 8x8 and empty', () => {
  const b = emptyBoard();
  assert.equal(b.length, 8);
  assert.ok(b.every(line => line.length === 8 && line.every(v => v === null)));
});

test('every piece starts at its top-left and has no duplicate cells', () => {
  for (const p of PIECES) {
    assert.ok(p.cells.length > 0, p.id);
    assert.ok(p.cells.some(([r]) => r === 0), `${p.id} touches top`);
    assert.ok(p.cells.some(([, c]) => c === 0), `${p.id} touches left`);
    const keys = new Set(p.cells.map(([r, c]) => `${r},${c}`));
    assert.equal(keys.size, p.cells.length, p.id);
    const { rows, cols } = pieceSize(p);
    assert.ok(rows <= 5 && cols <= 5, p.id);
  }
});

test('a piece can go on empty cells but not off the edge', () => {
  const b = emptyBoard();
  const bar = piece('bar3h');
  assert.ok(canPlace(b, bar, 0, 0));
  assert.ok(canPlace(b, bar, 7, 5));
  assert.ok(!canPlace(b, bar, 7, 6)); // would stick out on the right
  assert.ok(!canPlace(b, bar, 8, 0)); // below the board
  assert.ok(!canPlace(b, bar, 0, -1));
});

test('a piece cannot overlap a filled cell', () => {
  const b = place(emptyBoard(), piece('dot'), 4, 4, 1);
  assert.ok(!canPlace(b, piece('bar3h'), 4, 2));
  assert.ok(canPlace(b, piece('bar3h'), 4, 5));
});

test('place does not change the old board', () => {
  const b = emptyBoard();
  const after = place(b, piece('sq2'), 0, 0, 3);
  assert.equal(b[0][0], null);
  assert.equal(after[0][0], 3);
  assert.equal(after[1][1], 3);
});

test('a full row is found and cleared', () => {
  const b = fillRow(emptyBoard(), 2);
  const lines = fullLines(b);
  assert.deepEqual(lines, { rows: [2], cols: [] });
  const cleared = clearLines(b, lines);
  assert.ok(cleared[2].every(v => v === null));
});

test('a full column is found and cleared', () => {
  const b = emptyBoard();
  for (let r = 0; r < SIZE; r++) b[r][7] = 2;
  b[0][0] = 1; // unrelated block stays
  const lines = fullLines(b);
  assert.deepEqual(lines, { rows: [], cols: [7] });
  const cleared = clearLines(b, lines);
  assert.ok(cleared.every(line => line[7] === null));
  assert.equal(cleared[0][0], 1);
});

test('a row and a column clear together, sharing a cell', () => {
  const b = fillRow(emptyBoard(), 4);
  for (let r = 0; r < SIZE; r++) b[r][4] = 0;
  const lines = fullLines(b);
  assert.deepEqual(lines, { rows: [4], cols: [4] });
  const cleared = clearLines(b, lines);
  assert.ok(cleared.every(line => line.every(v => v === null)));
});

test('a filled 3x3 box does not clear', () => {
  const b = place(emptyBoard(), piece('sq3'), 0, 0, 0);
  assert.deepEqual(fullLines(b), { rows: [], cols: [] });
});

test('placing the last gap of a row completes it', () => {
  const b = fillRow(emptyBoard(), 7, [3, 4]);
  assert.deepEqual(fullLines(b).rows, []);
  const after = place(b, piece('bar2h'), 7, 3, 1);
  assert.deepEqual(fullLines(after).rows, [7]);
});

test('game over only when no piece left in the tray fits', () => {
  // Checkerboard: every empty cell is alone, so only the dot fits.
  const b = emptyBoard().map((line, r) => line.map((_, c) => ((r + c) % 2 ? 0 : null)));
  assert.ok(fitsAnywhere(b, piece('dot')));
  assert.ok(!fitsAnywhere(b, piece('bar2h')));
  assert.ok(isGameOver(b, [piece('bar2h'), null, piece('sq2')]));
  assert.ok(!isGameOver(b, [piece('bar2h'), piece('dot'), null]));
});

test('not game over with an empty tray (a new set is about to be dealt)', () => {
  const full = emptyBoard().map(line => line.map(() => 0));
  assert.ok(!isGameOver(full, [null, null, null]));
});

test('deal gives 3 pieces with colors, and the tray empties as they are placed', () => {
  let i = 0;
  const seq = [0, 0.5, 0.99, 0.1, 0.3, 0.7];
  const tray = dealTray(() => seq[i++ % seq.length]);
  assert.equal(tray.length, 3);
  for (const p of tray) {
    assert.ok(PIECES.some(q => q.id === p.id));
    assert.ok(Number.isInteger(p.color));
  }
  assert.ok(!trayEmpty(tray));
  assert.ok(!trayEmpty([null, tray[1], null]));
  assert.ok(trayEmpty([null, null, null]));
});
