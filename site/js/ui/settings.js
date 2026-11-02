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
  { key: 'dwellMs', label: '⏱ Час погляду', step: 200, min: 400, max: 4000, fmt: v => (v / 1000).toFixed(1) + ' с' },
  { key: 'longCloseMs', label: '😌 Довге закриття очей', step: 200, min: 600, max: 4000, fmt: v => (v / 1000).toFixed(1) + ' с' },
  { key: 'readerScrollSpeed', label: '📖 Прокрутка книги', step: 50, min: 100, max: 1200, fmt: v => v + ' px/с' },
  { key: 'smoothing', label: '〰 Плавність', step: 0.05, min: 0, max: 0.95, fmt: v => Math.round(v * 100) + '%' },
  { key: 'snap', label: '🧲 Магніт', step: 10, min: 0, max: 200, fmt: v => v + ' px' },
  { key: 'breakReminderMin', label: '🌿 Нагадування про перерву', step: 5, min: 0, max: 60, fmt: v => v ? v + ' хв' : 'вимк' },
  { key: 'zoom', label: '🔍 Масштаб схеми', step: 0.1, min: 0.5, max: 2, fmt: v => Math.round(v * 100) + '%' },
  { key: 'runSpeedMs', label: '🐢 Пауза між кроками', step: 200, min: 200, max: 3000, fmt: v => (v / 1000).toFixed(1) + ' с' },
];

export function openSettings() {
  const m = openModal({ title: '⚙ Налаштування', cls: 'settings' });
  function render() {
    const s = store.settings;
    const rows = STEPPERS.map(st => {
      const change = (d) => {
        const v = Math.round(Math.min(st.max, Math.max(st.min, s[st.key] + d * st.step)) * 100) / 100;
        updateSettings({ [st.key]: v }); render();
      };
      return h('div', { class: 'stepper' },
        h('div', { class: 'stepper-label' }, st.label),
        tile('−', () => change(-1), { cls: 'op' }),
        h('div', { class: 'stepper-value' }, st.fmt(s[st.key])),
        tile('+', () => change(1), { cls: 'op' }));
    });
    const toggles = grid(5,
      tile(s.autoCalibrate ? 'Автокалібр.: так' : 'Автокалібр.: ні', () => { updateSettings({ autoCalibrate: !s.autoCalibrate }); render(); }, { icon: '🎯' }),
      tile('Клік: ' + CLICK_MODES[s.clickMode], () => {
        const keys = Object.keys(CLICK_MODES);
        const next = keys[(keys.indexOf(s.clickMode) + 1) % keys.length];
        if (next !== 'dwell' && s.mode !== 'webcam') toast('Кліпання розпізнається лише в режимі камери');
        updateSettings({ clickMode: next }); render();
      }, { icon: '👁' }),
      tile(s.voiceEnabled ? 'Озвучка: Увімк' : 'Озвучка: Вимк', () => { updateSettings({ voiceEnabled: !s.voiceEnabled }); render(); }, { icon: '🔊' }),
      tile(s.lang === 'uk' ? 'Мова: 🇺🇦 Укр' : 'Мова: 🇬🇧 Eng', () => { updateSettings({ lang: s.lang === 'uk' ? 'en' : 'uk' }); render(); }, { icon: '🌐' }),
      tile(s.sound ? 'Звук: так' : 'Звук: ні', () => { updateSettings({ sound: !s.sound }); render(); }, { icon: '🔔' }),
      tile(s.showDot ? 'Точка: так' : 'Точка: ні', () => { updateSettings({ showDot: !s.showDot }); render(); }, { icon: '📍' }),
      tile(s.mode === 'webcam' ? 'Режим: камера' : 'Режим: миша', () => { m.close(); emit('choose-mode'); }, { icon: '🔄' }),
      ...(s.mode === 'webcam' ? [
        tile('Камера', () => { m.close(); emit('choose-camera'); }, { icon: '📷' }),
        tile('Перевірка очей', () => openEyeTest(), { icon: '👁' }),
      ] : []),
      tile('Вийти', () => { window.close(); location.href = 'about:blank'; }, { icon: '🚪', cls: 'danger' }),
      tile('Закрити', () => m.close(), { icon: '✓', cls: 'ok settings-close', always: true }));
    m.body.replaceChildren(h('div', { class: 'steppers' }, ...rows), toggles);
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
