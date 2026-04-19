(() => {
  'use strict';

  const ROWS = 6;
  const COLS = 6;
  const PAIR_TYPES = [
    { icon: '🍎', label: '苹果' },
    { icon: '🍋', label: '柠檬' },
    { icon: '🍇', label: '葡萄' },
    { icon: '🍉', label: '西瓜' },
    { icon: '🥝', label: '奇异果' },
    { icon: '🍑', label: '桃子' },
    { icon: '🍒', label: '樱桃' },
    { icon: '🍍', label: '菠萝' },
    { icon: '🥥', label: '椰子' },
    { icon: '🍓', label: '草莓' },
    { icon: '🥕', label: '胡萝卜' },
    { icon: '🌽', label: '玉米' },
  ];

  const elements = {
    board: document.getElementById('board'),
    tilesLeft: document.getElementById('tiles-left'),
    pairsFound: document.getElementById('pairs-found'),
    moveCount: document.getElementById('move-count'),
    timerText: document.getElementById('timer-text'),
    statusText: document.getElementById('status-text'),
    btnNewGame: document.getElementById('btn-new-game'),
    btnShuffle: document.getElementById('btn-shuffle'),
    toast: document.getElementById('toast'),
  };

  const state = {
    board: [],
    selected: [],
    matchedPairs: 0,
    moves: 0,
    startedAt: 0,
    timerId: null,
    busy: false,
  };

  let toastTimer = null;

  function showToast(message, kind) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('success', 'error');
    if (kind) elements.toast.classList.add(kind);
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function shuffle(list) {
    const copied = list.slice();
    for (let i = copied.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copied[i], copied[j]] = [copied[j], copied[i]];
    }
    return copied;
  }

  function buildTiles() {
    const neededPairs = (ROWS * COLS) / 2;
    const raw = [];
    for (let i = 0; i < neededPairs; i++) {
      const type = PAIR_TYPES[i % PAIR_TYPES.length];
      raw.push(type, type);
    }

    const shuffled = shuffle(raw);
    const board = [];
    let index = 0;
    for (let row = 0; row < ROWS; row++) {
      const line = [];
      for (let col = 0; col < COLS; col++) {
        const tile = shuffled[index++];
        line.push({
          row,
          col,
          icon: tile.icon,
          label: tile.label,
          removed: false,
        });
      }
      board.push(line);
    }
    return board;
  }

  function formatSeconds(seconds) {
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function updateStats() {
    const totalPairs = (ROWS * COLS) / 2;
    const tilesLeft = (totalPairs - state.matchedPairs) * 2;
    elements.tilesLeft.textContent = String(tilesLeft);
    elements.pairsFound.textContent = String(state.matchedPairs);
    elements.moveCount.textContent = String(state.moves);
    elements.statusText.textContent = tilesLeft === 0
      ? `恭喜通关，用时 ${elements.timerText.textContent}，共 ${state.moves} 步。`
      : '请选择两个相同图块，若连线不超过两次转弯即可消除。';
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.startedAt = Date.now();
    elements.timerText.textContent = '00:00';
    state.timerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      elements.timerText.textContent = formatSeconds(elapsed);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function buildPathGrid() {
    const height = ROWS + 2;
    const width = COLS + 2;
    const grid = Array.from({ length: height }, () => Array(width).fill(0));
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        grid[row + 1][col + 1] = state.board[row][col].removed ? 0 : 1;
      }
    }
    return grid;
  }

  function canConnect(first, second) {
    const grid = buildPathGrid();
    const start = { row: first.row + 1, col: first.col + 1 };
    const target = { row: second.row + 1, col: second.col + 1 };
    grid[start.row][start.col] = 0;
    grid[target.row][target.col] = 0;

    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    const queue = [];
    const visited = new Map();

    for (let dir = 0; dir < directions.length; dir++) {
      queue.push({ row: start.row, col: start.col, dir, turns: 0 });
      visited.set(`${start.row},${start.col},${dir}`, 0);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      const move = directions[current.dir];
      let nextRow = current.row + move.dr;
      let nextCol = current.col + move.dc;

      while (
        nextRow >= 0 &&
        nextRow < ROWS + 2 &&
        nextCol >= 0 &&
        nextCol < COLS + 2 &&
        grid[nextRow][nextCol] === 0
      ) {
        if (nextRow === target.row && nextCol === target.col) {
          return true;
        }

        for (let nextDir = 0; nextDir < directions.length; nextDir++) {
          const nextTurns = current.turns + (nextDir === current.dir ? 0 : 1);
          if (nextTurns > 2) continue;
          const key = `${nextRow},${nextCol},${nextDir}`;
          const best = visited.get(key);
          if (best !== undefined && best <= nextTurns) continue;
          visited.set(key, nextTurns);
          queue.push({ row: nextRow, col: nextCol, dir: nextDir, turns: nextTurns });
        }

        nextRow += move.dr;
        nextCol += move.dc;
      }
    }

    return false;
  }

  function renderBoard() {
    elements.board.innerHTML = '';
    state.board.forEach((row) => {
      row.forEach((tile) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tile';
        button.dataset.row = String(tile.row);
        button.dataset.col = String(tile.col);

        if (tile.removed) button.classList.add('matched');
        if (state.selected.some((item) => item.row === tile.row && item.col === tile.col)) {
          button.classList.add('selected');
        }

        button.disabled = tile.removed || state.busy;
        button.textContent = tile.removed ? '' : tile.icon;
        button.setAttribute('aria-label', tile.removed ? '已消除图块' : tile.label);

        elements.board.appendChild(button);
      });
    });
  }

  function clearSelection() {
    state.selected = [];
    renderBoard();
  }

  function finishIfComplete() {
    if (state.matchedPairs === (ROWS * COLS) / 2) {
      stopTimer();
      updateStats();
      showToast('连连看通关！', 'success');
    }
  }

  function pickTile(tile) {
    if (state.busy || tile.removed) return;

    const exists = state.selected.find((item) => item.row === tile.row && item.col === tile.col);
    if (exists) {
      clearSelection();
      return;
    }

    state.selected.push(tile);
    renderBoard();

    if (state.selected.length < 2) return;

    const [first, second] = state.selected;
    state.moves += 1;

    if (first.icon !== second.icon) {
      updateStats();
      state.busy = true;
      showToast('图案不同，无法消除', 'error');
      setTimeout(() => {
        state.busy = false;
        clearSelection();
      }, 500);
      return;
    }

    if (!canConnect(first, second)) {
      updateStats();
      state.busy = true;
      showToast('当前路径无法在两次转弯内连通', 'error');
      setTimeout(() => {
        state.busy = false;
        clearSelection();
      }, 700);
      return;
    }

    first.removed = true;
    second.removed = true;
    state.selected = [];
    state.matchedPairs += 1;
    updateStats();
    renderBoard();
    showToast('成功消除一对', 'success');
    finishIfComplete();
  }

  function collectRemainingTiles() {
    const tiles = [];
    state.board.forEach((row) => {
      row.forEach((tile) => {
        if (!tile.removed) {
          tiles.push({ icon: tile.icon, label: tile.label });
        }
      });
    });
    return tiles;
  }

  function shuffleRemaining() {
    const remaining = shuffle(collectRemainingTiles());
    let index = 0;
    state.board.forEach((row) => {
      row.forEach((tile) => {
        if (tile.removed) return;
        const replacement = remaining[index++];
        tile.icon = replacement.icon;
        tile.label = replacement.label;
      });
    });
    state.selected = [];
    renderBoard();
    showToast('剩余图块已重新洗牌');
  }

  function resetGame() {
    state.board = buildTiles();
    state.selected = [];
    state.matchedPairs = 0;
    state.moves = 0;
    state.busy = false;
    startTimer();
    updateStats();
    renderBoard();
  }

  elements.board.addEventListener('click', (event) => {
    const button = event.target.closest('.tile');
    if (!button) return;
    const row = Number(button.dataset.row);
    const col = Number(button.dataset.col);
    const tile = state.board[row] && state.board[row][col];
    if (!tile) return;
    pickTile(tile);
  });

  elements.btnNewGame.addEventListener('click', resetGame);
  elements.btnShuffle.addEventListener('click', shuffleRemaining);

  resetGame();
})();
