const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./game.js');

test('first click safety protects clicked cell and neighbors', () => {
  const board = Core.createBoard(8, 8);
  Core.placeMines(board, 10, 3, 3, () => 0.42);

  for (let r = 2; r <= 4; r++) {
    for (let c = 2; c <= 4; c++) {
      assert.equal(board[r][c].mine, false);
    }
  }
});

test('adjacent mine counts are computed correctly', () => {
  const board = Core.createBoard(3, 3);
  board[0][0].mine = true;
  board[1][1].mine = true;
  Core.computeCounts(board);

  assert.equal(board[0][1].count, 2);
  assert.equal(board[1][0].count, 2);
  assert.equal(board[2][2].count, 1);
});

test('flood reveal reveals connected zero-area and bordering numbers', () => {
  const board = Core.createBoard(4, 4);
  board[3][3].mine = true;
  Core.computeCounts(board);

  const revealed = Core.floodReveal(board, 0, 0);
  assert.equal(revealed, 15);
  assert.equal(board[3][3].revealed, false);
});

test('win state triggers when all non-mine cells are revealed', () => {
  const state = Core.createInitialState({ rows: 2, cols: 2, mines: 1, players: ['A'] });
  state.board[0][0].mine = true;
  Core.computeCounts(state.board);
  state.firstRevealDone = true;
  state.startTimeMs = Date.now();

  Core.applyReveal(state, 0, 1);
  Core.applyReveal(state, 1, 0);
  Core.applyReveal(state, 1, 1);

  assert.equal(state.gameWon, true);
  assert.equal(state.gameOver, true);
});

test('loss reveals mines and marks incorrect flags', () => {
  const state = Core.createInitialState({ rows: 2, cols: 2, mines: 1, players: ['A'] });
  state.board[0][0].mine = true;
  state.board[1][1].flagged = true;
  Core.computeCounts(state.board);
  state.firstRevealDone = true;
  state.startTimeMs = Date.now();

  const result = Core.applyReveal(state, 0, 0);

  assert.equal(result.outcome, 'mine');
  assert.equal(state.board[0][0].revealed, true);
  assert.equal(state.board[0][0].exploded, true);
  assert.equal(state.board[1][1].wrongFlag, true);
  assert.equal(state.scores.A, -1);
});

test('turn advances among players and score updates once per action', () => {
  const state = Core.createInitialState({ rows: 3, cols: 3, mines: 2, players: ['A', 'B'] });
  state.board[0][0].mine = true;
  state.board[0][1].mine = true;
  Core.computeCounts(state.board);
  state.firstRevealDone = true;
  state.startTimeMs = Date.now();

  const first = Core.applyReveal(state, 2, 2);
  assert.equal(first.changed, true);
  assert.equal(state.scores.A, first.revealedCells);
  assert.equal(state.currentTurnIndex, 1);

  const second = Core.applyToggleFlag(state, 0, 0);
  assert.equal(second.changed, true);
  assert.equal(state.currentTurnIndex, 0);
});
