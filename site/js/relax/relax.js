// Тренажер розслаблення очей. Зміст звірено з дослідженнями (вересень 2026):
//
//  • КЛІПАННЯ — найкраще доказово підтверджена вправа. РКД з оптимізації режиму
//    (Optimisation of blinking exercises for dry eye disease, Cont Lens Anterior Eye, 2025)
//    показало: оптимум — 15 повторів циклу «заплющ–стисни–розплющ», 3 рази на день.
//    Зменшує симптоми, кількість НЕПОВНИХ кліпань і забарвлення кон’юнктиви.
//    (Частота кліпань сама по собі майже не змінюється — важлива саме повнота змикання.)
//  • 20-20-20 — докази СУПЕРЕЧЛИВІ: є РКД з покращенням симптомів і є РКД без ефекту
//    від 20-секундних перерв. Лишаємо як розумну гігієнічну звичку, без обіцянок.
//  • Плавні рухи очима й зміна фокуса «близько–далеко» — для комфорту та розминки;
//    це НЕ лікування й НЕ покращення гостроти зору.
//  • ПАЛЬМІНГ (натискання долонями) НАВМИСНО ПРИБРАНО: метод Бейтса не має наукового
//    підтвердження, а тиск на заплющені очі може тимчасово підвищувати внутрішньоочний
//    тиск (ризик при глаукомі). Лишили просто відпочинок із заплющеними очима, БЕЗ тиску.
//
// Вправи знімають втому й сухість, але НЕ виправляють короткозорість чи астигматизм.
// Керування поглядом не потрібне: людина стежить очима за підказкою; кнопки — dwell.
import { beep, setGestureSuppressed } from '../gaze/dwell.js';
import { cue } from '../core/cue.js';
import { store } from '../core/store.js';

const $ = (id) => document.getElementById(id);

// k: тип вправи; t: назва; h: підказка; dur: тривалість, с; cyc: тривалість одного циклу, с.
const BLINK_CYCLES = 15, BLINK_CYCLE_S = 3;     // доказовий режим: 15 повторів «заплющ–стисни–розплющ»
const STEPS = [
  { k: 'intro',   t: 'Розслаблення очей', h: 'Влаштуйся так, як тобі зручно. Стеж очима за підказками, не напружуйся. Починаємо за мить.', dur: 6 },
  { k: 'blink',   t: 'Кліпання: заплющ, стисни, розплющ', h: 'Заплющ очі, м’яко стисни повіки на секунду й розплющ. Повторюй за кружечком. Важливо змикати повіки повністю.', dur: BLINK_CYCLES * BLINK_CYCLE_S, cyc: BLINK_CYCLE_S },
  { k: 'far',     t: 'Погляд удалечінь · 20-20-20', h: 'Подивись на найдальшу точку, яку бачиш звідси. Дай очам відпочити від близького екрана.', dur: 20 },
  { k: 'horiz',   t: 'Плавні рухи · ліворуч і праворуч', h: 'Стеж за кружечком самими очима, спокійно й без поспіху.', dur: 22 },
  { k: 'vert',    t: 'Плавні рухи · вгору і вниз', h: 'Веди погляд за кружечком угору та вниз, плавно.', dur: 20 },
  { k: 'fig8',    t: 'Вісімка', h: 'Малюй очима вісімку слідом за кружечком. Повільно й м’яко.', dur: 26 },
  { k: 'nearfar', t: 'Близько і далеко', h: 'Кружечок більшає, ніби наближається, меншає, ніби віддаляється. Перефокусовуй на нього погляд.', dur: 24 },
  { k: 'rest',    t: 'Відпочинок із заплющеними очима', h: 'Просто заплющ очі на кілька секунд і дихай спокійно.', dur: 3 },
  { k: 'done',    t: 'Готово', h: 'Очі відпочили. Можна повертатися до роботи.', dur: 6 },
];
const EXERCISE_COUNT = STEPS.filter(s => !['intro', 'done'].includes(s.k)).length;

let idx = 0, acc = 0, prev = 0, paused = false, raf = null, exNo = 0;

function openRelax() {
  $('relax-section').classList.remove('hidden');
  startBeacon();               // аудіоконтекст стартує в межах жесту (dwell/клік)
  prev = performance.now();
  startStep(0);
  if (!raf) raf = requestAnimationFrame(loop);
}

function closeRelax() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  setGestureSuppressed(false);      // повертаємо звичайне керування поглядом
  silenceBeacon();
  $('relax-section').classList.add('hidden');
  $('relax-section').classList.remove('dark');
}

function startStep(i) {
  idx = Math.max(0, Math.min(STEPS.length - 1, i));
  acc = 0;
  const s = STEPS[idx];
  $('relax-title').textContent = s.t;
  $('relax-hint').textContent = s.h;
  exNo = STEPS.slice(0, idx + 1).filter(x => !['intro', 'done'].includes(x.k)).length;
  $('relax-progress').textContent = ['intro', 'done'].includes(s.k) ? '' : `Вправа ${exNo} з ${EXERCISE_COUNT}`;
  $('relax-section').classList.toggle('dark', s.k === 'rest');
  // На вправах, де очі навмисно заплющуються, вимикаємо «кліки» поглядом,
  // щоб кліпання не натискало кнопки (руками користувач це не виправить).
  setGestureSuppressed(s.k === 'blink' || s.k === 'rest');
  const showDot = ['blink', 'horiz', 'vert', 'fig8', 'nearfar'].includes(s.k);
  $('relax-dot').style.display = showDot ? 'block' : 'none';
  try { beep(); } catch { /* без звуку */ }
  cue('relax_' + s.k, s.h);   // студійний MP3, якщо є; інакше браузерний голос

}

