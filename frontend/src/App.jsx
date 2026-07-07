import { useState, useEffect } from 'react'
import Lobby  from './Lobby'
import Game   from './Game'
import CityBg from './CityBg'
import { apiLogin, apiRegister, apiResetPassword, clearToken, getToken, onAuthError } from './api'
// roomGame shape: { word, timeLimit, wordLength, createdBy, roomName, roomId } | null
import './App.css'

const STORAGE_KEYS = {
  user: 'wordle_elite_user',
  theme: 'wordle_elite_theme',
  background: 'wordle_elite_background',
}

const AUTH_TABS = {
  login: 'login',
  register: 'register',
  reset: 'reset',
}

const DEFAULT_THEME = 'dark'
const DEFAULT_BACKGROUND = 'techfest'
const DEFAULT_WORD_LENGTH = 5

const BACKGROUND_OPTIONS = [
  { id: 'techfest', label: 'Techfest' },
  { id: 'hyperspace', label: 'Hyperspace' },
  { id: 'warp', label: 'Warp Gate' },
  { id: 'cognizance', label: 'Cognizance' },
]

/* ─── Validation ─────────────────────────────────────────── */
const validate = {
  username: v => {
    if (!v.trim())                            return 'Username is required'
    if (v.trim().length < 3)                 return 'At least 3 characters'
    if (v.trim().length > 20)                return 'Max 20 characters'
    if (!/^[a-zA-Z0-9_]+$/.test(v.trim()))  return 'Letters, numbers and _ only'
    return ''
  },
  email: v => {
    if (!v.trim()) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return 'Enter a valid email'
    return ''
  },
  password: v => {
    if (!v)          return 'Password is required'
    if (v.length < 8) return 'At least 8 characters'
    if (!/[a-zA-Z]/.test(v)) return 'Include at least one letter'
    if (!/[0-9]/.test(v))    return 'Include at least one number'
    return ''
  },
  recoveryAnswer: v => {
    if (!v.trim()) return 'Recovery answer is required'
    if (v.trim().length < 6) return 'At least 6 characters'
    return ''
  },
}

function readStoredJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

function getSavedUser() {
  // username persisted separately so the lobby can show it without re-fetching
  return readStoredJson(STORAGE_KEYS.user)
}

function saveUser(user) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
}

function clearSavedUser() {
  localStorage.removeItem(STORAGE_KEYS.user)
  clearToken()
}

function isLoggedIn() {
  return Boolean(getSavedUser() && getToken())
}

function validateLoginForm(form) {
  return {
    username: validate.username(form.username),
    password: validate.password(form.password),
  }
}

function validateRegistrationForm(form) {
  return {
    username: validate.username(form.username),
    password: validate.password(form.password),
    email: validate.email(form.email),
    recoveryAnswer1: validate.recoveryAnswer(form.recoveryAnswer1),
    recoveryAnswer2: validate.recoveryAnswer(form.recoveryAnswer2),
  }
}

function validatePasswordResetForm(form) {
  return {
    username: validate.username(form.username),
    email: validate.email(form.email),
    recoveryAnswer1: validate.recoveryAnswer(form.recoveryAnswer1),
    recoveryAnswer2: validate.recoveryAnswer(form.recoveryAnswer2),
    password: validate.password(form.password),
  }
}

function pwStrength(pw) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8)                               s++
  if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw))    s++
  if (pw.length >= 12)                              s++
  return s  // 0–3
}

const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Strong']
const STRENGTH_COLOR = ['', 'var(--danger)', 'var(--warn)', 'var(--ok)']

/* ─── Eye icons ──────────────────────────────────────────── */
function EyeIcon({ visible }) {
  return visible ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
    </svg>
  )
}

/* ─── Password input with visibility toggle ──────────────── */
function PasswordInput({ className, value, onChange, autoComplete, placeholder }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="pw-wrap">
      <input
        className={className}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <EyeIcon visible={visible} />
      </button>
    </div>
  )
}

/* ─── Password strength bar ──────────────────────────────── */
function StrengthBar({ password }) {
  const s = pwStrength(password)
  const color = STRENGTH_COLOR[s]
  return (
    <div className="pw-strength">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="pw-seg"
          style={{ background: password && i <= s ? color : 'var(--bg-3)' }}
        />
      ))}
      {password && (
        <span className="pw-label" style={{ color }}>{STRENGTH_LABEL[s]}</span>
      )}
    </div>
  )
}

