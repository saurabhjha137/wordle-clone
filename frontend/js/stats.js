import { loadStats, saveStats } from './storage.js';
import { ATTEMPTS_BY_LENGTH } from './constants.js';

export function recordResult(won, guessCount, wordLen) {
  const s         = loadStats();
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  s.played = (s.played || 0) + 1;

  if (won) {
    s.won = (s.won || 0) + 1;
    if (s.lastWon === today) {
      // already won today — keep streak as-is, don't double-count
    } else if (s.lastWon === yesterday) {
      s.streak = (s.streak || 0) + 1;
    } else {
      s.streak = 1;
    }
    s.maxStreak = Math.max(s.streak || 0, s.maxStreak || 0);
    s.lastWon   = today;

    // Per-length distribution
    if (!s.distribution) s.distribution = {};
    const key = String(wordLen);
    if (!s.distribution[key]) s.distribution[key] = Array(ATTEMPTS_BY_LENGTH[wordLen]).fill(0);
    const idx = Math.min(guessCount - 1, s.distribution[key].length - 1);
    s.distribution[key][idx]++;
  } else {
    s.streak = 0;
  }

  saveStats(s);
}

export function renderStats(wordLen, highlightRow = null) {
  const s = loadStats();
  document.getElementById('stat-played').textContent     = s.played || 0;
  document.getElementById('stat-win-pct').textContent    =
    s.played ? Math.round(((s.won || 0) / s.played) * 100) : 0;
  document.getElementById('stat-streak').textContent     = s.streak || 0;
  document.getElementById('stat-max-streak').textContent = s.maxStreak || 0;

  const distKey  = String(wordLen);
  const distArr  = (s.distribution || {})[distKey] ||
                   Array(ATTEMPTS_BY_LENGTH[wordLen] || 6).fill(0);
  const max      = Math.max(...distArr, 1);
  const container = document.getElementById('distribution');
  container.innerHTML = '';

  distArr.forEach((count, i) => {
    const pct = Math.max(Math.round((count / max) * 100), count > 0 ? 8 : 4);
    const row = document.createElement('div');
    row.className = 'dist-row';
    row.innerHTML = `
      <div class="dist-num">${i + 1}</div>
      <div class="dist-bar-wrap">
        <div class="dist-bar ${highlightRow === i + 1 ? 'highlight' : ''}"
             style="width:${pct}%">${count}</div>
      </div>`;
    container.appendChild(row);
  });
}
