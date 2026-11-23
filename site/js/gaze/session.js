// Спільний «сеанс погляду» для будь-якої сторінки (EyeFlow, окрема читанка, у майбутньому — віджет):
// вибір режиму, старт камери, калібрування, вибір камери, пауза.
//   initGazeSession({ statusEl, calibBtn, pauseBtn })  — усі елементи необов'язкові
// Події шини: 'choose-mode', 'choose-camera', 'calibrate', 'toggle-pause' → 'pause-changed'.
import { store, updateSettings } from '../core/store.js';
import { on, emit } from '../core/bus.js';
import { initDwell } from './dwell.js';
import { startWebcam, calibrate, cam, cameraPermission, hasCalibration, SITE_BLOCKED_HELP } from './webcam.js';
import { choose } from '../ui/modal.js';
import { toast } from '../ui/dom.js';
import { onDrift, resetDrift } from './drift.js';
import { startHead, recenterHead } from './head.js';
import { showCalibrationReport } from '../ui/calib-report.js';
import { cue } from '../core/cue.js';
import { saveProfile, loadProfile, listProfiles, describeProfile, SLOTS, slotKey } from './calib-store.js';
import { setLastReport, lastReport, refineCalibration } from './calibration.js';
import { openProfiles, saveToSlot } from '../ui/calib-profiles.js';

let els = {};

// Те, що зберігається разом із моделлю погляду: звіт точності та підібраний під нього «магніт».
const currentCalibration = () => ({ report: lastReport(), snap: store.settings.snap });

// Увімкнути збережене калібрування: модель, «магніт», звіт для виявлення дрейфу, статус.
async function useProfile(key, { quiet = false } = {}) {
  let meta = null;
  try { meta = await loadProfile(key); } catch { /* сховище недоступне */ }
  if (!meta) return null;
  if (meta.snap != null) updateSettings({ snap: meta.snap });
  if (meta.report) setLastReport(meta.report);
  resetDrift();
  if (key !== 'last') saveProfile('last', { name: meta.name, report: meta.report, snap: meta.snap }).catch(() => {});
  const what = meta.name ? 'профіль «' + meta.name + '»' : meta.report?.grade ? 'точність ' + meta.report.grade.label : 'калібрування відновлено';
  emit('cam-status', { text: 'Камера працює · ' + what, ok: true });
  if (!quiet) toast('Увімкнено ' + (meta.name ? 'профіль «' + meta.name + '»' : 'збережене калібрування'), 3500);
  return meta;
}

const profilesDialog = () => openProfiles({ hasCalibration, current: currentCalibration, apply: (key) => useProfile(key) });

export function initGazeSession(elements = {}) {
  els = elements;
  initDwell();

  on('cam-status', ({ text, ok, error }) => {
    if (els.statusEl) { els.statusEl.textContent = text; els.statusEl.className = ok ? 'ok' : error ? 'error' : ''; }
    if (error) toast(text, 8000);
  });
  // Калібрування «пливе» з часом. Коли систематичне зміщення стає помітним,
  // делікатно пропонуємо перекалібруватися (не частіше ніж раз на 5 хвилин).
  onDrift(() => {
    toast('Можливо, погляд змістився. Якщо керувати стало складніше, відкрийте Налаштування → «Калібрувати» або «Профілі погляду».', 9000);
  });

  on('choose-mode', chooseMode);
  on('choose-camera', chooseCamera);
  on('calibrate', runCalibration);
  on('calib-profiles', async () => {
    if (store.settings.mode !== 'webcam') return toast('Профілі потрібні лише в режимі камери');
    if (!cam.ready && !((await prepareCameraPermission()) && (await startWebcam()))) return;
    profilesDialog();
  });
  // Світла рамка довкола екрана — додаткове світло на обличчя (дослід з освітленням, docs/man-notes.md §5.3).
  // Клас на <html>, а не на <body>: body::after уже зайнятий написом «Пауза», і рамка його перекривала.
  const frame = () => document.documentElement.classList.toggle('light-frame', !!store.settings.lightFrame && store.settings.mode !== 'mouse');
  on('settings-changed', frame);
  frame();
  on('toggle-pause', () => {
    store.paused = !store.paused;
    document.body.classList.toggle('paused', store.paused);
    const label = els.pauseBtn?.querySelector('.tile-label');
    if (label) label.textContent = store.paused ? 'Продовжити' : 'Пауза';
    // Усі кнопки паузи (тулбар, читанка, браузер, Тетріс): під час паузи — значок «▶», а не «‖».
    for (const btn of document.querySelectorAll('#btn-pause, #rd-pause, #br-pause, #tz-pause')) {
      btn.querySelector('.ui-icon')?.style.setProperty('--icon', `url(../assets/icons/${store.paused ? 'play' : 'pause'}.svg)`);
    }
    const home = document.querySelector('#home-pause .home-control-icon path');
    if (home) home.setAttribute('d', store.paused ? 'M8 5l11 7-11 7z' : 'M8 5v14M16 5v14');
    emit('pause-changed', store.paused);
  });
  els.calibBtn?.addEventListener('dwell', runCalibration);
  els.pauseBtn?.addEventListener('dwell', () => emit('toggle-pause'));

  // ?mode=choose — помічник завжди може знову обрати режим, навіть якщо раніше збережено «миша».
  const forceChoose = new URLSearchParams(location.search).get('mode') === 'choose';
  if (store.settings.mode && !forceChoose) applyMode(); else chooseMode();
}

