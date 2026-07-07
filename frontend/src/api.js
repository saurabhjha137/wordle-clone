const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY  = 'wordle_elite_token'
const USER_KEY   = 'wordle_elite_user'
const CIPHER_KEY = [87, 82, 68, 76]

export function getToken()        { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t)       { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken()      { localStorage.removeItem(TOKEN_KEY) }

// Subscribers notified when a 401 clears the session (token expired)
const _authErrorListeners = []
export function onAuthError(fn) { _authErrorListeners.push(fn) }

function authHeaders() {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function request(path, options = {}) {
  const { headers, ...rest } = options
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Token expired or revoked — clear session and notify App to redirect to login
    if (res.status === 401 && headers?.Authorization) {
      clearToken()
      localStorage.removeItem(USER_KEY)
      _authErrorListeners.forEach(fn => fn())
    }
    const detail = data.detail
    // Pydantic v2 returns an array of {loc, msg, type} objects for validation errors
    if (Array.isArray(detail)) {
      const fields = {}
      detail.forEach(err => {
        const field = err.loc?.[err.loc.length - 1]
        if (field) fields[field] = err.msg.replace(/^Value error, /, '')
      })
      if (Object.keys(fields).length) throw { fields }
      throw new Error(detail[0]?.msg ?? `Request failed (${res.status})`)
    }
    if (detail && typeof detail === 'object') throw { fields: detail }
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
  }
  return data
}

/* ── Auth endpoints ─────────────────────────────────────── */

export async function apiRegister({ username, password, email, recoveryAnswer1, recoveryAnswer2 }) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      email     : email || null,
      secret_q1 : 'Recovery phrase 1',
      secret_a1 : recoveryAnswer1,
      secret_q2 : 'Recovery phrase 2',
      secret_a2 : recoveryAnswer2,
    }),
  })
  setToken(data.access_token)
  return { username: data.username, is_admin: data.is_admin ?? false }
}

export async function apiLogin({ username, password }) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setToken(data.access_token)
  return { username: data.username, is_admin: data.is_admin ?? false }
}

export async function apiResetPassword({ username, recoveryAnswer1, recoveryAnswer2, password }) {
  const { reset_token } = await request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      username,
      secret_a1: recoveryAnswer1,
      secret_a2: recoveryAnswer2,
    }),
  })
  await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ reset_token, new_password: password }),
  })
}

/* ── Game endpoints ─────────────────────────────────────── */

export async function apiGetWord(length) {
  const { cipher } = await request(`/api/game/word?length=${length}`, {
    headers: authHeaders(),
  })
  // XOR-decipher client-side — plaintext never travelled over the wire
  return atob(cipher)
    .split('')
    .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ CIPHER_KEY[i % 4]))
    .join('')
    .toUpperCase()
}

export async function apiSubmitGame({ wordLength, guesses, won, timeTaken, roomId = null }) {
  return request('/api/game/submit', {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      word_length : wordLength,
      guesses,
      won,
      time_taken  : timeTaken,
      room_id     : roomId,
    }),
  })
}

/* ── Leaderboard endpoints ──────────────────────────────── */

export async function apiGetLeaderboard(limit = 10, wordLength = null, sortBy = 'wins') {
  const params = new URLSearchParams({ limit, sort_by: sortBy })
  if (wordLength != null) params.set('word_length', wordLength)
  return request(`/api/leaderboard?${params}`, {
    headers: authHeaders(),
  })
}

export async function apiGetMyStats() {
  return request('/api/leaderboard/me', {
    headers: authHeaders(),
  })
}

/* ── Room endpoints ─────────────────────────────────────── */

export async function apiCreateRoom({ name, wordLength, timeLimit, maxPlayers, word, invitedUsernames }) {
  return request('/api/rooms', {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      name,
      word_length        : wordLength,
      time_limit         : timeLimit,
      max_players        : maxPlayers,
      word,
      invited_usernames  : invitedUsernames,
    }),
  })
}

export async function apiGetInvites() {
  return request('/api/rooms/invites', { headers: authHeaders() })
}

export async function apiJoinRoom(roomId) {
  const data = await request(`/api/rooms/${roomId}/join`, {
    method : 'POST',
    headers: authHeaders(),
  })
  // Decipher the word client-side (same XOR key as apiGetWord)
  const word = atob(data.cipher_word)
    .split('')
    .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ CIPHER_KEY[i % 4]))
    .join('')
    .toUpperCase()
  return {
    word,
    timeLimit : data.time_limit,
    wordLength: data.word_length,
    createdBy : data.created_by,
    roomName  : data.room_name,
    roomId    : data.room_id,
  }
}

/* ── Admin endpoints ────────────────────────────────────── */

export async function apiGetUsers() {
  return request('/api/admin/users', { headers: authHeaders() })
}
