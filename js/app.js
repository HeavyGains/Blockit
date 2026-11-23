import {
  SIZE, emptyBoard, canPlace, place, fullLines,
  isGameOver, dealTray, trayEmpty, fitsAnywhere, previewLines,
  newScore, scorePlacement, boardEmpty,
  dealTrickTray, TRICK_CHANCE, TRICK_BONUS,
  applyGravity, scoreChain, MODES,
  addSpecials, resolveClear, SPECIAL_CHANCE, SPECIAL_KINDS, GRAVITY_KINDS, GRAVITY_SPECIAL_CHANCE, specialPoints, colorOf, specialOf,
} from './logic.js?v=14';

const LIFT = 56;      // px the dragged piece floats above the finger, so it stays visible
const CLEAR_MS = 220; // matches the pop animation in style.css
const BLAST_MS = 560; // a clear with a bomb in it takes a little longer
const FALL_MS = 260;  // matches the fall animation in style.css
const CHAIN_PAUSE = 120; // beat between a landing and the next clear
const wait = ms => new Promise(res => setTimeout(res, ms));

const boardEl = document.getElementById('board');
const trayEl = document.getElementById('tray');
const dragEl = document.getElementById('drag');
const overEl = document.getElementById('over');
const scoreEl = document.getElementById('score');
const streakEl = document.getElementById('streak');
const bestEl = document.getElementById('best');
const whoEl = document.getElementById('who');
const modeTagEl = document.getElementById('modetag');

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
// ---------- Mode (saved on this device) ----------

let mode = MODES.some(m => m.id === store.get('blockit.mode')) ? store.get('blockit.mode') : 'classic';
const gravity = () => mode === 'gravity';
let specials = store.get('blockit.specials', false) === true;

// Each mode, with or without special blocks, keeps its own game and best.
// Classic without specials keeps the original 'blockit.best'.
const variant = () => (specials ? `${mode}-special` : mode);
const bestKey = () => (variant() === 'classic' ? 'blockit.best' : `blockit.best.${variant()}`);
let bests = store.get(bestKey(), {});
const best = () => bests[player] || 0;

function saveBest() {
  if (score.score > best()) {
    bests[player] = score.score;
    store.set(bestKey(), bests);
    newBest = true;
  }
}

// ---------- Styles (saved per player) ----------

const STYLES = [
  { id: 'paper', name: 'Paper stickers' },
  { id: 'neon', name: 'Neon arcade' },
  { id: 'neon-sunset', name: 'Neon sunset' },
  { id: 'neon-ice', name: 'Neon ice' },
  { id: 'neon-toxic', name: 'Neon toxic' },
  { id: 'candy', name: 'Candy jelly' },
  { id: 'wood', name: 'Woodshop' },
  { id: 'chalk', name: 'Chalkboard' },
  { id: 'pixel', name: 'Pixel' },
  { id: 'garden', name: 'Garden' },
  { id: 'camo', name: 'Camo' },
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
    if (v === null) el.removeAttribute('data-c'); else el.dataset.c = colorOf(v);
    const kind = specialOf(v);
    if (kind) el.dataset.s = kind; else el.removeAttribute('data-s');
  }));
}