// ── Звуковий маяк: тихий тон, що панорамується і змінює висоту разом із ціллю.
// Дає змогу вести погляд НА СЛУХ (для слабозорих) і чути ритм вправи.
let actx, osc, gainNode, panNode;
export function startBeacon() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      osc = actx.createOscillator(); gainNode = actx.createGain();
      panNode = actx.createStereoPanner ? actx.createStereoPanner() : null;
      osc.type = 'sine'; osc.frequency.value = 420; gainNode.gain.value = 0;
      osc.connect(gainNode);
      if (panNode) gainNode.connect(panNode).connect(actx.destination); else gainNode.connect(actx.destination);
      osc.start();
    }
    if (actx.state === 'suspended') actx.resume();
  } catch { actx = null; }
}
function beacon(freq, pan, vol) {
  if (!actx) return;
  const t = actx.currentTime;
  gainNode.gain.setTargetAtTime(store.settings.sound ? vol : 0, t, 0.06);
  osc.frequency.setTargetAtTime(freq, t, 0.06);
  if (panNode) panNode.pan.setTargetAtTime(pan, t, 0.06);
}
function silenceBeacon() { if (actx) gainNode.gain.setTargetAtTime(0, actx.currentTime, 0.05); }

function animate(s, el) {
  const stage = $('relax-stage');
  const r = stage.getBoundingClientRect();
  const dot = $('relax-dot');
  const cx = r.width / 2, cy = r.height / 2;
  const ampX = r.width * 0.40, ampY = r.height * 0.36;
  let x = cx, y = cy, scale = 1;
  const w = (period) => (el / period) * 2 * Math.PI;
  if (s.k === 'horiz') { const u = Math.sin(w(4)); x = cx + ampX * u; beacon(420, u, 0.05); }
  else if (s.k === 'vert') { const u = Math.sin(w(4)); y = cy + ampY * u; beacon(420 - 150 * u, 0, 0.05); }   // вище погляд → вищий тон
  else if (s.k === 'fig8') { const a = w(6); const ux = Math.sin(a), uy = Math.sin(2 * a) / 1.1; x = cx + ampX * ux; y = cy + ampY * uy; beacon(420 - 130 * uy, ux, 0.05); }
  else if (s.k === 'nearfar') { const u = Math.sin(w(4)); scale = 1.4 + 1.05 * u; beacon(360 - 90 * u, 0, 0.035 + 0.03 * (u * 0.5 + 0.5)); }  // близько → нижче й гучніше
  else if (s.k === 'blink') {
    // Доказовий цикл: заплющ (⅓) → стисни повіки (⅓) → розплющ (⅓). Кружечок показує фазу.
    const ph = (el % BLINK_CYCLE_S) / BLINK_CYCLE_S;
    let vol;
    if (ph < 1 / 3) { const u = ph * 3; scale = 1.1 - 0.85 * u; vol = 0.02 + 0.03 * u; }
    else if (ph < 2 / 3) { scale = 0.25; vol = 0.06; }
    else { const u = (ph - 2 / 3) * 3; scale = 0.25 + 0.85 * u; vol = 0.05 - 0.03 * u; }
    beacon(ph < 2 / 3 ? 300 : 390, 0, vol);
  }
  else silenceBeacon();
  dot.style.left = x + 'px';
  dot.style.top = y + 'px';
  dot.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = now - prev; prev = now;
  const s = STEPS[idx];
  if (!paused) acc += dt;
  const el = acc / 1000;
  if (!paused && el >= s.dur) {
    if (idx >= STEPS.length - 1) return closeRelax();
    return startStep(idx + 1);
  }
  animate(s, el);
  if (s.cyc) {   // лічильник повторів для кліпання
    const c = Math.min(BLINK_CYCLES, Math.floor(el / s.cyc) + 1);
    $('relax-progress').textContent = `Вправа ${exNo} з ${EXERCISE_COUNT} · повтор ${c} з ${BLINK_CYCLES}`;
  }
  const remain = Math.max(0, Math.ceil(s.dur - el));
  $('relax-timer').textContent = remain;
  $('relax-ring').style.setProperty('--p', Math.min(1, el / s.dur).toFixed(3));
}

export function initRelax() {
  if (!$('relax-section')) return;
  const bind = (id, fn) => { const b = $(id); if (b) b.addEventListener('dwell', fn); };
  bind('btn-relax-exit', () => closeRelax());   // portal/home.js додатково повертає в меню
  bind('relax-prev', () => startStep(idx - 1));
  bind('relax-next', () => { if (idx >= STEPS.length - 1) closeRelax(); else startStep(idx + 1); });
  bind('relax-pause', () => {
    paused = !paused;
    const b = $('relax-pause');
    b.classList.toggle('active', paused);
    b.querySelector('.tile-label').textContent = paused ? 'Далі' : 'Пауза';
    b.querySelector('.tile-icon').textContent = paused ? '▶' : '⏸';
  });
  // «Вихід» прив’язує portal/home.js (як в інших підсистем).
}

export { openRelax, closeRelax };
