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
import { ROOT_USERNAME, startPolling, fetchUsers,
         createRoom, joinRoom, submitRoomResult,
         setRoomStatus, stopPolling }               from './rooms.js';

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

// ── Room state ─────────────────────────────────────────────────────────────
let activeRoomId      = null;
let activeRoomCreator = null;
let clearInviteState  = () => {};

const ALLOWED_ROOM_TIME_LIMITS = new Set([60, 90, 120, 180, 300]);

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
      closeModal('create-room-modal');
    }
  });
}

// ── Game-over panel ────────────────────────────────────────────────────────
function showEndGamePanel(showWord) {
  const panel    = document.getElementById('game-over-panel');
  if (!panel) return;

  const wordWrap = document.getElementById('game-over-word-wrap');
  const wordEl   = document.getElementById('game-over-word');
  const meta     = document.getElementById('game-over-meta');

  const kb   = document.getElementById('keyboard');
  const hint = document.querySelector('.game-hint');
  if (kb)   kb.classList.add('kb-hidden');
  if (hint) hint.classList.add('hint-hidden');

  // Show panel — remove hidden, force display and opacity via inline style so
  // there is no dependency on CSS animation/transition state
  panel.classList.remove('hidden', 'panel-entering');
  panel.style.display  = 'flex';
  panel.style.opacity  = '1';
  panel.style.bottom   = '24px';

  if (showWord && target) {
    if (wordEl)   wordEl.textContent = target;
    if (wordWrap) wordWrap.classList.remove('hidden');
  } else {
    if (wordWrap) wordWrap.classList.add('hidden');
  }

  if (activeRoomCreator && meta) {
    meta.textContent = `👑 Challenge by ${activeRoomCreator}`;
    meta.classList.remove('hidden');
  } else if (meta) {
    meta.classList.add('hidden');
  }
}

function hideEndGamePanel() {
  const panel = document.getElementById('game-over-panel');
  if (!panel) return;
  panel.style.display = '';
  panel.style.opacity = '';
  panel.style.bottom  = '';
  panel.classList.remove('panel-entering');
  panel.classList.add('hidden');
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

function hideAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => closeModal(overlay.id));
}

