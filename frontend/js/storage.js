// ── Keys ───────────────────────────────────────────────────────────────────
const TOKEN_KEY      = 'wordle_token';
const USER_KEY       = 'wordle_user';
const STATS_KEY      = 'wordle_stats';
const LENGTH_KEY     = 'wordle_word_length';

const gameIndexKey = len => `wordle_game_index_${len}`;
const gameDoneKey  = len => `wordle_game_done_${len}`;

// ── Session ────────────────────────────────────────────────────────────────
export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user  = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  return (token && user) ? { token, user } : null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Chosen word length ─────────────────────────────────────────────────────
export function saveChosenLength(len) {
  localStorage.setItem(LENGTH_KEY, len);
}

export function getChosenLength() {
  return parseInt(localStorage.getItem(LENGTH_KEY) || '5', 10);
}

// ── Per-length game index ──────────────────────────────────────────────────
export function getGameIndex(len) {
  const stored = localStorage.getItem(gameIndexKey(len));
  if (stored !== null) return parseInt(stored, 10);
  // Seed from days-since-epoch so the first word isn't always index 0
  const seed = Math.floor(Date.now() / 86400000);
  localStorage.setItem(gameIndexKey(len), seed);
  return seed;
}

export function markGameDone(len) {
  localStorage.setItem(gameDoneKey(len), 'true');
}

export function advanceGame(len) {
  const next = getGameIndex(len) + 1;
  localStorage.setItem(gameIndexKey(len), next);
  localStorage.removeItem(gameDoneKey(len));
}

// ── Stats ──────────────────────────────────────────────────────────────────
export function loadStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || JSON.stringify({
    played: 0, won: 0, streak: 0, maxStreak: 0, lastWon: '',
    distribution: {}   // keyed by wordLength, each is array[maxRows]
  }));
}

export function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}
