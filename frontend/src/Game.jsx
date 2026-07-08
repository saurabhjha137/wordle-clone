import { useState, useEffect, useReducer, useCallback, useRef } from 'react'
import './Game.css'
import {
  apiGetDaily, apiGetWord, apiRequestRoomHint,
  apiSubmitGame, apiValidateWord,
} from './api'

const TIME_FOR_LEN     = { 3: 90, 4: 120, 5: 150, 6: 180, 7: 210 }
const ATTEMPTS_FOR_LEN = { 3: 4,  4: 5,   5: 6,   6: 7,   7: 8   }
const MAX_ROOM_HINTS   = 3

const ROOM_HINTS = [
  { type: 'creator_hint',         label: 'Creator' },
  { type: 'vowel_count',          label: 'Vowels' },
  { type: 'remove_wrong_letters', label: 'Remove' },
  { type: 'reveal_letter',        label: 'Reveal' },
  { type: 'first_letter',         label: 'First' },
]

/* ── Guess evaluation ───────────────────────────────────── */
function evaluateGuess(guess, target) {
  const result = Array(guess.length).fill('absent')
  const tArr   = target.split('')
  const gArr   = guess.split('')

  gArr.forEach((l, i) => {
    if (l === tArr[i]) { result[i] = 'correct'; tArr[i] = null; gArr[i] = null }
  })
  gArr.forEach((l, i) => {
    if (!l) return
    const ti = tArr.indexOf(l)
    if (ti !== -1) { result[i] = 'present'; tArr[ti] = null }
  })
  return result
}

function getLetterStates(guesses, target) {
  if (!target) return {}
  const states = {}
  guesses.forEach(guess => {
    evaluateGuess(guess, target).forEach((state, i) => {
      const l = guess[i], prev = states[l]
      if (prev === 'correct') return
      if (!prev || state === 'correct' || (state === 'present' && prev === 'absent')) states[l] = state
    })
  })
  return states
}

function getKnownPositions(guesses, target) {
  if (!target) return {}
  const known = {}
  guesses.forEach(guess => {
    evaluateGuess(guess, target).forEach((state, i) => {
      if (state === 'correct') known[i] = guess[i]
    })
  })
  return known
}

/* ── Reducer ────────────────────────────────────────────── */
function createInitialGameState({ wordLen, maxAttempts }) {
  return {
    target    : null,
    wordLen,
    maxAttempts,
    guesses   : [],
    current   : '',
    status    : 'loading',   // loading | playing | won | lost | error
    shake     : false,
  }
}

function gameReducer(state, action) {
  const PASS_THROUGH = ['SET_TARGET', 'FETCH_ERROR', 'RESET', 'CLEAR_SHAKE']
  if (state.status !== 'playing' && !PASS_THROUGH.includes(action.type)) return state

  switch (action.type) {
    case 'SET_TARGET':
      return { ...state, target: action.target, status: 'playing' }
    case 'FETCH_ERROR':
      return { ...state, status: 'error' }
    case 'KEY':
      if (state.current.length >= state.wordLen) return state
      return { ...state, current: state.current + action.key, shake: false }
    case 'BACKSPACE':
      return { ...state, current: state.current.slice(0, -1), shake: false }
    case 'ENTER': {
      if (state.current.length < state.wordLen) return { ...state, shake: true }
      const guesses = [...state.guesses, state.current]
      const won     = state.current === state.target
      const lost    = !won && guesses.length >= state.maxAttempts
      return { ...state, guesses, current: '', status: won ? 'won' : lost ? 'lost' : 'playing', shake: false }
    }
    case 'SHAKE':       return { ...state, shake: true }
    case 'TIMEOUT':     return { ...state, status: 'lost' }
    case 'CLEAR_SHAKE': return { ...state, shake: false }
    case 'RESET':       return createInitialGameState({ wordLen: action.wordLen ?? state.wordLen, maxAttempts: action.maxAttempts ?? state.maxAttempts })
    default:            return state
  }
}

