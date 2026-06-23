export class Timer {
  constructor(seconds, onTick, onExpire) {
    this._total    = seconds;
    this._remaining = seconds;
    this._onTick   = onTick;
    this._onExpire = onExpire;
    this._interval = null;
  }

  start() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._remaining--;
      this._onTick(this._remaining, this._total);
      if (this._remaining <= 0) {
        this.stop();
        this._onExpire();
      }
    }, 1000);
    // Fire immediately so UI shows correct state right away
    this._onTick(this._remaining, this._total);
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
  }

  reset(seconds) {
    this.stop();
    this._total     = seconds;
    this._remaining = seconds;
  }

  get remaining() { return this._remaining; }
  get total()     { return this._total; }
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function updateTimerUI(remaining, total) {
  const display = document.getElementById('timer-display');
  const bar     = document.getElementById('timer-bar');
  const wrap    = document.getElementById('timer-bar-wrap');

  if (!display) return;

  display.textContent = formatTime(remaining);
  wrap.classList.remove('hidden');
  display.classList.remove('hidden');

  const pct = total > 0 ? (remaining / total) * 100 : 0;
  bar.style.width = pct + '%';

  // Color: green → amber → red
  bar.className = 'timer-bar' +
    (pct > 50 ? ' safe' : pct > 25 ? ' warn' : ' danger');

  display.className = 'timer-display' +
    (pct <= 25 ? ' danger' : '');
}

export function hideTimerUI() {
  const wrap    = document.getElementById('timer-bar-wrap');
  const display = document.getElementById('timer-display');
  if (wrap)    wrap.classList.add('hidden');
  if (display) display.classList.add('hidden');
}
