// Модалки «⚙ Налаштування» та «📁 Файл».
import { h, toast } from './dom.js';
import { openModal, tile, grid, choose } from './modal.js';
import { store, updateSettings, setProgram, saveSlot, loadSlot } from '../core/store.js';
import { emit } from '../core/bus.js';
import { emptyProgram } from '../model/program.js';
import { EXAMPLES } from '../model/examples.js';
import { openEyeTest } from './eye-test.js';
import { openGlintTest } from './glint-test.js';
import { exportProgramFile, importProgramFile } from './file-io.js';

export const CLICK_MODES = { dwell: 'затримка погляду', doubleblink: 'подвійне кліпання', longclose: 'довго закрити очі' };

const STEPPERS = {
  dwellMs: { label: 'Час погляду', step: 200, min: 400, max: 4000, fmt: v => (v / 1000).toFixed(1) + ' с' },
  longCloseMs: { label: 'Довге закриття очей', step: 200, min: 600, max: 4000, fmt: v => (v / 1000).toFixed(1) + ' с' },
  readerScrollSpeed: { label: 'Прокрутка книги', step: 50, min: 100, max: 1200, fmt: v => v + ' px/с' },
  smoothing: { label: 'Плавність погляду', step: 0.05, min: 0, max: 0.95, fmt: v => Math.round(v * 100) + '%' },
  snap: { label: 'Магніт кнопок', step: 10, min: 0, max: 220, fmt: v => v + ' px' },
  headSensitivity: { label: 'Чутливість голови', step: 0.1, min: 0.5, max: 2.5, fmt: v => Math.round(v * 100) + '%' },
  breakReminderMin: { label: 'Нагадування про перерву', step: 5, min: 0, max: 60, fmt: v => v ? v + ' хв' : 'вимк' },
  zoom: { label: 'Масштаб схеми', step: 0.1, min: 0.5, max: 2, fmt: v => Math.round(v * 100) + '%' },
  runSpeedMs: { label: 'Пауза між кроками', step: 200, min: 200, max: 3000, fmt: v => (v / 1000).toFixed(1) + ' с' },
};

// Які регулятори стосуються поточного способу керування: зайвих не показуємо.
function stepperGroups(s) {
  return [
    ['Клік і вказівник', ['dwellMs', s.clickMode === 'longclose' && 'longCloseMs', s.mode === 'webcam' && 'smoothing', 'snap', s.mode === 'head' && 'headSensitivity']],
    ['Читання, алгоритми, перерви', ['readerScrollSpeed', 'breakReminderMin', 'zoom', 'runSpeedMs']],
  ].map(([title, keys]) => [title, keys.filter(Boolean)]);
}

