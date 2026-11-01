// Екран «📖 Книги»: бібліотека PDF + читанка на весь екран.
// Читання: погляд у нижній/верхній смузі тексту плавно прокручує (edge-scroll.js),
// знизу — панель великих кнопок: масштаб, гортання сторінок, прокрутка очима вкл/викл, пауза.
// Додавання PDF — викладач мишею (кнопка або перетягування файлу на екран).
import { h, toast } from '../ui/dom.js';
import { openModal, tile, grid, choose } from '../ui/modal.js';
import { store, updateSettings } from '../core/store.js';
import { emit, on } from '../core/bus.js';
import { onPointer } from '../gaze/pointer.js';
import { eyes } from '../gaze/blink.js';
import { createEdgeScroller } from './edge-scroll.js';
import { PdfView } from './pdf-view.js';
import * as books from './book-store.js';

const LAST_BOOK = 'eyeflow.lastBook';
const $ = (id) => document.getElementById(id);

let view, section, currentId = null, gx = -1, gy = -1, saveTimer;
const scroller = createEdgeScroller();

// standalone: окрема сторінка reader.html — «Вихід» стає «Меню» (калібрування, налаштування, перехід у EyeFlow).
let standalone = false;

export function initReader({ standalone: alone = false } = {}) {
  standalone = alone;
  section = $('reader-section');
  view = new PdfView($('reader-view'), $('reader-pages'), { onChange: onViewChange });

  const bind = (id, fn) => $(id).addEventListener('dwell', fn);
  bind('rd-exit', () => (standalone ? openStandaloneMenu() : closeReader()));
  if (standalone) $('rd-exit').querySelector('.tile-label').textContent = 'Меню';
  bind('rd-library', openLibrary);
  bind('rd-zoom-out', () => view.zoomBy(1 / 1.25));
  bind('rd-zoom-in', () => view.zoomBy(1.25));
  bind('rd-fit', () => view.applyZoom(1));
  // «Назад»: якщо сторінку вже прокручено — на її початок, інакше на попередню.
  bind('rd-prev', () => { const p = view.position(); view.goToPage(p.frac > 0.05 ? p.page : p.page - 1); });
  bind('rd-next', () => view.goToPage(view.position().page + 1));
  bind('rd-auto', () => updateSettings({ readerAutoScroll: !store.settings.readerAutoScroll }));
  bind('rd-pause', () => emit('toggle-pause'));
  on('settings-changed', renderBar);
  on('pause-changed', renderBar);

  onPointer((x, y) => { gx = x; gy = y; });
  requestAnimationFrame(scrollLoop);

  // Викладач: перетягнути PDF на екран.
  section.addEventListener('dragover', (e) => e.preventDefault());
  section.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

  renderBar();
  if (standalone || location.hash === '#books') openReader();
}

export async function openReader() {
  section.classList.remove('hidden');
  const last = localStorage.getItem(LAST_BOOK);
  if (currentId) return;
  if (last && await books.getBook(last)) openBook(last);
  else openLibrary();
}

async function openStandaloneMenu() {
  const a = await choose('☰ Меню', [
    { label: 'Калібрувати', icon: '🎯', value: 'calib' },
    { label: 'Налаштування', icon: '⚙', value: 'settings' },
    { label: 'Блок-схеми EyeFlow', icon: '🧩', value: 'eyeflow' },
  ], { cols: 2 });
  if (a === 'calib') emit('calibrate');
  if (a === 'settings') (await import('../ui/settings.js')).openSettings();
  if (a === 'eyeflow') { saveNow(); location.href = 'index.html'; }
}

export function closeReader() {
  saveNow();
  setDotDim(false);           // повертаємо яскраву точку за межами читанки
  section.classList.add('hidden');
}

// ---------- прокрутка поглядом ----------
let prev = 0;
function scrollLoop(now) {
  requestAnimationFrame(scrollLoop);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const active = !section.classList.contains('hidden') && view.doc && store.settings.readerAutoScroll
    && !store.paused && !eyes.closed && !document.querySelector('#modal-layer > .modal');
  const el = $('reader-view');
  if (!active || gx < 0) { scroller.reset(); setHints(null, 0); setDotDim(false); return; }
  const r = el.getBoundingClientRect();
  const v = scroller.update(gx, gy, r, now, { canX: view.canScrollX, maxSpeed: store.settings.readerScrollSpeed });
  setHints(v.zone, v.ready);
  if (v.vx || v.vy) el.scrollBy(v.vx * dt, v.vy * dt);
  // Точка погляду не має закривати слова: у зоні тексту робимо її ледь помітною,
  // а біля країв (прокрутка) чи над кнопками — знову яскравою, щоб було видно, куди дивишся.
  const inside = gx >= r.left && gx <= r.right && gy >= r.top && gy <= r.bottom;
  setDotDim(inside && !v.zone);
}