function setCreateRoomVisible(isVisible) {
  document.getElementById('create-room-btn').classList.toggle('hidden', !isVisible);
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

async function startRoomGame(roomId, cipheredWord, timeLimit, createdBy) {
  const seconds = Number(timeLimit);
  if (!ALLOWED_ROOM_TIME_LIMITS.has(seconds)) {
    showToast('Invalid room timer.');
    return false;
  }

  wordLen      = 5;
  maxRows      = ATTEMPTS_BY_LENGTH[5];
  currentRow   = 0;
  currentCol   = 0;
  currentGuess = [];
  gameOver     = false;
  target       = '';
  activeRoomId      = roomId;
  activeRoomCreator = createdBy;

  saveChosenLength(5);

  document.getElementById('keyboard').classList.remove('kb-hidden');
  document.querySelector('.game-hint').classList.remove('hint-hidden');

  buildBoard(5, maxRows);
  resetKeyboard();
  hideEndGamePanel();
  hideLengthPicker();
  document.getElementById('main-game').classList.remove('hidden');
  document.getElementById('hint-word-len').textContent = 5;

  if (activeTimer) activeTimer.stop();
  hideTimerUI();

  target = decipherWord(cipheredWord);
  updateActiveTile(0, 0, 5, false);

  activeTimer = new Timer(
    seconds,
    (remaining, total) => updateTimerUI(remaining, total),
    () => onTimeUp()
  );
  activeTimer.start();
  return true;
}

function onTimeUp() {
  if (gameOver) return;
  gameOver = true;
  markGameDone(wordLen);
  showToast(`⏰ Time's up!`, 2000);
  recordResult(false, null, wordLen);
  saveResultToServer(false, null, wordLen);
  if (activeRoomId) submitRoomResult(activeRoomId, false, null);
  updateActiveTile(currentRow, currentCol, wordLen, true);
  setTimeout(() => {
    try { renderStats(wordLen); } catch (_) {}
    showEndGamePanel(true);
  }, 1800);
}

function endGame() {
  if (activeTimer) activeTimer.stop();
  hideTimerUI();
}

function resetSessionUI() {
  stopPolling();
  if (activeTimer) activeTimer.stop();
  activeTimer = null;
  activeRoomId = null;
  activeRoomCreator = null;
  target = '';
  currentRow = 0;
  currentCol = 0;
  currentGuess = [];
  gameOver = true;

  hideTimerUI();
  hideAllModals();
  hideEndGamePanel();
  document.getElementById('length-picker').classList.add('hidden');
  document.getElementById('main-game').classList.add('hidden');
  document.getElementById('invite-popup').classList.add('hidden');
  clearInviteState();
  document.getElementById('keyboard').classList.remove('kb-hidden');
  document.querySelector('.game-hint').classList.remove('hint-hidden');
  setCreateRoomVisible(false);
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
      if (activeRoomId) submitRoomResult(activeRoomId, true, currentRow);
      gameOver = true;
      markGameDone(wordLen);
      endGame();
      updateActiveTile(currentRow, currentCol, wordLen, true);
      setTimeout(() => {
        try { renderStats(wordLen, currentRow); } catch (_) {}
        showEndGamePanel(false);
      }, 2200);
    } else if (currentRow >= maxRows) {
      showToast(`The word was ${target}`, 3000);
      recordResult(false, null, wordLen);
      saveResultToServer(false, null, wordLen);
      if (activeRoomId) submitRoomResult(activeRoomId, false, null);
      gameOver = true;
      markGameDone(wordLen);
      endGame();
      updateActiveTile(currentRow, currentCol, wordLen, true);
      setTimeout(() => {
        try { renderStats(wordLen); } catch (_) {}
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
    activeRoomId = null; activeRoomCreator = null;
    closeModal('stats-modal');
    advanceGame(wordLen);
    startGame(wordLen);
  });

  // End-game: Change Mode (back to length picker)
  document.getElementById('change-mode-btn').addEventListener('click', () => {
    activeRoomId = null; activeRoomCreator = null;
    closeModal('stats-modal');
    advanceGame(wordLen);
    showLengthPicker();
  });

  // Start Game button in picker
  document.getElementById('start-game-btn').addEventListener('click', () => {
    startGame(pickerSelection);
  });

  // ── Room invite popup ────────────────────────────────────────────────────
  const _inviteQueue = [];
  let   _currentInvite = null;

  clearInviteState = () => {
    _inviteQueue.length = 0;
    _currentInvite = null;
  };

  function showNextInvite() {
    if (_inviteQueue.length === 0) { _currentInvite = null; return; }
    _currentInvite = _inviteQueue.shift();
    const m = Math.floor(_currentInvite.timeLimit / 60);
    const s = _currentInvite.timeLimit % 60;
    const ts = s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2,'0')}`;
    document.getElementById('invite-challenger').textContent =
      `${_currentInvite.createdBy} challenged you!`;
    document.getElementById('invite-meta').textContent =
      `${ts} time limit · ${_currentInvite.playerCount} player${_currentInvite.playerCount > 1 ? 's' : ''}`;
    document.getElementById('invite-popup').classList.remove('hidden');
  }

  document.getElementById('invite-dismiss').addEventListener('click', () => {
    if (!_currentInvite) return;
    setRoomStatus(_currentInvite.id, 'dismissed');
    _currentInvite = null;
    document.getElementById('invite-popup').classList.add('hidden');
    showNextInvite();
  });

  document.getElementById('invite-join').addEventListener('click', async () => {
    if (!_currentInvite) return;
    const invite = _currentInvite;
    document.getElementById('invite-popup').classList.add('hidden');
    _currentInvite = null;

    showToast('Joining room…', 1500);
    const roomData = await joinRoom(invite.id);
    if (!roomData) { showToast('Could not join room.'); showNextInvite(); return; }

    const started = await startRoomGame(invite.id, roomData.word, roomData.timeLimit, roomData.createdBy);
    if (started) setRoomStatus(invite.id, 'joined');
    showNextInvite();
  });

  function onInviteReceived(invite) {
    _inviteQueue.push(invite);
    if (!_currentInvite) showNextInvite();
  }

  // ── Create Room modal (ggBoy only) ───────────────────────────────────────
  function setupCreateRoom() {
    document.getElementById('cr-close').addEventListener('click', () =>
      closeModal('create-room-modal'));

    document.getElementById('create-room-btn').addEventListener('click', async () => {
      openModal('create-room-modal');
      const list = document.getElementById('cr-player-list');
      list.textContent = 'Loading players…';
      try {
        const users = await fetchUsers();
        list.innerHTML = '';
        if (!users.length) {
          list.textContent = 'No other players registered yet.';
          return;
        }
        users.forEach(u => {
          const lbl = document.createElement('label');
          lbl.className = 'cr-player-item';
          lbl.innerHTML = `
            <input type="checkbox" class="cr-player-check" value="${u.username}">
            <span>${u.displayName}</span>
            <span class="cr-username">@${u.username}</span>`;
          list.appendChild(lbl);
        });
      } catch (_) {
        list.textContent = 'Failed to load players.';
      }
    });

    document.getElementById('cr-submit').addEventListener('click', async () => {
      const word       = document.getElementById('cr-word').value.trim().toUpperCase();
      const timeLimit  = parseInt(document.getElementById('cr-time').value, 10);
      const checked    = [...document.querySelectorAll('.cr-player-check:checked')]
                          .map(c => c.value);
      const wordErr    = document.getElementById('cr-word-err');
      const playerErr  = document.getElementById('cr-players-err');
      const formErr    = document.getElementById('cr-form-err');

      wordErr.textContent = playerErr.textContent = formErr.textContent = '';

      if (!word || word.length !== 5 || !/^[A-Z]+$/.test(word)) {
        wordErr.textContent = 'Must be exactly 5 letters (A–Z).';
        return;
      }
      if (!checked.length) {
        playerErr.textContent = 'Select at least one player.';
        return;
      }
      if (!ALLOWED_ROOM_TIME_LIMITS.has(timeLimit)) {
        formErr.textContent = 'Choose a valid time limit.';
        return;
      }

      const btn = document.getElementById('cr-submit');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        await createRoom(word, timeLimit, checked);
        closeModal('create-room-modal');
        document.getElementById('cr-word').value = '';
        document.querySelectorAll('.cr-player-check').forEach(c => c.checked = false);
        showToast('Room created! Players have been notified.', 3000);
      } catch (e) {
        formErr.textContent = e.message || 'Failed to create room.';
      } finally {
        btn.disabled = false; btn.textContent = 'Create Room';
      }
    });
  }

  // ── Auth init ────────────────────────────────────────────────────────────
  setupCreateRoom();

  function onUserLoggedIn(user) {
    showGame(user);
    showLengthPicker();
    setCreateRoomVisible(user.username.toLowerCase() === ROOT_USERNAME);
    startPolling(onInviteReceived);
  }

  initAuth(user => onUserLoggedIn(user), resetSessionUI);

  const session = getSession();
  if (session) {
    onUserLoggedIn(session.user);
  } else {
    resetSessionUI();
    showAuth();
  }
}

boot();
