// Режим «рухи голови»: точки обличчя з FaceMesh (той самий трекер WebGazer) → вказівник.
// Калібрування очей не потрібне: досить один раз «центруватися» — подивитись прямо на екран.
// Математика — у head-pose.js [pure]; тут опитування трекера і екран центрування.
import { store } from '../core/store.js';
import { feedHead } from './pointer.js';
import { headOffset, createHeadPointer, median } from './head-pose.js';
import { h, toast } from '../ui/dom.js';

const POLL_MS = 33;
const HOLD_MS = 1400;        // скільки тримати голову рівно під час центрування
const GIVE_UP_MS = 20000;

const hp = createHeadPointer();
export const head = { ok: false, centred: false };

let timer = null, latest = null, latestAt = 0, lastKey = '', centring = null;

function tick() {
  if (store.settings.mode !== 'head') return;
  const now = performance.now();
  const pos = window.webgazer?.getTracker?.()?.getPositions?.();
  const o = headOffset(pos);
  if (!o) { head.ok = false; return; }
  // Трекер оновлюється рідше, ніж ми опитуємо: той самий кадр двічі не рахуємо,
  // інакше фільтр бачить «зупинку — стрибок» замість плавного руху.
  const key = o.yaw.toFixed(5) + '|' + o.pitch.toFixed(5);
  if (key === lastKey) return;
  lastKey = key;
  head.ok = true; latest = o; latestAt = now;
  if (centring) return;                 // під час центрування вказівник не рухаємо
  const s = store.settings;
  const pt = hp.update(o, now, { w: innerWidth, h: innerHeight, sens: s.headSensitivity || 1, invertX: !!s.headMirror });
  if (pt) feedHead(pt.x, pt.y);
}

export function startHead() {
  if (!timer) timer = setInterval(tick, POLL_MS);
}

// Екран центрування: людина дивиться прямо на екран у зручній позі, ми запам'ятовуємо це як «нуль».
// Повертає true, якщо центр оновлено. Скасування (Esc або кнопка) лишає попередній центр.
export function recenterHead() {
  if (centring) return centring;
  startHead();
  centring = new Promise((resolve) => {
    const ring = h('div', { class: 'head-centre-ring', 'aria-hidden': 'true' }, h('div', { class: 'head-centre-face' }));
    const title = h('p', { class: 'head-centre-title' }, 'Сядьте зручно й дивіться прямо сюди');
    const msg = h('p', { class: 'head-centre-msg', role: 'status' }, 'Шукаю обличчя…');
    const cancel = h('button', { class: 'head-centre-cancel', type: 'button' }, 'Скасувати (Esc)');
    const el = h('div', { class: 'head-centre', 'data-gaze-block': '', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Центрування голови' },
      ring, title, msg, cancel);
    document.body.appendChild(el);

    const started = performance.now();
    let samples = [], heldSince = 0;
    const finish = (ok) => {
      clearInterval(loop);
      document.removeEventListener('keydown', onKey, true);
      const done = () => { el.remove(); centring = null; resolve(ok); };
      if (!ok) return done();
      hp.setNeutral({ yaw: median(samples.map(s => s.yaw)), pitch: median(samples.map(s => s.pitch)) });
      head.centred = true;
      el.classList.add('done');
      title.textContent = 'Готово';
      msg.textContent = 'Повертайте голову — вказівник піде слідом.';
      setTimeout(done, 700);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => finish(false));

    const loop = setInterval(() => {
      const now = performance.now();
      const fresh = latest && now - latestAt < 300;
      if (!fresh) {
        samples = []; heldSince = 0;
        ring.style.setProperty('--p', 0);
        msg.textContent = 'Не бачу обличчя. Сядьте навпроти камери, додайте світла.';
        if (now - started > GIVE_UP_MS) { toast('Не вдалося знайти обличчя. Перевірте камеру й освітлення.', 7000); finish(false); }
        return;
      }
      // Голова має бути нерухомою: якщо людина ще вмощується, відлік починається знову.
      const first = samples[0];
      if (first && (Math.abs(latest.yaw - first.yaw) > 0.03 || Math.abs(latest.pitch - first.pitch) > 0.02)) { samples = []; heldSince = 0; }
      if (!samples.length) heldSince = now;
      if (samples[samples.length - 1] !== latest) samples.push(latest);
      const p = Math.min(1, (now - heldSince) / HOLD_MS);
      ring.style.setProperty('--p', p.toFixed(3));
      msg.textContent = 'Тримайте голову рівно…';
      if (p >= 1 && samples.length >= 5) finish(true);
    }, 50);
  });
  return centring;
}
