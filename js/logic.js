// Game rules, with no DOM, so they can be tested with node --test.
// A board is SIZE rows of SIZE cells; a cell is null (empty) or a color index.
// A piece is { id, cells: [[row, col], ...] } with its top-left at 0,0. No rotation.

export const SIZE = 8;
export const TRAY_SIZE = 3;
export const COLORS = 6; // color indexes 0..COLORS-1, picked in the CSS

// Each shape is drawn as rows of text: # is a block. Rotated versions are
// listed as their own pieces, since pieces never rotate in play.
const SHAPES = {
  dot: ['#'],
  bar2h: ['##'],
  bar2v: ['#', '#'],
  bar3h: ['###'],
  bar3v: ['#', '#', '#'],
  bar4h: ['####'],
  bar4v: ['#', '#', '#', '#'],
  bar5h: ['#####'],
  bar5v: ['#', '#', '#', '#', '#'],
  sq2: ['##', '##'],
  sq3: ['###', '###', '###'],
  corner1: ['##', '#.'],
  corner2: ['##', '.#'],
  corner3: ['#.', '##'],
  corner4: ['.#', '##'],
  l1: ['#.', '#.', '##'],
  l2: ['###', '#..'],
  l3: ['##', '.#', '.#'],
  l4: ['..#', '###'],
  j1: ['.#', '.#', '##'],
  j2: ['#..', '###'],
  j3: ['##', '#.', '#.'],
  j4: ['###', '..#'],
  t1: ['###', '.#.'],
  t2: ['.#.', '###'],
  t3: ['#.', '##', '#.'],
  t4: ['.#', '##', '.#'],
  s1: ['.##', '##.'],
  s2: ['#.', '##', '.#'],
  z1: ['##.', '.##'],
  z2: ['.#', '##', '#.'],
  bigL1: ['#..', '#..', '###'],
  bigL2: ['###', '..#', '..#'],
};

function parse(rows) {
  const cells = [];
  rows.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
  return cells;
}

export const PIECES = Object.entries(SHAPES).map(([id, rows]) => ({ id, cells: parse(rows) }));

export function pieceSize(piece) {
  let rows = 0, cols = 0;
  for (const [r, c] of piece.cells) { rows = Math.max(rows, r + 1); cols = Math.max(cols, c + 1); }
  return { rows, cols };
}

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

// True if every cell of the piece, with its top-left at (row, col), is on the board and empty.
export function canPlace(board, piece, row, col) {
  return piece.cells.every(([r, c]) => {
    const y = row + r, x = col + c;
    return y >= 0 && y < SIZE && x >= 0 && x < SIZE && board[y][x] === null;
  });
}

// Returns a new board with the piece placed. Call canPlace first.
// A piece may carry one special cell: piece.special = { i, s } where i is the
// index into piece.cells and s is the kind. That cell is stored as { c, s }.
export function place(board, piece, row, col, color) {
  const next = board.map(line => line.slice());
  piece.cells.forEach(([r, c], i) => {
    next[row + r][col + c] = piece.special && piece.special.i === i ? { c: color, s: piece.special.s } : color;
  });
  return next;
}

// Indexes of full rows and full columns.
export function fullLines(board) {
  const rows = [], cols = [];
  for (let i = 0; i < SIZE; i++) {
    if (board[i].every(v => v !== null)) rows.push(i);
    if (board.every(line => line[i] !== null)) cols.push(i);
  }
  return { rows, cols };
}

// Returns a new board with those rows and columns emptied (all at once,
// so a cell in both a full row and a full column is cleared once).
export function clearLines(board, { rows, cols }) {
  return board.map((line, r) => line.map((v, c) => (rows.includes(r) || cols.includes(c) ? null : v)));
}

export function fitsAnywhere(board, piece) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (canPlace(board, piece, r, c)) return true;
  }
  return false;
}

// The tray holds pieces, or null where one has been placed.
// Game over when no piece still in the tray fits anywhere.
export function isGameOver(board, tray) {
  const left = tray.filter(Boolean);
  return left.length > 0 && !left.some(p => fitsAnywhere(board, p));
}

export const MAX_REROLLS = 50;

function randomTray(rng) {
  return Array.from({ length: TRAY_SIZE }, () => randomPiece(rng));
}

const randomPiece = rng => ({ ...PIECES[Math.floor(rng() * PIECES.length)], color: Math.floor(rng() * COLORS) });

