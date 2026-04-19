/**
 * Modern Tetris implementation
 * - Standard SRS rotation system + wall-kicks (incl. I-piece kicks)
 * - 7-bag piece randomizer
 * - Hold piece (one swap per drop)
 * - Ghost piece preview
 * - Hard drop / soft drop
 * - Lock delay (15 frames @60fps, max resets)
 * - Scoring: single/double/triple/tetris + soft/hard drop bonus + combo
 * - Increasing gravity per level (Tetris standard curve)
 */
(() => {
  'use strict';

  // ---------- Board geometry ----------
  const COLS = 10;
  const ROWS = 20;
  const HIDDEN_ROWS = 2; // for piece spawning above visible board

  // ---------- Tetromino definitions (SRS) ----------
  // Each piece has 4 rotation states; coords are relative to the piece origin.
  // Origin convention follows the SRS bounding-box system.
  const SHAPES = {
    I: [
      [[0,1],[1,1],[2,1],[3,1]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[1,0],[1,1],[1,2],[1,3]],
    ],
    O: [
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
    ],
    T: [
      [[1,0],[0,1],[1,1],[2,1]],
      [[1,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[2,1],[1,2]],
      [[1,0],[0,1],[1,1],[1,2]],
    ],
    S: [
      [[1,0],[2,0],[0,1],[1,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[1,1],[2,1],[0,2],[1,2]],
      [[0,0],[0,1],[1,1],[1,2]],
    ],
    Z: [
      [[0,0],[1,0],[1,1],[2,1]],
      [[2,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,0],[0,1],[1,1],[0,2]],
    ],
    J: [
      [[0,0],[0,1],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[0,2],[1,2]],
    ],
    L: [
      [[2,0],[0,1],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,1],[0,2]],
      [[0,0],[1,0],[1,1],[1,2]],
    ],
  };

  // Wall-kick offsets per SRS. JLSTZ shares one table; I has its own.
  const KICKS_JLSTZ = {
    '0->1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
    '1->0': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
    '1->2': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
    '2->1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
    '2->3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
    '3->2': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
    '3->0': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
    '0->3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  };
  const KICKS_I = {
    '0->1': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
    '1->0': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
    '1->2': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
    '2->1': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
    '2->3': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
    '3->2': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
    '3->0': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
    '0->3': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
  };

  const COLORS = {
    I: '#5cdcff',
    O: '#ffd966',
    T: '#c780ff',
    S: '#7fe09a',
    Z: '#ff7e8b',
    J: '#6896ff',
    L: '#ffa86b',
  };

  // Gravity per level, in seconds per row (Tetris guideline approximation)
  function gravityFor(level) {
    const lvl = Math.max(1, Math.min(20, level));
    return Math.pow(0.8 - (lvl - 1) * 0.007, lvl - 1);
  }

  // Scoring
  const LINE_SCORES = [0, 100, 300, 500, 800];

  // ---------- Game state ----------
  const game = {
    grid: createGrid(),
    bag: [],
    queue: [],
    current: null,
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    best: loadBest(),
    paused: false,
    over: false,
    lastEvent: '',
    lastEventTimer: 0,
    // timing
    dropAccumMs: 0,
    lockTimerMs: 0,
    lockResets: 0,
    softDrop: false,
  };

  const LOCK_DELAY_MS = 500;
  const MAX_LOCK_RESETS = 15;

  function createGrid() {
    const g = [];
    for (let y = 0; y < ROWS + HIDDEN_ROWS; y++) {
      const row = new Array(COLS).fill('');
      g.push(row);
    }
    return g;
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem('tetris.best') || '0', 10) || 0; }
    catch { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('tetris.best', String(v)); } catch {}
  }

  // ---------- Bag randomizer ----------
  function refillBag() {
    const types = ['I','O','T','S','Z','J','L'];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    game.bag.push(...types);
  }
  function nextType() {
    if (game.bag.length === 0) refillBag();
    return game.bag.shift();
  }
  function ensureQueue() {
    while (game.queue.length < 5) game.queue.push(nextType());
  }

  function spawnPiece(type) {
    const t = type || game.queue.shift();
    ensureQueue();
    const piece = {
      type: t,
      rot: 0,
      x: 3,
      y: HIDDEN_ROWS - 2, // spawn so piece sits at top of visible area
    };
    if (collides(piece)) {
      gameOver();
      return;
    }
    game.current = piece;
    game.holdUsed = false;
    game.dropAccumMs = 0;
    game.lockTimerMs = 0;
    game.lockResets = 0;
  }

  function gameOver() {
    game.over = true;
    if (game.score > game.best) {
      game.best = game.score;
      saveBest(game.best);
    }
    showOverlay('游戏结束', `本局得分 ${game.score}`, '再来一局');
    updateHud();
  }

  // ---------- Collision & movement ----------
  function piecesCells(piece) {
    const cells = SHAPES[piece.type][piece.rot];
    return cells.map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
  }

  function collides(piece) {
    for (const [x, y] of piecesCells(piece)) {
      if (x < 0 || x >= COLS) return true;
      if (y >= ROWS + HIDDEN_ROWS) return true;
      if (y >= 0 && game.grid[y][x]) return true;
    }
    return false;
  }

  function tryMove(dx, dy) {
    if (!game.current || game.over || game.paused) return false;
    const test = { ...game.current, x: game.current.x + dx, y: game.current.y + dy };
    if (collides(test)) return false;
    game.current = test;
    if (dy === 0) resetLockTimer();
    return true;
  }

  function tryRotate(dir) {
    if (!game.current || game.over || game.paused) return false;
    const p = game.current;
    if (p.type === 'O') return false;
    const newRot = (p.rot + (dir > 0 ? 1 : 3)) % 4;
    const key = `${p.rot}->${newRot}`;
    const table = p.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[key] || [[0,0]];
    for (const [kx, ky] of kicks) {
      const test = { ...p, rot: newRot, x: p.x + kx, y: p.y - ky };
      if (!collides(test)) {
        game.current = test;
        resetLockTimer();
        return true;
      }
    }
    return false;
  }

  function hardDrop() {
    if (!game.current || game.over || game.paused) return;
    let drop = 0;
    while (tryMove(0, 1)) drop++;
    game.score += drop * 2;
    lockPiece();
  }

  function holdPiece() {
    if (!game.current || game.over || game.paused || game.holdUsed) return;
    const cur = game.current.type;
    if (game.hold) {
      const swapType = game.hold;
      game.hold = cur;
      spawnPiece(swapType);
    } else {
      game.hold = cur;
      spawnPiece();
    }
    game.holdUsed = true;
  }

  function resetLockTimer() {
    if (game.lockTimerMs > 0 && game.lockResets < MAX_LOCK_RESETS) {
      game.lockTimerMs = 0;
      game.lockResets++;
    }
  }

  // ---------- Locking & line clearing ----------
  function lockPiece() {
    const t = game.current.type;
    for (const [x, y] of piecesCells(game.current)) {
      if (y >= 0) game.grid[y][x] = t;
    }
    const cleared = clearFullLines();
    handleScoring(cleared);
    spawnPiece();
  }

  function clearFullLines() {
    let cleared = 0;
    for (let y = ROWS + HIDDEN_ROWS - 1; y >= 0; y--) {
      if (game.grid[y].every(c => c !== '')) {
        game.grid.splice(y, 1);
        game.grid.unshift(new Array(COLS).fill(''));
        cleared++;
        y++;
      }
    }
    return cleared;
  }

  function handleScoring(cleared) {
    if (cleared === 0) {
      game.combo = -1;
      return;
    }
    game.combo++;
    const baseScore = LINE_SCORES[cleared] * game.level;
    const comboBonus = game.combo > 0 ? 50 * game.combo * game.level : 0;
    game.score += baseScore + comboBonus;
    game.lines += cleared;

    // 10 lines per level, capped at 20
    const newLevel = Math.min(20, 1 + Math.floor(game.lines / 10));
    if (newLevel !== game.level) game.level = newLevel;

    const labels = ['', '消除 ×1', '消除 ×2', '消除 ×3', 'TETRIS!'];
    let label = labels[cleared];
    if (game.combo > 0) label += ` · COMBO ×${game.combo}`;
    triggerEvent(label);
  }

  function triggerEvent(text) {
    game.lastEvent = text;
    game.lastEventTimer = 1800;
    document.getElementById('event-banner').textContent = text;
  }

  // ---------- Rendering ----------
  const boardCanvas = document.getElementById('board');
  const bctx = boardCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next-canvas');
  const nctx = nextCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold-canvas');
  const hctx = holdCanvas.getContext('2d');

  function dpr() { return window.devicePixelRatio || 1; }
  function fitCanvas(canvas, ctx) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = dpr();
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { w, h };
  }

  function drawCell(ctx, x, y, size, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

    // Inner highlight
    const grad = ctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.globalAlpha = 1;
  }

  function ghostY() {
    if (!game.current) return null;
    let test = { ...game.current };
    while (true) {
      const next = { ...test, y: test.y + 1 };
      if (collides(next)) return test.y;
      test = next;
    }
  }

  function drawBoard() {
    const { w, h } = fitCanvas(boardCanvas, bctx);
    const cell = w / COLS;

    // Background grid
    bctx.clearRect(0, 0, w, h);
    bctx.fillStyle = 'rgba(0, 0, 0, 0)';

    // Subtle gridlines
    bctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    bctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      bctx.beginPath();
      bctx.moveTo(x * cell + 0.5, 0);
      bctx.lineTo(x * cell + 0.5, h);
      bctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      bctx.beginPath();
      bctx.moveTo(0, y * cell + 0.5);
      bctx.lineTo(w, y * cell + 0.5);
      bctx.stroke();
    }

    // Locked cells
    for (let y = HIDDEN_ROWS; y < ROWS + HIDDEN_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = game.grid[y][x];
        if (t) {
          drawCell(bctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, COLORS[t]);
        }
      }
    }

    // Ghost piece
    if (game.current && !game.over) {
      const gy = ghostY();
      const ghostPiece = { ...game.current, y: gy };
      for (const [x, y] of piecesCells(ghostPiece)) {
        if (y >= HIDDEN_ROWS) {
          drawCell(bctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, COLORS[game.current.type], 0.22);
        }
      }
    }

    // Active piece
    if (game.current && !game.over) {
      for (const [x, y] of piecesCells(game.current)) {
        if (y >= HIDDEN_ROWS) {
          drawCell(bctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, COLORS[game.current.type]);
        }
      }
    }
  }

  function drawMini(ctx, canvas, types) {
    const { w, h } = fitCanvas(canvas, ctx);
    ctx.clearRect(0, 0, w, h);
    if (!types || types.length === 0) return;
    const horizontal = w > h * 1.4;
    const n = types.length;
    const slotW = horizontal ? w / n : w;
    const slotH = horizontal ? h : h / n;
    types.forEach((t, i) => {
      const cells = SHAPES[t][0];
      let minX = 99, minY = 99, maxX = -99, maxY = -99;
      for (const [x, y] of cells) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const pieceW = maxX - minX + 1;
      const pieceH = maxY - minY + 1;
      const limit = Math.max(pieceW, pieceH);
      const cellSize = Math.min(slotH * 0.7 / limit, slotW * 0.7 / limit);
      const baseX = horizontal ? i * slotW : 0;
      const baseY = horizontal ? 0 : i * slotH;
      const offX = baseX + (slotW - pieceW * cellSize) / 2;
      const offY = baseY + (slotH - pieceH * cellSize) / 2;
      for (const [x, y] of cells) {
        drawCell(ctx, offX + (x - minX) * cellSize, offY + (y - minY) * cellSize, cellSize, COLORS[t]);
      }
    });
  }

  function drawNext() { drawMini(nctx, nextCanvas, game.queue.slice(0, 5)); }
  function drawHold() { drawMini(hctx, holdCanvas, game.hold ? [game.hold] : []); }

  function updateHud() {
    document.getElementById('score').textContent = game.score.toLocaleString();
    document.getElementById('level').textContent = game.level;
    document.getElementById('lines').textContent = game.lines;
    document.getElementById('best').textContent = game.best.toLocaleString();
  }

  // ---------- Game loop ----------
  let lastTime = 0;
  function loop(t) {
    if (!lastTime) lastTime = t;
    const dt = Math.min(64, t - lastTime);
    lastTime = t;
    if (!game.paused && !game.over) tick(dt);
    drawBoard();
    drawNext();
    drawHold();
    updateHud();
    requestAnimationFrame(loop);
  }

  function tick(dt) {
    if (!game.current) return;

    // Decay event banner
    if (game.lastEventTimer > 0) {
      game.lastEventTimer -= dt;
      if (game.lastEventTimer <= 0) {
        document.getElementById('event-banner').textContent = '加油！';
      }
    }

    const gravityMs = gravityFor(game.level) * 1000;
    const effectiveGravity = game.softDrop ? Math.min(gravityMs, 30) : gravityMs;
    game.dropAccumMs += dt;

    while (game.dropAccumMs >= effectiveGravity) {
      game.dropAccumMs -= effectiveGravity;
      const moved = tryMove(0, 1);
      if (moved) {
        if (game.softDrop) game.score += 1;
      } else {
        // touching ground
        break;
      }
    }

    // Lock detection
    const grounded = collides({ ...game.current, y: game.current.y + 1 });
    if (grounded) {
      game.lockTimerMs += dt;
      if (game.lockTimerMs >= LOCK_DELAY_MS) {
        lockPiece();
      }
    } else {
      game.lockTimerMs = 0;
    }
  }

  // ---------- Controls ----------
  // DAS / ARR for left/right
  const DAS_MS = 130;
  const ARR_MS = 30;
  const dasState = { left: 0, right: 0, leftTimer: 0, rightTimer: 0 };

  document.addEventListener('keydown', (e) => {
    if (game.over && e.key !== 'r' && e.key !== 'R') return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (!dasState.left) { tryMove(-1, 0); dasState.left = 1; dasState.leftTimer = -DAS_MS; }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (!dasState.right) { tryMove(1, 0); dasState.right = 1; dasState.rightTimer = -DAS_MS; }
        break;
      case 'ArrowDown':
        e.preventDefault();
        game.softDrop = true;
        break;
      case 'ArrowUp': case 'x': case 'X':
        e.preventDefault(); tryRotate(1); break;
      case 'z': case 'Z':
        e.preventDefault(); tryRotate(-1); break;
      case ' ':
        e.preventDefault(); hardDrop(); break;
      case 'c': case 'C': case 'Shift':
        e.preventDefault(); holdPiece(); break;
      case 'p': case 'P':
        e.preventDefault(); togglePause(); break;
      case 'r': case 'R':
        e.preventDefault(); restart(); break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowLeft': dasState.left = 0; break;
      case 'ArrowRight': dasState.right = 0; break;
      case 'ArrowDown': game.softDrop = false; break;
    }
  });

  // DAS pump
  setInterval(() => {
    const dt = 16;
    if (dasState.left) {
      dasState.leftTimer += dt;
      while (dasState.leftTimer >= ARR_MS) { tryMove(-1, 0); dasState.leftTimer -= ARR_MS; }
    }
    if (dasState.right) {
      dasState.rightTimer += dt;
      while (dasState.rightTimer >= ARR_MS) { tryMove(1, 0); dasState.rightTimer -= ARR_MS; }
    }
  }, 16);

  // Touch buttons
  document.querySelectorAll('.t-btn').forEach((btn) => {
    const action = btn.dataset.action;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (game.over) return;
      switch (action) {
        case 'left': tryMove(-1, 0); break;
        case 'right': tryMove(1, 0); break;
        case 'rotate-cw': tryRotate(1); break;
        case 'rotate-ccw': tryRotate(-1); break;
        case 'soft': tryMove(0, 1); break;
        case 'hard': hardDrop(); break;
        case 'hold': holdPiece(); break;
      }
    });
  });

  // Swipe gestures on the board
  let touchStart = null;
  boardCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: performance.now(), moved: 0 };
  }, { passive: true });
  boardCanvas.addEventListener('touchmove', (e) => {
    if (!touchStart || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const cellPx = boardCanvas.clientWidth / COLS;
    const want = Math.round(dx / cellPx);
    if (want > touchStart.moved) {
      for (let i = 0; i < want - touchStart.moved; i++) tryMove(1, 0);
      touchStart.moved = want;
    } else if (want < touchStart.moved) {
      for (let i = 0; i < touchStart.moved - want; i++) tryMove(-1, 0);
      touchStart.moved = want;
    }
  }, { passive: false });
  boardCanvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dt = performance.now() - touchStart.time;
    const moved = touchStart.moved;
    touchStart = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 250 && moved === 0) {
      tryRotate(1);
    } else if (dy > 80 && dt < 350 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      hardDrop();
    } else if (dy > 30 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      tryMove(0, 1);
    }
  });

  // ---------- Pause / restart / overlay ----------
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('overlay-btn').addEventListener('click', restart);

  function togglePause() {
    if (game.over) return;
    game.paused = !game.paused;
    if (game.paused) showOverlay('已暂停', '按 P 或点击按钮继续', '继续');
    else hideOverlay();
  }

  function restart() {
    game.grid = createGrid();
    game.bag = [];
    game.queue = [];
    ensureQueue();
    game.current = null;
    game.hold = null;
    game.holdUsed = false;
    game.score = 0;
    game.lines = 0;
    game.level = 1;
    game.combo = -1;
    game.paused = false;
    game.over = false;
    game.dropAccumMs = 0;
    game.lockTimerMs = 0;
    game.lockResets = 0;
    game.lastEvent = '';
    spawnPiece();
    hideOverlay();
    triggerEvent('开始游戏！');
  }

  function showOverlay(title, sub, btnText) {
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-sub').textContent = sub;
    document.getElementById('overlay-btn').textContent = btnText;
    document.getElementById('overlay').classList.remove('hidden');
  }
  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  // ---------- Boot ----------
  ensureQueue();
  spawnPiece();
  updateHud();
  requestAnimationFrame(loop);

  // Save best on unload
  window.addEventListener('beforeunload', () => {
    if (game.score > game.best) saveBest(game.score);
  });
})();
