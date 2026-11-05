// Екран «📖 Книги»: бібліотека PDF + читанка на весь екран.
// Читання: погляд у нижній/верхній смузі тексту плавно прокручує (edge-scroll.js),
// знизу — панель великих кнопок: масштаб, гортання сторінок, прокрутка очима вкл/викл, пауза.
// Додавання PDF — викладач мишею (кнопка або перетягування файлу на екран).
import { h, toast } from '../ui/dom.js';
import { openModal, tile, choose } from '../ui/modal.js';
import { store, updateSettings } from '../core/store.js';
import { emit, on } from '../core/bus.js';
import { onPointer } from '../gaze/pointer.js';
import { eyes } from '../gaze/blink.js';
import { createEdgeScroller } from './edge-scroll.js';
import { PdfView } from './pdf-view.js';
import * as books from './book-store.js';

const LAST_BOOK = 'eyeflow.lastBook';
const $ = (id) => document.getElementById(id);

let view, section, currentId = null, gx = -1, gy = -1, saveTimer, libraryModal;
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
  // Вузькі екрани: основні кнопки в панелі, решта — на сторінці «Ще».
  bind('rd-more', () => {
    const more = $('reader-section').querySelector('.rd-bar').classList.toggle('more');
    $('rd-more').querySelector('.tile-label').textContent = more ? 'Готово' : 'Ще';
  });
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
  if (currentId) return;
  try {
    const last = localStorage.getItem(LAST_BOOK);
    if (last && await books.getBook(last)) return openBook(last);
  } catch { /* The library displays the storage error and recovery options. */ }
  openLibrary();
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
  $('reader-section').querySelector('.rd-bar').classList.remove('more');
  $('rd-more').querySelector('.tile-label').textContent = 'Ще';
  section.classList.add('hidden');
  if (!standalone && location.hash === '#/books') history.replaceState(null, '', '#/');
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
  if (currentId && view.doc) books.saveProgress({ id: currentId, ...view.position(), zoom: view.zoom })
    .catch(() => toast('Не вдалося зберегти місце читання. Перевірте пам’ять браузера.', 6000));
}

function renderBar() {
  const s = store.settings;
  $('rd-auto').querySelector('.tile-label').textContent = s.readerAutoScroll ? 'Прокрутка: так' : 'Прокрутка: ні';
  $('rd-auto').classList.toggle('active', s.readerAutoScroll);
  $('rd-pause').querySelector('.tile-label').textContent = store.paused ? 'Продовжити' : 'Пауза';
}

// ---------- книги ----------
async function openBook(id) {
  try {
    const book = await books.getBook(id);
    if (!book) throw new Error('Book not found');
    saveNow();
    $('rd-title').textContent = book.name;
    $('rd-page').textContent = 'Відкриваю…';
    const pages = await view.open(await book.data.arrayBuffer());
    currentId = id;
    try { localStorage.setItem(LAST_BOOK, id); }
    catch { toast('Книгу відкрито, але браузер не запам’ятає її для наступного разу.', 6000); }
    books.setBookPages(id, pages).catch(() => {});
    const p = await books.getProgress(id).catch(() => { toast('Не вдалося відновити місце читання.', 6000); return null; });
    if (p) { view.applyZoom(p.zoom || 1); view.setPosition(p); }
    onViewChange();
  } catch (e) {
    console.error(e);
    currentId = null;
    $('rd-title').textContent = 'Книги';
    $('rd-page').textContent = '';
    toast('Не вдалося відкрити PDF. Перевірте файл або оберіть іншу книгу.', 6000);
    openLibrary();
  }
}

async function addFiles(fileList) {
  const pdfs = [...fileList].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return toast('Потрібен файл PDF');
  let lastId;
  try {
    for (const f of pdfs) lastId = await books.addBook(f);
  } catch (e) {
    console.error(e);
    toast('Не вдалося додати всі книги. Перевірте вільне місце в браузері та спробуйте ще раз.', 6000);
    if (libraryModal) { closeLibrary(); openLibrary(); }
    return;
  }
  toast(`Додано книг: ${pdfs.length} ✓`);
  closeLibrary();
  openBook(lastId);
}

function closeLibrary() {
  if (!libraryModal) return;
  libraryModal.close();
  libraryModal = null;
}

function pickFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.multiple = true;
  input.addEventListener('change', () => input.files.length && addFiles(input.files));
  input.click();          // відкриється лише після справжнього кліку мишею (обмеження браузера)
}

// Empty library: a calm illustration instead of a blank page, with the next step spelled out.
function emptyShelf() {
  const art = h('span', { class: 'library-empty-art', 'aria-hidden': 'true' });
  art.innerHTML = '<svg viewBox="0 0 300 220"><path d="M27 64c43-13 83-1 123 21 40-22 80-34 123-21v128c-43-13-83-1-123 21-40-22-80-34-123-21z" fill="#0d3686" transform="translate(0 4)"/>'
    + '<path d="M30 55c42-12 80 0 120 22v124c-40-22-78-34-120-22z" fill="#fffaf0" stroke="#ddd4bf" stroke-width="3"/>'
    + '<path d="M150 77c40-22 78-34 120-22v124c-42-12-80 0-120 22z" fill="#f2ead7" stroke="#ddd4bf" stroke-width="3"/>'
    + '<path d="M150 77v124" stroke="#c8bda2" stroke-width="4"/>'
    + '<path d="M161 198v18l14-9 14 9v-31" fill="#efb21d"/>'
    + '<path d="M75 32 63 18m48 7-2-20m36 24 9-16" stroke="#efb21d" stroke-width="6" stroke-linecap="round"/></svg>';
  return h('div', { class: 'library-empty-state' }, art,
    h('div', { class: 'library-empty-copy' },
      h('p', { class: 'library-empty-title' }, 'Полиця поки порожня'),
      h('p', { class: 'library-empty' }, 'Спробуй коротку пробну книгу. Дорослий може додати власні PDF.')));
}

