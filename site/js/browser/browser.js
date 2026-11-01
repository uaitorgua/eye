// Підсистема «Браузер»: помічник відкриває сайт (закладка або адреса), людина сама читає й переходить очима.
// Сторінку спрощує сервер (browser.php): приходить лише текст і посилання, без скриптів і дрібних кнопок.
//
// Читання: прокрутка поглядом у верхній/нижній смузі (спільний edge-scroll з Читанки).
// Посилання: не дрібні лінки в тексті, а плитка «🔗 Посилання» → великі плитки з посиланнями видимої частини.
import { store } from '../core/store.js';
import { emit, on } from '../core/bus.js';
import { h, toast } from '../ui/dom.js';
import { choose } from '../ui/modal.js';
import { keyboard } from '../ui/editors.js';
import { onPointer } from '../gaze/pointer.js';
import { eyes } from '../gaze/blink.js';
import { createEdgeScroller } from '../reader/edge-scroll.js';
import { visibleLinks, pageOf } from './links.js';

const $ = (id) => document.getElementById(id);
const LAST_URL = 'eyeflow.browser.last';
const LINKS_PER_PAGE = 8;
const FONT_STEPS = [22, 26, 30, 36, 42];

let section, view, sites = [];
let backStack = [];          // стек адрес для «Назад»
let page = null;             // { url, title, blocks }
let fontStep = 2;
let gx = -1, gy = -1;
const scroller = createEdgeScroller();

export function initBrowser() {
  section = $('browser-section');
  view = $('br-view');
  const bind = (id, fn) => $(id).addEventListener('dwell', fn);
  bind('br-back', goBack);
  bind('br-sites', openSites);
  bind('br-links', openLinks);
  bind('br-up', () => view.scrollBy({ top: -view.clientHeight * 0.8, behavior: 'smooth' }));
  bind('br-down', () => view.scrollBy({ top: view.clientHeight * 0.8, behavior: 'smooth' }));
  bind('br-font', () => { fontStep = (fontStep + 1) % FONT_STEPS.length; applyFont(); });
  bind('br-pause', () => emit('toggle-pause'));
  on('pause-changed', (p) => { $('br-pause').querySelector('.tile-label').textContent = p ? 'Продовжити' : 'Пауза'; });

  onPointer((x, y) => { gx = x; gy = y; });
  requestAnimationFrame(scrollLoop);
  applyFont();
}

export async function openBrowser() {
  section.classList.remove('hidden');
  if (page) return;
  const last = localStorage.getItem(LAST_URL);
  if (last) load(last, { push: false });
  else openSites();
}

export function closeBrowser() {
  section.classList.add('hidden');
}

// ---------- завантаження ----------
async function load(url, { push = true } = {}) {
  $('br-title').textContent = 'Відкриваю…';
  $('br-host').textContent = hostOf(url);
  try {
    const res = await fetch('browser.php?url=' + encodeURIComponent(url), { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Не вдалося відкрити сторінку');
    if (push && page) backStack.push(page.url);
    page = data;
    localStorage.setItem(LAST_URL, data.url);
    render();
  } catch (e) {
    $('br-title').textContent = page ? page.title : 'Браузер';
    $('br-host').textContent = page ? hostOf(page.url) : '';
    toast(e.message, 5000);
    if (!page) openSites();
  }
}

function render() {
  $('br-title').textContent = page.title;
  $('br-host').textContent = hostOf(page.url);
  view.replaceChildren(...page.blocks.map((b, i) =>
    h(b.t === 'h' ? 'h2' : 'p', { class: 'br-block' + (b.links.length ? ' has-links' : ''), 'data-i': i }, b.text)));
  view.scrollTop = 0;
  $('br-back').disabled = backStack.length === 0;
}

function goBack() {
  const prev = backStack.pop();
  if (prev) load(prev, { push: false });
  else toast('Це перша сторінка');
}

// ---------- закладки й адреса ----------
async function openSites() {
  if (!sites.length) {
    try { sites = (await (await fetch('browser.php?sites')).json()).sites || []; }
    catch { sites = []; }
  }
  const choice = await choose('🔖 Куди підемо?', [
    ...sites.map((s) => ({ label: s.title, icon: s.icon || '🌐', sub: hostOf(s.url), value: s.url })),
    { label: 'Адреса (помічник)', icon: '⌨', sub: 'ввести на клавіатурі', value: '__address' },
  ], { cols: 3 });
  if (!choice) return;
  if (choice === '__address') {
    const typed = await keyboard('Адреса сайту', page ? page.url : 'https://');
    if (typed && typed.trim()) load(typed.trim());
    return;
  }
  load(choice);
}

// ---------- посилання ----------
async function openLinks(_e, start = 0) {
  if (!page) return openSites();
  const links = visibleLinks(page.blocks, [...view.querySelectorAll('.br-block')], view.getBoundingClientRect());
  if (!links.length) return toast('На екрані немає посилань. Прокрутіть сторінку');
  const { items, hasMore, next } = pageOf(links, start, LINKS_PER_PAGE);
  const options = items.map((l) => ({
    label: l.text, icon: l.allowed ? '🔗' : '🚫', sub: l.allowed ? hostOf(l.href) : 'сайт не дозволено', value: l,
  }));
  if (hasMore) options.push({ label: 'Ще посилання', icon: '➡', value: '__more' });
  const pick = await choose(`🔗 Посилання (${links.length})`, options, { cols: 3 });
  if (pick === '__more') return openLinks(null, next);
  if (!pick) return;
  if (!pick.allowed) return toast('Цього сайту немає в списку дозволених. Помічник може додати його');
  load(pick.href);
}

// ---------- прокрутка поглядом ----------
let prev = 0;
function scrollLoop(now) {
  requestAnimationFrame(scrollLoop);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const active = !section.classList.contains('hidden') && page && store.settings.readerAutoScroll
    && !store.paused && !eyes.closed && !document.querySelector('#modal-layer > .modal');
  if (!active || gx < 0) { scroller.reset(); setHint(null, 0); return; }
  const v = scroller.update(gx, gy, view.getBoundingClientRect(), now, { maxSpeed: store.settings.readerScrollSpeed });
  setHint(v.zone, v.ready);
  if (v.vy) view.scrollBy(0, v.vy * dt);
}

function setHint(zone, ready) {
  for (const z of ['top', 'bottom']) {
    $('br-hint-' + z).style.opacity = zone === z ? (0.25 + 0.6 * ready).toFixed(2) : 0;
  }
}

function applyFont() {
  view.style.fontSize = FONT_STEPS[fontStep] + 'px';
  $('br-font').querySelector('.tile-label').textContent = 'Шрифт ' + (fontStep + 1) + '/' + FONT_STEPS.length;
}

function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
}
