// WebGazer: запуск камери та калібрування ПОГЛЯДОМ (дитина нічого не клікає).
// Моделі нейромереж беруться локально з lib/models/ (перехоплюємо запити до tfhub).
import { feedGaze } from './pointer.js';
import { emit } from '../core/bus.js';
import { store } from '../core/store.js';
import { startBlinkDetection, eyes } from './blink.js';
import { runCalibration } from './calibration.js';


// --- усе локально: tfhub.dev/.../facemesh/.../model.json → lib/models/facemesh/model.json
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  const m = url && url.match(/tfhub\.dev\/.*?\/(facemesh|iris|blazeface)\/.*\/([^/?]+)(\?.*)?$/);
  return realFetch(m ? `lib/models/${m[1]}/${m[2]}` : input, init);
};

export const cam = { ready: false };

// Інструкції, коли браузер уже не покаже вікно дозволу.
export const SITE_BLOCKED_HELP = 'Камеру для цього сайту заблоковано в браузері. Chrome: значок ⓘ або 🔒 ліворуч від адреси → «Налаштування сайту» → Камера → «Дозволити», потім оновіть сторінку';
export const OS_BLOCKED_HELP = 'Камеру вимкнено в Windows. Пуск → Параметри → Конфіденційність і захист → Камера: увімкніть «Доступ до камери» та «Дозволити класичним програмам», потім оновіть сторінку';

// Стан дозволу без запиту: 'granted' | 'prompt' | 'denied' | 'unknown' (Firefox/Safari не підтримують запит 'camera').
export async function cameraPermission() {
  try { return (await navigator.permissions.query({ name: 'camera' })).state; }
  catch { return 'unknown'; }
}

function friendlyError(err) {
  const n = err?.name || '';
  if (!window.webgazer) return 'Не завантажився lib/webgazer.js';
  if (!window.isSecureContext || !navigator.mediaDevices) {
    return location.protocol === 'file:'
      ? 'Відкрийте програму через ЗАПУСК.bat (адреса localhost), а не подвійним кліком по файлу'
      : 'Камера працює лише через захищене з’єднання. Відкрийте сайт за адресою https://' + location.host;
  }
  // Chrome повідомляє «Permission denied by system», коли камеру заборонено в самій ОС.
  if (n === 'NotAllowedError' && /system/i.test(err?.message || '')) return OS_BLOCKED_HELP;
  if (n === 'NotAllowedError') return SITE_BLOCKED_HELP;
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Камеру не знайдено. Перевірте, чи вона підключена';
  if (n === 'NotReadableError' || n === 'AbortError') return 'Камера зайнята іншою програмою (Zoom, Teams, «Камера» Windows). Закрийте її';
  return 'Помилка камери: ' + (err?.message || err);
}

export async function startWebcam() {
  emit('cam-status', { text: 'Вмикаю камеру…' });
  try {
    if (!window.webgazer) throw new Error('no webgazer');
    const wg = window.webgazer;
    wg.params.showVideoPreview = true;
    if (store.settings.cameraId) {
      wg.params.camConstraints = { video: { deviceId: { exact: store.settings.cameraId } } };
    }
    await wg.setRegression('ridge')
      .setGazeListener((d) => { feedGaze(d ? d.x : null, d ? d.y : null); })
      .saveDataAcrossSessions(true)
      .applyKalmanFilter(true)
      .begin();
    wg.showPredictionPoints(false);
    wg.removeMouseEventListeners();   // кліки викладача не повинні псувати калібрування
    cam.ready = true;
    startBlinkDetection();
    emit('cam-status', { text: 'Камера працює', ok: true });
    return true;
  } catch (err) {
    console.error(err);
    emit('cam-status', { text: friendlyError(err), error: true });
    return false;
  }
}

export const hasCalibration = () => Boolean(window.webgazer?.getRegression()?.[0]?.getData().length);

// Калібрування винесено у СПІЛЬНИЙ модуль js/gaze/calibration.js — він однаковий для всіх
// додатків eye: гейт «обличчя в кадрі», плавний рух і валідація на окремих точках
// і метрики якості (accuracy °, precision RMS-S2S °, частка валідних даних).
// Повертає повний звіт; сумісність: поле accuracyPx замінює колишню «похибку в px».
export async function calibrate() {
  return runCalibration({ onStatus: (text) => emit('cam-status', { text }), sound: store.settings.sound, eyesStop: store.settings.eyesStop });
}
