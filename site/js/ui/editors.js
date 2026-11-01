// Редактори, що повертають Promise (null = скасовано). Все — великими плитками для погляду.
//   pickVar(title)            → ім'я змінної
//   editExpr(title, tokens)   → масив токенів
//   keyboard(title, text)     → рядок (екранна клавіатура + фізична для викладача)
//   numpad(title)             → число або рядок (для блоку «Ввід» під час виконання)
//   editStmt(stmt)            → true, якщо блок налаштовано
import { h, toast } from './dom.js';
import { openModal, tile, grid, choose } from './modal.js';
import { store } from '../core/store.js';
import { collectVars, BLOCK_INFO } from '../model/program.js';
import { appendDigit, backspace, exprText, parse, vr, str, op, bool, OP_LABEL } from '../lang/expr.js';

const PRESET_VARS = ['a', 'b', 'c', 'x', 'y', 'n', 'i', 'сума'];

export async function pickVar(title) {
  const names = [...new Set([...collectVars(store.program), ...PRESET_VARS])].slice(0, 14);
  const options = names.map(n => ({ label: n, value: n, cls: 'var' }));
  options.push({ label: 'Нове ім\'я', value: '__new', icon: '⌨️' });
  const v = await choose(title, options, { cols: 4 });
  if (v !== '__new') return v;
  const typed = await keyboard('Як назвати змінну?', '');
  if (!typed) return null;
  const name = typed.trim().replace(/\s+/g, '_');
  if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) { toast('Ім\'я має починатися з літери'); return null; }
  return name;
}

