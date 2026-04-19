(() => {
  'use strict';

  const BOARD_SIZE = 15;
  const STONE = { EMPTY: 0, BLACK: 1, WHITE: 2 };

  const els = {
    canvas: document.getElementById('board'),
    modeTabs: document.querySelectorAll('.mode-tab'),
    aiOptions: document.getElementById('ai-options'),
    pvpOptions: document.getElementById('pvp-options'),
    difficulty: document.getElementById('difficulty'),
    aiColor: document.getElementById('ai-color'),
    roomCode: document.getElementById('room-code'),
    pvpRole: document.getElementById('pvp-role'),
    btnStart: document.getElementById('btn-start'),
    btnUndo: document.getElementById('btn-undo'),
    btnReset: document.getElementById('btn-reset'),
    btnCopy: document.getElementById('btn-copy'),
    roomId: document.getElementById('room-id'),
    myRole: document.getElementById('my-role'),
    turnText: document.getElementById('turn-text'),
    turnIndicator: document.querySelector('#turn .stone'),
    moveCount: document.getElementById('move-count'),
    statusBanner: document.getElementById('status-banner'),
    historyList: document.getElementById('history-list'),
    toast: document.getElementById('toast'),
  };
  const ctx = els.canvas.getContext('2d');

  // 应用状态
  const app = {
    mode: 'local',           // local | ai | pvp
    state: null,             // 当前 game snapshot
    roomId: null,            // 房间 ID（联机/人机）
    role: null,              // 我方角色（black/white/spectator/local）
    ws: null,
    hover: null,
  };

  // ------- Mode Tabs -------
  els.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      els.modeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      app.mode = tab.dataset.mode;
      els.aiOptions.classList.toggle('hidden', app.mode !== 'ai');
      els.pvpOptions.classList.toggle('hidden', app.mode !== 'pvp');
    });
  });

  // 启动按钮
  els.btnStart.addEventListener('click', () => {
    startGame().catch((err) => showToast(err.message, 'error'));
  });
  els.btnUndo.addEventListener('click', () => {
    doAction('undo').catch((e) => showToast(e.message, 'error'));
  });
  els.btnReset.addEventListener('click', () => {
    doAction('reset').catch((e) => showToast(e.message, 'error'));
  });
  els.btnCopy.addEventListener('click', () => {
    if (!app.roomId) {
      showToast('当前没有房间号', 'error');
      return;
    }
    const url = `${location.origin}${location.pathname}?room=${app.roomId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => showToast('房间链接已复制', 'success'),
        () => showToast('复制失败', 'error')
      );
    } else {
      window.prompt('复制以下链接分享给好友：', url);
    }
  });

  // ------- 启动逻辑 -------
  async function startGame() {
    closeWS();
    if (app.mode === 'local') {
      const data = await api('POST', '/api/games');
      app.roomId = data.id;
      app.role = 'local';
      app.state = data.state;
      els.roomId.textContent = '本地（' + data.id.slice(0, 6) + '）';
      els.myRole.textContent = '本地双人';
      render();
      showToast('本地对局已开始', 'success');
      return;
    }

    if (app.mode === 'ai') {
      const created = await api('POST', '/api/rooms', {
        mode: 'ai',
        difficulty: els.difficulty.value,
      });
      const myColor = els.aiColor.value === 'white' ? 'white' : 'black';
      await connectWS(created.room.id, myColor);
      showToast(`人机对战已开始 · 难度：${labelOfDifficulty(els.difficulty.value)}`, 'success');
      return;
    }

    if (app.mode === 'pvp') {
      let roomId = els.roomCode.value.trim();
      if (!roomId) {
        const created = await api('POST', '/api/rooms', { mode: 'pvp' });
        roomId = created.room.id;
        els.roomCode.value = roomId;
      }
      const role = els.pvpRole.value || 'auto';
      await connectWS(roomId, role);
      showToast('已加入房间 ' + roomId, 'success');
    }
  }

  async function doAction(kind) {
    if (app.mode === 'local') {
      if (!app.roomId) return;
      const data = await api('POST', `/api/games/${app.roomId}/${kind}`);
      app.state = data.state;
      render();
      return;
    }
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
      showToast('未连接到房间', 'error');
      return;
    }
    app.ws.send(JSON.stringify({ type: kind }));
  }

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

  // ------- WebSocket -------
  function closeWS() {
    if (app.ws) {
      try { app.ws.close(); } catch (_) {}
      app.ws = null;
    }
  }

  function connectWS(roomId, role) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws/rooms/${roomId}?role=${encodeURIComponent(role)}`;
      const ws = new WebSocket(url);
      let opened = false;
      ws.onopen = () => {
        opened = true;
        app.ws = ws;
        app.roomId = roomId;
        els.roomId.textContent = roomId;
        resolve();
      };
      ws.onmessage = (evt) => {
        try {
          const env = JSON.parse(evt.data);
          if (env.type === 'state') {
            applyServerState(env.data);
          } else if (env.type === 'error') {
            showToast(env.data.message || '服务器错误', 'error');
          }
        } catch (e) { /* ignore */ }
      };
      ws.onclose = () => {
        if (app.ws === ws) {
          app.ws = null;
          // 仅在原本已连接的房间断开时提示
          if (opened && app.mode !== 'local') {
            showToast('连接已断开', 'error');
          }
        }
      };
      ws.onerror = () => {
        if (!opened) reject(new Error('WebSocket 连接失败'));
      };
    });
  }

  function applyServerState(payload) {
    app.state = payload.game;
    app.role = (payload.you && payload.you.role) || null;
    if (payload.room) {
      const mode = payload.room.mode;
      let info = '';
      if (mode === 'ai') {
        info = `人机 · 难度 ${labelOfDifficulty(payload.room.difficulty)} · 你执 ${roleLabel(app.role)}`;
      } else if (mode === 'pvp') {
        const players = (payload.room.players || []).map((p) => `${p.role === 'black' ? '黑' : '白'}${p.online ? '✓' : '○'}`).join(' / ');
        info = `联机 · ${players} · 你为 ${roleLabel(app.role)}`;
      } else {
        info = '本地双人';
      }
      els.myRole.textContent = info;
    }
    render();
  }

  // ------- 渲染 -------
  function dpr() { return window.devicePixelRatio || 1; }

  function resizeCanvas() {
    const cssSize = els.canvas.clientWidth;
    const ratio = dpr();
    els.canvas.width = Math.round(cssSize * ratio);
    els.canvas.height = Math.round(cssSize * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function geometry() {
    const size = els.canvas.clientWidth;
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
    if (!app.state) return;
    const { cell } = geometry();
    const radius = cell * 0.42;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const v = app.state.board[y][x];
        if (v === STONE.EMPTY) continue;
        drawStone(cellToPixel(x), cellToPixel(y), radius, v === STONE.BLACK);
      }
    }
    const last = app.state.history && app.state.history[app.state.history.length - 1];
    if (last) {
      ctx.strokeStyle = '#ff5959';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cellToPixel(last.x), cellToPixel(last.y), radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (app.state.win_line && app.state.win_line.length > 0) {
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const first = app.state.win_line[0];
      const last2 = app.state.win_line[app.state.win_line.length - 1];
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
    if (!app.hover || !app.state || app.state.status !== 'playing') return;
    if (!canPlaceNow()) return;
    const v = app.state.board[app.hover.y][app.hover.x];
    if (v !== STONE.EMPTY) return;
    const { cell } = geometry();
    const r = cell * 0.42;
    ctx.globalAlpha = 0.4;
    const showBlack = isMyTurnBlack();
    drawStone(cellToPixel(app.hover.x), cellToPixel(app.hover.y), r, showBlack);
    ctx.globalAlpha = 1;
  }

  function isMyTurnBlack() {
    if (!app.state) return true;
    if (app.mode === 'local') return app.state.turn === STONE.BLACK;
    if (app.role === 'black') return true;
    if (app.role === 'white') return false;
    return app.state.turn === STONE.BLACK;
  }

  function canPlaceNow() {
    if (!app.state || app.state.status !== 'playing') return false;
    if (app.mode === 'local') return true;
    if (app.role === 'spectator' || !app.role) return false;
    const myStone = app.role === 'black' ? STONE.BLACK : STONE.WHITE;
    return app.state.turn === myStone;
  }

  function render() {
    drawBoard();
    drawStones();
    drawHover();
    renderPanel();
  }

  function renderPanel() {
    if (!app.state) {
      els.statusBanner.className = 'status-banner waiting';
      els.statusBanner.textContent = '尚未开始，请先选择模式并开始对局';
      return;
    }
    els.moveCount.textContent = app.state.history.length;
    const turnIsBlack = app.state.turn === STONE.BLACK;
    els.turnText.textContent = turnIsBlack ? '黑棋' : '白棋';
    els.turnIndicator.classList.remove('stone-black', 'stone-white');
    els.turnIndicator.classList.add(turnIsBlack ? 'stone-black' : 'stone-white');

    const banner = els.statusBanner;
    banner.classList.remove('playing', 'win-black', 'win-white', 'draw', 'waiting');
    switch (app.state.status) {
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
        if (app.mode !== 'local' && !canPlaceNow() && app.role !== 'spectator') {
          banner.textContent = '等待对手落子…';
        } else if (app.role === 'spectator') {
          banner.textContent = '观战模式';
        } else {
          banner.textContent = '对局进行中';
        }
    }

    els.btnUndo.disabled = app.state.history.length === 0;
    els.btnReset.disabled = false;

    els.historyList.innerHTML = '';
    app.state.history.forEach((m, i) => {
      const li = document.createElement('li');
      const colorName = m.stone === STONE.BLACK ? '黑' : '白';
      li.textContent = `${String(i + 1).padStart(3, ' ')}. ${colorName} → (${m.x}, ${m.y})`;
      els.historyList.appendChild(li);
    });
    els.historyList.scrollTop = els.historyList.scrollHeight;
  }

  // ------- 事件 -------
  function getCanvasPos(evt) {
    const rect = els.canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  els.canvas.addEventListener('mousemove', (evt) => {
    const { x, y } = getCanvasPos(evt);
    const cell = pixelToCell(x, y);
    if (!cell) {
      if (app.hover) { app.hover = null; render(); }
      return;
    }
    if (!app.hover || app.hover.x !== cell.x || app.hover.y !== cell.y) {
      app.hover = cell;
      render();
    }
  });

  els.canvas.addEventListener('mouseleave', () => {
    if (app.hover) { app.hover = null; render(); }
  });

  els.canvas.addEventListener('click', async (evt) => {
    if (!canPlaceNow()) {
      if (app.state && app.state.status === 'playing' && app.role === 'spectator') {
        showToast('观战模式不可落子', 'error');
      } else if (app.state && app.state.status === 'playing' && app.mode !== 'local') {
        showToast('还未轮到你', 'error');
      }
      return;
    }
    const { x, y } = getCanvasPos(evt);
    const cell = pixelToCell(x, y);
    if (!cell) return;
    try {
      if (app.mode === 'local') {
        const data = await api('POST', `/api/games/${app.roomId}/move`, { x: cell.x, y: cell.y });
        app.state = data.state;
        render();
      } else {
        if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
          showToast('未连接到房间', 'error');
          return;
        }
        app.ws.send(JSON.stringify({ type: 'move', x: cell.x, y: cell.y }));
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  window.addEventListener('resize', () => { resizeCanvas(); render(); });

  // ------- Helpers -------
  function labelOfDifficulty(d) {
    return ({ easy: '简单', medium: '中等', hard: '困难' })[d] || d || '中等';
  }
  function roleLabel(r) {
    return ({ black: '黑棋', white: '白棋', spectator: '观战' })[r] || '—';
  }

  let toastTimer = null;
  function showToast(msg, kind) {
    const t = els.toast;
    t.textContent = msg;
    t.classList.remove('error', 'success');
    if (kind) t.classList.add(kind);
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ------- 启动 -------
  async function bootstrap() {
    resizeCanvas();
    drawBoard();
    renderPanel();

    // 支持通过 URL `?room=xxx` 自动加入联机房间
    const params = new URLSearchParams(location.search);
    const roomFromURL = params.get('room');
    if (roomFromURL) {
      els.modeTabs.forEach((t) => t.classList.remove('active'));
      const pvpTab = document.querySelector('.mode-tab[data-mode="pvp"]');
      pvpTab.classList.add('active');
      app.mode = 'pvp';
      els.aiOptions.classList.add('hidden');
      els.pvpOptions.classList.remove('hidden');
      els.roomCode.value = roomFromURL;
      try {
        await connectWS(roomFromURL, 'auto');
        showToast('已加入房间 ' + roomFromURL, 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    }
  }

  bootstrap();
})();
