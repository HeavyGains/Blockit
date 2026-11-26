// Hex mode rules, with no DOM, so they can be tested with node --test.
//
// The board is one big hexagon of hex cells, HEX_RADIUS cells from the middle
// to each edge (5 per side, 61 cells). Cells use axial coordinates [q, r]:
// q runs left to right, r runs down-right, and the middle cell is [0, 0].
// The third axis is s = -q - r. A cell is on the board when |q|, |r| and |s|
// are all at most HEX_RADIUS.
//
// A line is every cell with the same q, the same r or the same s, so lines run
// in 3 directions. A full line clears, like a row or column in Classic.
//
// The board is stored as rows by r, each holding cells by q (both shifted by
// HEX_RADIUS so they start at 0). Spots outside the hexagon are never used.
// A cell is null (empty) or a color index, or { c, s } for a special.

import { TRAY_SIZE, COLORS, MAX_REROLLS, CELL_POINTS, CLEAR_POINTS, WIPE_BONUS, STREAK_GRACE, seededRng,
  specialOf, addSpecials, SPECIAL_CHANCE, SPECIAL_KINDS, dealFairTray, dealTrickTrayBy,
} from './logic.js?v=59';

export const HEX_RADIUS = 4;
const SPAN = HEX_RADIUS * 2 + 1;

export const onBoard = (q, r) =>
  Math.abs(q) <= HEX_RADIUS && Math.abs(r) <= HEX_RADIUS && Math.abs(q + r) <= HEX_RADIUS;

// Every cell on the board, top row first, left to right.
export const HEX_CELLS = [];
for (let r = -HEX_RADIUS; r <= HEX_RADIUS; r++) {
  for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) if (onBoard(q, r)) HEX_CELLS.push([q, r]);
}

export const AXES = ['q', 'r', 's'];
const coord = { q: (q) => q, r: (q, r) => r, s: (q, r) => -q - r };

// The cells of one line: axis 'q', 'r' or 's', and its value i (-R..R).
export function lineCells(axis, i) {
  return HEX_CELLS.filter(([q, r]) => coord[axis](q, r) === i);
}

export function emptyHexBoard() {
  return Array.from({ length: SPAN }, () => Array(SPAN).fill(null));
}

export const getCell = (board, q, r) => board[r + HEX_RADIUS][q + HEX_RADIUS];

// ---------- Pieces ----------
// Each shape is a list of [q, r] cells. Pieces never rotate in play, so every
// turned version of a shape is its own piece. A deal picks a shape first, then
// one of its turns, so a shape with 6 turns doesn't come up 6 times as often.

const SHAPES = {
  dot: [[0, 0]],
  bar2: [[0, 0], [1, 0]],
  bar3: [[0, 0], [1, 0], [2, 0]],
  bar4: [[0, 0], [1, 0], [2, 0], [3, 0]],
  tri: [[0, 0], [1, 0], [0, 1]],
  bend: [[0, 0], [1, 0], [2, -1]],
  diamond: [[0, 0], [1, 0], [0, 1], [1, 1]],
  hook: [[0, 0], [1, 0], [2, 0], [2, 1]],
  hookB: [[0, 0], [1, 0], [2, 0], [3, -1]],
  wave: [[0, 0], [1, 0], [1, 1], [2, 1]],
  flag: [[0, 0], [1, 0], [2, -1], [2, 0]],
};

// A sixth of a turn clockwise.
const turn = ([q, r]) => [-r, q + r];

