(() => {
  'use strict';

  const ICONS = ['🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🥝', '🍒'];

  const elements = {
    board: document.getElementById('board'),
    matchedPairs: document.getElementById('matched-pairs'),
    moves: document.getElementById('moves'),
    timer: document.getElementById('timer'),
    status: document.getElementById('status-chip'),
    btnNew: document.getElementById('btn-new'),
    toast: document.getElementById('toast'),
  };

  const state = {
    cards: [],
    selected: [],
    matched: 0,
    moves: 0,
    busy: false,
    startedAt: 0,
    timerId: null,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1600);
  }

  function shuffle(items) {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.startedAt = Date.now();
    elements.timer.textContent = '00:00';
    state.timerId = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      elements.timer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function updateStats() {
    elements.matchedPairs.textContent = String(state.matched);
    elements.moves.textContent = String(state.moves);
    if (state.matched === ICONS.length) {
      elements.status.textContent = `通关成功，用时 ${elements.timer.textContent}`;
    } else if (state.selected.length === 0) {
      elements.status.textContent = '翻开两张牌，找出相同图案';
    } else {
      elements.status.textContent = '再选择一张牌';
    }
  }

  function render() {
    elements.board.innerHTML = '';
    state.cards.forEach((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card-item';
      button.dataset.index = String(index);
      if (card.revealed) button.classList.add('revealed');
      if (card.matched) button.classList.add('matched');
      button.textContent = card.revealed || card.matched ? card.icon : '❓';
      elements.board.appendChild(button);
    });
    updateStats();
  }

  function finishGame() {
    if (state.matched === ICONS.length) {
      stopTimer();
      updateStats();
      showToast('全部配对成功');
    }
  }

  function flipCard(index) {
    if (state.busy) return;
    const card = state.cards[index];
    if (!card || card.matched || card.revealed) return;

    if (!state.timerId && state.moves === 0 && state.selected.length === 0) {
      startTimer();
    }

    card.revealed = true;
    state.selected.push(card);
    render();

    if (state.selected.length < 2) return;

    state.moves += 1;
    const [first, second] = state.selected;
    if (first.icon === second.icon) {
      first.matched = true;
      second.matched = true;
      state.selected = [];
      state.matched += 1;
      render();
      showToast('配对成功');
      finishGame();
      return;
    }

    state.busy = true;
    setTimeout(() => {
      first.revealed = false;
      second.revealed = false;
      state.selected = [];
      state.busy = false;
      render();
    }, 700);
  }

  function resetGame() {
    stopTimer();
    const cards = shuffle(ICONS.concat(ICONS)).map((icon) => ({
      icon,
      revealed: false,
      matched: false,
    }));
    state.cards = cards;
    state.selected = [];
    state.matched = 0;
    state.moves = 0;
    state.busy = false;
    elements.timer.textContent = '00:00';
    render();
  }

  elements.board.addEventListener('click', (event) => {
    const button = event.target.closest('.card-item');
    if (!button) return;
    flipCard(Number(button.dataset.index));
  });

  elements.btnNew.addEventListener('click', resetGame);

  resetGame();
})();