/* ── Tech Clock — rectangular LED display ──────────────── */
const CLOCK_W = 90, CLOCK_H = 50, CLOCK_R = 6
const CLOCK_PERIM =
  2 * (CLOCK_W - 2 - 2 * CLOCK_R) +
  2 * (CLOCK_H - 2 - 2 * CLOCK_R) +
  2 * Math.PI * CLOCK_R

function TechClock({ total, left }) {
  const mins    = Math.floor(left / 60)
  const secs    = left % 60
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const cls     = left <= 10 ? 'urgent' : left <= 30 ? 'warn' : ''
  const dashOffset = CLOCK_PERIM * (1 - (total > 0 ? left / total : 0))

  return (
    <div className={`tech-clock${cls ? ` ${cls}` : ''}`} aria-label={`Time left: ${timeStr}`}>
      <div className="clock-side" />

      <div className="clock-body">
        {/* SVG progress border — drains clockwise */}
        <svg
          className="clock-prog"
          viewBox={`0 0 ${CLOCK_W} ${CLOCK_H}`}
          aria-hidden="true"
        >
          <rect className="clock-prog-track"
            x="1" y="1" width={CLOCK_W - 2} height={CLOCK_H - 2}
            rx={CLOCK_R} ry={CLOCK_R}
          />
          <rect className="clock-prog-bar"
            x="1" y="1" width={CLOCK_W - 2} height={CLOCK_H - 2}
            rx={CLOCK_R} ry={CLOCK_R}
            strokeDasharray={CLOCK_PERIM}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <p className="clock-sublabel">TIME LEFT</p>
        <div className="clock-display">
          <span className="clock-ghost" aria-hidden="true">88:88</span>
          <span className="clock-time">{timeStr}</span>
        </div>
      </div>

      <div className="clock-side" />
    </div>
  )
}

/* ── Tile ───────────────────────────────────────────────── */
function Tile({ letter, state, reveal, delay }) {
  return (
    <div
      className={[
        'tile',
        state ? `tile-${state}` : '',
        reveal  ? 'tile-reveal'  : '',
        !state && letter ? 'tile-filled' : '',
      ].filter(Boolean).join(' ')}
      style={reveal ? { animationDelay: `${delay * 0.12}s` } : undefined}
    >
      {letter}
    </div>
  )
}

