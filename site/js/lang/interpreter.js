// Покрокове виконання програми. [pure]
// run() — генератор. Кожен yield — подія:
//   { type:'step', id }                 — зараз виконується блок id
//   { type:'output', text }             — вивести рядок
//   { type:'input', id, name }          — потрібне значення: викличте gen.next(значення)
// Помилки кидаються як RuntimeError з полем id (блок, де сталося).

import { evaluate, formatValue } from './expr.js';

export const MAX_STEPS = 10000;

export class RuntimeError extends Error {
  constructor(message, id) { super(message); this.id = id; }
}

export function* run(program, vars = {}) {
  const counter = { steps: 0 };
  yield* runList(program.main, vars, counter);
}

function* runList(list, vars, counter) {
  for (const st of list) yield* runStmt(st, vars, counter);
}

function ev(tokens, vars, id) {
  try { return evaluate(tokens, vars); }
  catch (e) { throw new RuntimeError(e.message, id); }
}

function tick(counter, id) {
  if (++counter.steps > MAX_STEPS) throw new RuntimeError('Програма працює занадто довго — можливо, цикл ніколи не закінчується', id);
}

function* runStmt(st, vars, counter) {
  tick(counter, st.id);
  yield { type: 'step', id: st.id };
  switch (st.kind) {
    case 'output':
      yield { type: 'output', text: formatValue(ev(st.expr, vars, st.id)) };
      break;
    case 'input': {
      if (!st.name) throw new RuntimeError('Не вибрано змінну для вводу', st.id);
      const value = yield { type: 'input', id: st.id, name: st.name };
      vars[st.name] = value;
      break;
    }
    case 'assign':
      if (!st.name) throw new RuntimeError('Не вибрано змінну', st.id);
      vars[st.name] = ev(st.expr, vars, st.id);
      break;
    case 'if':
      yield* runList(ev(st.cond, vars, st.id) ? st.yes : st.no, vars, counter);
      break;
    case 'while':
      while (ev(st.cond, vars, st.id)) {
        yield* runList(st.body, vars, counter);
        tick(counter, st.id);
        yield { type: 'step', id: st.id };
      }
      break;
    case 'for': {
      const from = ev(st.from, vars, st.id), to = ev(st.to, vars, st.id);
      const dir = from <= to ? 1 : -1;
      for (let v = from; dir > 0 ? v <= to : v >= to; v += dir) {
        vars[st.name] = v;
        yield* runList(st.body, vars, counter);
        tick(counter, st.id);
        yield { type: 'step', id: st.id };
      }
      break;
    }
  }
}
