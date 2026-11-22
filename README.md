# BLOCKIT

A block-placing puzzle for Jason and Amy, played in the phone browser.

Drag the three pieces from the tray onto the 9x9 board. Fill a whole row or
column to clear it. Once all three are placed you get three new ones. The game
ends when none of the pieces left in the tray fits.

Scoring: 1 point per block placed, 10 per cleared cell, times the number of
lines cleared at once, times your streak (clears on back-to-back placements;
2 misses are forgiven, the 3rd resets it). Emptying the board adds 500. Best
score is saved on the phone for each player (tap the name to switch).

## Run it

    npm run dev     # http://localhost:5173
    npm test        # rule tests

No build step: plain HTML, CSS and JS modules. GitHub Pages serves `main`.
