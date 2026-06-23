import { CONFIG } from './config.js';
import { getSession } from './storage.js';

export async function saveResultToServer(won, guessCount, wordLen) {
  const session = getSession();
  if (!session) return;
  try {
    await fetch(`${CONFIG.API_URL}/save-result`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({ won, guessCount, wordLength: wordLen })
    });
  } catch (_) { /* silent — local stats still recorded */ }
}

export async function loadLeaderboard() {
  const loading = document.getElementById('lb-loading');
  const empty   = document.getElementById('lb-empty');
  const error   = document.getElementById('lb-error');
  const table   = document.getElementById('lb-table');
  const body    = document.getElementById('lb-body');

  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  error.classList.add('hidden');
  table.classList.add('hidden');

  try {
    const res  = await fetch(`${CONFIG.API_URL}/leaderboard`);
    const data = await res.json();
    const rows = data.leaderboard || [];

    loading.classList.add('hidden');

    if (rows.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    body.innerHTML = '';
    rows.forEach((p, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const medal     = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const tr        = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="lb-rank ${rankClass}">${medal}</span></td>
        <td class="lb-player">${p.username}</td>
        <td class="lb-wins">${p.won}</td>
        <td>${p.winPct}%</td>
        <td>${p.streak}</td>
        <td>${p.maxStreak}</td>`;
      body.appendChild(tr);
    });
    table.classList.remove('hidden');
  } catch (_) {
    loading.classList.add('hidden');
    error.classList.remove('hidden');
  }
}
