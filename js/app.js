import {
  SIZE, emptyBoard, canPlace, place, fullLines,
  isGameOver, dealTray, trayEmpty, fitsAnywhere, previewLines,
  newScore, scorePlacement, boardEmpty,
  dealTrickTray, TRICK_CHANCE, TRICK_BONUS, playMove, gravityMove,
  applyGravity, scoreChain, MODES,
  dayKey, dailyTray, shareText, shortDay, duelId, duelName,
  addSpecials, resolveClear, SPECIAL_CHANCE, SPECIAL_KINDS, GRAVITY_KINDS, GRAVITY_SPECIAL_CHANCE, specialPoints, colorOf, specialOf,
} from './logic.js?v=60';
import {
  HEX_RADIUS, emptyHexBoard, canPlaceHex, placeHex, hexFullLines, hexLineCount, hexClearedCells,
  fitsAnywhereHex, isHexGameOver, previewHexLines, dealHexTray, scoreHexPlacement, dailyHexTray, resolveHexClear,
  applyHexGravity, scoreHexChain, hexMove, hexGravityMove, dealHexTrickTray,
} from './hex.js?v=60';
import { online, queueScore, fetchBoard } from './online.js?v=60';
import { sfx, unlock, setSoundOn } from './sound.js?v=60';
import { haptic, setHapticsOn } from './haptics.js?v=60';

const LIFT = 84;      // px the dragged piece floats above the finger, so it stays visible
const GAIN = 1.4;     // the piece travels 1.4x the finger's movement, so short swipes reach the far side
const CLEAR_MS = 220; // matches the pop animation in style.css
const BLAST_MS = 560; // a clear with a bomb in it takes a little longer
const FALL_MS = 260;  // matches the fall animation in style.css
const HEX_FALL_MS = 300; // Hex Gravity's shortest fall; longer falls take a bit longer
const CHAIN_PAUSE = 120; // beat between a landing and the next clear
const WAVE_MS = 170;  // a clear ripples out from the piece over at most this long
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
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
let tray = [null, null, null]; // dealt by loadGame or newGame below
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

// Daily Duel used to be its own mode (Classic rules). Now it's a switch that
// works with every mode; an old 'daily' setting becomes Classic with the switch on.
let duel = store.get('blockit.duel', false) === true;
let specials = store.get('blockit.specials', false) === true;
if (store.get('blockit.mode') === 'daily') {
  duel = true;
  specials = false; // the old duel never had specials; keeps today's game going
  store.set('blockit.duel', true);
  store.set('blockit.specials', false);
  store.set('blockit.mode', 'classic');
}
let mode = MODES.some(m => m.id === store.get('blockit.mode')) ? store.get('blockit.mode') : 'classic';
const gravity = () => mode === 'gravity';
// Hex: a hexagon board where lines clear 3 ways (rules in hex.js). Specials
// work as in Classic (a bomb blasts the 6 hexes around it).
const hex = () => mode === 'hex' || mode === 'hexgravity';
// Hex Gravity: Hex, where blocks pour down like sand after a clear (hex.js).
const hexGravity = () => mode === 'hexgravity';
// Either kind of Gravity: blocks fall after a clear, and chains score more.
const anyGravity = () => gravity() || hexGravity();
let soundOn = store.get('blockit.sound', true) !== false;
setSoundOn(soundOn);
let hapticsOn = store.get('blockit.haptics', true) !== false;
setHapticsOn(hapticsOn);
// Phones only allow sound after a touch, so wake the audio on the first one.
document.addEventListener('pointerdown', unlock, { capture: true });

// Each mode, with or without special blocks, keeps its own game and best.
// Classic without specials keeps the original 'blockit.best'.
// Each of those also has its own Daily Duel, with its own best.
const daily = () => duel;
const variant = () => (specials ? `${mode}-special` : mode);
const plainBestKey = v => (v === 'classic' ? 'blockit.best' : `blockit.best.${v}`);
const bestKey = () => (daily() ? `blockit.best.${duelId(variant())}` : plainBestKey(variant()));
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
  { id: 'cubes', name: 'Cubes' },
  { id: 'softcubes', name: 'Soft cubes' },
  { id: 'jewel', name: 'Jewel' },
  { id: 'neoncubes', name: 'Neon cubes' },
  { id: 'classic', name: 'Classic' },
  // Seasonal styles: a tab of their own in the Style sheet.
  { id: 'spring', name: 'Spring', group: 'seasonal' },
  { id: 'easter', name: 'Easter', group: 'seasonal' },
  { id: 'summer', name: 'Summer', group: 'seasonal' },
  { id: 'july4', name: '4th of July', group: 'seasonal' },
  { id: 'fall', name: 'Fall', group: 'seasonal' },
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

// ---------- Board shape ----------
// Square modes use logic.js; Hex uses hex.js. The app works in board rows and
// columns either way: for Hex, row = r + HEX_RADIUS and col = q + HEX_RADIUS,
// which is how hex.js stores its board, and a hex piece's cells are [q, r].

