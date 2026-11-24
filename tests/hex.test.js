import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEX_RADIUS, HEX_CELLS, AXES, lineCells, onBoard, emptyHexBoard, getCell,
  HEX_SHAPES, HEX_PIECES, canPlaceHex, placeHex, hexFullLines, hexLineCount,
  hexClearedCells, clearHexLines, fitsAnywhereHex, isHexGameOver, previewHexLines,
  playHexMove, dealHexTray, scoreHexPlacement, hexBoardEmpty, dailyHexTray,
} from '../js/hex.js';
import { seededRng, newScore, TRAY_SIZE, CLEAR_POINTS, WIPE_BONUS, duelId, duelName, shareText } from '../js/logic.js';

const piece = id => HEX_PIECES.find(p => p.id === id);
const fill = (board, cells, v = 1) => {
  const b = board.map(l => l.slice());
  for (const [q, r] of cells) b[r + HEX_RADIUS][q + HEX_RADIUS] = v;
  return b;
};
const near = ([q, r], [a, b]) => {
  const dq = a - q, dr = b - r;
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].some(([x, y]) => x === dq && y === dr);
};

test('board is a hexagon of 61 cells, 5 per side', () => {
  assert.equal(HEX_RADIUS, 4);
  assert.equal(HEX_CELLS.length, 61);
  assert.ok(onBoard(0, 0) && onBoard(4, -4) && onBoard(-4, 0));
  assert.ok(!onBoard(4, 1) && !onBoard(-3, -2) && !onBoard(5, 0));
});

test('each direction has 9 lines, 5 to 9 cells long, covering the board once', () => {
  for (const axis of AXES) {
    const lens = [];
    let total = 0;
    for (let i = -HEX_RADIUS; i <= HEX_RADIUS; i++) {
      const n = lineCells(axis, i).length;
      lens.push(n); total += n;
    }
    assert.deepEqual(lens, [5, 6, 7, 8, 9, 8, 7, 6, 5], axis);
    assert.equal(total, 61);
  }
});

test('every piece is connected, starts at 0,0 corner, and no two pieces match', () => {
  const keys = new Set();
  for (const p of HEX_PIECES) {
    assert.equal(Math.min(...p.cells.map(c => c[0])), 0, p.id);
    assert.equal(Math.min(...p.cells.map(c => c[1])), 0, p.id);
    const seen = new Set([0]);
    for (let grew = true; grew;) {
      grew = false;
      p.cells.forEach((c, i) => {
        if (!seen.has(i) && [...seen].some(j => near(p.cells[j], c))) { seen.add(i); grew = true; }
      });
    }
    assert.equal(seen.size, p.cells.length, `${p.id} connected`);
    const key = JSON.stringify(p.cells);
    assert.ok(!keys.has(key), `${p.id} is a duplicate`);
    keys.add(key);
  }
});

test('shapes have the expected number of turns', () => {
  const turns = Object.fromEntries(HEX_SHAPES.map(s => [s.shape, s.pieces.length]));
  assert.equal(turns.dot, 1);
  assert.equal(turns.bar3, 3);
  assert.equal(turns.tri, 2);
  assert.equal(turns.diamond, 3);
  assert.equal(turns.hook, 6);
  for (const s of HEX_SHAPES) assert.ok(s.pieces.every(p => p.cells.length <= 4));
});

test('pieces fit only on empty cells inside the hexagon', () => {
  const b = emptyHexBoard();
  const bar = piece('bar3-0');
  assert.ok(canPlaceHex(b, bar, -2, 0));
  assert.ok(!canPlaceHex(b, bar, 3, 0), 'runs off the right edge');
  assert.ok(!canPlaceHex(b, bar, -4, -2), 'starts outside the corner');
  const placed = placeHex(b, bar, -2, 0, 3);
  assert.equal(getCell(placed, -1, 0), 3);
  assert.equal(getCell(b, -1, 0), null, 'original board untouched');
  assert.ok(!canPlaceHex(placed, piece('dot-0'), 0, 0));
});

test('filling a line in each of the 3 directions clears it', () => {
  for (const axis of AXES) {
    const line = lineCells(axis, 1);
    const b = fill(emptyHexBoard(), line.slice(1));
    assert.equal(hexLineCount(hexFullLines(b)), 0);
    const [q, r] = line[0];
    const preview = previewHexLines(b, piece('dot-0'), q, r);
    assert.deepEqual(preview[axis], [1], axis);
    const move = playHexMove(b, { ...piece('dot-0'), color: 2 }, q, r);
    assert.equal(hexLineCount(move.lines), 1);
    assert.ok(hexBoardEmpty(move.board));
    assert.ok(move.wiped);
  }
});

test('crossing lines clear together and share their crossing cell', () => {
  const lines = { q: [0], r: [0], s: [0] };
  assert.equal(hexClearedCells(lines).length, 9 * 3 - 2);
  const b = fill(emptyHexBoard(), HEX_CELLS);
  assert.deepEqual(hexFullLines(b).q.length, 9);
  const cleared = clearHexLines(b, lines);
  assert.equal(getCell(cleared, 0, 0), null);
  assert.equal(getCell(cleared, 1, 1), 1);
});

