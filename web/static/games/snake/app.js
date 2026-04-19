(() => {
  'use strict';

  const GRID_SIZE = 20;
  const CELL_SIZE = 24;
  const INITIAL_SPEED = 180;
  const MIN_SPEED = 70;
  const STORAGE_KEY = 'arcade.snake.best';

  const elements = {
    canvas: document.getElementById('game-canvas'),
    score: document.getElementById('score'),
    best: document.getElementById('best-score'),
    length: document.getElementById('length'),
    speed: document.getElementById('speed'),
    status: document.getElementById('status-chip'),
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    toast: document.getElementById('toast'),
  };

  const ctx = elements.canvas.getContext('2d');

  const state = {
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: { x: 10, y: 10 },
    score: 0,
    best: 0,
    speed: INITIAL_SPEED,
    timerId: null,
    running: false,
    paused: false,
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
      state.best = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
    } catch (_) {
      state.best = 0;
    }
  }

  function saveBest() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(state.best));
    } catch (_) {
      // 忽略本地存储失败。
    }
  }

  function setStatus(text, danger) {
    elements.status.textContent = text;
    elements.status.classList.toggle('danger', Boolean(danger));
  }

  function updateStats() {
    elements.score.textContent = String(state.score);
    elements.best.textContent = String(state.best);
    elements.length.textContent = String(state.snake.length);
    elements.speed.textContent = `${Math.round(1000 / state.speed)} 格/秒`;
  }

  function placeFood() {
    while (true) {
      const food = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      if (!state.snake.some((segment) => segment.x === food.x && segment.y === food.y)) {
        state.food = food;
        return;
      }
    }
  }

  function stopLoop() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function restartLoop() {
    stopLoop();
    state.timerId = setInterval(step, state.speed);
  }

  function drawBackground() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.fillStyle = '#0a1510';
    ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = i * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, elements.canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(elements.canvas.width, p);
      ctx.stroke();
    }
  }

  function drawCell(x, y, color, radius) {
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4, radius);
    ctx.fill();
  }

  function draw() {
    drawBackground();
    drawCell(state.food.x, state.food.y, '#ff7c8c', 10);
    state.snake.forEach((segment, index) => {
      drawCell(segment.x, segment.y, index === 0 ? '#7ef0aa' : '#36ba6d', 8);
    });
  }

  function endGame() {
    stopLoop();
    state.running = false;
    state.paused = false;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    updateStats();
    setStatus('游戏结束，撞墙或撞到自己了。', true);
    showToast('游戏结束');
    draw();
  }

  function step() {
    state.direction = state.nextDirection;
    const head = state.snake[0];
    const nextHead = {
      x: head.x + state.direction.x,
      y: head.y + state.direction.y,
    };

    if (
      nextHead.x < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_SIZE ||
      state.snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)
    ) {
      endGame();
      return;
    }

    state.snake.unshift(nextHead);
    if (nextHead.x === state.food.x && nextHead.y === state.food.y) {
      state.score += 10;
      state.speed = Math.max(MIN_SPEED, state.speed - 8);
      placeFood();
      restartLoop();
      showToast('吃到食物 +10');
    } else {
      state.snake.pop();
    }

    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    updateStats();
    draw();
  }

  function resetGame() {
    stopLoop();
    state.snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    state.score = 0;
    state.speed = INITIAL_SPEED;
    state.running = false;
    state.paused = false;
    placeFood();
    updateStats();
    setStatus('按开始按钮、方向键或空格开始游戏。');
    draw();
  }

  function startGame() {
    if (state.running && !state.paused) return;
    state.running = true;
    state.paused = false;
    setStatus('游戏进行中，方向键控制移动，空格可暂停。');
    restartLoop();
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    if (state.paused) {
      stopLoop();
      setStatus('已暂停，点击继续或按空格恢复。');
    } else {
      restartLoop();
      setStatus('游戏进行中，方向键控制移动，空格可暂停。');
    }
  }

  function setDirection(x, y) {
    if (state.direction.x === -x && state.direction.y === -y) return;
    state.nextDirection = { x, y };
    if (!state.running) startGame();
  }

  window.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        event.preventDefault();
        setDirection(0, -1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        event.preventDefault();
        setDirection(0, 1);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        event.preventDefault();
        setDirection(-1, 0);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        event.preventDefault();
        setDirection(1, 0);
        break;
      case ' ':
        event.preventDefault();
        if (!state.running) {
          startGame();
        } else {
          togglePause();
        }
        break;
      default:
    }
  });

  elements.btnStart.addEventListener('click', () => {
    resetGame();
    startGame();
    showToast('新的一局开始了');
  });

  elements.btnPause.addEventListener('click', togglePause);

  loadBest();
  resetGame();
})();
