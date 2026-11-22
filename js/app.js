import {
  SIZE, emptyBoard, canPlace, place, fullLines, clearLines,
  isGameOver, dealTray, trayEmpty, fitsAnywhere,
} from './logic.js';

const LIFT = 56;      // px the dragged piece floats above the finger, so it stays visible
const CLEAR_MS = 220; // matches the pop animation in style.css

const boardEl = document.getElementById('board');
const trayEl = document.getElementById('tray');
const dragEl = document.getElementById('drag');
const overEl = document.getElementById('over');

let board = emptyBoard();
let tray = dealTray();
let busy = false; // true while lines are clearing

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

function draw() {
  drawBoard();
  drawTray();
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
      busy = false;
      afterTurn();
    }, CLEAR_MS);
  } else {
    afterTurn();
  }
}

function afterTurn() {
  if (trayEmpty(tray)) tray = dealTray();
  draw();
  if (isGameOver(board, tray)) overEl.hidden = false;
}

document.getElementById('again').addEventListener('click', () => {
  board = emptyBoard();
  tray = dealTray();
  overEl.hidden = true;
  draw();
});

draw();