export function openSettings() {
  const m = openModal({ title: 'Налаштування', cls: 'settings' });
  let page = 0;
  function render() {
    const focus = m.body.contains(document.activeElement) ? document.activeElement.getAttribute('data-settings-focus') : null;
    const s = store.settings;
    const camera = s.mode === 'webcam' || s.mode === 'head';
    const control = (label, action, key, opts = {}) => {
      const button = tile(label, action, opts);
      button.setAttribute('data-settings-focus', key);
      return button;
    };
    const stepper = (key) => {
      const st = { key, ...STEPPERS[key] };
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
    };
    // Перемикач так/ні: стан чути читачу екрана (aria-pressed) і видно не лише з тексту, а й з рамки.
    const flip = (key, label, icon, after) => {
      const b = control(label, () => { updateSettings({ [key]: !s[key] }); after?.(); render(); }, key, { icon });
      b.setAttribute('aria-pressed', String(!!s[key]));
      return b;
    };
    const controlGroup = ['Керування', [
      control({ webcam: 'Режим: погляд', head: 'Режим: голова' }[s.mode] || 'Режим: миша', () => { m.close(); emit('choose-mode'); }, 'mode', { icon: '🔄' }),
      // Без камери кліпання не видно: якби тут можна було обрати «кліпання», натиснути не вдалося б уже нічого,
      // навіть щоб повернутися в налаштування. Тому в режимі миші клік — лише затримкою.
      control('Клік: ' + CLICK_MODES[camera ? s.clickMode : 'dwell'], () => {
        if (!camera) { toast('Кліпання розпізнається лише в режимах з камерою. У режимі миші клік — затримкою', 5000); return; }
        const keys = Object.keys(CLICK_MODES);
        const next = keys[(keys.indexOf(s.clickMode) + 1) % keys.length];
        updateSettings({ clickMode: next }); render();
      }, 'clickMode', { icon: '👁' }),
      ...(s.mode === 'webcam' ? [
        control('Калібрувати', () => { m.close(); emit('calibrate'); }, 'calibrate', { icon: '🎯' }),
        control('Профілі погляду', () => { m.close(); emit('calib-profiles'); }, 'profiles', { icon: '🔖' }),
        flip('autoCalibrate', s.autoCalibrate ? 'Питати про калібрування: так' : 'Питати про калібрування: ні', '🎯',
          () => toast(store.settings.autoCalibrate ? 'Під час запуску можна буде обрати: продовжити, профіль чи нове калібрування' : 'Під час запуску одразу вмикається останнє калібрування', 5000)),
      ] : []),
      ...(s.mode === 'head' ? [
        control('Центрувати голову', () => { m.close(); emit('calibrate'); }, 'calibrate', { icon: '🎯' }),
        flip('headMirror', s.headMirror ? 'Напрямок: дзеркальний' : 'Напрямок: звичайний', '↔'),
        flip('headRest', s.headRest ? 'Відпочинок кивком: так' : 'Відпочинок кивком: ні', '💤',
          () => toast(store.settings.headRest ? 'Опустіть голову нижче екрана — вказівник зупиниться і нічого не натиснеться. Підніміть — керування повернеться' : 'Зона відпочинку вимкнена', 7000)),
      ] : []),
      ...(camera ? [
        flip('eyesStop', s.eyesStop ? 'Стоп очима: так' : 'Стоп очима: ні', '⏸',
          () => toast(store.settings.eyesStop ? 'Заплющені на 3 секунди очі зупиняють калібрування' : 'Калібрування зупиняє лише Esc або кнопка «Скасувати»', 5000)),
        control('Камера', () => { m.close(); emit('choose-camera'); }, 'camera', { icon: '📷' }),
        ...(s.mode === 'webcam' ? [control('Перевірка очей', () => openEyeTest(), 'eyeTest', { icon: '👁' })] : []),
        flip('irisPoints', s.irisPoints ? 'Точки райдужки: так' : 'Точки райдужки: ні', '👁',
          () => toast(store.settings.irisPoints
            ? 'Калібрування чекає, поки око зупиниться, і рахує градуси. Перекалібруйте, щоб порівняти'
            : 'Як було раніше: без райдужки. Перекалібруйте й порівняйте промах з увімкненими точками', 8000)),
        control('Відблиск в оці (експеримент)', () => { m.close(); openGlintTest(); }, 'glintTest', { icon: '✨' }),
        flip('lightFrame', s.lightFrame ? 'Світла рамка: так' : 'Світла рамка: ні', '💡',
          () => { if (store.settings.lightFrame) toast('Біла рамка довкола екрана додає світла на обличчя. Порівняйте точність калібрування з нею і без неї', 7000); }),
      ] : []),
      flip('showDot', s.showDot ? 'Точка погляду: так' : 'Точка погляду: ні', '📍'),
    ]];
    const viewGroup = ['Звук і вихід', [
      flip('voiceEnabled', s.voiceEnabled ? 'Озвучка: так' : 'Озвучка: ні', '🔊'),
      flip('sound', s.sound ? 'Звук кліку: так' : 'Звук кліку: ні', '🔔'),
      control(s.lang === 'uk' ? 'Мова озвучки: укр' : 'Мова озвучки: англ', () => { updateSettings({ lang: s.lang === 'uk' ? 'en' : 'uk' }); render(); }, 'lang', { icon: '🌐' }),
      control('Вийти з програми', async () => {
        const sure = await choose('Вийти з програми?', [{ label: 'Так, вийти', icon: '🚪', value: true, cls: 'danger' }], { cols: 2 });
        if (sure) { window.close(); location.href = 'about:blank'; }
      }, 'exit', { icon: '🚪', cls: 'danger' }),
    ]];
    // Сторінка — щонайбільше чотири великі цілі; назва розділу лишається над кожною.
    const pages = [];
    const paginate = ([title, items], cls) => {
      for (let i = 0; i < items.length; i += 4) {
        const part = items.slice(i, i + 4);
        pages.push([title, h('div', { class: cls + (part.length <= 2 ? ' few' : '') }, part)]);
      }
    };
    for (const [title, keys] of stepperGroups(s)) paginate([title, keys.map(stepper)], 'steppers');
    paginate(controlGroup, 'settings-toggles');
    paginate(viewGroup, 'settings-toggles');
    page = Math.min(page, pages.length - 1);
    const prev = control('Назад', () => { page--; render(); }, 'prev');
    const next = control('Далі', () => { page++; render(); }, 'next');
    if (!page) prev.setAttribute('disabled', '');
    if (page === pages.length - 1) next.setAttribute('disabled', '');
    const close = control('Закрити', () => m.close(), 'close', { cls: 'ok settings-close', always: true });
    const nav = h('nav', { class: 'settings-nav', 'aria-label': 'Сторінки налаштувань' }, prev,
      h('span', { class: 'settings-page-count', 'aria-live': 'polite' }, `${page + 1} / ${pages.length}`), next, close);
    m.body.replaceChildren(h('p', { class: 'settings-section' }, pages[page][0]), pages[page][1], nav);
    if (focus) {
      const target = m.body.querySelector(`[data-settings-focus="${focus}"]`);
      (target && !target.disabled ? target : (prev.disabled ? next : prev)).focus();
    }
  }
  render();
}

