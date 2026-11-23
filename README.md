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

Styles: tap the palette to pick Paper stickers (default), Neon arcade, Neon
sunset, Neon ice, Neon toxic, Candy jelly, Woodshop, Chalkboard, Pixel, Garden,
Camo or Classic. Each player's choice is saved. Styles live in `css/styles.css`.

Modes: tap the mode name under the score to switch modes or start a New game.
Each mode's game in progress is saved on the phone (`blockit.game.<mode>`), so
switching away and back, or closing the page, picks up where you left off.
Classic is the default. In Gravity, after a clear every block falls straight
down its column; if that fills new lines they clear too, and each step of the
chain scores x2, x3 and so on. Each mode keeps its own best (Classic in
`blockit.best`, Gravity in `blockit.best.gravity`). Tricky sets only come in
Classic.

Special blocks: a switch in the Game sheet (tap the mode name). With it on,
about 1 piece in 4 carries one special cell, in either mode. Bomb: when its line
clears it also clears the 3x3 around it (and sets off other bombs there); each
extra cell scores like a cleared cell. Stone: a clear only cracks it, a second
clear breaks it. Star: +50 when cleared. In Gravity two more turn up: Anchor ⚓ never
falls, and blocks above it rest on it. Flip ⬆️ makes its whole column fall up
instead of down while it's in that column, starting the moment it lands. Each mode with or without specials
keeps its own saved game and best (`blockit.game.classic-special`, etc.).

Daily Duel: the third mode. Everyone gets the same pieces on the same day
(each set is seeded by the phone's date and the set number, so it doesn't
depend on how you play). Classic rules, no specials or tricky sets. One try per
player per day; at the end, Share score sends e.g. "Blockit Daily Duel 11/22:
4,210 (Jason)" (or copies it). Today's scores on the phone are in
`blockit.daily`, and players on the same phone see each other's on the result.

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
