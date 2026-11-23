// Екран «📖 Книги»: бібліотека PDF + читанка на весь екран.
// Читання: окремі верхня/нижня смуги керують gaze-scroll, кнопки зібрані у правій рейці.
// Додавання PDF — викладач мишею (кнопка або перетягування файлу на екран).
import { h, toast } from '../ui/dom.js';
import { openModal, tile, choose } from '../ui/modal.js';
import { store, updateSettings } from '../core/store.js';
import { emit, on } from '../core/bus.js';
import { onPointer } from '../gaze/pointer.js';
import { eyes } from '../gaze/blink.js';
import { createEdgeScroller, projectScrollBand } from './edge-scroll.js';
import { PdfView } from './pdf-view.js';
import * as books from './book-store.js';

const LAST_BOOK = 'eyeflow.lastBook';
const $ = (id) => document.getElementById(id);

const broken = new Set();      // книги, які не вдалося відкрити в цьому сеансі
let view, section, currentId = null, gx = -1, gy = -1, pointerAt = -Infinity, saveTimer, libraryModal;
const scroller = createEdgeScroller();
// Тло сторінок: звичайне, тепле (менше відблиску) і темне (для чутливих до яскравого світла).
const THEMES = { paper: 'Тло: біле', sepia: 'Тло: тепле', dark: 'Тло: темне' };

// standalone: окрема сторінка reader.html — «Вихід» стає «Меню» (калібрування, налаштування, перехід у EyeFlow).
let standalone = false;

