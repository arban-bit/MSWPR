(function () {
  const KEY = 'mswpr-local-pass-and-play-v1';
  const Core = window.MinesweeperCore;

  const el = {
    grid: document.getElementById('mineGrid'),
    mineCounter: document.getElementById('mineCounter'),
    timerDisplay: document.getElementById('timerDisplay'),
    smileyBtn: document.getElementById('smileyBtn'),
    turnName: document.getElementById('turnName'),
    statusBar: document.getElementById('statusBar'),
    gameOverBanner: document.getElementById('gameOverBanner'),
    gameOverText: document.getElementById('gameOverText'),
    scoreboardContent: document.getElementById('scoreboardContent'),
    gameLog: document.getElementById('gameLog'),
    playerList: document.getElementById('playersList'),
    addPlayerInput: document.getElementById('addPlayerInput'),
    addPlayerError: document.getElementById('addPlayerError'),
    addPlayerBtn: document.getElementById('addPlayerBtn'),
    newRoundBtn: document.getElementById('newRoundBtn'),
    resetBtn: document.getElementById('resetBtn'),
    flagModeToggle: document.getElementById('flagModeToggle'),
    saveMode: document.getElementById('saveMode'),
    localHint: document.getElementById('localHint')
  };

  let state = null;
  let timerHandle = null;
  let flagMode = false;
  const memoryStore = { [KEY]: null };

  function localStorageAvailable() {
    try {
      const testKey = '__mswpr_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const storageAvailable = localStorageAvailable();

  function readRaw() {
    if (!storageAvailable) return memoryStore[KEY];
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return memoryStore[KEY];
    }
  }

  function writeRaw(value) {
    if (!storageAvailable) {
      memoryStore[KEY] = value;
      return;
    }
    try {
      window.localStorage.setItem(KEY, value);
      memoryStore[KEY] = value;
    } catch (e) {
      memoryStore[KEY] = value;
    }
  }

  function loadState() {
    const raw = readRaw();
    if (!raw) return Core.createInitialState();
    try {
      const parsed = JSON.parse(raw);
      const revived = Core.reviveState(parsed);
      return revived || Core.createInitialState();
    } catch (e) {
      return Core.createInitialState();
    }
  }

  function persistState() {
    writeRaw(Core.serialize(state));
    renderStorageStatus();
  }

  function renderStorageStatus() {
    if (!storageAvailable) {
      el.saveMode.textContent = 'Memory only (localStorage unavailable)';
      return;
    }
    el.saveMode.textContent = 'Saved in localStorage on this browser';
  }

  function pad3(n) {
    return String(Math.max(0, Math.min(999, n))).padStart(3, '0');
  }

  function elapsedSeconds() {
    if (!state.startTimeMs) return 0;
    const end = state.endTimeMs || Date.now();
    return Math.max(0, Math.floor((end - state.startTimeMs) / 1000));
  }

  function renderTimer() {
    el.timerDisplay.textContent = pad3(elapsedSeconds());
  }

  function currentPlayer() {
    if (!state.players.length) return null;
    return state.players[state.currentTurnIndex % state.players.length];
  }

  function setStatus(text) {
    el.statusBar.textContent = text;
  }

  function renderPlayers() {
    el.playerList.textContent = '';
    for (let i = 0; i < state.players.length; i++) {
      const name = state.players[i];
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      if (i === state.currentTurnIndex && !state.gameOver) chip.classList.add('active-turn');
      chip.textContent = name;
      el.playerList.appendChild(chip);
    }
  }

  function renderScoreboard() {
    el.scoreboardContent.textContent = '';
    const sorted = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.textContent = 'No scores yet';
      el.scoreboardContent.appendChild(empty);
      return;
    }

    const current = currentPlayer();
    sorted.forEach(([name, score], idx) => {
      const row = document.createElement('div');
      row.className = 'score-row';
      if (name === current && !state.gameOver) row.classList.add('current-turn');

      const nameEl = document.createElement('span');
      nameEl.className = 'player-name';
      nameEl.textContent = `${idx + 1}. ${name}`;

      const scoreEl = document.createElement('span');
      scoreEl.className = 'player-score';
      scoreEl.textContent = `${score >= 0 ? '+' : ''}${score}`;

      row.appendChild(nameEl);
      row.appendChild(scoreEl);
      el.scoreboardContent.appendChild(row);
    });
  }

  function renderLog() {
    const keepBottom = el.gameLog.scrollTop + el.gameLog.clientHeight >= el.gameLog.scrollHeight - 4;
    el.gameLog.textContent = '';
    state.log.slice(-40).forEach((entry) => {
      const line = document.createElement('div');
      line.className = `log-entry ${entry.type || ''}`;
      line.textContent = `[${entry.timestamp}] ${entry.message}`;
      el.gameLog.appendChild(line);
    });
    if (keepBottom) el.gameLog.scrollTop = el.gameLog.scrollHeight;
  }

  function describeCell(cell) {
    if (!cell.revealed && cell.flagged) return 'Flagged';
    if (!cell.revealed) return 'Hidden';
    if (cell.mine && cell.exploded) return 'Exploded mine';
    if (cell.mine) return 'Mine';
    if (cell.count === 0) return 'Revealed empty';
    return `Revealed ${cell.count}`;
  }

  function renderGrid() {
    const expected = state.rows * state.cols;
    if (el.grid.children.length !== expected) {
      el.grid.textContent = '';
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'cell';
          button.dataset.row = String(r);
          button.dataset.col = String(c);
          button.setAttribute('aria-label', `Cell ${r + 1},${c + 1}`);
          button.addEventListener('click', onCellClick);
          button.addEventListener('contextmenu', onCellContextMenu);
          button.addEventListener('keydown', onCellKeyDown);
          el.grid.appendChild(button);
        }
      }
    }

    const current = currentPlayer();
    const disabled = state.gameOver || !current;

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const index = r * state.cols + c;
        const button = el.grid.children[index];
        const cell = state.board[r][c];

        button.className = 'cell';
        button.textContent = '';
        button.disabled = disabled;

        if (!cell.revealed && cell.flagged) {
          button.classList.add('flagged');
          button.textContent = '🚩';
        }

        if (cell.revealed) {
          button.classList.add('revealed');
          if (cell.mine) {
            button.textContent = '💣';
            button.classList.add('mine-revealed');
            if (cell.exploded) button.classList.add('mine-hit');
          } else if (cell.count > 0) {
            button.textContent = String(cell.count);
            button.classList.add(`num-${cell.count}`);
          }
        }

        if (cell.wrongFlag) {
          button.classList.add('wrong-flag');
          button.textContent = '✖';
        }

        const modeHint = flagMode ? 'flag mode' : 'reveal mode';
        button.setAttribute('aria-label', `Cell ${r + 1},${c + 1}: ${describeCell(cell)}, ${modeHint}`);
      }
    }
  }

  function renderTop() {
    el.mineCounter.textContent = pad3(Core.remainingMines(state));

    if (state.gameOver && state.gameWon) {
      el.smileyBtn.textContent = '😎';
      el.turnName.textContent = 'Round won';
      el.gameOverText.textContent = '🎉 You cleared all safe cells!';
      el.gameOverBanner.classList.add('visible');
      setStatus('Round complete. Start a new round to keep scores.');
    } else if (state.gameOver) {
      el.smileyBtn.textContent = '😵';
      el.turnName.textContent = 'Round lost';
      el.gameOverText.textContent = '💥 Mine hit!';
      el.gameOverBanner.classList.add('visible');
      setStatus('Round over. Start a new round to continue.');
    } else {
      el.smileyBtn.textContent = '🙂';
      el.gameOverBanner.classList.remove('visible');
      const player = currentPlayer();
      el.turnName.textContent = player || 'No players';
      if (player) {
        setStatus(flagMode ? `${player}'s turn — flag mode is ON.` : `${player}'s turn — reveal mode.`);
      } else {
        setStatus('Add at least one player to begin.');
      }
    }
  }

  function renderAll() {
    renderTop();
    renderTimer();
    renderGrid();
    renderPlayers();
    renderScoreboard();
    renderLog();
    renderStorageStatus();
  }

  function applyAndPersist(changed) {
    if (!changed) return;
    persistState();
    renderAll();
  }

  function onCellReveal(row, col) {
    const outcome = Core.applyReveal(state, row, col);
    applyAndPersist(outcome.changed);
  }

  function onCellFlag(row, col) {
    const outcome = Core.applyToggleFlag(state, row, col);
    applyAndPersist(outcome.changed);
  }

  function onCellClick(event) {
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);
    if (flagMode) {
      onCellFlag(row, col);
    } else {
      onCellReveal(row, col);
    }
  }

  function onCellContextMenu(event) {
    event.preventDefault();
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);
    onCellFlag(row, col);
  }

  function onCellKeyDown(event) {
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);

    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      onCellFlag(row, col);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (flagMode) onCellFlag(row, col);
      else onCellReveal(row, col);
    }
  }

  function addPlayerFromInput() {
    const value = el.addPlayerInput.value;
    const result = Core.addPlayer(state, value);
    if (!result.ok) {
      el.addPlayerError.textContent = result.reason;
      el.addPlayerError.hidden = false;
      return;
    }

    el.addPlayerError.hidden = true;
    el.addPlayerInput.value = '';
    persistState();
    renderAll();
  }

  function startNewRound() {
    state = Core.startNewRound(state);
    flagMode = false;
    el.flagModeToggle.checked = false;
    persistState();
    renderAll();
  }

  function resetSession() {
    state = Core.createInitialState();
    flagMode = false;
    el.flagModeToggle.checked = false;
    persistState();
    renderAll();
  }

  function setupEvents() {
    el.addPlayerBtn.addEventListener('click', addPlayerFromInput);
    el.addPlayerInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addPlayerFromInput();
    });

    el.flagModeToggle.addEventListener('change', (event) => {
      flagMode = event.target.checked;
      renderTop();
      renderGrid();
    });

    el.smileyBtn.addEventListener('click', startNewRound);
    el.newRoundBtn.addEventListener('click', startNewRound);
    el.resetBtn.addEventListener('click', resetSession);

    if (storageAvailable) {
      window.addEventListener('storage', (event) => {
        if (event.key !== KEY || !event.newValue) return;
        try {
          const next = Core.reviveState(JSON.parse(event.newValue));
          if (!next) return;
          if ((next.revision || 0) > (state.revision || 0)) {
            state = next;
            renderAll();
          }
        } catch (e) {
          // Ignore malformed external values.
        }
      });
    }
  }

  function startTimerLoop() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      if (!state.startTimeMs) return;
      renderTimer();
    }, 500);
  }

  function initialize() {
    state = loadState();
    renderAll();
    setupEvents();
    startTimerLoop();

    el.localHint.textContent = storageAvailable
      ? 'Optional same-browser tab sync via localStorage events; not atomic multiplayer.'
      : 'localStorage unavailable here; game runs in memory until tab closes.';
  }

  initialize();
})();
