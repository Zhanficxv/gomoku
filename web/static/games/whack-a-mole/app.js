(() => {
  'use strict';

  const HOLE_COUNT = 9;
  const ROUND_SECONDS = 30;

  const elements = {
    holes: Array.from(document.querySelectorAll('.hole')),
    score: document.getElementById('score'),
    combo: document.getElementById('combo'),
    timer: document.getElementById('timer'),
    best: document.getElementById('best-score'),
    status: document.getElementById('status-chip'),
    btnStart: document.getElementById('btn-start'),
    btnReset: document.getElementById('btn-reset'),
    toast: document.getElementById('toast'),
  };

  const state = {
    score: 0,
    combo: 0,
    best: 0,
    timeLeft: ROUND_SECONDS,
    activeHole: -1,
    roundTimer: null,
    moleTimer: null,
    running: false,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1500);
  }

  function loadBest() {
    try {
      state.best = Number(window.localStorage.getItem('arcade.whack.best') || '0');
    } catch (_) {
      state.best = 0;
    }
  }

  function saveBest() {
    try {
      window.localStorage.setItem('arcade.whack.best', String(state.best));
    } catch (_) {
      // 忽略存储失败。
    }
  }

  function updateStats() {
    elements.score.textContent = String(state.score);
    elements.combo.textContent = `${state.combo}x`;
    elements.timer.textContent = `${state.timeLeft}s`;
    elements.best.textContent = String(state.best);
  }

  function setStatus(text) {
    elements.status.textContent = text;
  }

  function clearActiveHole() {
    if (state.activeHole >= 0) {
      elements.holes[state.activeHole].classList.remove('active');
    }
    state.activeHole = -1;
  }

  function stopMoleLoop() {
    if (state.moleTimer) {
      clearTimeout(state.moleTimer);
      state.moleTimer = null;
    }
  }

  function stopRound() {
    state.running = false;
    clearInterval(state.roundTimer);
    state.roundTimer = null;
    stopMoleLoop();
    clearActiveHole();
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    updateStats();
    setStatus('本局结束，点击开始再次挑战。');
    showToast('时间到，本局结束');
  }

  function nextDelay() {
    return Math.max(320, 900 - state.combo * 35);
  }

  function spawnMole() {
    if (!state.running) return;
    clearActiveHole();
    const index = Math.floor(Math.random() * HOLE_COUNT);
    state.activeHole = index;
    elements.holes[index].classList.add('active');
    state.moleTimer = setTimeout(spawnMole, nextDelay());
  }

  function resetBoard() {
    state.score = 0;
    state.combo = 0;
    state.timeLeft = ROUND_SECONDS;
    clearActiveHole();
    updateStats();
    setStatus('点击开始按钮，准备敲地鼠。');
  }

  function startRound() {
    resetBoard();
    state.running = true;
    setStatus('快速点击冒出的地鼠，连击越高刷新越快。');
    clearInterval(state.roundTimer);
    state.roundTimer = setInterval(() => {
      state.timeLeft -= 1;
      updateStats();
      if (state.timeLeft <= 0) {
        stopRound();
      }
    }, 1000);
    spawnMole();
  }

  function whack(index) {
    if (!state.running || state.activeHole !== index) {
      state.combo = 0;
      updateStats();
      return;
    }
    elements.holes[index].classList.remove('active');
    state.activeHole = -1;
    state.combo += 1;
    state.score += 10 + (state.combo - 1) * 2;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest();
    }
    updateStats();
    showToast(`命中 +${10 + (state.combo - 1) * 2}`);
    stopMoleLoop();
    state.moleTimer = setTimeout(spawnMole, 180);
  }

  elements.holes.forEach((hole, index) => {
    hole.addEventListener('click', () => whack(index));
  });

  elements.btnStart.addEventListener('click', startRound);
  elements.btnReset.addEventListener('click', () => {
    clearInterval(state.roundTimer);
    stopMoleLoop();
    state.running = false;
    resetBoard();
    showToast('已重置练习场');
  });

  loadBest();
  resetBoard();
})();