// Shift so the smallest q and r are 0, and sort, so equal shapes compare equal.
function normalize(cells) {
  const mq = Math.min(...cells.map(([q]) => q));
  const mr = Math.min(...cells.map(([, r]) => r));
  return cells.map(([q, r]) => [q - mq, r - mr]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function turnsOf(cells) {
  const seen = new Map();
  let cur = cells;
  for (let i = 0; i < 6; i++) {
    const n = normalize(cur);
    const key = JSON.stringify(n);
    if (!seen.has(key)) seen.set(key, n);
    cur = cur.map(turn);
  }
  return [...seen.values()];
}

// [{ shape, pieces: [{ id, cells }] }] with ids like 'bar3-0', 'bar3-1'...
export const HEX_SHAPES = Object.entries(SHAPES).map(([shape, cells]) => ({
  shape,
  pieces: turnsOf(cells).map((c, i) => ({ id: `${shape}-${i}`, cells: c })),
}));

export const HEX_PIECES = HEX_SHAPES.flatMap(s => s.pieces);

// ---------- Placing and clearing ----------

// True if every cell of the piece, with its [0, 0] at (q, r), is on the board and empty.
export function canPlaceHex(board, piece, q, r) {
  return piece.cells.every(([dq, dr]) => {
    const x = q + dq, y = r + dr;
    return onBoard(x, y) && getCell(board, x, y) === null;
  });
}

// Returns a new board with the piece placed. Call canPlaceHex first.
export function placeHex(board, piece, q, r, color) {
  const next = board.map(line => line.slice());
  piece.cells.forEach(([dq, dr], i) => {
    next[r + dr + HEX_RADIUS][q + dq + HEX_RADIUS] =
      piece.special && piece.special.i === i ? { c: color, s: piece.special.s } : color;
  });
  return next;
}

// The full lines: { q: [...], r: [...], s: [...] }, each a list of line values.
export function hexFullLines(board) {
  const out = { q: [], r: [], s: [] };
  for (const axis of AXES) {
    for (let i = -HEX_RADIUS; i <= HEX_RADIUS; i++) {
      if (lineCells(axis, i).every(([q, r]) => getCell(board, q, r) !== null)) out[axis].push(i);
    }
  }
  return out;
}

export const hexLineCount = lines => lines.q.length + lines.r.length + lines.s.length;

const inLines = (lines, q, r) => AXES.some(a => lines[a].includes(coord[a](q, r)));

// Cells in these lines, each counted once where lines cross.
export function hexClearedCells(lines) {
  return HEX_CELLS.filter(([q, r]) => inLines(lines, q, r));
}

// Returns a new board with those lines emptied, all at once.
export function clearHexLines(board, lines) {
  const next = board.map(line => line.slice());
  for (const [q, r] of hexClearedCells(lines)) next[r + HEX_RADIUS][q + HEX_RADIUS] = null;
  return next;
}

// The piece's [0, 0] is the corner of its bounding box, which isn't always one
// of its cells, so it can sit just off the board while every cell is on it.
// Try every spot within a board's width, not only the board's own cells.
export function fitsAnywhereHex(board, piece) {
  for (let r = -2 * HEX_RADIUS; r <= HEX_RADIUS; r++) {
    for (let q = -2 * HEX_RADIUS; q <= HEX_RADIUS; q++) if (canPlaceHex(board, piece, q, r)) return true;
  }
  return false;
}

// Game over when no piece still in the tray (null = placed) fits anywhere.
export function isHexGameOver(board, tray) {
  const left = tray.filter(Boolean);
  return left.length > 0 && !left.some(p => fitsAnywhereHex(board, p));
}

export function hexBoardEmpty(board) {
  return HEX_CELLS.every(([q, r]) => getCell(board, q, r) === null);
}

// For the ghost preview: the lines that would clear, or null if it can't go there.
export function previewHexLines(board, piece, q, r) {
  if (!canPlaceHex(board, piece, q, r)) return null;
  return hexFullLines(placeHex(board, piece, q, r, 0));
}

// Places a piece and clears any full lines: { board, lines, wiped }.
export function playHexMove(board, piece, q, r) {
  const placed = placeHex(board, piece, q, r, piece.color ?? 0);
  const lines = hexFullLines(placed);
  const after = clearHexLines(placed, lines);
  return { board: after, lines, wiped: hexLineCount(lines) > 0 && hexBoardEmpty(after) };
}

// ---------- Dealing ----------

const randomHexPiece = rng => {
  const { pieces } = HEX_SHAPES[Math.floor(rng() * HEX_SHAPES.length)];
  return { ...pieces[Math.floor(rng() * pieces.length)], color: Math.floor(rng() * COLORS) };
};

const randomHexTray = rng => Array.from({ length: TRAY_SIZE }, () => randomHexPiece(rng));

// A move for the fair-deal search: the board after placing and clearing.
export const hexMove = (board, piece, q, r) => playHexMove(board, piece, q, r).board;
export const hexGravityMove = (board, piece, q, r) => playHexGravityMove(board, piece, q, r).board;

export const HEX_TRICK_MIN_FILLED = 15; // a quarter of the board, like Classic

// Every [q, r] where the piece lies fully on the board (see fitsAnywhereHex
// for why q and r start below -HEX_RADIUS).
const spotCache = new Map();
function hexSpots(piece) {
  if (!spotCache.has(piece.id)) {
    const list = [];
    for (let r = -2 * HEX_RADIUS; r <= HEX_RADIUS; r++) {
      for (let q = -2 * HEX_RADIUS; q <= HEX_RADIUS; q++) {
        if (piece.cells.every(([dq, dr]) => onBoard(q + dq, r + dr))) list.push([q, r]);
      }
    }
    spotCache.set(piece.id, list);
  }
  return spotCache.get(piece.id);
}

// The rules object for the fair-deal search in logic.js.
export function hexRules(move = hexMove) {
  return {
    spots: hexSpots, canPlace: canPlaceHex, move,
    filled: b => HEX_CELLS.filter(([q, r]) => getCell(b, q, r) !== null).length,
    pieces: HEX_PIECES, randomPiece: randomHexPiece, minFilled: HEX_TRICK_MIN_FILLED,
  };
}

// Like Classic's dealTray: with a board, sets are rerolled until all three
// can be placed in some order. move: hexMove, or hexGravityMove for Hex Gravity.
export function dealHexTray(rng = Math.random, board = null, move = hexMove) {
  return dealFairTray(hexRules(move), rng, board, randomHexTray);
}

// A trick set for this board (see dealTrickTrayBy), or null.
export const dealHexTrickTray = (rng = Math.random, board, move = hexMove) => dealTrickTrayBy(hexRules(move), rng, board);

// Hex Daily Duel: set number n of the day, the same for everyone (seeded by
// the date and set number, like Classic's dailyTray, with its own seed).
// With specials (variant 'hex-special') the sets have their own seed, and the
// specials come from a second seeded rng, like Classic's specials duel.
// game: 'hex' or 'hexgravity'; each has its own pieces.
export function dailyHexTray(day, n, board = null, specials = false, game = 'hex') {
  const seed = specials ? `blockit-${game}-special-${day}-${n}` : `blockit-${game}-${day}-${n}`;
  const tray = dealHexTray(seededRng(seed), board, game === 'hexgravity' ? hexGravityMove : hexMove);
  return specials ? addSpecials(tray, seededRng(`${seed}-specials`), SPECIAL_CHANCE, SPECIAL_KINDS) : tray;
}

// ---------- Special blocks ----------
// Same specials as Classic (see resolveClear in logic.js): a bomb also clears
// the 6 hexes around it (and sets off bombs there), a stone only cracks on its
// first clear, a star is worth STAR_BONUS. Cells are named "row,col" in the
// stored board (row = r + HEX_RADIUS, col = q + HEX_RADIUS), like resolveClear.

const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]; // [dq, dr]

export function hexNeighbors(q, r) {
  return NEIGHBORS.map(([dq, dr]) => [q + dq, r + dr]).filter(([x, y]) => onBoard(x, y));
}

const key = (q, r) => `${r + HEX_RADIUS},${q + HEX_RADIUS}`;

export function resolveHexClear(board, lines) {
  const inLine = new Set(hexClearedCells(lines).map(([q, r]) => key(q, r)));
  const hit = new Map(hexClearedCells(lines).map(([q, r]) => [key(q, r), [q, r]]));
  const queue = [...hit.values()];
  const fired = [];
  while (queue.length) {
    const [q, r] = queue.pop();
    if (specialOf(getCell(board, q, r)) !== 'bomb' || fired.some(([a, b]) => a === q && b === r)) continue;
    fired.push([q, r]);
    for (const [x, y] of hexNeighbors(q, r)) {
      if (!hit.has(key(x, y))) { hit.set(key(x, y), [x, y]); queue.push([x, y]); }
    }
  }
  const next = board.map(line => line.slice());
  let blast = 0, stars = 0, cracked = 0;
  for (const [k, [q, r]] of hit) {
    const v = getCell(board, q, r);
    if (v === null) continue;
    const kind = specialOf(v);
    if (kind === 'stone') { next[r + HEX_RADIUS][q + HEX_RADIUS] = { c: v.c, s: 'crack' }; cracked++; continue; }
    if (kind === 'star') stars++;
    if (!inLine.has(k)) blast++;
    next[r + HEX_RADIUS][q + HEX_RADIUS] = null;
  }
  const bombs = fired.map(([q, r]) => [r + HEX_RADIUS, q + HEX_RADIUS]);
  return { board: next, blast, stars, cracked, hit: [...hit.keys()], lineCells: inLine.size, bombs };
}

// ---------- Scoring ----------
// Same rules as Classic (see scorePlacement in logic.js): 1 per cell placed,
// 10 per cleared cell times the lines cleared at once times the streak, +500
// for emptying the board. Only the line shape differs.
export function scoreHexPlacement(state, placed, lines, wiped = false) {
  const count = hexLineCount(lines);
  let { streak, miss } = state;
  let clear = 0, bonus = 0;
  if (count > 0) {
    streak += 1;
    miss = 0;
    clear = CLEAR_POINTS * hexClearedCells(lines).length * count * streak;
    if (wiped) bonus = WIPE_BONUS;
  } else {
    miss += 1;
    if (miss >= STREAK_GRACE) { streak = 0; miss = 0; }
  }
  const gained = placed * CELL_POINTS + clear + bonus;
  return { score: state.score + gained, streak, miss, gained, clear, bonus, lines: count };
}

// ---------- Hex Gravity ----------
// A hex cell has no cell straight below it, only one down-left [q-1, r+1] and
// one down-right [q, r+1]. After a clear, blocks fall one step at a time
// ("Brick" rule, after Jason found sand-like sliding drained the board):
// - a block rests if either cell below is filled or off the board (so blocks
//   along the board's lower edges stay put);
// - if both are empty, it zig-zags: on even rows it goes down-left, on odd
//   rows down-right, so it falls roughly straight down.
// An anchor never moves, and a block touching an anchor stays put too.
// Each tick every block moves at most once, lowest rows first.

const below = (q, r) => [[q - 1, r + 1], [q, r + 1]];
const isOpen = (board, q, r) => onBoard(q, r) && getCell(board, q, r) === null;

const heldByAnchor = (board, q, r) =>
  hexNeighbors(q, r).some(([x, y]) => specialOf(getCell(board, x, y)) === 'anchor');

// The cell a block at (q, r) moves to next, or null if it stays.
export function hexFallStep(board, q, r) {
  const v = getCell(board, q, r);
  if (v === null || specialOf(v) === 'anchor' || heldByAnchor(board, q, r)) return null;
  const [left, right] = below(q, r);
  const l = isOpen(board, ...left), rt = isOpen(board, ...right);
  if (!l || !rt) return null;
  return ((r % 2) + 2) % 2 === 0 ? left : right;
}

// Returns { board, paths, ticks }: the settled board; for every block that
// moved, { from, path } where path lists each cell it passed through (ending
// where it landed); and how many ticks it took (for the animation).
export function applyHexGravity(board) {
  let cur = board.map(line => line.slice());
  const trail = new Map(); // "q,r" where a block is now -> { from, path }
  let ticks = 0;
  for (;;) {
    const next = cur.map(line => line.slice());
    let moved = false;
    for (let i = HEX_CELLS.length - 1; i >= 0; i--) {
      const [q, r] = HEX_CELLS[i];
      const to = hexFallStep(next, q, r);
      if (!to) continue;
      const [x, y] = to;
      next[y + HEX_RADIUS][x + HEX_RADIUS] = next[r + HEX_RADIUS][q + HEX_RADIUS];
      next[r + HEX_RADIUS][q + HEX_RADIUS] = null;
      const t = trail.get(`${q},${r}`) ?? { from: [q, r], path: [] };
      trail.delete(`${q},${r}`);
      t.path.push([x, y]);
      trail.set(`${x},${y}`, t);
      moved = true;
    }
    if (!moved) break;
    cur = next;
    ticks++;
  }
  return { board: cur, paths: [...trail.values()], ticks };
}

// One whole Hex Gravity turn without animation: place, then clear and fall
// until nothing more clears. Returns the board and how many clears happened.
export function playHexGravityMove(board, piece, q, r) {
  let next = placeHex(board, piece, q, r, piece.color ?? 0);
  let clears = 0;
  for (;;) {
    const lines = hexFullLines(next);
    if (!hexLineCount(lines)) break;
    clears++;
    next = applyHexGravity(clearHexLines(next, lines)).board;
  }
  return { board: next, clears };
}

// Points for the 2nd, 3rd... clear of a chain (chain = 2, 3...), like
// scoreChain in logic.js: a normal clear, times the chain step on top.
export function scoreHexChain(state, lines, chain, wiped = false) {
  const count = hexLineCount(lines);
  const clear = CLEAR_POINTS * hexClearedCells(lines).length * count * Math.max(state.streak, 1) * chain;
  const bonus = wiped ? WIPE_BONUS : 0;
  const gained = clear + bonus;
  return { ...state, score: state.score + gained, gained, clear, bonus, lines: count, chain };
}
