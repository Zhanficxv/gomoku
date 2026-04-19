(() => {
  'use strict';

  const ROWS = 9;
  const COLS = 9;
  const MINES = 10;

  const elements = {
    board: document.getElementById('board'),
    mineCount: document.getElementById('mine-count'),
    flagCount: document.getElementById('flag-count'),
    safeLeft: document.getElementById('safe-left'),
    timer: document.getElementById('timer'),
    statusChip: document.getElementById('status-chip'),
    btnNew: document.getElementById('btn-new'),
    btnReveal: document.getElementById('btn-reveal'),
    toast: document.getElementById('toast'),
  };

  const state = {
    board: [],
    flags: 0,
    opened: 0,
    timerId: null,
    startedAt: 0,
    gameOver: false,
    firstMove: true,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function createCell(row, col) {
    return {
      row,
      col,
      mine: false,
      opened: false,
      flagged: false,
      count: 0,
    };
  }

  function createBoard() {
    return Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) => createCell(row, col))
    );
  }

  function neighbors(row, col) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        list.push(state.board[nr][nc]);
      }
    }
    return list;
  }

  function placeMines(safeRow, safeCol) {
    let placed = 0;
    while (placed < MINES) {
      const row = Math.floor(Math.random() * ROWS);
      const col = Math.floor(Math.random() * COLS);
      const cell = state.board[row][col];
      if (cell.mine || (row === safeRow && col === safeCol)) continue;
      cell.mine = true;
      placed += 1;
    }

    state.board.forEach((row) => {
      row.forEach((cell) => {
        cell.count = neighbors(cell.row, cell.col).filter((item) => item.mine).length;
      });
    });
  }

  function formatTime(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.startedAt = Date.now();
    elements.timer.textContent = '00:00';
    state.timerId = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
      elements.timer.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function updateStats() {
    elements.mineCount.textContent = String(MINES);
    elements.flagCount.textContent = String(state.flags);
    elements.safeLeft.textContent = String(ROWS * COLS - MINES - state.opened);
  }

  function revealAllMines() {
    state.board.forEach((row) => {
      row.forEach((cell) => {
        if (cell.mine) cell.opened = true;
      });
    });
  }

  function renderBoard() {
    elements.board.innerHTML = '';
    state.board.forEach((row) => {
      row.forEach((cell) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cell';
        button.dataset.row = String(cell.row);
        button.dataset.col = String(cell.col);

        if (cell.opened) {
          button.classList.add('revealed');
          if (cell.mine) {
            button.classList.add('mine');
            button.textContent = '💣';
          } else if (cell.count > 0) {
            button.textContent = String(cell.count);
            button.classList.add(`num-${cell.count}`);
          }
        } else if (cell.flagged) {
          button.classList.add('flagged');
          button.textContent = '🚩';
        }

        elements.board.appendChild(button);
      });
    });
  }

  function checkWin() {
    const safeCells = ROWS * COLS - MINES;
    if (state.opened === safeCells) {
      state.gameOver = true;
      stopTimer();
      elements.statusChip.textContent = '扫雷成功';
      showToast('恭喜通关！');
    }
  }

  function floodOpen(startCell) {
    const queue = [startCell];
    while (queue.length > 0) {
      const cell = queue.shift();
      if (cell.opened || cell.flagged) continue;
      cell.opened = true;
      state.opened += 1;
      if (cell.count !== 0) continue;
      neighbors(cell.row, cell.col).forEach((next) => {
        if (!next.opened && !next.mine && !next.flagged) {
          queue.push(next);
        }
      });
    }
  }

  function openCell(cell) {
    if (state.gameOver || cell.opened || cell.flagged) return;

    if (state.firstMove) {
      placeMines(cell.row, cell.col);
      state.firstMove = false;
      startTimer();
    }

    if (cell.mine) {
      cell.opened = true;
      revealAllMines();
      state.gameOver = true;
      stopTimer();
      elements.statusChip.textContent = '踩雷失败';
      renderBoard();
      updateStats();
      showToast('踩到地雷了');
      return;
    }

    floodOpen(cell);
    renderBoard();
    updateStats();
    checkWin();
  }

  function toggleFlag(cell) {
    if (state.gameOver || cell.opened) return;
    cell.flagged = !cell.flagged;
    state.flags += cell.flagged ? 1 : -1;
    renderBoard();
    updateStats();
  }

  function revealAll() {
    state.board.forEach((row) => {
      row.forEach((cell) => {
        cell.opened = true;
      });
    });
    state.gameOver = true;
    stopTimer();
    renderBoard();
    updateStats();
    elements.statusChip.textContent = '已强制揭示';
  }

  function restartGame() {
    stopTimer();
    state.board = createBoard();
    state.flags = 0;
    state.opened = 0;
    state.gameOver = false;
    state.firstMove = true;
    elements.timer.textContent = '00:00';
    elements.statusChip.textContent = '游戏进行中';
    updateStats();
    renderBoard();
  }

  elements.board.addEventListener('click', (event) => {
    const button = event.target.closest('.cell');
    if (!button) return;
    const row = Number(button.dataset.row);
    const col = Number(button.dataset.col);
    openCell(state.board[row][col]);
  });

  elements.board.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const button = event.target.closest('.cell');
    if (!button) return;
    const row = Number(button.dataset.row);
    const col = Number(button.dataset.col);
    toggleFlag(state.board[row][col]);
  });

  elements.btnNew.addEventListener('click', restartGame);
  elements.btnReveal.addEventListener('click', revealAll);

  restartGame();
})();
