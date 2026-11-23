import {
  SIZE, emptyBoard, canPlace, place, fullLines,
  isGameOver, dealTray, trayEmpty, fitsAnywhere, previewLines,
  newScore, scorePlacement, boardEmpty,
  dealTrickTray, TRICK_CHANCE, TRICK_BONUS,
  applyGravity, scoreChain, MODES,
  dayKey, dailyTray, shareText, shortDay,
  addSpecials, resolveClear, SPECIAL_CHANCE, SPECIAL_KINDS, GRAVITY_KINDS, GRAVITY_SPECIAL_CHANCE, specialPoints, colorOf, specialOf,
} from './logic.js?v=27';
import { online, queueScore, fetchBoard } from './online.js?v=27';
import { sfx, unlock, setSoundOn } from './sound.js?v=27';

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
let day = '';  // Daily Duel: the day this game belongs to
let setNo = 0; // Daily Duel: which set of the day is in the tray

// ---------- Players and best scores (saved on this device) ----------

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: just don't save */ }
  },
};
// Players are added by name on this device. Phones that already had Jason and
// Amy keep them; a new phone starts by asking for a name.
const savedPlayer = store.get('blockit.player', null);
const firstVisit = savedPlayer === null;
let players = store.get('blockit.players', null);
if (!Array.isArray(players) || !players.length) players = firstVisit ? [] : ['Jason', 'Amy'];
if (typeof savedPlayer === 'string' && !players.includes(savedPlayer)) players.push(savedPlayer);
let player = players.includes(savedPlayer) ? savedPlayer : (players[0] || 'Player');
// ---------- Mode (saved on this device) ----------

let mode = MODES.some(m => m.id === store.get('blockit.mode')) ? store.get('blockit.mode') : 'classic';
const gravity = () => mode === 'gravity';
let specials = store.get('blockit.specials', false) === true;
let soundOn = store.get('blockit.sound', true) !== false;
setSoundOn(soundOn);
// Phones only allow sound after a touch, so wake the audio on the first one.
document.addEventListener('pointerdown', unlock, { capture: true });

// Each mode, with or without special blocks, keeps its own game and best.
// Classic without specials keeps the original 'blockit.best'.
const daily = () => mode === 'daily';
// Daily Duel always uses plain Classic rules, so specials don't apply.
const variant = () => (specials && !daily() ? `${mode}-special` : mode);
const bestKey = () => (variant() === 'classic' ? 'blockit.best' : `blockit.best.${variant()}`);
let bests = store.get(bestKey(), {});
const best = () => bests[player] || 0;

function saveBest() {
  if (score.score > best()) {
    bests[player] = score.score;
    store.set(bestKey(), bests);
    newBest = true;
    // A Duel score goes online when the Duel ends, with its day.
    if (!daily()) queueScore({ player, mode: variant(), score: score.score });
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
  // Seasonal styles: a tab of their own in the Style sheet.
  { id: 'halloween', name: 'Halloween', group: 'seasonal' },
  { id: 'thanksgiving', name: 'Thanksgiving', group: 'seasonal' },
  { id: 'snowfall', name: 'Winter', group: 'seasonal' },
  { id: 'gift', name: 'Christmas', group: 'seasonal' },
];
const STYLE_GROUPS = [
  { id: 'everyday', name: 'Everyday' },
  { id: 'seasonal', name: '❄️ Seasonal' },
];
const groupOf = s => s.group || 'everyday';
const styles = store.get('blockit.style', {});
const stylesEl = document.getElementById('styles');
const swatchesEl = document.getElementById('swatches');
const styleTabsEl = document.getElementById('styletabs');
let styleTab = 'everyday';

function currentStyle() {
  return STYLES.some(s => s.id === styles[player]) ? styles[player] : STYLES[0].id;
}

function showStyleTab(tab) {
  styleTab = tab;
  for (const b of styleTabsEl.children) b.setAttribute('aria-pressed', String(b.dataset.id === tab));
  for (const b of swatchesEl.children) b.hidden = b.dataset.group !== tab;
}

function applyStyle() {
  const id = currentStyle();
  document.documentElement.dataset.style = id;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').content = bg;
  for (const b of swatchesEl.children) b.setAttribute('aria-pressed', String(b.dataset.id === id));
}

styleTabsEl.replaceChildren(...STYLE_GROUPS.map(g => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.id = g.id;
  b.textContent = g.name;
  b.addEventListener('click', () => showStyleTab(g.id));
  return b;
}));

