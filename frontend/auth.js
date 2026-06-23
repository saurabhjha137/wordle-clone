// ── Storage keys ───────────────────────────────────────────────────────────
const TOKEN_KEY = 'wordle_token';
const USER_KEY  = 'wordle_user';

// ── Client-side validation (mirrors server rules) ──────────────────────────
const Validate = {
  username(v) {
    if (!v.trim())               return 'Username is required.';
    if (v.trim().length < 3)     return 'Username must be at least 3 characters.';
    if (v.trim().length > 20)    return 'Username must be at most 20 characters.';
    if (!/^[a-zA-Z0-9_]+$/.test(v.trim())) return 'Letters, numbers, and underscores only.';
    return '';
  },
  email(v) {
    if (!v.trim())               return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return 'Enter a valid email address.';
    return '';
  },
  password(v) {
    if (!v)                      return 'Password is required.';
    if (v.length < 8)            return 'Password must be at least 8 characters.';
    if (!/[a-zA-Z]/.test(v))     return 'Password must contain at least one letter.';
    if (!/[0-9]/.test(v))        return 'Password must contain at least one number.';
    return '';
  },
  age(v) {
    if (v === '' || v === null || v === undefined) return 'Age is required.';
    const n = Number(v);
    if (!Number.isInteger(n))    return 'Age must be a whole number.';
    if (n < 13)                  return 'You must be at least 13 years old.';
    if (n > 120)                 return 'Enter a valid age.';
    return '';
  }
};

// ── DOM helpers ────────────────────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const setError   = (id, msg) => { const el = $(id); if (el) el.textContent = msg; };
const clearError = id        => setError(id, '');

function setFieldState(input, isError) {
  input.classList.toggle('input-error', isError);
  input.classList.toggle('input-ok',    !isError && input.value.trim() !== '');
}

// ── Password strength ──────────────────────────────────────────────────────
function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8)              score++;
  if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (pw.length >= 12)             score++;
  return ['', 'weak', 'medium', 'strong'][score];
}

// ── Wire up real-time field validation ─────────────────────────────────────
function attachFieldValidation(inputId, errorId, rule) {
  const input = $(inputId);
  if (!input) return;

  input.addEventListener('blur', () => {
    const msg = rule(input.value);
    setError(errorId, msg);
    setFieldState(input, !!msg);
  });

  input.addEventListener('input', () => {
    if (input.classList.contains('input-error')) {
      const msg = rule(input.value);
      setError(errorId, msg);
      setFieldState(input, !!msg);
    }
  });
}

// ── API calls ──────────────────────────────────────────────────────────────
async function callApi(endpoint, body) {
  const res = await fetch(`${CONFIG.API_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ── Auth state ─────────────────────────────────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY,  JSON.stringify(user));
}

function getSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user  = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  return (token && user) ? { token, user } : null;
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Show / hide overlay ────────────────────────────────────────────────────
function showGame(user) {
  $('auth-overlay').classList.add('hidden');
  $('user-area').classList.remove('hidden');
  $('user-greeting').textContent = `Hi, ${user.displayName || user.username}`;
}

function showAuth() {
  $('auth-overlay').classList.remove('hidden');
  $('user-area').classList.add('hidden');
}

// ── Tab switching ──────────────────────────────────────────────────────────
$('tab-login').addEventListener('click', () => {
  $('tab-login').classList.add('active');
  $('tab-register').classList.remove('active');
  $('tab-slider').classList.remove('slide-right');
  $('login-form').classList.remove('hidden');
  $('register-form').classList.add('hidden');
});

$('tab-register').addEventListener('click', () => {
  $('tab-register').classList.add('active');
  $('tab-login').classList.remove('active');
  $('tab-slider').classList.add('slide-right');
  $('register-form').classList.remove('hidden');
  $('login-form').classList.add('hidden');
});

// ── Password show/hide toggles ─────────────────────────────────────────────
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// ── Password strength meter (register only) ────────────────────────────────
$('reg-password').addEventListener('input', function () {
  const bar = $('pw-bar');
  const strength = getStrength(this.value);
  bar.className = 'pw-bar ' + strength;
});

// ── Real-time validation wiring ────────────────────────────────────────────
attachFieldValidation('login-username',  'err-login-username',  Validate.username);
attachFieldValidation('login-password',  'err-login-password',  Validate.password);
attachFieldValidation('reg-username',    'err-reg-username',    Validate.username);
attachFieldValidation('reg-email',       'err-reg-email',       Validate.email);
attachFieldValidation('reg-password',    'err-reg-password',    Validate.password);
attachFieldValidation('reg-age',         'err-reg-age',         v => Validate.age(v === '' ? '' : Number(v)));

// ── Login form submit ──────────────────────────────────────────────────────
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('err-login-form');

  const username = $('login-username').value.trim();
  const password = $('login-password').value;

  // Full client-side validation before hitting API
  const uErr = Validate.username(username);
  const pErr = Validate.password(password);
  setError('err-login-username', uErr); setFieldState($('login-username'), !!uErr);
  setError('err-login-password', pErr); setFieldState($('login-password'), !!pErr);
  if (uErr || pErr) return;

  const btn = $('login-submit');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const { ok, data } = await callApi('login', { username, password });

  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (!ok) {
    const errs = data.errors || {};
    setError('err-login-username', errs.username || '');
    setError('err-login-password', errs.password || '');
    setError('err-login-form',     errs.form     || 'Something went wrong. Try again.');
    return;
  }

  saveSession(data.token, data.user);
  showGame(data.user);
});

// ── Register form submit ───────────────────────────────────────────────────
$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('err-reg-form');

  const username = $('reg-username').value.trim();
  const email    = $('reg-email').value.trim();
  const password = $('reg-password').value;
  const age      = $('reg-age').value;

  const uErr = Validate.username(username);
  const eErr = Validate.email(email);
  const pErr = Validate.password(password);
  const aErr = Validate.age(age === '' ? '' : Number(age));

  setError('err-reg-username', uErr); setFieldState($('reg-username'), !!uErr);
  setError('err-reg-email',    eErr); setFieldState($('reg-email'),    !!eErr);
  setError('err-reg-password', pErr); setFieldState($('reg-password'), !!pErr);
  setError('err-reg-age',      aErr); setFieldState($('reg-age'),      !!aErr);
  if (uErr || eErr || pErr || aErr) return;

  const btn = $('register-submit');
  btn.disabled = true;
  btn.textContent = 'Creating account…';

  const { ok, data } = await callApi('register', { username, email, password, age: Number(age) });

  btn.disabled = false;
  btn.textContent = 'Create Account';

  if (!ok) {
    const errs = data.errors || {};
    setError('err-reg-username', errs.username || '');
    setError('err-reg-email',    errs.email    || '');
    setError('err-reg-password', errs.password || '');
    setError('err-reg-age',      errs.age      || '');
    setError('err-reg-form',     errs.form     || 'Something went wrong. Try again.');
    return;
  }

  saveSession(data.token, data.user);
  showGame(data.user);
});

// ── Logout ─────────────────────────────────────────────────────────────────
$('logout-btn').addEventListener('click', () => {
  clearSession();
  showAuth();
});

// ── Init: check existing session on page load ──────────────────────────────
(function init() {
  const session = getSession();
  if (session) {
    showGame(session.user);
  } else {
    showAuth();
  }
})();