export function initReader({ standalone: alone = false } = {}) {
  standalone = alone;
  section = $('reader-section');
  const viewEl = $('reader-view');
  view = new PdfView(viewEl, $('reader-pages'), { onChange: onViewChange });

  const bind = (id, fn) => $(id).addEventListener('dwell', fn);
  bind('rd-exit', () => (standalone ? openStandaloneMenu() : closeReader()));
  if (standalone) $('rd-exit').querySelector('.tile-label').textContent = 'Меню';
  bind('rd-library', openLibrary);
  bind('rd-zoom-out', () => view.zoomBy(1 / 1.25));
  bind('rd-zoom-in', () => view.zoomBy(1.25));
  bind('rd-fit', () => view.applyZoom(1));
  // «Назад»: якщо сторінку вже прокручено — на її початок, інакше на попередню.
  bind('rd-prev', () => { const p = view.position(); turnTo(p.frac > 0.05 ? p.page : p.page - 1); });
  bind('rd-next', () => turnTo(view.position().page + 1));
  bind('rd-auto', () => updateSettings({ readerAutoScroll: !store.settings.readerAutoScroll }));
  bind('rd-pause', () => emit('toggle-pause'));
  bind('rd-theme', () => {
    const keys = Object.keys(THEMES);
    updateSettings({ readerTheme: keys[(Math.max(0, keys.indexOf(store.settings.readerTheme)) + 1) % keys.length] });
  });
  const step = (dir) => viewEl.scrollBy({ top: dir * viewEl.clientHeight * 0.8,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('rd-hint-top').addEventListener('click', () => step(-1));
  $('rd-hint-bottom').addEventListener('click', () => step(1));
  bind('rd-more', () => {
    const more = section.querySelector('.rd-rail').classList.toggle('more');
    $('rd-more').querySelector('.tile-label').textContent = more ? 'Готово' : 'Ще';
  });
  on('settings-changed', renderBar);
  on('pause-changed', renderBar);

  onPointer((x, y) => { gx = x; gy = y; pointerAt = performance.now(); });
  requestAnimationFrame(scrollLoop);

  // Викладач: перетягнути PDF на екран.
  section.addEventListener('dragover', (e) => e.preventDefault());
  section.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

  renderBar();
  // Клавіатура (і для помічника, і для перемикачів-кнопок, що імітують клавіші).
  document.addEventListener('keydown', onKey);

  if (standalone || location.hash === '#books' || location.hash === '#/books') openReader();
}

function onKey(e) {
  if (section.classList.contains('hidden') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (document.querySelector('#modal-layer > .modal, [data-gaze-block]')) return;
  if (e.target?.closest?.('input, textarea, select')) return;
  const el = $('reader-view'), inView = el.contains(e.target);
  const onButton = e.target?.closest?.('button');
  const scroll = (top) => el.scrollBy({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  let done = true;
  switch (e.key) {
    case 'Escape': if (standalone) openStandaloneMenu(); else $('rd-exit').dispatchEvent(new CustomEvent('dwell', { bubbles: true })); break;
    case '+': case '=': view.zoomBy(1.25); break;
    case '-': case '_': view.zoomBy(1 / 1.25); break;
    case '0': view.applyZoom(1); break;
    // Поза сторінками (фокус на кнопці рейки) браузер сам не гортає — робимо це тут.
    case 'PageDown': if (inView) done = false; else scroll(el.clientHeight * 0.85); break;
    case 'PageUp': if (inView) done = false; else scroll(-el.clientHeight * 0.85); break;
    case 'ArrowDown': if (inView) done = false; else scroll(60); break;
    case 'ArrowUp': if (inView) done = false; else scroll(-60); break;
    // Стрілки вбік — сторінка вперед/назад, якщо збільшена сторінка не потребує прокрутки вбік.
    case 'ArrowRight': if (view.canScrollX && inView) done = false; else $('rd-next').dispatchEvent(new CustomEvent('dwell')); break;
    case 'ArrowLeft': if (view.canScrollX && inView) done = false; else $('rd-prev').dispatchEvent(new CustomEvent('dwell')); break;
    case 'Home': if (inView || onButton) view.goToPage(1); else done = false; break;
    case 'End': if (inView || onButton) view.goToPage(view.pageCount); else done = false; break;
    default: done = false;
  }
  if (done) e.preventDefault();
}

export async function openReader() {
  section.classList.remove('hidden');
  // Меню під читанкою — недосяжне для клавіатури й читача екрана, поки читаємо.
  const home = $('home-section');
  if (home && !standalone) home.inert = true;
  if (currentId) { focusView(); return; }
  try {
    const last = localStorage.getItem(LAST_BOOK);
    if (last && await books.getBook(last)) return openBook(last);
  } catch { /* The library displays the storage error and recovery options. */ }
  openLibrary();
}

async function openStandaloneMenu() {
  const a = await choose('☰ Меню', [
    { label: store.settings.mode === 'head' ? 'Центрувати голову' : 'Калібрувати', icon: '🎯', value: 'calib' },
    { label: 'Спосіб керування', icon: '🔄', value: 'mode', sub: { webcam: 'Зараз: погляд', head: 'Зараз: голова', mouse: 'Зараз: миша' }[store.settings.mode] },
    { label: 'Налаштування', icon: '⚙', value: 'settings' },
    { label: 'Блок-схеми EyeFlow', icon: '🧩', value: 'eyeflow' },
  ], { cols: 2 });
  if (a === 'calib') emit('calibrate');
  if (a === 'mode') emit('choose-mode');
  if (a === 'settings') (await import('../ui/settings.js')).openSettings();
  if (a === 'eyeflow') { saveNow(); location.href = 'index.html'; }
}

export function closeReader() {
  clearTimeout(saveTimer);
  saveNow();
  setDotDim(false);           // повертаємо яскраву точку за межами читанки
  section.querySelector('.rd-rail').classList.remove('more');
  $('rd-more').querySelector('.tile-label').textContent = 'Ще';
  section.classList.add('hidden');
  const home = $('home-section');
  if (home && !standalone) {
    home.inert = false;
    if (section.contains(document.activeElement) || document.activeElement === document.body) home.querySelector('[data-system="books"]')?.focus({ preventScroll: true });
  }
  if (!standalone && location.hash === '#/books') history.replaceState(null, '', '#/');
}

// Перехід на сторінку кнопкою: коротка табличка «Стор. N» посередині — видно, що сталось і де ти тепер.
function turnTo(n) {
  if (!view.doc) return;
  const page = Math.min(view.pageCount, Math.max(1, n));
  view.goToPage(page);
  let pill = section.querySelector('.rd-page-pill');
  if (!pill) { pill = h('div', { class: 'rd-page-pill', 'aria-hidden': 'true' }); section.querySelector('.rd-reading').appendChild(pill); }
  pill.textContent = page === view.pageCount && n > view.pageCount ? 'Остання сторінка' : `Стор. ${page} з ${view.pageCount}`;
  pill.classList.remove('show'); void pill.offsetWidth; pill.classList.add('show');
}

// Фокус на сторінках — щоб PageDown, стрілки й пробіл одразу гортали книгу.
function focusView() {
  if (document.querySelector('#modal-layer > .modal')) return;
  requestAnimationFrame(() => $('reader-view').focus({ preventScroll: true }));
}

// ---------- прокрутка поглядом ----------
let prev = 0;
function scrollLoop(now) {
  requestAnimationFrame(scrollLoop);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const active = !section.classList.contains('hidden') && view.doc && store.settings.readerAutoScroll
    && !store.paused && !eyes.closed && !document.hidden
    && (store.settings.mode === 'mouse' || now - pointerAt < 500)
    && !document.querySelector('#modal-layer > .modal, [data-gaze-block]');
  const el = $('reader-view');
  if (!active || gx < 0) { scroller.reset(); setHints(null, 0); setDotDim(false); return; }
  const r = el.getBoundingClientRect();
  const point = projectScrollBand(gx, gy, r,
    $('rd-hint-top').getBoundingClientRect(), $('rd-hint-bottom').getBoundingClientRect());
  const v = scroller.update(point.x, point.y, r, now, {
    canX: !point.inBand && view.canScrollX,
    canY: point.inBand && el.scrollHeight > el.clientHeight + 2,
    maxSpeed: store.settings.readerScrollSpeed,
  });
  setHints(v.zone, v.ready);
  if (v.vx || v.vy) el.scrollBy(v.vx * dt, v.vy * dt);
  // Точка погляду не має закривати слова: у зоні тексту робимо її ледь помітною,
  // а біля країв (прокрутка) чи над кнопками — знову яскравою, щоб було видно, куди дивишся.
  const inside = gx >= r.left && gx <= r.right && gy >= r.top && gy <= r.bottom;
  setDotDim(inside && !v.zone);
}

function setDotDim(dim) {
  const dot = $('gaze-dot');
  if (dot) dot.style.opacity = dim ? '0.35' : '1';
}

function setHints(zone, ready) {
  // Смуга наповнюється, поки триває затримка перед рухом, а синє світіння заходить на текст —
  // так видно, що прокрутка зараз почнеться і в який бік.
  for (const z of ['top', 'bottom']) {
    const on = zone === z;
    const band = $('rd-hint-' + z);
    band.style.setProperty('--scroll-progress', on ? (0.12 + 0.88 * ready).toFixed(2) : 0);
    band.classList.toggle('scrolling', on && ready >= 1);
    $('rd-glow-' + z).style.opacity = on ? (0.2 + 0.8 * ready).toFixed(2) : 0;
  }
  for (const z of ['left', 'right']) {
    const hint = $('rd-hint-' + z);
    hint.style.opacity = zone === z ? (0.25 + 0.6 * ready).toFixed(2) : 0;
  }
}

// ---------- стан панелі ----------
function onViewChange() {
  // Сховану читанку не зберігаємо: її розміри нульові, і місце читання вийшло б хибним.
  if (!view.doc || section.classList.contains('hidden') || !$('reader-view').clientHeight) return;
  const { page } = view.position();
  $('rd-page').textContent = `стор. ${page} з ${view.pageCount}`;
  if (page !== lastPage) { lastPage = page; announce(`Сторінка ${page} з ${view.pageCount}`); }
  // Смужка прогресу під назвою і стан смуг на початку/в кінці книги.
  const el = $('reader-view'), max = el.scrollHeight - el.clientHeight;
  section.style.setProperty('--read-progress', max > 0 ? Math.min(1, el.scrollTop / max).toFixed(4) : 0);
  setBandEnd('top', max <= 0 || el.scrollTop <= 1, 'Початок', 'Вгору');
  setBandEnd('bottom', max <= 0 || el.scrollTop >= max - 1, 'Кінець книги', 'Вниз');
  $('rd-fit').querySelector('.tile-label').textContent = view.zoom === 1 ? 'По ширині' : Math.round(view.zoom * 100) + '%';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

let lastPage = 0, announceTimer;
// Читач екрана чує номер сторінки, лише коли вона змінилась, і не частіше ніж раз на 0,6 с.
function announce(text) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { const live = $('rd-live'); if (live) live.textContent = text; }, 600);
}

function setBandEnd(z, atEnd, endLabel, label) {
  const band = $('rd-hint-' + z);
  if (band.classList.contains('at-end') === atEnd) return;
  band.classList.toggle('at-end', atEnd);
  band.setAttribute('aria-disabled', String(atEnd));
  band.querySelector('.rd-band-label').textContent = atEnd ? endLabel : label;
}

function saveNow() {
  if (currentId && view.doc) books.saveProgress({ id: currentId, ...view.position(), zoom: view.zoom })
    .catch(() => toast('Не вдалося зберегти місце читання. Перевірте пам’ять браузера.', 6000));
}

function renderBar() {
  const s = store.settings;
  $('rd-auto').querySelector('.tile-label').textContent = s.readerAutoScroll ? 'Прокрутка: так' : 'Прокрутка: ні';
  $('rd-auto').classList.toggle('active', s.readerAutoScroll);
  $('rd-auto').setAttribute('aria-pressed', s.readerAutoScroll);
  $('rd-pause').querySelector('.tile-label').textContent = store.paused ? 'Продовжити' : 'Пауза';
  const theme = THEMES[s.readerTheme] ? s.readerTheme : 'paper';
  section.dataset.theme = theme;
  $('rd-theme').querySelector('.tile-label').textContent = THEMES[theme];
}

// ---------- книги ----------
async function openBook(id) {
  const before = { title: $('rd-title').textContent, page: $('rd-page').textContent };
  try {
    const book = await books.getBook(id);
    if (!book) throw new Error('Book not found');
    saveNow();
    $('rd-title').textContent = book.name;
    $('rd-title').title = book.name;            // повна назва при наведенні, якщо обрізана
    $('rd-page').textContent = 'Відкриваю…';
    const pages = await view.open(await book.data.arrayBuffer());
    broken.delete(id);
    currentId = id;
    try { localStorage.setItem(LAST_BOOK, id); }
    catch { toast('Книгу відкрито, але браузер не запам’ятає її для наступного разу.', 6000); }
    books.setBookPages(id, pages).catch(() => {});
    const p = await books.getProgress(id).catch(() => { toast('Не вдалося відновити місце читання.', 6000); return null; });
    if (p) { view.applyZoom(p.zoom || 1); view.setPosition(p); }
    onViewChange();
    if (p && (p.page > 1 || p.frac > 0.02)) toast(`Продовжуємо з того місця, де зупинились: стор. ${p.page}`, 3500);
    focusView();
  } catch (e) {
    console.error(e);
    broken.add(id);
    if (currentId && view.doc) {
      // Попередня книга лишилась відкритою (новий файл не завантажився) — повертаємо її назву.
      $('rd-title').textContent = before.title;
      $('rd-page').textContent = before.page;
    } else {
      currentId = null;
      $('rd-title').textContent = 'Книги';
      $('rd-page').textContent = '';
    }
    toast('Не вдалося відкрити цей PDF: файл пошкоджений або не є PDF. Оберіть іншу книгу.', 6000);
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
      const sub = deleting ? 'Обрати для видалення' : broken.has(b.id) ? 'Файл пошкоджено — краще видалити'
        : b.pages ? `Стор. ${p?.page || 1} з ${b.pages}` : 'Відкрити';
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
      if (broken.has(b.id)) bookTile.classList.add('broken');
      // Скільки прочитано — тонка смужка внизу плитки.
      if (b.pages && p?.page) bookTile.style.setProperty('--book-progress', Math.min(1, (p.page - 1 + (p.frac || 0)) / b.pages).toFixed(3));
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