const HR = HEX_RADIUS;
const HEX_H = 2 / Math.sqrt(3); // a hex cell's height, in cell widths
const HEX_ROW = Math.sqrt(3) / 2; // distance between hex rows, in cell widths
const side = () => (hex() ? HR * 2 + 1 : SIZE);
const G = {
  empty: () => (hex() ? emptyHexBoard() : emptyBoard()),
  canPlace: (b, p, row, col) => (hex() ? canPlaceHex(b, p, col - HR, row - HR) : canPlace(b, p, row, col)),
  place: (b, p, row, col, color) => (hex() ? placeHex(b, p, col - HR, row - HR, color) : place(b, p, row, col, color)),
  fullLines: b => (hex() ? hexFullLines(b) : fullLines(b)),
  count: lines => (hex() ? hexLineCount(lines) : lines.rows.length + lines.cols.length),
  fits: (b, p) => (hex() ? fitsAnywhereHex(b, p) : fitsAnywhere(b, p)),
  over: (b, t) => (hex() ? isHexGameOver(b, t) : isGameOver(b, t)),
  preview: (b, p, row, col) => (hex() ? previewHexLines(b, p, col - HR, row - HR) : previewLines(b, p, row, col)),
  // How a turn plays out, for the fair-deal search (with falls in Gravity).
  move: () => (hex() ? (hexGravity() ? hexGravityMove : hexMove) : (gravity() ? gravityMove : playMove)),
  deal: b => (hex() ? dealHexTray(Math.random, b, G.move()) : dealTray(Math.random, b, G.move())),
  trick: b => (hex() ? dealHexTrickTray(Math.random, b, G.move()) : dealTrickTray(Math.random, b, undefined, G.move())),
  score: (st, n, lines, wiped) => (hex() ? scoreHexPlacement(st, n, lines, wiped) : scorePlacement(st, n, lines, wiped)),
  // Board [row, col] of each cell of a piece placed at (row, col).
  spots: (p, row, col) => p.cells.map(([a, b]) => (hex() ? [row + b, col + a] : [row + a, col + b])),
  // Board [row, col] of every cell in these lines.
  lineSpots(lines) {
    if (hex()) return hexClearedCells(lines).map(([q, r]) => [r + HR, q + HR]);
    const out = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (lines.rows.includes(r) || lines.cols.includes(c)) out.push([r, c]);
    return out;
  },
};


// A hex cell's top-left, in cell widths, from its [q, r] (rows shift half a cell).
const hexXY = (q, r) => [q + r / 2, r * HEX_ROW];

// ---------- Drawing ----------

let cells = [];
let shape = ''; // 'square' or 'hex': which board the cells were built for

// (Re)build the board's cells when the shape changes.
function buildCells() {
  const want = hex() ? 'hex' : 'square';
  if (want === shape) return;
  shape = want;
  boardEl.classList.toggle('hex', hex());
  cells = [];
  const n = side();
  for (let i = 0; i < n * n; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    if (hex()) {
      const q = (i % n) - HR, r = Math.floor(i / n) - HR;
      if (Math.abs(q + r) > HR) el.classList.add('off');
      const [x, y] = hexXY(q + HR, r + HR);
      el.style.setProperty('--hx', x - HR / 2);
      el.style.setProperty('--hy', y);
    }
    cells.push(el);
  }
  boardEl.replaceChildren(...cells);
}

function drawBoard() {
  buildCells();
  board.forEach((line, r) => line.forEach((v, c) => {
    const el = cells[r * side() + c];
    if (v === null) el.removeAttribute('data-c'); else el.dataset.c = colorOf(v);
    const kind = specialOf(v);
    if (kind) el.dataset.s = kind; else el.removeAttribute('data-s');
  }));
}

