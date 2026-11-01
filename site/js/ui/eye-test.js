// «Перевірка очей»: живий показ відкритості очей і лічильники жестів.
// Для дорослого — підібрати поріг довгого закриття і переконатися, що кліпання розпізнається.
import { h } from './dom.js';
import { openModal, tile } from './modal.js';
import { eyes } from '../gaze/blink.js';
import { CLOSED_RATIO } from '../gaze/blink-detector.js';
import { store } from '../core/store.js';
import { CLICK_MODES } from './settings.js';

export function openEyeTest() {
  const m = openModal({ title: '👁 Перевірка очей', cls: 'eye-test' });
  const counts = { 'gaze-doubleblink': 0, 'gaze-longclose': 0 };
  let clicks = 0;

  const state = h('div', { class: 'eye-state' });
  const fill = h('div', { class: 'eye-fill' });
  const mark = h('div', { class: 'eye-mark' });
  const bar = h('div', { class: 'eye-bar' }, fill, mark);
  const stats = h('div', { class: 'eye-stats' });
  const target = tile('Клікни мене очима', () => { clicks++; render(); }, { icon: '🎯', cls: 'eye-target' });

  const onGesture = (e) => { counts[e.type]++; render(); };
  for (const name of Object.keys(counts)) document.addEventListener(name, onGesture);

  function render() {
    stats.replaceChildren(
      h('div', {}, 'Подвійне кліпання: ', h('b', {}, counts['gaze-doubleblink'])),
      h('div', {}, 'Довге закриття: ', h('b', {}, counts['gaze-longclose'])),
      h('div', {}, 'Натискань кнопки: ', h('b', {}, clicks)),
      h('div', { class: 'muted' }, 'Зараз клік — ' + CLICK_MODES[store.settings.clickMode]));
  }

  const timer = setInterval(() => {
    if (!m.el.isConnected) { clearInterval(timer); for (const n of Object.keys(counts)) document.removeEventListener(n, onGesture); return; }
    const base = eyes.baseline || 1;
    const open = Math.min(1, eyes.ear / base);
    fill.style.width = (open * 100).toFixed(0) + '%';
    fill.classList.toggle('closed', eyes.closed);
    mark.style.left = (CLOSED_RATIO * 100) + '%';
    state.textContent = !eyes.ok ? '🙈 Обличчя не видно' : eyes.closed ? '😌 Очі закриті' : '👀 Очі відкриті';
  }, 50);

  render();
  m.body.append(state, bar, h('div', { class: 'eye-row' }, stats, target),
    tile('Закрити', () => m.close(), { icon: '✓', cls: 'ok eye-close' }));
}