// A fresh set of TRAY_SIZE random pieces, each with a random color.
// rng returns a number in [0, 1) like Math.random.
// Fairness: with a board, sets are rerolled (up to MAX_REROLLS times) until
// all three can be placed, in some order (see dealFairTray).
// move: playMove for Classic, or gravityMove for Gravity.
export function dealTray(rng = Math.random, board = null, move = playMove) {
  return dealFairTray(squareRules(move), rng, board, randomTray);
}

// For the ghost preview: the rows and columns that would clear if the piece
// landed at (row, col), or null if it can't go there.
export function previewLines(board, piece, row, col) {
  if (!canPlace(board, piece, row, col)) return null;
  return fullLines(place(board, piece, row, col, 0));
}

export function trayEmpty(tray) {
  return tray.every(p => p === null);
}

// ---------- Scoring ----------
// Points per the design doc:
//   1 per cell placed.
//   10 per cleared cell, times the number of lines cleared at once (multi-clear),
//   times the streak (clears on consecutive placements: x1, x2, x3...).
//   +500 when a clear leaves the board completely empty.
// The streak survives up to 2 placements with no clear; the 3rd resets it.

export const CELL_POINTS = 1;
export const CLEAR_POINTS = 10;
export const WIPE_BONUS = 500;
export const STREAK_GRACE = 3; // placements with no clear that end a streak

export function newScore() {
  return { score: 0, streak: 0, miss: 0 };
}

// Number of distinct cells in these rows and columns (a crossing cell counts once).
export function clearedCellCount({ rows, cols }) {
  return rows.length * SIZE + cols.length * SIZE - rows.length * cols.length;
}

export function boardEmpty(board) {
  return board.every(line => line.every(v => v === null));
}

// state: { score, streak, miss }. placed: cells in the piece. lines: from fullLines.
// wiped: true if the board is empty after clearing.
// Returns the new state plus what this placement earned, for the pop-up.
export function scorePlacement(state, placed, lines, wiped = false) {
  const count = lines.rows.length + lines.cols.length;
  let { streak, miss } = state;
  let clear = 0, bonus = 0;
  if (count > 0) {
    streak += 1;
    miss = 0;
    clear = CLEAR_POINTS * clearedCellCount(lines) * count * streak;
    if (wiped) bonus = WIPE_BONUS;
  } else {
    miss += 1;
    if (miss >= STREAK_GRACE) { streak = 0; miss = 0; }
  }
  const gained = placed * CELL_POINTS + clear + bonus;
  return { score: state.score + gained, streak, miss, gained, clear, bonus, lines: count };
}

// ---------- Trick sets ----------
// A trick set looks impossible: at least one piece fits nowhere when the set
// arrives. But there is an order and placement, using line clears to make
// room, that gets all three down, and only a few first moves lead to it.

export const TRICK_CHANCE = 1 / 4;  // share of sets that try to be a trick set
export const TRICK_MIN_FILLED = 16; // board needs this many blocks first
export const TRICK_MAX_SHARE = 0.25; // at most this share of first moves may work
export const TRICK_BONUS = 100;     // for placing all of a trick set
export const TRICK_TRIES = 60;      // candidate sets to test before giving up

export function filledCount(board) {
  return board.reduce((n, line) => n + line.filter(v => v !== null).length, 0);
}

// Place and clear, as one turn of play.
export function playMove(board, piece, row, col) {
  const placed = place(board, piece, row, col, 0);
  return clearLines(placed, fullLines(placed));
}

// ---------- Fair deals and trick sets ----------
// The search below works for every mode. A "rules" object says how:
//   spots(piece): every [a, b] where the piece lies fully on the board
//   canPlace(board, piece, a, b): true if those cells are empty
//   move(board, piece, a, b): the board after placing, clearing (and falling)
//   filled(board): how many blocks are on the board
//   pieces, randomPiece(rng): the mode's pieces, and how a deal picks one

const spotCache = new Map();
export function squareRules(move = playMove) {
  return {
    spots(piece) {
      if (!spotCache.has(piece.id)) {
        const { rows, cols } = pieceSize(piece);
        const list = [];
        for (let r = 0; r + rows <= SIZE; r++) for (let c = 0; c + cols <= SIZE; c++) list.push([r, c]);
        spotCache.set(piece.id, list);
      }
      return spotCache.get(piece.id);
    },
    canPlace, move, filled: filledCount, pieces: PIECES, randomPiece, minFilled: TRICK_MIN_FILLED,
  };
}

