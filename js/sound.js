// Sound effects, made on the fly with Web Audio (no sound files to load).
// Phones only allow audio after a tap, so unlock() runs on the first touch.
// On iPhone the ring/silent switch also mutes these.

let ctx = null;
let master = null;
let on = true;

export function setSoundOn(value) { on = value; }

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio on this device */ }
}

const ready = () => on && ctx && ctx.state === 'running';

// One note: a frequency that can glide, with a quick attack and a fade.
function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.3, to = null } = {}) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise, for the bomb.
function noise({ at = 0, dur = 0.6, vol = 0.6, from = 1800, to = 120 } = {}) {
  const t = ctx.currentTime + at;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

// C major pentatonic, so any run of notes sounds pleasant.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export const sfx = {
  // A soft wooden knock when a piece lands.
  place() {
    if (!ready()) return;
    tone(180, { dur: 0.09, type: 'triangle', vol: 0.35, to: 90 });
    tone(900, { dur: 0.03, type: 'square', vol: 0.04 });
  },

  // A bright chime when lines clear; more lines, more notes.
  clear(lines = 1) {
    if (!ready()) return;
    const n = Math.min(lines, 4) + 1;
    for (let i = 0; i < n; i++) tone(SCALE[i * 2], { at: i * 0.05, dur: 0.25, type: 'triangle', vol: 0.22 });
  },

  // A rising run for a streak or a Gravity chain; the higher the step, the higher it climbs.
  combo(step = 2) {
    if (!ready()) return;
    const base = Math.min(step - 1, SCALE.length - 4);
    for (let i = 0; i < 4; i++) {
      tone(SCALE[base + i], { at: 0.12 + i * 0.06, dur: 0.18, type: 'square', vol: 0.09 });
    }
  },

  // A deep boom for a bomb.
  boom() {
    if (!ready()) return;
    noise({ dur: 0.7, vol: 0.7 });
    tone(110, { dur: 0.5, type: 'sine', vol: 0.6, to: 35 });
  },

  // A happy flourish for clearing the board or solving a trick set.
  fanfare() {
    if (!ready()) return;
    [0, 2, 4, 5].forEach((s, i) => tone(SCALE[s], { at: i * 0.09, dur: i === 3 ? 0.5 : 0.15, type: 'triangle', vol: 0.25 }));
  },

  // A sad slide down when no moves are left.
  gameOver() {
    if (!ready()) return;
    [392, 349.23, 311.13, 261.63].forEach((f, i) =>
      tone(f, { at: i * 0.22, dur: i === 3 ? 0.7 : 0.22, type: 'triangle', vol: 0.25, to: i === 3 ? 196 : null }));
  },
};