function pieceEl(piece) {
  const el = document.createElement('div');
  el.className = 'piece';
  // Hex pieces are laid out by position; --pw/--ph are their size in cell widths.
  const isHex = hex();
  const xy = isHex ? piece.cells.map(([q, r]) => hexXY(q, r)) : [];
  const minX = isHex ? Math.min(...xy.map(([x]) => x)) : 0;
  if (isHex) {
    el.classList.add('hex');
    el.style.setProperty('--pw', Math.max(...xy.map(([x]) => x)) - minX + 1);
    el.style.setProperty('--ph', Math.max(...xy.map(([, y]) => y)) + HEX_H);
  }
  piece.cells.forEach(([r, c], i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.c = piece.color;
    if (piece.special && piece.special.i === i) cell.dataset.s = piece.special.s;
    if (isHex) {
      cell.style.setProperty('--hx', xy[i][0] - minX);
      cell.style.setProperty('--hy', xy[i][1]);
    } else {
      cell.style.setProperty('--r', r + 1);
      cell.style.setProperty('--col', c + 1);
    }
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
      if (!G.fits(board, piece)) slot.classList.add('nofit');
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
  modeTagEl.textContent = daily()
    ? `${duelName(variant())} ▾`
    : `${MODES.find(m => m.id === mode).name}${specials ? ' · Specials' : ''} ▾`;
}

function draw() {
  drawBoard();
  drawTray();
  drawScore();
}

// Floating "+points" at the middle of the placed piece, which is where the clear happened.
function showPop(piece, row, col, result) {
  const n = piece.cells.length;
  let top, left;
  if (hex()) {
    // Middle of the piece's cells on the board, as a share of the board's size.
    const els = G.spots(piece, row, col).map(([r, c]) => cells[r * side() + c]);
    top = els.reduce((a, e) => a + e.offsetTop + e.offsetHeight / 2, 0) / n / boardEl.offsetHeight;
    left = els.reduce((a, e) => a + e.offsetLeft + e.offsetWidth / 2, 0) / n / boardEl.offsetWidth;
  } else {
    top = (row + piece.cells.reduce((a, [y]) => a + y, 0) / n + 0.5) / SIZE;
    left = (col + piece.cells.reduce((a, [, x]) => a + x, 0) / n + 0.5) / SIZE;
  }
  const el = document.createElement('div');
  el.className = 'pop';
  el.style.top = `${Math.min(Math.max(top, 0.12), 0.88) * 100}%`;
  el.style.left = `${Math.min(Math.max(left, 0.2), 0.8) * 100}%`;
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

// Every set can be placed whole (see dealFairTray). About 1 set in
// TRICK_CHANCE is a trick set when the board allows one, in every mode:
// a piece doesn't fit until one or two others clear a line in the right spot.
function dealNext() {
  if (daily()) {
    setNo++;
    trickSet = false;
    return hex() ? dailyHexTray(day, setNo, board, specials, mode) : dailyTray(day, setNo, board, variant());
  }
  // Specials change how clears work (stones only crack), so no trick sets.
  if (specials) { trickSet = false; return withSpecials(G.deal(board)); }
  const trick = Math.random() < TRICK_CHANCE ? G.trick(board) : null;
  trickSet = !!trick;
  return trick || G.deal(board);
}

// ---------- Dragging ----------

let drag = null; // { index, piece, pointerId, slot, sx, sy }

// Where the piece is, from the finger: it moves GAIN times as far as the finger
// has moved since pick up.
function dragPoint(x, y) {
  return { x: drag.sx + (x - drag.sx) * GAIN, y: drag.sy + (y - drag.sy) * GAIN };
}

function cellPitch() {
  const r = boardEl.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(boardEl).paddingLeft);
  return { left: r.left + pad, top: r.top + pad, size: (r.width - pad * 2) / side() };
}

// Board row/col under the piece's top-left cell, rounded to the nearest cell.
function targetCell(x, y) {
  const { left, top, size } = cellPitch();
  const w = dragEl.offsetWidth, h = dragEl.offsetHeight;
  const px = x - w / 2, py = y - h - LIFT;
  if (hex()) return hexTarget(px, py, left, top, size);
  return { row: Math.round((py - top) / size), col: Math.round((px - left) / size) };
}

// Hex: where the piece's [0, 0] cell sits on screen, turned into the nearest
// board cell (rounding in all 3 directions, so it picks the closest hexagon).
function hexTarget(px, py, left, top, size) {
  const minX = Math.min(...drag.piece.cells.map(([q, r]) => hexXY(q, r)[0]));
  // Top-left of the piece's [0, 0] cell, in cell widths from the board's corner.
  const x = (px - left) / size - minX, y = (py - top) / size;
  // Undo buildCells' layout: y = (r + HR) * HEX_ROW, x = (q + HR) + (r + HR) / 2 - HR / 2.
  const fr = y / HEX_ROW - HR;
  const fq = x + HR / 2 - (fr + HR) / 2 - HR;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(-fq - fr);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s + fq + fr);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { row: r + HR, col: q + HR };
}

function moveDrag(fx, fy) {
  const { x, y } = dragPoint(fx, fy);
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
  const lines = G.preview(board, piece, row, col);
  if (!lines) return;
  ghostKey = key;
  boardEl.style.setProperty('--g', `var(--c${piece.color})`);
  for (const [r, c] of G.spots(piece, row, col)) cells[r * side() + c].classList.add('ghost');
  for (const [r, c] of G.lineSpots(lines)) cells[r * side() + c].classList.add('glow');
}

trayEl.addEventListener('pointerdown', e => {
  const slot = e.target.closest('.slot');
  if (!slot || busy || drag) return;
  const index = Number(slot.dataset.i);
  const piece = tray[index];
  if (!piece) return;
  e.preventDefault();
  slot.setPointerCapture(e.pointerId);
  drag = { index, piece, pointerId: e.pointerId, slot, sx: e.clientX, sy: e.clientY };
  dragEl.replaceChildren(pieceEl(piece));
  dragEl.hidden = false;
  slot.classList.add('lifted');
  haptic.pick();
  moveDrag(e.clientX, e.clientY);
});

trayEl.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.pointerId) moveDrag(e.clientX, e.clientY);
});

function endDrag(e, drop) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { index, piece, slot } = drag;
  const at = dragPoint(e.clientX, e.clientY);
  const { row, col } = targetCell(at.x, at.y);
  drag = null;
  clearGhost();
  dragEl.hidden = true;
  slot.classList.remove('lifted');
  if (drop && G.canPlace(board, piece, row, col)) placePiece(index, piece, row, col);
}

trayEl.addEventListener('pointerup', e => endDrag(e, true));
trayEl.addEventListener('pointercancel', e => endDrag(e, false));

// ---------- Turn ----------

function placePiece(index, piece, row, col) {
  board = G.place(board, piece, row, col, piece.color);
  tray[index] = null;
  const lines = G.fullLines(board);
  drawBoard();
  sfx.place();
  haptic.place();
  const flip = gravity() && piece.special?.s === 'flip';
  if (G.count(lines)) {
    busy = true;
    resolveClears(piece, row, col, lines, pieceCenter(piece, row, col)).then(() => { busy = false; afterTurn(); });
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
    score = G.score(score, piece.cells.length, lines);
    saveBest();
    afterTurn();
  }
}

