// Game rules, with no DOM, so they can be tested with node --test.
// A board is SIZE rows of SIZE cells; a cell is null (empty) or a color index.
// A piece is { id, cells: [[row, col], ...] } with its top-left at 0,0. No rotation.

export const SIZE = 9;
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

// A fresh set of TRAY_SIZE random pieces, each with a random color.
// rng returns a number in [0, 1) like Math.random.
export function dealTray(rng = Math.random) {
  return Array.from({ length: TRAY_SIZE }, () => ({
    ...PIECES[Math.floor(rng() * PIECES.length)],
    color: Math.floor(rng() * COLORS),
  }));
}

export function trayEmpty(tray) {
  return tray.every(p => p === null);
}
