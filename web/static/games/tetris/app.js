(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 28;
  const STORAGE_KEY = 'arcade.tetris.best';
  const SPEEDS = [850, 760, 680, 600, 520, 440, 360, 300, 240, 200];
  const EMPTY = 0;

  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  };

  const COLORS = {
    I: '#5de4ff',
    O: '#ffd96f',
    T: '#c292ff',
    S: '#7df0a7',
    Z: '#ff8797',
    J: '#7aa2ff',
    L: '#ffb26b',
  };

  const elements = {
    board: document.getElementById('board'),
    next: document.getElementById('next-piece'),
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lines: document.getElementById('lines'),
    best: document.getElementById('best-score'),
    status: document.getElementById('status-text'),
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    toast: document.getElementById('toast'),
  };

  const ctx = elements.board.getContext('2d');
  const nextCtx = elements.next.getContext('2d');

  const state = {
    board: [],
    current: null,
    next: null,
    timerId: null,
    running: false,
    paused: false,
    score: 0,
    lines: 0,
    level: 1,
    best: 0,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function loadBest() {
    try {
      state.best = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
    } catch (_) {
      state.best = 0;
    }
  }

  function saveBest() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(state.best));
    } catch (_) {
      // 忽略本地存储失败
    }
  }

  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
  }

  function cloneMatrix(matrix) {
    return matrix.map((row) => row.slice());
  }

  function randomType() {
    const keys = Object.keys(SHAPES);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  function createPiece(type = randomType()) {
    const shape = cloneMatrix(SHAPES[type]);
    return {
      type,
      shape,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: 0,
    };
  }

  function drawCell(ctx2d, x, y, type, size) {
    ctx2d.fillStyle = COLORS[type] || '#ffffff';
    ctx2d.fillRect(x * size, y * size, size - 1, size - 1);
    ctx2d.fillStyle = 'rgba(255,255,255,0.18)';
    ctx2d.fillRect(x * size, y * size, size - 1, 6);
  }

  function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nextX = piece.x + x + dx;
        const nextY = piece.y + y + dy;
        if (nextX < 0 || nextX >= COLS || nextY >= ROWS) return true;
        if (nextY >= 0 && state.board[nextY][nextX] !== EMPTY) return true;
      }
    }
    return false;
  }

  function mergePiece() {
    state.current.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = state.current.y + y;
        const boardX = state.current.x + x;
        if (boardY >= 0) state.board[boardY][boardX] = state.current.type;
      });
    });
  }

  function rotateMatrix(matrix) {
    const size = matrix.length;
    const rotated = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        rotated[x][size - 1 - y] = matrix[y][x];
      }
    }
    return rotated;
  }

  function updateStats() {
    elements.score.textContent = String(state.score);
    elements.level.textContent = String(state.level);
    elements.lines.textContent = String(state.lines);
    elements.best.textContent = String(state.best);
    if (!state.running) {
      elements.status.textContent = '准备开始，点击按钮或按任意方向键开始。';
    } else if (state.paused) {
      elements.status.textContent = '已暂停，点击继续游戏恢复。';
    } else {
      elements.status.textContent = '方向键移动，向上旋转，空格硬降。';
    }
  }

  function stopLoop() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  function startLoop() {
    stopLoop();
    const speed = SPEEDS[Math.min(SPEEDS.length - 1, state.level - 1)];
    state.timerId = setInterval(drop, speed);
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (state.board[y].every((cell) => cell !== EMPTY)) {
        state.board.splice(y, 1);
        state.board.unshift(Array(COLS).fill(EMPTY));
        cleared += 1;
        y += 1;
      }
    }

    if (cleared > 0) {
      const scores = [0, 100, 300, 500, 800];
      state.score += scores[cleared] * state.level;
      state.lines += cleared;
      state.level = Math.min(10, Math.floor(state.lines / 10) + 1);
      if (state.score > state.best) {
        state.best = state.score;
        saveBest();
      }
      updateStats();
      startLoop();
      showToast(`消除了 ${cleared} 行`);
    }
  }

  function gameOver() {
    state.running = false;
    state.paused = false;
    stopLoop();
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    updateStats();
    elements.status.textContent = '游戏结束，点击“开始 / 重开”再来一局。';
    showToast('俄罗斯方块结束');
  }

  function spawn() {
    state.current = state.next || createPiece();
    state.current.x = Math.floor((COLS - state.current.shape[0].length) / 2);
    state.current.y = 0;
    state.next = createPiece();
    if (collides(state.current)) gameOver();
  }

  function drawBoard() {
    ctx.clearRect(0, 0, elements.board.width, elements.board.height);
    ctx.fillStyle = '#111826';
    ctx.fillRect(0, 0, elements.board.width, elements.board.height);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = state.board[y][x];
        if (cell !== EMPTY) {
          drawCell(ctx, x, y, cell, BLOCK);
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
        }
      }
    }
  }

  function drawCurrent() {
    if (!state.current) return;
    state.current.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        drawCell(ctx, state.current.x + x, state.current.y + y, state.current.type, BLOCK);
      });
    });
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, elements.next.width, elements.next.height);
    nextCtx.fillStyle = '#111826';
    nextCtx.fillRect(0, 0, elements.next.width, elements.next.height);
    if (!state.next) return;
    const shape = state.next.shape;
    const size = 24;
    const offsetX = Math.floor((elements.next.width - shape[0].length * size) / 2);
    const offsetY = Math.floor((elements.next.height - shape.length * size) / 2);
    shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        nextCtx.save();
        nextCtx.translate(offsetX, offsetY);
        drawCell(nextCtx, x, y, state.next.type, size);
        nextCtx.restore();
      });
    });
  }

  function draw() {
    drawBoard();
    drawCurrent();
    drawNext();
  }

  function reset() {
    state.board = createBoard();
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.running = true;
    state.paused = false;
    state.next = createPiece();
    spawn();
    updateStats();
    startLoop();
    draw();
    showToast('新的一局开始了');
  }

  function drop() {
    if (!state.running || state.paused) return;
    if (!collides(state.current, 0, 1)) {
      state.current.y += 1;
    } else {
      mergePiece();
      clearLines();
      spawn();
    }
    draw();
  }

  function hardDrop() {
    if (!state.running || state.paused) return;
    while (!collides(state.current, 0, 1)) {
      state.current.y += 1;
      state.score += 2;
    }
    mergePiece();
    clearLines();
    spawn();
    updateStats();
    draw();
  }

  function move(dx) {
    if (!state.running || state.paused) return;
    if (!collides(state.current, dx, 0)) {
      state.current.x += dx;
      draw();
    }
  }

  function rotate() {
    if (!state.running || state.paused) return;
    const rotated = rotateMatrix(state.current.shape);
    if (!collides(state.current, 0, 0, rotated)) {
      state.current.shape = rotated;
      draw();
      return;
    }
    for (const offset of [-1, 1, -2, 2]) {
      if (!collides(state.current, offset, 0, rotated)) {
        state.current.x += offset;
        state.current.shape = rotated;
        draw();
        return;
      }
    }
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    elements.btnPause.textContent = state.paused ? '继续游戏' : '暂停 / 继续';
    updateStats();
  }

  document.addEventListener('keydown', (event) => {
    if (!state.running && ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) {
      reset();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      drop();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      rotate();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (state.paused) {
        togglePause();
      } else {
        hardDrop();
      }
    } else if (event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      togglePause();
    }
  });

  elements.btnStart.addEventListener('click', reset);
  elements.btnPause.addEventListener('click', togglePause);

  loadBest();
  state.board = createBoard();
  state.next = createPiece();
  updateStats();
  draw();
})();
