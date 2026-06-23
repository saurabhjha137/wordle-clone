import { getTile } from './board.js';

const KEY_PRIORITY = { correct: 3, present: 2, absent: 1 };

export function evaluateGuess(guess, target) {
  const wordLen  = target.length;
  const result   = Array(wordLen).fill('absent');
  const tLetters = target.split('');
  const used     = Array(wordLen).fill(false);

  for (let i = 0; i < wordLen; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
      used[i]   = true;
    }
  }

  for (let i = 0; i < wordLen; i++) {
    if (result[i] === 'correct') continue;
    const idx = tLetters.findIndex((l, j) => !used[j] && l === guess[i]);
    if (idx !== -1) {
      result[i] = 'present';
      used[idx] = true;
    }
  }

  return result;
}

export function revealRow(row, guess, result, wordLen, onDone) {
  const tiles = Array.from({ length: wordLen }, (_, c) => getTile(row, c));

  tiles.forEach((tile, i) => {
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.classList.remove('filled');
        tile.classList.add(result[i]);
      }, 240);
      updateKeyColor(guess[i], result[i]);
    }, i * 110);
  });

  setTimeout(onDone, wordLen * 110 + 480);
}

export function updateKeyColor(letter, state) {
  const key = document.querySelector(`[data-key="${letter.toLowerCase()}"]`);
  if (!key) return;
  const current = key.dataset.state;
  if (!current || KEY_PRIORITY[state] > KEY_PRIORITY[current]) {
    key.dataset.state = state;
    const wide = key.classList.contains('wide');
    key.className = wide ? `key wide ${state}` : `key ${state}`;
  }
}

export function resetKeyboard() {
  document.querySelectorAll('.key').forEach(k => {
    const wide = k.dataset.key === 'Enter' || k.dataset.key === 'Backspace';
    delete k.dataset.state;
    k.className = wide ? 'key wide' : 'key';
  });
}

export function shakeRow(row) {
  const rowEl = document.getElementById(`row-${row}`);
  if (!rowEl) return;
  rowEl.classList.add('shake');
  rowEl.addEventListener('animationend', () => rowEl.classList.remove('shake'), { once: true });
}

export function bounceRow(row, wordLen) {
  Array.from({ length: wordLen }, (_, c) => getTile(row, c))
    .forEach(tile => { if (tile) tile.classList.add('bounce'); });
}
