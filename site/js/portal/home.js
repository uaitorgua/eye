// Головне вікно: людина поглядом обирає підсистему. Кожна підсистема працює на спільному рушії
// (gaze/*, core/store.js, модалки), тож камера й калібрування не перезапускаються при переході.
//
// Маршрути (#hash) — щоб помічник міг дати пряме посилання:
//   #/ або порожньо — меню · #/flow — Алгоритми · #/books — Книги · #/tetris — Тетріс · #/browser — Браузер
import { on, emit } from '../core/bus.js';
import { store } from '../core/store.js';
import { toast } from '../ui/dom.js';
import { openSettings } from '../ui/settings.js';
import { openTetris, closeTetris } from '../tetris/tetris.js';
import { openReader, closeReader } from '../reader/reader.js';
import { openBrowser, closeBrowser } from '../browser/browser.js';
import { openRelax, closeRelax } from '../relax/relax.js';
import { cue } from '../core/cue.js';
import { iconElement } from '../ui/icons.js';
import * as books from '../reader/book-store.js';

// Озвучення плиток меню, коли на них потрапляє погляд (для незрячих / слабозорих).
const TILE_SAY = {
  books: 'Книги', flow: 'Алгоритми', browser: 'Браузер',
  tetris: 'Тетріс', trainer: 'Вправи для погляду',
};

const $ = (id) => document.getElementById(id);

// Підсистема: відкрити → повернутися в меню. «soon» — ще в розробці.
const SYSTEMS = {
  books:   { open: () => openReader(), close: () => closeReader() },
  flow:    { open: () => {},          close: () => {} },      // Алгоритми — основний екран під меню
  tetris:  { open: () => openTetris(), close: () => closeTetris() },
  browser: { open: () => openBrowser(), close: () => closeBrowser() },
  trainer: { open: () => openRelax(), close: () => closeRelax() },
};

let current = null;

export function showHome() {
  if (current && SYSTEMS[current]?.close) SYSTEMS[current].close();
  current = null;
  $('home-section').classList.remove('hidden');
  syncFlowInert();
  refreshContinue();
  if (location.hash && location.hash !== '#/') history.replaceState(null, '', '#/');
}

// «Продовжити: назва, стор. N» на плитці Книг — одразу видно, до чого повертаєшся.
// Затримка: читанка зберігає місце асинхронно саме в момент виходу.
let continueTimer;
function refreshContinue() {
  clearTimeout(continueTimer);
  continueTimer = setTimeout(async () => {
    const sub = document.querySelector('#home-section .books .tile-sub');
    if (!sub) return;
    try {
      const id = localStorage.getItem('eyeflow.lastBook');
      const meta = id && (await books.listBooks()).find(b => b.id === id);
      const p = meta && await books.getProgress(id);
      sub.textContent = meta ? `Продовжити: ${meta.name}${p?.page ? ', стор. ' + p.page : ''}` : 'Підручники й читання';
      sub.classList.toggle('home-continue', !!meta);
    } catch { /* сховище недоступне — лишаємо звичайний підпис */ }
  }, 350);
}

// Екран алгоритмів лежить під меню. Поки меню видно, його кнопки не мають ловити Tab і читач екрана.
// (Погляд їх і так не бачить: меню повністю їх закриває.)
function syncFlowInert() {
  const covered = !$('home-section').classList.contains('hidden');
  for (const id of ['toolbar', 'main']) { const n = $(id); if (n) n.inert = covered; }
}

export function openSystem(name) {
  const sys = SYSTEMS[name];
  if (!sys) return showHome();
  if (sys.soon) return toast(sys.soon, 3000);
  current = name;
  // Алгоритми — це екран під меню, тому меню ховаємо; Книги й Тетріс — власні шари поверх меню.
  $('home-section').classList.toggle('hidden', name === 'flow');
  syncFlowInert();
  sys.open();
  history.replaceState(null, '', '#/' + name);
}

export function initHome() {
  $('home-status').textContent = $('cam-status').textContent === '…' ? 'Оберіть спосіб керування' : $('cam-status').textContent;
  $('home-status').className = $('cam-status').className;
  const tiles = [...document.querySelectorAll('#home-section [data-system]')];
  for (const tile of tiles) {
    tile.addEventListener('dwell', () => openSystem(tile.dataset.system));
  }
  // Коли погляд затримується на плитці (клас dwell-focus від gaze/dwell.js) — назвати її вголос.
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target;
      const focused = el.classList.contains('dwell-focus');
      if (focused && !el._said) { el._said = true; cue('menu_' + el.dataset.system, TILE_SAY[el.dataset.system]); }
      if (!focused) el._said = false;
    }
  });
  for (const tile of tiles) obs.observe(tile, { attributes: true, attributeFilter: ['class'] });
  $('home-pause').addEventListener('dwell', () => emit('toggle-pause'));
  $('home-settings').addEventListener('dwell', () => openSettings());
  $('btn-home').addEventListener('dwell', () => { if (store.running) toast('Спочатку зупиніть програму'); else showHome(); });

  on('pause-changed', (paused) => {
    $('home-pause').querySelector('.tile-label').textContent = paused ? 'Продовжити' : 'Пауза';
    $('home-pause').classList.toggle('active', paused);
  });
  on('cam-status', ({ text, ok, error }) => {
    const el = $('home-status');
    el.textContent = text;
    el.className = ok ? 'ok' : error ? 'error' : '';
  });

  // Браузер не має власного закриття на кнопці — закриваємо тут.
  $('br-exit').addEventListener('dwell', () => closeBrowser());

  // Вихід із підсистем їхніми кнопками — повертаємо в меню. Підсистема вже закрилася сама.
  for (const id of ['rd-exit', 'btn-tetris-exit', 'btn-tetris-overlay-exit', 'br-exit', 'btn-relax-exit']) {
    const btn = $(id);
    if (!btn) continue;
    btn.addEventListener('dwell', () => { current = null; showHome(); });
    const label = btn.querySelector('.tile-label');
    if (label) label.textContent = 'Меню';
    const icon = btn.querySelector('.tile-icon');
    if (icon) icon.replaceChildren(iconElement('🏠'));
  }

  const route = location.hash.replace(/^#\/?/, '');
  if (route && SYSTEMS[route] && !SYSTEMS[route].soon) openSystem(route);
  else showHome();
}