test('game over when no tray piece fits, and deals reroll to stay fair', () => {
  // Fill everything except one cell: only a dot fits.
  const b = fill(emptyHexBoard(), HEX_CELLS.filter(([q, r]) => q || r));
  assert.ok(fitsAnywhereHex(b, piece('dot-0')));
  assert.ok(!fitsAnywhereHex(b, piece('bar2-0')));
  assert.ok(isHexGameOver(b, [piece('bar2-0'), null, piece('tri-0')]));
  assert.ok(!isHexGameOver(b, [piece('bar2-0'), piece('dot-0'), null]));
  assert.ok(!isHexGameOver(b, [null, null, null]));
  const tray = dealHexTray(seededRng('x'), b);
  assert.equal(tray.length, TRAY_SIZE);
  assert.ok(!isHexGameOver(b, tray), 'rerolled until a dot came up');
});

test('seeded deals repeat, so Daily Duel can use them later', () => {
  const ids = t => t.map(p => `${p.id}:${p.color}`).join(' ');
  assert.equal(ids(dealHexTray(seededRng('d'))), ids(dealHexTray(seededRng('d'))));
});

test('scoring matches Classic rules, counting hex line cells', () => {
  const one = { q: [0], r: [], s: [] };
  let s = scoreHexPlacement(newScore(), 1, one);
  assert.equal(s.gained, 1 + CLEAR_POINTS * 9);
  assert.equal(s.streak, 1);
  s = scoreHexPlacement(s, 2, { q: [4], r: [-4], s: [] }, true);
  // two 5-cell edge lines sharing a corner = 9 cells, x2 lines, x2 streak
  assert.equal(s.gained, 2 + CLEAR_POINTS * 9 * 2 * 2 + WIPE_BONUS);
  const miss = scoreHexPlacement(s, 3, { q: [], r: [], s: [] });
  assert.equal(miss.gained, 3);
  assert.equal(miss.streak, 2);
});

test('Hex Daily Duel: same sets for everyone each day, its own name and scores', () => {
  const ids = t => t.map(p => `${p.id}:${p.color}`).join(' ');
  assert.equal(ids(dailyHexTray('2026-11-24', 0)), ids(dailyHexTray('2026-11-24', 0)));
  assert.notEqual(ids(dailyHexTray('2026-11-24', 0)), ids(dailyHexTray('2026-11-24', 1)));
  assert.notEqual(ids(dailyHexTray('2026-11-24', 0)), ids(dailyHexTray('2026-11-25', 0)));
  assert.ok(dailyHexTray('2026-11-24', 0).every(p => HEX_PIECES.some(h => h.id === p.id)));
  assert.equal(duelId('hex'), 'daily-hex');
  assert.equal(duelName('hex'), 'Hex Duel');
  assert.equal(shareText('2026-11-24', 1234, 'Jason', 'hex'), 'Blockit Hex Duel 11/24: 1,234 (Jason)');
});

test('hex specials: a bomb clears its 6 neighbours, a stone cracks, a star counts', async () => {
  const { resolveHexClear, hexNeighbors } = await import('../js/hex.js');
  assert.equal(hexNeighbors(0, 0).length, 6);
  assert.equal(hexNeighbors(4, -4).length, 3, 'a corner has 3');
  const line = lineCells('r', 0); // the middle row
  let b = fill(emptyHexBoard(), line);
  b[HEX_RADIUS][HEX_RADIUS] = { c: 1, s: 'bomb' };   // bomb at 0,0
  b[HEX_RADIUS - 1][HEX_RADIUS] = 2;                 // 0,-1: a neighbour above
  b[HEX_RADIUS - 1][HEX_RADIUS + 1] = { c: 3, s: 'bomb' }; // 1,-1: a bomb neighbour, chains
  b[HEX_RADIUS - 2][HEX_RADIUS + 1] = 4;             // 1,-2: next to the second bomb
  b[HEX_RADIUS - 3][HEX_RADIUS] = 5;                 // 0,-3: too far, stays
  b[HEX_RADIUS][HEX_RADIUS + 3] = { c: 1, s: 'stone' };
  b[HEX_RADIUS][HEX_RADIUS - 3] = { c: 1, s: 'star' };
  const res = resolveHexClear(b, { q: [], r: [0], s: [] });
  assert.equal(getCell(res.board, 0, -1), null);
  assert.equal(getCell(res.board, 1, -1), null);
  assert.equal(getCell(res.board, 1, -2), null, 'second bomb went off');
  assert.equal(getCell(res.board, 0, -3), 5);
  assert.deepEqual(getCell(res.board, 3, 0), { c: 1, s: 'crack' });
  assert.equal(res.blast, 3);
  assert.equal(res.stars, 1);
  assert.equal(res.cracked, 1);
  assert.equal(res.bombs.length, 2);
  assert.equal(res.lineCells, 9);
});

test('Hex Duel with specials has its own sets, with specials', () => {
  const plain = dailyHexTray('2026-11-24', 0);
  const sp = Array.from({ length: 8 }, (_, n) => dailyHexTray('2026-11-24', n, null, true));
  assert.equal(JSON.stringify(dailyHexTray('2026-11-24', 0, null, true)), JSON.stringify(sp[0]));
  assert.ok(sp.flat().some(p => p.special), 'some special cells across the day');
  assert.ok(!plain.some(p => p.special));
});
