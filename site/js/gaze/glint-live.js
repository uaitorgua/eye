// Відблиск на рогівці з живої камери. Окремої моделі не треба: WebGazer уже вантажить модель райдужки
// (lib/models/iris), тож його точки обличчя містять 478 точок, серед них райдужки 468–477.
// Тут лише: взяти кадр відео, вирізати ділянки очей і запустити детектор з glint.js.
//
//   sampleGlints(cross?) → { ok, reason?, w, h, phase, eyes: [{ side, iris, glint, crop }] }
//     cross = { phase: 'on'|'off', settled }  — режим «хрест, що блимає» (glint.js, findCrossGlint):
//     кадри 'off' лише запам'ятовуються як фон, відблиск шукаємо в різниці кадру 'on' і фону.
//     settled = false — світло щойно перемкнулось, кадр камери ще може бути старим: пропускаємо.
//   cameraTrack()        → MediaStreamTrack | null
import { irisCircle, findGlint, findCrossGlint, toGray } from './glint.js';

let canvas = null, ctx = null;   // створюємо при першому кадрі, не під час імпорту
const last = {};                 // останній відблиск кожного ока: { vx, vy, t } — щоб не стрибати між плямами
const bg = {};                   // кадр «хрест вимкнено» для кожного ока: { gray, x0, y0, w, h, iris, t }
const BG_MAX_AGE = 1500;         // старіший фон не порівнюємо: голова могла помітно зрушити

export const video = () => document.getElementById('webgazerVideoFeed');
export const cameraTrack = () => video()?.srcObject?.getVideoTracks?.()[0] || null;

export function sampleGlints(cross = null) {
  const v = video();
  if (!v || !v.videoWidth) return { ok: false, reason: 'camera', eyes: [] };
  const pos = window.webgazer?.getTracker?.()?.getPositions?.();
  if (!pos || !pos.length) return { ok: false, reason: 'face', eyes: [] };
  if (pos.length < 478) return { ok: false, reason: 'no-iris', eyes: [] };
  const w = v.videoWidth, h = v.videoHeight;
  if (!ctx) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
  const eyes = [];
  for (const side of ['left', 'right']) {
    const iris = irisCircle(pos, side);
    if (!iris) continue;
    // Вирізаємо лише квадрат довкола ока: getImageData на весь кадр 30 разів на секунду — зайве.
    const half = Math.ceil(iris.r * 1.6);
    const x0 = Math.max(0, Math.floor(iris.x - half)), y0 = Math.max(0, Math.floor(iris.y - half));
    const cw = Math.min(w - x0, 2 * half), ch = Math.min(h - y0, 2 * half);
    if (cw < 4 || ch < 4) continue;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.drawImage(v, x0, y0, cw, ch, 0, 0, cw, ch);
    const img = ctx.getImageData(0, 0, cw, ch);
    const gray = toGray(img.data, cw, ch);
    const local = { x: iris.x - x0, y: iris.y - y0, r: iris.r };
    // Ліве/праве око тут ще за номерами точок; «пам'ять» тримаємо за положенням ока в кадрі (див. нижче).
    const slot = (iris.x < w / 2 ? 'a' : 'b') + (cross ? 'x' : '');
    const now = performance.now();
    const prev = last[slot];
    const prefer = prev && now - prev.t < (cross ? 1500 : 300) ? { prefer: prev } : {};
    let g = null;
    if (!cross) g = findGlint(gray, cw, ch, local, prefer);
    else if (cross.settled && cross.phase === 'off') bg[slot] = { gray, x0, y0, w: cw, h: ch, iris, t: now };
    else if (cross.settled && cross.phase === 'on' && bg[slot] && now - bg[slot].t < BG_MAX_AGE)
      g = findCrossGlint({ gray, x0, y0, w: cw, h: ch, iris }, bg[slot], prefer);
    if (g) last[slot] = { vx: g.vx, vy: g.vy, t: now };
    eyes.push({
      side, iris,
      glint: g && { ...g, x: g.x + x0, y: g.y + y0, dx: iris.x - (g.x + x0), dy: iris.y - (g.y + y0) },
      crop: { x0, y0, w: cw, h: ch, img },
    });
  }
  // Який номер точок — яке око, у різних моделях по-різному. Кадр камери не віддзеркалений,
  // тож око ліворуч у кадрі — праве око людини.
  if (eyes.length === 2) {
    const [a, b] = eyes[0].iris.x <= eyes[1].iris.x ? [eyes[0], eyes[1]] : [eyes[1], eyes[0]];
    a.side = 'right'; b.side = 'left';
  }
  // phase: null — звичайний режим; 'on' — у цьому кадрі шукали відблиск хреста; 'off' / 'wait' — кадр не рахується.
  const phase = !cross ? null : !cross.settled ? 'wait' : cross.phase;
  return { ok: eyes.length > 0, reason: eyes.length ? null : 'face', w, h, phase, eyes };
}

// Камера з вищою роздільністю: відблиск рамки при 640×480 — 1–2 пікселі, при 1080p — утричі більше.
export async function requestHd(on = true) {
  const t = cameraTrack();
  if (!t) return false;
  const size = on ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : { width: { ideal: 640 }, height: { ideal: 480 } };
  try { await t.applyConstraints(size); return true; }
  catch { return false; }
}

// Автоекспозиція «з'їдає» відблиск, коли екран змінює яскравість. Де браузер дозволяє — фіксуємо.
export function exposureLockSupported() {
  const caps = cameraTrack()?.getCapabilities?.();
  return !!caps?.exposureMode?.includes?.('manual');
}
export async function setExposureLocked(on) {
  const t = cameraTrack();
  if (!t) return false;
  try { await t.applyConstraints({ advanced: [{ exposureMode: on ? 'manual' : 'continuous' }] }); return true; }
  catch { return false; }
}