function pieceEl(piece) {
  const el = document.createElement('div');
  el.className = 'piece';
  piece.cells.forEach(([r, c], i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.c = piece.color;
    if (piece.special && piece.special.i === i) cell.dataset.s = piece.special.s;
    cell.style.setProperty('--r', r + 1);
    cell.style.setProperty('--col', c + 1);
    el.appendChild(cell);
  });
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
  modeTagEl.textContent = `${MODES.find(m => m.id === mode).name}${specials ? ' · Specials' : ''} ▾`;
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
  if (result.chain) notes.push(`chain x${result.chain}`);
  else if (result.streak > 1) notes.push(`streak x${result.streak}`);
  if (result.bonus) notes.push('board clear!');
  if (result.specialNotes) notes.push(...result.specialNotes);
  if (result.specialNotes?.includes('boom!')) el.classList.add('boom');
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

// Gravity also deals anchor and flip blocks.
const withSpecials = t => (gravity()
  ? addSpecials(t, Math.random, GRAVITY_SPECIAL_CHANCE, GRAVITY_KINDS)
  : addSpecials(t, Math.random, SPECIAL_CHANCE, SPECIAL_KINDS));

// About 1 set in TRICK_CHANCE is a trick set when the board allows one.
function dealNext() {
  // Trick sets are solved with Classic rules, so they only come in Classic.
  if (specials) return withSpecials(dealTray(Math.random, board));
  const trick = !gravity() && Math.random() < TRICK_CHANCE ? dealTrickTray(Math.random, board) : null;
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
  const flip = gravity() && piece.special?.s === 'flip';
  if (lines.rows.length || lines.cols.length) {
    busy = true;
    resolveClears(piece, row, col, lines).then(() => { busy = false; afterTurn(); });
  } else if (flip) {
    // A flip works the moment it lands: its column falls up right away,
    // which can fill lines and start a chain.
    busy = true;
    (async () => {
      await wait(80);
      await drop([col + piece.cells[piece.special.i][1]]);
      const after = fullLines(board);
      if (after.rows.length || after.cols.length) await resolveClears(piece, row, col, after);
      else { score = scorePlacement(score, piece.cells.length, after); saveBest(); }
      busy = false;
      afterTurn();
    })();
  } else {
    score = scorePlacement(score, piece.cells.length, lines);
    saveBest();
    afterTurn();
  }
}

// Flash the full lines, then empty them.
// Flash the full lines (and any bomb blasts), then empty them. Stones only
// crack. Returns what the specials did, for scoring.
async function clearWithFlash(lines) {
  const res = resolveClear(board, lines);
  const inLine = (r, c) => lines.rows.includes(r) || lines.cols.includes(c);
  for (const key of res.hit) {
    const [r, c] = key.split(',').map(Number);
    const el = cells[r * SIZE + c];
    if (specialOf(board[r][c]) === 'stone') el.classList.add('cracking');
    else if (res.bombs.length && !inLine(r, c)) {
      if (board[r][c] !== null) el.classList.add('blasting');
    } else el.classList.add('clearing');
  }
  if (res.bombs.length) explode(res);
  await wait(res.bombs.length ? BLAST_MS : CLEAR_MS);
  cells.forEach(el => el.classList.remove('clearing', 'cracking', 'blasting'));
  board = res.board;
  drawBoard();
  return res;
}

// ---------- Explosions ----------
// Each bomb: a flash, a shock ring, sparks, and the blocks it destroys flying
// outward as debris. The board shakes and Android phones buzz.

function cellCenter(r, c) {
  const el = cells[r * SIZE + c];
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, size: el.offsetWidth };
}

function explode(res) {
  boardEl.classList.remove('shake');
  void boardEl.offsetWidth; // restart the shake if it was already running
  boardEl.classList.add('shake');
  setTimeout(() => boardEl.classList.remove('shake'), 450);
  try { navigator.vibrate?.([70, 40, 120]); } catch { /* no vibration */ }
  res.bombs.forEach(([br, bc], n) => setTimeout(() => blastAt(br, bc, res), n * 110));
}

function blastAt(br, bc, res) {
  const { x, y, size } = cellCenter(br, bc);
  const fx = document.createElement('div');
  fx.className = 'blast';
  fx.style.left = `${x}px`;
  fx.style.top = `${y}px`;
  fx.style.setProperty('--s', `${size}px`);
  const flash = document.createElement('i');
  flash.className = 'flash';
  const ring = document.createElement('i');
  ring.className = 'ring';
  fx.append(flash, ring);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const d = size * (1.6 + Math.random() * 1.6);
    const spark = document.createElement('i');
    spark.className = 'spark';
    spark.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    spark.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    fx.append(spark);
  }
  // Debris: the blocks around this bomb fly away from it, tumbling.
  for (const key of res.hit) {
    const [r, c] = key.split(',').map(Number);
    if (Math.abs(r - br) > 1 || Math.abs(c - bc) > 1) continue;
    const el = cells[r * SIZE + c];
    if (!el.dataset.c || el.dataset.s === 'stone') continue;
    const chunk = document.createElement('i');
    chunk.className = 'debris';
    chunk.style.background = getComputedStyle(el).getPropertyValue('--k');
    const dx = (c - bc || (Math.random() - 0.5)) * size * (1.8 + Math.random());
    const dy = (r - br || (Math.random() - 0.5)) * size * (1.8 + Math.random()) - size * 0.8;
    chunk.style.setProperty('--x0', `${(c - bc) * size}px`);
    chunk.style.setProperty('--y0', `${(r - br) * size}px`);
    chunk.style.setProperty('--dx', `${dx}px`);
    chunk.style.setProperty('--dy', `${dy}px`);
    chunk.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
    fx.append(chunk);
  }
  boardEl.appendChild(fx);
  setTimeout(() => fx.remove(), 900);
}

// Add the points specials earned (bomb blasts, stars) to the last score result.
function addSpecialPoints(res) {
  const extra = specialPoints(res, score.streak);
  const notes = [];
  if (res.blast) notes.push('boom!');
  if (res.stars) notes.push(res.stars > 1 ? `${res.stars} stars` : 'star!');
  score = { ...score, score: score.score + extra, gained: score.gained + extra, specialNotes: notes };
}

