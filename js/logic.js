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
export function place(board, piece, row, col, color) {
  const next = board.map(line => line.slice());
  for (const [r, c] of piece.cells) next[row + r][col + c] = color;
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
  return Array.from({ length: TRAY_SIZE }, () => ({
    ...PIECES[Math.floor(rng() * PIECES.length)],
    color: Math.floor(rng() * COLORS),
  }));
}

// A fresh set of TRAY_SIZE random pieces, each with a random color.
// rng returns a number in [0, 1) like Math.random.
// Fairness: with a board, a set where no piece fits is rerolled (up to
// MAX_REROLLS times), so a fresh set only ends the game when the board is packed.
export function dealTray(rng = Math.random, board = null) {
  let tray = randomTray(rng);
  for (let i = 0; board && i < MAX_REROLLS && isGameOver(board, tray); i++) tray = randomTray(rng);
  return tray;
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

export const TRICK_CHANCE = 1 / 6;  // share of sets that try to be a trick set
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

// True if all of these pieces can be placed, in some order.
export function canPlaceAll(board, pieces) {
  if (pieces.length === 0) return true;
  for (let i = 0; i < pieces.length; i++) {
    const rest = pieces.filter((_, j) => j !== i);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (canPlace(board, pieces[i], r, c) && canPlaceAll(playMove(board, pieces[i], r, c), rest)) return true;
      }
    }
  }
  return false;
}

// Every legal first move, and how many of them still let all pieces be placed.
export function firstMoveStats(board, pieces) {
  let moves = 0, winning = 0;
  for (let i = 0; i < pieces.length; i++) {
    const rest = pieces.filter((_, j) => j !== i);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!canPlace(board, pieces[i], r, c)) continue;
        moves++;
        if (canPlaceAll(playMove(board, pieces[i], r, c), rest)) winning++;
      }
    }
  }
  return { moves, winning };
}

export function isTrickSet(board, pieces) {
  if (pieces.every(p => fitsAnywhere(board, p))) return false;
  const { moves, winning } = firstMoveStats(board, pieces);
  return winning > 0 && winning / moves <= TRICK_MAX_SHARE;
}

// Try to deal a trick set for this board. Returns a tray, or null if none found.
// One piece is drawn from those that fit nowhere right now; the other two are random.
export function dealTrickTray(rng = Math.random, board, tries = TRICK_TRIES) {
  if (filledCount(board) < TRICK_MIN_FILLED) return null;
  const blocked = PIECES.filter(p => !fitsAnywhere(board, p));
  if (blocked.length === 0) return null;
  const pick = list => ({ ...list[Math.floor(rng() * list.length)], color: Math.floor(rng() * COLORS) });
  for (let i = 0; i < tries; i++) {
    const tray = [pick(blocked), pick(PIECES), pick(PIECES)];
    if (isTrickSet(board, tray)) {
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
