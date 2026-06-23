import { ATTEMPTS_BY_LENGTH, TIMER_SECONDS_BY_LENGTH, WORD_LENGTHS, DEFAULT_LENGTH }
       from './constants.js';
import { CONFIG }                                  from './config.js';
import { getGameIndex, markGameDone, advanceGame,
         saveChosenLength, getChosenLength }      from './storage.js';
import { getWordByIndex, VALID_GUESSES_BY_LENGTH } from './words.js';
import { buildBoard, getTile, updateActiveTile }    from './board.js';
import { Timer, updateTimerUI, hideTimerUI }       from './timer.js';
import { evaluateGuess, revealRow,
         resetKeyboard, shakeRow, bounceRow }      from './game.js';
import { recordResult, renderStats }               from './stats.js';
import { saveResultToServer, loadLeaderboard }     from './leaderboard.js';
import { initAuth, showAuth, showGame, getSession } from './auth.js';

// ── Word cipher (XOR + base64) ─────────────────────────────────────────────
const _CIPHER_KEY = [87, 82, 68, 76]; // 'WRDL'
function decipherWord(token) {
  try {
    const raw = atob(token);
    return Array.from(raw, (c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ _CIPHER_KEY[i % _CIPHER_KEY.length])
    ).join('');
  } catch (_) { return ''; }
}

// ── Game state ─────────────────────────────────────────────────────────────
let wordLen      = DEFAULT_LENGTH;
let maxRows      = ATTEMPTS_BY_LENGTH[DEFAULT_LENGTH];
let target       = '';
let currentRow   = 0;
let currentCol   = 0;
let currentGuess = [];
let gameOver     = false;
let activeTimer  = null;

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, duration = 1400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ── Modals ─────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function setupModals() {
  document.getElementById('help-btn').addEventListener('click', () => openModal('help-modal'));
  document.getElementById('help-close').addEventListener('click', () => closeModal('help-modal'));

  document.getElementById('stats-btn').addEventListener('click', () => {
    renderStats(wordLen);
    openModal('stats-modal');
  });
  document.getElementById('stats-close').addEventListener('click', () => closeModal('stats-modal'));

  document.getElementById('leaderboard-btn').addEventListener('click', () => {
    openModal('leaderboard-modal');
    loadLeaderboard();
  });
  document.getElementById('lb-close').addEventListener('click', () => closeModal('leaderboard-modal'));

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('help-modal');
      closeModal('stats-modal');
      closeModal('leaderboard-modal');
    }
  });
}

// ── Game-over panel (on the board, not in a modal) ────────────────────────
function showEndGamePanel(showWord) {
  const panel    = document.getElementById('game-over-panel');
  const wordWrap = document.getElementById('game-over-word-wrap');
  const wordEl   = document.getElementById('game-over-word');

  // Hide keyboard & hint — they're useless after game ends and take up space
  document.getElementById('keyboard').classList.add('kb-hidden');
  document.querySelector('.game-hint').classList.add('hint-hidden');

  // Reset animation so it replays on every game end (not just the first)
  panel.style.animation = 'none';
  panel.classList.remove('hidden');
  panel.offsetHeight; // force reflow — required for animation restart
  panel.style.animation = '';

  if (showWord && target) {
    wordEl.textContent = target;
    wordWrap.classList.remove('hidden');
  } else {
    wordWrap.classList.add('hidden');
  }
}

function hideEndGamePanel() {
  document.getElementById('game-over-panel').classList.add('hidden');
}

// ── Length picker ──────────────────────────────────────────────────────────
let pickerSelection = DEFAULT_LENGTH;

function showLengthPicker() {
  pickerSelection = getChosenLength();
  document.getElementById('length-picker').classList.remove('hidden');
  document.getElementById('main-game').classList.add('hidden');
  hideTimerUI();
  renderPickerOptions();
}

function hideLengthPicker() {
  document.getElementById('length-picker').classList.add('hidden');
  document.getElementById('main-game').classList.remove('hidden');
}