// Clears from one placement. In Gravity, blocks then fall, and any lines they
// fill clear too, again and again (a chain), each step worth more.
async function resolveClears(piece, row, col, lines) {
  const res = await clearWithFlash(lines);
  if (!gravity()) {
    score = scorePlacement(score, piece.cells.length, lines, boardEmpty(board));
    addSpecialPoints(res);
    showPop(piece, row, col, score);
    saveBest();
    return;
  }
  await drop();
  score = scorePlacement(score, piece.cells.length, lines, boardEmpty(board));
  addSpecialPoints(res);
  showPop(piece, row, col, score);
  saveBest();
  for (let chain = 2; ; chain++) {
    const next = fullLines(board);
    if (!next.rows.length && !next.cols.length) break;
    await wait(CHAIN_PAUSE);
    const step = await clearWithFlash(next);
    await drop();
    score = scoreChain(score, next, chain, boardEmpty(board));
    addSpecialPoints(step);
    showChainPop(next, score);
    saveBest();
  }
}

// Let every block fall, with each one sliding down from where it was.
async function drop(onlyCols = null) {
  const { board: next, falls } = applyGravity(board, onlyCols);
  board = next;
  drawBoard();
  let moved = false;
  falls.forEach((line, r) => line.forEach((n, c) => {
    if (!n) return;
    moved = true;
    const el = cells[r * SIZE + c];
    el.style.setProperty('--fall', n);
    el.classList.add('falling');
  }));
  if (!moved) return;
  await wait(FALL_MS);
  for (const el of cells) { el.classList.remove('falling'); el.style.removeProperty('--fall'); }
}

// Pop for a chain step, in the middle of the lines it cleared.
function showChainPop(lines, result) {
  const mid = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : (SIZE - 1) / 2);
  const fake = { cells: [[0, 0]] };
  showPop(fake, mid(lines.rows), mid(lines.cols), result);
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
  if (!isGameOver(board, tray)) {
    saveGame();
  } else {
    forgetGame(); // a finished game isn't resumed; next time starts fresh
    document.getElementById('final').textContent = score.score.toLocaleString();
    document.getElementById('newbest').hidden = !newBest;
    overEl.hidden = false;
  }
}

// ---------- Saved games ----------
// Each mode keeps its own game in progress on this device, so switching modes
// (or closing the page) and coming back picks up where you left off.

const gameKey = () => `blockit.game.${variant()}`;

function saveGame() {
  store.set(gameKey(), { board, tray, score, trickSet });
}

function forgetGame() {
  try { localStorage.removeItem(gameKey()); } catch { /* nothing saved */ }
}

// Load this mode's saved game. False if there isn't a usable one.
function loadGame() {
  const g = store.get(gameKey(), null);
  const ok = g && Array.isArray(g.board) && g.board.length === SIZE
    && g.board.every(line => Array.isArray(line) && line.length === SIZE)
    && Array.isArray(g.tray) && g.tray.length === 3 && g.score && typeof g.score.score === 'number';
  if (!ok || isGameOver(g.board, g.tray)) return false;
  board = g.board;
  tray = g.tray;
  score = g.score;
  trickSet = !!g.trickSet;
  newBest = false;
  overEl.hidden = true;
  return true;
}

function newGame() {
  board = emptyBoard();
  tray = specials ? withSpecials(dealTray()) : dealTray();
  trickSet = false;
  score = newScore();
  newBest = false;
  overEl.hidden = true;
  saveGame();
  draw();
}

document.getElementById('again').addEventListener('click', newGame);

// ---------- Mode menu ----------
// Picking a mode resumes its saved game, or starts one. Picking the one you're
// in just closes. New game starts the current mode over.

const modesEl = document.getElementById('modes');
const modeListEl = document.getElementById('modelist');

function drawModes() {
  modeListEl.replaceChildren(...MODES.map(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-btn';
    b.setAttribute('aria-pressed', String(m.id === mode));
    const name = document.createElement('b');
    name.textContent = m.name;
    const about = document.createElement('span');
    about.textContent = m.about;
    b.append(name, about);
    b.addEventListener('click', () => {
      modesEl.hidden = true;
      if (m.id === mode) return;
      mode = m.id;
      store.set('blockit.mode', mode);
      switchGame();
    });
    return b;
  }));
}

// After the mode or the specials switch changes: resume that game, or start one.
function switchGame() {
  bests = store.get(bestKey(), {});
  if (loadGame()) draw(); else newGame();
}

const specialsBtn = document.getElementById('specials');
function drawSpecials() {
  specialsBtn.setAttribute('aria-pressed', String(specials));
  specialsBtn.querySelector('b').textContent = specials ? 'On' : 'Off';
}
specialsBtn.addEventListener('click', () => {
  specials = !specials;
  store.set('blockit.specials', specials);
  drawSpecials();
  switchGame();
});

modeTagEl.addEventListener('click', () => {
  if (busy || drag) return;
  drawModes();
  drawSpecials();
  modesEl.hidden = false;
});
document.getElementById('newgame').addEventListener('click', () => {
  modesEl.hidden = true;
  newGame();
});
document.getElementById('modes-close').addEventListener('click', () => { modesEl.hidden = true; });
modesEl.addEventListener('click', e => { if (e.target === modesEl) modesEl.hidden = true; });

applyStyle();
if (loadGame()) draw(); else newGame();