async function openLibrary() {
  if (libraryModal) return;
  const m = libraryModal = openModal({ title: 'Мої книги', cls: 'library' });
  let list = [], progress = {}, page = 0, deleting = false, loadingSample = false;
  const pageSize = 4;
  const exit = () => { closeLibrary(); if (!currentId && !standalone) closeReader(); };
  const refresh = async () => {
    try {
      list = await books.listBooks();
      progress = Object.fromEntries(await Promise.all(list.map(async b => [b.id, await books.getProgress(b.id)])));
      page = Math.min(page, Math.max(0, Math.ceil(list.length / pageSize) - 1));
      render();
    } catch (e) {
      console.error(e);
      m.body.replaceChildren(h('p', { class: 'library-empty', role: 'alert' }, 'Не вдалося відкрити бібліотеку. Перевірте доступ до пам’яті браузера та спробуйте ще раз.'),
        h('div', { class: 'library-tools' }, tile('Спробувати ще', refresh), tile('Вийти', exit, { always: true })));
    }
  };
  const render = () => {
    const focused = m.body.contains?.(document.activeElement);
    const focusBook = document.activeElement?.getAttribute?.('data-book-id');
    const focusClass = ['library-prev', 'library-next', 'library-delete', 'library-add', 'library-sample', 'library-exit', 'book']
      .find(cls => document.activeElement?.classList?.contains(cls));
    const count = Math.max(1, Math.ceil(list.length / pageSize));
    const items = list.slice(page * pageSize, (page + 1) * pageSize).map(b => {
      const p = progress[b.id];
      const sub = deleting ? 'Обрати для видалення' : b.pages ? `Стор. ${p?.page || 1} з ${b.pages}` : 'Відкрити';
      const bookTile = tile(b.name, async () => {
        if (!deleting) { closeLibrary(); return openBook(b.id); }
        if (!await choose('Видалити «' + b.name + '»?', [{ label: 'Так, видалити', value: true, cls: 'danger' }], { cols: 2 })) return;
        try {
          await books.deleteBook(b.id);
          if (b.id === currentId) { view.close(); currentId = null; try { localStorage.removeItem(LAST_BOOK); } catch { /* storage unavailable */ } }
          await refresh();
        } catch (e) { console.error(e); toast('Не вдалося видалити книгу. Спробуйте ще раз.', 6000); }
      }, { sub, cls: 'book' });
      bookTile.setAttribute('data-book-id', b.id);
      return bookTile;
    });
    const content = list.length ? h('div', { class: 'library-books' }, ...items) : emptyShelf();
    const previous = tile('Назад', () => { page--; render(); }, { cls: 'library-prev' });
    const next = tile('Далі', () => { page++; render(); }, { cls: 'library-next' });
    previous.disabled = page === 0;
    next.disabled = page >= count - 1;
    const pagination = h('nav', { class: 'library-pages', 'aria-label': 'Сторінки бібліотеки' }, previous,
      h('span', { class: 'library-page', 'aria-live': 'polite' }, `${page + 1} / ${count}`), next);
    const tryReading = tile(loadingSample ? 'Відкриваємо…' : 'Спробувати читання', async () => {
      if (loadingSample) return;
      loadingSample = true; render();
      try {
        const response = await fetch('assets/books/first-reading.pdf');
        if (!response.ok) throw new Error('Sample unavailable');
        const file = new File([await response.blob()], 'Перше читання.pdf', { type: 'application/pdf' });
        if (libraryModal !== m) return;
        await addFiles([file]);
      } catch (error) {
        console.error(error);
        toast('Не вдалося відкрити зразок. Спробуйте ще раз або додайте власний PDF.', 6000);
      } finally {
        loadingSample = false;
        if (libraryModal === m) render();
      }
    }, { cls: 'library-sample', sub: 'Коротка пробна книга' });
    tryReading.disabled = loadingSample;
    const tools = h('div', { class: 'library-tools' },
      ...(!list.length ? [tryReading] : []),
      tile('Додати PDF', pickFiles, { sub: 'Для дорослого', cls: 'library-add' }),
      ...(list.length ? [tile(deleting ? 'Скасувати видалення' : 'Видалити книгу', () => { deleting = !deleting; render(); }, { cls: 'library-delete' })] : []),
      tile(currentId ? 'До книги' : (standalone ? 'Закрити' : 'Меню'), exit, { cls: 'library-exit', always: true }));
    m.body.replaceChildren(...(deleting ? [h('p', { class: 'library-instruction' }, 'Оберіть книгу для видалення.')] : []), content,
      ...(count > 1 ? [pagination] : []), tools);
    if (focused) {
      const sameBook = focusBook && [...m.body.querySelectorAll('.book')].find(node => node.getAttribute('data-book-id') === focusBook);
      const same = sameBook || (focusClass && m.body.querySelector(`.${focusClass}:not(:disabled)`));
      (same || m.body.querySelector('.book, .library-exit, .library-add'))?.focus();
    }
  };
  m.body.append(h('p', { class: 'library-empty', role: 'status' }, 'Завантажуємо бібліотеку…'),
    h('div', { class: 'library-tools' }, tile('Вийти', exit, { always: true })));
  m.el.addEventListener('dragover', (e) => e.preventDefault());
  m.el.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
  await refresh();
}