swatchesEl.replaceChildren(...STYLES.map(s => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.dataset.id = s.id;
  b.dataset.group = groupOf(s);
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
showStyleTab(styleTab);

document.getElementById('palette').addEventListener('click', () => {
  // Open on the tab that holds the style in use.
  showStyleTab(groupOf(STYLES.find(s => s.id === currentStyle())));
  stylesEl.hidden = false;
});
document.getElementById('styles-close').addEventListener('click', () => { stylesEl.hidden = true; });
stylesEl.addEventListener('click', e => { if (e.target === stylesEl) stylesEl.hidden = true; });

// ---------- Players sheet ----------
// Tap the name at the top right to pick who's playing or add a new name.

const playersEl = document.getElementById('players');
const playerListEl = document.getElementById('playerlist');
const nameForm = document.getElementById('nameform');
const nameInput = document.getElementById('name');
const NAME_MAX = 12;

function choosePlayer(name) {
  player = name;
  store.set('blockit.player', player);
  store.set('blockit.players', players);
  applyStyle();
  newBest = false;
  saveBest();
  drawScore();
  playersEl.hidden = true;
  if (daily()) switchGame(); // each player has their own Daily Duel game
}

function drawPlayers() {
  playerListEl.replaceChildren(...players.map(name => {
    const row = document.createElement('div');
    row.className = 'player-row';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-btn';
    b.setAttribute('aria-pressed', String(name === player));
    const n = document.createElement('b');
    n.textContent = name;
    const sub = document.createElement('span');
    sub.textContent = `Best ${(bests[name] || 0).toLocaleString()}`;
    b.append(n, sub);
    b.addEventListener('click', () => choosePlayer(name));
    row.append(b);
    // Anyone but the one playing can be taken off the list (their bests stay saved).
    if (name !== player) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'remove-btn';
      x.setAttribute('aria-label', `Remove ${name}`);
      x.textContent = '✕';
      x.addEventListener('click', () => {
        players = players.filter(p => p !== name);
        store.set('blockit.players', players);
        drawPlayers();
      });
      row.append(x);
    }
    return row;
  }));
}

function openPlayers(first = false) {
  document.getElementById('players-title').textContent = first ? 'Enter your name' : "Who's playing?";
  playerListEl.hidden = first;
  document.getElementById('players-close').hidden = first;
  nameInput.value = '';
  nameInput.placeholder = first ? 'Your name' : 'New player name';
  document.getElementById('name-go').textContent = first ? 'Play' : 'Add';
  drawPlayers();
  playersEl.hidden = false;
  if (first) nameInput.focus();
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = nameInput.value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  if (!name) { nameInput.focus(); return; }
  const same = players.find(p => p.toLowerCase() === name.toLowerCase());
  if (!same) players.push(name);
  nameInput.blur();
  choosePlayer(same || name);
});

document.getElementById('player').addEventListener('click', () => {
  if (busy || drag) return;
  openPlayers();
});
document.getElementById('players-close').addEventListener('click', () => { playersEl.hidden = true; });
playersEl.addEventListener('click', e => {
  if (e.target === playersEl && !document.getElementById('players-close').hidden) playersEl.hidden = true;
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
  modeTagEl.textContent = `${MODES.find(m => m.id === mode).name}${specials && !daily() ? ' · Specials' : ''} ▾`;
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
  if (daily()) { setNo++; trickSet = false; return dailyTray(day, setNo, board); }
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
  sfx.place();
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
  if (res.bombs.length) { explode(res); sfx.boom(); } else sfx.clear(lines.rows.length + lines.cols.length);
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
    cheer(score);
    saveBest();
    return;
  }
  await drop();
  score = scorePlacement(score, piece.cells.length, lines, boardEmpty(board));
  addSpecialPoints(res);
  showPop(piece, row, col, score);
  cheer(score);
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
    if (score.bonus) sfx.fanfare(); else sfx.combo(chain);
    saveBest();
  }
}

