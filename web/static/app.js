(() => {
  'use strict';

  const BOARD_SIZE = 15;
  const STONE = { EMPTY: 0, BLACK: 1, WHITE: 2 };

  const elements = {
    authChip: document.getElementById('auth-chip'),
    authPanel: document.getElementById('auth-panel'),
    workspace: document.getElementById('workspace'),
    heroStart: document.getElementById('hero-start'),
    heroSwitch: document.getElementById('hero-switch'),
    loginTab: document.getElementById('tab-login'),
    registerTab: document.getElementById('tab-register'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    canvas: document.getElementById('board'),
    toast: document.getElementById('toast'),
    welcomeTitle: document.getElementById('welcome-title'),
    welcomeSubtitle: document.getElementById('welcome-subtitle'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userUsername: document.getElementById('user-username'),
    accountName: document.getElementById('account-name'),
    btnLogout: document.getElementById('btn-logout'),
    gameId: document.getElementById('game-id'),
    turnText: document.getElementById('turn-text'),
    turnIndicator: document.querySelector('#turn .stone'),
    moveCount: document.getElementById('move-count'),
    statusBanner: document.getElementById('status-banner'),
    historyList: document.getElementById('history-list'),
    btnNew: document.getElementById('btn-new'),
    btnUndo: document.getElementById('btn-undo'),
    btnReset: document.getElementById('btn-reset'),
  };

  const ctx = elements.canvas.getContext('2d');
  const state = {
    mode: 'login',
    user: null,
    gameId: null,
    gameState: null,
    hoverCell: null,
  };

  let toastTimer = null;

  function showToast(message, kind) {
    const toast = elements.toast;
    toast.textContent = message;
    toast.classList.remove('error', 'success');
    if (kind) toast.classList.add(kind);
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function setMode(mode) {
    state.mode = mode;
    const isLogin = mode === 'login';
    elements.loginTab.classList.toggle('active', isLogin);
    elements.registerTab.classList.toggle('active', !isLogin);
    elements.loginForm.classList.toggle('hidden', !isLogin);
    elements.registerForm.classList.toggle('hidden', isLogin);
    elements.heroSwitch.textContent = isLogin ? '切换到注册' : '切换到登录';
  }

  function setButtonLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
  }

  async function api(method, path, body) {
    const init = {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const resp = await fetch(path, init);
    const text = await resp.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { raw: text };
      }
    }
    if (!resp.ok) {
      const error = new Error((data && data.error) || `请求失败 (${resp.status})`);
      error.status = resp.status;
      throw error;
    }
    return data;
  }

  function dpr() {
    return window.devicePixelRatio || 1;
  }

  function resizeCanvas() {
    const cssSize = elements.canvas.clientWidth;
    if (!cssSize) return;
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

  function fillUser(user) {
    state.user = user;
    const loggedIn = Boolean(user);
    elements.authPanel.classList.toggle('hidden', loggedIn);
    elements.workspace.classList.toggle('hidden', !loggedIn);
    elements.authChip.textContent = loggedIn ? `${user.name} · 已登录` : '未登录';

    if (!loggedIn) {
      elements.userAvatar.textContent = 'G';
      elements.userName.textContent = '游客';
      elements.userUsername.textContent = '@guest';
      elements.accountName.textContent = '—';
      return;
    }

    elements.welcomeTitle.textContent = `${user.name}，欢迎来到你的棋局大厅`;
    elements.welcomeSubtitle.textContent = `账号 @${user.username} 已登录，可以随时开启新的专属对局。`;
    elements.userAvatar.textContent = user.name.slice(0, 1).toUpperCase();
    elements.userName.textContent = user.name;
    elements.userUsername.textContent = `@${user.username}`;
    elements.accountName.textContent = `${user.name} (@${user.username})`;
  }

  function resetGameState() {
    state.gameId = null;
    state.gameState = null;
    state.hoverCell = null;
    renderGame();
  }

  async function fetchCurrentUser() {
    const data = await api('GET', '/api/auth/me');
    fillUser(data.user);
    return data.user;
  }

  async function registerUser(payload) {
    const data = await api('POST', '/api/auth/register', payload);
    fillUser(data.user);
    return data.user;
  }

  async function loginUser(payload) {
    const data = await api('POST', '/api/auth/login', payload);
    fillUser(data.user);
    return data.user;
  }

  async function logoutUser() {
    await api('POST', '/api/auth/logout');
    fillUser(null);
    resetGameState();
  }

  async function createGame() {
    const data = await api('POST', '/api/games');
    state.gameId = data.id;
    state.gameState = data.state;
    state.hoverCell = null;
    renderGame();
    showToast('新对局已开始', 'success');
  }

  async function makeMove(x, y) {
    if (!state.gameId) return;
    const data = await api('POST', `/api/games/${state.gameId}/move`, { x, y });
    state.gameState = data.state;
    renderGame();
  }

  async function undoMove() {
    if (!state.gameId) return;
    const data = await api('POST', `/api/games/${state.gameId}/undo`);
    state.gameState = data.state;
    renderGame();
    showToast('已悔棋');
  }

  async function resetGame() {
    if (!state.gameId) return;
    const data = await api('POST', `/api/games/${state.gameId}/reset`);
    state.gameState = data.state;
    renderGame();
    showToast('棋盘已重置');
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

  function drawStones() {
    if (!state.gameState) return;
    const { cell } = geometry();
    const radius = cell * 0.42;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const value = state.gameState.board[y][x];
        if (value === STONE.EMPTY) continue;
        drawStone(cellToPixel(x), cellToPixel(y), radius, value === STONE.BLACK);
      }
    }
    const last = state.gameState.history[state.gameState.history.length - 1];
    if (last) {
      ctx.strokeStyle = '#ff5959';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cellToPixel(last.x), cellToPixel(last.y), radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (state.gameState.win_line && state.gameState.win_line.length > 0) {
      const first = state.gameState.win_line[0];
      const lastWin = state.gameState.win_line[state.gameState.win_line.length - 1];
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cellToPixel(first.x), cellToPixel(first.y));
      ctx.lineTo(cellToPixel(lastWin.x), cellToPixel(lastWin.y));
      ctx.stroke();
    }
  }

  function drawHover() {
    if (!state.hoverCell || !state.gameState || state.gameState.status !== 'playing') return;
    if (state.gameState.board[state.hoverCell.y][state.hoverCell.x] !== STONE.EMPTY) return;
    const { cell } = geometry();
    ctx.globalAlpha = 0.4;
    drawStone(cellToPixel(state.hoverCell.x), cellToPixel(state.hoverCell.y), cell * 0.42, state.gameState.turn === STONE.BLACK);
    ctx.globalAlpha = 1;
  }

  function renderHistory(history) {
    elements.historyList.innerHTML = '';
    history.forEach((move, index) => {
      const li = document.createElement('li');
      const colorName = move.stone === STONE.BLACK ? '黑' : '白';
      li.textContent = `${String(index + 1).padStart(3, ' ')}. ${colorName} → (${move.x}, ${move.y})`;
      elements.historyList.appendChild(li);
    });
  }

  function renderGame() {
    drawBoard();
    drawStones();
    drawHover();

    elements.gameId.textContent = state.gameId || '—';
    if (!state.gameState) {
      elements.turnText.textContent = '等待开局';
      elements.turnIndicator.classList.remove('stone-black', 'stone-white');
      elements.turnIndicator.classList.add('stone-black');
      elements.moveCount.textContent = '0';
      elements.statusBanner.className = 'status-banner playing';
      elements.statusBanner.textContent = '登录后将自动创建新对局';
      elements.btnUndo.disabled = true;
      elements.btnReset.disabled = true;
      renderHistory([]);
      return;
    }

    elements.moveCount.textContent = String(state.gameState.history.length);
    const turnIsBlack = state.gameState.turn === STONE.BLACK;
    elements.turnText.textContent = turnIsBlack ? '黑棋' : '白棋';
    elements.turnIndicator.classList.remove('stone-black', 'stone-white');
    elements.turnIndicator.classList.add(turnIsBlack ? 'stone-black' : 'stone-white');

    const banner = elements.statusBanner;
    banner.classList.remove('playing', 'win-black', 'win-white', 'draw');
    switch (state.gameState.status) {
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

    elements.btnUndo.disabled = state.gameState.history.length === 0;
    elements.btnReset.disabled = false;
    renderHistory(state.gameState.history);
  }

  function getCanvasPos(evt) {
    const rect = elements.canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function clearForms() {
    elements.loginForm.reset();
    elements.registerForm.reset();
  }

  function handleUnauthorized(err) {
    if (err && err.status === 401) {
      fillUser(null);
      resetGameState();
      setMode('login');
      showToast(err.message || '登录状态已失效，请重新登录', 'error');
      return true;
    }
    return false;
  }

  async function ensureGame() {
    if (!state.user || state.gameId) return;
    try {
      await createGame();
    } catch (err) {
      if (!handleUnauthorized(err)) showToast(err.message, 'error');
    }
  }

  elements.loginTab.addEventListener('click', () => setMode('login'));
  elements.registerTab.addEventListener('click', () => setMode('register'));
  elements.heroSwitch.addEventListener('click', () => setMode(state.mode === 'login' ? 'register' : 'login'));
  elements.heroStart.addEventListener('click', () => {
    elements.authPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = state.mode === 'login' ? elements.loginForm.username : elements.registerForm.name;
    if (target) target.focus();
  });

  elements.loginForm.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const button = elements.loginForm.querySelector('button[type="submit"]');
    setButtonLoading(button, true);
    try {
      await loginUser({
        username: elements.loginForm.username.value,
        password: elements.loginForm.password.value,
      });
      clearForms();
      await ensureGame();
      showToast('登录成功，欢迎回来', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  elements.registerForm.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const button = elements.registerForm.querySelector('button[type="submit"]');
    setButtonLoading(button, true);
    try {
      await registerUser({
        name: elements.registerForm.name.value,
        username: elements.registerForm.username.value,
        password: elements.registerForm.password.value,
      });
      clearForms();
      await ensureGame();
      showToast('注册成功，已自动登录', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });

  elements.btnLogout.addEventListener('click', async () => {
    try {
      await logoutUser();
      setMode('login');
      showToast('你已安全退出登录');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  elements.btnNew.addEventListener('click', async () => {
    try {
      await createGame();
    } catch (err) {
      if (!handleUnauthorized(err)) showToast(err.message, 'error');
    }
  });

  elements.btnUndo.addEventListener('click', async () => {
    try {
      await undoMove();
    } catch (err) {
      if (!handleUnauthorized(err)) showToast(err.message, 'error');
    }
  });

  elements.btnReset.addEventListener('click', async () => {
    try {
      await resetGame();
    } catch (err) {
      if (!handleUnauthorized(err)) showToast(err.message, 'error');
    }
  });

  elements.canvas.addEventListener('mousemove', (evt) => {
    if (!state.user || !state.gameState) return;
    const pos = getCanvasPos(evt);
    const cell = pixelToCell(pos.x, pos.y);
    if (!cell) {
      if (state.hoverCell) {
        state.hoverCell = null;
        renderGame();
      }
      return;
    }
    if (!state.hoverCell || state.hoverCell.x !== cell.x || state.hoverCell.y !== cell.y) {
      state.hoverCell = cell;
      renderGame();
    }
  });

  elements.canvas.addEventListener('mouseleave', () => {
    if (state.hoverCell) {
      state.hoverCell = null;
      renderGame();
    }
  });

  elements.canvas.addEventListener('click', async (evt) => {
    if (!state.user || !state.gameState || state.gameState.status !== 'playing') return;
    const pos = getCanvasPos(evt);
    const cell = pixelToCell(pos.x, pos.y);
    if (!cell) return;
    try {
      await makeMove(cell.x, cell.y);
    } catch (err) {
      if (!handleUnauthorized(err)) showToast(err.message, 'error');
    }
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
    renderGame();
  });

  async function bootstrap() {
    setMode('login');
    fillUser(null);
    resizeCanvas();
    renderGame();

    try {
      await fetchCurrentUser();
      await ensureGame();
      showToast('已恢复登录状态', 'success');
    } catch (err) {
      if (err.status !== 401) {
        showToast(`初始化失败：${err.message}`, 'error');
      }
    }
  }

  bootstrap();
})();