async function runCalibration() {
  // У режимі голови «калібрування» — це центрування: подивитись прямо на екран.
  if (store.settings.mode === 'head') {
    if (!cam.ready && !((await prepareCameraPermission()) && (await startWebcam()))) return;
    return recenterHead();
  }
  if (store.settings.mode !== 'webcam') return toast('Калібрування потрібне лише в режимі камери');
  if (!cam.ready && !((await prepareCameraPermission()) && (await startWebcam()))) return;
  const r = await calibrate();

  if (r.cancelled) {
    // Після зупинки повертаємо звичайний статус камери замість «Калібрування 3/9».
    emit('cam-status', { text: 'Камера працює', ok: true });
    const how = r.reason === 'eyes' ? 'Калібрування зупинено: очі були заплющені 3 секунди.' : 'Калібрування скасовано.';
    // Очі ще можуть бути заплющені — кажемо вголос, що зупинка спрацювала.
    if (r.reason === 'eyes') cue('calib_stopped', 'Калібрування зупинено. Можна розплющити очі.');
    toast(how + ' ' + (hasCalibration()
      ? 'Працює попереднє налаштування погляду.'
      : 'Без нього погляд може влучати неточно — запустіть його в Налаштуваннях → «Калібрувати».'), 7000);
    return;
  }
  if (!r.ok) {
    const retry = await choose(r.error || 'Калібрування не вдалося', [
      { label: 'Спробувати ще', icon: '🎯', value: true },
      { label: 'Скасувати', icon: '✕', value: false, cls: 'cancel' }], { cols: 2, cancel: false });
    if (retry) runCalibration();
    return;
  }

  resetDrift();            // нова калібровка — лічильник дрейфу починаємо спочатку
  return afterCalibration(r);
}

// Звіт і «Уточнити»: кожен раунд — ще 5 синіх точок поверх поточної моделі (міряємо, потім учимо).
async function afterCalibration(r) {
  for (;;) {
    // «Магніт» підбираємо під ВИМІРЯНУ точність, і саме за найгіршою точкою:
    // кнопки часто скраю екрана, а там похибка найбільша.
    const basePx = Math.round(r.worstPx != null ? r.worstPx : r.accuracyPx);
    updateSettings({ snap: Math.min(220, Math.max(40, Math.round(basePx * 0.9))) });
    emit('cam-status', { text: 'Камера працює · точність ' + r.grade.label, ok: true });
    // Запам'ятовуємо модель самі: після перезавантаження сторінки калібрувати знову не доведеться.
    const shown = r;
    saveProfile('last', { report: shown, snap: store.settings.snap }).catch(() => {});
    const next = await showCalibrationReport(shown, {
      snap: store.settings.snap,
      onSave: () => saveToSlot({ current: () => ({ report: shown, snap: store.settings.snap }) }),
    });
    if (next === 'again') return runCalibration();
    if (next !== 'refine') return;
    const rr = await refineCalibration({
      previous: shown, round: (shown.round || 1) + 1,
      onStatus: (text) => emit('cam-status', { text }), sound: store.settings.sound, eyesStop: store.settings.eyesStop,
    });
    if (rr.cancelled) {
      emit('cam-status', { text: 'Камера працює', ok: true });
      if (rr.reason === 'eyes') cue('calib_stopped', 'Уточнення зупинено. Можна розплющити очі.');
      toast('Уточнення зупинено. Зібрані точки лишились у моделі.', 6000);
      return;
    }
    if (!rr.ok) { toast(rr.error || 'Уточнення не вдалося', 7000); continue; }   // знову показуємо попередній звіт
    r = rr;
  }
}

async function chooseMode() {
  const mode = await choose('Як керувати?', [
    { label: 'Очима через вебкамеру', icon: '📷', value: 'webcam', sub: 'WebGazer, потрібне калібрування' },
    { label: 'Рухами голови', icon: '🙂', value: 'head', sub: 'Вебкамера стежить за поворотом голови, без калібрування' },
    { label: 'Миша або трекер очей', icon: '🖱', value: 'mouse', sub: 'Tobii / Windows Eye Control рухають курсор' },
  ], { cols: 3, cancel: false, subtitle: 'Обирає дорослий. Змінити можна будь-коли в налаштуваннях.' });
  updateSettings({ mode });
  applyMode();
}

