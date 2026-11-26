import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyBoard, dealTray, squareRules, playMove, gravityMove, canPlaceAllBy, isTrickSetBy, fitsBy,
  dealTrickTray, seededRng,
} from '../js/logic.js';
import { emptyHexBoard, dealHexTray, hexRules, hexMove, hexGravityMove, dealHexTrickTray } from '../js/hex.js';

// Each mode: its rules, an empty board, a fair deal and a trick deal.
const MODES = {
  classic: { rules: squareRules(playMove), empty: emptyBoard, deal: (r, b) => dealTray(r, b, playMove), trick: (r, b) => dealTrickTray(r, b, undefined, playMove) },
  gravity: { rules: squareRules(gravityMove), empty: emptyBoard, deal: (r, b) => dealTray(r, b, gravityMove), trick: (r, b) => dealTrickTray(r, b, undefined, gravityMove) },
  hex: { rules: hexRules(hexMove), empty: emptyHexBoard, deal: (r, b) => dealHexTray(r, b, hexMove), trick: (r, b) => dealHexTrickTray(r, b, hexMove) },
  hexgravity: { rules: hexRules(hexGravityMove), empty: emptyHexBoard, deal: (r, b) => dealHexTray(r, b, hexGravityMove), trick: (r, b) => dealHexTrickTray(r, b, hexGravityMove) },
};

// Plays a seeded game, calling look(board) before each set, and places each
// piece at a seeded random spot (a careless player). Stops when stuck.
function play(m, seed, sets, look) {
  const rng = seededRng(seed);
  let board = m.empty();
  for (let s = 0; s < sets; s++) {
    const tray = look(board, rng) ?? m.deal(rng, board);
    for (const p of tray) {
      const open = m.rules.spots(p).filter(([a, b]) => m.rules.canPlace(board, p, a, b));
      if (!open.length) return;
      const [a, b] = open[Math.floor(rng() * open.length)];
      board = m.rules.move(board, p, a, b);
    }
  }
}

for (const [name, m] of Object.entries(MODES)) {
  test(`${name}: every dealt set can be placed whole when the board allows it`, () => {
    let checked = 0;
    for (let g = 0; g < 8; g++) {
      play(m, `fair-${name}-${g}`, 30, (board, rng) => {
        const tray = m.deal(rng, board);
        assert.ok(canPlaceAllBy(m.rules, board, tray) || tray.some(p => fitsBy(m.rules, board, p)));
        if (canPlaceAllBy(m.rules, board, tray)) checked++;
        return tray;
      });
    }
    assert.ok(checked >= 10);
  });

  test(`${name}: trick sets turn up, and need a clear before the last piece fits`, () => {
    let found = 0;
    for (let g = 0; g < 6 && found < 2; g++) {
      play(m, `trick-${name}-${g}`, 30, (board, rng) => {
        const tray = m.trick(rng, board);
        if (!tray) return null;
        found++;
        assert.ok(isTrickSetBy(m.rules, board, tray));
        assert.ok(tray.some(p => !fitsBy(m.rules, board, p)), 'one piece fits nowhere at first');
        assert.ok(canPlaceAllBy(m.rules, board, tray), 'but there is a way');
        return tray;
      });
    }
    assert.ok(found >= 1, 'found a trick set');
  });
}
