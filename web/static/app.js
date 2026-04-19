(() => {
  'use strict';

  const BOARD_SIZE = 15;
  const STONE = { EMPTY: 0, BLACK: 1, WHITE: 2 };
  const STAR_POINTS = [3, 7, 11];

  const els = {
    canvas: document.getElementById('board'),
    modeTabs: document.querySelectorAll('.mode-tab'),
    modeBadge: document.getElementById('mode-badge'),
    aiOptions: document.getElementById('ai-options'),
    pvpOptions: document.getElementById('pvp-options'),
    difficulty: document.getElementById('difficulty'),
    aiColor: document.getElementById('ai-color'),
    roomCode: document.getElementById('room-code'),
    pvpRole: document.getElementById('pvp-role'),
    btnStart: document.getElementById('btn-start'),
    btnBottomStart: document.getElementById('btn-bottom-start'),
    btnBottomUndo: document.getElementById('btn-bottom-undo'),
    btnBottomReset: document.getElementById('btn-bottom-reset'),
    btnSideUndo: document.getElementById('btn-side-undo'),
    btnSideReset: document.getElementById('btn-side-reset'),
    btnCopy: document.getElementById('btn-copy'),
    roomId: document.getElementById('room-id'),
    myRoleMini: document.getElementById('my-role-mini'),
    turnText: document.getElementById('turn-text'),
    turnIndicator: document.getElementById('turn-indicator'),
    moveCount: document.getElementById('move-count'),
    statusBanner: document.getElementById('status-banner'),
    historyList: document.getElementById('history-list'),
    historyCount: document.getElementById('history-count'),
    toast: document.getElementById('toast'),
  };
  const ctx = els.canvas.getContext('2d');

  const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // 应用状态
  const app = {
    mode: 'local',
    state: null,
    roomId: null,
    role: null,
    ws: null,
    hover: null,
    lastMoveCount: 0,
    placeAnim: null, // {x, y, stone, start, duration}
    rafId: null,
  };

  // ------- Mode Tabs -------
  els.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      els.modeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      app.mode = tab.dataset.mode;
      els.aiOptions.classList.toggle('hidden', app.mode !== 'ai');
      els.pvpOptions.classList.toggle('hidden', app.mode !== 'pvp');
      updateModeBadge();
    });
  });

  function updateModeBadge() {
    const labels = { local: '本地双人', ai: '人机对战', pvp: '联机对战' };
    els.modeBadge.textContent = labels[app.mode] || '—';
  }

  // ------- Buttons -------
  function bindStart(el) { el.addEventListener('click', () => startGame().catch((e) => showToast(e.message, 'error'))); }
  function bindUndo(el) { el.addEventListener('click', () => doAction('undo').catch((e) => showToast(e.message, 'error'))); }
  function bindReset(el) { el.addEventListener('click', () => doAction('reset').catch((e) => showToast(e.message, 'error'))); }

  bindStart(els.btnStart);
  bindStart(els.btnBottomStart);
  bindUndo(els.btnBottomUndo);
  bindReset(els.btnBottomReset);
  bindUndo(els.btnSideUndo);
  bindReset(els.btnSideReset);

  els.btnCopy.addEventListener('click', () => {
    if (!app.roomId) {
      showToast('当前没有房间号', 'error');
      return;
    }
    const url = `${location.origin}${location.pathname}?room=${app.roomId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => showToast('房间链接已复制', 'success'),
        () => fallbackCopy(url)
      );
    } else {
      fallbackCopy(url);
    }
  });

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('房间链接已复制', 'success');
    } catch (_) {
      window.prompt('复制以下链接分享给好友：', text);
    }
  }

  // ------- Game flow -------
  async function startGame() {
    closeWS();
    if (app.mode === 'local') {
      const data = await api('POST', '/api/games');
      app.roomId = data.id;
      app.role = 'local';
      app.state = data.state;
      app.lastMoveCount = 0;
      app.placeAnim = null;
      els.roomId.textContent = '本地 · ' + data.id.slice(0, 6);
      els.myRoleMini.textContent = '本地双人';
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
      if (!app.roomId) {
        showToast('请先开始一局对局', 'error');
        return;
      }
      const data = await api('POST', `/api/games/${app.roomId}/${kind}`);
      app.state = data.state;
      maybeAnimateLastMove();
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
        app.lastMoveCount = 0;
        app.placeAnim = null;
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
        info = `人机 · ${labelOfDifficulty(payload.room.difficulty)} · 你执 ${roleLabel(app.role)}`;
      } else if (mode === 'pvp') {
        const players = (payload.room.players || []).map((p) => `${p.role === 'black' ? '黑' : '白'}${p.online ? '✓' : '○'}`).join(' / ');
        info = `${players} · 你为 ${roleLabel(app.role)}`;
      } else {
        info = '本地双人';
      }
      els.myRoleMini.textContent = info;
    }
    maybeAnimateLastMove();
    render();
  }

  function maybeAnimateLastMove() {
    if (!app.state) return;
    const cur = app.state.history.length;
    if (cur > app.lastMoveCount) {
      const last = app.state.history[cur - 1];
      app.placeAnim = {
        x: last.x, y: last.y, stone: last.stone,
        start: performance.now(), duration: 220,
      };
      scheduleAnim();
    }
    app.lastMoveCount = cur;
  }

  function scheduleAnim() {
    if (app.rafId !== null) return;
    const tick = () => {
      app.rafId = null;
      const a = app.placeAnim;
      if (!a) return;
      const elapsed = performance.now() - a.start;
      if (elapsed >= a.duration) {
        app.placeAnim = null;
        render();
        return;
      }
      render();
      app.rafId = requestAnimationFrame(tick);
    };
    app.rafId = requestAnimationFrame(tick);
  }

  // ------- Canvas geometry & rendering -------
  function dpr() { return window.devicePixelRatio || 1; }

  function resizeCanvas() {
    const cssSize = els.canvas.clientWidth;
    if (cssSize === 0) return;
    const ratio = dpr();
    const px = Math.round(cssSize * ratio);
    if (els.canvas.width !== px || els.canvas.height !== px) {
      els.canvas.width = px;
      els.canvas.height = px;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function geometry() {
    const size = els.canvas.clientWidth;
    // Reserve some room for coordinate labels
    const labelPad = Math.max(14, size * 0.04);
    const padding = Math.max(20, size * 0.055);
    const inner = size - padding * 2;
    const cell = inner / (BOARD_SIZE - 1);
    return { size, padding, cell, labelPad };
  }

  function cellToPixel(idx) {
    const { padding, cell } = geometry();
    return padding + idx * cell;
  }

  function pixelToCell(px, py) {
    const { padding, cell, size } = geometry();
    const x = Math.round((px - padding) / cell);
    const y = Math.round((py - padding) / cell);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
    // hit tolerance: must be within roughly one cell of the intersection
    const ix = padding + x * cell;
    const iy = padding + y * cell;
    if (Math.hypot(px - ix, py - iy) > cell * 0.7) return null;
    if (px < 0 || py < 0 || px > size || py > size) return null;
    return { x, y };
  }

  function drawBoard() {
    const { size, padding, cell } = geometry();
    ctx.clearRect(0, 0, size, size);

    // Wood gradient background
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#f5d4a1');
    bg.addColorStop(1, '#d9aa6a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = 'rgba(74, 50, 23, 0.85)';
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

    // Outer frame slightly thicker
    ctx.strokeStyle = 'rgba(74, 50, 23, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(padding, padding, cell * (BOARD_SIZE - 1), cell * (BOARD_SIZE - 1));

    // Star points
    ctx.fillStyle = 'rgba(74, 50, 23, 0.95)';
    for (const sy of STAR_POINTS) {
      for (const sx of STAR_POINTS) {
        ctx.beginPath();
        ctx.arc(cellToPixel(sx), cellToPixel(sy), Math.max(2.5, cell * 0.075), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Coordinate labels (only when board is large enough to be readable)
    if (cell >= 18) {
      ctx.fillStyle = 'rgba(74, 50, 23, 0.7)';
      ctx.font = `${Math.max(10, Math.floor(cell * 0.32))}px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const offset = Math.max(8, padding * 0.5);
      for (let i = 0; i < BOARD_SIZE; i++) {
        const p = padding + i * cell;
        // top column letters: A..O
        const col = String.fromCharCode(65 + i);
        ctx.fillText(col, p, padding - offset);
        ctx.fillText(col, p, size - padding + offset);
        // side row numbers: 1..15
        const row = String(BOARD_SIZE - i);
        ctx.fillText(row, padding - offset, p);
        ctx.fillText(row, size - padding + offset, p);
      }
    }
  }

  function drawStones() {
    if (!app.state) return;
    const { cell } = geometry();
    const radius = cell * 0.44;
    const anim = app.placeAnim;
    const animX = anim ? anim.x : -1;
    const animY = anim ? anim.y : -1;

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const v = app.state.board[y][x];
        if (v === STONE.EMPTY) continue;
        if (x === animX && y === animY) continue; // 由动画单独绘制
        drawStone(cellToPixel(x), cellToPixel(y), radius, v === STONE.BLACK, 1);
      }
    }

    // Animation for the latest stone (scale-in + fade-in)
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const r = radius * (0.5 + 0.5 * eased);
      drawStone(cellToPixel(anim.x), cellToPixel(anim.y), r, anim.stone === STONE.BLACK, eased);
    }

    // Last move marker (subtle)
    const last = app.state.history && app.state.history[app.state.history.length - 1];
    if (last && (!anim || performance.now() - anim.start >= anim.duration * 0.6)) {
      ctx.strokeStyle = '#ff5959';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cellToPixel(last.x), cellToPixel(last.y), radius * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Win line
    if (app.state.win_line && app.state.win_line.length > 0) {
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255, 59, 59, 0.6)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const first = app.state.win_line[0];
      const last2 = app.state.win_line[app.state.win_line.length - 1];
      ctx.moveTo(cellToPixel(first.x), cellToPixel(first.y));
      ctx.lineTo(cellToPixel(last2.x), cellToPixel(last2.y));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawStone(cx, cy, r, isBlack, alpha) {
    ctx.globalAlpha = alpha;
    // Soft shadow under stone
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.arc(cx + r * 0.08, cy + r * 0.12, r * 0.95, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    if (isBlack) {
      grad.addColorStop(0, '#7a7a7a');
      grad.addColorStop(0.5, '#262626');
      grad.addColorStop(1, '#020202');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#e6e6e6');
      grad.addColorStop(1, '#a8a8a8');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // subtle rim
    ctx.strokeStyle = isBlack ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // glossy highlight
    const hi = ctx.createRadialGradient(cx - r * 0.45, cy - r * 0.5, r * 0.05, cx - r * 0.45, cy - r * 0.5, r * 0.7);
    hi.addColorStop(0, isBlack ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.95)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy - r * 0.45, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function drawHover() {
    if (isCoarsePointer) return; // No hover preview on touch devices
    if (!app.hover || !app.state || app.state.status !== 'playing') return;
    if (!canPlaceNow()) return;
    const v = app.state.board[app.hover.y][app.hover.x];
    if (v !== STONE.EMPTY) return;
    const { cell } = geometry();
    const r = cell * 0.44;
    drawStone(cellToPixel(app.hover.x), cellToPixel(app.hover.y), r, isMyTurnBlack(), 0.35);
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
    resizeCanvas();
    drawBoard();
    drawStones();
    drawHover();
    renderPanel();
  }

  function renderPanel() {
    const banner = els.statusBanner;
    banner.classList.remove('playing', 'win-black', 'win-white', 'draw', 'waiting');

    if (!app.state) {
      banner.classList.add('waiting');
      banner.textContent = '请选择模式并开始对局';
      els.moveCount.textContent = '0';
      els.historyCount.textContent = '0';
      els.historyList.innerHTML = '';
      [els.btnBottomUndo, els.btnBottomReset, els.btnSideUndo, els.btnSideReset].forEach((b) => { if (b) b.disabled = true; });
      return;
    }

    els.moveCount.textContent = app.state.history.length;
    els.historyCount.textContent = app.state.history.length;

    const turnIsBlack = app.state.turn === STONE.BLACK;
    els.turnText.textContent = turnIsBlack ? '黑棋' : '白棋';
    els.turnIndicator.classList.remove('stone-black', 'stone-white');
    els.turnIndicator.classList.add(turnIsBlack ? 'stone-black' : 'stone-white');

    switch (app.state.status) {
      case 'black_win':
        banner.classList.add('win-black');
        banner.textContent = '🏆 黑棋胜！';
        break;
      case 'white_win':
        banner.classList.add('win-white');
        banner.textContent = '🏆 白棋胜！';
        break;
      case 'draw':
        banner.classList.add('draw');
        banner.textContent = '平局';
        break;
      default:
        banner.classList.add('playing');
        if (app.mode !== 'local' && !canPlaceNow() && app.role !== 'spectator') {
          banner.textContent = '⏳ 等待对手落子…';
        } else if (app.role === 'spectator') {
          banner.textContent = '👀 观战模式';
        } else {
          banner.textContent = '对局进行中';
        }
    }

    const undoDisabled = app.state.history.length === 0;
    [els.btnBottomUndo, els.btnSideUndo].forEach((b) => { if (b) b.disabled = undoDisabled; });
    [els.btnBottomReset, els.btnSideReset].forEach((b) => { if (b) b.disabled = false; });

    const ul = els.historyList;
    ul.innerHTML = '';
    const frag = document.createDocumentFragment();
    app.state.history.forEach((m, i) => {
      const li = document.createElement('li');
      const colorName = m.stone === STONE.BLACK ? '黑' : '白';
      const col = String.fromCharCode(65 + m.x);
      const row = BOARD_SIZE - m.y;
      li.textContent = `${String(i + 1).padStart(3, ' ')}.  ${colorName}  →  ${col}${row}`;
      frag.appendChild(li);
    });
    ul.appendChild(frag);
    ul.scrollTop = ul.scrollHeight;
  }

  // ------- Event handling (mouse + touch) -------
  function getCanvasPos(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  els.canvas.addEventListener('mousemove', (evt) => {
    if (isCoarsePointer) return;
    const { x, y } = getCanvasPos(evt.clientX, evt.clientY);
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

  els.canvas.addEventListener('click', (evt) => {
    const { x, y } = getCanvasPos(evt.clientX, evt.clientY);
    const cell = pixelToCell(x, y);
    if (cell) attemptPlace(cell.x, cell.y);
  });

  // Touch: tap to play with proper hit tolerance
  let touchStart = null;
  els.canvas.addEventListener('touchstart', (evt) => {
    if (evt.touches.length !== 1) return;
    const t = evt.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  }, { passive: true });

  els.canvas.addEventListener('touchend', (evt) => {
    if (!touchStart) return;
    const t = evt.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dt = performance.now() - touchStart.time;
    touchStart = null;
    if (Math.hypot(dx, dy) > 18) return; // 视为滑动，不落子
    if (dt > 800) return;
    const { x, y } = getCanvasPos(t.clientX, t.clientY);
    const cell = pixelToCell(x, y);
    if (cell) {
      // 防止某些浏览器随后触发的合成 click
      evt.preventDefault();
      attemptPlace(cell.x, cell.y);
    }
  }, { passive: false });

  els.canvas.addEventListener('touchcancel', () => { touchStart = null; });

  async function attemptPlace(x, y) {
    if (!app.state) {
      showToast('请先开始一局对局', 'error');
      return;
    }
    if (!canPlaceNow()) {
      if (app.state.status !== 'playing') return;
      if (app.role === 'spectator') {
        showToast('观战模式不可落子', 'error');
      } else if (app.mode !== 'local') {
        showToast('还未轮到你', 'error');
      }
      return;
    }
    try {
      if (app.mode === 'local') {
        const data = await api('POST', `/api/games/${app.roomId}/move`, { x, y });
        app.state = data.state;
        maybeAnimateLastMove();
        render();
      } else {
        if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
          showToast('未连接到房间', 'error');
          return;
        }
        app.ws.send(JSON.stringify({ type: 'move', x, y }));
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // Handle viewport size / orientation changes
  let resizeRaf = null;
  function onResize() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { resizeRaf = null; render(); });
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

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

  // ------- Bootstrap -------
  async function bootstrap() {
    updateModeBadge();
    render();

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
      updateModeBadge();
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