// Middle of a placed piece on the board, in px: where its clear ripples from.
function pieceCenter(piece, row, col) {
  const pts = G.spots(piece, row, col).map(([r, c]) => cellCenter(r, c));
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

// Flash the full lines (and any bomb blasts), then empty them. Stones only
// crack. Line blocks pop one after another in a wave from `from` (the piece
// that filled them), each bursting into shards of its own color. Returns what
// the specials did, for scoring.
async function clearWithFlash(lines, from = null) {
  const res = hex() ? resolveHexClear(board, lines) : resolveClear(board, lines);
  const lineSet = new Set(G.lineSpots(lines).map(([r, c]) => `${r},${c}`));
  const inLine = (r, c) => lineSet.has(`${r},${c}`);
  const popping = [];
  for (const key of res.hit) {
    const [r, c] = key.split(',').map(Number);
    const el = cells[r * side() + c];
    if (specialOf(board[r][c]) === 'stone') el.classList.add('cracking');
    else if (res.bombs.length && !inLine(r, c)) {
      if (board[r][c] !== null) el.classList.add('blasting');
    } else popping.push([r, c, el]);
  }
  const n = G.count(lines);
  pickFx(false);
  const waveMs = clearFx(popping, from, lines);
  if (res.bombs.length) { explode(res); sfx.boom(); haptic.boom(); }
  else { sfx.clear(n); haptic.clear(n); }
  if (n > 1) cheerLines(n);
  await wait(Math.max(res.bombs.length ? BLAST_MS : 0, waveMs + CLEAR_MS));
  clearTimeout(waveTimer);
  cells.forEach(el => el.classList.remove('clearing', 'cracking', 'blasting', 'cracked', 'shattered'));
  board = res.board;
  drawBoard();
  return res;
}

// ---------- Line clears ----------
// Three effects, picked at random each game and swapped for a new one every
// FX_STEP points: Ripple (blocks pop in a wave from the piece and throw chips),
// Laser (a beam sweeps each line and blocks burst as it passes) and Shatter
// (the lines crack, then break into pieces that tumble off the board).

const FX = ['ripple', 'laser', 'shatter'];
const FX_NAMES = { ripple: 'Ripple', laser: 'Laser', shatter: 'Shatter' };
const FX_STEP = 1000;
const CRACK_MS = 110; // Shatter: how long the cracks show before the blocks break
let fxName = FX[Math.floor(Math.random() * FX.length)];
let fxLevel = 0;
let waveTimer = 0;

// For trying one effect: add ?fx=laser (or ripple, shatter) to the address.
const FX_PIN = FX.find(f => new URLSearchParams(location.search).get('fx') === f);

// A new game gets a random effect; each FX_STEP points swaps to a different one.
function pickFx(fresh) {
  if (FX_PIN) { fxName = FX_PIN; return; }
  const level = Math.floor((score?.score || 0) / FX_STEP);
  if (fresh) { fxLevel = level; fxName = FX[Math.floor(Math.random() * FX.length)]; return; }
  if (level <= fxLevel) return;
  fxLevel = level;
  const others = FX.filter(f => f !== fxName);
  fxName = others[Math.floor(Math.random() * others.length)];
  announceFx();
}

function announceFx() {
  const el = document.createElement('div');
  el.className = 'fxnote';
  el.textContent = `New effect: ${FX_NAMES[fxName]}!`;
  boardEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// Each line's cells (board [row, col]), for the laser beams.
function lineGroups(lines) {
  if (hex()) {
    const out = [];
    for (const axis of ['q', 'r', 's']) for (const i of lines[axis]) {
      const one = { q: [], r: [], s: [] };
      one[axis] = [i];
      out.push(hexClearedCells(one).map(([q, r]) => [r + HR, q + HR]));
    }
    return out;
  }
  const all = [...Array(SIZE).keys()];
  return [...lines.rows.map(r => all.map(c => [r, c])), ...lines.cols.map(c => all.map(r => [r, c]))];
}

// Runs this game's effect on the cells being cleared. Returns how long it
// takes before the board can be emptied, in ms (not counting the pop itself).
function clearFx(popping, from, lines) {
  if (!popping.length) return 0;
  const pts = popping.map(([r, c]) => cellCenter(r, c));
  const o = from || { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  const fx = document.createElement('div');
  fx.className = 'shards';
  boardEl.appendChild(fx);
  setTimeout(() => fx.remove(), 1200);
  bump();
  const still = calm();
  const color = el => getComputedStyle(el).getPropertyValue('--k').trim();
  if (still) { popping.forEach(([, , el]) => el.classList.add('clearing')); return 0; }

  if (fxName === 'shatter') {
    popping.forEach(([, , el]) => el.classList.add('cracked'));
    waveTimer = setTimeout(() => popping.forEach(([, , el], i) => {
      el.classList.add('shattered');
      breakAt(fx, pts[i], color(el), (pts[i].x - o.x));
    }), CRACK_MS);
    return CRACK_MS;
  }

  // When each block goes: Ripple by distance from the piece, Laser by how far
  // along its beam it is (a block on two lines goes at the first beam).
  const size = cells[0].offsetWidth;
  const due = new Array(popping.length).fill(Infinity);
  if (fxName === 'laser') {
    const idx = new Map(popping.map(([r, c], i) => [`${r},${c}`, i]));
    lineGroups(lines).forEach((group, g) => {
      const ends = beamEnds(group);
      const len = Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y) || 1;
      beam(fx, ends.a, ends.b, g * 40);
      for (const [r, c] of group) {
        const i = idx.get(`${r},${c}`);
        if (i === undefined) continue;
        const along = Math.hypot(pts[i].x - ends.a.x, pts[i].y - ends.a.y) / len;
        due[i] = Math.min(due[i], g * 40 + Math.round(along * WAVE_MS / 10) * 10);
      }
    });
    popping.forEach((_, i) => { if (due[i] === Infinity) due[i] = 0; });
  } else {
    const dist = pts.map(p => Math.hypot(p.x - o.x, p.y - o.y));
    const far = Math.max(...dist, 1);
    dist.forEach((d, i) => { due[i] = Math.round((d / far) * WAVE_MS / 10) * 10; });
    ringAt(fx, o, size);
  }
  const go = i => {
    const el = popping[i][2];
    el.classList.add('clearing');
    if (fxName === 'laser') sparksAt(fx, pts[i], size, color(el));
    else shardsAt(fx, pts[i], o, color(el));
  };
  const order = due.map((ms, i) => [ms, i]).sort((a, b) => a[0] - b[0]);
  const t0 = performance.now();
  const tick = () => {
    while (order.length && performance.now() - t0 >= order[0][0] - 8) go(order.shift()[1]);
    if (order.length) waveTimer = setTimeout(tick, 10);
  };
  tick();
  return Math.max(...due);
}

// Every clear gives the board a small knock.
function bump() {
  if (calm()) return;
  boardEl.classList.remove('bump');
  void boardEl.offsetWidth;
  boardEl.classList.add('bump');
  setTimeout(() => boardEl.classList.remove('bump'), 220);
}

// The two cells of a line farthest apart: where its beam starts and ends.
function beamEnds(group) {
  const p = group.map(([r, c]) => cellCenter(r, c));
  let best = [p[0], p[0]], d = -1;
  for (const a of p) for (const b of p) {
    const e = Math.hypot(b.x - a.x, b.y - a.y);
    if (e > d) { d = e; best = [a, b]; }
  }
  // Sweep left to right (or top to bottom), so beams feel the same each time.
  const [a, b] = best;
  return (a.x < b.x - 1 || (Math.abs(a.x - b.x) <= 1 && a.y < b.y)) ? { a, b } : { a: b, b: a };
}

function beam(fx, a, b, delay) {
  const size = cells[0].offsetWidth;
  const el = document.createElement('b');
  el.className = 'beam';
  const len = Math.hypot(b.x - a.x, b.y - a.y) + size;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  el.style.left = `${a.x - Math.cos(ang) * size / 2}px`;
  el.style.top = `${a.y - Math.sin(ang) * size / 2}px`;
  el.style.width = `${len}px`;
  el.style.setProperty('--s', `${size}px`);
  el.style.transform = `rotate(${ang}rad)`;
  el.style.animationDelay = `${delay}ms`;
  fx.append(el);
}

// Ripple: a ring of light spreads from the piece.
function ringAt(fx, o, size) {
  const el = document.createElement('b');
  el.className = 'wave';
  el.style.left = `${o.x}px`;
  el.style.top = `${o.y}px`;
  el.style.setProperty('--s', `${size}px`);
  fx.append(el);
}

// Laser: bright sparks spray off each block as the beam hits it.
function sparksAt(fx, at, size, color) {
  for (let k = 0; k < 4; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = size * (0.6 + Math.random() * 1.1);
    const bit = document.createElement('i');
    bit.className = 'spk';
    bit.style.left = `${at.x}px`;
    bit.style.top = `${at.y}px`;
    bit.style.setProperty('--s', `${size * 0.16}px`);
    bit.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    bit.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    bit.style.setProperty('--rot', '0deg');
    if (color) bit.style.color = color;
    fx.append(bit);
  }
}

// Shatter: the block breaks into 4 pieces that tumble down and off the board.
function breakAt(fx, at, color, side) {
  const size = cells[0].offsetWidth;
  const h = size / 2;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    const bit = document.createElement('i');
    bit.className = 'chunk';
    bit.style.left = `${at.x + (sx * h) / 2}px`;
    bit.style.top = `${at.y + (sy * h) / 2}px`;
    bit.style.setProperty('--s', `${h - 1}px`);
    bit.style.setProperty('--dx', `${(sx * 0.5 + Math.sign(side) * 0.3 + (Math.random() - 0.5) * 0.6) * size}px`);
    bit.style.setProperty('--dy', `${(sy * 0.2 - 0.9 - Math.random() * 0.5) * size}px`);
    bit.style.setProperty('--fall', `${size * (3 + Math.random() * 2)}px`);
    bit.style.setProperty('--rot', `${(sx * 120 + (Math.random() - 0.5) * 240)}deg`);
    if (color) { bit.style.background = color; bit.style.color = color; }
    fx.append(bit);
  });
}

