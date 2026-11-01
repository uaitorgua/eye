// Нагадування про перерву для очей (правило 20-20-20): делікатний сигнал кожні N хвилин
// АКТИВНОЇ роботи. Лічильник іде лише коли вкладка видима і не на паузі.
// Вимикається налаштуванням breakReminderMin = 0.
import { store } from './store.js';
import { toast } from '../ui/dom.js';
import { beep } from '../gaze/dwell.js';
import { cue } from './cue.js';

let acc = 0;          // секунди активної роботи від останнього нагадування

export function initBreakReminder() {
  setInterval(() => {
    const min = store.settings.breakReminderMin;
    if (!min) { acc = 0; return; }                 // вимкнено
    if (store.paused || document.hidden) return;    // пауза або вкладка неактивна — не рахуємо
    acc += 1;
    if (acc >= min * 60) { acc = 0; remind(); }
  }, 1000);
}

function remind() {
  try { beep(); } catch { /* без звуку */ }
  toast('🌿 Перерва для очей: подивіться 20 секунд на щось далеке (правило 20-20-20)', 9000);
  cue('relax_break', 'Час дати очам відпочинок. Подивіться у далечінь на двадцять секунд.');
}