export async function openFileMenu() {
  const slotInfo = (n) => { const d = loadSlot(n); return d ? new Date(d.savedAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) : 'порожньо'; };
  // «Зберегти» і «Відкрити» — окремі сторінки: раніше шість схожих плиток «Зберегти N» / «Відкрити N»
  // стояли впереміш на трьох сторінках, і легко було затерти збережену програму замість відкрити її.
  let action = await choose('📁 Файл', [
    { label: 'Нова програма', icon: '📄', value: 'new' },
    { label: 'Приклади', icon: '💡', value: 'examples' },
    { label: 'Зберегти…', icon: '💾', sub: 'у комірку 1–3', value: 'save' },
    { label: 'Відкрити…', icon: '📂', sub: 'з комірки 1–3', value: 'load' },
    { label: 'Зберегти у файл', icon: '⬇️', sub: 'JSON, на комп\'ютер', value: 'export' },
    { label: 'Відкрити файл', icon: '⬆️', sub: 'JSON (клік мишею)', value: 'import' },
  ], { cols: 4 });
  if (action === 'save' || action === 'load') {
    const save = action === 'save';
    const n = await choose(save ? '💾 Зберегти в комірку' : '📂 Відкрити з комірки',
      [1, 2, 3].map(k => ({ label: 'Комірка ' + k, icon: save ? '💾' : '📂', sub: slotInfo(k), value: String(k) })), { cols: 4 });
    if (!n) return;
    if (save && loadSlot(+n) && !await choose('Замінити програму в комірці ' + n + '?',
      [{ label: 'Так, замінити', icon: '💾', value: true, cls: 'danger', sub: 'збережено ' + slotInfo(+n) }], { cols: 2 })) return;
    action += n;
  }
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
