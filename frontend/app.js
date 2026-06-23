// ── State ──────────────────────────────────────────────────────────────────
let TARGET;
const MAX_ROWS = 6;
const WORD_LEN = 5;

let currentRow   = 0;
let currentCol   = 0;
let currentGuess = [];
let gameOver     = false;

// ── DOM helpers ────────────────────────────────────────────────────────────
const getTile = (r, c) => document.getElementById(`r${r}c${c}`);
const getKey  = (k)    => document.querySelector(`[data-key="${k.toLowerCase()}"]`);

function showToast(msg, duration = 1400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ── Game persistence ───────────────────────────────────────────────────────
const GAME_INDEX_KEY = 'wordle_game_index';
const GAME_DONE_KEY  = 'wordle_game_done';

function getGameIndex() {
  const stored = localStorage.getItem(GAME_INDEX_KEY);
  if (stored !== null) return parseInt(stored, 10);
  // Seed with days-since-epoch so the first word isn't always WORDS[0]
  const seed = Math.floor(Date.now() / 86400000);
  localStorage.setItem(GAME_INDEX_KEY, seed);
  return seed;
}

function markGameDone() {
  localStorage.setItem(GAME_DONE_KEY, 'true');
}

function advanceGame() {
  const next = getGameIndex() + 1;
  localStorage.setItem(GAME_INDEX_KEY, next);
  localStorage.removeItem(GAME_DONE_KEY);
}

// ── Stats (localStorage) ───────────────────────────────────────────────────
const STATS_KEY = 'wordle_stats';

function loadStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || JSON.stringify({
    played: 0, won: 0, streak: 0, maxStreak: 0, lastWon: '',
    distribution: [0, 0, 0, 0, 0, 0]
  }));
}

function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function recordResult(won, guessCount) {
  const s       = loadStats();
  const today   = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  s.played++;
  if (won) {
    s.won++;
    s.distribution[guessCount - 1]++;
    s.streak = s.lastWon === yesterday ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.streak, s.maxStreak);
    s.lastWon = today;
  } else {
    s.streak = 0;
  }
  saveStats(s);
}

// ── Stats modal rendering ──────────────────────────────────────────────────
function renderStats(highlightRow = null) {
  const s = loadStats();
  document.getElementById('stat-played').textContent    = s.played;
  document.getElementById('stat-win-pct').textContent   = s.played ? Math.round((s.won / s.played) * 100) : 0;
  document.getElementById('stat-streak').textContent    = s.streak;
  document.getElementById('stat-max-streak').textContent = s.maxStreak;

  const max  = Math.max(...s.distribution, 1);
  const container = document.getElementById('distribution');
  container.innerHTML = '';

  s.distribution.forEach((count, i) => {
    const pct = Math.max(Math.round((count / max) * 100), count > 0 ? 8 : 4);
    const row = document.createElement('div');
    row.className = 'dist-row';
    row.innerHTML = `
      <div class="dist-num">${i + 1}</div>
      <div class="dist-bar-wrap">
        <div class="dist-bar ${highlightRow === i + 1 ? 'highlight' : ''}" style="width:${pct}%">${count}</div>
      </div>`;
    container.appendChild(row);
  });
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.getElementById('help-btn').addEventListener('click',  () => openModal('help-modal'));
document.getElementById('help-close').addEventListener('click', () => closeModal('help-modal'));
document.getElementById('stats-btn').addEventListener('click',  () => {
  renderStats();
  document.getElementById('new-game-btn').classList.toggle('hidden', !gameOver);
  openModal('stats-modal');
});
document.getElementById('stats-close').addEventListener('click', () => closeModal('stats-modal'));
document.getElementById('leaderboard-btn').addEventListener('click', () => {
  openModal('leaderboard-modal');
  loadLeaderboard();
});
document.getElementById('lb-close').addEventListener('click', () => closeModal('leaderboard-modal'));

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal('help-modal');
    closeModal('stats-modal');
    closeModal('leaderboard-modal');
  }
});

// ── Leaderboard ────────────────────────────────────────────────────────────
async function loadLeaderboard() {
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
      const tr = document.createElement('tr');
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

async function saveResultToServer(won, guessCount) {
  const session = getSession();
  if (!session) return;
  try {
    await fetch(`${CONFIG.API_URL}/save-result`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({ won, guessCount })
    });
  } catch (_) { /* silent — local stats still recorded */ }
}

// ── New Game ───────────────────────────────────────────────────────────────
function resetBoard() {
  currentRow   = 0;
  currentCol   = 0;
  currentGuess = [];
  gameOver     = false;

  for (let r = 0; r < MAX_ROWS; r++) {
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = getTile(r, c);
      tile.textContent = '';
      tile.className   = 'tile';
    }
  }

  document.querySelectorAll('.key').forEach(k => {
    const wide = k.dataset.key === 'Enter' || k.dataset.key === 'Backspace';
    delete k.dataset.state;
    k.className = wide ? 'key wide' : 'key';
  });

  updateActiveTile();
}

function startNewGame() {
  closeModal('stats-modal');
  advanceGame();
  TARGET = getWordByIndex(getGameIndex());
  document.getElementById('new-game-btn').classList.add('hidden');
  resetBoard();
}

document.getElementById('new-game-btn').addEventListener('click', startNewGame);

