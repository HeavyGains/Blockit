import {
  SIZE, emptyBoard, canPlace, place, fullLines, clearLines,
  isGameOver, dealTray, trayEmpty, fitsAnywhere, previewLines,
  newScore, scorePlacement, boardEmpty,
  dealTrickTray, TRICK_CHANCE, TRICK_BONUS,
} from './logic.js?v=3';

const LIFT = 56;      // px the dragged piece floats above the finger, so it stays visible
const CLEAR_MS = 220; // matches the pop animation in style.css

const boardEl = document.getElementById('board');
const trayEl = document.getElementById('tray');
const dragEl = document.getElementById('drag');
const overEl = document.getElementById('over');
const scoreEl = document.getElementById('score');
const streakEl = document.getElementById('streak');
const bestEl = document.getElementById('best');
const whoEl = document.getElementById('who');

let board = emptyBoard();
let tray = dealTray();
let busy = false; // true while lines are clearing
let score = newScore();
let newBest = false; // beat the saved best during this game
let trickSet = false; // the tray in play is a trick set

// ---------- Players and best scores (saved on this device) ----------

const PLAYERS = ['Jason', 'Amy'];
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: just don't save */ }
  },
};
let player = PLAYERS.includes(store.get('blockit.player')) ? store.get('blockit.player') : PLAYERS[0];
const bests = store.get('blockit.best', {});
const best = () => bests[player] || 0;

function saveBest() {
  if (score.score > best()) {
    bests[player] = score.score;
    store.set('blockit.best', bests);
    newBest = true;
  }
}

// ---------- Styles (saved per player) ----------

const STYLES = [
  { id: 'paper', name: 'Paper stickers' },
  { id: 'neon', name: 'Neon arcade' },
  { id: 'candy', name: 'Candy jelly' },
  { id: 'wood', name: 'Woodshop' },
  { id: 'chalk', name: 'Chalkboard' },
  { id: 'pixel', name: 'Pixel' },
  { id: 'garden', name: 'Garden' },
  { id: 'contrast', name: 'High contrast' },
  { id: 'classic', name: 'Classic' },
];
const styles = store.get('blockit.style', {});
const stylesEl = document.getElementById('styles');
const swatchesEl = document.getElementById('swatches');

function currentStyle() {
  return STYLES.some(s => s.id === styles[player]) ? styles[player] : STYLES[0].id;
}

function applyStyle() {
  const id = currentStyle();
  document.documentElement.dataset.style = id;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').content = bg;
  for (const b of swatchesEl.children) b.setAttribute('aria-pressed', String(b.dataset.id === id));
}

swatchesEl.replaceChildren(...STYLES.map(s => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.dataset.id = s.id;
  const mini = document.createElement('span');
  mini.className = 'mini';
  mini.dataset.style = s.id; // the mini board takes that style's colors
  mini.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  b.append(mini, s.name);
  b.addEventListener('click', () => {
    styles[player] = s.id;
    store.set('blockit.style', styles);
    applyStyle();
    stylesEl.hidden = true;
  });
  return b;
}));

document.getElementById('palette').addEventListener('click', () => { stylesEl.hidden = false; });
document.getElementById('styles-close').addEventListener('click', () => { stylesEl.hidden = true; });
stylesEl.addEventListener('click', e => { if (e.target === stylesEl) stylesEl.hidden = true; });

document.getElementById('player').addEventListener('click', () => {
  player = PLAYERS[(PLAYERS.indexOf(player) + 1) % PLAYERS.length];
  store.set('blockit.player', player);
  applyStyle();
  newBest = false;
  saveBest();
  drawScore();
});

// ---------- Drawing ----------

const cells = [];
for (let i = 0; i < SIZE * SIZE; i++) {
  const el = document.createElement('div');
  el.className = 'cell';
  boardEl.appendChild(el);
  cells.push(el);
}

function drawBoard() {
  board.forEach((line, r) => line.forEach((v, c) => {
    const el = cells[r * SIZE + c];
    if (v === null) el.removeAttribute('data-c'); else el.dataset.c = v;
  }));
}

function pieceEl(piece) {
  const el = document.createElement('div');
  el.className = 'piece';
  for (const [r, c] of piece.cells) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.c = piece.color;
    cell.style.setProperty('--r', r + 1);
    cell.style.setProperty('--col', c + 1);
    el.appendChild(cell);
  }
  return el;
}

function drawTray() {
  trayEl.replaceChildren(...tray.map((piece, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.i = i;
    if (piece) {
      slot.appendChild(pieceEl(piece));
      if (!fitsAnywhere(board, piece)) slot.classList.add('nofit');
    }
    return slot;
  }));
}

function drawScore() {
  scoreEl.textContent = score.score.toLocaleString();
  streakEl.hidden = score.streak < 2;
  streakEl.textContent = `x${score.streak}`;
  whoEl.textContent = player;
  bestEl.textContent = best().toLocaleString();
}

function draw() {
  drawBoard();
  drawTray();
  drawScore();
}