function setDotDim(dim) {
  const dot = $('gaze-dot');
  if (dot) dot.style.opacity = dim ? '0.12' : '1';
}

function setHints(zone, ready) {
  for (const z of ['top', 'bottom', 'left', 'right']) {
    const hint = $('rd-hint-' + z);
    hint.style.opacity = zone === z ? (0.25 + 0.6 * ready).toFixed(2) : 0;
  }
}

// ---------- стан панелі ----------
function onViewChange() {
  if (!view.doc) return;
  const { page } = view.position();
  $('rd-page').textContent = `стор. ${page} з ${view.pageCount}`;
  $('rd-fit').querySelector('.tile-label').textContent = view.zoom === 1 ? 'По ширині' : Math.round(view.zoom * 100) + '%';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

function saveNow() {
  if (currentId && view.doc) books.saveProgress({ id: currentId, ...view.position(), zoom: view.zoom });
}

function renderBar() {
  const s = store.settings;
  $('rd-auto').querySelector('.tile-label').textContent = s.readerAutoScroll ? 'Прокрутка очима: так' : 'Прокрутка очима: ні';
  $('rd-auto').classList.toggle('active', s.readerAutoScroll);
  $('rd-pause').querySelector('.tile-label').textContent = store.paused ? 'Продовжити' : 'Пауза';
}

// ---------- книги ----------
async function openBook(id) {
  const book = await books.getBook(id);
  if (!book) return toast('Книгу не знайдено');
  saveNow();
  $('rd-title').textContent = book.name;
  $('rd-page').textContent = 'Відкриваю…';
  try {
    const pages = await view.open(await book.data.arrayBuffer());
    currentId = id;
    localStorage.setItem(LAST_BOOK, id);
    books.setBookPages(id, pages);
    const p = await books.getProgress(id);
    if (p) { view.applyZoom(p.zoom || 1); view.setPosition(p); }
    onViewChange();
  } catch (e) {
    console.error(e);
    toast('Не вдалося відкрити PDF: ' + e.message, 6000);
  }
}

async function addFiles(fileList) {
  const pdfs = [...fileList].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return toast('Потрібен файл PDF');
  let lastId;
  for (const f of pdfs) lastId = await books.addBook(f);
  toast(`Додано книг: ${pdfs.length} ✓`);
  document.querySelectorAll('#modal-layer > .modal.library').forEach(m => m.remove());
  openBook(lastId);
}

function pickFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.multiple = true;
  input.addEventListener('change', () => input.files.length && addFiles(input.files));
  input.click();          // відкриється лише після справжнього кліку мишею (обмеження браузера)
}

async function openLibrary() {
  const list = await books.listBooks();
  const progress = Object.fromEntries(await Promise.all(list.map(async b => [b.id, await books.getProgress(b.id)])));
  const m = openModal({ title: '📚 Мої книги', cls: 'library' });
  const tiles = list.slice(0, 10).map(b => {
    const p = progress[b.id];
    const sub = b.pages ? `стор. ${p?.page || 1} з ${b.pages}` : 'ще не відкривали';
    return tile(b.name, () => { m.close(); openBook(b.id); }, { icon: b.id === currentId ? '📖' : '📘', sub, cls: 'book' });
  });
  tiles.push(
    tile('Додати PDF', pickFiles, { icon: '➕', sub: 'дорослий: клік мишею або перетягніть файл' }),
    ...(list.length ? [tile('Видалити книгу', async () => {
      const id = await choose('Яку книгу видалити?', list.map(b => ({ label: b.name, value: b.id, icon: '📘' })), { cols: 3 });
      if (!id || !await choose('Точно видалити книгу?', [{ label: 'Так, видалити', icon: '🗑', value: true, cls: 'danger' }], { cols: 2 })) return;
      await books.deleteBook(id);
      if (id === currentId) { view.close(); currentId = null; localStorage.removeItem(LAST_BOOK); }
      m.close(); openLibrary();
    }, { icon: '🗑', cls: 'danger' })] : []),
    tile(currentId ? 'Назад до книги' : (standalone ? 'Закрити' : 'Вийти'), () => { m.close(); if (!currentId && !standalone) closeReader(); }, { icon: '✕', cls: 'cancel' }));
  if (!list.length) m.body.appendChild(h('p', { class: 'library-empty' }, 'Бібліотека порожня. Дорослий додає PDF-підручники кнопкою «Додати PDF» або перетягує файли на цей екран.'));
  m.body.appendChild(grid(4, ...tiles));
  m.el.addEventListener('dragover', (e) => e.preventDefault());
  m.el.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
}