// ── Game input ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (gameOver) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;

  if (e.key === 'Enter')            submitGuess();
  else if (e.key === 'Backspace')   deleteLetter();
  else if (/^[a-zA-Z]$/.test(e.key)) addLetter(e.key.toUpperCase());
});

document.getElementById('keyboard').addEventListener('click', (e) => {
  if (gameOver) return;
  const key = e.target.closest('.key');
  if (!key) return;

  const k = key.dataset.key;
  if (k === 'Enter')        submitGuess();
  else if (k === 'Backspace') deleteLetter();
  else                       addLetter(k.toUpperCase());
});

// ── Active tile & row tracking ─────────────────────────────────────────────
function updateActiveTile() {
  document.querySelectorAll('.tile.active-tile').forEach(t => t.classList.remove('active-tile'));
  document.querySelectorAll('.row.active-row').forEach(r => r.classList.remove('active-row'));
  if (gameOver) return;

  document.getElementById(`row-${currentRow}`).classList.add('active-row');
  if (currentCol < WORD_LEN) {
    getTile(currentRow, currentCol).classList.add('active-tile');
  }
}

// ── Game actions ───────────────────────────────────────────────────────────
function addLetter(letter) {
  if (currentCol >= WORD_LEN) return;
  const tile = getTile(currentRow, currentCol);
  tile.classList.remove('active-tile');
  tile.textContent = letter;
  tile.classList.add('filled');
  currentGuess.push(letter);
  currentCol++;
  updateActiveTile();
}

function deleteLetter() {
  if (currentCol === 0) return;
  currentCol--;
  currentGuess.pop();
  const tile = getTile(currentRow, currentCol);
  tile.textContent = '';
  tile.classList.remove('filled');
  updateActiveTile();
}

function submitGuess() {
  if (currentCol < WORD_LEN) {
    showToast('Not enough letters');
    shakeRow(currentRow);
    return;
  }

  const guess = currentGuess.join('');

  if (!VALID_GUESSES.has(guess.toLowerCase())) {
    showToast('Not in word list');
    shakeRow(currentRow);
    return;
  }

  const result = evaluateGuess(guess, TARGET);
  revealRow(currentRow, guess, result);
}

// ── Evaluation ─────────────────────────────────────────────────────────────
function evaluateGuess(guess, target) {
  const result   = Array(WORD_LEN).fill('absent');
  const tLetters = target.split('');
  const used     = Array(WORD_LEN).fill(false);

  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
      used[i]   = true;
    }
  }

  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === 'correct') continue;
    const idx = tLetters.findIndex((l, j) => !used[j] && l === guess[i]);
    if (idx !== -1) {
      result[i] = 'present';
      used[idx] = true;
    }
  }

  return result;
}

// ── Reveal & animations ────────────────────────────────────────────────────
function revealRow(row, guess, result) {
  const tiles = Array.from({ length: WORD_LEN }, (_, c) => getTile(row, c));

  tiles.forEach((tile, i) => {
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.classList.remove('filled');
        tile.classList.add(result[i]);
      }, 240);
      updateKey(guess[i], result[i]);
    }, i * 110);
  });

  const totalDelay = WORD_LEN * 110 + 480;

  setTimeout(() => {
    const won = result.every(r => r === 'correct');
    currentRow++;
    currentCol   = 0;
    currentGuess = [];

    if (won) {
      const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
      showToast(msgs[currentRow - 1] ?? 'Nice!', 2000);
      bounceRow(row);
      recordResult(true, currentRow);
      saveResultToServer(true, currentRow);
      gameOver = true;
      markGameDone();
      updateActiveTile();
      setTimeout(() => {
        renderStats(currentRow);
        document.getElementById('new-game-btn').classList.remove('hidden');
        openModal('stats-modal');
      }, 2200);
    } else if (currentRow >= MAX_ROWS) {
      showToast(TARGET, 3500);
      recordResult(false, null);
      saveResultToServer(false, null);
      gameOver = true;
      markGameDone();
      updateActiveTile();
      setTimeout(() => {
        renderStats();
        document.getElementById('new-game-btn').classList.remove('hidden');
        openModal('stats-modal');
      }, 2500);
    } else {
      updateActiveTile();
    }
  }, totalDelay);
}

function shakeRow(row) {
  const rowEl = document.getElementById(`row-${row}`);
  rowEl.classList.add('shake');
  rowEl.addEventListener('animationend', () => rowEl.classList.remove('shake'), { once: true });
}

function bounceRow(row) {
  Array.from({ length: WORD_LEN }, (_, c) => getTile(row, c))
    .forEach(tile => tile.classList.add('bounce'));
}

// ── Keyboard coloring ──────────────────────────────────────────────────────
const KEY_PRIORITY = { correct: 3, present: 2, absent: 1 };

function updateKey(letter, state) {
  const key = getKey(letter);
  if (!key) return;
  const current = key.dataset.state;
  if (!current || KEY_PRIORITY[state] > KEY_PRIORITY[current]) {
    key.dataset.state = state;
    key.className = `key${['Enter','Backspace'].includes(letter) ? ' wide' : ''} ${state}`;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
document.getElementById('date-label').textContent = new Date().toLocaleDateString('en-US', {
  month: 'long', day: 'numeric', year: 'numeric'
});

TARGET = getWordByIndex(getGameIndex());
updateActiveTile();

// Block keyboard input while auth overlay is visible
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('auth-overlay').classList.contains('hidden')) {
    e.stopImmediatePropagation();
  }
}, true);
