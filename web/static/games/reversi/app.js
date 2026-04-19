(() => {
  'use strict';

  const SIZE = 8;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  const elements = {
    board: document.getElementById('board'),
    turnText: document.getElementById('turn-text'),
    blackCount: document.getElementById('black-count'),
    whiteCount: document.getElementById('white-count'),
    moveCount: document.getElementById('move-count'),
    statusText: document.getElementById('status-text'),
    btnRestart: document.getElementById('btn-restart'),
    toast: document.getElementById('toast'),
  };

  const state = {
    board: [],
    current: BLACK,
    moves: 0,
    gameOver: false,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function createBoard() {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    board[3][3] = WHITE;
    board[3][4] = BLACK;
    board[4][3] = BLACK;
    board[4][4] = WHITE;
    return board;
  }

  function opposite(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  function inBounds(row, col) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function collectFlips(row, col, player) {
    if (state.board[row][col] !== EMPTY) return [];
    const flips = [];

    for (const [dr, dc] of directions) {
      const local = [];
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c) && state.board[r][c] === opposite(player)) {
        local.push([r, c]);
        r += dr;
        c += dc;
      }
      if (local.length > 0 && inBounds(r, c) && state.board[r][c] === player) {
        flips.push(...local);
      }
    }

    return flips;
  }

  function validMoves(player) {
    const moves = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const flips = collectFlips(row, col, player);
        if (flips.length > 0) moves.push({ row, col });
      }
    }
    return moves;
  }

  function counts() {
    let black = 0;
    let white = 0;
    for (const row of state.board) {
      for (const cell of row) {
        if (cell === BLACK) black += 1;
        if (cell === WHITE) white += 1;
      }
    }
    return { black, white };
  }

  function updateStatus() {
    const { black, white } = counts();
    elements.blackCount.textContent = String(black);
    elements.whiteCount.textContent = String(white);
    elements.moveCount.textContent = String(state.moves);
    elements.turnText.textContent = state.current === BLACK ? '黑棋' : '白棋';

    if (state.gameOver) {
      if (black > white) {
        elements.statusText.textContent = '黑棋获胜';
      } else if (white > black) {
        elements.statusText.textContent = '白棋获胜';
      } else {
        elements.statusText.textContent = '平局';
      }
      return;
    }

    elements.statusText.textContent = '点击高亮格子落子';
  }

  function render() {
    const moves = validMoves(state.current);
    const moveSet = new Set(moves.map((move) => `${move.row},${move.col}`));
    elements.board.innerHTML = '';

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        if (!state.gameOver && moveSet.has(`${row},${col}`)) cell.classList.add('playable');

        const stone = state.board[row][col];
        if (stone !== EMPTY) {
          const piece = document.createElement('span');
          piece.className = `stone ${stone === BLACK ? 'black' : 'white'}`;
          cell.appendChild(piece);
        }

        elements.board.appendChild(cell);
      }
    }

    updateStatus();
  }

  function finishIfNeeded() {
    const currentMoves = validMoves(state.current);
    const otherMoves = validMoves(opposite(state.current));

    if (currentMoves.length === 0 && otherMoves.length === 0) {
      state.gameOver = true;
      render();
      showToast('对局结束');
      return;
    }

    if (currentMoves.length === 0) {
      state.current = opposite(state.current);
      render();
      showToast('当前无合法步，自动换手');
      return;
    }

    render();
  }

  function play(row, col) {
    if (state.gameOver) return;
    const flips = collectFlips(row, col, state.current);
    if (flips.length === 0) return;

    state.board[row][col] = state.current;
    flips.forEach(([r, c]) => {
      state.board[r][c] = state.current;
    });
    state.moves += 1;
    state.current = opposite(state.current);
    finishIfNeeded();
  }

  function resetGame() {
    state.board = createBoard();
    state.current = BLACK;
    state.moves = 0;
    state.gameOver = false;
    render();
  }

  elements.board.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    play(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  elements.btnRestart.addEventListener('click', () => {
    resetGame();
    showToast('棋局已重置');
  });

  resetGame();
})();
