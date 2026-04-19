(() => {
  'use strict';

  const WIDTH = 4;
  const HEIGHT = 5;

  const PIECE_SHAPES = {
    cao: { w: 2, h: 2, label: '曹操' },
    guan: { w: 1, h: 2, label: '关羽' },
    zhang: { w: 1, h: 2, label: '张飞' },
    zhao: { w: 1, h: 2, label: '赵云' },
    ma: { w: 1, h: 2, label: '马超' },
    huang: { w: 2, h: 1, label: '黄忠' },
    bing1: { w: 1, h: 1, label: '兵' },
    bing2: { w: 1, h: 1, label: '兵' },
    bing3: { w: 1, h: 1, label: '兵' },
    bing4: { w: 1, h: 1, label: '兵' },
  };

  const INITIAL_PIECES = {
    cao: { x: 1, y: 0 },
    guan: { x: 0, y: 0 },
    zhang: { x: 3, y: 0 },
    zhao: { x: 0, y: 2 },
    ma: { x: 3, y: 2 },
    huang: { x: 1, y: 2 },
    bing1: { x: 1, y: 3 },
    bing2: { x: 2, y: 3 },
    bing3: { x: 0, y: 4 },
    bing4: { x: 3, y: 4 },
  };

  const elements = {
    board: document.getElementById('board'),
    moveCount: document.getElementById('move-count'),
    selectedName: document.getElementById('selected-name'),
    statusText: document.getElementById('status-text'),
    btnRestart: document.getElementById('btn-restart'),
    toast: document.getElementById('toast'),
  };

  const state = {
    pieces: {},
    selected: null,
    moves: 0,
    solved: false,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1700);
  }

  function resetGame() {
    state.pieces = JSON.parse(JSON.stringify(INITIAL_PIECES));
    state.selected = null;
    state.moves = 0;
    state.solved = false;
    render();
  }

  function occupiedCells(ignoreId) {
    const occupied = new Set();
    Object.entries(state.pieces).forEach(([id, pos]) => {
      if (id === ignoreId) return;
      const shape = PIECE_SHAPES[id];
      for (let dy = 0; dy < shape.h; dy++) {
        for (let dx = 0; dx < shape.w; dx++) {
          occupied.add(`${pos.x + dx},${pos.y + dy}`);
        }
      }
    });
    return occupied;
  }

  function canMove(id, dx, dy) {
    const piece = state.pieces[id];
    const shape = PIECE_SHAPES[id];
    const occupied = occupiedCells(id);
    for (let oy = 0; oy < shape.h; oy++) {
      for (let ox = 0; ox < shape.w; ox++) {
        const nx = piece.x + ox + dx;
        const ny = piece.y + oy + dy;
        if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) return false;
        if (occupied.has(`${nx},${ny}`)) return false;
      }
    }
    return true;
  }

  function tryMoveSelected(dx, dy) {
    if (!state.selected || state.solved) return;
    if (!canMove(state.selected, dx, dy)) {
      showToast('这个方向无法移动');
      return;
    }
    state.pieces[state.selected].x += dx;
    state.pieces[state.selected].y += dy;
    state.moves += 1;
    checkSolved();
    render();
  }

  function checkSolved() {
    const cao = state.pieces.cao;
    if (cao.x === 1 && cao.y === 3) {
      state.solved = true;
      elements.statusText.textContent = `恭喜通关，共移动 ${state.moves} 步。`;
      showToast('华容道通关！');
    }
  }

  function createPieceElement(id, pos) {
    const shape = PIECE_SHAPES[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `piece piece-${id}${state.selected === id ? ' selected' : ''}`;
    button.style.left = `${pos.x * 25}%`;
    button.style.top = `${pos.y * 20}%`;
    button.style.width = `${shape.w * 25}%`;
    button.style.height = `${shape.h * 20}%`;
    button.textContent = shape.label;
    button.addEventListener('click', () => {
      state.selected = id;
      render();
    });
    return button;
  }

  function render() {
    elements.board.innerHTML = '';
    Object.entries(state.pieces).forEach(([id, pos]) => {
      elements.board.appendChild(createPieceElement(id, pos));
    });
    elements.moveCount.textContent = String(state.moves);
    elements.selectedName.textContent = state.selected ? PIECE_SHAPES[state.selected].label : '未选择';
    if (!state.solved) {
      elements.statusText.textContent = state.selected
        ? `已选择 ${PIECE_SHAPES[state.selected].label}，使用方向按钮或键盘移动。`
        : '请先点击一个棋子，再使用方向按钮移动。';
    }
  }

  document.querySelectorAll('[data-dir]').forEach((button) => {
    button.addEventListener('click', () => {
      const dir = button.dataset.dir;
      if (dir === 'up') tryMoveSelected(0, -1);
      if (dir === 'down') tryMoveSelected(0, 1);
      if (dir === 'left') tryMoveSelected(-1, 0);
      if (dir === 'right') tryMoveSelected(1, 0);
    });
  });

  window.addEventListener('keydown', (event) => {
    const map = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const delta = map[event.key];
    if (!delta) return;
    event.preventDefault();
    tryMoveSelected(delta[0], delta[1]);
  });

  elements.btnRestart.addEventListener('click', resetGame);

  resetGame();
})();
