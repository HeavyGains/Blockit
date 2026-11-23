// Haptic taps. Android: the Vibration API. iPhone: Safari has no vibration
// API, but since iOS 18 flipping a hidden "switch" checkbox gives one light
// system tap. iPhone only allows it right after a touch, so taps fired long
// after a drop (late chains) may be silent there. One strength only on iPhone;
// patterns below become a few quick taps.

let on = true;
let label = null;

export function setHapticsOn(value) { on = value; }

function iosTick() {
  try {
    if (!label) {
      label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.append(input);
      document.body.append(label);
    }
    label.click();
  } catch { /* no haptics */ }
}

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

// pattern: Android vibrate pattern (ms on, off, on...). taps: iPhone tap count.
function buzz(pattern, taps = 1, gap = 70) {
  if (!on) return;
  if (canVibrate) { try { navigator.vibrate(pattern); } catch { /* ignore */ } return; }
  for (let i = 0; i < taps; i++) {
    if (i === 0) iosTick(); else setTimeout(iosTick, i * gap);
  }
}

export const haptic = {
  pick: () => buzz(8),
  place: () => buzz(15),
  // A rolling run of taps: 5 for one line, 2 more per extra line (up to 9).
  clear: n => {
    const taps = Math.min(5 + (n - 1) * 2, 9);
    buzz(Array.from({ length: taps * 2 - 1 }, (_, i) => (i % 2 ? 30 : 18)), taps, 50);
  },
  combo: () => buzz([20, 30, 20, 30, 35], 3, 60),
  boom: () => buzz([70, 40, 120], 4, 55),
  fanfare: () => buzz([30, 50, 30, 50, 60], 3, 90),
  gameOver: () => buzz([60, 80, 120], 2, 160),
};
