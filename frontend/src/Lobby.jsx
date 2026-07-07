import { useState, useEffect, useCallback, useRef } from 'react'
import './Lobby.css'
import { apiCreateRoom, apiGetInvites, apiGetLeaderboard, apiGetMyStats, apiGetUsers, apiJoinRoom } from './api'

const INVITE_HANDLED_KEY = 'wordleee_handled_invites'
const POLL_MS            = 10_000

function getHandledInvites() {
  try { return JSON.parse(localStorage.getItem(INVITE_HANDLED_KEY) || '{}') } catch { return {} }
}
function markInviteHandled(roomId) {
  const s = getHandledInvites(); s[roomId] = true
  localStorage.setItem(INVITE_HANDLED_KEY, JSON.stringify(s))
}
function isInviteHandled(roomId) { return !!getHandledInvites()[roomId] }

/* ── static config ── */
const MODES = [
  { len: 3, attempts: 4,  time: '1:30', label: 'Blitz'    },
  { len: 4, attempts: 5,  time: '2:00', label: 'Quick'    },
  { len: 5, attempts: 6,  time: '2:30', label: 'Classic'  },
  { len: 6, attempts: 7,  time: '3:00', label: 'Extended' },
  { len: 7, attempts: 8,  time: '3:30', label: 'Expert'   },
]

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }
const ROOM_TIME_FOR_LEN = { 3: 90, 4: 120, 5: 180, 6: 180, 7: 300 }
const DEFAULT_MAX_PLAYERS = 10

const LB_LENGTH_TABS = [
  { label: 'All',  value: null },
  { label: '3L',   value: 3   },
  { label: '4L',   value: 4   },
  { label: '5L',   value: 5   },
  { label: '6L',   value: 6   },
  { label: '7L',   value: 7   },
]

const LB_SORT_OPTIONS = [
  { label: 'Most Wins',   value: 'wins'      },
  { label: 'Win %',       value: 'win_pct'   },
  { label: 'Best Time',   value: 'best_time' },
  { label: 'Most Played', value: 'played'    },
  { label: 'Best Streak', value: 'streak'    },
]

function fmtTime(seconds) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function getModeByLength(wordLength) {
  return MODES.find(mode => mode.len === wordLength) ?? MODES[2]
}

