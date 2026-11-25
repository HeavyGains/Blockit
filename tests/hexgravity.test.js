import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEX_RADIUS, HEX_CELLS, emptyHexBoard, getCell, onBoard, lineCells,
  applyHexGravity, hexFallStep, playHexGravityMove, HEX_PIECES,
} from '../js/hex.js';

const R = HEX_RADIUS;
const set = (b, q, r, v) => { b[r + R][q + R] = v; };
const count = b => HEX_CELLS.filter(([q, r]) => getCell(b, q, r) !== null).length;
const anchor = { c: 0, s: 'anchor' };

test('a lone block falls to the bottom row, zig-zagging near its column', () => {
  const b = emptyHexBoard();
  set(b, R / 2, -R, 7); // top middle
  const { board, paths, ticks } = applyHexGravity(b);
  const landed = HEX_CELLS.filter(([q, r]) => getCell(board, q, r) === 7);
  assert.equal(landed.length, 1);
  const [q, r] = landed[0];
  assert.equal(r, R); // bottom row
  assert.ok(Math.abs(q + r / 2) <= 0.5); // ended up right under where it started
  assert.equal(ticks, 2 * R);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].from, [R / 2, -R]);
  assert.deepEqual(paths[0].path.at(-1), [q, r]);
});

test('a block on the slanted lower edge stays put (the edge holds it)', () => {
  const b = emptyHexBoard();
  set(b, -R, 0, 1); // far left corner: down-left is off the board
  assert.equal(hexFallStep(b, -R, 0), null);
  assert.equal(getCell(applyHexGravity(b).board, -R, 0), 1);
});

test('a block rests when both cells below are filled', () => {
  const b = emptyHexBoard();
  for (const [q, r] of lineCells('r', R)) set(b, q, r, 1);
  set(b, 0, R - 1, 2);
  assert.equal(hexFallStep(b, 0, R - 1), null);
  assert.equal(getCell(applyHexGravity(b).board, 0, R - 1), 2);
});

test('a block with something under just one side stays put', () => {
  const b = emptyHexBoard();
  set(b, 0, 2, 1);  // down-right of (0,1) is filled, down-left is empty
  set(b, 0, 1, 2);
  assert.equal(hexFallStep(b, 0, 1), null);
});

test('a block with nothing under it falls into the gap', () => {
  const b = emptyHexBoard();
  set(b, 0, 1, 2); // r = 1 is odd: goes down-right first
  assert.deepEqual(hexFallStep(b, 0, 1), [0, 2]);
});

test('blocks settle without being lost, and the board stays mostly in place', () => {
  const b = emptyHexBoard();
  const top = HEX_CELLS.filter(([, r]) => r <= -2);
  top.forEach(([q, r]) => set(b, q, r, 3));
  const { board, paths } = applyHexGravity(b);
  assert.equal(count(board), top.length);
  assert.ok(HEX_CELLS.every(([q, r]) => hexFallStep(board, q, r) === null));
  // A solid clump only drops as a whole: its bottom row falls, and the rest follows.
  assert.ok(paths.length > 0);
  assert.ok(lineCells('r', R).some(([q, r]) => getCell(board, q, r) === null));
});

test('an anchor never moves and holds the blocks touching it', () => {
  const b = emptyHexBoard();
  set(b, 0, 0, anchor);
  set(b, 1, -1, 4); // touching the anchor (up-right)
  set(b, 0, -3, 5); // not touching
  const { board } = applyHexGravity(b);
  assert.deepEqual(getCell(board, 0, 0), anchor);
  assert.equal(getCell(board, 1, -1), 4);
  assert.equal(getCell(board, 0, -3), null);
});

test('a block that lands next to an anchor sticks there', () => {
  const b = emptyHexBoard();
  set(b, 0, 2, anchor);
  set(b, 2, -2, 6); // zig-zags straight down onto the anchor's top
  const { board } = applyHexGravity(b);
  const at = HEX_CELLS.find(([q, r]) => getCell(board, q, r) === 6);
  assert.ok(at[1] < 2);
  assert.ok(onBoard(...at));
});

test('Hex Gravity move: a clear lets blocks fall and can chain', () => {
  const b = emptyHexBoard();
  const bottom = lineCells('r', R);
  // bottom row full except its last cell, which the 1-cell piece fills
  bottom.slice(0, -1).forEach(([q, r]) => set(b, q, r, 1));
  set(b, R / 2, -R, 2); // top middle: falls straight down once the bottom row clears
  const dot = HEX_PIECES.find(p => p.cells.length === 1);
  const [q, r] = bottom.at(-1);
  const { board, clears } = playHexGravityMove(b, dot, q, r);
  assert.equal(clears, 1);
  assert.equal(count(board), 1);
  assert.equal(HEX_CELLS.find(([x, y]) => getCell(board, x, y) === 2)[1], R);
});

test('Hex Gravity chain points grow with the chain step', async () => {
  const { scoreHexChain, hexFullLines } = await import('../js/hex.js');
  const b = emptyHexBoard();
  for (const [q, r] of lineCells('r', R)) set(b, q, r, 1);
  const lines = hexFullLines(b);
  const st = { score: 100, streak: 1, miss: 0 };
  const two = scoreHexChain(st, lines, 2), three = scoreHexChain(st, lines, 3);
  assert.equal(two.lines, 1);
  assert.equal(three.gained, two.gained * 3 / 2);
  assert.equal(scoreHexChain(st, lines, 2, true).bonus > 0, true);
});

test('Hex Gravity has its own Daily Duel pieces and name', async () => {
  const { dailyHexTray } = await import('../js/hex.js');
  const { duelName, duelId } = await import('../js/logic.js');
  const ids = t => t.map(p => p.id).join();
  const hexDays = [0, 1, 2, 3].map(n => ids(dailyHexTray('2026-11-25', n)));
  const gravDays = [0, 1, 2, 3].map(n => ids(dailyHexTray('2026-11-25', n, null, false, 'hexgravity')));
  assert.notDeepEqual(gravDays, hexDays);
  assert.deepEqual(ids(dailyHexTray('2026-11-25', 0)), ids(dailyHexTray('2026-11-25', 0, null, false, 'hex')));
  assert.equal(duelName('hexgravity'), 'Hex Gravity Duel');
  assert.equal(duelName('hexgravity-special'), 'Hex Gravity Duel ✦');
  assert.equal(duelName('hex'), 'Hex Duel');
  assert.equal(duelId('hexgravity'), 'daily-hexgravity');
});
