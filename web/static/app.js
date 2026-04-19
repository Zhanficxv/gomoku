(() => {
  'use strict';

  const continueLink = document.getElementById('continue-link');
  const gameLinks = Array.from(document.querySelectorAll('[data-game-link]'));

  function getLastPlayedGame() {
    try {
      return window.localStorage.getItem('arcade.lastGame');
    } catch (_) {
      return null;
    }
  }

  function setContinueLink(game) {
    if (!game || !continueLink) return;
    const href = `/games/${game}/`;
    continueLink.href = href;
    continueLink.textContent = `继续游玩：${game === 'gomoku' ? '五子棋' : '连连看'}`;
    continueLink.classList.remove('hidden');
  }

  function bindGameLinks() {
    gameLinks.forEach((link) => {
      link.addEventListener('click', () => {
        try {
          window.localStorage.setItem('arcade.lastGame', link.dataset.gameLink || '');
        } catch (_) {
          // 忽略本地存储失败，不影响跳转。
        }
      });
    });
  }

  bindGameLinks();
  setContinueLink(getLastPlayedGame());
})();
