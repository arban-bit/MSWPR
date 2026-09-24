(function (globalFactory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalFactory();
  } else {
    window.MinesweeperCore = globalFactory();
  }
})(function () {
  const DEFAULT_ROWS = 16;
  const DEFAULT_COLS = 16;
  const DEFAULT_MINES = 40;
  const MAX_PLAYERS = 8;
  const MIN_NAME_LENGTH = 1;
  const MAX_NAME_LENGTH = 16;

  function createCell() {
    return {
      mine: false,
      revealed: false,
      flagged: false,
      count: 0,
      exploded: false,
      wrongFlag: false
    };
  }

  function createBoard(rows, cols) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, createCell));
  }

  function cloneBoard(board) {
    return board.map((row) => row.map((cell) => ({ ...cell })));
  }

  function getNeighbors(rows, cols, r, c) {
    const neighbors = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          neighbors.push([nr, nc]);
        }
      }
    }
    return neighbors;
  }

  function computeCounts(board) {
    const rows = board.length;
    const cols = board[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) {
          board[r][c].count = 0;
          continue;
        }
        let count = 0;
        for (const [nr, nc] of getNeighbors(rows, cols, r, c)) {
          if (board[nr][nc].mine) count += 1;
        }
        board[r][c].count = count;
      }
    }
  }

  function inSafeArea(r, c, safeR, safeC) {
    return Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1;
  }

  function placeMines(board, mines, safeR, safeC, rng = Math.random) {
    const rows = board.length;
    const cols = board[0].length;
    const forbidden = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!inSafeArea(r, c, safeR, safeC)) forbidden.push([r, c]);
      }
    }

    if (forbidden.length < mines) {
      throw new Error('Not enough cells to place mines outside safe area.');
    }

    for (let i = forbidden.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [forbidden[i], forbidden[j]] = [forbidden[j], forbidden[i]];
    }

    for (let i = 0; i < mines; i++) {
      const [r, c] = forbidden[i];
      board[r][c].mine = true;
    }

    computeCounts(board);
  }

  function isValidName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) return false;
    return /^[\w\- .]+$/.test(trimmed);
  }

  function normalizeName(name) {
    return name.trim().replace(/\s+/g, ' ');
  }

  function createInitialState(options = {}) {
    const rows = options.rows || DEFAULT_ROWS;
    const cols = options.cols || DEFAULT_COLS;
    const mines = options.mines || DEFAULT_MINES;
    const players = (options.players && options.players.length ? options.players : ['Player 1']).slice(0, MAX_PLAYERS);

    const scores = {};
    for (const p of players) scores[p] = 0;

    return {
      rows,
      cols,
      mines,
      board: createBoard(rows, cols),
      players,
      currentTurnIndex: 0,
      scores,
      mineFlags: 0,
      firstRevealDone: false,
      gameOver: false,
      gameWon: false,
      startTimeMs: null,
      endTimeMs: null,
      roundNumber: 1,
      revision: 0,
      log: []
    };
  }

  function countFlaggedCells(board) {
    let flagged = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell.flagged) flagged += 1;
      }
    }
    return flagged;
  }

  function countRevealedSafeCells(board) {
    let count = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell.revealed && !cell.mine) count += 1;
      }
    }
    return count;
  }

  function totalSafeCells(state) {
    return state.rows * state.cols - state.mines;
  }

  function addLog(state, message, type) {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    state.log.push({ timestamp, message, type });
    if (state.log.length > 100) {
      state.log = state.log.slice(-100);
    }
  }

  function nextTurn(state) {
    if (state.players.length <= 1 || state.gameOver) return;
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
  }

  function floodReveal(board, row, col) {
    const rows = board.length;
    const cols = board[0].length;
    const stack = [[row, col]];
    let revealed = 0;

    while (stack.length) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const cell = board[r][c];
      if (cell.revealed || cell.flagged || cell.mine) continue;

      cell.revealed = true;
      revealed += 1;

      if (cell.count === 0) {
        for (const [nr, nc] of getNeighbors(rows, cols, r, c)) {
          const nCell = board[nr][nc];
          if (!nCell.revealed && !nCell.mine && !nCell.flagged) stack.push([nr, nc]);
        }
      }
    }

    return revealed;
  }

  function revealOnLoss(board, hitRow, hitCol) {
    for (const row of board) {
      for (const cell of row) {
        if (cell.mine) cell.revealed = true;
        if (cell.flagged && !cell.mine) cell.wrongFlag = true;
      }
    }
    board[hitRow][hitCol].exploded = true;
  }

  function checkAndApplyWin(state) {
    if (state.gameOver) return false;
    const revealedSafe = countRevealedSafeCells(state.board);
    if (revealedSafe === totalSafeCells(state)) {
      state.gameOver = true;
      state.gameWon = true;
      state.endTimeMs = Date.now();
      addLog(state, '🎉 Round won! All safe cells revealed.', 'win');
      return true;
    }
    return false;
  }

  function applyReveal(state, row, col) {
    const result = {
      changed: false,
      outcome: 'noop',
      revealedCells: 0,
      scoreDelta: 0,
      player: state.players[state.currentTurnIndex] || null
    };

    if (state.gameOver) return result;
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return result;

    const player = state.players[state.currentTurnIndex];
    if (!player) return result;

    const board = state.board;
    const cell = board[row][col];
    if (cell.revealed || cell.flagged) return result;

    if (!state.firstRevealDone) {
      placeMines(board, state.mines, row, col);
      state.firstRevealDone = true;
      state.startTimeMs = Date.now();
    }

    if (board[row][col].mine) {
      board[row][col].revealed = true;
      revealOnLoss(board, row, col);
      state.gameOver = true;
      state.gameWon = false;
      state.endTimeMs = Date.now();
      state.scores[player] = (state.scores[player] || 0) - 1;
      result.changed = true;
      result.outcome = 'mine';
      result.revealedCells = 1;
      result.scoreDelta = -1;
      addLog(state, `💥 ${player} hit a mine.`, 'loss');
    } else {
      const revealed = floodReveal(board, row, col);
      if (revealed > 0) {
        state.scores[player] = (state.scores[player] || 0) + revealed;
        result.changed = true;
        result.outcome = 'safe';
        result.revealedCells = revealed;
        result.scoreDelta = revealed;
        addLog(state, `✓ ${player} revealed ${revealed} cell${revealed === 1 ? '' : 's'}.`, 'safe');
      }
      checkAndApplyWin(state);
    }

    state.mineFlags = countFlaggedCells(state.board);
    if (!state.gameOver && result.changed) nextTurn(state);
    if (result.changed) state.revision += 1;

    return result;
  }

  function applyToggleFlag(state, row, col) {
    const result = {
      changed: false,
      outcome: 'noop',
      player: state.players[state.currentTurnIndex] || null,
      flagged: false
    };

    if (state.gameOver) return result;
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return result;

    const player = state.players[state.currentTurnIndex];
    if (!player) return result;

    const cell = state.board[row][col];
    if (cell.revealed) return result;

    cell.flagged = !cell.flagged;
    result.changed = true;
    result.outcome = cell.flagged ? 'flagged' : 'unflagged';
    result.flagged = cell.flagged;

    state.mineFlags = countFlaggedCells(state.board);
    addLog(state, `${player} ${cell.flagged ? 'placed' : 'removed'} a flag.`, 'info');
    nextTurn(state);
    state.revision += 1;

    return result;
  }

  function addPlayer(state, playerName) {
    const raw = typeof playerName === 'string' ? playerName : '';
    const normalized = normalizeName(raw);

    if (!isValidName(normalized)) {
      return { ok: false, reason: 'Name must be 1-16 chars and use letters, numbers, spaces, -, _, or .' };
    }
    if (state.players.length >= MAX_PLAYERS) {
      return { ok: false, reason: 'Maximum 8 players reached.' };
    }
    const taken = state.players.some((name) => name.toLowerCase() === normalized.toLowerCase());
    if (taken) {
      return { ok: false, reason: 'That name is already in this local game.' };
    }

    state.players.push(normalized);
    state.scores[normalized] = state.scores[normalized] || 0;
    state.revision += 1;
    addLog(state, `${normalized} joined this local device game.`, 'info');
    return { ok: true, name: normalized };
  }

  function removeMissingScoreEntries(state) {
    const keep = new Set(state.players);
    for (const key of Object.keys(state.scores)) {
      if (!keep.has(key)) delete state.scores[key];
    }
  }

  function startNewRound(state) {
    const next = createInitialState({ rows: state.rows, cols: state.cols, mines: state.mines, players: state.players });
    next.scores = { ...state.scores };
    removeMissingScoreEntries(next);
    next.roundNumber = (state.roundNumber || 1) + 1;
    next.currentTurnIndex = state.players.length ? (state.currentTurnIndex + 1) % state.players.length : 0;
    next.log = state.log.slice(-50);
    addLog(next, `🔄 Started round ${next.roundNumber}.`, 'info');
    next.revision = (state.revision || 0) + 1;
    return next;
  }

  function serialize(state) {
    return JSON.stringify(state);
  }

  function reviveState(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const rows = Number(raw.rows);
    const cols = Number(raw.cols);
    const mines = Number(raw.mines);
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || !Number.isInteger(mines)) return null;

    const fallback = createInitialState({ rows, cols, mines, players: Array.isArray(raw.players) && raw.players.length ? raw.players : ['Player 1'] });

    try {
      const state = {
        ...fallback,
        ...raw,
        board: cloneBoard(raw.board),
        players: Array.isArray(raw.players) && raw.players.length ? raw.players.slice(0, MAX_PLAYERS) : fallback.players,
        scores: { ...(raw.scores || fallback.scores) },
        log: Array.isArray(raw.log) ? raw.log.slice(-100) : []
      };

      if (!Array.isArray(state.board) || state.board.length !== rows || !Array.isArray(state.board[0]) || state.board[0].length !== cols) {
        return null;
      }

      state.mineFlags = countFlaggedCells(state.board);
      if (state.currentTurnIndex >= state.players.length) state.currentTurnIndex = 0;
      for (const p of state.players) {
        if (typeof state.scores[p] !== 'number') state.scores[p] = 0;
      }
      removeMissingScoreEntries(state);
      return state;
    } catch (err) {
      return null;
    }
  }

  function remainingMines(state) {
    return Math.max(0, state.mines - state.mineFlags);
  }

  return {
    DEFAULT_ROWS,
    DEFAULT_COLS,
    DEFAULT_MINES,
    MAX_PLAYERS,
    createBoard,
    createInitialState,
    placeMines,
    computeCounts,
    getNeighbors,
    floodReveal,
    applyReveal,
    applyToggleFlag,
    addPlayer,
    startNewRound,
    remainingMines,
    serialize,
    reviveState,
    isValidName,
    normalizeName,
    countRevealedSafeCells,
    countFlaggedCells
  };
});
