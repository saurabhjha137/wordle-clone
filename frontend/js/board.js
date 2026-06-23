import { TILE_SIZE_BY_LENGTH } from './constants.js';

const TILE_FONT_BY_LENGTH = { 3: '2rem', 4: '1.9rem', 5: '1.85rem', 6: '1.55rem', 7: '1.3rem' };

export function getTile(r, c) {
  return document.getElementById(`r${r}c${c}`);
}

export function buildBoard(wordLen, maxRows) {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.style.setProperty('--tile-size', (TILE_SIZE_BY_LENGTH[wordLen] ?? 62) + 'px');
  board.style.setProperty('--tile-font', TILE_FONT_BY_LENGTH[wordLen] ?? '1.85rem');
  board.style.setProperty('--word-len', wordLen);

  for (let r = 0; r < maxRows; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.id = `row-${r}`;
    row.dataset.attempt = r + 1;

    for (let c = 0; c < wordLen; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `r${r}c${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
}

export function updateActiveTile(currentRow, currentCol, wordLen, gameOver) {
  document.querySelectorAll('.tile.active-tile').forEach(t => t.classList.remove('active-tile'));
  document.querySelectorAll('.row.active-row').forEach(r => r.classList.remove('active-row'));
  if (gameOver) return;

  const rowEl = document.getElementById(`row-${currentRow}`);
  if (rowEl) rowEl.classList.add('active-row');
  if (currentCol < wordLen) {
    const tile = getTile(currentRow, currentCol);
    if (tile) tile.classList.add('active-tile');
  }
}

export function resetBoard(wordLen, maxRows) {
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < wordLen; c++) {
      const tile = getTile(r, c);
      if (!tile) continue;
      tile.textContent = '';
      tile.className   = 'tile';
    }
  }
}
