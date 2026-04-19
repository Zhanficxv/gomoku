(() => {
  'use strict';

  const BOARD_SIZE = 15;
  const STONE = { EMPTY: 0, BLACK: 1, WHITE: 2 };

  const elements = {
    canvas: document.getElementById('board'),
    gameId: document.getElementById('game-id'),
    turnText: document.getElementById('turn-text'),
    turnIndicator: document.querySelector('#turn .stone'),
    moveCount: document.getElementById('move-count'),
    statusBanner: document.getElementById('status-banner'),
    btnNew: document.getElementById('btn-new'),
    btnUndo: document.getElementById('btn-undo'),
    btnReset: document.getElementById('btn-reset'),
    historyList: document.getElementById('history-list'),
    toast: document.getElementById('toast'),
  };

  const ctx = elements.canvas.getContext('2d');

  let state = null;
  let gameId = null;
  let hoverCell = null;

  // ------- API -------
  async function api(method, path, body) {
    const init = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const resp = await fetch(path, init);
    const text = await resp.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
    }
    if (!resp.ok) {
      const msg = (data && data.error) || `请求失败 (${resp.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function createGame() {
    const data = await api('POST', '/api/games');
    gameId = data.id;
    state = data.state;
    render();
    showToast('新对局已开始', 'success');
  }

  async function makeMove(x, y) {
    if (!gameId) return;
    const data = await api('POST', `/api/games/${gameId}/move`, { x, y });
    state = data.state;
    render();
  }

  async function undoMove() {
    if (!gameId) return;
    const data = await api('POST', `/api/games/${gameId}/undo`);
    state = data.state;
    render();
    showToast('已悔棋');
  }

  async function resetGame() {
    if (!gameId) return;
    const data = await api('POST', `/api/games/${gameId}/reset`);
    state = data.state;
    render();
    showToast('棋盘已重置');
  }

  // ------- 渲染 -------
  function dpr() { return window.devicePixelRatio || 1; }

  function resizeCanvas() {
    const cssSize = elements.canvas.clientWidth;
    const ratio = dpr();
    elements.canvas.width = Math.round(cssSize * ratio);
    elements.canvas.height = Math.round(cssSize * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function geometry() {
    const size = elements.canvas.clientWidth;
    const padding = size * 0.045;
    const inner = size - padding * 2;
    const cell = inner / (BOARD_SIZE - 1);
    return { size, padding, cell };
  }

  function cellToPixel(idx) {
    const { padding, cell } = geometry();
    return padding + idx * cell;
  }

  function pixelToCell(px, py) {
    const { padding, cell } = geometry();
    const x = Math.round((px - padding) / cell);
    const y = Math.round((py - padding) / cell);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
    return { x, y };
  }

  function drawBoard() {
    const { size, padding, cell } = geometry();
    ctx.clearRect(0, 0, size, size);

    // 背景（与外层卡片色一致，做点细微纹理）
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#efcb8b');
    bg.addColorStop(1, '#deb16a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#4a3217';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < BOARD_SIZE; i++) {
      const p = padding + i * cell;
      ctx.moveTo(padding, p);
      ctx.lineTo(size - padding, p);
      ctx.moveTo(p, padding);
      ctx.lineTo(p, size - padding);
    }
    ctx.stroke();

    // 星位（含天元）
    const stars = [3, 7, 11];
    ctx.fillStyle = '#4a3217';
    for (const sy of stars) {
      for (const sx of stars) {
        ctx.beginPath();
        ctx.arc(cellToPixel(sx), cellToPixel(sy), Math.max(3, cell * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStones() {
    if (!state) return;
    const { cell } = geometry();
    const radius = cell * 0.42;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const v = state.board[y][x];
        if (v === STONE.EMPTY) continue;
        drawStone(cellToPixel(x), cellToPixel(y), radius, v === STONE.BLACK);
      }
    }
    // 高亮最后一手
    const last = state.history && state.history[state.history.length - 1];
    if (last) {
      ctx.strokeStyle = '#ff5959';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cellToPixel(last.x), cellToPixel(last.y), radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 高亮胜利连线
    if (state.win_line && state.win_line.length > 0) {
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const first = state.win_line[0];
      const last2 = state.win_line[state.win_line.length - 1];
      ctx.moveTo(cellToPixel(first.x), cellToPixel(first.y));
      ctx.lineTo(cellToPixel(last2.x), cellToPixel(last2.y));
      ctx.stroke();
    }
  }

  function drawStone(cx, cy, r, isBlack) {
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    if (isBlack) {
      grad.addColorStop(0, '#6a6a6a');
      grad.addColorStop(1, '#050505');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#bcbcbc');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  function drawHover() {
    if (!hoverCell || !state || state.status !== 'playing') return;
    const { cell } = geometry();
    const v = state.board[hoverCell.y][hoverCell.x];
    if (v !== STONE.EMPTY) return;
    const r = cell * 0.42;
    ctx.globalAlpha = 0.4;
    drawStone(cellToPixel(hoverCell.x), cellToPixel(hoverCell.y), r, state.turn === STONE.BLACK);
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBoard();
    drawStones();
    drawHover();
    renderPanel();
  }

  function renderPanel() {
    elements.gameId.textContent = gameId || '—';
    if (!state) return;

    elements.moveCount.textContent = state.history.length;

    const turnIsBlack = state.turn === STONE.BLACK;
    elements.turnText.textContent = turnIsBlack ? '黑棋' : '白棋';
    elements.turnIndicator.classList.remove('stone-black', 'stone-white');
    elements.turnIndicator.classList.add(turnIsBlack ? 'stone-black' : 'stone-white');

    const banner = elements.statusBanner;
    banner.classList.remove('playing', 'win-black', 'win-white', 'draw');
    switch (state.status) {
      case 'black_win':
        banner.classList.add('win-black');
        banner.textContent = '黑棋胜！';
        break;
      case 'white_win':
        banner.classList.add('win-white');
        banner.textContent = '白棋胜！';
        break;
      case 'draw':
        banner.classList.add('draw');
        banner.textContent = '平局';
        break;
      default:
        banner.classList.add('playing');
        banner.textContent = '对局进行中';
    }

    elements.btnUndo.disabled = state.history.length === 0;

    elements.historyList.innerHTML = '';
    state.history.forEach((m, i) => {
      const li = document.createElement('li');
      const colorName = m.stone === STONE.BLACK ? '黑' : '白';
      li.textContent = `${String(i + 1).padStart(3, ' ')}. ${colorName} → (${m.x}, ${m.y})`;
      elements.historyList.appendChild(li);
    });
    elements.historyList.scrollTop = elements.historyList.scrollHeight;
  }

  // ------- 事件 -------
  function getCanvasPos(evt) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);
    return { x, y };
  }

  elements.canvas.addEventListener('mousemove', (evt) => {
    const { x, y } = getCanvasPos(evt);
    const cell = pixelToCell(x, y);
    if (!cell) {
      if (hoverCell) { hoverCell = null; render(); }
      return;
    }
    if (!hoverCell || hoverCell.x !== cell.x || hoverCell.y !== cell.y) {
      hoverCell = cell;
      render();
    }
  });

  elements.canvas.addEventListener('mouseleave', () => {
    if (hoverCell) { hoverCell = null; render(); }
  });

  elements.canvas.addEventListener('click', async (evt) => {
    if (!state || state.status !== 'playing') return;
    const { x, y } = getCanvasPos(evt);
    const cell = pixelToCell(x, y);
    if (!cell) return;
    try {
      await makeMove(cell.x, cell.y);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  elements.btnNew.addEventListener('click', async () => {
    try { await createGame(); } catch (e) { showToast(e.message, 'error'); }
  });
  elements.btnUndo.addEventListener('click', async () => {
    try { await undoMove(); } catch (e) { showToast(e.message, 'error'); }
  });
  elements.btnReset.addEventListener('click', async () => {
    try { await resetGame(); } catch (e) { showToast(e.message, 'error'); }
  });

  window.addEventListener('resize', () => { resizeCanvas(); render(); });

  // ------- Toast -------
  let toastTimer = null;
  function showToast(msg, kind) {
    const t = elements.toast;
    t.textContent = msg;
    t.classList.remove('error', 'success');
    if (kind) t.classList.add(kind);
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ------- 启动 -------
  async function bootstrap() {
    resizeCanvas();
    drawBoard();
    try {
      await createGame();
    } catch (e) {
      showToast('无法连接后端: ' + e.message, 'error');
    }
  }

  bootstrap();
})();
