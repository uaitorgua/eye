// ─────────────────────────────────────────────────────────────────────────────
// Виявлення ДРЕЙФУ калібрування (спільне для всіх додатків eye).
//
// Навіщо: калібрування «пливе» за 20-30 хв через зміну пози, освітлення й посадки.
// Людина цього не усвідомлює — просто починає частіше промахуватись.
//
// Як міряємо, не заважаючи: кожна успішна активація ціллю поглядом — це природна
// «точка істини» (людина дивилась на цю кнопку, коли та спрацювала). Порівнюємо
// точку погляду з центром цілі. Так само WebGazer вчиться на кліках користувача.
//
// Рахуємо СИСТЕМАТИЧНЕ зміщення (медіана dx і dy окремо), а не середню відстань:
// випадковий погляд на край великої кнопки взаємно компенсується, а справжній
// дрейф має сталий напрямок і в медіані лишається.
// ─────────────────────────────────────────────────────────────────────────────
import { lastReport } from './calibration.js';

const MAX = 24;                      // скільки останніх активацій тримаємо
const MIN_N = 8;                     // мінімум спостережень для висновку
const COOLDOWN_MS = 5 * 60 * 1000;   // не частіше, ніж раз на 5 хв
const FLOOR_PX = 60;                 // нижче цього не турбуємо взагалі

let buf = [];
let lastSuggest = -Infinity;   // перше попередження не має блокуватися кулдауном
const listeners = new Set();

export function onDrift(fn) { listeners.add(fn); }
export function resetDrift() { buf = []; lastSuggest = -Infinity; }

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Викликати при кожній активації ціллю поглядом.
export function noteActivation(gx, gy, rect) {
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !rect || !rect.width) return;
  buf.push({
    dx: gx - (rect.left + rect.width / 2),
    dy: gy - (rect.top + rect.height / 2),
  });
  if (buf.length > MAX) buf.shift();
  check();
}

export function bias() {
  if (buf.length < MIN_N) return null;
  return { x: median(buf.map(b => b.dx)), y: median(buf.map(b => b.dy)) };
}
export function biasPx() {
  const b = bias();
  return b ? Math.hypot(b.x, b.y) : null;
}

// Поріг прив'язуємо до ВИМІРЯНОЇ на калібруванні точності: дрейф має бути
// помітно більшим за власну похибку системи, інакше це просто шум.
function threshold() {
  const r = lastReport();
  const acc = r && r.accuracyPx ? r.accuracyPx : 90;
  return Math.max(FLOOR_PX, acc * 1.5);
}

function check() {
  const px = biasPx();
  if (px == null) return;
  const now = performance.now();
  if (px < threshold() || now - lastSuggest < COOLDOWN_MS) return;
  lastSuggest = now;
  const r = lastReport();
  const deg = r && r.pxPerDeg ? px / r.pxPerDeg : null;
  for (const fn of listeners) fn({ px: Math.round(px), deg });
}
