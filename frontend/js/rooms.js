import { CONFIG }     from './config.js';
import { getSession } from './storage.js';

export const ROOT_USERNAME = 'ggboy';

const ROOM_STATUS_KEY  = 'wordleRoomStatus';   // { roomId: 'joined' | 'dismissed' }
const POLL_INTERVAL_MS = 10_000;               // 10 s

let _pollTimer = null;
let _onInvite  = null;

// ── Persist which rooms have already been shown ────────────────────────────

function getRoomStatuses() {
  try { return JSON.parse(localStorage.getItem(ROOM_STATUS_KEY) || '{}'); }
  catch { return {}; }
}

export function setRoomStatus(roomId, status) {
  const s = getRoomStatuses();
  s[roomId] = status;
  localStorage.setItem(ROOM_STATUS_KEY, JSON.stringify(s));
}

function isHandled(roomId) {
  return !!getRoomStatuses()[roomId];
}

// ── Polling ────────────────────────────────────────────────────────────────

export function startPolling(onInvite) {
  stopPolling();
  _onInvite = onInvite;
  _tick();
  _pollTimer = setInterval(_tick, POLL_INTERVAL_MS);
}

export function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _onInvite = null;
}

async function _tick() {
  const session = getSession();
  if (!session) return;
  try {
    const res = await fetch(`${CONFIG.API_URL}/invites`, {
      headers: { 'Authorization': `Bearer ${session.token}` }
    });
    if (!res.ok) return;
    const { invites = [] } = await res.json();
    for (const invite of invites) {
      if (!isHandled(invite.id) && _onInvite) {
        _onInvite(invite);
      }
    }
  } catch (_) {}
}

// ── API helpers ────────────────────────────────────────────────────────────

export async function fetchUsers() {
  const session = getSession();
  if (!session) return [];
  const res = await fetch(`${CONFIG.API_URL}/users`, {
    headers: { 'Authorization': `Bearer ${session.token}` }
  });
  return res.ok ? (await res.json()).users || [] : [];
}

export async function createRoom(word, timeLimit, players) {
  const session = getSession();
  if (!session) throw new Error('Please sign in again.');
  const res = await fetch(`${CONFIG.API_URL}/rooms`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.token}`,
    },
    body: JSON.stringify({ word, timeLimit, players }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create room');
  }
  return res.json();
}

export async function joinRoom(roomId) {
  const session = getSession();
  if (!session) return null;
  const res = await fetch(`${CONFIG.API_URL}/rooms/${roomId}/join`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  return res.ok ? res.json() : null;
}

export async function submitRoomResult(roomId, won, guessCount) {
  const session = getSession();
  if (!session) return;
  try {
    await fetch(`${CONFIG.API_URL}/rooms/${roomId}/result`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({ won, guessCount }),
    });
  } catch (_) {}
}
