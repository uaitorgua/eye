// Dwell-«клік»: якщо дивитися на елемент [data-dwell] dwellMs мілісекунд — він отримує подію 'dwell'.
// Звичайний клік мишею (викладач) теж одразу генерує 'dwell'.
// Атрибути цілі:
//   data-dwell          — ціль
//   data-dwell-repeat   — повторювати, поки дивишся (прокрутка)
//   data-dwell-always   — працює навіть під час паузи (кнопка паузи)
// Прогрес показується CSS-змінною --dwell (0..1) на цілі та кільцем біля точки погляду.
//
// Спосіб «кліку» (settings.clickMode):
//   'dwell'       — затримка погляду dwellMs;
//   'doubleblink' — подвійне кліпання;
//   'longclose'   — довге закриття очей (settings.longCloseMs).
// У режимах кліпання клікається ціль, на якій був курсор У МОМЕНТ закриття очей.
// Цілі data-dwell-repeat (◀ ▶, прокрутка) у всіх режимах працюють затримкою погляду.
import { store } from '../core/store.js';
import { onPointer } from './pointer.js';
import { eyes } from './blink.js';
import { noteActivation } from './drift.js';

const GESTURE_EVENT = { doubleblink: 'gaze-doubleblink', longclose: 'gaze-longclose' };

const SWITCH_MS = 250;       // скільки часу погляд має бути на новій цілі, щоб перемкнутися (менше — ціль «стрибає» від дрожання погляду)
const REPEAT_MS = 450;
const COOLDOWN_MS = 1000;    // після «натискання» — пауза, щоб встигнути перевести погляд
let cooldownUntil = 0;

let dot, ring;
// Тимчасове блокування «кліків» поглядом: потрібне там, де людина НАВМИСНО заплющує очі
// (вправа на кліпання у тренажері) — інакше кожне заплющення натискало б кнопку.
// Руками користувач помилку не виправить, тож на час таких вправ жести вимикаємо.
let gestureSuppressed = false;
export function setGestureSuppressed(v) { gestureSuppressed = !!v; }
let current = null, since = 0, locked = null;
let pending = null, pendingSince = 0;
let lastX = -1, lastY = -1;
let mouseClickBlocked = false;
let prevNow = 0, armed = null;

export function fire(el, gaze = true) {
  el.classList.add('dwell-fired');
  setTimeout(() => el.classList.remove('dwell-fired'), 300);
  if (store.settings.sound) beep();
  // Людина щойно дивилась саме на цю ціль — беремо це як орієнтир для виявлення дрейфу.
  if (gaze && store.settings.mode === 'webcam') {
    try { noteActivation(lastX, lastY, el.getBoundingClientRect()); } catch { /* ok */ }
  }
  el.dispatchEvent(new CustomEvent('dwell', { bubbles: true }));
}

// Область пошуку: верхня модалка → повноекранний шар [data-layer] (Тетріс) → весь документ.
function scope() {
  const modals = document.querySelectorAll('#modal-layer > .modal');
  if (modals.length) return modals[modals.length - 1];
  const layers = [...document.querySelectorAll('[data-layer]:not(.hidden)')];
  return layers.length ? layers[layers.length - 1] : document;
}

function usable(el) {
  if (!el || el.disabled || el.closest('[hidden]')) return false;
  if (store.paused && !el.hasAttribute('data-dwell-always')) return false;
  return true;
}

function findTarget(x, y) {
  const sc = scope();
  const hit = document.elementFromPoint(x, y)?.closest('[data-dwell]');
  if (hit && sc.contains(hit) && usable(hit)) return hit;
  // «Магніт»: найближча ціль у радіусі snap.
  let best = null, bestD = store.settings.snap;
  for (const el of sc.querySelectorAll('[data-dwell]')) {
    if (!usable(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = el; }
  }
  return best;
}

function setCurrent(el) {
  if (current) { current.classList.remove('dwell-focus'); current.style.removeProperty('--dwell'); current.style.removeProperty('--dwell-h'); }
  current = el; since = performance.now();
  if (current) {
    current.classList.add('dwell-focus');
    // Target height lets CSS fill the whole tile as progress rises (see css/system.css).
    current.style.setProperty('--dwell-h', (current.offsetHeight || 0) + 'px');
  }
}

onPointer((x, y) => {
  if (mouseClickBlocked && (x !== lastX || y !== lastY)) mouseClickBlocked = false;
  lastX = x; lastY = y;
  if (dot) {
    dot.style.transform = `translate(${x}px, ${y}px)`;
    dot.hidden = !store.settings.showDot;
  }
});

function loop(now) {
  requestAnimationFrame(loop);
  const dt = now - prevNow; prevNow = now;
  if (lastX < 0) return;
  if (store.settings.mode === 'mouse' && mouseClickBlocked) {
    if (current) setCurrent(null);
    if (ring) ring.style.setProperty('--p', 0);
    return;
  }
  if (eyes.closed) { since += dt; return; }      // очі закриті — нічого не рахуємо і не перемикаємо
  if (now < cooldownUntil || gestureSuppressed) { if (current) setCurrent(null); if (ring) ring.style.setProperty('--p', 0); return; }
  const t = findTarget(lastX, lastY);
  if (t !== current) {
    if (t !== pending) { pending = t; pendingSince = now; }
    if (now - pendingSince >= SWITCH_MS || !current) { setCurrent(t); pending = null; }
  } else pending = null;
  if (current !== locked) locked = null;   // ціль змінилася — попередню можна натиснути знову

  let p = 0;
  if (current && current !== locked && current.isConnected) {
    const byDwell = store.settings.clickMode === 'dwell' || current.hasAttribute('data-dwell-repeat');
    p = byDwell ? Math.min(1, (now - since) / store.settings.dwellMs) : 0;
    current.style.setProperty('--dwell', p.toFixed(3));

    if (byDwell && p >= 1) {
      const el = current;
      if (el.hasAttribute('data-dwell-repeat')) since = now - store.settings.dwellMs + REPEAT_MS;
      else { locked = el; el.style.removeProperty('--dwell'); cooldownUntil = now + COOLDOWN_MS; }
      fire(el);
    }
  } else if (current && !current.isConnected) setCurrent(null);
  if (ring) ring.style.setProperty('--p', locked ? 0 : p);
}

let audio;
export function beep() {
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.15); o.stop(audio.currentTime + 0.16);
  } catch { /* без звуку */ }
}

export function initDwell() {
  dot = document.getElementById('gaze-dot');
  ring = dot.querySelector('.ring');
  // Клік мишею (викладач) = миттєвий dwell.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-dwell]');
    if (el && scope().contains(el) && !el.disabled) {
      mouseClickBlocked = true;
      e.preventDefault(); fire(el, false);
    }
  });
  
  // Жест очима = клік по цілі, яка була під курсором, коли очі закрилися.
  document.addEventListener('eyes-closed', () => { armed = current; });
  for (const [mode, evName] of Object.entries(GESTURE_EVENT)) {
    document.addEventListener(evName, () => {
      if (gestureSuppressed) return;              // вправа на кліпання — не рахуємо як клік
      if (store.settings.clickMode !== mode) return;
      const el = armed?.isConnected ? armed : current;
      if (!el || !usable(el) || !scope().contains(el)) return;
      fire(el);                  // без locked: ту саму кнопку можна «клікнути» знову, не відводячи погляд
      cooldownUntil = performance.now() + COOLDOWN_MS;
    });
  }

  requestAnimationFrame(loop);
}
