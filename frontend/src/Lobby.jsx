import { useState, useEffect, useCallback } from 'react'
import './Lobby.css'
import { apiCreateRoom, apiGetLeaderboard, apiGetMyStats } from './api'

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

/* ── Lobby ── */
export default function Lobby({ user, onStartGame, onLogout }) {
  const [selected,  setSelected]  = useState(5)
  const [lbData,    setLbData]    = useState(null)
  const [myStats,   setMyStats]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [lbLoading, setLbLoading] = useState(false)
  const [lbLen,     setLbLen]     = useState(null)   // null = All
  const [lbSort,    setLbSort]    = useState('wins')
  const [roomState, setRoomState] = useState({ loading: false, message: '', error: '' })

  // Initial load: leaderboard + my stats
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

  // Re-fetch leaderboard when filter/sort changes (skip on initial mount)
  const fetchLeaderboard = useCallback((len, sort) => {
    setLbLoading(true)
    apiGetLeaderboard(10, len, sort)
      .then(lb => setLbData(lb))
      .catch(() => {})
      .finally(() => setLbLoading(false))
  }, [])

  const handleLbLen = (val) => {
    setLbLen(val)
    fetchLeaderboard(val, lbSort)
  }

  const handleLbSort = (val) => {
    setLbSort(val)
    fetchLeaderboard(lbLen, val)
  }

  const mode    = getModeByLength(selected)
  const stats   = myStats  ?? { played: 0, won: 0, win_pct: 0, streak: 0 }
  const entries = lbData?.entries ?? []

  const handleCreateRoom = async () => {
    setRoomState({ loading: true, message: '', error: '' })
    try {
      const room = await apiCreateRoom({
        name: `${user?.username ?? 'Player'} ${selected}-Letter Room`,
        wordLength: selected,
        timeLimit: ROOM_TIME_FOR_LEN[selected],
        maxPlayers: DEFAULT_MAX_PLAYERS,
      })
      setRoomState({
        loading: false,
        message: `Room ${room.id} created · ${room.word_length} letters · ${Math.round(room.time_limit / 60)} min`,
        error: '',
      })
    } catch (err) {
      setRoomState({
        loading: false,
        message: '',
        error: err.message === 'Admin access only.'
          ? 'Only the admin user can create rooms right now.'
          : err.message ?? 'Could not create room.',
      })
    }
  }

  return (
    <div className="lobby">

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

            {/* Controls: filter tabs + sort — same row */}
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

            {/* Column headers */}
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

          {/* Create Room */}
          <button
            className="lobby-room-btn"
            onClick={handleCreateRoom}
            disabled={roomState.loading}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M6.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM3.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM19.75 7.5a.75.75 0 0 0-1.5 0v2.25H16a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H22a.75.75 0 0 0 0-1.5h-2.25V7.5Z"/>
            </svg>
            {roomState.loading ? 'Creating Room…' : 'Create Room · Multiplayer'}
          </button>
          {(roomState.message || roomState.error) && (
            <div className={`lobby-room-note${roomState.error ? ' error' : ''}`}>
              {roomState.error || roomState.message}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