/* ── Grid ───────────────────────────────────────────────── */
function Grid({ wordLen, maxAttempts, guesses, current, target, shake }) {
  return (
    <div className="grid" style={{ '--wl': wordLen }}>
      {Array.from({ length: maxAttempts }, (_, row) => {
        const committed  = guesses[row]
        const isCurrent  = row === guesses.length
        const letters    = committed
          ? committed.split('')
          : isCurrent
          ? [...current.padEnd(wordLen, ' ')].slice(0, wordLen)
          : Array(wordLen).fill(' ')
        const evaluation = committed && target ? evaluateGuess(committed, target) : null

        return (
          <div key={row} className={`grid-row${isCurrent && shake ? ' shake' : ''}`}>
            {letters.map((l, col) => (
              <Tile
                key={col}
                letter={l.trim()}
                state={evaluation?.[col] ?? null}
                reveal={!!committed && !!target}
                delay={col}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

/* ── Keyboard ───────────────────────────────────────────── */
const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
]

function Keyboard({ letterStates, onKey }) {
  return (
    <div className="keyboard" role="group" aria-label="On-screen keyboard">
      {KEYBOARD_ROWS.map((row, ri) => (
        <div key={ri} className="kb-row">
          {row.map(k => (
            <button
              key={k}
              className={[
                'kb-key',
                k.length > 1 ? 'kb-wide' : '',
                letterStates[k] ? `kb-${letterStates[k]}` : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onKey(k)}
              aria-label={k === '⌫' ? 'Backspace' : k}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function RoomHintBar({ hintsUsed, hintPenalty, message, error, busy, disabled, onHint }) {
  const exhausted = hintsUsed >= MAX_ROOM_HINTS
  return (
    <div className="room-hints" aria-label="Room hints">
      <div className="room-hints-head">
        <span>Hints {hintsUsed}/{MAX_ROOM_HINTS}</span>
        <span>-{hintPenalty} pts</span>
      </div>
      <div className="room-hints-actions">
        {ROOM_HINTS.map(h => (
          <button
            key={h.type}
            type="button"
            className="room-hint-btn"
            onClick={() => onHint(h.type)}
            disabled={disabled || exhausted || !!busy}
          >
            {busy === h.type ? '...' : h.label}
          </button>
        ))}
      </div>
      {message && (
        <p className={`room-hint-message${error ? ' error' : ''}`}>{message}</p>
      )}
    </div>
  )
}

/* ── Result overlay ─────────────────────────────────────── */
function ResultOverlay({
  status, target, guesses, maxAttempts,
  onRetry, onLobby, roomGame,
  gameMode, isDaily,
  newAchievements,
}) {
  const won = status === 'won'
  const [copied, setCopied] = useState(false)

  const handleShare = () => {
    const label = isDaily ? `Wordleee Daily ${target.length}L` : `Wordleee ${target.length}L`
    const header = `${label} ${guesses.length}/${maxAttempts}`
    const rows = guesses.map(guess =>
      evaluateGuess(guess, target)
        .map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛')
        .join('')
    )
    const text = [header, ...rows].join('\n')
    const doCopy = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(doCopy).catch(() => {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta); ta.select(); document.execCommand('copy')
        document.body.removeChild(ta); doCopy()
      })
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta); ta.select(); document.execCommand('copy')
      document.body.removeChild(ta); doCopy()
    }
  }

  return (
    <div className="result-overlay">
      <div className={`result-card${won ? ' result-win' : ''}`}>
        <div className={`result-icon${won ? ' won' : ' lost'}`}>{won ? '🏆' : '💀'}</div>
        <h2 className="result-heading">{won ? 'Brilliant!' : 'Game Over'}</h2>

        <div className="result-badges">
          {isDaily && <span className="result-badge daily-badge">📅 Daily</span>}
          {gameMode === 'practice' && <span className="result-badge practice-badge">🧪 Practice</span>}
          {roomGame && <span className="result-badge room-badge">⚔️ vs {roomGame.createdBy}</span>}
        </div>

        <p className="result-sub">{won ? 'You cracked the code!' : 'The word was'}</p>
        {!won && <p className="result-word">{target}</p>}

        {newAchievements?.length > 0 && (
          <div className="result-achievements">
            <p className="result-ach-title">🏅 Achievement{newAchievements.length > 1 ? 's' : ''} Unlocked</p>
            {newAchievements.map(a => (
              <div key={a.code} className="result-achievement">
                <span className="ach-name">{a.name}</span>
                <span className="ach-desc">{a.description}</span>
              </div>
            ))}
          </div>
        )}

        <div className="result-actions">
          <button className={`result-btn share-btn${copied ? ' copied' : ''}`} onClick={handleShare}>
            {copied ? '✓ Copied!' : '📋 Share'}
          </button>
          {!roomGame && <button className="result-btn primary" onClick={onRetry}>Play Again</button>}
          <button className="result-btn secondary" onClick={onLobby}>← Lobby</button>
        </div>
      </div>
    </div>
  )
}

/* ── Already played overlay ─────────────────────────────── */
function AlreadyPlayedOverlay({ wordLength, onLobby }) {
  return (
    <div className="result-overlay">
      <div className="result-card">
        <div className="result-icon">📅</div>
        <h2 className="result-heading">Already Played</h2>
        <p className="result-sub">You&apos;ve already submitted today&apos;s {wordLength}-letter daily challenge.</p>
        <p className="result-sub" style={{ fontSize: '.78rem', opacity: .6 }}>Come back tomorrow for a new word.</p>
        <div className="result-actions">
          <button className="result-btn secondary" onClick={onLobby}>← Lobby</button>
        </div>
      </div>
    </div>
  )
}

/* ── Loading / error overlay ────────────────────────────── */
function LoadingOverlay({ status, onRetry, onLobby }) {
  return (
    <div className="result-overlay">
      <div className="result-card">
        {status === 'loading' ? (
          <>
            <div className="result-icon">⏳</div>
            <h2 className="result-heading">Fetching word…</h2>
            <p className="result-sub">Connecting to server</p>
          </>
        ) : (
          <>
            <div className="result-icon lost">⚠️</div>
            <h2 className="result-heading">Connection Error</h2>
            <p className="result-sub">Could not reach the server</p>
            <div className="result-actions">
              <button className="result-btn primary" onClick={onRetry}>Retry</button>
              <button className="result-btn secondary" onClick={onLobby}>← Lobby</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Game (root) ────────────────────────────────────────── */
export default function Game({
  wordLen = 5, onBack, roomGame = null,
  gameMode = 'ranked', isDaily = false, dailyDate = null,
}) {
  const effectiveLen = roomGame?.wordLength ?? wordLen
  const maxAttempts  = ATTEMPTS_FOR_LEN[effectiveLen] ?? 6
  const totalTime    = roomGame?.timeLimit ?? TIME_FOR_LEN[effectiveLen] ?? 150

  const [state, dispatch]   = useReducer(gameReducer, { wordLen: effectiveLen, maxAttempts }, createInitialGameState)
  const [timeLeft, setTime]  = useState(totalTime)
  const [wordErr, setWordErr] = useState('')
  const [alreadyPlayed, setAlreadyPlayed] = useState(false)
  const [newAchievements, setNewAchievements] = useState([])
  const [hintInfo, setHintInfo] = useState({
    message: '',
    hintsUsed: 0,
    hintPenalty: 0,
    error: false,
  })
  const [hintBusy, setHintBusy] = useState('')

  const stateRef      = useRef(state)
  const validatingRef = useRef(false)
  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    setHintInfo({ message: '', hintsUsed: 0, hintPenalty: 0, error: false })
    setHintBusy('')
  }, [roomGame?.roomId])

  /* Set word: daily fetches from /daily, room uses pre-loaded word, else random */
  useEffect(() => {
    if (state.status !== 'loading') return
    if (roomGame) {
      dispatch({ type: 'SET_TARGET', target: roomGame.word })
      return
    }
    let cancelled = false
    const fetch = isDaily
      ? apiGetDaily(effectiveLen).then(data => {
          if (data.already_played) { setAlreadyPlayed(true); return null }
          return data.word
        })
      : apiGetWord(effectiveLen)
    fetch
      .then(word => { if (!cancelled) { if (word) dispatch({ type: 'SET_TARGET', target: word }) } })
      .catch(()  => { if (!cancelled) dispatch({ type: 'FETCH_ERROR' }) })
    return () => { cancelled = true }
  }, [state.status, effectiveLen, roomGame, isDaily])

  /* Submit result to backend when the game ends */
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'lost') return
    apiSubmitGame({
      wordLength : effectiveLen,
      guesses    : state.guesses.length,
      won        : state.status === 'won',
      timeTaken  : totalTime - timeLeft,
      roomId     : roomGame?.roomId ?? null,
      mode       : gameMode,
      isDaily,
      dailyDate,
    }).then(result => {
      if (result?.new_achievements?.length) setNewAchievements(result.new_achievements)
    }).catch(() => {})
  }, [state.status]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Timer — only runs during active play */
  useEffect(() => {
    if (state.status !== 'playing') return
    if (timeLeft <= 0) { dispatch({ type: 'TIMEOUT' }); return }
    const id = setTimeout(() => setTime(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [timeLeft, state.status])

  /* Clear shake after animation */
  useEffect(() => {
    if (!state.shake) return
    const id = setTimeout(() => dispatch({ type: 'CLEAR_SHAKE' }), 600)
    return () => clearTimeout(id)
  }, [state.shake])

  /* Clear word-not-found toast after 1.5 s */
  useEffect(() => {
    if (!wordErr) return
    const id = setTimeout(() => setWordErr(''), 1500)
    return () => clearTimeout(id)
  }, [wordErr])

  /* Physical keyboard — blocked during loading/error */
  const handleEnter = useCallback(async () => {
    if (validatingRef.current) return
    const { current, wordLen, status } = stateRef.current
    if (status !== 'playing') return
    if (current.length < wordLen) {
      dispatch({ type: 'ENTER' }) // triggers shake for incomplete word
      return
    }
    validatingRef.current = true
    try {
      const { valid } = await apiValidateWord(current)
      if (!valid) {
        setWordErr('Not in word list')
        dispatch({ type: 'SHAKE' })
        return
      }
    } catch {
      // network error — let the guess through so bad connectivity doesn't block play
    } finally {
      validatingRef.current = false
    }
    dispatch({ type: 'ENTER' })
  }, [])

  const handleKey = useCallback((k) => {
    if (k === '⌫' || k === 'Backspace') return dispatch({ type: 'BACKSPACE' })
    if (k === 'ENTER' || k === 'Enter')  return handleEnter()
    if (/^[A-Za-z]$/.test(k)) dispatch({ type: 'KEY', key: k.toUpperCase() })
  }, [handleEnter])

  useEffect(() => {
    const onKD = e => { if (!e.ctrlKey && !e.metaKey) handleKey(e.key) }
    window.addEventListener('keydown', onKD)
    return () => window.removeEventListener('keydown', onKD)
  }, [handleKey])

  const letterStates = getLetterStates(state.guesses, state.target)

  const handleRoomHint = useCallback(async (hintType) => {
    const currentState = stateRef.current
    if (!roomGame?.roomId || currentState.status !== 'playing' || hintBusy) return
    setHintBusy(hintType)
    try {
      const knownPositions = getKnownPositions(currentState.guesses, currentState.target)
      const result = await apiRequestRoomHint(roomGame.roomId, hintType, knownPositions)
      setHintInfo({
        message: result.message,
        hintsUsed: result.hints_used ?? 0,
        hintPenalty: result.hint_penalty ?? 0,
        error: false,
      })
    } catch (err) {
      setHintInfo(prev => ({
        ...prev,
        message: err.message ?? 'Hint unavailable.',
        error: true,
      }))
    } finally {
      setHintBusy('')
    }
  }, [hintBusy, roomGame?.roomId])

  const handleRetry = () => {
    dispatch({ type: 'RESET', wordLen: effectiveLen, maxAttempts })
    setTime(totalTime)
  }

  return (
    <div className="game">
      <div className="game-grid-bg" aria-hidden="true" />

      {/* Header */}
      <header className="game-bar">
        <button className="game-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Lobby
        </button>

        <div className="game-logo">
          <span className="glw">W</span>
          <span className="glt">ORDLEEE</span>
        </div>

        <div className="game-badge">
          {roomGame && <span className="badge-room">⚔️ VS</span>}
          <span className="badge-len">{effectiveLen}L</span>
          <span className="badge-sep">·</span>
          <span className="badge-tries">{maxAttempts} tries</span>
        </div>
      </header>

      {/* Play area */}
      <div className="game-body">
        <TechClock total={totalTime} left={timeLeft} />

        {wordErr && <div className="word-err-toast">{wordErr}</div>}

        <Grid
          wordLen={effectiveLen}
          maxAttempts={maxAttempts}
          guesses={state.guesses}
          current={state.current}
          target={state.target}
          shake={state.shake}
        />

        {roomGame && state.status === 'playing' && (
          <RoomHintBar
            hintsUsed={hintInfo.hintsUsed}
            hintPenalty={hintInfo.hintPenalty}
            message={hintInfo.message}
            error={hintInfo.error}
            busy={hintBusy}
            disabled={state.status !== 'playing'}
            onHint={handleRoomHint}
          />
        )}

        <Keyboard letterStates={letterStates} onKey={handleKey} />
      </div>

      {alreadyPlayed && (
        <AlreadyPlayedOverlay wordLength={effectiveLen} onLobby={onBack} />
      )}
      {!alreadyPlayed && (state.status === 'loading' || state.status === 'error') && (
        <LoadingOverlay status={state.status} onRetry={handleRetry} onLobby={onBack} />
      )}
      {(state.status === 'won' || state.status === 'lost') && (
        <ResultOverlay
          status={state.status}
          target={state.target}
          guesses={state.guesses}
          maxAttempts={maxAttempts}
          onRetry={handleRetry}
          onLobby={onBack}
          roomGame={roomGame}
          gameMode={gameMode}
          isDaily={isDaily}
          newAchievements={newAchievements}
        />
      )}
    </div>
  )
}
