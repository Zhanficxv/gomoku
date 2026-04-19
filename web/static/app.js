(() => {
  'use strict';

  const GAME_LABELS = {
    gomoku:      '五子棋',
    linkup:      '连连看',
    tetris:      '俄罗斯方块',
    minesweeper: '扫雷',
    breakout:    '打砖块',
    tictactoe:   '井字棋',
  };

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
    if (!Object.prototype.hasOwnProperty.call(GAME_LABELS, game)) return;
    continueLink.href = `/games/${game}/`;
    continueLink.textContent = `继续游玩：${GAME_LABELS[game]}`;
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
