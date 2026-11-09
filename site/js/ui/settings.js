// Модалки «⚙ Налаштування» та «📁 Файл».
import { h, toast } from './dom.js';
import { openModal, tile, grid, choose } from './modal.js';
import { store, updateSettings, setProgram, saveSlot, loadSlot } from '../core/store.js';
import { emit } from '../core/bus.js';
import { emptyProgram } from '../model/program.js';
import { EXAMPLES } from '../model/examples.js';
import { openEyeTest } from './eye-test.js';
import { exportProgramFile, importProgramFile } from './file-io.js';

export const CLICK_MODES = { dwell: 'затримка погляду', doubleblink: 'подвійне кліпання', longclose: 'довго закрити очі' };

const STEPPERS = [
  { key: 'dwellMs', label: 'Час погляду', step: 200, min: 400, max: 4000, fmt: v => (v / 1000).toFixed(1) + ' с' },
  { key: 'longCloseMs', label: 'Довге закриття очей', step: 200, min: 600, max: 4000, fmt: v => (v / 1000).toFixed(1) + ' с' },
  { key: 'readerScrollSpeed', label: 'Прокрутка книги', step: 50, min: 100, max: 1200, fmt: v => v + ' px/с' },
  { key: 'smoothing', label: 'Плавність', step: 0.05, min: 0, max: 0.95, fmt: v => Math.round(v * 100) + '%' },
  { key: 'snap', label: 'Магніт', step: 10, min: 0, max: 200, fmt: v => v + ' px' },
  { key: 'headSensitivity', label: 'Чутливість голови', step: 0.1, min: 0.5, max: 2.5, fmt: v => Math.round(v * 100) + '%' },
  { key: 'breakReminderMin', label: 'Нагадування про перерву', step: 5, min: 0, max: 60, fmt: v => v ? v + ' хв' : 'вимк' },
  { key: 'zoom', label: 'Масштаб схеми', step: 0.1, min: 0.5, max: 2, fmt: v => Math.round(v * 100) + '%' },
  { key: 'runSpeedMs', label: 'Пауза між кроками', step: 200, min: 200, max: 3000, fmt: v => (v / 1000).toFixed(1) + ' с' },
];

