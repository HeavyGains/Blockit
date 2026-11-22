# BLOCKIT

A block-placing puzzle for Jason and Amy, played in the phone browser.

Drag the three pieces from the tray onto the 8x8 board. Fill a whole row or
column to clear it. Once all three are placed you get three new ones. The game
ends when none of the pieces left in the tray fits.

Scoring: 1 point per block placed, 10 per cleared cell, times the number of
lines cleared at once, times your streak (clears on back-to-back placements;
2 misses are forgiven, the 3rd resets it). Emptying the board adds 500. Best
score is saved on the phone for each player (tap the name to switch).

Tricky sets: about 1 set in 6 (once the board has 16+ blocks) is a puzzle. One
piece fits nowhere when it arrives, but there is a hidden order that uses line
clears to make room, and at most a quarter of first moves lead to it. Placing
all three earns "Solved!" +100.

Styles: tap the palette to pick Paper stickers (default), Neon arcade, Candy
jelly, Woodshop, Chalkboard, Pixel, Garden, High contrast or Classic. Each player's choice is saved. Styles live in `css/styles.css`.

## Run it

    npm run dev     # http://localhost:5173
    npm test        # rule tests

No build step: plain HTML, CSS and JS modules. GitHub Pages serves `main`.

`sw.js` is a network-first service worker: every load asks Pages for fresh
files (skipping the phone's 10-minute cache), so a merged change shows up on
the next reload. It falls back to the saved copy when offline.

Before each PR, run `npm run bump`: it raises the `?v=N` on the CSS/JS links
and the imports between JS files, so the phone never runs a new page with old
code (or the other way round) right after a merge.