async function chooseCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    if (videoDevices.length === 0) return toast('Камер не знайдено');
    const id = await choose('Оберіть камеру', videoDevices.map((d, i) => ({
      label: d.label || `Камера ${i + 1}`, icon: '📷', value: d.deviceId,
    })), { cols: 1 });
    if (!id) return;
    updateSettings({ cameraId: id });
    if (store.settings.mode !== 'mouse') {
      // WebGazer не вміє змінити камеру на льоту — перезавантажуємо сторінку.
      cam.ready = false;
      toast('Налаштування збережено. Перезапуск...', 2000);
      setTimeout(() => location.reload(), 1000);
    }
  } catch (err) {
    toast('Помилка: ' + err.message);
  }
}

// Перед першим запитом камери пояснюємо дорослому, що зараз з'явиться вікно дозволу:
// у Chrome воно маленьке, вгорі ліворуч, і його легко не помітити.
// Якщо дозвіл уже заблоковано — вікна не буде взагалі, тож одразу показуємо, як його зняти.
async function prepareCameraPermission() {
  const state = await cameraPermission();
  if (state === 'granted') return true;
  if (state === 'denied') {
    const next = await choose('Камеру заблоковано', [
      { label: 'Оновити сторінку', icon: '🔄', value: 'reload', cls: 'ok', sub: 'Після того як дозволите камеру' },
      { label: 'Перейти на мишу', icon: '🖱', value: 'mouse', sub: 'Працювати без камери' }], { cols: 2, cancel: false, subtitle: SITE_BLOCKED_HELP });
    if (next === 'reload') location.reload();
    else { updateSettings({ mode: 'mouse' }); applyMode(); }
    return false;
  }
  await choose('Потрібен доступ до камери', [
    { label: 'Зрозуміло', icon: '📷', value: true, cls: 'ok' }], { cols: 1, cancel: false,
    subtitle: 'Зараз браузер покаже невелике вікно вгорі сторінки. Натисніть у ньому «Дозволити». Відео нікуди не надсилається: воно обробляється лише на цьому комп’ютері.' });
  return true;
}

async function applyMode() {
  document.body.dataset.mode = store.settings.mode;
  if (store.settings.mode === 'head') {
    if (els.calibBtn) els.calibBtn.hidden = false;
    if (!cam.ready && !(await prepareCameraPermission())) return;
    if (!cam.ready && !(await startWebcam())) return;
    startHead();
    emit('cam-status', { text: 'Режим: рухи голови', ok: true });
    if (!(await recenterHead())) toast('Центрування пропущено. Запустіть його в Налаштуваннях → «Центрувати голову».', 7000);
  } else if (store.settings.mode === 'webcam') {
    if (els.calibBtn) els.calibBtn.hidden = false;
    if (!cam.ready && !(await prepareCameraPermission())) return;
    if (!cam.ready && !(await startWebcam())) return;
    // Повертаємо останнє вдале калібрування з минулого сеансу (якщо модель ще порожня).
    let profiles = {};
    try { profiles = await listProfiles(); } catch { /* приватне вікно: працюємо без збережених профілів */ }
    if (!hasCalibration() && profiles.last) await useProfile('last', { quiet: true });
    const saved = SLOTS.some(n => profiles[slotKey(n)]);
    if (store.settings.autoCalibrate) {
      // Без жодного збереженого калібрування вибирати нема з чого — одразу калібруємо.
      if (!hasCalibration() && !saved) return runCalibration();
      const next = await choose(hasCalibration() ? 'Калібрувати знову?' : 'З чого почнемо?', [
        ...(hasCalibration() ? [{ label: 'Продовжити', icon: '✓', value: 'go', cls: 'ok', sub: profiles.last ? describeProfile(profiles.last) : 'Попереднє калібрування' }] : []),
        ...(saved ? [{ label: 'Профілі', icon: '🔖', value: 'profiles', sub: 'Збережені калібрування' }] : []),
        { label: 'Калібрувати', icon: '🎯', value: 'calibrate', sub: 'Кружечок для стеження' },
      ], { cols: 3, cancel: false, subtitle: 'Якщо точка погляду влучає добре, можна одразу продовжити.' });
      if (next === 'calibrate') runCalibration();
      else if (next === 'profiles' && !(await profilesDialog()) && !hasCalibration()) runCalibration();
    }
    else toast(hasCalibration()
      ? 'Камера працює. Якщо точка погляду «гуляє» — відкрийте Налаштування → «Калібрувати»'
      : 'Камера працює, але погляд ще не відкалібровано: Налаштування → «Калібрувати»', 6000);
  } else {
    if (els.calibBtn) els.calibBtn.hidden = true;
    emit('cam-status', { text: 'Режим: миша / трекер', ok: true });
  }
}
