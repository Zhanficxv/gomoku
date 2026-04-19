(() => {
  'use strict';

  const WIN_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  const elements = {
    board: document.getElementById('board'),
    status: document.getElementById('status-text'),
    scoreX: document.getElementById('score-x'),
    scoreO: document.getElementById('score-o'),
    scoreDraw: document.getElementById('score-draw'),
    btnRestart: document.getElementById('btn-restart'),
    btnResetScore: document.getElementById('btn-reset-score'),
    toast: document.getElementById('toast'),
  };

  const state = {
    board: Array(9).fill(''),
    current: 'X',
    gameOver: false,
    scores: { X: 0, O: 0, draw: 0 },
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1500);
  }

  function getWinner(board) {
    for (const [a, b, c] of WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return { winner: board[a], line: [a, b, c] };
      }
    }
    return null;
  }

  function renderScores() {
    elements.scoreX.textContent = String(state.scores.X);
    elements.scoreO.textContent = String(state.scores.O);
    elements.scoreDraw.textContent = String(state.scores.draw);
  }

  function renderStatus(message) {
    elements.status.textContent = message;
  }

  function renderBoard() {
    const result = getWinner(state.board);
    elements.board.innerHTML = '';
    state.board.forEach((value, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      if (value) button.classList.add(`mark-${value.toLowerCase()}`);
      if (result && result.line.includes(index)) button.classList.add('winner');
      button.textContent = value;
      button.disabled = Boolean(value) || state.gameOver;
      button.dataset.index = String(index);
      button.setAttribute('aria-label', value ? `位置 ${index + 1}，已落子 ${value}` : `位置 ${index + 1}`);
      elements.board.appendChild(button);
    });
  }

  function restartRound(showMessage) {
    state.board = Array(9).fill('');
    state.current = 'X';
    state.gameOver = false;
    renderBoard();
    renderStatus('轮到 X 落子');
    if (showMessage) showToast('已开始新一轮');
  }

  function resetScores() {
    state.scores = { X: 0, O: 0, draw: 0 };
    renderScores();
    restartRound(false);
    showToast('比分已清空');
  }

  function handleMove(index) {
    if (state.gameOver || state.board[index]) return;

    state.board[index] = state.current;
    const result = getWinner(state.board);

    if (result) {
      state.gameOver = true;
      state.scores[result.winner] += 1;
      renderScores();
      renderBoard();
      renderStatus(`${result.winner} 获胜！`);
      showToast(`${result.winner} 获胜`);
      return;
    }

    if (state.board.every(Boolean)) {
      state.gameOver = true;
      state.scores.draw += 1;
      renderScores();
      renderBoard();
      renderStatus('平局，本轮无人获胜');
      showToast('平局');
      return;
    }

    state.current = state.current === 'X' ? 'O' : 'X';
    renderBoard();
    renderStatus(`轮到 ${state.current} 落子`);
  }

  elements.board.addEventListener('click', (event) => {
    const button = event.target.closest('.cell');
    if (!button) return;
    handleMove(Number(button.dataset.index));
  });

  elements.btnRestart.addEventListener('click', () => restartRound(true));
  elements.btnResetScore.addEventListener('click', resetScores);

  renderScores();
  restartRound(false);
})();