/* ─── Login form ─────────────────────────────────────────── */
function LoginForm({ onSuccess, onForgotPassword }) {
  const [form, setForm]       = useState({ username: '', password: '' })
  const [errors, setErrors]   = useState({})
  const [formErr, setFormErr] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }))
    setFormErr('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validateLoginForm(form)
    setErrors(errs)
    if (errs.username || errs.password) return

    setLoading(true)
    try {
      const user = await apiLogin(form)
      saveUser(user)
      onSuccess(user)
    } catch (err) {
      if (err?.fields) {
        setErrors(f => ({ ...f, ...err.fields }))
      } else {
        setFormErr(err.message ?? 'Sign in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {formErr && <div className="auth-form-err">{formErr}</div>}

      <div className="auth-field">
        <label className="auth-label">Username</label>
        <input
          className={`auth-input${errors.username ? ' err' : form.username ? ' ok' : ''}`}
          type="text" autoComplete="username" placeholder="your_username"
          value={form.username} onChange={e => set('username', e.target.value)}
        />
        <span className="auth-err">{errors.username}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Password</label>
        <PasswordInput
          className={`auth-input${errors.password ? ' err' : form.password ? ' ok' : ''}`}
          autoComplete="current-password" placeholder="••••••••"
          value={form.password} onChange={e => set('password', e.target.value)}
        />
        <span className="auth-err">{errors.password}</span>
      </div>

      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>

      <button className="auth-link-btn" type="button" onClick={onForgotPassword}>
        Forgot password?
      </button>
    </form>
  )
}

/* ─── Register form ──────────────────────────────────────── */
function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const [form, setForm]       = useState({
    username: '',
    password: '',
    recoveryAnswer1: '',
    recoveryAnswer2: '',
    email: '',
  })
  const [errors, setErrors]   = useState({})
  const [formErr, setFormErr] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }))
    setFormErr('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validateRegistrationForm(form)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return

    setLoading(true)
    try {
      const user = await apiRegister(form)
      saveUser(user)
      onSuccess(user)
    } catch (err) {
      if (err?.fields) {
        // Map backend field names → frontend field names
        const mapped = {}
        if (err.fields.username)  mapped.username  = err.fields.username
        if (err.fields.password)  mapped.password  = err.fields.password
        if (err.fields.secret_a1) mapped.recoveryAnswer1 = err.fields.secret_a1
        if (err.fields.secret_a2) mapped.recoveryAnswer2 = err.fields.secret_a2
        if (Object.keys(mapped).length) setErrors(f => ({ ...f, ...mapped }))
        else setFormErr(Object.values(err.fields)[0])
      } else {
        setFormErr(err.message ?? 'Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form auth-form-register" onSubmit={submit} noValidate>
      {formErr && <div className="auth-form-err">{formErr}</div>}

      <div className="auth-field">
        <label className="auth-label">Username</label>
        <input
          className={`auth-input${errors.username ? ' err' : form.username ? ' ok' : ''}`}
          type="text" autoComplete="username" placeholder="cool_player"
          value={form.username} onChange={e => set('username', e.target.value)}
        />
        <span className="auth-err">{errors.username}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Password</label>
        <PasswordInput
          className={`auth-input${errors.password ? ' err' : form.password ? ' ok' : ''}`}
          autoComplete="new-password" placeholder="••••••••"
          value={form.password} onChange={e => set('password', e.target.value)}
        />
        <StrengthBar password={form.password} />
        <span className="auth-err">{errors.password}</span>
      </div>

      <div className="auth-field auth-field-full">
        <label className="auth-label">Email</label>
        <input
          className={`auth-input${errors.email ? ' err' : form.email ? ' ok' : ''}`}
          type="email" autoComplete="email" placeholder="you@example.com"
          value={form.email} onChange={e => set('email', e.target.value)}
        />
        <span className="auth-err">{errors.email}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Recovery Answer 1</label>
        <input
          className={`auth-input${errors.recoveryAnswer1 ? ' err' : form.recoveryAnswer1 ? ' ok' : ''}`}
          type="text" autoComplete="off" placeholder="Your childhood nickname"
          value={form.recoveryAnswer1} onChange={e => set('recoveryAnswer1', e.target.value)}
        />
        <span className="auth-err">{errors.recoveryAnswer1}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Recovery Answer 2</label>
        <input
          className={`auth-input${errors.recoveryAnswer2 ? ' err' : form.recoveryAnswer2 ? ' ok' : ''}`}
          type="text" autoComplete="off" placeholder="Your favorite teacher"
          value={form.recoveryAnswer2} onChange={e => set('recoveryAnswer2', e.target.value)}
        />
        <span className="auth-err">{errors.recoveryAnswer2}</span>
      </div>

      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? 'Creating account…' : 'Create Account'}
      </button>

      <p className="auth-switch">
        Already have an account?
        <button type="button" onClick={onSwitchToLogin}>Sign In</button>
      </p>
    </form>
  )
}

/* ─── Password reset form ────────────────────────────────── */
function ResetPasswordForm({ onSwitchToLogin }) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    recoveryAnswer1: '',
    recoveryAnswer2: '',
    password: '',
  })
  const [errors, setErrors] = useState({})
  const [formErr, setFormErr] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }))
    setFormErr('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validatePasswordResetForm(form)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return

    setLoading(true)
    try {
      await apiResetPassword({
        username        : form.username,
        recoveryAnswer1 : form.recoveryAnswer1,
        recoveryAnswer2 : form.recoveryAnswer2,
        password        : form.password,
      })
      setDone(true)
    } catch (err) {
      setFormErr(err.message ?? 'Reset failed. Check your username and answers.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="auth-form">
        <div className="auth-form-ok">Password reset complete. Sign in with your new password.</div>
        <button className="auth-submit" type="button" onClick={onSwitchToLogin}>
          Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <form className="auth-form auth-form-reset" onSubmit={submit} noValidate>
      {formErr && <div className="auth-form-err">{formErr}</div>}

      <div className="auth-field">
        <label className="auth-label">Username</label>
        <input
          className={`auth-input${errors.username ? ' err' : form.username ? ' ok' : ''}`}
          type="text" autoComplete="username" placeholder="your_username"
          value={form.username} onChange={e => set('username', e.target.value)}
        />
        <span className="auth-err">{errors.username}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Email</label>
        <input
          className={`auth-input${errors.email ? ' err' : form.email ? ' ok' : ''}`}
          type="email" autoComplete="email" placeholder="you@example.com"
          value={form.email} onChange={e => set('email', e.target.value)}
        />
        <span className="auth-err">{errors.email}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Recovery Answer 1</label>
        <input
          className={`auth-input${errors.recoveryAnswer1 ? ' err' : form.recoveryAnswer1 ? ' ok' : ''}`}
          type="text" autoComplete="off" placeholder="Your childhood nickname"
          value={form.recoveryAnswer1} onChange={e => set('recoveryAnswer1', e.target.value)}
        />
        <span className="auth-err">{errors.recoveryAnswer1}</span>
      </div>

      <div className="auth-field">
        <label className="auth-label">Recovery Answer 2</label>
        <input
          className={`auth-input${errors.recoveryAnswer2 ? ' err' : form.recoveryAnswer2 ? ' ok' : ''}`}
          type="text" autoComplete="off" placeholder="Your favorite Sports"
          value={form.recoveryAnswer2} onChange={e => set('recoveryAnswer2', e.target.value)}
        />
        <span className="auth-err">{errors.recoveryAnswer2}</span>
      </div>

      <div className="auth-field auth-field-full">
        <label className="auth-label">New Password</label>
        <PasswordInput
          className={`auth-input${errors.password ? ' err' : form.password ? ' ok' : ''}`}
          autoComplete="new-password" placeholder="••••••••"
          value={form.password} onChange={e => set('password', e.target.value)}
        />
        <StrengthBar password={form.password} />
        <span className="auth-err">{errors.password}</span>
      </div>

      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? 'Resetting…' : 'Reset Password'}
      </button>

      <p className="auth-switch">
        Remembered it?
        <button type="button" onClick={onSwitchToLogin}>Sign In</button>
      </p>
    </form>
  )
}