const shapeKey = p => p.cells.join(';');

export const fitsBy = (rules, board, piece) => rules.spots(piece).some(([a, b]) => rules.canPlace(board, piece, a, b));

// True if all of these pieces can be placed, in some order, letting the clears
// of the first ones make room for the rest.
export function canPlaceAllBy(rules, board, pieces) {
  if (pieces.length === 0) return true;
  if (pieces.length === 1) return fitsBy(rules, board, pieces[0]);
  const tried = new Set();
  for (let i = 0; i < pieces.length; i++) {
    if (tried.has(shapeKey(pieces[i]))) continue; // same shape twice: once is enough
    tried.add(shapeKey(pieces[i]));
    const rest = pieces.filter((_, j) => j !== i);
    for (const [a, b] of rules.spots(pieces[i])) {
      if (rules.canPlace(board, pieces[i], a, b) && canPlaceAllBy(rules, rules.move(board, pieces[i], a, b), rest)) return true;
    }
  }
  return false;
}

// Every legal first move, and how many of them still let all pieces be placed.
export function firstMoveStatsBy(rules, board, pieces) {
  let moves = 0, winning = 0;
  for (let i = 0; i < pieces.length; i++) {
    const rest = pieces.filter((_, j) => j !== i);
    for (const [a, b] of rules.spots(pieces[i])) {
      if (!rules.canPlace(board, pieces[i], a, b)) continue;
      moves++;
      if (canPlaceAllBy(rules, rules.move(board, pieces[i], a, b), rest)) winning++;
    }
  }
  return { moves, winning };
}

export function isTrickSetBy(rules, board, pieces) {
  if (pieces.every(p => fitsBy(rules, board, p))) return false;
  const { moves, winning } = firstMoveStatsBy(rules, board, pieces);
  return winning > 0 && winning / moves <= TRICK_MAX_SHARE;
}

// Deal a set that can all be placed. Rerolls up to MAX_REROLLS times; if no
// set works (a packed board), falls back to the first set where at least one
// piece fits, so the game only ends when the board really is packed.
export function dealFairTray(rules, rng, board, makeTray) {
  let tray = makeTray(rng);
  if (!board) return tray;
  let backup = null;
  for (let i = 0; i <= MAX_REROLLS; i++) {
    if (i > 0) tray = makeTray(rng);
    if (canPlaceAllBy(rules, board, tray)) return tray;
    if (!backup && tray.some(p => fitsBy(rules, board, p))) backup = tray;
  }
  return backup ?? tray;
}

// Try to deal a trick set for this board. Returns a tray, or null if none found.
// One piece is drawn from those that fit nowhere right now; the other two are
// random. The only way through is to clear a line with one or two pieces
// first, in the right spot, to make room for the rest.
export function dealTrickTrayBy(rules, rng, board, tries = TRICK_TRIES) {
  if (rules.filled(board) < rules.minFilled) return null;
  const blocked = rules.pieces.filter(p => !fitsBy(rules, board, p));
  if (blocked.length === 0) return null;
  for (let i = 0; i < tries; i++) {
    const tray = [
      { ...blocked[Math.floor(rng() * blocked.length)], color: Math.floor(rng() * COLORS) },
      rules.randomPiece(rng), rules.randomPiece(rng),
    ];
    if (isTrickSetBy(rules, board, tray)) {
      // Shuffle so the blocked piece isn't always on the left.
      for (let k = tray.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [tray[k], tray[j]] = [tray[j], tray[k]];
      }
      return tray;
    }
  }
  return null;
}

// Classic versions, kept for the tests and the app.
export const canPlaceAll = (board, pieces) => canPlaceAllBy(squareRules(), board, pieces);
export const firstMoveStats = (board, pieces) => firstMoveStatsBy(squareRules(), board, pieces);
export const isTrickSet = (board, pieces) => isTrickSetBy(squareRules(), board, pieces);
export const dealTrickTray = (rng = Math.random, board, tries = TRICK_TRIES, move = playMove) =>
  dealTrickTrayBy(squareRules(move), rng, board, tries);

// ---------- Gravity mode ----------
// After a clear, every block drops straight down its column to fill the gaps.
// That can fill new lines, which clear and drop again: a chain reaction.

