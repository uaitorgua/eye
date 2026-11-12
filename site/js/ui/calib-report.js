// Підсумок калібрування: замість рядка цифр — оцінка, чотири показники й «карта» екрана,
// де видно, у яких місцях погляд влучає точніше. Повертає Promise<boolean>: true — «Ще раз».
import { h } from './dom.js';
import { openModal, tile } from './modal.js';
import { gradeOf } from '../gaze/calibration.js';

const HEAD = {
  good: { title: 'Добра точність', text: 'Погляд влучає близько до цілі. Можна працювати.' },
  ok: { title: 'Прийнятна точність', text: 'Працювати можна. Великі кнопки натискатимуться впевнено.' },
  poor: { title: 'Слабка точність', text: 'Додай світла на обличчя, сядь ближче й рівніше — і спробуй ще раз.' },
};

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// Мініатюра екрана: ціль — крапка, кільце довкола — середній промах у цій точці (у масштабі екрана).
function screenMap(r) {
  const W = innerWidth, H = innerHeight;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cr-map-svg', role: 'img', 'aria-label': 'Карта точності на екрані' });
  root.appendChild(svg('rect', { x: 2, y: 2, width: W - 4, height: H - 4, rx: 22, class: 'cr-map-screen' }));
  for (const p of r.points || []) {
    if (p.accuracyPx == null) continue;
    const key = gradeOf(r.pxPerDeg ? p.accuracyPx / r.pxPerDeg : p.accuracyPx / 40).key;
    const radius = Math.max(14, Math.min(p.accuracyPx, Math.min(W, H) * 0.3));
    root.appendChild(svg('circle', { cx: p.x, cy: p.y, r: radius, class: 'cr-map-miss ' + key }));
    root.appendChild(svg('circle', { cx: p.x, cy: p.y, r: Math.max(7, W * 0.006), class: 'cr-map-dot ' + key }));
  }
  return root;
}

export function showCalibrationReport(r, { snap } = {}) {
  return new Promise((resolve) => {
    const key = r.grade?.key || 'poor';
    const m = openModal({ title: 'Калібрування завершено', cls: 'calib-report' });
    const done = (again) => { m.close(); resolve(again); };
    const deg = (v) => (v == null ? '—' : v.toFixed(1) + '°');
    const px = (v) => (v == null ? '' : '≈ ' + Math.round(v) + ' px');
    const stat = (label, value, sub) => h('div', { class: 'cr-stat' },
      h('span', { class: 'cr-stat-label' }, label), h('b', { class: 'cr-stat-value' }, value),
      sub ? h('span', { class: 'cr-stat-sub' }, sub) : null);

    const facts = [];
    if (r.distanceCm) facts.push('до екрана ≈ ' + r.distanceCm + ' см');
    if (snap) facts.push('«магніт» кнопок ' + snap + ' px');
    if (r.retried) facts.push('уточнено точок: ' + r.retried);

    const grade = h('div', { class: 'cr-grade ' + key },
      h('span', { class: 'cr-grade-badge', 'aria-hidden': 'true' }),
      h('div', { class: 'cr-grade-copy' },
        h('p', { class: 'cr-grade-title' }, HEAD[key].title),
        h('p', { class: 'cr-grade-text' }, HEAD[key].text)));
    const stats = h('div', { class: 'cr-stats' },
      stat('Середній промах', deg(r.accuracyDeg), px(r.accuracyPx)),
      stat('Найгірша точка', deg(r.worstDeg), px(r.worstPx)),
      stat('Тремтіння погляду', deg(r.precisionDeg), px(r.precisionPx)),
      stat('Корисних кадрів', r.validPct + '%', 'решта — кліпання'));
    const map = h('figure', { class: 'cr-map' }, screenMap(r),
      h('figcaption', {}, 'Кільце показує промах у цій точці екрана: менше кільце — точніше.'));

    // Якщо точність слабка, головною (першою) робимо кнопку «Ще раз».
    const again = tile('Ще раз', () => done(true), { icon: '🎯', sub: 'Повторити калібрування', cls: key === 'poor' ? 'primary' : '' });
    const ok = tile('Готово', () => done(false), { icon: '✓', sub: 'Перейти до роботи', cls: key === 'poor' ? '' : 'primary' });
    m.body.append(
      h('div', { class: 'cr-main' }, h('div', { class: 'cr-left' }, grade, stats,
        facts.length ? h('p', { class: 'cr-facts' }, facts.join(' · ')) : null), map),
      h('div', { class: 'cr-actions' }, ...(key === 'poor' ? [again, ok] : [ok, again])));
  });
}
