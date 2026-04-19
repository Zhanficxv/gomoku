(() => {
  'use strict';

  const elements = {
    authChip: document.getElementById('auth-chip'),
    continueLink: document.getElementById('continue-link'),
    featuredLink: document.getElementById('featured-link'),
    scrollGames: document.getElementById('scroll-games'),
    metricCount: document.getElementById('metric-count'),
    sectionDesc: document.getElementById('section-desc'),
    gameGrid: document.getElementById('game-grid'),
    toast: document.getElementById('toast'),
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function getLastPlayedGame() {
    try {
      return window.localStorage.getItem('arcade.lastGame');
    } catch (_) {
      return null;
    }
  }

  function rememberGame(slug) {
    try {
      window.localStorage.setItem('arcade.lastGame', slug);
    } catch (_) {
      // 忽略存储失败。
    }
  }

  async function api(path) {
    const resp = await fetch(path, { credentials: 'same-origin' });
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

  async function fetchCurrentUser() {
    try {
      const data = await api('/api/auth/me');
      elements.authChip.textContent = `${data.user.name} · 已登录`;
    } catch (err) {
      if (err.status === 401) {
        elements.authChip.textContent = '游客模式';
        return;
      }
      elements.authChip.textContent = '状态读取失败';
    }
  }

  function createPreview(game) {
    const preview = document.createElement('div');
    preview.className = `game-preview preview-${game.slug}`;
    switch (game.slug) {
      case 'linkup':
        preview.innerHTML = '<span>🍒</span><span>🍒</span><span>🍋</span><span>🍋</span><span>🍓</span><span>🍓</span><span>🍇</span><span>🍇</span>';
        break;
      case '2048':
        preview.textContent = '2048';
        break;
      case 'snake':
        preview.textContent = '🐍';
        break;
      case 'minesweeper':
        preview.textContent = '💣';
        break;
      case 'tetris':
        preview.textContent = '🧱';
        break;
      case 'tictactoe':
        preview.innerHTML = '<span>✕</span><span>○</span><span>✕</span><span>○</span><span>✕</span><span>○</span><span>✕</span><span>○</span><span>✕</span>';
        break;
      case 'memory-match':
        preview.innerHTML = '<span>🎴</span><span>🎴</span><span>🎯</span><span>🎯</span><span>🎁</span><span>🎁</span><span>🎵</span><span>🎵</span>';
        break;
      case 'breakout':
        preview.innerHTML = '<span class="brick"></span><span class="brick"></span><span class="brick"></span><span class="ball"></span><span class="paddle"></span>';
        break;
      case 'whack-a-mole':
        preview.innerHTML = '<span>🕳️</span><span>🕳️</span><span>🕳️</span><span>🕳️</span><span>🐹</span><span>🕳️</span><span>🕳️</span><span>🕳️</span><span>🕳️</span>';
        break;
      default:
        preview.textContent = game.icon || 'GAME';
    }
    return preview;
  }

  function createGameCard(game) {
    const article = document.createElement('article');
    article.className = `game-card card${game.featured ? ' featured' : ''}`;

    const badgeGroup = document.createElement('div');
    badgeGroup.className = 'badge-group';
    game.badges.forEach((badge) => {
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = badge;
      badgeGroup.appendChild(span);
    });

    const head = document.createElement('div');
    head.className = 'game-card-head';
    head.innerHTML = `
      <div>
        <p class="eyebrow">${game.category}</p>
        <h3>${game.name}</h3>
        <p class="card-mode">${game.mode}${game.auth_required ? ' · 需要登录' : ' · 可直接游玩'}</p>
      </div>
    `;
    const type = document.createElement('div');
    type.className = 'game-type';
    type.textContent = game.slug;
    head.appendChild(type);

    const tagline = document.createElement('p');
    tagline.className = 'hero-text';
    tagline.textContent = game.tagline;

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = game.description;

    const featureList = document.createElement('div');
    featureList.className = 'feature-list';
    game.features.forEach((feature) => {
      const pill = document.createElement('span');
      pill.className = 'feature-pill';
      pill.textContent = feature;
      featureList.appendChild(pill);
    });

    const route = document.createElement('p');
    route.className = 'card-route';
    route.innerHTML = `独立部署目录：<code>${game.standalone_entry}</code>`;

    const actions = document.createElement('div');
    actions.className = 'hero-actions';

    const start = document.createElement('a');
    start.className = 'btn primary';
    start.href = game.route;
    start.textContent = '开始游戏';
    start.dataset.gameLink = game.slug;

    const open = document.createElement('a');
    open.className = 'btn ghost';
    open.href = game.route;
    open.target = '_blank';
    open.rel = 'noreferrer';
    open.textContent = '独立打开';
    open.dataset.gameLink = game.slug;

    actions.append(start, open);
    article.append(head, badgeGroup, tagline, desc, createPreview(game), featureList, route, actions);
    return article;
  }

  function bindRememberLinks() {
    document.querySelectorAll('[data-game-link]').forEach((link) => {
      link.addEventListener('click', () => rememberGame(link.dataset.gameLink || ''));
    });
  }

  function renderContinueLink(games) {
    const last = getLastPlayedGame();
    if (!last) return;
    const game = games.find((item) => item.slug === last);
    if (!game) return;
    elements.continueLink.href = game.route;
    elements.continueLink.textContent = `继续游玩：${game.name}`;
    elements.continueLink.classList.remove('hidden');
  }

  function renderFeaturedLink(games) {
    const featured = games.find((game) => game.featured) || games[0];
    if (!featured) return;
    elements.featuredLink.href = featured.route;
    elements.featuredLink.textContent = `进入精选：${featured.name}`;
    elements.featuredLink.dataset.gameLink = featured.slug;
    elements.featuredLink.classList.remove('hidden');
  }

  function renderGames(games) {
    elements.metricCount.textContent = String(games.length);
    elements.sectionDesc.textContent = `当前已注册 ${games.length} 个小游戏，全部都采用独立目录组织，支持单独部署。`;
    elements.gameGrid.innerHTML = '';
    games.forEach((game) => elements.gameGrid.appendChild(createGameCard(game)));
    renderContinueLink(games);
    renderFeaturedLink(games);
    bindRememberLinks();
  }

  elements.scrollGames.addEventListener('click', () => {
    const section = document.getElementById('games-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  async function bootstrap() {
    await fetchCurrentUser();
    try {
      const data = await api('/api/arcade/games');
      renderGames(data.games || []);
    } catch (err) {
      elements.sectionDesc.textContent = `游戏列表加载失败：${err.message}`;
      showToast('游戏列表加载失败');
    }
  }

  bootstrap();
})();