// Ripple: 5 chips fly out of a block, away from where the wave started, and drop.
function shardsAt(fx, at, o, color) {
  const size = cells[0].offsetWidth;
  const ux = at.x - o.x, uy = at.y - o.y, len = Math.hypot(ux, uy) || 1;
  for (let k = 0; k < 5; k++) {
    const a = Math.atan2(uy / len, ux / len) + (Math.random() - 0.5) * 2.4 + (len < 2 ? Math.random() * 6.3 : 0);
    const d = size * (0.9 + Math.random() * 1.3);
    const bit = document.createElement('i');
    bit.style.left = `${at.x + (Math.random() - 0.5) * size * 0.5}px`;
    bit.style.top = `${at.y + (Math.random() - 0.5) * size * 0.5}px`;
    bit.style.setProperty('--s', `${size * (0.24 + Math.random() * 0.2)}px`);
    bit.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    bit.style.setProperty('--dy', `${Math.sin(a) * d - size * 0.6}px`);
    bit.style.setProperty('--rot', `${(Math.random() - 0.5) * 600}deg`);
    if (color) { bit.style.background = color; bit.style.color = color; }
    fx.append(bit);
  }
}

// Two or more lines at once: the board jolts, flashes, and a word bursts out.
const LINE_WORDS = ['', '', 'Double!', 'Triple!', 'Mega!', 'Insane!'];
function cheerLines(n) {
  const word = document.createElement('div');
  word.className = `cheer x${Math.min(n, 5)}`;
  word.textContent = LINE_WORDS[Math.min(n, 5)];
  boardEl.appendChild(word);
  word.addEventListener('animationend', () => word.remove());
  if (calm()) return;
  const flash = document.createElement('div');
  flash.className = 'board-flash';
  boardEl.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
  boardEl.classList.remove('jolt', 'bump');
  void boardEl.offsetWidth;
  boardEl.classList.add('jolt');
  setTimeout(() => boardEl.classList.remove('jolt'), 320);
}

