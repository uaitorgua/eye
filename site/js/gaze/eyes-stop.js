// «Стоп очима»: якщо тримати очі заплющеними EYES_STOP_MS (3 с) — калібрування або центрування зупиняється.
// Людина, яка керує лише поглядом, не може натиснути «Скасувати (Esc)»; це її власний спосіб сказати «досить».
// Звичайне кліпання (до ~0,5 с) нічого не робить: індикатор з'являється лише після SHOW_AFTER_MS.
// Із заплющеними очима екрана не видно, тому відлік дублюється звуком: тик щосекунди й два тони на зупинці.
//
//   const stop = watchEyesStop(hostEl, onStop, { ms, sound });   stop() — прибрати спостерігача
import { eyes } from './blink.js';

export const EYES_STOP_MS = 3000;
const SHOW_AFTER_MS = 600;

const CSS = `
/* По центру екрана: саме туди людина дивиться, щойно розплющить очі. */
.eyes-stop{position:fixed;left:50%;top:50%;z-index:10012;transform:translate(-50%,-50%) scale(.94);opacity:0;
  display:flex;align-items:center;gap:18px;max-width:calc(100vw - 32px);padding:16px 28px 16px 18px;border-radius:999px;pointer-events:none;
  background:#fffdf8;color:#152440;border:3px solid #efb21d;box-shadow:0 0 0 8px rgba(239,178,29,.18),0 24px 50px -18px rgba(0,0,0,.6);
  font:700 clamp(18px,2vw,26px)/1.2 'Segoe UI',system-ui,sans-serif;transition:opacity .18s ease,transform .18s ease}
.eyes-stop.on{opacity:1;transform:translate(-50%,-50%)}
.eyes-stop.low{top:auto;bottom:clamp(16px,6vh,56px);transform:translate(-50%,10px)}
.eyes-stop.low.on{transform:translate(-50%,0)}
.eyes-stop-ring{--p:0;position:relative;flex-shrink:0;width:60px;height:60px;border-radius:50%;
  background:conic-gradient(#efb21d calc(var(--p)*360deg),#e3ddd0 0)}
.eyes-stop-ring::before{content:'';position:absolute;inset:6px;border-radius:50%;background:#fffdf8}
.eyes-stop-ring::after{content:'';position:absolute;left:15px;right:15px;top:50%;height:12px;margin-top:-4px;
  border-bottom:4px solid #152440;border-radius:0 0 50% 50%}
.eyes-stop small{display:block;margin-top:2px;font-weight:500;font-size:.78em;color:#46536c}
@media (prefers-reduced-motion:reduce){.eyes-stop{transition:none}}
`;

let audio;
function tone(freq, ms, gain = 0.07) {
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; g.gain.value = gain;
    o.connect(g).connect(audio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    o.stop(audio.currentTime + ms / 1000 + 0.02);
  } catch { /* без звуку */ }
}

export function watchEyesStop(host, onStop, { ms = EYES_STOP_MS, sound = true, low = false } = {}) {
  if (!document.getElementById('eyes-stop-style')) {
    const st = document.createElement('style');
    st.id = 'eyes-stop-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const pill = document.createElement('div');
  pill.className = 'eyes-stop' + (low ? ' low' : '');
  pill.setAttribute('role', 'status');
  const ring = document.createElement('span');
  ring.className = 'eyes-stop-ring';
  const text = document.createElement('span');
  pill.append(ring, text);

  let closedSince = null, ticks = 0, done = false, shownLeft = null;
  const timer = setInterval(() => {
    if (done) return;
    const now = performance.now();
    if (eyes.closed) closedSince ??= now; else { closedSince = null; ticks = 0; }
    const held = closedSince == null ? 0 : now - closedSince;
    const show = held >= SHOW_AFTER_MS;
    // Оверлей калібрування перемальовує свій вміст — повертаємо індикатор, якщо його стерли.
    if (show && !pill.isConnected && host.isConnected) host.appendChild(pill);
    pill.classList.toggle('on', show);
    ring.style.setProperty('--p', Math.min(1, held / ms).toFixed(3));
    const left = Math.max(1, Math.ceil((ms - held) / 1000));
    if (show && left !== shownLeft) {
      shownLeft = left;
      text.innerHTML = 'Очі заплющені — зупинка за ' + left + ' с<small>Розплющ очі, щоб продовжити</small>';
    }
    if (!show) shownLeft = null;
    const whole = Math.floor(held / 1000);
    if (whole > ticks && held < ms) { ticks = whole; if (sound) tone(440 + whole * 110, 110); }
    if (held >= ms) {
      done = true;
      if (sound) { tone(660, 160); setTimeout(() => tone(440, 260), 170); }
      onStop();
    }
  }, 50);
  return () => { clearInterval(timer); pill.remove(); };
}
