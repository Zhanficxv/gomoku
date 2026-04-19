(() => {
  'use strict';

  const MAPS = [
    [
      '########',
      '#..#...#',
      '#..$...#',
      '#.$$#..#',
      '#.@.#..#',
      '#..  ..#',
      '########',
    ],
    [
      '########',
      '#..#..##',
      '# $$   #',
      '# # .@ #',
      '#   .  #',
      '#   ####',
      '########',
    ],
  ];

  const CELL = {
    WALL: '#',
    FLOOR: ' ',
    TARGET: '.',
    BOX: '$',
    PLAYER: '@',
  };

  const elements = {
    board: document.getElementById('board'),
    mapIndex: document.getElementById('map-index'),
    moves: document.getElementById('moves'),
    pushes: document.getElementById('pushes'),
    targetLeft: document.getElementById('targets-left'),
    status: document.getElementById('status-chip'),
    btnRestart: document.getElementById('btn-restart'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    toast: document.getElementById('toast'),
  };

  const state = {
    mapIndex: 0,
    grid: [],
    base: [],
    player: { row: 0, col: 0 },
    moves: 0,
    pushes: 0,
    won: false,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function parseMap(lines) {
    const grid = lines.map((line) => line.split(''));
    const base = lines.map((line) =>
      line.split('').map((ch) => (ch === CELL.TARGET ? CELL.TARGET : ch === CELL.WALL ? CELL.WALL : CELL.FLOOR))
    );

    let player = { row: 0, col: 0 };
    grid.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell === CELL.PLAYER) {
          player = { row: rowIndex, col: colIndex };
          grid[rowIndex][colIndex] = CELL.FLOOR;
        }
      });
    });

    return { grid, base, player };
  }

  function isWall(row, col) {
    return state.base[row] && state.base[row][col] === CELL.WALL;
  }

  function isTarget(row, col) {
    return state.base[row] && state.base[row][col] === CELL.TARGET;
  }

  function hasBox(row, col) {
    return state.grid[row] && state.grid[row][col] === CELL.BOX;
  }

  function targetsLeft() {
    let left = 0;
    state.base.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell === CELL.TARGET && !hasBox(rowIndex, colIndex)) left += 1;
      });
    });
    return left;
  }

  function updateStats() {
    elements.mapIndex.textContent = `${state.mapIndex + 1}/${MAPS.length}`;
    elements.moves.textContent = String(state.moves);
    elements.pushes.textContent = String(state.pushes);
    elements.targetLeft.textContent = String(targetsLeft());
    elements.status.textContent = state.won ? '通关成功' : '方向键推动箱子，把所有箱子推到目标点';
  }

  function render() {
    elements.board.innerHTML = '';
    state.base.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const tile = document.createElement('div');
        tile.className = 'tile';
        if (cell === CELL.WALL) tile.classList.add('wall');
        if (cell === CELL.TARGET) tile.classList.add('target');
        if (hasBox(rowIndex, colIndex)) tile.classList.add('box');
        if (state.player.row === rowIndex && state.player.col === colIndex) tile.classList.add('player');
        elements.board.appendChild(tile);
      });
    });
    updateStats();
  }

  function checkWin() {
    state.won = targetsLeft() === 0;
    if (state.won) showToast('全部箱子已归位');
  }

  function tryMove(dr, dc) {
    if (state.won) return;
    const nextRow = state.player.row + dr;
    const nextCol = state.player.col + dc;
    if (isWall(nextRow, nextCol)) return;

    if (hasBox(nextRow, nextCol)) {
      const pushRow = nextRow + dr;
      const pushCol = nextCol + dc;
      if (isWall(pushRow, pushCol) || hasBox(pushRow, pushCol)) return;
      state.grid[pushRow][pushCol] = CELL.BOX;
      state.grid[nextRow][nextCol] = CELL.FLOOR;
      state.pushes += 1;
    }

    state.player = { row: nextRow, col: nextCol };
    state.moves += 1;
    checkWin();
    render();
  }

  function loadMap(index) {
    state.mapIndex = (index + MAPS.length) % MAPS.length;
    const parsed = parseMap(MAPS[state.mapIndex]);
    state.grid = parsed.grid;
    state.base = parsed.base;
    state.player = parsed.player;
    state.moves = 0;
    state.pushes = 0;
    state.won = false;
    render();
  }

  window.addEventListener('keydown', (event) => {
    const moves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    tryMove(move[0], move[1]);
  });

  elements.btnRestart.addEventListener('click', () => loadMap(state.mapIndex));
  elements.btnPrev.addEventListener('click', () => loadMap(state.mapIndex - 1));
  elements.btnNext.addEventListener('click', () => loadMap(state.mapIndex + 1));

  loadMap(0);
})();
