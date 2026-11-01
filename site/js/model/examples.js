// Готові приклади програм. [pure]
import { num, vr, str, op } from '../lang/expr.js';
import { newId } from './program.js';

const S = (o) => ({ id: newId(), ...o });

export const EXAMPLES = [
  {
    title: '👋 Привіт',
    build: () => ({ main: [S({ kind: 'output', expr: [str('Привіт, світ!')] })] }),
  },
  {
    title: '➕ Сума двох чисел',
    build: () => ({ main: [
      S({ kind: 'input', name: 'a' }),
      S({ kind: 'input', name: 'b' }),
      S({ kind: 'assign', name: 'сума', expr: [vr('a'), op('+'), vr('b')] }),
      S({ kind: 'output', expr: [str('Сума: '), op('+'), vr('сума')] }),
    ] }),
  },
  {
    title: '🔢 Рахуємо до 10',
    build: () => ({ main: [
      S({ kind: 'for', name: 'i', from: [num(1)], to: [num(10)], body: [S({ kind: 'output', expr: [vr('i')] })] }),
    ] }),
  },
  {
    title: '⚖️ Парне чи непарне',
    build: () => ({ main: [
      S({ kind: 'input', name: 'n' }),
      S({ kind: 'if', cond: [vr('n'), op('mod'), num(2), op('=='), num(0)],
        yes: [S({ kind: 'output', expr: [str('Парне')] })],
        no: [S({ kind: 'output', expr: [str('Непарне')] })] }),
    ] }),
  },
  {
    title: '🔁 Зворотний відлік',
    build: () => ({ main: [
      S({ kind: 'assign', name: 'x', expr: [num(5)] }),
      S({ kind: 'while', cond: [vr('x'), op('>'), num(0)], body: [
        S({ kind: 'output', expr: [vr('x')] }),
        S({ kind: 'assign', name: 'x', expr: [vr('x'), op('-'), num(1)] }),
      ] }),
      S({ kind: 'output', expr: [str('Старт! 🚀')] }),
    ] }),
  },
];
