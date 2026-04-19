(() => {
  'use strict';

  const WIDTH = 480;
  const HEIGHT = 640;
  const STORAGE_KEY = 'arcade.shooter.best';

  const elements = {
    canvas: document.getElementById('game-canvas'),
    score: document.getElementById('score'),
    best: document.getElementById('best-score'),
    lives: document.getElementById('lives'),
    level: document.getElementById('level'),
    status: document.getElementById('status-chip'),
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    toast: document.getElementById('toast'),
  };

  const ctx = elements.canvas.getContext('2d');

  const state = {
    player: null,
    bullets: [],
    enemies: [],
    stars: [],
    score: 0,
    best: 0,
    lives: 3,
    level: 1,
    running: false,
    paused: false,
    keys: new Set(),
    animationId: 0,
    lastEnemyAt: 0,
    lastBulletAt: 0,
    lastFrameAt: 0,
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

  function resetState() {
    state.player = { x: WIDTH / 2 - 18, y: HEIGHT - 70, width: 36, height: 44, speed: 260 };
    state.bullets = [];
    state.enemies = [];
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.running = false;
    state.paused = false;
    state.lastEnemyAt = 0;
    state.lastBulletAt = 0;
    state.lastFrameAt = 0;
    state.stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      speed: 20 + Math.random() * 60,
      size: 1 + Math.random() * 2,
    }));
    updateHud();
    setStatus('按开始按钮或空格开始');
    draw();
  }

  function setStatus(text) {
    elements.status.textContent = text;
  }

  function updateHud() {
    elements.score.textContent = String(state.score);
    elements.best.textContent = String(state.best);
    elements.lives.textContent = String(state.lives);
    elements.level.textContent = String(state.level);
  }

  function startGame() {
    if (state.running && !state.paused) return;
    if (!state.running) {
      resetState();
      state.running = true;
      showToast('飞机起飞');
    } else {
      state.paused = false;
    }
    setStatus('游戏进行中，方向键移动，空格射击');
    cancelAnimationFrame(state.animationId);
    state.lastFrameAt = performance.now();
    state.animationId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    if (state.paused) {
      setStatus('已暂停，点击继续或按 P 恢复');
      cancelAnimationFrame(state.animationId);
    } else {
      setStatus('游戏进行中，方向键移动，空格射击');
      state.lastFrameAt = performance.now();
      state.animationId = requestAnimationFrame(loop);
    }
  }

  function stopGame(message) {
    state.running = false;
    state.paused = false;
    cancelAnimationFrame(state.animationId);
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    updateHud();
    setStatus(message);
    showToast(message);
  }

  function spawnEnemy() {
    const size = 24 + Math.random() * 18;
    state.enemies.push({
      x: Math.random() * (WIDTH - size),
      y: -size - 8,
      width: size,
      height: size,
      speed: 70 + state.level * 22 + Math.random() * 45,
      hp: 1,
    });
  }

  function shoot(now) {
    if (now - state.lastBulletAt < 200) return;
    state.lastBulletAt = now;
    state.bullets.push({
      x: state.player.x + state.player.width / 2 - 3,
      y: state.player.y - 10,
      width: 6,
      height: 12,
      speed: 420,
    });
  }

  function intersects(a, b) {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }

  function update(delta, now) {
    const seconds = delta / 1000;

    state.stars.forEach((star) => {
      star.y += star.speed * seconds;
      if (star.y > HEIGHT) {
        star.y = -4;
        star.x = Math.random() * WIDTH;
      }
    });

    if (state.keys.has('ArrowLeft') || state.keys.has('a')) state.player.x -= state.player.speed * seconds;
    if (state.keys.has('ArrowRight') || state.keys.has('d')) state.player.x += state.player.speed * seconds;
    if (state.keys.has('ArrowUp') || state.keys.has('w')) state.player.y -= state.player.speed * seconds;
    if (state.keys.has('ArrowDown') || state.keys.has('s')) state.player.y += state.player.speed * seconds;
    state.player.x = Math.max(0, Math.min(WIDTH - state.player.width, state.player.x));
    state.player.y = Math.max(0, Math.min(HEIGHT - state.player.height, state.player.y));

    if (state.keys.has(' ')) shoot(now);

    const enemyInterval = Math.max(340, 1000 - state.level * 70);
    if (now - state.lastEnemyAt > enemyInterval) {
      state.lastEnemyAt = now;
      spawnEnemy();
    }

    state.bullets.forEach((bullet) => {
      bullet.y -= bullet.speed * seconds;
    });
    state.enemies.forEach((enemy) => {
      enemy.y += enemy.speed * seconds;
    });

    state.bullets = state.bullets.filter((bullet) => bullet.y + bullet.height > 0);
    state.enemies = state.enemies.filter((enemy) => {
      if (enemy.y > HEIGHT + enemy.height) {
        state.lives -= 1;
        updateHud();
        if (state.lives <= 0) {
          stopGame('战机被击落，游戏结束');
        }
        return false;
      }
      return true;
    });

    state.bullets.forEach((bullet) => {
      state.enemies.forEach((enemy) => {
        if (bullet.hit || enemy.hit) return;
        if (intersects(bullet, enemy)) {
          bullet.hit = true;
          enemy.hp -= 1;
          if (enemy.hp <= 0) {
            enemy.hit = true;
            state.score += 10;
            state.level = Math.floor(state.score / 80) + 1;
            if (state.score > state.best) state.best = state.score;
            updateHud();
          }
        }
      });
    });
    state.bullets = state.bullets.filter((bullet) => !bullet.hit);
    state.enemies = state.enemies.filter((enemy) => !enemy.hit);

    if (state.enemies.some((enemy) => intersects(enemy, state.player))) {
      state.lives -= 1;
      state.enemies = state.enemies.filter((enemy) => !intersects(enemy, state.player));
      updateHud();
      if (state.lives <= 0) {
        stopGame('战机被撞毁，游戏结束');
      } else {
        showToast('小心碰撞');
      }
    }
  }

  function drawStars() {
    ctx.fillStyle = '#08131f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    state.stars.forEach((star) => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPlayer() {
    const p = state.player;
    ctx.fillStyle = '#7de1ff';
    ctx.beginPath();
    ctx.moveTo(p.x + p.width / 2, p.y);
    ctx.lineTo(p.x, p.y + p.height);
    ctx.lineTo(p.x + p.width / 2, p.y + p.height - 10);
    ctx.lineTo(p.x + p.width, p.y + p.height);
    ctx.closePath();
    ctx.fill();
  }

  function drawBullets() {
    ctx.fillStyle = '#ffe37d';
    state.bullets.forEach((bullet) => {
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    });
  }

  function drawEnemies() {
    ctx.fillStyle = '#ff8797';
    state.enemies.forEach((enemy) => {
      ctx.beginPath();
      ctx.roundRect(enemy.x, enemy.y, enemy.width, enemy.height, 8);
      ctx.fill();
      ctx.fillStyle = '#ffc7cf';
      ctx.fillRect(enemy.x + 6, enemy.y + 6, enemy.width - 12, 6);
      ctx.fillStyle = '#ff8797';
    });
  }

  function draw() {
    drawStars();
    drawPlayer();
    drawBullets();
    drawEnemies();
  }

  function loop(now) {
    if (!state.running || state.paused) return;
    const delta = now - state.lastFrameAt;
    state.lastFrameAt = now;
    update(delta, now);
    draw();
    if (state.running && !state.paused) {
      state.animationId = requestAnimationFrame(loop);
    }
  }

  document.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'p', 'P', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(event.key) || ['a', 'd', 'w', 's'].includes(key)) {
      event.preventDefault();
    }
    if (event.key === 'p' || event.key === 'P') {
      togglePause();
      return;
    }
    if (!state.running && event.key === ' ') {
      startGame();
      return;
    }
    state.keys.add(key);
    if (!state.running && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(key)) {
      startGame();
    }
  });

  document.addEventListener('keyup', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    state.keys.delete(key);
  });

  elements.btnStart.addEventListener('click', startGame);
  elements.btnPause.addEventListener('click', togglePause);

  loadBest();
  resetState();
})();
