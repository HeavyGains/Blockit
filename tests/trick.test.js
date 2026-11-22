import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PIECES, emptyBoard, canPlace, fitsAnywhere, dealTray, playMove, filledCount,
  canPlaceAll, firstMoveStats, isTrickSet, dealTrickTray, TRICK_MAX_SHARE,
} from '../js/logic.js';

const piece = id => PIECES.find(p => p.id === id);

// Small seeded random, so these tests always see the same games.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Row 0 is full except its last two cells; every other row has one lone hole,
// spread so that no row or column is full. Only a dot or a 2-bar fits now,
// but the 2-bar clears row 0 and opens it up.
function lockedBoard() {
  const b = emptyBoard().map(line => line.map(() => 0));
  b[0][6] = null; b[0][7] = null;
  [0, 2, 4, 1, 3, 5, 0].forEach((c, i) => { b[i + 1][c] = null; });
  return b;
}

test('canPlaceAll uses line clears to make room', () => {
  const b = lockedBoard();
  assert.ok(!fitsAnywhere(b, piece('bar3h')), '3-bar fits nowhere at first');
  assert.ok(canPlaceAll(b, [piece('bar3h'), piece('bar2h')]), '2-bar first, then the 3-bar');
  assert.ok(!canPlaceAll(b, [piece('bar3h'), piece('sq2')]), 'nothing opens room for these');
});

test('firstMoveStats counts the moves that still lead to a solution', () => {
  const b = lockedBoard();
  const withDot = firstMoveStats(b, [piece('bar3h'), piece('dot'), piece('bar3h')]);
  assert.equal(withDot.moves, 9); // 7 lone holes + 2 cells in row 0
  // A dot in row 0 leaves only 2 empty cells there, so the 3-bars never fit.
  // A dot in a lone hole clears that row, opening 8 cells for both 3-bars.
  assert.equal(withDot.winning, 7);
  const none = firstMoveStats(b, [piece('sq2'), piece('sq2'), piece('bar3h')]);
  assert.deepEqual(none, { moves: 0, winning: 0 });
});

test('a set is not a trick when every piece already fits, or when most moves work', () => {
  const b = lockedBoard();
  assert.ok(!isTrickSet(b, [piece('dot'), piece('dot'), piece('bar2h')]), 'all fit now');
  assert.ok(!isTrickSet(b, [piece('bar3h'), piece('dot'), piece('bar3h')]), '7 of 9 moves work');
  assert.ok(!isTrickSet(b, [piece('sq2'), piece('sq2'), piece('bar3h')]), 'no solution');
});

test('a 3-bar, a 2x2 square and a dot on the locked board is a trick set: 1 of 9 first moves works', () => {
  const b = lockedBoard();
  const set = [piece('bar3h'), piece('sq2'), piece('dot')];
  assert.deepEqual(firstMoveStats(b, set), { moves: 9, winning: 1 });
  assert.ok(isTrickSet(b, set));
});

test('no trick sets on a nearly empty board', () => {
  assert.equal(dealTrickTray(Math.random, emptyBoard()), null);
});

test('trick sets from real games: a piece fits nowhere, yet all 3 can be placed, by few first moves', () => {
  const rng = seeded(7);
  let checked = 0;
  for (let g = 0; g < 10 && checked < 8; g++) {
    let board = emptyBoard();
    for (let turn = 0; turn < 30; turn++) {
      if (filledCount(board) >= 16) {
        const tray = dealTrickTray(rng, board);
        if (tray) {
          checked++;
          assert.equal(tray.length, 3);
          assert.ok(tray.some(p => !fitsAnywhere(board, p)));
          assert.ok(canPlaceAll(board, tray));
          const { moves, winning } = firstMoveStats(board, tray);
          assert.ok(winning > 0 && winning / moves <= TRICK_MAX_SHARE);
          assert.ok(isTrickSet(board, tray));
        }
      }
      // Play a random normal set to move the game on.
      for (const p of dealTray(rng, board)) {
        const spots = [];
        for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(board, p, r, c)) spots.push([r, c]);
        if (!spots.length) break;
        const [r, c] = spots[Math.floor(rng() * spots.length)];
        board = playMove(board, p, r, c);
      }
    }
  }
  assert.ok(checked >= 3, `found ${checked} trick sets`);
});