/* ── CreateRoomModal ── */
function CreateRoomModal({ wordLength, user, onClose, onCreated }) {
  const [letters,   setLetters]   = useState(Array(wordLength).fill(''))
  const [users,     setUsers]     = useState([])
  const [selected,  setSelected]  = useState(new Set())
  const [loading,   setLoading]   = useState(false)
  const [usersLoad, setUsersLoad] = useState(true)
  const [error,     setError]     = useState('')
  const inputRefs = useRef([])

  useEffect(() => {
    setUsersLoad(true)
    apiGetUsers()
      .then(data => setUsers(data.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoad(false))
  }, [])

  // Reset letters when wordLength changes (shouldn't happen inside modal but defensive)
  useEffect(() => {
    setLetters(Array(wordLength).fill(''))
  }, [wordLength])

  const handleLetterKey = (idx, e) => {
    const ch = e.key.toUpperCase()
    if (ch === 'BACKSPACE') {
      if (letters[idx]) {
        const next = [...letters]; next[idx] = ''
        setLetters(next)
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus()
      }
      return
    }
    if (ch === 'ARROWLEFT' && idx > 0) { inputRefs.current[idx - 1]?.focus(); return }
    if (ch === 'ARROWRIGHT' && idx < wordLength - 1) { inputRefs.current[idx + 1]?.focus(); return }
    if (!/^[A-Z]$/.test(ch)) return
    const next = [...letters]; next[idx] = ch
    setLetters(next)
    if (idx < wordLength - 1) inputRefs.current[idx + 1]?.focus()
  }

  const toggleUser = (username) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(username) ? n.delete(username) : n.add(username)
      return n
    })
  }

  const word      = letters.join('')
  const wordReady = word.length === wordLength && /^[A-Z]+$/.test(word)
  const canCreate = wordReady && selected.size > 0 && !loading

  const handleCreate = async () => {
    if (!canCreate) return
    setLoading(true); setError('')
    try {
      const room = await apiCreateRoom({
        name             : `${user?.username ?? 'Admin'}'s ${wordLength}-Letter Room`,
        wordLength,
        timeLimit        : ROOM_TIME_FOR_LEN[wordLength],
        maxPlayers       : Math.max(DEFAULT_MAX_PLAYERS, selected.size + 1),
        word,
        invitedUsernames : [...selected],
      })
      onCreated(room)
    } catch (err) {
      setError(err.message ?? 'Failed to create room.')
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Create Room · {wordLength} Letters</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-section">
          <p className="modal-label">Enter the secret word ({wordLength} letters)</p>
          <div className="word-input-row">
            {letters.map((ch, i) => (
              <input
                key={i}
                ref={el => inputRefs.current[i] = el}
                className={`word-letter-box${ch ? ' filled' : ''}`}
                value={ch}
                readOnly
                onKeyDown={e => handleLetterKey(i, e)}
                onFocus={() => {}}
                tabIndex={0}
                maxLength={1}
                aria-label={`Letter ${i + 1}`}
              />
            ))}
          </div>
          {wordReady && (
            <p className="modal-hint valid">Word set: {word}</p>
          )}
        </div>

        <div className="modal-section">
          <p className="modal-label">
            Challenge players{' '}
            {selected.size > 0 && <span className="selected-count">{selected.size} selected</span>}
          </p>
          {usersLoad ? (
            <p className="modal-hint">Loading players…</p>
          ) : users.length === 0 ? (
            <p className="modal-hint">No other players registered yet.</p>
          ) : (
            <div className="player-list">
              {users.map(u => (
                <label key={u.username} className={`player-row${selected.has(u.username) ? ' picked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(u.username)}
                    onChange={() => toggleUser(u.username)}
                  />
                  <span className="player-avatar">{u.username[0].toUpperCase()}</span>
                  <span className="player-name">{u.username}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="modal-btn-create" onClick={handleCreate} disabled={!canCreate}>
            {loading ? 'Creating…' : `Challenge ${selected.size > 0 ? selected.size : ''} Player${selected.size !== 1 ? 's' : ''} ⚔️`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── InviteToast ── */
function InviteToast({ invite, onDismiss, onJoin }) {
  const [joining, setJoining] = useState(false)

  const handleJoin = async () => {
    setJoining(true)
    try {
      const roomData = await apiJoinRoom(invite.room_id)
      onJoin(roomData)
    } catch (err) {
      setJoining(false)
      alert(err.message ?? 'Failed to join room.')
    }
  }

  return (
    <div className="invite-toast">
      <div className="invite-toast-body">
        <span className="invite-icon">⚔️</span>
        <div className="invite-text">
          <strong>{invite.created_by}</strong> challenged you!
          <span className="invite-meta">
            {invite.room_name} · {invite.word_length}L
          </span>
        </div>
      </div>
      <div className="invite-actions">
        <button className="invite-dismiss" onClick={onDismiss}>Dismiss</button>
        <button className="invite-join" onClick={handleJoin} disabled={joining}>
          {joining ? 'Joining…' : 'Join Game →'}
        </button>
      </div>
    </div>
  )
}

/* ── InvitePoller ── */
function InvitePoller({ user, onJoinRoom }) {
  const [pending, setPending] = useState([])

  const poll = useCallback(() => {
    if (!user) return
    apiGetInvites()
      .then(data => {
        const fresh = (data.invites ?? []).filter(inv => !isInviteHandled(inv.room_id))
        setPending(fresh)
      })
      .catch(() => {})
  }, [user])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  const dismiss = (roomId) => {
    markInviteHandled(roomId)
    setPending(prev => prev.filter(i => i.room_id !== roomId))
  }

  const join = (roomId, roomData) => {
    markInviteHandled(roomId)
    setPending(prev => prev.filter(i => i.room_id !== roomId))
    onJoinRoom(roomData)
  }

  if (!pending.length) return null

  return (
    <div className="invite-stack">
      {pending.map(inv => (
        <InviteToast
          key={inv.room_id}
          invite={inv}
          onDismiss={() => dismiss(inv.room_id)}
          onJoin={roomData => join(inv.room_id, roomData)}
        />
      ))}
    </div>
  )
}

/* ── Lobby ── */
export default function Lobby({ user, onStartGame, onLogout, onJoinRoom }) {
  const [selected,  setSelected]  = useState(5)
  const [lbData,    setLbData]    = useState(null)
  const [myStats,   setMyStats]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [lbLoading, setLbLoading] = useState(false)
  const [lbLen,     setLbLen]     = useState(null)
  const [lbSort,    setLbSort]    = useState('wins')
  const [showModal, setShowModal] = useState(false)
  const [roomMsg,   setRoomMsg]   = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([apiGetLeaderboard(10, null, 'wins'), apiGetMyStats()])
      .then(([lb, stats]) => {
        if (cancelled) return
        setLbData(lb)
        setMyStats(stats)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const fetchLeaderboard = useCallback((len, sort) => {
    setLbLoading(true)
    apiGetLeaderboard(10, len, sort)
      .then(lb => setLbData(lb))
      .catch(() => {})
      .finally(() => setLbLoading(false))
  }, [])

  const handleLbLen = (val) => { setLbLen(val); fetchLeaderboard(val, lbSort) }
  const handleLbSort = (val) => { setLbSort(val); fetchLeaderboard(lbLen, val) }

  const handleRoomCreated = (room) => {
    setShowModal(false)
    const playerCount = room.player_count ?? 0
    setRoomMsg(`Room created! Challenged ${Math.max(0, playerCount - 1)} player(s).`)
    setTimeout(() => setRoomMsg(''), 5000)
  }

  const mode    = getModeByLength(selected)
  const stats   = myStats  ?? { played: 0, won: 0, win_pct: 0, streak: 0 }
  const entries = lbData?.entries ?? []

  return (
    <div className="lobby">
      {/* invite notifications */}
      {onJoinRoom && <InvitePoller user={user} onJoinRoom={onJoinRoom} />}

      {/* create room modal */}
      {showModal && (
        <CreateRoomModal
          wordLength={selected}
          user={user}
          onClose={() => setShowModal(false)}
          onCreated={handleRoomCreated}
        />
      )}

      {/* top bar */}
      <header className="lobby-bar">
        <div className="lobby-logo">
          <span className="lb-logo-w">W</span>
          <span className="lb-logo-text">ORDLEEE</span>
          <span className="lb-logo-tag">ELITE</span>
        </div>
        <div className="lobby-bar-right">
          <div className="lobby-user">
            <div className="lobby-avatar">{(user?.username?.[0] ?? 'G').toUpperCase()}</div>
            <span className="lobby-username">{user?.username ?? 'Guest'}</span>
          </div>
          <button className="lobby-logout" onClick={onLogout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"/>
            </svg>
          </button>
        </div>
      </header>

      {/* main content */}
      <div className="lobby-content">

        {/* ── Left: mode select ── */}
        <div className="lobby-panel mode-panel">
          <p className="lobby-kicker">Select Board</p>
          <h1 className="lobby-heading">Choose<br/>Your Mode</h1>
          <div className="lobby-rule" />

          <div className="mode-grid">
            {MODES.map(m => (
              <button
                key={m.len}
                className={`mode-card${selected === m.len ? ' active' : ''}`}
                onClick={() => setSelected(m.len)}
              >
                <span className="mc-num">{m.len}</span>
                <span className="mc-label">{m.label}</span>
                <span className="mc-sub">{m.attempts} tries · {m.time}</span>
              </button>
            ))}
          </div>

          <div className="mode-summary">
            <span>{selected}-Letter Word</span>
            <span>{mode.attempts} attempts</span>
            <span>{mode.time} timer</span>
          </div>

          <button
            className="lobby-play-btn"
            onClick={() => onStartGame(selected)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"/>
            </svg>
            Play {selected}-Letter
          </button>
        </div>

        {/* ── Right: stats + leaderboard ── */}
        <div className="lobby-right">

          {/* Stats */}
          <div className="lobby-panel stats-panel">
            <p className="lobby-kicker">Your Stats</p>
            <div className="stats-row">
              <div className="stat-cell">
                <span className="stat-val">{loading ? '—' : stats.played}</span>
                <span className="stat-lbl">Played</span>
              </div>
              <div className="stat-cell">
                <span className="stat-val">{loading ? '—' : `${stats.win_pct ?? 0}%`}</span>
                <span className="stat-lbl">Win Rate</span>
              </div>
              <div className="stat-cell">
                <span className="stat-val">{loading ? '—' : stats.streak ?? 0}</span>
                <span className="stat-lbl">🔥 Streak</span>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="lobby-panel lb-panel">
            <div className="lb-header">
              <p className="lobby-kicker" style={{ margin: 0 }}>Leaderboard</p>
              <span className="lb-live">● LIVE</span>
            </div>

            <div className="lb-controls">
              <div className="lb-tabs">
                {LB_LENGTH_TABS.map(tab => (
                  <button
                    key={String(tab.value)}
                    className={`lb-tab${lbLen === tab.value ? ' active' : ''}`}
                    onClick={() => handleLbLen(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <select
                className="lb-sort-select"
                value={lbSort}
                onChange={e => handleLbSort(e.target.value)}
                title="Sort by"
              >
                {LB_SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="lb-col-header">
              <span className="lbh-rank">#</span>
              <span className="lbh-name">Player</span>
              <span className="lbh-wins">W</span>
              <span className="lbh-pct">Win%</span>
              {lbSort === 'best_time' && <span className="lbh-time">Best</span>}
              {lbSort === 'streak'    && <span className="lbh-streak">Streak</span>}
            </div>

            <div className="lb-list">
              {(loading || lbLoading) ? (
                <div className="lb-loading">Loading…</div>
              ) : entries.length === 0 ? (
                <div className="lb-empty">
                  {lbLen ? `No ${lbLen}-letter games yet` : 'No games played yet'}
                </div>
              ) : entries.map(e => (
                <div key={e.rank} className={`lb-row${e.username === user?.username ? ' lb-you' : ''}`}>
                  <span className="lb-rank">
                    {MEDALS[e.rank] ?? <span className="lb-num">{e.rank}</span>}
                  </span>
                  <span className="lb-name">
                    {e.username}
                    {e.username === user?.username && <span className="lb-you-tag"> you</span>}
                  </span>
                  <span className="lb-wins">{e.won}W</span>
                  <span className="lb-pct">{e.win_pct}%</span>
                  {lbSort === 'best_time' && <span className="lb-time">{fmtTime(e.best_time)}</span>}
                  {lbSort === 'streak'    && <span className="lb-streak">{e.max_streak}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Create Room — admin only */}
          {user?.is_admin && (
            <>
              <button
                className="lobby-room-btn"
                onClick={() => setShowModal(true)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M6.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM3.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM19.75 7.5a.75.75 0 0 0-1.5 0v2.25H16a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H22a.75.75 0 0 0 0-1.5h-2.25V7.5Z"/>
                </svg>
                Create Room · Multiplayer
              </button>
              {roomMsg && <div className="lobby-room-note">{roomMsg}</div>}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
