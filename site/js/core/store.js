// Стан застосунку і збереження в localStorage.
import { emit } from './bus.js';
import { emptyProgram } from '../model/program.js';

const KEY_PROGRAM = 'eyeflow.program';
const KEY_SETTINGS = 'eyeflow.settings';
const KEY_SLOT = (n) => 'eyeflow.slot.' + n;

export const DEFAULT_SETTINGS = {
  mode: null,          // 'webcam' | 'mouse' (миша або апаратний трекер, що рухає курсор)
  cameraId: null,      // ідентифікатор обраної камери
  dwellMs: 2000,       // скільки дивитися, щоб «натиснути» (1,2 с виявилось замало — випадкові кліки)
  smoothing: 0.75,     // 0 — без згладжування, 0.95 — дуже плавно
  snap: 70,            // «магніт»: на скільки px погляд може промахнутися повз ціль
  zoom: 1,             // масштаб блок-схеми
  sound: true,         // звук при натисканні
  showDot: true,       // показувати точку погляду
  clickMode: 'dwell',  // клік: 'dwell' (затримка) | 'doubleblink' (подвійне кліпання) | 'longclose' (довге закриття очей)
  longCloseMs: 1200,   // скільки тримати очі закритими для 'longclose'
  voiceEnabled: true,  // автоозвучка (TTS)
  lang: 'uk',          // мова озвучки ('uk' або 'en')
  readerAutoScroll: true, // читанка: прокрутка поглядом біля верхнього/нижнього краю
  readerScrollSpeed: 350,  // її найбільша швидкість, px/с
  runSpeedMs: 900,     // пауза між кроками при запуску
  autoCalibrate: true, // калібрувати при кожному запуску
  breakReminderMin: 20, // нагадування про перерву для очей, хв (0 — вимкнено)
  settingsVersion: 2,  // версія схеми налаштувань — для міграцій у migrate()
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* немає сховища */ }
}

// Старі збережені налаштування → актуальні значення.
function migrate(s) {
  if (!['dwell', 'doubleblink', 'longclose'].includes(s.clickMode)) s.clickMode = s.clickMode === 'blink' ? 'doubleblink' : 'dwell';
  // v2: стара типова затримка 1,2 с → 2 с. Значення, яке помічник змінив вручну, не чіпаємо.
  if ((s.settingsVersion || 1) < 2) {
    if (s.dwellMs === 1200) s.dwellMs = 2000;
    s.settingsVersion = 2;
  }
  return s;
}

export const store = {
  program: read(KEY_PROGRAM, null) || emptyProgram(),
  settings: migrate({ ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) }),
  running: false,     // чи виконується програма (редагування заблоковане)
  paused: false,      // пауза погляду (нічого не натискається)
};

// Викликати після будь-якої зміни програми.
export function programChanged() {
  write(KEY_PROGRAM, store.program);
  emit('program-changed', store.program);
}

export function setProgram(program) {
  store.program = program;
  programChanged();
}

export function updateSettings(patch) {
  Object.assign(store.settings, patch);
  write(KEY_SETTINGS, store.settings);
  emit('settings-changed', store.settings);
}

export function saveSlot(n) { write(KEY_SLOT(n), { program: store.program, savedAt: Date.now() }); }
export function loadSlot(n) { return read(KEY_SLOT(n), null); }
