(() => {
  'use strict';

  const WIDTH = 720;
  const HEIGHT = 480;
  const BRICK_ROWS = 5;
  const BRICK_COLS = 9;
  const BRICK_WIDTH = 64;
  const BRICK_HEIGHT = 22;
  const BRICK_GAP = 10;
  const TOP_OFFSET = 64;
  const STORAGE_KEY = 'arcade.breakout.best';

  const elements = {
    canvas: document.getElementById('board'),
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    best: document.getElementById('best-score'),
    status: document.getElementById('status-chip'),
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    toast: document.getElementById('toast'),
  };

  const ctx = elements.canvas.getContext('2d');
  const state = {
    paddle: { x: WIDTH / 2 - 60, y: HEIGHT - 28, width: 120, height: 14, speed: 10 },
    ball: { x: WIDTH / 2, y: HEIGHT - 54, vx: 4, vy: -4, radius: 8 },
    keys: { left: false, right: false },
    bricks: [],
    score: 0,
    level: 1,
    lives: 3,
    best: 0,
    running: false,
    paused: false,
    frameId: null,
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
      // 忽略本地存储失败。
    }
  }

  function createBricks() {
    const colors = ['#7ce6a6', '#6ea8ff', '#f9bf64', '#ff8aa1', '#c192ff'];
    return Array.from({ length: BRICK_ROWS }, (_, row) =>
      Array.from({ length: BRICK_COLS }, (_, col) => ({
        x: 28 + col * (BRICK_WIDTH + BRICK_GAP),
        y: TOP_OFFSET + row * (BRICK_HEIGHT + BRICK_GAP),
        width: BRICK_WIDTH,
        height: BRICK_HEIGHT,
        visible: true,
        color: colors[row % colors.length],
      }))
    );
  }

  function resetBall() {
    state.ball.x = WIDTH / 2;
    state.ball.y = HEIGHT - 54;
    state.ball.vx = 3 + state.level * 0.5;
    state.ball.vy = -(3 + state.level * 0.5);
  }

  function resetRound(keepScore) {
    state.paddle.x = WIDTH / 2 - 60;
    state.paddle.width = 120;
    resetBall();
    if (!keepScore) {
      state.score = 0;
      state.level = 1;
      state.lives = 3;
      state.bricks = createBricks();
    }
    updateStats();
  }

  function updateStats() {
    elements.score.textContent = String(state.score);
    elements.level.textContent = String(state.level);
    elements.lives.textContent = String(state.lives);
    elements.best.textContent = String(state.best);
    if (!state.running) {
      elements.status.textContent = '点击开始按钮开始打砖块';
    } else if (state.paused) {
      elements.status.textContent = '已暂停，点击继续恢复';
    } else {
      elements.status.textContent = '使用左右方向键控制挡板接球';
    }
  }

  function drawRoundedRect(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#0b1320';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawPaddle() {
    drawRoundedRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height, 12, '#6ea8ff');
  }

  function drawBall() {
    ctx.fillStyle = '#fff5d9';
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBricks() {
    state.bricks.forEach((row) => {
      row.forEach((brick) => {
        if (!brick.visible) return;
        drawRoundedRect(brick.x, brick.y, brick.width, brick.height, 10, brick.color);
      });
    });
  }

  function draw() {
    drawBackground();
    drawBricks();
    drawPaddle();
    drawBall();
  }

  function allCleared() {
    return state.bricks.every((row) => row.every((brick) => !brick.visible));
  }

  function loseLife() {
    state.lives -= 1;
    if (state.lives <= 0) {
      state.running = false;
      state.paused = false;
      if (state.score > state.best) {
        state.best = state.score;
        saveBest();
      }
      updateStats();
      showToast('游戏结束');
      return;
    }
    resetRound(true);
    showToast('掉球了，继续努力');
  }

  function nextLevel() {
    state.level += 1;
    state.score += 50;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    state.bricks = createBricks();
    resetRound(true);
    showToast(`进入第 ${state.level} 关`);
  }

  function handleBrickCollisions() {
    for (const row of state.bricks) {
      for (const brick of row) {
        if (!brick.visible) continue;
        if (
          state.ball.x + state.ball.radius >= brick.x &&
          state.ball.x - state.ball.radius <= brick.x + brick.width &&
          state.ball.y + state.ball.radius >= brick.y &&
          state.ball.y - state.ball.radius <= brick.y + brick.height
        ) {
          brick.visible = false;
          state.ball.vy *= -1;
          state.score += 10;
          if (state.score > state.best) {
            state.best = state.score;
            saveBest();
          }
          updateStats();
          if (allCleared()) nextLevel();
          return;
        }
      }
    }
  }

  function update() {
    if (!state.running || state.paused) return;

    if (state.keys.left) state.paddle.x -= state.paddle.speed;
    if (state.keys.right) state.paddle.x += state.paddle.speed;
    state.paddle.x = Math.max(0, Math.min(WIDTH - state.paddle.width, state.paddle.x));

    state.ball.x += state.ball.vx;
    state.ball.y += state.ball.vy;

    if (state.ball.x <= state.ball.radius || state.ball.x >= WIDTH - state.ball.radius) {
      state.ball.vx *= -1;
    }
    if (state.ball.y <= state.ball.radius) {
      state.ball.vy *= -1;
    }

    if (
      state.ball.y + state.ball.radius >= state.paddle.y &&
      state.ball.x >= state.paddle.x &&
      state.ball.x <= state.paddle.x + state.paddle.width &&
      state.ball.vy > 0
    ) {
      const hitPos = (state.ball.x - (state.paddle.x + state.paddle.width / 2)) / (state.paddle.width / 2);
      state.ball.vx = hitPos * 5;
      state.ball.vy = -Math.abs(state.ball.vy);
    }

    if (state.ball.y > HEIGHT + state.ball.radius) {
      loseLife();
    }

    handleBrickCollisions();
  }

  function loop() {
    update();
    draw();
    state.frameId = requestAnimationFrame(loop);
  }

  function startLoop() {
    cancelAnimationFrame(state.frameId);
    state.frameId = requestAnimationFrame(loop);
  }

  function startGame() {
    resetRound(false);
    state.running = true;
    state.paused = false;
    updateStats();
    startLoop();
    showToast('开始打砖块');
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    updateStats();
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      state.keys.left = true;
      if (!state.running) startGame();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      state.keys.right = true;
      if (!state.running) startGame();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!state.running) {
        startGame();
      } else {
        togglePause();
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft') state.keys.left = false;
    if (event.key === 'ArrowRight') state.keys.right = false;
  });

  elements.btnStart.addEventListener('click', startGame);
  elements.btnPause.addEventListener('click', togglePause);

  loadBest();
  state.bricks = createBricks();
  resetRound(false);
  draw();
  startLoop();
})();
