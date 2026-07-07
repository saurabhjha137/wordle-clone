import { useState, useEffect, useReducer, useCallback } from 'react'
import './Game.css'
import { apiGetWord, apiSubmitGame } from './api'

const TIME_FOR_LEN     = { 3: 90, 4: 120, 5: 150, 6: 180, 7: 210 }
const ATTEMPTS_FOR_LEN = { 3: 4,  4: 5,   5: 6,   6: 7,   7: 8   }

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

/* ── Result overlay ─────────────────────────────────────── */
function ResultOverlay({ status, target, onRetry, onLobby, roomGame }) {
  const won = status === 'won'
  return (
    <div className="result-overlay">
      <div className="result-card">
        <div className={`result-icon${won ? ' won' : ' lost'}`}>{won ? '🏆' : '💀'}</div>
        <h2 className="result-heading">{won ? 'Brilliant!' : 'Game Over'}</h2>
        {roomGame && (
          <p className="result-challenge-tag">⚔️ Challenge by {roomGame.createdBy}</p>
        )}
        <p className="result-sub">{won ? 'You cracked the code!' : 'The word was'}</p>
        {!won && <p className="result-word">{target}</p>}
        <div className="result-actions">
          {!roomGame && <button className="result-btn primary" onClick={onRetry}>Play Again</button>}
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
export default function Game({ wordLen = 5, onBack, roomGame = null }) {
  const effectiveLen = roomGame?.wordLength ?? wordLen
  const maxAttempts  = ATTEMPTS_FOR_LEN[effectiveLen] ?? 6
  const totalTime    = roomGame?.timeLimit ?? TIME_FOR_LEN[effectiveLen] ?? 150

  const [state, dispatch]  = useReducer(gameReducer, { wordLen: effectiveLen, maxAttempts }, createInitialGameState)
  const [timeLeft, setTime] = useState(totalTime)

  /* Set word: skip API fetch for room challenges — word already known from invite join */
  useEffect(() => {
    if (state.status !== 'loading') return
    if (roomGame) {
      dispatch({ type: 'SET_TARGET', target: roomGame.word })
      return
    }
    let cancelled = false
    apiGetWord(effectiveLen)
      .then(word  => { if (!cancelled) dispatch({ type: 'SET_TARGET', target: word }) })
      .catch(()   => { if (!cancelled) dispatch({ type: 'FETCH_ERROR' }) })
    return () => { cancelled = true }
  }, [state.status, effectiveLen, roomGame])

  /* Submit result to backend when the game ends */
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'lost') return
    apiSubmitGame({
      wordLength : effectiveLen,
      guesses    : state.guesses.length,
      won        : state.status === 'won',
      timeTaken  : totalTime - timeLeft,
      roomId     : roomGame?.roomId ?? null,
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

  /* Physical keyboard — blocked during loading/error */
  const handleKey = useCallback((k) => {
    if (k === '⌫' || k === 'Backspace') return dispatch({ type: 'BACKSPACE' })
    if (k === 'ENTER' || k === 'Enter')  return dispatch({ type: 'ENTER' })
    if (/^[A-Za-z]$/.test(k)) dispatch({ type: 'KEY', key: k.toUpperCase() })
  }, [])

  useEffect(() => {
    const onKD = e => { if (!e.ctrlKey && !e.metaKey) handleKey(e.key) }
    window.addEventListener('keydown', onKD)
    return () => window.removeEventListener('keydown', onKD)
  }, [handleKey])

  const letterStates = getLetterStates(state.guesses, state.target)

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

        <Grid
          wordLen={effectiveLen}
          maxAttempts={maxAttempts}
          guesses={state.guesses}
          current={state.current}
          target={state.target}
          shake={state.shake}
        />

        <Keyboard letterStates={letterStates} onKey={handleKey} />
      </div>

      {(state.status === 'loading' || state.status === 'error') && (
        <LoadingOverlay status={state.status} onRetry={handleRetry} onLobby={onBack} />
      )}
      {(state.status === 'won' || state.status === 'lost') && (
        <ResultOverlay
          status={state.status}
          target={state.target}
          onRetry={handleRetry}
          onLobby={onBack}
          roomGame={roomGame}
        />
      )}
    </div>
  )
}