// Returns { board, falls }: the board after dropping, and falls[r][c] = how
// many rows the block now at (r, c) moved: positive if it fell down, negative
// if it fell up (0 if it didn't move or is empty).
// Gravity specials: an anchor never moves, and blocks rest on it. A flip
// block makes its whole column fall up instead of down.
// onlyCols: settle just these columns and leave the rest as they are.
export function applyGravity(board, onlyCols = null) {
  const next = emptyBoard();
  const falls = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let c = 0; c < SIZE; c++) {
    if (onlyCols && !onlyCols.includes(c)) {
      for (let r = 0; r < SIZE; r++) next[r][c] = board[r][c];
      continue;
    }
    const up = board.some(line => specialOf(line[c]) === 'flip');
    // Anchors split the column into stretches; each settles on its own.
    let top = 0;
    for (let r = 0; r <= SIZE; r++) {
      const anchor = r < SIZE && specialOf(board[r][c]) === 'anchor';
      if (r < SIZE && !anchor) continue;
      if (anchor) next[r][c] = board[r][c];
      const rows = [];
      for (let y = top; y < r; y++) if (board[y][c] !== null) rows.push(y);
      rows.forEach((y, i) => {
        const land = up ? top + i : r - rows.length + i;
        next[land][c] = board[y][c];
        falls[land][c] = land - y;
      });
      top = r + 1;
    }
  }
  return { board: next, falls };
}

// Points for the 2nd, 3rd... clear of a chain (chain = 2, 3...). Like a normal
// clear, times the chain step on top. The streak is kept but not raised.
export function scoreChain(state, lines, chain, wiped = false) {
  const count = lines.rows.length + lines.cols.length;
  const clear = CLEAR_POINTS * clearedCellCount(lines) * count * Math.max(state.streak, 1) * chain;
  const bonus = wiped ? WIPE_BONUS : 0;
  const gained = clear + bonus;
  return { ...state, score: state.score + gained, gained, clear, bonus, lines: count, chain };
}

// One whole Gravity turn without animation: place, then clear and drop until
// nothing more clears. Returns the board and how many clears happened.
export function playGravityMove(board, piece, row, col) {
  let next = place(board, piece, row, col, 0);
  let clears = 0;
  for (;;) {
    const lines = fullLines(next);
    if (!lines.rows.length && !lines.cols.length) break;
    clears++;
    next = applyGravity(clearLines(next, lines)).board;
  }
  return { board: next, clears };
}

// playGravityMove as a move for the fair-deal search (just the board).
export const gravityMove = (board, piece, row, col) => playGravityMove(board, piece, row, col).board;

export const MODES = [
  { id: 'classic', name: 'Classic', about: 'Fill rows and columns to clear them.' },
  { id: 'gravity', name: 'Gravity', about: 'After a clear, blocks fall down. Set off chain reactions!' },
  { id: 'hex', name: 'Hex', about: 'A hexagon board. Lines clear 3 ways.' },
  { id: 'hexgravity', name: 'Hex Gravity', about: 'Hex, but after a clear, blocks pour down like sand. Chain reactions!' },
];

// ---------- Special blocks ----------
// With specials on, some pieces carry one special cell:
//   bomb:  when it clears, it also clears the 3x3 around it (bombs set off bombs).
//   stone: a clear only cracks it ('crack'); a second clear breaks it.
//   star:  STAR_BONUS points when it clears.
// A board cell is null, a color index, or { c: color, s: kind }.

export const SPECIAL_CHANCE = 0.25; // share of pieces that get a special cell
export const SPECIAL_KINDS = [['bomb', 0.4], ['stone', 0.35], ['star', 0.25]];
// Gravity adds anchor (never falls) and flip (its column falls up).
// Gravity also deals specials a bit more often, so these show up.
export const GRAVITY_KINDS = [['bomb', 0.2], ['stone', 0.13], ['star', 0.13], ['anchor', 0.27], ['flip', 0.27]];
export const GRAVITY_SPECIAL_CHANCE = 0.35;
export const STAR_BONUS = 50;

export const colorOf = v => (v !== null && typeof v === 'object' ? v.c : v);
export const specialOf = v => (v !== null && typeof v === 'object' ? v.s : null);

// Give some pieces of a tray a special cell. Returns new piece objects.
export function addSpecials(tray, rng = Math.random, chance = SPECIAL_CHANCE, kinds = SPECIAL_KINDS) {
  return tray.map(p => {
    if (!p || rng() >= chance) return p;
    let roll = rng(), s = kinds[kinds.length - 1][0];
    for (const [kind, w] of kinds) { if (roll < w) { s = kind; break; } roll -= w; }
    return { ...p, special: { i: Math.floor(rng() * p.cells.length), s } };
  });
}