// Extra sound on top of the clear: a fanfare for an empty board, a rising run for a streak.
function cheer(result) {
  if (result.bonus) sfx.fanfare();
  else if (result.streak > 1) sfx.combo(result.streak);
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
      sfx.fanfare();
    }
    tray = dealNext();
  }
  draw();
  if (!isGameOver(board, tray)) {
    saveGame();
  } else {
    forgetGame(); // a finished game isn't resumed; next time starts fresh
    if (daily()) saveDailyScore();
    showOver();
    sfx.gameOver();
  }
}

// ---------- Game over / Daily Duel results ----------

const againBtn = document.getElementById('again');
const overAltBtn = document.getElementById('over-alt');

function showOver() {
  document.getElementById('final').textContent = score.score.toLocaleString();
  document.getElementById('newbest').hidden = !newBest;
  const title = overEl.querySelector('h2');
  const hint = overEl.querySelector('.hint');
  if (daily()) {
    title.textContent = `Daily Duel ${shortDay(day)}`;
    const scores = dailyScores();
    hint.textContent = Object.keys(scores).length > 1
      ? Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${v.toLocaleString()}`).join(' · ')
      : 'New pieces tomorrow. Send your score to compare!';
    againBtn.textContent = 'Share score';
    overAltBtn.hidden = false;
  } else {
    title.textContent = 'No moves left';
    hint.textContent = 'None of your pieces fit on the board.';
    againBtn.textContent = 'Play again';
    overAltBtn.hidden = true;
  }
  overEl.hidden = false;
}

// Today's Daily Duel scores on this phone, by player. Older days are dropped.
function dailyScores() {
  const d = store.get('blockit.daily', null);
  return d && d.day === dayKey() && d.scores ? d.scores : {};
}

function saveDailyScore() {
  const scores = { ...dailyScores(), [player]: score.score };
  store.set('blockit.daily', { day, scores });
  queueScore({ player, mode: 'daily', score: score.score, day });
}

async function shareScore() {
  const text = shareText(day, score.score, player);
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch { return; /* closed the share sheet */ }
  try {
    await navigator.clipboard.writeText(text);
    againBtn.textContent = 'Copied!';
    setTimeout(() => { againBtn.textContent = 'Share score'; }, 1500);
  } catch {
    againBtn.textContent = text;
  }
}

// ---------- Saved games ----------
// Each mode keeps its own game in progress on this device, so switching modes
// (or closing the page) and coming back picks up where you left off.

// Daily Duel keeps one game per player, since each gets one try a day.
const gameKey = () => (daily() ? `blockit.game.daily.${player}` : `blockit.game.${variant()}`);

function saveGame() {
  store.set(gameKey(), { board, tray, score, trickSet, day, setNo });
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
  if (daily() && g.day !== dayKey()) return false; // yesterday's duel is over
  day = g.day || '';
  setNo = g.setNo || 0;
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
  trickSet = false;
  score = newScore();
  newBest = false;
  overEl.hidden = true;
  if (daily()) {
    day = dayKey();
    setNo = 0;
    tray = dailyTray(day, 0);
    // One try a day: if this player already played today, show their result.
    const done = dailyScores()[player];
    if (done !== undefined) {
      score = { ...score, score: done };
      tray = [null, null, null];
      draw();
      showOver();
      return;
    }
  } else {
    tray = specials ? withSpecials(dealTray()) : dealTray();
  }
  saveGame();
  draw();
}

againBtn.addEventListener('click', () => (daily() ? shareScore() : newGame()));
overAltBtn.addEventListener('click', () => {
  mode = 'classic';
  store.set('blockit.mode', mode);
  switchGame();
});

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
      drawSpecials();
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
  specialsBtn.setAttribute('aria-pressed', String(specials && !daily()));
  specialsBtn.querySelector('b').textContent = daily() ? 'Off' : specials ? 'On' : 'Off';
  specialsBtn.disabled = daily();
  document.getElementById('newgame').hidden = daily(); // one try a day
}
specialsBtn.addEventListener('click', () => {
  specials = !specials;
  store.set('blockit.specials', specials);
  drawSpecials();
  switchGame();
});

const soundBtn = document.getElementById('sound');
function drawSound() {
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.querySelector('b').textContent = soundOn ? 'On' : 'Off';
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  store.set('blockit.sound', soundOn);
  setSoundOn(soundOn);
  drawSound();
  sfx.place(); // a little knock so you hear it's back on
});

modeTagEl.addEventListener('click', () => {
  if (busy || drag) return;
  drawModes();
  drawSpecials();
  drawSound();
  modesEl.hidden = false;
});
document.getElementById('newgame').addEventListener('click', () => {
  modesEl.hidden = true;
  newGame();
});
// ---------- Scoreboard ----------
// Every player on this phone: best in each mode, and today's Daily Duel.
// A crown marks the top score in each row.

const scoresEl = document.getElementById('scores');
const BOARD_TABS = [
  { id: 'classic', name: 'Classic', key: 'blockit.best' },
  { id: 'gravity', name: 'Gravity', key: 'blockit.best.gravity' },
  { id: 'classic-special', name: 'Classic ✦', key: 'blockit.best.classic-special' },
  { id: 'gravity-special', name: 'Gravity ✦', key: 'blockit.best.gravity-special' },
  { id: 'today', name: 'Duel today' },
  { id: 'daily', name: 'Duel best', key: 'blockit.best.daily' },
];
let boardTab = 'classic';
let onlineBoard = null; // last scores fetched from the server
let boardNote = '';

// Scores for a tab: the server's when we have them, merged with this phone's
// (so a score that hasn't been sent yet still shows).
function tabScores(tab) {
  const local = tab.id === 'today' ? dailyScores() : store.get(tab.key, {});
  const remote = onlineBoard ? (tab.id === 'today' ? onlineBoard.today : onlineBoard.bests[tab.id] || {}) : {};
  const all = { ...remote };
  for (const [p, v] of Object.entries(local)) all[p] = Math.max(all[p] || 0, v);
  return Object.entries(all).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

function drawScoreboard() {
  const tabsEl = document.getElementById('scoretabs');
  tabsEl.replaceChildren(...BOARD_TABS.map(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t.name;
    b.setAttribute('aria-pressed', String(t.id === boardTab));
    b.addEventListener('click', () => { boardTab = t.id; drawScoreboard(); });
    return b;
  }));
  const rows = tabScores(BOARD_TABS.find(t => t.id === boardTab));
  const medals = ['👑', '🥈', '🥉'];
  const list = document.getElementById('scorelist');
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No scores yet';
    list.replaceChildren(li);
  } else {
    list.replaceChildren(...rows.map(([name, v], i) => {
      const li = document.createElement('li');
      if (name === player) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = medals[i] || String(i + 1);
      const who = document.createElement('span');
      who.className = 'who-name';
      who.textContent = name;
      const pts = document.createElement('b');
      pts.textContent = v.toLocaleString();
      li.append(rank, who, pts);
      return li;
    }));
  }
  document.getElementById('scorenote').textContent = boardNote
    || (online() ? 'Everyone, on every phone.' : 'Everyone who plays on this phone.');
}

async function refreshOnline() {
  if (!online()) return;
  boardNote = 'Loading scores from everyone…';
  drawScoreboard();
  try {
    onlineBoard = await fetchBoard(dayKey());
    boardNote = '';
  } catch {
    boardNote = "Couldn't reach the online scores. Showing this phone.";
  }
  if (!scoresEl.hidden) drawScoreboard();
}

// The first time the online board is on, send this phone's existing bests.
if (online() && !store.get('blockit.synced', false)) {
  for (const t of BOARD_TABS) {
    if (!t.key || t.id === 'daily') continue;
    for (const [p, v] of Object.entries(store.get(t.key, {}))) queueScore({ player: p, mode: t.id, score: v });
  }
  for (const [p, v] of Object.entries(dailyScores())) queueScore({ player: p, mode: 'daily', score: v, day: dayKey() });
  store.set('blockit.synced', true);
}

document.getElementById('scores-open').addEventListener('click', () => {
  modesEl.hidden = true;
  boardTab = daily() ? 'today' : variant();
  drawScoreboard();
  scoresEl.hidden = false;
  refreshOnline();
});
document.getElementById('scores-close').addEventListener('click', () => { scoresEl.hidden = true; });
scoresEl.addEventListener('click', e => { if (e.target === scoresEl) scoresEl.hidden = true; });

document.getElementById('modes-close').addEventListener('click', () => { modesEl.hidden = true; });
modesEl.addEventListener('click', e => { if (e.target === modesEl) modesEl.hidden = true; });

applyStyle();
if (loadGame()) draw(); else newGame();
if (firstVisit) openPlayers(true);
