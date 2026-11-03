// Універсальна модалка з плитками. Всі editors.js побудовані на ній.
//   const m = openModal({ title, cls });  m.body — контейнер;  m.close()
//   tile(label, onDwell, { icon, sub, cls, repeat, always }) → елемент-плитка
import { h } from './dom.js';
import { store } from '../core/store.js';
import { on, emit } from '../core/bus.js';

let modalId = 0;
const inertState = new Map();

export function openModal({ title = '', cls = '' } = {}) {
  const layer = document.getElementById('modal-layer');
  const previousFocus = document.activeElement;
  const id = 'modal-title-' + ++modalId;
  const heading = title ? h('h2', { class: 'modal-title', id }, title) : null;
  const el = h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true',
    ...(heading ? { 'aria-labelledby': id } : { 'aria-label': 'Діалог' }), tabindex: '-1' }, heading);
  const body = h('div', { class: 'modal-body' });
  const resume = tile('Продовжити', () => emit('toggle-pause'), { cls: 'modal-resume', always: true });
  const updatePause = () => { resume.hidden = !store.paused; };
  updatePause();
  const offPause = on('pause-changed', updatePause);
  el.appendChild(resume);
  el.appendChild(body);
  for (const sibling of document.body.children) {
    if (sibling === layer) continue;
    if (!inertState.has(sibling)) inertState.set(sibling, sibling.inert);
    sibling.inert = true;
  }
  const below = layer.lastElementChild;
  if (below) below.inert = true;
  layer.appendChild(el);
  const isTop = () => layer.lastElementChild === el;
  const focusables = () => [...el.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(node => !node.hidden && node.getClientRects().length);
  const focusFirst = () => (focusables()[0] || el).focus();
  const onKey = event => {
    if (!isTop() || event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) { event.preventDefault(); el.focus(); return; }
    const index = items.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
    else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
  };
  const onFocus = event => { if (isTop() && !el.contains(event.target)) focusFirst(); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocus);
  queueMicrotask(() => { if (el.isConnected && isTop()) focusFirst(); });
  return { el, body, close: () => {
    if (!el.isConnected) return;
    const wasTop = isTop();
    offPause();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocus);
    el.remove();
    const top = layer.lastElementChild;
    if (top) top.inert = false;
    else { for (const [node, wasInert] of inertState) node.inert = wasInert; inertState.clear(); }
    if (wasTop && previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus();
    else if (wasTop && top) top.focus();
  } };
}

export function tile(label, onDwell, { icon, sub, cls = '', repeat, always } = {}) {
  const el = h('button', { class: 'tile ' + cls, 'data-dwell': '' },
    icon ? h('span', { class: 'tile-icon' }, icon) : null,
    h('span', { class: 'tile-label' }, label),
    sub ? h('span', { class: 'tile-sub' }, sub) : null);
  if (repeat) el.setAttribute('data-dwell-repeat', '');
  if (always) el.setAttribute('data-dwell-always', '');
  el.addEventListener('dwell', onDwell);
  return el;
}

export function grid(cols, ...tiles) {
  return h('div', { class: 'grid', style: `--cols:${cols}` }, ...tiles);
}

// Питання з варіантами → Promise зі значенням вибраного варіанту (або null для «Скасувати»).
export function choose(title, options, { cols = 3, cancel = true } = {}) {
  return new Promise((resolve) => {
    const m = openModal({ title, cls: 'choice' });
    const done = (v) => { m.close(); resolve(v); };
    const size = 4;
    const pages = Math.ceil(options.length / size);
    let page = 0;
    function render(focus = '') {
      const tiles = options.slice(page * size, (page + 1) * size)
        .map(o => tile(o.label, () => done(o.value), o));
      if (pages <= 1) {
        if (cancel) tiles.push(tile('Скасувати', () => done(null), { icon: '✕', cls: 'cancel' }));
        m.body.replaceChildren(grid(cols, ...tiles));
        return;
      }
      const prev = tile('Назад', () => { page--; render('prev'); });
      const next = tile('Далі', () => { page++; render('next'); });
      if (page === 0) prev.setAttribute('disabled', '');
      if (page === pages - 1) next.setAttribute('disabled', '');
      const nav = h('nav', { class: 'choice-nav', 'aria-label': 'Сторінки вибору' }, prev,
        h('span', { class: 'choice-page-count', 'aria-live': 'polite' }, `${page + 1} / ${pages}`), next,
        ...(cancel ? [tile('Скасувати', () => done(null), { cls: 'cancel' })] : []));
      m.body.replaceChildren(grid(Math.min(cols, size), ...tiles), nav);
      if (focus) (focus === 'prev' && !prev.disabled ? prev : !next.disabled ? next : prev).focus();
    }
    render();
  });
}
