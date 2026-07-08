import { useState, useEffect, useCallback, useRef } from 'react'
import './Lobby.css'
import {
  apiCancelRoom, apiCreateRoom, apiDeleteRoom, apiGetAchievements, apiGetHistory,
  apiGetInvites, apiGetLeaderboard, apiGetMyStats, apiGetRoom,
  apiGetUsers, apiJoinRoom, apiListRooms, apiStartRoom, apiValidateWord,
} from './api'

const BACKGROUND_OPTIONS = [
  { id: 'techfest',   label: 'Techfest'   },
  { id: 'hyperspace', label: 'Hyperspace' },
  { id: 'warp',       label: 'Warp Gate'  },
  { id: 'cognizance', label: 'Cognizance' },
]

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
  { len: 3, attempts: 4,  secs: 90,  time: '1:30', label: 'Blitz'    },
  { len: 4, attempts: 5,  secs: 120, time: '2:00', label: 'Quick'    },
  { len: 5, attempts: 6,  secs: 150, time: '2:30', label: 'Classic'  },
  { len: 6, attempts: 7,  secs: 180, time: '3:00', label: 'Extended' },
  { len: 7, attempts: 8,  secs: 210, time: '3:30', label: 'Expert'   },
]

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }
// Derived from MODES — single source of truth for all timing
const ROOM_TIME_FOR_LEN = Object.fromEntries(MODES.map(m => [m.len, m.secs]))
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
  const [len,          setLen]          = useState(wordLength)
  const [letters,      setLetters]      = useState(Array(wordLength).fill(''))
  const [users,        setUsers]        = useState([])
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [loading,      setLoading]      = useState(false)
  const [usersLoad,    setUsersLoad]    = useState(true)
  const [error,        setError]        = useState('')
  const [wordValid,    setWordValid]    = useState(null)   // null | true | false
  const [wordChecking, setWordChecking] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    setUsersLoad(true)
    apiGetUsers()
      .then(data => setUsers(data.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoad(false))
  }, [])

  useEffect(() => {
    setLetters(Array(len).fill(''))
    setWordValid(null)
    inputRefs.current = []
  }, [len])

  /* Validate the secret word against the dictionary when it's complete */
  const word = letters.join('')
  useEffect(() => {
    if (word.length !== len || !/^[A-Z]+$/.test(word)) { setWordValid(null); return }
    let cancelled = false
    setWordChecking(true)
    setWordValid(null)
    apiValidateWord(word)
      .then(data  => { if (!cancelled) setWordValid(!!data.valid) })
      .catch(()   => { if (!cancelled) setWordValid(null) })
      .finally(() => { if (!cancelled) setWordChecking(false) })
    return () => { cancelled = true }
  }, [word, len])

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
    if (ch === 'ARROWLEFT'  && idx > 0)       { inputRefs.current[idx - 1]?.focus(); return }
    if (ch === 'ARROWRIGHT' && idx < len - 1)  { inputRefs.current[idx + 1]?.focus(); return }
    if (!/^[A-Z]$/.test(ch)) return
    const next = [...letters]; next[idx] = ch
    setLetters(next)
    if (idx < len - 1) inputRefs.current[idx + 1]?.focus()
  }

  const toggleUser = (username) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(username)) { n.delete(username) } else { n.add(username) }
      return n
    })
  }

  const wordReady    = word.length === len && /^[A-Z]+$/.test(word)
  const canCreate    = wordReady && wordValid === true && selected.size > 0 && !loading
  const searchLower  = search.trim().toLowerCase()
  const visibleUsers = searchLower
    ? users.filter(u => u.username.toLowerCase().includes(searchLower))
    : users

  const handleCreate = async () => {
    if (!canCreate) return
    setLoading(true); setError('')
    try {
      const room = await apiCreateRoom({
        name             : `${user?.username ?? 'Admin'}'s ${len}-Letter Room`,
        wordLength       : len,
        timeLimit        : ROOM_TIME_FOR_LEN[len],
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

  const modeInfo = getModeByLength(len)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Create Room</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Word length picker */}
        <div className="modal-section">
          <p className="modal-label">Word Length</p>
          <div className="modal-len-pills">
            {MODES.map(m => (
              <button
                key={m.len}
                className={`modal-len-pill${len === m.len ? ' active' : ''}`}
                onClick={() => setLen(m.len)}
                type="button"
              >
                <span className="mlp-num">{m.len}</span>
                <span className="mlp-lbl">{m.label}</span>
              </button>
            ))}
          </div>
          <p className="modal-meta">{modeInfo.attempts} attempts · {modeInfo.time} time limit</p>
        </div>

        {/* Secret word input */}
        <div className="modal-section">
          <p className="modal-label">Secret word <span className="modal-label-dim">({len} letters)</span></p>
          <div className="word-input-row">
            {letters.map((ch, i) => (
              <input
                key={`${len}-${i}`}
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
          {wordReady && wordChecking && (
            <p className="modal-hint">Checking dictionary…</p>
          )}
          {wordReady && !wordChecking && wordValid === true && (
            <p className="modal-hint valid">✓ "{word}" is in the dictionary</p>
          )}
          {wordReady && !wordChecking && wordValid === false && (
            <p className="modal-hint invalid">✗ "{word}" is not in the dictionary — enter a different word</p>
          )}
        </div>

        {/* Player selection + search */}
        <div className="modal-section">
          <p className="modal-label">
            Challenge players{' '}
            {selected.size > 0 && <span className="selected-count">{selected.size} selected</span>}
          </p>
          <div className="modal-search-row">
            <svg className="modal-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="modal-search-input"
              type="text"
              placeholder="Search players…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {search && (
              <button className="modal-search-clear" onClick={() => setSearch('')} type="button" aria-label="Clear search">✕</button>
            )}
          </div>
          {usersLoad ? (
            <p className="modal-hint">Loading players…</p>
          ) : users.length === 0 ? (
            <p className="modal-hint">No other players registered yet.</p>
          ) : visibleUsers.length === 0 ? (
            <p className="modal-hint">No players match "{search}"</p>
          ) : (
            <div className="player-list">
              {visibleUsers.map(u => (
                <label key={u.username} className={`player-row${selected.has(u.username) ? ' picked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(u.username)}
                    onChange={() => toggleUser(u.username)}
                  />
                  <span className="player-avatar">{u.username[0].toUpperCase()}</span>
                  <span className="player-name">{u.username}</span>
                  {selected.has(u.username) && <span className="player-check">✓</span>}
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

/* ── RoomCard ── */
const PART_ICON = { invited: '✉', joined: '⏳', won: '✅', lost: '❌' }
const STATUS_CHIP_CLS = {
  waiting:   'chip-waiting',
  active:    'chip-active',
  finished:  'chip-finished',
  cancelled: 'chip-cancelled',
}
const STATUS_LABEL = { waiting: 'Waiting', active: 'Active', finished: 'Finished', cancelled: 'Cancelled' }

function sortRoomParticipants(room) {
  const participants = [...(room.participants ?? [])]
  if (room.status !== 'finished') return participants
  return participants.sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
    if (scoreDiff) return scoreDiff
    const hintDiff = (a.hints_used ?? 0) - (b.hints_used ?? 0)
    if (hintDiff) return hintDiff
    const guessDiff = (a.guesses ?? 99) - (b.guesses ?? 99)
    if (guessDiff) return guessDiff
    return (a.time_taken ?? 9999) - (b.time_taken ?? 9999)
  })
}

function RoomCard({ room, user, onStart, onCancel, onPlay, onJoinPanel, onDelete, actionKey }) {
  const myPart    = room.participants?.find(p => p.username === user?.username)
  const isMine    = room.created_by === user?.username || user?.is_admin
  const isCreator = room.created_by === user?.username
  const chipCls   = STATUS_CHIP_CLS[room.status] ?? ''
  const chipLbl   = STATUS_LABEL[room.status]    ?? room.status
  const hasJoined = room.participants?.some(p => p.status === 'joined')

  const canStart  = isMine && room.status === 'waiting' && hasJoined
  const canCancel = isMine && room.status === 'waiting'
  const canPlay   = myPart?.status === 'joined' && room.status === 'active'
  const canJoin   = myPart?.status === 'invited' && room.status === 'waiting'
  const participants = sortRoomParticipants(room)

  const busy = (key) => actionKey === room.id + '_' + key

  return (
    <div className={`room-card room-card-${room.status}`}>
      <div className="room-card-header">
        <span className="room-card-name">{room.name}</span>
        <span className={`room-status-chip ${chipCls}`}>{chipLbl}</span>
      </div>

      <div className="room-card-meta">
        ⚔️ {room.word_length}L · {fmtTime(room.time_limit)} · by {room.created_by}
        {room.participants?.length > 0 && (
          <span className="room-card-count"> · {room.participants.length} player{room.participants.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {participants.length > 0 && (
        <div className="room-card-parts">
          {participants.map((p, idx) => (
            <span key={p.username} className={`room-part room-part-${p.status}`}>
              {room.status === 'finished' && p.status !== 'invited' && (
                <span className="room-rank">#{idx + 1}</span>
              )}
              {PART_ICON[p.status] ?? '•'} {p.username}
              {(p.status === 'won' || p.status === 'lost') && (
                <span className="room-part-result">
                  {p.guesses != null && <span>{p.guesses}g</span>}
                  {p.time_taken != null && <span>{fmtTime(p.time_taken)}</span>}
                  <span>{p.hints_used ?? 0}h</span>
                  <span>{p.score ?? 0}pts</span>
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {(canJoin || canPlay || canStart || canCancel || isCreator) && (
        <div className="room-card-actions">
          {canJoin   && (
            <button className="rca-btn rca-join" onClick={() => onJoinPanel(room.id)} disabled={busy('join')}>
              {busy('join') ? 'Joining…' : 'Join →'}
            </button>
          )}
          {canPlay   && (
            <button className="rca-btn rca-play" onClick={() => onPlay(room.id)} disabled={busy('play')}>
              {busy('play') ? 'Loading…' : '▶ Play'}
            </button>
          )}
          {canStart  && (
            <button className="rca-btn rca-start" onClick={() => onStart(room.id)} disabled={busy('start')}>
              {busy('start') ? 'Starting…' : '▶ Start Room'}
            </button>
          )}
          {canCancel && (
            <button className="rca-btn rca-cancel" onClick={() => onCancel(room.id)} disabled={busy('cancel')}>
              {busy('cancel') ? '…' : 'Cancel'}
            </button>
          )}
          {isCreator && (
            <button
              className="rca-btn rca-delete"
              onClick={() => onDelete(room.id)}
              disabled={busy('delete')}
              title="Hard-delete this room (admin)"
            >
              {busy('delete') ? '…' : '🗑'}
            </button>
          )}
        </div>
      )}

      {/* Waiting hint for joined participants */}
      {myPart?.status === 'joined' && room.status === 'waiting' && (
        <p className="room-waiting-hint">⏳ Waiting for the admin to start</p>
      )}
      {/* Already submitted hint */}
      {myPart?.status === 'won'  && room.status === 'active'   && (
        <p className="room-waiting-hint">✅ Result submitted — waiting for others</p>
      )}
      {myPart?.status === 'lost' && room.status === 'active'   && (
        <p className="room-waiting-hint">❌ Result submitted — waiting for others</p>
      )}
    </div>
  )
}

/* ── InviteToast ── */
function InviteToast({ invite, onDismiss, onJoin }) {
  const [joining,    setJoining]    = useState(false)
  const [joinedMsg,  setJoinedMsg]  = useState('')

  const handleJoin = async () => {
    setJoining(true)
    try {
      const roomData = await apiJoinRoom(invite.room_id)
      if (roomData.word) {
        onJoin(roomData)  // active room — navigate to game
      } else {
        // waiting room — show brief confirmation then dismiss
        setJoinedMsg('Joined! Waiting for the admin to start the room.')
        setTimeout(() => onJoin(roomData), 3500)
      }
    } catch (err) {
      setJoining(false)
      alert(err.message ?? 'Failed to join room.')
    }
  }

  if (joinedMsg) {
    return (
      <div className="invite-toast invite-toast-joined">
        <div className="invite-toast-body">
          <span className="invite-icon">✅</span>
          <div className="invite-text">{joinedMsg}</div>
        </div>
      </div>
    )
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

function fmtDate(iso) {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

/* ── Lobby ── */
export default function Lobby({ user, onStartGame, onLogout, onJoinRoom, theme, onThemeCycle, background, onBgChange }) {
  const [selected,      setSelected]      = useState(5)
  const [gameMode,      setGameMode]      = useState('ranked')
  const [histOpen,      setHistOpen]      = useState(false)
  const [achOpen,       setAchOpen]       = useState(false)
  const [lbData,        setLbData]        = useState(null)
  const [myStats,       setMyStats]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [lbLoading,     setLbLoading]     = useState(false)
  const [lbLen,         setLbLen]         = useState(null)
  const [lbSort,        setLbSort]        = useState('wins')
  const [showModal,     setShowModal]     = useState(false)
  const [roomMsg,       setRoomMsg]       = useState('')
  const [activePanel,   setActivePanel]   = useState(null)
  const [history,       setHistory]       = useState(null)
  const [achievements,  setAchievements]  = useState(null)
  const [rooms,         setRooms]         = useState(null)
  const [panelLoading,  setPanelLoading]  = useState(false)
  const [roomErr,       setRoomErr]       = useState('')
  const [roomActionKey, setRoomActionKey] = useState('')
  const [bgOpen,        setBgOpen]        = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiGetLeaderboard(5, null, 'wins'),
      apiGetMyStats(),
      apiGetHistory(10),
      apiGetAchievements(),
    ])
      .then(([lb, stats, hist, ach]) => {
        if (cancelled) return
        setLbData(lb)
        setMyStats(stats)
        setHistory(hist.entries ?? [])
        setAchievements(ach.entries ?? [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /* Silent background refresh for the rooms panel */
  const refreshRooms = useCallback(() => {
    apiListRooms()
      .then(data => setRooms(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (activePanel !== 'rooms') return
    const id = setInterval(refreshRooms, POLL_MS)
    return () => clearInterval(id)
  }, [activePanel, refreshRooms])

  const openPanel = useCallback((key) => {
    if (activePanel === key) { setActivePanel(null); return }
    setActivePanel(key)
    setRoomErr('')
    setPanelLoading(true)

    const doFetch = () => {
      if (key === 'rooms') return apiListRooms().then(d => setRooms(Array.isArray(d) ? d : []))
      return Promise.resolve()
    }
    doFetch()
      .catch(() => { if (key === 'rooms') setRooms([]) })
      .finally(() => setPanelLoading(false))
  }, [activePanel])

  const fetchLeaderboard = useCallback((len, sort) => {
    setLbLoading(true)
    apiGetLeaderboard(5, len, sort)
      .then(lb => setLbData(lb))
      .catch(() => {})
      .finally(() => setLbLoading(false))
  }, [])

  const handleLbLen  = (val) => { setLbLen(val);  fetchLeaderboard(val, lbSort) }
  const handleLbSort = (val) => { setLbSort(val); fetchLeaderboard(lbLen, val) }

  const handleRoomCreated = (room) => {
    setShowModal(false)
    setRoomMsg(`Room created! Invited ${room.participants?.length ?? 0} player(s). Open ⚔️ Rooms to start.`)
    setTimeout(() => setRoomMsg(''), 6000)
    // Open rooms panel so admin can see their new room
    if (activePanel !== 'rooms') openPanel('rooms')
    else refreshRooms()
  }

  /* ── Room panel actions ── */
  const handleStartRoom = async (roomId) => {
    setRoomErr('')
    setRoomActionKey(roomId + '_start')
    try {
      await apiStartRoom(roomId)
      refreshRooms()
    } catch (err) {
      setRoomErr(err.message ?? 'Failed to start room.')
    } finally {
      setRoomActionKey('')
    }
  }

  const handleCancelRoom = async (roomId) => {
    setRoomErr('')
    setRoomActionKey(roomId + '_cancel')
    try {
      await apiCancelRoom(roomId)
      refreshRooms()
    } catch (err) {
      setRoomErr(err.message ?? 'Failed to cancel room.')
    } finally {
      setRoomActionKey('')
    }
  }

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Permanently delete this room and all its data? This cannot be undone.')) return
    setRoomErr('')
    setRoomActionKey(roomId + '_delete')
    try {
      await apiDeleteRoom(roomId)
      refreshRooms()
    } catch (err) {
      setRoomErr(err.message ?? 'Failed to delete room.')
    } finally {
      setRoomActionKey('')
    }
  }

  const handlePlayRoom = async (roomId) => {
    setRoomErr('')
    setRoomActionKey(roomId + '_play')
    try {
      const room = await apiGetRoom(roomId)
      if (!room.word) {
        setRoomErr('Room is not active yet.')
        setRoomActionKey('')
        return
      }
      onJoinRoom({
        word      : room.word,
        status    : room.status,
        timeLimit : room.time_limit,
        wordLength: room.word_length,
        createdBy : room.created_by,
        roomName  : room.name,
        roomId    : room.id,
      })
    } catch (err) {
      setRoomErr(err.message ?? 'Failed to load room.')
      setRoomActionKey('')
    }
  }

  const handleJoinInPanel = async (roomId) => {
    setRoomErr('')
    setRoomActionKey(roomId + '_join')
    try {
      const roomData = await apiJoinRoom(roomId)
      markInviteHandled(roomId)
      if (roomData.word) {
        onJoinRoom(roomData)
      } else {
        refreshRooms()
        setRoomActionKey('')
      }
    } catch (err) {
      setRoomErr(err.message ?? 'Failed to join room.')
      setRoomActionKey('')
    }
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

        <div className="lobby-bar-center">
          <div className="nav-action-group">
            <button
              className="nav-ag-btn nav-ag-daily"
              onClick={() => onStartGame({ wordLength: selected, mode: 'ranked', isDaily: true })}
              title={`Daily ${selected}-letter challenge`}
            >
              <span className="nav-btn-icon">📅</span>
              <span className="nav-btn-text">Daily · {selected}L</span>
            </button>
            {user?.is_admin && (
              <>
                <div className="nav-ag-sep" />
                <button
                  className="nav-ag-btn nav-ag-create"
                  onClick={() => setShowModal(true)}
                  title="Create multiplayer room"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                    <path d="M19.75 7.5a.75.75 0 0 0-1.5 0v2.25H16a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H22a.75.75 0 0 0 0-1.5h-2.25V7.5Z"/>
                    <path d="M6.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM3.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122Z"/>
                  </svg>
                  <span className="nav-btn-text">Create Room</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="lobby-bar-right">
          {/* Theme + Background controls */}
          {onThemeCycle && (
            <button className="lobby-nav-ctrl" onClick={onThemeCycle} title={`Theme: ${theme} (click to cycle)`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75 9.75 9.75 0 0 1 8.25 6 9.77 9.77 0 0 1 9 2.252a9.75 9.75 0 0 0-6.75 9.5c0 5.385 4.365 9.75 9.75 9.75a9.75 9.75 0 0 0 9.752-6.5Z"/>
              </svg>
            </button>
          )}
          {onBgChange && (
            <div className="lobby-bg-ctrl">
              <button className="lobby-nav-ctrl" onClick={() => setBgOpen(v => !v)} title="Change background">
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Z"/>
                  <path stroke="#000" strokeWidth=".5" d="m5.5 16.5 4.1-4.1a1 1 0 0 1 1.4 0l2.1 2.1.9-.9a1 1 0 0 1 1.4 0l3.1 3.1"/>
                  <circle cx="15.75" cy="8.25" r=".75" fill="#000"/>
                </svg>
              </button>
              {bgOpen && (
                <div className="lobby-bg-menu">
                  {BACKGROUND_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`lobby-bg-opt${background === opt.id ? ' active' : ''}`}
                      onClick={() => { onBgChange(opt.id); setBgOpen(false) }}
                    >{opt.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="nav-divider" />

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

        {/* ── Left column: mode select + rooms ── */}
        <div className="lobby-left">
        <div className="lobby-panel mode-panel">
          <p className="lobby-kicker">Word Length</p>

          <div className="len-pills">
            {MODES.map(m => (
              <button
                key={m.len}
                className={`len-pill${selected === m.len ? ' active' : ''}`}
                onClick={() => setSelected(m.len)}
              >
                <span className="len-pill-num">{m.len}</span>
                <span className="len-pill-lbl">{m.label}</span>
              </button>
            ))}
          </div>

          <p className="len-meta">{mode.attempts} attempts · {mode.time} limit</p>

          <div className="lobby-rule" />

          <div className="mode-toggle-row">
            <button
              className={`mode-toggle-btn${gameMode === 'ranked' ? ' active' : ''}`}
              onClick={() => setGameMode('ranked')}
            >🏆 Ranked</button>
            <button
              className={`mode-toggle-btn${gameMode === 'practice' ? ' active' : ''}`}
              onClick={() => setGameMode('practice')}
            >🧪 Practice</button>
          </div>
          {gameMode === 'practice' && (
            <p className="mode-toggle-hint">Practice — doesn&apos;t affect stats or leaderboard.</p>
          )}

          <button
            className="lobby-play-btn"
            onClick={() => onStartGame({ wordLength: selected, mode: gameMode, isDaily: false })}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"/>
            </svg>
            Play {selected}-Letter {gameMode === 'practice' ? '· Practice' : ''}
          </button>
        </div>

          {/* Rooms panel — below word length */}
          <div className="lobby-panel extra-panel">
            <div className="extra-panel-tabs">
              <button
                className={`extra-tab${activePanel === 'rooms' ? ' active' : ''}`}
                onClick={() => openPanel('rooms')}
              >
                ⚔️ Rooms
                {rooms != null && rooms.filter(r => r.status === 'waiting' || r.status === 'active').length > 0 && (
                  <span className="rooms-dot" />
                )}
              </button>
            </div>

            {activePanel === 'rooms' && (
              <div className="extra-panel-body">
                {roomErr && <p className="room-panel-err">{roomErr}</p>}
                {panelLoading ? (
                  <p className="extra-empty">Loading…</p>
                ) : !rooms?.length ? (
                  <p className="extra-empty">
                    No rooms yet.{user?.is_admin ? ' Create one above!' : ' Wait for an invite.'}
                  </p>
                ) : rooms.map(room => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    user={user}
                    onStart={handleStartRoom}
                    onCancel={handleCancelRoom}
                    onPlay={handlePlayRoom}
                    onJoinPanel={handleJoinInPanel}
                    onDelete={handleDeleteRoom}
                    actionKey={roomActionKey}
                  />
                ))}
              </div>
            )}
          </div>

        </div>{/* end lobby-left */}

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

            {/* Recent Games — collapsible */}
            <div className="stats-subsection">
              <button className="stats-sub-toggle" onClick={() => setHistOpen(v => !v)}>
                <span className="stats-sub-toggle-label">📋 Recent Games</span>
                <span className="stats-sub-count">{history?.length ?? 0}</span>
                <span className="stats-sub-arrow">{histOpen ? '▴' : '▾'}</span>
              </button>
              {histOpen && (
                <div className="stats-sub-list">
                  {loading ? (
                    <p className="extra-empty">Loading…</p>
                  ) : !history?.length ? (
                    <p className="extra-empty">No games yet. Play one!</p>
                  ) : history.slice(0, 8).map(e => (
                    <div key={e.id} className="history-row">
                      <span className={`history-result${e.won ? ' win' : ' loss'}`}>{e.won ? '✓' : '✗'}</span>
                      <span className="history-meta">{e.word_length}L · {e.guesses}g</span>
                      <span className="history-badges">
                        {e.is_daily && <span className="hbadge daily">D</span>}
                        {e.mode === 'practice' && <span className="hbadge practice">P</span>}
                        {e.room_id && <span className="hbadge room">VS</span>}
                      </span>
                      <span className="history-date">{fmtDate(e.played_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Achievements — collapsible */}
            <div className="stats-subsection">
              <button className="stats-sub-toggle" onClick={() => setAchOpen(v => !v)}>
                <span className="stats-sub-toggle-label">🏅 Achievements</span>
                <span className="stats-sub-count">{achievements?.length ?? 0}</span>
                <span className="stats-sub-arrow">{achOpen ? '▴' : '▾'}</span>
              </button>
              {achOpen && (
                <div className="stats-sub-list">
                  {loading ? (
                    <p className="extra-empty">Loading…</p>
                  ) : !achievements?.length ? (
                    <p className="extra-empty">No achievements yet. Keep playing!</p>
                  ) : achievements.map(a => (
                    <div key={a.code} className="ach-row">
                      <span className="ach-row-icon">🏅</span>
                      <div className="ach-row-text">
                        <span className="ach-row-name">{a.name}</span>
                        <span className="ach-row-desc">{a.description}</span>
                      </div>
                      <span className="ach-row-date">{fmtDate(a.unlocked_at)}</span>
                    </div>
                  ))}
                </div>
              )}
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
                <div key={e.rank} className={[
                  'lb-row',
                  e.username === user?.username ? 'lb-you' : '',
                  e.rank === 1 ? 'lb-gold' : e.rank === 2 ? 'lb-silver' : e.rank === 3 ? 'lb-bronze' : '',
                ].filter(Boolean).join(' ')}>
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

          {roomMsg && <div className="lobby-room-note">{roomMsg}</div>}

        </div>
      </div>
    </div>
  )
}
