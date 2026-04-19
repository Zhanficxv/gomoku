(() => {
  'use strict';

  const PUZZLES = [
    {
      puzzle: [
        [5, 3, 0, 0, 7, 0, 0, 0, 0],
        [6, 0, 0, 1, 9, 5, 0, 0, 0],
        [0, 9, 8, 0, 0, 0, 0, 6, 0],
        [8, 0, 0, 0, 6, 0, 0, 0, 3],
        [4, 0, 0, 8, 0, 3, 0, 0, 1],
        [7, 0, 0, 0, 2, 0, 0, 0, 6],
        [0, 6, 0, 0, 0, 0, 2, 8, 0],
        [0, 0, 0, 4, 1, 9, 0, 0, 5],
        [0, 0, 0, 0, 8, 0, 0, 7, 9],
      ],
      solution: [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9],
      ],
    },
  ];

  const elements = {
    board: document.getElementById('board'),
    errors: document.getElementById('error-count'),
    filled: document.getElementById('filled-count'),
    timer: document.getElementById('timer'),
    status: document.getElementById('status-chip'),
    btnNew: document.getElementById('btn-new'),
    btnCheck: document.getElementById('btn-check'),
    toast: document.getElementById('toast'),
  };

  const state = {
    puzzle: [],
    solution: [],
    fixed: [],
    errors: 0,
    timerId: null,
    startedAt: 0,
    complete: false,
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1600);
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.slice());
  }

  function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.startedAt = Date.now();
    elements.timer.textContent = '00:00';
    state.timerId = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
      elements.timer.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function updateStats() {
    let filled = 0;
    state.puzzle.forEach((row) => row.forEach((value) => { if (value !== 0) filled += 1; }));
    elements.filled.textContent = String(filled);
    elements.errors.textContent = String(state.errors);
  }

  function render() {
    elements.board.innerHTML = '';
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const value = state.puzzle[row][col];
        const input = document.createElement('input');
        input.className = 'cell';
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 1;
        input.dataset.row = String(row);
        input.dataset.col = String(col);
        input.value = value === 0 ? '' : String(value);
        if (state.fixed[row][col]) {
          input.readOnly = true;
          input.classList.add('fixed');
        } else if (value !== 0 && value !== state.solution[row][col]) {
          input.classList.add('invalid');
        }
        elements.board.appendChild(input);
      }
    }
    updateStats();
  }

  function isComplete() {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (state.puzzle[row][col] !== state.solution[row][col]) return false;
      }
    }
    return true;
  }

  function loadPuzzle() {
    const sample = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    state.puzzle = cloneGrid(sample.puzzle);
    state.solution = cloneGrid(sample.solution);
    state.fixed = sample.puzzle.map((row) => row.map((value) => value !== 0));
    state.errors = 0;
    state.complete = false;
    elements.status.textContent = '填写空白格，完成整盘数独';
    startTimer();
    render();
  }

  elements.board.addEventListener('input', (event) => {
    const input = event.target.closest('.cell');
    if (!input || input.readOnly || state.complete) return;
    const row = Number(input.dataset.row);
    const col = Number(input.dataset.col);
    const value = input.value.replace(/[^1-9]/g, '');
    input.value = value;
    state.puzzle[row][col] = value ? Number(value) : 0;
    input.classList.remove('invalid');
    if (value && Number(value) !== state.solution[row][col]) {
      input.classList.add('invalid');
      state.errors += 1;
    }
    updateStats();
    if (isComplete()) {
      state.complete = true;
      stopTimer();
      elements.status.textContent = '恭喜完成数独';
      showToast('数独完成！');
    }
  });

  elements.btnCheck.addEventListener('click', () => {
    let wrong = 0;
    Array.from(elements.board.querySelectorAll('.cell')).forEach((input) => {
      if (input.readOnly || !input.value) return;
      const row = Number(input.dataset.row);
      const col = Number(input.dataset.col);
      input.classList.toggle('invalid', Number(input.value) !== state.solution[row][col]);
      if (Number(input.value) !== state.solution[row][col]) wrong += 1;
    });
    elements.status.textContent = wrong === 0 ? '当前填写全部正确' : `还有 ${wrong} 个格子不正确`;
    showToast(wrong === 0 ? '检查通过' : `发现 ${wrong} 处错误`);
  });

  elements.btnNew.addEventListener('click', () => {
    loadPuzzle();
    showToast('已生成新题目');
  });

  loadPuzzle();
})();