// ---------- Explosions ----------
// Each bomb: a flash, a shock ring, sparks, and the blocks it destroys flying
// outward as debris. The board shakes and Android phones buzz.

function cellCenter(r, c) {
  const el = cells[r * side() + c];
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, size: el.offsetWidth };
}

function explode(res) {
  boardEl.classList.remove('shake');
  void boardEl.offsetWidth; // restart the shake if it was already running
  boardEl.classList.add('shake');
  setTimeout(() => boardEl.classList.remove('shake'), 450);
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
  // In Hex, the neighbours are the 6 hexes around it.
  const near = (r, c) => (hex()
    ? [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 0]].some(([a, b]) => r - br === a && c - bc === b)
    : Math.abs(r - br) <= 1 && Math.abs(c - bc) <= 1);
  for (const key of res.hit) {
    const [r, c] = key.split(',').map(Number);
    if (!near(r, c)) continue;
    const el = cells[r * side() + c];
    if (!el.dataset.c || el.dataset.s === 'stone') continue;
    const chunk = document.createElement('i');
    chunk.className = 'debris';
    chunk.style.background = getComputedStyle(el).getPropertyValue('--k');
    const at = cellCenter(r, c);
    const ux = (at.x - x) / size, uy = (at.y - y) / size; // offset from the bomb, in cells
    const dx = (ux || (Math.random() - 0.5)) * size * (1.8 + Math.random());
    const dy = (uy || (Math.random() - 0.5)) * size * (1.8 + Math.random()) - size * 0.8;
    chunk.style.setProperty('--x0', `${at.x - x}px`);
    chunk.style.setProperty('--y0', `${at.y - y}px`);
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
async function resolveClears(piece, row, col, lines, from = null) {
  const res = await clearWithFlash(lines, from);
  if (!anyGravity()) {
    score = G.score(score, piece.cells.length, lines, boardEmpty(board));
    addSpecialPoints(res);
    showPop(piece, row, col, score);
    cheer(score);
    saveBest();
    return;
  }
  await drop();
  score = G.score(score, piece.cells.length, lines, boardEmpty(board));
  addSpecialPoints(res);
  showPop(piece, row, col, score);
  cheer(score);
  saveBest();
  for (let chain = 2; ; chain++) {
    const next = G.fullLines(board);
    if (!G.count(next)) break;
    await wait(CHAIN_PAUSE);
    const step = await clearWithFlash(next);
    await drop();
    score = (hex() ? scoreHexChain : scoreChain)(score, next, chain, boardEmpty(board));
    addSpecialPoints(step);
    showChainPop(next, score);
    if (score.bonus) { sfx.fanfare(); haptic.fanfare(); } else { sfx.combo(chain); haptic.combo(); }
    saveBest();
  }
}

// Extra sound on top of the clear: a fanfare for an empty board, a rising run for a streak.
function cheer(result) {
  if (result.bonus) { sfx.fanfare(); haptic.fanfare(); }
  else if (result.streak > 1) { sfx.combo(result.streak); haptic.combo(); }
}

// Let every block fall, with each one sliding down from where it was.
async function drop(onlyCols = null) {
  if (hex()) return dropHex();
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

// Hex Gravity: every block that moved slides from where it started to where
// it landed. The whole cell moves (a hex cell clips anything drawn outside it).
async function dropHex() {
  const { board: next, paths, ticks } = applyHexGravity(board);
  board = next;
  drawBoard();
  if (!paths.length) return;
  const ms = Math.min(HEX_FALL_MS + ticks * 25, 2 * HEX_FALL_MS);
  boardEl.style.setProperty('--fall-ms', `${ms}ms`);
  for (const { from: [q0, r0], path } of paths) {
    const [q, r] = path.at(-1);
    const [x0, y0] = hexXY(q0, r0), [x, y] = hexXY(q, r);
    const el = cells[(r + HR) * side() + q + HR];
    el.style.setProperty('--fx', x0 - x);
    el.style.setProperty('--fy', y0 - y);
    el.classList.add('hexfalling');
  }
  await wait(ms);
  for (const el of cells) {
    el.classList.remove('hexfalling');
    el.style.removeProperty('--fx');
    el.style.removeProperty('--fy');
  }
}

// Pop for a chain step, in the middle of the lines it cleared.
function showChainPop(lines, result) {
  if (hex()) {
    const spots = hexClearedCells(lines);
    return showPop({ cells: spots }, HR, HR, result);
  }
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
  if (!G.over(board, tray)) {
    saveGame();
  } else {
    forgetGame(); // a finished game isn't resumed; next time starts fresh
    if (daily()) saveDailyScore();
    showOver();
    sfx.gameOver();
    haptic.gameOver();
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
    title.textContent = `${duelName(variant())} ${shortDay(day)}`;
    const scores = dailyScores();
    hint.textContent = Object.keys(scores).length > 1
      ? Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${v.toLocaleString()}`).join(' · ')
      : 'New pieces tomorrow. Send your score to compare!';
    againBtn.textContent = 'Share score';
    overAltBtn.textContent = `Play ${MODES.find(m => m.id === mode).name}`;
    overAltBtn.hidden = false;
  } else {
    title.textContent = 'No moves left';
    hint.textContent = 'None of your pieces fit on the board.';
    againBtn.textContent = 'Play again';
    overAltBtn.hidden = true;
  }
  overEl.hidden = false;
}

// Today's scores in a Daily Duel on this phone, by player. Older days are dropped.
// Classic's duel keeps the original 'blockit.daily'.
const dailyKey = id => (id === 'daily' ? 'blockit.daily' : `blockit.${id}`);
function dailyScores(id = duelId(variant())) {
  const d = store.get(dailyKey(id), null);
  return d && d.day === dayKey() && d.scores ? d.scores : {};
}

function saveDailyScore() {
  const id = duelId(variant());
  const scores = { ...dailyScores(id), [player]: score.score };
  store.set(dailyKey(id), { day, scores });
  queueScore({ player, mode: id, score: score.score, day });
}

async function shareScore() {
  const text = shareText(day, score.score, player, variant());
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
const gameKey = () => (daily() ? `blockit.game.${duelId(variant())}.${player}` : `blockit.game.${variant()}`);

function saveGame() {
  store.set(gameKey(), { board, tray, score, trickSet, day, setNo });
}

function forgetGame() {
  try { localStorage.removeItem(gameKey()); } catch { /* nothing saved */ }
}

// Load this mode's saved game. False if there isn't a usable one.
function loadGame() {
  const g = store.get(gameKey(), null);
  const ok = g && Array.isArray(g.board) && g.board.length === side()
    && g.board.every(line => Array.isArray(line) && line.length === side())
    && Array.isArray(g.tray) && g.tray.length === 3 && g.score && typeof g.score.score === 'number';
  if (!ok || G.over(g.board, g.tray)) return false;
  if (daily() && g.day !== dayKey()) return false; // yesterday's duel is over
  day = g.day || '';
  setNo = g.setNo || 0;
  board = g.board;
  tray = g.tray;
  score = g.score;
  pickFx(true);
  trickSet = !!g.trickSet;
  newBest = false;
  overEl.hidden = true;
  return true;
}

function newGame() {
  board = G.empty();
  trickSet = false;
  score = newScore();
  pickFx(true);
  newBest = false;
  overEl.hidden = true;
  if (daily()) {
    day = dayKey();
    setNo = 0;
    tray = hex() ? dailyHexTray(day, 0, null, specials, mode) : dailyTray(day, 0, null, variant());
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
    tray = specials ? withSpecials(G.deal(null)) : G.deal(null);
  }
  saveGame();
  draw();
}

againBtn.addEventListener('click', () => (daily() ? shareScore() : newGame()));
// Leave the duel for the normal game of the same mode.
overAltBtn.addEventListener('click', () => {
  duel = false;
  store.set('blockit.duel', duel);
  switchGame();
});

// ---------- Mode menu ----------
// Tapping a mode, Special blocks or Daily Duel only picks it. Start then goes
// to that game (picking up its saved game if there is one); New game starts it
// over. Close leaves things as they were.

const modesEl = document.getElementById('modes');
const modeListEl = document.getElementById('modelist');
let pick = { mode, specials, duel };

// A little picture of each mode, drawn in the current style's colors.
// Digits are piece colors, '.' is an open cell, 'f' marks the falling block.
const MODE_PICS = {
  classic:    ['00.3', '0..3', '2222', '..13'],
  gravity:    ['.f..', '....', '1.55', '1225'],
  hex:        ['03..', '.33.', '2..1', '221.'],
  hexgravity: ['.f..', '....', '1.5.', '1255'],
};
function modePic(id) {
  const pic = document.createElement('div');
  pic.className = `mode-pic ${id.startsWith('hex') ? 'hx' : 'sq'}`;
  pic.setAttribute('aria-hidden', 'true');
  for (const line of MODE_PICS[id]) {
    const row = document.createElement('div');
    for (const ch of line) {
      const i = document.createElement('i');
      if (ch === 'f') { i.dataset.c = '4'; i.className = 'fall'; }
      else if (ch !== '.') i.dataset.c = ch;
      row.append(i);
    }
    pic.append(row);
  }
  return pic;
}

function drawModes() {
  modeListEl.replaceChildren(...MODES.map(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-btn';
    b.setAttribute('aria-pressed', String(m.id === pick.mode));
    const name = document.createElement('b');
    name.textContent = m.name;
    const about = document.createElement('span');
    about.textContent = m.about;
    if (MODE_PICS[m.id]) b.append(modePic(m.id));
    b.append(name, about);
    b.addEventListener('click', () => {
      pick.mode = m.id;
      drawModes();
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
const duelBtn = document.getElementById('duel');
function drawSpecials() {
  specialsBtn.setAttribute('aria-pressed', String(pick.specials));
  specialsBtn.querySelector('b').textContent = pick.specials ? 'On' : 'Off';
  duelBtn.setAttribute('aria-pressed', String(pick.duel));
  duelBtn.querySelector('b').textContent = pick.duel ? 'On' : 'Off';
  document.getElementById('newgame').hidden = pick.duel; // one try a day
}
duelBtn.addEventListener('click', () => { pick.duel = !pick.duel; drawSpecials(); });
specialsBtn.addEventListener('click', () => { pick.specials = !pick.specials; drawSpecials(); });

// Use what's picked in the sheet. True if it's a different game than before.
function applyPick() {
  const changed = pick.mode !== mode || pick.specials !== specials || pick.duel !== duel;
  ({ mode, specials, duel } = pick);
  store.set('blockit.mode', mode);
  store.set('blockit.specials', specials);
  store.set('blockit.duel', duel);
  return changed;
}

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

const hapticsBtn = document.getElementById('haptics');
function drawHaptics() {
  hapticsBtn.setAttribute('aria-pressed', String(hapticsOn));
  hapticsBtn.querySelector('b').textContent = hapticsOn ? 'On' : 'Off';
}
hapticsBtn.addEventListener('click', () => {
  hapticsOn = !hapticsOn;
  store.set('blockit.haptics', hapticsOn);
  setHapticsOn(hapticsOn);
  drawHaptics();
  haptic.place(); // a tap so you feel it's back on
});

modeTagEl.addEventListener('click', () => {
  if (busy || drag) return;
  pick = { mode, specials, duel };
  drawModes();
  drawSpecials();
  drawSound();
  drawHaptics();
  modesEl.hidden = false;
});
document.getElementById('start').addEventListener('click', () => {
  modesEl.hidden = true;
  if (applyPick()) switchGame();
});
document.getElementById('newgame').addEventListener('click', () => {
  modesEl.hidden = true;
  applyPick();
  bests = store.get(bestKey(), {});
  newGame();
});
// ---------- Scoreboard ----------
// Every player on this phone: best in each mode, and today's Daily Duel.
// A crown marks the top score in each row.

const scoresEl = document.getElementById('scores');
// Two rows of tabs: which game, then its all-time best, today's duel or best duel.
const BOARD_GAMES = [
  { id: 'classic', name: 'Classic' },
  { id: 'gravity', name: 'Gravity' },
  { id: 'classic-special', name: 'Classic ✦' },
  { id: 'gravity-special', name: 'Gravity ✦' },
  { id: 'hex', name: 'Hex' },
  { id: 'hex-special', name: 'Hex ✦' },
  { id: 'hexgravity', name: 'Hex Gravity' },
  { id: 'hexgravity-special', name: 'Hex Gravity ✦' },
];
const BOARD_KINDS = [
  { id: 'best', name: 'Best' },
  { id: 'today', name: 'Duel today' },
  { id: 'duel', name: 'Duel best' },
];
let boardGame = 'classic';
let boardKind = 'best';
let onlineBoard = null; // last scores fetched from the server
let boardNote = '';

// Scores for a tab: the server's when we have them, merged with this phone's
// (so a score that hasn't been sent yet still shows).
function tabScores(game, kind) {
  const id = duelId(game);
  const local = kind === 'today' ? dailyScores(id)
    : store.get(kind === 'duel' ? `blockit.best.${id}` : plainBestKey(game), {});
  const remote = !onlineBoard ? {}
    : kind === 'today' ? onlineBoard.today[id] || {}
    : onlineBoard.bests[kind === 'duel' ? id : game] || {};
  const all = { ...remote };
  for (const [p, v] of Object.entries(local)) all[p] = Math.max(all[p] || 0, v);
  return Object.entries(all).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

function chipRow(el, list, current, pick) {
  el.replaceChildren(...list.map(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t.name;
    b.setAttribute('aria-pressed', String(t.id === current));
    b.addEventListener('click', () => { pick(t.id); drawScoreboard(); });
    return b;
  }));
}

function drawScoreboard() {
  chipRow(document.getElementById('scoretabs'), BOARD_GAMES, boardGame, id => { boardGame = id; });
  chipRow(document.getElementById('scorekinds'), BOARD_KINDS, boardKind, id => { boardKind = id; });
  const rows = tabScores(boardGame, boardKind);
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
  for (const g of BOARD_GAMES) {
    for (const [p, v] of Object.entries(store.get(plainBestKey(g.id), {}))) queueScore({ player: p, mode: g.id, score: v });
    for (const [p, v] of Object.entries(dailyScores(duelId(g.id)))) queueScore({ player: p, mode: duelId(g.id), score: v, day: dayKey() });
  }
  store.set('blockit.synced', true);
}

document.getElementById('scores-open').addEventListener('click', () => {
  modesEl.hidden = true;
  boardGame = variant();
  boardKind = daily() ? 'today' : 'best';
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
