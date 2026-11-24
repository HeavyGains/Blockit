import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, seededRng, dailyTray, shareText, emptyBoard, SIZE, duelId, duelName, dealTray } from '../js/logic.js';

const ids = tray => tray.map(p => `${p.id}:${p.color}:${p.special ? `${p.special.s}${p.special.i}` : ''}`).join(' ');

test('dayKey is the local date', () => {
  assert.equal(dayKey(new Date(2026, 10, 22, 23, 59)), '2026-11-22');
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('seeded rng repeats for the same seed and differs for another', () => {
  const a = seededRng('x'), b = seededRng('x'), c = seededRng('y');
  const ra = [a(), a(), a()], rb = [b(), b(), b()], rc = [c(), c(), c()];
  assert.deepEqual(ra, rb);
  assert.notDeepEqual(ra, rc);
  assert.ok(ra.every(v => v >= 0 && v < 1));
});

test('everyone gets the same sets on the same day, whatever their board', () => {
  const day = '2026-11-22';
  const busy = emptyBoard();
  for (let c = 0; c < SIZE; c += 2) busy[4][c] = 0; // a different, still roomy board
  for (let n = 0; n < 5; n++) {
    assert.equal(ids(dailyTray(day, n)), ids(dailyTray(day, n, busy)));
  }
  assert.notEqual(ids(dailyTray(day, 0)), ids(dailyTray('2026-11-23', 0)));
  assert.notEqual(ids(dailyTray(day, 0)), ids(dailyTray(day, 1)));
});

test('share text', () => {
  assert.equal(shareText('2026-11-22', 4210, 'Jason'), 'Blockit Daily Duel 11/22: 4,210 (Jason)');
});

test('Classic duel keeps its original pieces', () => {
  const day = '2026-11-24';
  for (let n = 0; n < 3; n++) {
    assert.equal(ids(dailyTray(day, n)), ids(dealTray(seededRng(`blockit-${day}-${n}`))));
    assert.equal(ids(dailyTray(day, n, null, 'classic')), ids(dailyTray(day, n)));
  }
});

test('each game has its own repeatable duel', () => {
  const day = '2026-11-24';
  const variants = ['classic', 'gravity', 'classic-special', 'gravity-special'];
  const firstSets = variants.map(v => ids(dailyTray(day, 0, null, v)));
  assert.equal(new Set(firstSets).size, 4);
  for (const v of variants) assert.equal(ids(dailyTray(day, 2, null, v)), ids(dailyTray(day, 2, null, v)));
});

test('specials duels deal the same specials to everyone', () => {
  const day = '2026-11-24';
  let seen = 0;
  for (let n = 0; n < 30; n++) {
    const a = dailyTray(day, n, null, 'gravity-special');
    assert.equal(ids(a), ids(dailyTray(day, n, null, 'gravity-special')));
    seen += a.filter(p => p.special).length;
    assert.ok(dailyTray(day, n, null, 'gravity').every(p => !p.special));
  }
  assert.ok(seen > 0);
});

test('duel ids and names', () => {
  assert.equal(duelId('classic'), 'daily');
  assert.equal(duelId('gravity-special'), 'daily-gravity-special');
  assert.equal(duelName('classic'), 'Daily Duel');
  assert.equal(duelName('gravity-special'), 'Gravity Duel ✦');
  assert.equal(shareText('2026-11-22', 50, 'Amy', 'gravity'), 'Blockit Gravity Duel 11/22: 50 (Amy)');
});
