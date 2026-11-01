// Панель виводу програми і таблиця змінних.
import { h } from './dom.js';
import { formatValue } from '../lang/expr.js';

const out = () => document.getElementById('console-out');

export function clearConsole() { out().replaceChildren(); showVars({}); }

export function print(text, cls = '') {
  const line = h('div', { class: 'line ' + cls }, text);
  out().appendChild(line);
  out().scrollTop = out().scrollHeight;
}

export function showVars(vars) {
  const box = document.getElementById('vars');
  const entries = Object.entries(vars);
  box.replaceChildren(...(entries.length
    ? entries.map(([k, v]) => h('div', { class: 'var-row' }, h('b', {}, k), h('span', {}, formatValue(v))))
    : [h('div', { class: 'muted' }, 'поки порожньо')]));
}
