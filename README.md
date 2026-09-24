# MineSweeper Team Edition (Local Pass-and-Play)

A static Minesweeper app (16×16, 40 mines) designed for **single-device local play**.

## Run

- Open `/home/runner/work/MSWPR/MSWPR/index.html` in a browser.
- Or host the folder with any static file server.

## Controls

- Reveal: left click/tap, or keyboard `Enter` / `Space`
- Flag/unflag: right click, or keyboard `F`
- Touch-friendly option: enable **Flag mode** and tap cells
- Add local players (optional, max 8) in the sidebar
- **New Round** keeps players and scores, starts a fresh board
- **Reset Session** clears players/scores and restarts from default

## Behavior

- First reveal is safe (clicked cell + neighbors are mine-free)
- Flood reveal for zero-count areas
- Mine counter, turn order, score tracking, and round log
- Win when all non-mine cells are revealed
- Loss reveals mines and marks incorrect flags
- Timer starts on first reveal and stops on win/loss
- Actions are locked after win/loss until new round

## Persistence and limitations

- Uses native `localStorage` when available
- Falls back to in-memory state if `localStorage` is unavailable
- Optional same-browser/tab update propagation via `storage` events
- **Not online multiplayer**: no backend, no cross-device sync, no atomic conflict safety across tabs

## Tests

Run:

```bash
node --test game.test.js
```

The tests cover representative game-rule edge cases (first-click safety, counts, flood reveal, win/loss, wrong flags, and turn/score behavior).
