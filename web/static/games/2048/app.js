(() => {
  'use strict';

  const SIZE = 4;
  const STORAGE_KEY = 'arcade.2048.best';

  const elements = {
    board: document.getElementById('board'),
    score: document.getElementById('score'),
    best: document.getElementById('best-score'),
    maxTile: document.getElementById('max-tile'),
    moveCount: document.getElementById('move-count'),
    statusChip: document.getElementById('status-chip'),
    btnRestart: document.getElementById('btn-restart'),
    controls: Array.from(document.querySelectorAll('[data-dir]')),
    toast: document.getElementById('toast'),
  };

  const state = {
    board: [],
    score: 0,
    best: 0,
    moves: 0,
    won: false,
    over: false,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1600);
  }

  function loadBest() {
    try {
      return Number(window.localStorage.getItem(STORAGE_KEY) || 0);
    } catch (_) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (_) {
      // 忽略存储失败。
    }
  }

  function createEmptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function transpose(board) {
    return board[0].map((_, col) => board.map((row) => row[col]));
  }

  function reverseRows(board) {
    return board.map((row) => row.slice().reverse());
  }

  function boardsEqual(a, b) {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (a[row][col] !== b[row][col]) return false;
      }
    }
    return true;
  }

  function emptyCells() {
    const cells = [];
    state.board.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (value === 0) cells.push({ row: rowIndex, col: colIndex });
      });
    });
    return cells;
  }

  function addRandomTile() {
    const cells = emptyCells();
    if (cells.length === 0) return false;
    const pick = cells[Math.floor(Math.random() * cells.length)];
    state.board[pick.row][pick.col] = Math.random() < 0.9 ? 2 : 4;
    return true;
  }

  function compactLine(line) {
    return line.filter((value) => value !== 0);
  }

  function mergeLine(line) {
    const compact = compactLine(line);
    const merged = [];
    let gained = 0;

    for (let i = 0; i < compact.length; i++) {
      if (compact[i] !== 0 && compact[i] === compact[i + 1]) {
        const value = compact[i] * 2;
        merged.push(value);
        gained += value;
        if (value === 2048) state.won = true;
        i += 1;
      } else {
        merged.push(compact[i]);
      }
    }

    while (merged.length < SIZE) merged.push(0);
    return { line: merged, gained };
  }

  function maxTile() {
    return Math.max(...state.board.flat());
  }

  function hasMoves() {
    if (emptyCells().length > 0) return true;
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const value = state.board[row][col];
        if (row + 1 < SIZE && state.board[row + 1][col] === value) return true;
        if (col + 1 < SIZE && state.board[row][col + 1] === value) return true;
      }
    }
    return false;
  }

  function updateStatus() {
    if (state.over) {
      elements.statusChip.textContent = '游戏结束，没有可移动的方块';
      return;
    }
    if (state.won) {
      elements.statusChip.textContent = '你已合成 2048，继续挑战更高分数';
      return;
    }
    elements.statusChip.textContent = '继续挑战更高分数';
  }

  function render() {
    elements.board.innerHTML = '';
    state.board.forEach((row) => {
      row.forEach((value) => {
        const cell = document.createElement('div');
        cell.className = value === 0 ? 'cell empty' : `cell n${Math.min(value, 2048)}${value > 2048 ? ' super' : ''}`;
        cell.textContent = value || '';
        elements.board.appendChild(cell);
      });
    });

    elements.score.textContent = String(state.score);
    elements.best.textContent = String(state.best);
    elements.maxTile.textContent = String(maxTile());
    elements.moveCount.textContent = String(state.moves);
    updateStatus();
  }

  function move(direction) {
    if (state.over) return false;

    const original = cloneBoard(state.board);
    let working = cloneBoard(state.board);

    if (direction === 'up' || direction === 'down') working = transpose(working);
    if (direction === 'right' || direction === 'down') working = reverseRows(working);

    let gained = 0;
    working = working.map((row) => {
      const result = mergeLine(row);
      gained += result.gained;
      return result.line;
    });

    if (direction === 'right' || direction === 'down') working = reverseRows(working);
    if (direction === 'up' || direction === 'down') working = transpose(working);

    if (boardsEqual(original, working)) return false;

    state.board = working;
    state.score += gained;
    state.moves += 1;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest(state.best);
    }
    addRandomTile();
    state.over = !hasMoves();
    render();
    return true;
  }

  function resetGame() {
    state.board = createEmptyBoard();
    state.score = 0;
    state.moves = 0;
    state.won = false;
    state.over = false;
    addRandomTile();
    addRandomTile();
    render();
  }

  function labelFor(direction) {
    switch (direction) {
      case 'up': return '上';
      case 'down': return '下';
      case 'left': return '左';
      case 'right': return '右';
      default: return '';
    }
  }

  window.addEventListener('keydown', (event) => {
    const map = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = map[event.key];
    if (!direction) return;
    event.preventDefault();
    if (move(direction)) showToast(`向${labelFor(direction)}移动`);
  });

  elements.controls.forEach((button) => {
    button.addEventListener('click', () => {
      const direction = button.dataset.dir;
      if (direction && move(direction)) showToast(`向${labelFor(direction)}移动`);
    });
  });

  elements.btnRestart.addEventListener('click', () => {
    resetGame();
    showToast('已重新开始');
  });

  state.best = loadBest();
  resetGame();
})();
