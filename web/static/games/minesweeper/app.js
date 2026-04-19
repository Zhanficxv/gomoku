/**
 * Classic Minesweeper
 * - Difficulty selector (Easy 9x9/10, Medium 16x16/40, Hard 30x16/99, Custom)
 * - First-click safe (mines are placed AFTER first reveal)
 * - Flagging (right-click / long-press), question mark cycle
 * - Flood-fill for zero cells
 * - Chord (double-click an opened number to open neighbors when flag count matches)
 * - Win / lose detection, timer, mine counter, best-time persistence
 */
(() => {
  'use strict';

  const DIFFS = {
    easy:   { cols: 9,  rows: 9,  mines: 10 },
    medium: { cols: 16, rows: 16, mines: 40 },
    hard:   { cols: 30, rows: 16, mines: 99 },
  };

  const game = {
    cfg: { ...DIFFS.easy, key: 'easy' },
    grid: [],          // each cell: { mine, opened, flag, q, n, x, y }
    placed: false,     // mines placed yet?
    started: false,
    over: false,
    won: false,
    flags: 0,
    opened: 0,
    timer: 0,
    timerHandle: 0,
  };

  // ---------- DOM ----------
  const els = {
    board: document.getElementById('board'),
    minesLeft: document.getElementById('mines-left'),
    flagsPlaced: document.getElementById('flags-placed'),
    timer: document.getElementById('timer'),
    face: document.getElementById('face-btn'),
    diffTabs: document.getElementById('diff-tabs'),
    customOpts: document.getElementById('custom-options'),
    customCols: document.getElementById('custom-cols'),
    customRows: document.getElementById('custom-rows'),
    customMines: document.getElementById('custom-mines'),
    customApply: document.getElementById('custom-apply'),
    bestEasy: document.getElementById('best-easy'),
    bestMed:  document.getElementById('best-medium'),
    bestHard: document.getElementById('best-hard'),
    toast: document.getElementById('toast'),
  };

  // ---------- Init / restart ----------
  function init(cfg) {
    stopTimer();
    game.cfg = cfg;
    game.grid = [];
    game.placed = false;
    game.started = false;
    game.over = false;
    game.won = false;
    game.flags = 0;
    game.opened = 0;
    game.timer = 0;

    for (let y = 0; y < cfg.rows; y++) {
      const row = [];
      for (let x = 0; x < cfg.cols; x++) {
        row.push({ mine: false, opened: false, flag: false, q: false, n: 0, x, y });
      }
      game.grid.push(row);
    }

    renderBoard();
    updateHud();
    setFace('😀');
  }

  function placeMines(safeX, safeY) {
    const { cols, rows, mines } = game.cfg;
    const total = cols * rows;
    const safeIdx = new Set();
    // Reserve a 3x3 safe zone around first click
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = safeX + dx, ny = safeY + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) safeIdx.add(ny * cols + nx);
      }
    }

    const positions = [];
    for (let i = 0; i < total; i++) {
      if (!safeIdx.has(i)) positions.push(i);
    }
    // Shuffle
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const mineCount = Math.min(mines, positions.length);
    for (let i = 0; i < mineCount; i++) {
      const idx = positions[i];
      const x = idx % cols;
      const y = Math.floor(idx / cols);
      game.grid[y][x].mine = true;
    }
    // Compute neighbor counts
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (game.grid[y][x].mine) continue;
        let n = 0;
        for (const [nx, ny] of neighbors(x, y)) {
          if (game.grid[ny][nx].mine) n++;
        }
        game.grid[y][x].n = n;
      }
    }
    game.placed = true;
  }

  function* neighbors(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < game.cfg.cols && ny >= 0 && ny < game.cfg.rows) {
          yield [nx, ny];
        }
      }
    }
  }

  // ---------- Render ----------
  function renderBoard() {
    const { cols, rows } = game.cfg;
    els.board.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size, 28px))`;
    els.board.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
        frag.appendChild(cell);
      }
    }
    els.board.appendChild(frag);
    bindCellEvents();

    // Auto-shrink cell size for large boards
    const wrap = document.getElementById('board-wrap');
    const max = Math.min(700, wrap.clientWidth - 16);
    const fitSize = Math.floor((max - (cols - 1) * 2) / cols);
    const size = Math.max(20, Math.min(28, fitSize));
    els.board.style.setProperty('--cell-size', size + 'px');
    els.board.querySelectorAll('.cell').forEach(c => {
      c.style.width = size + 'px';
      c.style.height = size + 'px';
      c.style.fontSize = Math.round(size * 0.55) + 'px';
    });
  }

  function refreshCell(x, y) {
    const idx = y * game.cfg.cols + x;
    const node = els.board.children[idx];
    if (!node) return;
    const cell = game.grid[y][x];
    node.className = 'cell';
    if (cell.opened) {
      node.classList.add('opened');
      if (cell.mine) {
        node.classList.add('bomb');
        if (cell.exploded) node.classList.add('exploded');
        node.textContent = '';
      } else if (cell.n === 0) {
        node.classList.add('zero');
        node.textContent = '';
      } else {
        node.classList.add('n' + cell.n);
        node.textContent = cell.n;
      }
    } else if (cell.flag) {
      node.classList.add('flag');
      if (cell.wrong) node.classList.add('wrong-flag');
      node.textContent = '';
    } else if (cell.q) {
      node.classList.add('q');
      node.textContent = '';
    } else {
      node.textContent = '';
    }
  }

  function refreshAll() {
    for (let y = 0; y < game.cfg.rows; y++) {
      for (let x = 0; x < game.cfg.cols; x++) refreshCell(x, y);
    }
  }

  // ---------- Cell events ----------
  function bindCellEvents() {
    els.board.oncontextmenu = (e) => { e.preventDefault(); };
    let pressTimer = 0;
    let suppressClick = false;

    els.board.addEventListener('mousedown', (e) => {
      const node = e.target.closest('.cell');
      if (!node) return;
      const x = +node.dataset.x;
      const y = +node.dataset.y;
      if (e.button === 2) {
        e.preventDefault();
        toggleFlag(x, y);
      } else if (e.button === 0) {
        // wait for mouseup; chord on dblclick handled separately
      }
    });

    els.board.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const node = e.target.closest('.cell');
      if (!node) return;
      const x = +node.dataset.x;
      const y = +node.dataset.y;
      reveal(x, y);
    });

    els.board.addEventListener('dblclick', (e) => {
      const node = e.target.closest('.cell');
      if (!node) return;
      const x = +node.dataset.x;
      const y = +node.dataset.y;
      chord(x, y);
    });

    // Touch: long-press to flag
    els.board.addEventListener('touchstart', (e) => {
      const node = e.target.closest('.cell');
      if (!node) return;
      const x = +node.dataset.x;
      const y = +node.dataset.y;
      pressTimer = window.setTimeout(() => {
        suppressClick = true;
        toggleFlag(x, y);
        if (navigator.vibrate) navigator.vibrate(20);
        pressTimer = 0;
      }, 380);
    }, { passive: true });
    els.board.addEventListener('touchend', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    });
    els.board.addEventListener('touchmove', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    }, { passive: true });
  }

  // ---------- Game actions ----------
  function reveal(x, y) {
    if (game.over) return;
    const cell = game.grid[y][x];
    if (cell.opened || cell.flag) return;
    if (!game.placed) {
      placeMines(x, y);
      startTimer();
    }
    if (cell.mine) {
      cell.opened = true;
      cell.exploded = true;
      revealAllMines();
      lose();
      return;
    }
    floodOpen(x, y);
    refreshAll();
    updateHud();
    checkWin();
  }

  function floodOpen(x, y) {
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const cell = game.grid[cy][cx];
      if (cell.opened || cell.flag) continue;
      cell.opened = true;
      game.opened++;
      if (cell.n === 0 && !cell.mine) {
        for (const [nx, ny] of neighbors(cx, cy)) stack.push([nx, ny]);
      }
    }
  }

  function toggleFlag(x, y) {
    if (game.over) return;
    const cell = game.grid[y][x];
    if (cell.opened) return;
    if (!cell.flag && !cell.q) {
      cell.flag = true;
      game.flags++;
    } else if (cell.flag) {
      cell.flag = false;
      cell.q = true;
      game.flags--;
    } else if (cell.q) {
      cell.q = false;
    }
    refreshCell(x, y);
    updateHud();
  }

  function chord(x, y) {
    if (game.over) return;
    const cell = game.grid[y][x];
    if (!cell.opened || cell.n === 0 || cell.mine) return;
    let flagCount = 0;
    for (const [nx, ny] of neighbors(x, y)) {
      if (game.grid[ny][nx].flag) flagCount++;
    }
    if (flagCount !== cell.n) return;
    let exploded = false;
    for (const [nx, ny] of neighbors(x, y)) {
      const c = game.grid[ny][nx];
      if (c.flag || c.opened) continue;
      if (c.mine) {
        c.opened = true;
        c.exploded = true;
        exploded = true;
      } else {
        floodOpen(nx, ny);
      }
    }
    if (exploded) {
      revealAllMines();
      lose();
      return;
    }
    refreshAll();
    updateHud();
    checkWin();
  }

  function revealAllMines() {
    for (let y = 0; y < game.cfg.rows; y++) {
      for (let x = 0; x < game.cfg.cols; x++) {
        const c = game.grid[y][x];
        if (c.mine && !c.flag) c.opened = true;
        if (!c.mine && c.flag) c.wrong = true;
      }
    }
    refreshAll();
  }

  function checkWin() {
    const safeTotal = game.cfg.cols * game.cfg.rows - game.cfg.mines;
    if (game.opened >= safeTotal) win();
  }

  function win() {
    game.over = true;
    game.won = true;
    stopTimer();
    setFace('😎');
    // Auto-flag remaining mines
    for (let y = 0; y < game.cfg.rows; y++) {
      for (let x = 0; x < game.cfg.cols; x++) {
        const c = game.grid[y][x];
        if (c.mine && !c.flag) {
          c.flag = true;
          game.flags++;
        }
      }
    }
    refreshAll();
    updateHud();
    saveBest();
    showToast(`胜利！用时 ${game.timer} 秒`);
  }

  function lose() {
    game.over = true;
    stopTimer();
    setFace('😵');
    showToast('💥 踩到雷了，再试试');
  }

  // ---------- Timer ----------
  function startTimer() {
    if (game.started) return;
    game.started = true;
    game.timer = 0;
    game.timerHandle = window.setInterval(() => {
      game.timer++;
      els.timer.textContent = String(game.timer).padStart(3, '0');
      if (game.timer >= 999) stopTimer();
    }, 1000);
  }
  function stopTimer() {
    if (game.timerHandle) { clearInterval(game.timerHandle); game.timerHandle = 0; }
  }

  // ---------- HUD ----------
  function updateHud() {
    const remaining = Math.max(0, game.cfg.mines - game.flags);
    els.minesLeft.textContent = String(remaining).padStart(3, '0');
    els.flagsPlaced.textContent = String(game.flags).padStart(3, '0');
  }
  function setFace(emoji) { els.face.textContent = emoji; }

  // ---------- Best time persistence ----------
  function bestKey(diff) { return `minesweeper.best.${diff}`; }
  function loadBests() {
    const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    els.bestEasy.textContent = formatBest(get(bestKey('easy')));
    els.bestMed.textContent  = formatBest(get(bestKey('medium')));
    els.bestHard.textContent = formatBest(get(bestKey('hard')));
  }
  function formatBest(v) {
    if (!v) return '—';
    return v + ' s';
  }
  function saveBest() {
    if (!game.won) return;
    const k = game.cfg.key;
    if (k === 'custom') return;
    try {
      const cur = parseInt(localStorage.getItem(bestKey(k)) || '9999', 10);
      if (game.timer < cur) {
        localStorage.setItem(bestKey(k), String(game.timer));
        loadBests();
      }
    } catch {}
  }

  // ---------- Difficulty tabs ----------
  els.diffTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.diff-tab');
    if (!tab) return;
    els.diffTabs.querySelectorAll('.diff-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const diff = tab.dataset.diff;
    if (diff === 'custom') {
      els.customOpts.classList.remove('hidden');
      // Don't auto-start; wait for "应用并开始"
    } else {
      els.customOpts.classList.add('hidden');
      init({ ...DIFFS[diff], key: diff });
    }
  });

  els.customApply.addEventListener('click', () => {
    const cols = clamp(parseInt(els.customCols.value, 10) || 0, 5, 40);
    const rows = clamp(parseInt(els.customRows.value, 10) || 0, 5, 40);
    const maxMines = cols * rows - 9;
    const mines = clamp(parseInt(els.customMines.value, 10) || 0, 1, maxMines);
    els.customCols.value = cols;
    els.customRows.value = rows;
    els.customMines.value = mines;
    init({ cols, rows, mines, key: 'custom' });
  });
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  els.face.addEventListener('click', () => init(game.cfg));

  // ---------- Toast ----------
  let toastTimer = 0;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  // ---------- Boot ----------
  loadBests();
  init({ ...DIFFS.easy, key: 'easy' });
  window.addEventListener('resize', () => {
    if (els.board.children.length > 0) {
      // re-fit cell size on resize
      const wrap = document.getElementById('board-wrap');
      const cols = game.cfg.cols;
      const max = Math.min(700, wrap.clientWidth - 16);
      const fitSize = Math.floor((max - (cols - 1) * 2) / cols);
      const size = Math.max(20, Math.min(28, fitSize));
      els.board.style.setProperty('--cell-size', size + 'px');
      els.board.querySelectorAll('.cell').forEach(c => {
        c.style.width = size + 'px';
        c.style.height = size + 'px';
        c.style.fontSize = Math.round(size * 0.55) + 'px';
      });
    }
  });
})();