export function editExpr(title, initial = []) {
  return new Promise((resolve) => {
    let tokens = [...initial];
    let tab = 'num';
    const m = openModal({ title, cls: 'expr-editor' });
    const display = h('div', { class: 'expr-display' });
    const status = h('div', { class: 'expr-status' });
    const tabsBox = h('div', { class: 'expr-tabs' });
    const pad = h('div', { class: 'expr-pad' });
    const side = h('div', { class: 'expr-side' });
    m.body.append(h('div', { class: 'expr-top' }, display, status), tabsBox,
      h('div', { class: 'expr-main' }, pad, side));

    const done = (v) => { m.close(); resolve(v); };
    const set = (t) => { tokens = t; refresh(); };
    const add = (tok) => set([...tokens, tok]);

    function refresh() {
      display.textContent = exprText(tokens);
      try { parse(tokens); status.textContent = '✓ Добре'; status.className = 'expr-status ok'; }
      catch (e) { status.textContent = tokens.length ? e.message : ''; status.className = 'expr-status bad'; }
    }

    const TABS = { num: '🔢 Числа', var: '📦 Змінні і текст', cmp: '⚖️ Порівняння' };
    function renderTabs() {
      tabsBox.replaceChildren(...Object.entries(TABS).map(([k, label]) =>
        tile(label, () => { tab = k; renderTabs(); renderPad(); }, { cls: 'tab' + (tab === k ? ' active' : '') })));
    }

    const opTile = (o) => tile(OP_LABEL[o], () => add(op(o)), { cls: 'op' });
    function renderPad() {
      let tiles;
      if (tab === 'num') {
        tiles = [...'7894561230'].map(d => tile(d, () => set(appendDigit(tokens, d)), { cls: 'digit' }));
        tiles.push(tile(',', () => set(appendDigit(tokens, '.')), { cls: 'digit' }));
        tiles.push(...['+', '-', '*', '/', '(', ')'].map(opTile));
        tiles.push(tile('остача', () => add(op('mod')), { cls: 'op', sub: 'від ділення' }));
      } else if (tab === 'var') {
        const names = [...new Set([...collectVars(store.program), ...PRESET_VARS])].slice(0, 12);
        tiles = names.map(n => tile(n, () => add(vr(n)), { cls: 'var' }));
        tiles.push(tile('Текст', async () => {
          const s = await keyboard('Який текст?', '');
          if (s != null) add(str(s));
        }, { icon: '⌨️' }));
        tiles.push(tile('Нова змінна', async () => { const n = await pickVar('Яка змінна?'); if (n) add(vr(n)); }, { icon: '➕' }));
      } else {
        tiles = ['==', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not', '(', ')'].map(opTile);
        tiles.push(tile('так', () => add(bool(true)), { cls: 'var' }), tile('ні', () => add(bool(false)), { cls: 'var' }));
      }
      pad.replaceChildren(grid(tab === 'var' ? 4 : 6, ...tiles));
    }

    side.append(
      tile('Стерти', () => set(backspace(tokens)), { icon: '⌫', repeat: true }),
      tile('Очистити', () => set([]), { icon: '🧹' }),
      tile('Готово', () => {
        try { parse(tokens); done(tokens); } catch (e) { toast(e.message); }
      }, { icon: '✓', cls: 'ok' }),
      tile('Скасувати', () => done(null), { icon: '✕', cls: 'cancel' }));

    renderTabs(); renderPad(); refresh();
  });
}

const LAYOUTS = {
  ua: 'йцукенгшщзхїфівапролджєячсмитьбюґ\''.split(''),
  en: 'qwertyuiopasdfghjklzxcvbnm'.split(''),
  num: '1234567890.,!?-+=:()'.split(''),
};

export function keyboard(title, initial = '') {
  return new Promise((resolve) => {
    let text = initial, layout = 'ua', upper = false;
    const m = openModal({ title, cls: 'keyboard' });
    const display = h('div', { class: 'kb-display' });
    const keys = h('div', { class: 'kb-keys' });
    const side = h('div', { class: 'kb-side' });
    m.body.append(display, h('div', { class: 'kb-main' }, keys, side));

    const done = (v) => { document.removeEventListener('keydown', onKey, true); m.close(); resolve(v); };
    const set = (t) => { text = t; display.textContent = text || ' '; display.classList.toggle('empty', !text); };

    function render() {
      const chars = LAYOUTS[layout].map(c => upper ? c.toUpperCase() : c);
      keys.replaceChildren(grid(layout === 'num' ? 7 : 9,
        ...chars.map(c => tile(c, () => { set(text + c); if (upper) { upper = false; render(); } }, { cls: 'key' }))));
    }
    side.append(
      tile('Пробіл', () => set(text + ' '), { icon: '␣' }),
      tile('Стерти', () => set(text.slice(0, -1)), { icon: '⌫', repeat: true }),
      tile('Велика', () => { upper = !upper; render(); }, { icon: '⇧' }),
      tile('АБВ / ABC / 123', () => { layout = { ua: 'en', en: 'num', num: 'ua' }[layout]; render(); }, { icon: '🌐' }),
      tile('Готово', () => done(text), { icon: '✓', cls: 'ok' }),
      tile('Скасувати', () => done(null), { icon: '✕', cls: 'cancel' }));

    // Викладач може друкувати на звичайній клавіатурі.
    function onKey(e) {
      if (!m.el.isConnected) return;
      if (e.key === 'Enter') done(text);
      else if (e.key === 'Escape') done(null);
      else if (e.key === 'Backspace') set(text.slice(0, -1));
      else if (e.key.length === 1 && !e.ctrlKey) set(text + e.key);
      else return;
      e.preventDefault(); e.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);
    render(); set(text);
  });
}

export function numpad(title) {
  return new Promise((resolve) => {
    let text = '';
    const m = openModal({ title, cls: 'numpad' });
    const display = h('div', { class: 'kb-display' });
    const done = (v) => { document.removeEventListener('keydown', onKey, true); m.close(); resolve(v); };
    const set = (t) => { text = t; display.textContent = text || ' '; };
    const finish = () => {
      if (!text || text === '-') return toast('Введіть число');
      done(parseFloat(text));
    };
    const keys = [...'789456123'].map(d => tile(d, () => set(text + d), { cls: 'digit' }));
    keys.push(
      tile('−', () => set(text.startsWith('-') ? text.slice(1) : '-' + text), { cls: 'digit' }),
      tile('0', () => set(text + '0'), { cls: 'digit' }),
      tile(',', () => { if (!text.includes('.')) set((text || '0') + '.'); }, { cls: 'digit' }));
    const side = h('div', { class: 'kb-side' },
      tile('Стерти', () => set(text.slice(0, -1)), { icon: '⌫', repeat: true }),
      tile('Текст', async () => { const s = await keyboard(title, ''); if (s != null) done(s); }, { icon: '⌨️' }),
      tile('Готово', finish, { icon: '✓', cls: 'ok' }));
    m.body.append(display, h('div', { class: 'kb-main' }, grid(3, ...keys), side));
    function onKey(e) {
      if (!m.el.isConnected) return;
      if (e.key === 'Enter') finish();
      else if (e.key === 'Backspace') set(text.slice(0, -1));
      else if (/^[0-9.,-]$/.test(e.key)) set(text + (e.key === ',' ? '.' : e.key));
      else return;
      e.preventDefault(); e.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);
    set('');
  });
}

// Меню вибору типу нового блоку.
export function chooseBlockKind() {
  return choose('Який блок додати?', Object.entries(BLOCK_INFO).map(([kind, info]) =>
    ({ label: info.title, sub: info.hint, icon: info.icon, value: kind, cls: 'block-' + kind })), { cols: 3 });
}

// Налаштувати вміст блоку (при створенні або зміні). Змінює stmt лише при успіху.
export async function editStmt(stmt) {
  switch (stmt.kind) {
    case 'output': {
      const e = await editExpr('💬 Що показати на екрані?', stmt.expr);
      if (!e) return false; stmt.expr = e; return true;
    }
    case 'input': {
      const n = await pickVar('⌨️ У яку змінну записати введене?');
      if (!n) return false; stmt.name = n; return true;
    }
    case 'assign': {
      const n = await pickVar('📦 Яку змінну змінити?');
      if (!n) return false;
      const e = await editExpr(`📦 ${n} = …`, stmt.expr);
      if (!e) return false; stmt.name = n; stmt.expr = e; return true;
    }
    case 'if': case 'while': {
      const e = await editExpr(stmt.kind === 'if' ? '❓ Умова: якщо…' : '🔁 Повторювати, поки…', stmt.cond);
      if (!e) return false; stmt.cond = e; return true;
    }
    case 'for': {
      const n = await pickVar('🔢 Яка змінна рахує?');
      if (!n) return false;
      const from = await editExpr(`🔢 ${n} від…`, stmt.from);
      if (!from) return false;
      const to = await editExpr(`🔢 ${n} від ${exprText(from)} до…`, stmt.to);
      if (!to) return false;
      Object.assign(stmt, { name: n, from, to }); return true;
    }
  }
  return false;
}
