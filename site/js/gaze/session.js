// Спільний «сеанс погляду» для будь-якої сторінки (EyeFlow, окрема читанка, у майбутньому — віджет):
// вибір режиму, старт камери, калібрування, вибір камери, пауза.
//   initGazeSession({ statusEl, calibBtn, pauseBtn })  — усі елементи необов'язкові
// Події шини: 'choose-mode', 'choose-camera', 'calibrate', 'toggle-pause' → 'pause-changed'.
import { store, updateSettings } from '../core/store.js';
import { on, emit } from '../core/bus.js';
import { initDwell } from './dwell.js';
import { startWebcam, calibrate, cam, cameraPermission, SITE_BLOCKED_HELP } from './webcam.js';
import { choose } from '../ui/modal.js';
import { toast } from '../ui/dom.js';
import { onDrift, resetDrift } from './drift.js';

let els = {};

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
    toast('Можливо, погляд змістився. Якщо керувати стало складніше, спробуйте перекалібрувати.', 9000);
  });

  on('choose-mode', chooseMode);
  on('choose-camera', chooseCamera);
  on('calibrate', runCalibration);
  on('toggle-pause', () => {
    store.paused = !store.paused;
    document.body.classList.toggle('paused', store.paused);
    const label = els.pauseBtn?.querySelector('.tile-label');
    if (label) label.textContent = store.paused ? 'Продовжити' : 'Пауза';
    emit('pause-changed', store.paused);
  });
  els.calibBtn?.addEventListener('dwell', runCalibration);
  els.pauseBtn?.addEventListener('dwell', () => emit('toggle-pause'));

  // ?mode=choose — помічник завжди може знову обрати режим, навіть якщо раніше збережено «миша».
  const forceChoose = new URLSearchParams(location.search).get('mode') === 'choose';
  if (store.settings.mode && !forceChoose) applyMode(); else chooseMode();
}

async function runCalibration() {
  if (store.settings.mode !== 'webcam') return toast('Калібрування потрібне лише в режимі камери');
  if (!cam.ready && !((await prepareCameraPermission()) && (await startWebcam()))) return;
  const r = await calibrate();

  if (!r.ok) {
    const retry = await choose(r.error || 'Калібрування не вдалося', [
      { label: 'Спробувати ще', icon: '🎯', value: true },
      { label: 'Скасувати', icon: '✕', value: false, cls: 'cancel' }], { cols: 2, cancel: false });
    if (retry) runCalibration();
    return;
  }

  resetDrift();            // нова калібровка — лічильник дрейфу починаємо спочатку

  // «Магніт» підбираємо під ВИМІРЯНУ точність, і саме за найгіршою точкою:
  // кнопки часто скраю екрана, а там похибка найбільша.
  const basePx = Math.round(r.worstPx != null ? r.worstPx : r.accuracyPx);
  updateSettings({ snap: Math.min(220, Math.max(40, Math.round(basePx * 0.9))) });

  const deg = (v) => (v == null ? '—' : v.toFixed(1) + '°');
  const parts = [
    `Точність: ${r.grade.label} ${deg(r.accuracyDeg)}`,
    `найгірша точка ${deg(r.worstDeg)}`,
    `стабільність ${deg(r.precisionDeg)}`,
    `валідних даних ${r.validPct}%`,
  ];
  if (r.distanceCm) parts.push(`відстань ~${r.distanceCm} см`);
  if (r.grade.key === 'poor') parts.push('Порада: більше світла на обличчя, сядьте ближче й рівніше');

  const again = await choose(parts.join(' · '), [
    { label: 'Ще раз', icon: '🎯', value: true },
    { label: 'Готово', icon: '✓', value: false, cls: 'ok' }], { cols: 2, cancel: false });
  if (again) runCalibration();
}

async function chooseMode() {
  const mode = await choose('Як керувати?', [
    { label: 'Очима через вебкамеру', icon: '📷', value: 'webcam', sub: 'WebGazer, потрібне калібрування' },
    { label: 'Миша або трекер очей', icon: '🖱', value: 'mouse', sub: 'Tobii / Windows Eye Control рухають курсор' },
  ], { cols: 2, cancel: false, subtitle: 'Обирає дорослий. Змінити можна будь-коли в налаштуваннях.' });
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
    if (store.settings.mode === 'webcam') {
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
    const next = await choose(SITE_BLOCKED_HELP, [
      { label: 'Оновити сторінку', icon: '🔄', value: 'reload', cls: 'ok' },
      { label: 'Перейти на мишу', icon: '🖱', value: 'mouse' }], { cols: 2, cancel: false });
    if (next === 'reload') location.reload();
    else { updateSettings({ mode: 'mouse' }); applyMode(); }
    return false;
  }
  await choose('Зараз браузер попросить доступ до камери. Натисніть «Дозволити» у вікні вгорі сторінки', [
    { label: 'Зрозуміло', icon: '📷', value: true, cls: 'ok' }], { cols: 1, cancel: false });
  return true;
}

async function applyMode() {
  document.body.dataset.mode = store.settings.mode;
  if (store.settings.mode === 'webcam') {
    if (els.calibBtn) els.calibBtn.hidden = false;
    if (!cam.ready && !(await prepareCameraPermission())) return;
    if (!cam.ready && !(await startWebcam())) return;
    if (store.settings.autoCalibrate) runCalibration();
    else toast('Камера працює. Якщо точка погляду «гуляє» — натисніть 🎯', 4000);
  } else {
    if (els.calibBtn) els.calibBtn.hidden = true;
    emit('cam-status', { text: 'Режим: миша / трекер', ok: true });
  }
}