// Clear full lines, with specials. Returns the new board and what happened:
// blast = cells cleared by bombs beyond the lines, stars = stars cleared,
// cracked = stones that cracked, hit = every cell the clear touched ("r,c").
export function resolveClear(board, { rows, cols }) {
  const hit = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (rows.includes(r) || cols.includes(c)) hit.add(`${r},${c}`);
  }
  const lineCells = hit.size;
  // Bombs blow up their 3x3, which can reach more bombs.
  const queue = [...hit];
  const fired = new Set();
  while (queue.length) {
    const key = queue.pop();
    const [r, c] = key.split(',').map(Number);
    if (specialOf(board[r][c]) !== 'bomb' || fired.has(key)) continue;
    fired.add(key);
    for (let y = r - 1; y <= r + 1; y++) {
      for (let x = c - 1; x <= c + 1; x++) {
        if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) continue;
        const k = `${y},${x}`;
        if (!hit.has(k)) { hit.add(k); queue.push(k); }
      }
    }
  }
  const next = board.map(line => line.slice());
  let blast = 0, stars = 0, cracked = 0;
  for (const key of hit) {
    const [r, c] = key.split(',').map(Number);
    const v = board[r][c];
    if (v === null) continue;
    const kind = specialOf(v);
    if (kind === 'stone') { next[r][c] = { c: v.c, s: 'crack' }; cracked++; continue; }
    if (kind === 'star') stars++;
    next[r][c] = null;
  }
  for (const key of hit) {
    const [r, c] = key.split(',').map(Number);
    if (!(rows.includes(r) || cols.includes(c)) && board[r][c] !== null && specialOf(board[r][c]) !== 'stone') blast++;
  }
  const bombs = [...fired].map(k => k.split(',').map(Number));
  return { board: next, blast, stars, cracked, hit: [...hit], lineCells, bombs };
}

// Extra points from specials in one clear, on top of the normal clear points.
export function specialPoints({ blast, stars }, streak = 1) {
  return blast * CLEAR_POINTS * Math.max(streak, 1) + stars * STAR_BONUS;
}

// ---------- Daily Duel ----------
// Everyone gets the same pieces on the same day: each set is drawn from a
// random number generator seeded with the date and the set's number, so it
// doesn't depend on how anyone played.

// Today's date on this phone as 'YYYY-MM-DD'.
export function dayKey(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// A repeatable rng (mulberry32) from a text seed (FNV-1a hash).
export function seededRng(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Set number n (0, 1, 2...) of the day. With a board, a set where nothing fits
// is rerolled like any other deal, which only matters when the game would end.
// Every game (Classic, Gravity, with or without specials) has its own Daily
// Duel with its own pieces. Classic keeps the original seed, so its duel
// didn't change. Specials come from their own seeded rng, so a reroll near the
// end of a game doesn't shift them.
export function dailyTray(day, n, board = null, variant = 'classic') {
  const seed = variant === 'classic' ? `blockit-${day}-${n}` : `blockit-${variant}-${day}-${n}`;
  const tray = dealTray(seededRng(seed), board, variant.startsWith('gravity') ? gravityMove : playMove);
  if (!variant.endsWith('-special')) return tray;
  const rng = seededRng(`${seed}-specials`);
  return variant.startsWith('gravity')
    ? addSpecials(tray, rng, GRAVITY_SPECIAL_CHANCE, GRAVITY_KINDS)
    : addSpecials(tray, rng, SPECIAL_CHANCE, SPECIAL_KINDS);
}

// Scoreboard/storage id of a game's Daily Duel. Classic's stays 'daily'.
export const duelId = variant => (variant === 'classic' ? 'daily' : `daily-${variant}`);

// 'Gravity Duel ✦' for 'gravity-special' (✦ = special blocks, as on the scoreboard).
export function duelName(variant) {
  const name = variant.startsWith('gravity') ? 'Gravity Duel' : variant.startsWith('hexgravity') ? 'Hex Gravity Duel'
    : variant.startsWith('hex') ? 'Hex Duel' : 'Daily Duel';
  return variant.endsWith('-special') ? `${name} ✦` : name;
}

// '11/22' from '2026-11-22'.
export function shortDay(day) {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
}

export function shareText(day, score, player, variant = 'classic') {
  return `Blockit ${duelName(variant)} ${shortDay(day)}: ${score.toLocaleString('en-US')} (${player})`;
}
