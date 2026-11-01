// Універсальна модалка з плитками. Всі editors.js побудовані на ній.
//   const m = openModal({ title, cls });  m.body — контейнер;  m.close()
//   tile(label, onDwell, { icon, sub, cls, repeat, always }) → елемент-плитка
import { h } from './dom.js';

export function openModal({ title = '', cls = '' } = {}) {
  const el = h('div', { class: 'modal ' + cls },
    title ? h('h2', { class: 'modal-title' }, title) : null);
  const body = h('div', { class: 'modal-body' });
  el.appendChild(body);
  document.getElementById('modal-layer').appendChild(el);
  return { el, body, close: () => el.remove() };
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
    const m = openModal({ title });
    const done = (v) => { m.close(); resolve(v); };
    const tiles = options.map(o => tile(o.label, () => done(o.value), o));
    if (cancel) tiles.push(tile('Скасувати', () => done(null), { icon: '✕', cls: 'cancel' }));
    m.body.appendChild(grid(cols, ...tiles));
  });
}