function renderPickerOptions() {
  const container = document.getElementById('picker-options');
  container.innerHTML = '';
  WORD_LENGTHS.forEach(len => {
    const btn = document.createElement('button');
    btn.className = `picker-opt${len === pickerSelection ? ' active' : ''}`;
    btn.dataset.len = len;
    const secs = TIMER_SECONDS_BY_LENGTH[len];
    const m = Math.floor(secs / 60), s = secs % 60;
    const timeStr = s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
    btn.innerHTML = `
      <span class="picker-len">${len}</span>
      <span class="picker-detail">${ATTEMPTS_BY_LENGTH[len]} attempts</span>
      <span class="picker-detail">${timeStr} min</span>`;
    btn.addEventListener('click', () => {
      pickerSelection = len;
      container.querySelectorAll('.picker-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    container.appendChild(btn);
  });
}

// ── Game flow ──────────────────────────────────────────────────────────────
async function startGame(len) {
  wordLen      = len;
  maxRows      = ATTEMPTS_BY_LENGTH[len];
  currentRow   = 0;
  currentCol   = 0;
  currentGuess = [];
  gameOver     = false;
  target       = '';

  saveChosenLength(len);

  // Restore keyboard & hint (hidden during game-over)
  document.getElementById('keyboard').classList.remove('kb-hidden');
  document.querySelector('.game-hint').classList.remove('hint-hidden');

  buildBoard(wordLen, maxRows);
  resetKeyboard();
  hideEndGamePanel();
  hideLengthPicker();
  document.getElementById('hint-word-len').textContent = len;

  // Stop any running timer while fetching the word
  if (activeTimer) activeTimer.stop();
  hideTimerUI();

  // Fetch word from backend; fall back to client-side on any error
  try {
    const res = await fetch(`${CONFIG.API_URL}/word?length=${len}`);
    if (res.ok) {
      const data = await res.json();
      target = decipherWord(data.word || '');
    }
  } catch (_) {}

  if (!target) {
    target = getWordByIndex(getGameIndex(len), len);
  }

  updateActiveTile(currentRow, currentCol, wordLen, gameOver);

  // Start timer
  const seconds = TIMER_SECONDS_BY_LENGTH[len];
  activeTimer = new Timer(
    seconds,
    (remaining, total) => updateTimerUI(remaining, total),
    () => onTimeUp()
  );
  activeTimer.start();
}

function onTimeUp() {
  if (gameOver) return;
  gameOver = true;
  markGameDone(wordLen);
  showToast(`⏰ Time's up!`, 2000);
  recordResult(false, null, wordLen);
  saveResultToServer(false, null, wordLen);
  updateActiveTile(currentRow, currentCol, wordLen, true);
  setTimeout(() => {
    renderStats(wordLen);
    showEndGamePanel(true);
  }, 1800);
}

function endGame() {
  if (activeTimer) activeTimer.stop();
  hideTimerUI();
}

// ── Input handlers ─────────────────────────────────────────────────────────
function addLetter(letter) {
  if (currentCol >= wordLen) return;
  const tile = getTile(currentRow, currentCol);
  tile.classList.remove('active-tile');
  tile.textContent = letter;
  tile.classList.add('filled');
  currentGuess.push(letter);
  currentCol++;
  updateActiveTile(currentRow, currentCol, wordLen, gameOver);
}

function deleteLetter() {
  if (currentCol === 0) return;
  currentCol--;
  currentGuess.pop();
  const tile = getTile(currentRow, currentCol);
  tile.textContent = '';
  tile.classList.remove('filled');
  updateActiveTile(currentRow, currentCol, wordLen, gameOver);
}

function submitGuess() {
  if (!target) { showToast('Loading word…'); return; }
  if (currentCol < wordLen) {
    showToast('Not enough letters');
    shakeRow(currentRow);
    return;
  }

  const guess = currentGuess.join('');
  const valid = VALID_GUESSES_BY_LENGTH[wordLen];
  if (!valid.has(guess.toLowerCase())) {
    showToast('Not in word list');
    shakeRow(currentRow);
    return;
  }

  const result = evaluateGuess(guess, target);
  const row    = currentRow;

  revealRow(row, guess, result, wordLen, () => {
    const won = result.every(r => r === 'correct');
    currentRow++;
    currentCol   = 0;
    currentGuess = [];

    if (won) {
      const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!', 'Lucky!', 'Wow!'];
      showToast(msgs[currentRow - 1] ?? 'Nice!', 2000);
      bounceRow(row, wordLen);
      recordResult(true, currentRow, wordLen);
      saveResultToServer(true, currentRow, wordLen);
      gameOver = true;
      markGameDone(wordLen);
      endGame();
      updateActiveTile(currentRow, currentCol, wordLen, true);
      setTimeout(() => {
        renderStats(wordLen, currentRow);
        showEndGamePanel(false);
      }, 2200);
    } else if (currentRow >= maxRows) {
      showToast(`The word was ${target}`, 3000);
      recordResult(false, null, wordLen);
      saveResultToServer(false, null, wordLen);
      gameOver = true;
      markGameDone(wordLen);
      endGame();
      updateActiveTile(currentRow, currentCol, wordLen, true);
      setTimeout(() => {
        renderStats(wordLen);
        showEndGamePanel(true);
      }, 2500);
    } else {
      updateActiveTile(currentRow, currentCol, wordLen, false);
    }
  });
}

function setupInput() {
  // Block game keys when auth or picker is visible
  document.addEventListener('keydown', e => {
    if (!document.getElementById('auth-overlay').classList.contains('hidden')) {
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (gameOver) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (document.querySelector('.modal-overlay:not(.hidden)')) return;
    if (!document.getElementById('length-picker').classList.contains('hidden')) return;

    if (e.key === 'Enter')              submitGuess();
    else if (e.key === 'Backspace')     deleteLetter();
    else if (/^[a-zA-Z]$/.test(e.key)) addLetter(e.key.toUpperCase());
  });

  document.getElementById('keyboard').addEventListener('click', e => {
    if (gameOver) return;
    const key = e.target.closest('.key');
    if (!key) return;
    const k = key.dataset.key;
    if (k === 'Enter')          submitGuess();
    else if (k === 'Backspace') deleteLetter();
    else                        addLetter(k.toUpperCase());
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
function boot() {
  document.getElementById('date-label').textContent =
    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  setupModals();
  setupInput();

  // End-game: Play Again (same length, next word)
  document.getElementById('play-again-btn').addEventListener('click', () => {
    closeModal('stats-modal');
    advanceGame(wordLen);
    startGame(wordLen);
  });

  // End-game: Change Mode (back to length picker)
  document.getElementById('change-mode-btn').addEventListener('click', () => {
    closeModal('stats-modal');
    advanceGame(wordLen);
    showLengthPicker();
  });

  // Start Game button in picker
  document.getElementById('start-game-btn').addEventListener('click', () => {
    startGame(pickerSelection);
  });

  // Auth init
  initAuth(user => {
    showGame(user);
    showLengthPicker();
  });

  // Check existing session
  const session = getSession();
  if (session) {
    showGame(session.user);
    showLengthPicker();
  } else {
    showAuth();
  }
}

boot();
