/**
 * Tic-Tac-Toe with three AI difficulties:
 *   easy   — pure random
 *   medium — heuristic: take wins, block losses, fork-bias, but ~25% random
 *   hard   — perfect minimax (player can never beat it)
 *
 * Modes: pvp (two human) and ai (vs computer)
 */
(() => {
  'use strict';

  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  const game = {
    board: Array(9).fill(''),
    turn: 'X',
    mode: 'ai',
    diff: 'medium',
    playerMark: 'X',
    aiMark: 'O',
    over: false,
    winner: null,
    winLine: null,
    round: 1,
    score: { X: 0, O: 0, draw: 0 },
  };

  const els = {
    board: document.getElementById('board'),
    status: document.getElementById('status-banner'),
    roundNum: document.getElementById('round-num'),
    scoreX: document.getElementById('score-x'),
    scoreO: document.getElementById('score-o'),
    scoreDraw: document.getElementById('score-draw'),
    aiOptions: document.getElementById('ai-options'),
    diffTabs: document.getElementById('diff-tabs'),
    modeTabs: document.getElementById('mode-tabs'),
    playerMark: document.getElementById('player-mark'),
    btnRestart: document.getElementById('btn-restart'),
    btnResetScore: document.getElementById('btn-reset-score'),
  };

  function buildBoard() {
    els.board.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'ttt-cell';
      cell.role = 'gridcell';
      cell.dataset.idx = i;
      cell.addEventListener('click', () => onCellClick(i));
      els.board.appendChild(cell);
    }
    refreshBoard();
  }

  function refreshBoard() {
    for (let i = 0; i < 9; i++) {
      const c = els.board.children[i];
      const m = game.board[i];
      c.className = 'ttt-cell';
      if (m) {
        c.classList.add('taken', m === 'X' ? 'x' : 'o');
        c.textContent = m;
      } else {
        c.textContent = '';
      }
    }
    if (game.winLine) {
      for (const idx of game.winLine) {
        els.board.children[idx].classList.add('win');
      }
    }
  }

  function onCellClick(i) {
    if (game.over) return;
    if (game.board[i]) return;
    if (game.mode === 'ai' && game.turn !== game.playerMark) return;
    play(i, game.turn);
    if (!game.over && game.mode === 'ai') {
      // Slight delay so the move is visible
      setTimeout(aiMove, 220);
    }
  }

  function play(i, mark) {
    game.board[i] = mark;
    refreshBoard();
    const win = winnerOf(game.board);
    if (win) {
      finishGame(win.mark, win.line);
      return;
    }
    if (game.board.every(c => c)) {
      finishGame(null, null);
      return;
    }
    game.turn = (mark === 'X' ? 'O' : 'X');
    updateStatus();
  }

  function finishGame(mark, line) {
    game.over = true;
    game.winner = mark;
    game.winLine = line;
    if (mark === 'X') game.score.X++;
    else if (mark === 'O') game.score.O++;
    else game.score.draw++;
    refreshBoard();
    updateStatus();
    updateScoreDisplay();
  }

  function updateStatus() {
    let txt = '';
    let cls = '';
    if (game.over) {
      if (game.winner === null) {
        txt = '本局平局';
        cls = 'draw';
      } else if (game.mode === 'ai') {
        if (game.winner === game.playerMark) {
          txt = `🎉 你赢了（${game.winner}）`;
          cls = 'you-win';
        } else {
          txt = `AI 获胜（${game.winner}）`;
          cls = 'you-lose';
        }
      } else {
        txt = `${game.winner} 获胜！`;
      }
    } else {
      if (game.mode === 'ai') {
        if (game.turn === game.playerMark) txt = `轮到你（${game.turn}）落子`;
        else txt = `AI 思考中…（${game.turn}）`;
      } else {
        txt = `轮到 ${game.turn} 落子`;
      }
    }
    els.status.textContent = txt;
    els.status.className = 'status-banner ' + cls;
  }

  function updateScoreDisplay() {
    els.roundNum.textContent = game.round;
    els.scoreX.textContent = game.score.X;
    els.scoreO.textContent = game.score.O;
    els.scoreDraw.textContent = game.score.draw;
  }

  function newRound() {
    game.board = Array(9).fill('');
    game.turn = 'X';
    game.over = false;
    game.winner = null;
    game.winLine = null;
    game.round++;
    refreshBoard();
    updateStatus();
    updateScoreDisplay();
    if (game.mode === 'ai' && game.turn === game.aiMark) {
      setTimeout(aiMove, 350);
    }
  }

  function resetScore() {
    game.score = { X: 0, O: 0, draw: 0 };
    game.round = 1;
    updateScoreDisplay();
  }

  // ---------- AI ----------
  function aiMove() {
    if (game.over) return;
    let idx;
    switch (game.diff) {
      case 'easy':   idx = chooseRandom(game.board); break;
      case 'hard':   idx = chooseMinimax(game.board, game.aiMark); break;
      case 'medium':
      default:       idx = chooseMedium(game.board, game.aiMark); break;
    }
    if (idx == null) return;
    play(idx, game.aiMark);
  }

  function chooseRandom(b) {
    const empty = [];
    for (let i = 0; i < 9; i++) if (!b[i]) empty.push(i);
    return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null;
  }

  function chooseMedium(b, ai) {
    // 25% blunder by playing random
    if (Math.random() < 0.25) return chooseRandom(b);
    const opp = ai === 'X' ? 'O' : 'X';
    // 1) Win immediately
    let m = findImmediate(b, ai);
    if (m != null) return m;
    // 2) Block opponent
    m = findImmediate(b, opp);
    if (m != null) return m;
    // 3) Take center
    if (!b[4]) return 4;
    // 4) Take a corner if free
    const corners = [0,2,6,8].filter(i => !b[i]);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    // 5) Take any side
    const sides = [1,3,5,7].filter(i => !b[i]);
    return sides[Math.floor(Math.random() * sides.length)];
  }

  function findImmediate(b, mark) {
    for (const line of WIN_LINES) {
      const vals = line.map(i => b[i]);
      const cnt = vals.filter(v => v === mark).length;
      const empty = line.find(i => !b[i]);
      if (cnt === 2 && empty != null) return empty;
    }
    return null;
  }

  function chooseMinimax(b, ai) {
    const opp = ai === 'X' ? 'O' : 'X';
    let bestScore = -Infinity;
    let bestMoves = [];
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = ai;
      const sc = minimax(b, false, ai, opp, 1);
      b[i] = '';
      if (sc > bestScore) {
        bestScore = sc;
        bestMoves = [i];
      } else if (sc === bestScore) {
        bestMoves.push(i);
      }
    }
    if (bestMoves.length === 0) return chooseRandom(b);
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function minimax(b, maximizing, ai, opp, depth) {
    const w = winnerOf(b);
    if (w) {
      // Prefer faster wins, slower losses
      return (w.mark === ai ? 10 - depth : depth - 10);
    }
    if (b.every(c => c)) return 0;
    if (maximizing) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = ai;
        best = Math.max(best, minimax(b, false, ai, opp, depth + 1));
        b[i] = '';
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = opp;
        best = Math.min(best, minimax(b, true, ai, opp, depth + 1));
        b[i] = '';
      }
      return best;
    }
  }

  function winnerOf(b) {
    for (const line of WIN_LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[c] === b[d]) return { mark: b[a], line };
    }
    return null;
  }

  // ---------- Mode / difficulty controls ----------
  els.modeTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.mode-tab');
    if (!tab) return;
    els.modeTabs.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    game.mode = tab.dataset.mode;
    els.aiOptions.classList.toggle('hidden', game.mode !== 'ai');
    if (els.aiOptions.classList.contains('hidden')) {
      els.aiOptions.style.display = 'none';
    } else {
      els.aiOptions.style.display = '';
    }
    newRound();
  });

  els.diffTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.diff-tab');
    if (!tab) return;
    els.diffTabs.querySelectorAll('.diff-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    game.diff = tab.dataset.diff;
  });

  els.playerMark.addEventListener('change', () => {
    game.playerMark = els.playerMark.value;
    game.aiMark = game.playerMark === 'X' ? 'O' : 'X';
    newRound();
  });

  els.btnRestart.addEventListener('click', () => newRound());
  els.btnResetScore.addEventListener('click', () => resetScore());

  // ---------- Boot ----------
  buildBoard();
  updateStatus();
  updateScoreDisplay();
})();