export function openSettings() {
  const m = openModal({ title: 'Налаштування', cls: 'settings' });
  let page = 0;
  function render() {
    const focus = m.body.contains(document.activeElement) ? document.activeElement.getAttribute('data-settings-focus') : null;
    const s = store.settings;
    const control = (label, action, key, opts = {}) => {
      const button = tile(label, action, opts);
      button.setAttribute('data-settings-focus', key);
      return button;
    };
    const rows = STEPPERS.filter(st => st.key !== 'headSensitivity' || s.mode === 'head').map(st => {
      const change = (d) => {
        const v = Math.round(Math.min(st.max, Math.max(st.min, s[st.key] + d * st.step)) * 100) / 100;
        updateSettings({ [st.key]: v }); render();
      };
      const minus = control('−', () => change(-1), st.key + '-minus', { cls: 'op' });
      const plus = control('+', () => change(1), st.key + '-plus', { cls: 'op' });
      minus.setAttribute('aria-label', 'Зменшити: ' + st.label);
      plus.setAttribute('aria-label', 'Збільшити: ' + st.label);
      return h('div', { class: 'stepper' },
        h('div', { class: 'stepper-label' }, st.label), minus,
        h('div', { class: 'stepper-value' }, st.fmt(s[st.key])), plus);
    });
    const toggles = [
      control(s.autoCalibrate ? 'Автокалібр.: так' : 'Автокалібр.: ні', () => { updateSettings({ autoCalibrate: !s.autoCalibrate }); render(); }, 'autoCalibrate', { icon: '🎯' }),
      control('Клік: ' + CLICK_MODES[s.clickMode], () => {
        const keys = Object.keys(CLICK_MODES);
        const next = keys[(keys.indexOf(s.clickMode) + 1) % keys.length];
        if (next !== 'dwell' && s.mode === 'mouse') toast('Кліпання розпізнається лише в режимі камери');
        updateSettings({ clickMode: next }); render();
      }, 'clickMode', { icon: '👁' }),
      control(s.voiceEnabled ? 'Озвучка: Увімк' : 'Озвучка: Вимк', () => { updateSettings({ voiceEnabled: !s.voiceEnabled }); render(); }, 'voiceEnabled', { icon: '🔊' }),
      control(s.lang === 'uk' ? 'Мова: Укр' : 'Мова: Eng', () => { updateSettings({ lang: s.lang === 'uk' ? 'en' : 'uk' }); render(); }, 'lang', { icon: '🌐' }),
      control(s.sound ? 'Звук: так' : 'Звук: ні', () => { updateSettings({ sound: !s.sound }); render(); }, 'sound', { icon: '🔔' }),
      control(s.showDot ? 'Точка: так' : 'Точка: ні', () => { updateSettings({ showDot: !s.showDot }); render(); }, 'showDot', { icon: '📍' }),
      control({ webcam: 'Режим: погляд', head: 'Режим: голова' }[s.mode] || 'Режим: миша', () => { m.close(); emit('choose-mode'); }, 'mode', { icon: '🔄' }),
      ...(s.mode === 'webcam' ? [
        control('Калібрувати', () => { m.close(); emit('calibrate'); }, 'calibrate', { icon: '🎯' }),
        control('Камера', () => { m.close(); emit('choose-camera'); }, 'camera', { icon: '📷' }),
        control('Перевірка очей', () => openEyeTest(), 'eyeTest', { icon: '👁' }),
      ] : []),
      ...(s.mode === 'head' ? [
        control('Центрувати голову', () => { m.close(); emit('calibrate'); }, 'calibrate', { icon: '🎯' }),
        control(s.headMirror ? 'Напрямок: дзеркальний' : 'Напрямок: звичайний', () => { updateSettings({ headMirror: !s.headMirror }); render(); }, 'headMirror', { icon: '↔' }),
        control('Камера', () => { m.close(); emit('choose-camera'); }, 'camera', { icon: '📷' }),
      ] : []),
      control('Вийти з програми', () => { window.close(); location.href = 'about:blank'; }, 'exit', { icon: '🚪', cls: 'danger' }),
    ];
    const pages = [];
    for (let i = 0; i < rows.length; i += 4) pages.push(h('div', { class: 'steppers' }, rows.slice(i, i + 4)));
    for (let i = 0; i < toggles.length; i += 4) pages.push(h('div', { class: 'settings-toggles' }, toggles.slice(i, i + 4)));
    page = Math.min(page, pages.length - 1);
    const prev = control('Назад', () => { page--; render(); }, 'prev');
    const next = control('Далі', () => { page++; render(); }, 'next');
    if (!page) prev.setAttribute('disabled', '');
    if (page === pages.length - 1) next.setAttribute('disabled', '');
    const close = control('Закрити', () => m.close(), 'close', { cls: 'ok settings-close', always: true });
    const nav = h('nav', { class: 'settings-nav', 'aria-label': 'Сторінки налаштувань' }, prev,
      h('span', { class: 'settings-page-count', 'aria-live': 'polite' }, `${page + 1} / ${pages.length}`), next, close);
    m.body.replaceChildren(pages[page], nav);
    if (focus) {
      const target = m.body.querySelector(`[data-settings-focus="${focus}"]`);
      (target && !target.disabled ? target : (prev.disabled ? next : prev)).focus();
    }
  }
  render();
}

export async function openFileMenu() {
  const slotInfo = (n) => { const d = loadSlot(n); return d ? new Date(d.savedAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) : 'порожньо'; };
  const action = await choose('📁 Файл', [
    { label: 'Нова програма', icon: '📄', value: 'new' },
    { label: 'Приклади', icon: '💡', value: 'examples' },
    ...[1, 2, 3].map(n => ({ label: 'Зберегти ' + n, icon: '💾', sub: slotInfo(n), value: 'save' + n })),
    ...[1, 2, 3].map(n => ({ label: 'Відкрити ' + n, icon: '📂', sub: slotInfo(n), value: 'load' + n })),
    { label: 'Зберегти у файл', icon: '⬇️', sub: 'JSON, на комп\'ютер', value: 'export' },
    { label: 'Відкрити файл', icon: '⬆️', sub: 'JSON (клік мишею)', value: 'import' },
  ], { cols: 4 });
  if (!action) return;
  if (action === 'export') return exportProgramFile();
  if (action === 'import') return importProgramFile();
  if (action === 'new') {
    if (await choose('Стерти поточну програму?', [{ label: 'Так, нова', icon: '📄', value: true }], { cols: 2 })) setProgram(emptyProgram());
  } else if (action === 'examples') {
    const i = await choose('💡 Приклади', EXAMPLES.map((e, i) => ({ label: e.title, value: String(i) })), { cols: 3 });
    if (i != null) setProgram(EXAMPLES[+i].build());
  } else if (action.startsWith('save')) {
    saveSlot(+action.slice(4)); toast('Збережено ✓');
  } else {
    const d = loadSlot(+action.slice(4));
    if (d) setProgram(d.program); else toast('Тут ще нічого немає');
  }
}
