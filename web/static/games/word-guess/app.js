(() => {
  'use strict';

  const WORDS = ['APPLE', 'BRAIN', 'CHAIR', 'DREAM', 'EARTH', 'FLAME', 'GRAPE', 'HOUSE', 'LIGHT', 'MUSIC'];
  const MAX_TRIES = 6;
  const WORD_LEN = 5;

  const elements = {
    board: document.getElementById('board'),
    keyboard: document.getElementById('keyboard'),
    tryCount: document.getElementById('try-count'),
    guessedCount: document.getElementById('guessed-count'),
    answerMask: document.getElementById('answer-mask'),
    statusChip: document.getElementById('status-chip'),
    btnNew: document.getElementById('btn-new'),
    toast: document.getElementById('toast'),
  };

  const state = {
    answer: '',
    row: 0,
    col: 0,
    guesses: Array.from({ length: MAX_TRIES }, () => Array(WORD_LEN).fill('')),
    over: false,
    keyState: {},
  };

  let toastTimer = null;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
  }

  function randomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }

  function maskWord() {
    return '_ '.repeat(WORD_LEN).trim();
  }

  function renderBoard() {
    elements.board.innerHTML = '';
    state.guesses.forEach((letters, rowIndex) => {
      letters.forEach((letter, colIndex) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.textContent = letter;
        if (rowIndex < state.row) {
          const result = evaluateGuess(letters.join(''));
          cell.classList.add(result[colIndex]);
        } else if (rowIndex === state.row && colIndex < state.col) {
          cell.classList.add('filled');
        }
        elements.board.appendChild(cell);
      });
    });
    elements.tryCount.textContent = `${state.row}/${MAX_TRIES}`;
    elements.guessedCount.textContent = String(Object.keys(state.keyState).length);
    elements.answerMask.textContent = state.over ? state.answer : maskWord();
  }

  function renderKeyboard() {
    elements.keyboard.innerHTML = '';
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    rows.forEach((letters) => {
      const row = document.createElement('div');
      row.className = 'keyboard-row';
      letters.split('').forEach((letter) => {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = `key ${state.keyState[letter] || ''}`.trim();
        key.textContent = letter;
        key.dataset.key = letter;
        row.appendChild(key);
      });
      elements.keyboard.appendChild(row);
    });
    const controlRow = document.createElement('div');
    controlRow.className = 'keyboard-row';
    controlRow.innerHTML = `
      <button type="button" class="key wide" data-key="ENTER">ENTER</button>
      <button type="button" class="key wide" data-key="BACKSPACE">DELETE</button>
    `;
    elements.keyboard.appendChild(controlRow);
  }

  function evaluateGuess(guess) {
    const answer = state.answer.split('');
    const guessChars = guess.split('');
    const result = Array(WORD_LEN).fill('absent');

    for (let i = 0; i < WORD_LEN; i++) {
      if (guessChars[i] === answer[i]) {
        result[i] = 'correct';
        answer[i] = null;
        guessChars[i] = null;
      }
    }

    for (let i = 0; i < WORD_LEN; i++) {
      if (!guessChars[i]) continue;
      const index = answer.indexOf(guessChars[i]);
      if (index !== -1) {
        result[i] = 'present';
        answer[index] = null;
      }
    }

    return result;
  }

  function upgradeKey(letter, status) {
    const rank = { absent: 1, present: 2, correct: 3 };
    if (!state.keyState[letter] || rank[status] > rank[state.keyState[letter]]) {
      state.keyState[letter] = status;
    }
  }

  function commitGuess() {
    if (state.col < WORD_LEN || state.over) return;
    const guess = state.guesses[state.row].join('');
    const result = evaluateGuess(guess);
    result.forEach((status, index) => upgradeKey(guess[index], status));

    if (guess === state.answer) {
      state.over = true;
      elements.statusChip.textContent = '猜中了！';
      renderBoard();
      renderKeyboard();
      showToast('答对了');
      return;
    }

    state.row += 1;
    state.col = 0;
    if (state.row >= MAX_TRIES) {
      state.over = true;
      elements.statusChip.textContent = `挑战结束，答案是 ${state.answer}`;
      showToast(`答案：${state.answer}`);
    } else {
      elements.statusChip.textContent = `继续尝试，第 ${state.row + 1} 行`;
    }
    renderBoard();
    renderKeyboard();
  }

  function handleInput(key) {
    if (state.over) return;
    if (/^[A-Z]$/.test(key)) {
      if (state.col >= WORD_LEN) return;
      state.guesses[state.row][state.col] = key;
      state.col += 1;
      renderBoard();
      return;
    }
    if (key === 'BACKSPACE') {
      if (state.col === 0) return;
      state.col -= 1;
      state.guesses[state.row][state.col] = '';
      renderBoard();
      return;
    }
    if (key === 'ENTER') {
      commitGuess();
    }
  }

  function resetGame() {
    state.answer = randomWord();
    state.row = 0;
    state.col = 0;
    state.guesses = Array.from({ length: MAX_TRIES }, () => Array(WORD_LEN).fill(''));
    state.over = false;
    state.keyState = {};
    elements.statusChip.textContent = '输入 5 个字母开始猜词';
    renderBoard();
    renderKeyboard();
  }

  elements.keyboard.addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    handleInput(button.dataset.key);
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toUpperCase();
    if (/^[A-Z]$/.test(key)) {
      handleInput(key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      handleInput('BACKSPACE');
    } else if (event.key === 'Enter') {
      handleInput('ENTER');
    }
  });

  elements.btnNew.addEventListener('click', () => {
    resetGame();
    showToast('已开始新单词');
  });

  resetGame();
})();