/* ─── Theme management ───────────────────────────────────── */
const THEMES = [
  'dark',
  'matrix',
  'ocean',
  'neon',
  'solar',
  'ember',
  'aurora',
  'cyber',
  'crimson',
  'gold',
  'frost',
  'grape',
  'mint',
  'rose',
  'steel',
  'sunset',
]

function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(STORAGE_KEYS.theme) || DEFAULT_THEME
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEYS.theme, theme)
  }, [theme])
  return [theme, setTheme]
}

function useBackgroundTheme() {
  const [background, setBackground] = useState(
    () => localStorage.getItem(STORAGE_KEYS.background) || DEFAULT_BACKGROUND
  )
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.background, background)
  }, [background])
  return [background, setBackground]
}

function BackgroundSwitcher({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const active = BACKGROUND_OPTIONS.find(option => option.id === value) ?? BACKGROUND_OPTIONS[0]

  return (
    <div className="bg-switcher">
      <button
        className="bg-switcher-btn"
        type="button"
        onClick={() => setOpen(isOpen => !isOpen)}
        aria-expanded={open}
      >
        <svg className="bg-switcher-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Z" />
          <path d="m5.5 16.5 4.1-4.1a1 1 0 0 1 1.4 0l2.1 2.1.9-.9a1 1 0 0 1 1.4 0l3.1 3.1" />
          <path d="M15.75 8.25h.01" />
        </svg>
        <span>{active.label}</span>
      </button>

      {open && (
        <div className="bg-switcher-menu">
          {BACKGROUND_OPTIONS.map(option => (
            <button
              key={option.id}
              className={`bg-switcher-option${option.id === value ? ' active' : ''}`}
              type="button"
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Moon icon ─────────────────────────────────────────── */
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75 9.75 9.75 0 0 1 8.25 6 9.77 9.77 0 0 1 9 2.252a9.75 9.75 0 0 0-6.75 9.5c0 5.385 4.365 9.75 9.75 9.75a9.75 9.75 0 0 0 9.752-6.5Z"/>
  </svg>
)

/* ─── Root App ───────────────────────────────────────────── */
export default function App() {
  const [theme, setTheme] = useTheme()
  const [background, setBackground] = useBackgroundTheme()
  const [tab, setTab] = useState(AUTH_TABS.login)
  const [user, setUser] = useState(getSavedUser)
  const [screen, setScreen] = useState(() => isLoggedIn() ? 'lobby' : 'auth')
  const [wordLen, setWordLen] = useState(DEFAULT_WORD_LENGTH)
  const [roomGame, setRoomGame] = useState(null) // { word, timeLimit, wordLength, createdBy, roomName, roomId }

  const handleLogin = (u) => {
    setUser(u)
    setScreen('lobby')
  }
  const handleLogout = () => {
    clearSavedUser()
    setUser(null)
    setRoomGame(null)
    setScreen('auth')
  }
  const handleStartGame = (len) => {
    setRoomGame(null)
    setWordLen(len)
    setScreen('game')
  }
  const handleJoinRoom = (roomData) => {
    setRoomGame(roomData)
    setWordLen(roomData.wordLength)
    setScreen('game')
  }

  // Auto-logout when any API call gets a 401 (expired/revoked token)
  useEffect(() => {
    onAuthError(() => {
      setUser(null)
      setRoomGame(null)
      setScreen('auth')
      setTab(AUTH_TABS.login)
    })
  }, [])
  const renderWithBackground = content => (
    <>
      <CityBg variant={background} />
      {content}
    </>
  )

  /* — Lobby ─ */
  if (screen === 'lobby') {
    return renderWithBackground(
      <Lobby
        user={user}
        onStartGame={handleStartGame}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
      />
    )
  }

  /* — Game ─ */
  if (screen === 'game') {
    return renderWithBackground(
      <Game
        wordLen={wordLen}
        onBack={() => { setScreen('lobby'); setRoomGame(null) }}
        roomGame={roomGame}
      />
    )
  }

  /* — Auth page ─ */
  return renderWithBackground(
    <div className="auth-scene">
      <BackgroundSwitcher value={background} onChange={setBackground} />

      {/* Moon / theme button */}
      <button
        className="auth-theme-btn"
        onClick={() => setTheme(t => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])}
        title={`Theme: ${theme} — click to cycle`}
      >
        <MoonIcon />
      </button>

      {/* Panel */}
      <div className={`auth-panel${tab === AUTH_TABS.register || tab === AUTH_TABS.reset ? ' auth-panel-register' : ''}`}>
        <div className="auth-brand">
          <span className="auth-logo-w">W</span>
          <span className="auth-logo-text">ORDLEEE</span>
          <span className="auth-logo-tag">ELITE</span>
        </div>
        <p className="auth-tagline">Guess the word. Beat the clock.</p>

        <div className="auth-rule" />

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab-btn${tab === AUTH_TABS.login ? ' active' : ''}`}
            onClick={() => setTab(AUTH_TABS.login)}
          >Sign In</button>
          <button
            className={`auth-tab-btn${tab === AUTH_TABS.register ? ' active' : ''}`}
            onClick={() => setTab(AUTH_TABS.register)}
          >Register</button>
        </div>

        {/* Forms */}
        {tab === AUTH_TABS.login && (
          <LoginForm onSuccess={handleLogin} onForgotPassword={() => setTab(AUTH_TABS.reset)} />
        )}
        {tab === AUTH_TABS.register && (
          <RegisterForm onSuccess={handleLogin} onSwitchToLogin={() => setTab(AUTH_TABS.login)} />
        )}
        {tab === AUTH_TABS.reset && (
          <ResetPasswordForm onSwitchToLogin={() => setTab(AUTH_TABS.login)} />
        )}

        {/* Guest option */}
        <div className="auth-or"><span>or</span></div>
        <button
          className="auth-guest"
          onClick={() => handleLogin({ username: 'Guest' })}
        >
          Continue as Guest
        </button>
      </div>

      {/* Theme chips */}
      <div className="auth-theme-bar">
        {THEMES.map(t => (
          <button
            key={t}
            className={`auth-theme-chip${theme === t ? ' active' : ''}`}
            onClick={() => setTheme(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
