// Джерело вказівника для dwell. Два режими:
//  'webcam' — точки від WebGazer (feedGaze);
//  'mouse'  — позиція курсора (звичайна миша або апаратний трекер типу Tobii / Windows Eye Control).
// Точки згладжуються: медіана з 5 останніх + експоненційне згладжування.
// Поки очі закриті (і ще трохи після), точки від камери ігноруються — вони «стрибають»,
// а курсор має лишитися на цілі, яку «клікають» кліпанням.
import { store } from '../core/store.js';
import { eyes } from './blink.js';

const REOPEN_SETTLE_MS = 250;

const listeners = new Set();
let recent = [];
let sx = null, sy = null;

export function onPointer(fn) { listeners.add(fn); }

function median(a) { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; }

function push(x, y, raw) {
  if (raw) { sx = x; sy = y; }
  else {
    recent.push([x, y]);
    if (recent.length > 5) recent.shift();
    const mx = median(recent.map(p => p[0])), my = median(recent.map(p => p[1]));
    const a = store.settings.smoothing;
    sx = sx == null ? mx : sx * a + mx * (1 - a);
    sy = sy == null ? my : sy * a + my * (1 - a);
  }
  const px = Math.max(0, Math.min(innerWidth - 1, sx));
  const py = Math.max(0, Math.min(innerHeight - 1, sy));
  for (const fn of listeners) fn(px, py);
}

// У режимі камери миша викладача тимчасово перехоплює вказівник, потім погляд повертається.
const MOUSE_OVERRIDE_MS = 1500;
let mouseAt = -Infinity;

export function feedGaze(x, y) {
  if (x == null || y == null || store.settings.mode !== 'webcam') return;
  const now = performance.now();
  if (now - mouseAt < MOUSE_OVERRIDE_MS) return;
  if (eyes.closed || now - eyes.reopenedAt < REOPEN_SETTLE_MS) return;
  push(x, y, false);
}

document.addEventListener('mousemove', (e) => {
  // 'mouse' — основне джерело; 'webcam' — викладач на MOUSE_OVERRIDE_MS після останнього руху.
  if (store.settings.mode === 'webcam') { mouseAt = performance.now(); recent = []; }
  push(e.clientX, e.clientY, true);
});