// Floating "+points" at the middle of the placed piece, which is where the clear happened.
function showPop(piece, row, col, result) {
  const n = piece.cells.length;
  const r = row + piece.cells.reduce((a, [y]) => a + y, 0) / n + 0.5;
  const c = col + piece.cells.reduce((a, [, x]) => a + x, 0) / n + 0.5;
  const el = document.createElement('div');
  el.className = 'pop';
  el.style.top = `${Math.min(Math.max(r / SIZE, 0.12), 0.88) * 100}%`;
  el.style.left = `${Math.min(Math.max(c / SIZE, 0.2), 0.8) * 100}%`;
  el.textContent = `+${result.gained.toLocaleString()}`;
  const notes = [];
  if (result.lines > 1) notes.push(`${result.lines} lines`);
  if (result.streak > 1) notes.push(`streak x${result.streak}`);
  if (result.bonus) notes.push('board clear!');
  if (notes.length) {
    const small = document.createElement('small');
    small.textContent = notes.join(' · ');
    el.appendChild(small);
  }
  boardEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// "Solved!" when every piece of a trick set got placed. Shown near the top,
// clear of the last move's points.
function showSolved() {
  const el = document.createElement('div');
  el.className = 'pop solved';
  el.style.top = '18%';
  el.style.left = '50%';
  el.textContent = 'Solved!';
  const small = document.createElement('small');
  small.textContent = `tricky set +${TRICK_BONUS}`;
  el.appendChild(small);
  boardEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// About 1 set in TRICK_CHANCE is a trick set when the board allows one.
function dealNext() {
  const trick = Math.random() < TRICK_CHANCE ? dealTrickTray(Math.random, board) : null;
  trickSet = !!trick;
  return trick || dealTray(Math.random, board);
}

// ---------- Dragging ----------

let drag = null; // { index, piece, pointerId, slot }

function cellPitch() {
  const r = boardEl.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(boardEl).paddingLeft);
  return { left: r.left + pad, top: r.top + pad, size: (r.width - pad * 2) / SIZE };
}

// Board row/col under the piece's top-left cell, rounded to the nearest cell.
function targetCell(x, y) {
  const { left, top, size } = cellPitch();
  const w = dragEl.offsetWidth, h = dragEl.offsetHeight;
  const px = x - w / 2, py = y - h - LIFT;
  return { row: Math.round((py - top) / size), col: Math.round((px - left) / size) };
}

function moveDrag(x, y) {
  const w = dragEl.offsetWidth, h = dragEl.offsetHeight;
  dragEl.style.transform = `translate(${x - w / 2}px, ${y - h - LIFT}px)`;
  const { row, col } = targetCell(x, y);
  showGhost(drag.piece, row, col);
}

// ---------- Ghost preview ----------
// Where the piece would land, and the rows/columns that would clear (glow).

let ghostKey = '';

function clearGhost() {
  ghostKey = '';
  for (const el of cells) el.classList.remove('ghost', 'glow');
}

function showGhost(piece, row, col) {
  const key = `${row},${col}`;
  if (key === ghostKey) return;
  clearGhost();
  const lines = previewLines(board, piece, row, col);
  if (!lines) return;
  ghostKey = key;
  boardEl.style.setProperty('--g', `var(--c${piece.color})`);
  for (const [r, c] of piece.cells) cells[(row + r) * SIZE + col + c].classList.add('ghost');
  for (const r of lines.rows) for (let c = 0; c < SIZE; c++) cells[r * SIZE + c].classList.add('glow');
  for (const c of lines.cols) for (let r = 0; r < SIZE; r++) cells[r * SIZE + c].classList.add('glow');
}

trayEl.addEventListener('pointerdown', e => {
  const slot = e.target.closest('.slot');
  if (!slot || busy || drag) return;
  const index = Number(slot.dataset.i);
  const piece = tray[index];
  if (!piece) return;
  e.preventDefault();
  slot.setPointerCapture(e.pointerId);
  drag = { index, piece, pointerId: e.pointerId, slot };
  dragEl.replaceChildren(pieceEl(piece));
  dragEl.hidden = false;
  slot.classList.add('lifted');
  moveDrag(e.clientX, e.clientY);
});

trayEl.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.pointerId) moveDrag(e.clientX, e.clientY);
});

function endDrag(e, drop) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { index, piece, slot } = drag;
  const { row, col } = targetCell(e.clientX, e.clientY);
  drag = null;
  clearGhost();
  dragEl.hidden = true;
  slot.classList.remove('lifted');
  if (drop && canPlace(board, piece, row, col)) placePiece(index, piece, row, col);
}

trayEl.addEventListener('pointerup', e => endDrag(e, true));
trayEl.addEventListener('pointercancel', e => endDrag(e, false));

// ---------- Turn ----------

function placePiece(index, piece, row, col) {
  board = place(board, piece, row, col, piece.color);
  tray[index] = null;
  const lines = fullLines(board);
  drawBoard();
  if (lines.rows.length || lines.cols.length) {
    busy = true;
    board.forEach((line, r) => line.forEach((_, c) => {
      if (lines.rows.includes(r) || lines.cols.includes(c)) cells[r * SIZE + c].classList.add('clearing');
    }));
    setTimeout(() => {
      cells.forEach(el => el.classList.remove('clearing'));
      board = clearLines(board, lines);
      score = scorePlacement(score, piece.cells.length, lines, boardEmpty(board));
      showPop(piece, row, col, score);
      saveBest();
      busy = false;
      afterTurn();
    }, CLEAR_MS);
  } else {
    score = scorePlacement(score, piece.cells.length, lines);
    saveBest();
    afterTurn();
  }
}

function afterTurn() {
  if (trayEmpty(tray)) {
    if (trickSet) {
      score = { ...score, score: score.score + TRICK_BONUS };
      saveBest();
      showSolved();
    }
    tray = dealNext();
  }
  draw();
  if (isGameOver(board, tray)) {
    document.getElementById('final').textContent = score.score.toLocaleString();
    document.getElementById('newbest').hidden = !newBest;
    overEl.hidden = false;
  }
}

document.getElementById('again').addEventListener('click', () => {
  board = emptyBoard();
  tray = dealTray();
  trickSet = false;
  score = newScore();
  newBest = false;
  overEl.hidden = true;
  draw();
});

applyStyle();
draw();
