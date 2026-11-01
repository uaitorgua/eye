// Вирази: список токенів → текст для показу, парсер, обчислення. [pure]

export const OP_LABEL = {
  '+': '+', '-': '−', '*': '×', '/': '÷', mod: 'остача',
  '==': '=', '!=': '≠', '<': '<', '<=': '≤', '>': '>', '>=': '≥',
  and: 'і', or: 'або', not: 'не', '(': '(', ')': ')',
};

export const num = v => ({ t: 'num', v: String(v) });
export const vr = v => ({ t: 'var', v });
export const str = v => ({ t: 'str', v });
export const op = v => ({ t: 'op', v });
export const bool = v => ({ t: 'bool', v });

// Додати цифру/крапку: зливається з попереднім числом.
export function appendDigit(tokens, d) {
  const last = tokens[tokens.length - 1];
  if (last && last.t === 'num') {
    if (d === '.' && last.v.includes('.')) return tokens;
    return [...tokens.slice(0, -1), num(last.v + d)];
  }
  return [...tokens, num(d === '.' ? '0.' : d)];
}

// Стерти останній символ (для чисел — одну цифру).
export function backspace(tokens) {
  const last = tokens[tokens.length - 1];
  if (!last) return tokens;
  if (last.t === 'num' && last.v.length > 1) return [...tokens.slice(0, -1), num(last.v.slice(0, -1))];
  return tokens.slice(0, -1);
}

export function tokenText(tok) {
  switch (tok.t) {
    case 'num': return tok.v;
    case 'var': return tok.v;
    case 'str': return '"' + tok.v + '"';
    case 'bool': return tok.v ? 'так' : 'ні';
    case 'op': return OP_LABEL[tok.v] ?? tok.v;
  }
  return '?';
}

export function exprText(tokens) {
  if (!tokens || !tokens.length) return '…';
  return tokens.map(tokenText).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}

export class ExprError extends Error {}

// Рекурсивний спуск. Пріоритет: or < and < not < порівняння < +- < */mod < унарний -.
export function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (...vs) => peek() && peek().t === 'op' && vs.includes(peek().v);
  const next = () => tokens[i++];

  function orE() { let l = andE(); while (isOp('or')) { next(); l = { op: 'or', l, r: andE() }; } return l; }
  function andE() { let l = notE(); while (isOp('and')) { next(); l = { op: 'and', l, r: notE() }; } return l; }
  function notE() { if (isOp('not')) { next(); return { op: 'not', a: notE() }; } return cmpE(); }
  function cmpE() {
    let l = addE();
    while (isOp('==', '!=', '<', '<=', '>', '>=')) { const o = next().v; l = { op: o, l, r: addE() }; }
    return l;
  }
  function addE() { let l = mulE(); while (isOp('+', '-')) { const o = next().v; l = { op: o, l, r: mulE() }; } return l; }
  function mulE() { let l = unE(); while (isOp('*', '/', 'mod')) { const o = next().v; l = { op: o, l, r: unE() }; } return l; }
  function unE() { if (isOp('-')) { next(); return { op: 'neg', a: unE() }; } return atom(); }
  function atom() {
    const tok = next();
    if (!tok) throw new ExprError('Вираз не закінчено');
    if (tok.t === 'num') return { lit: parseFloat(tok.v) };
    if (tok.t === 'str') return { lit: tok.v };
    if (tok.t === 'bool') return { lit: tok.v };
    if (tok.t === 'var') return { name: tok.v };
    if (tok.t === 'op' && tok.v === '(') {
      const e = orE();
      if (!isOp(')')) throw new ExprError('Бракує дужки )');
      next();
      return e;
    }
    throw new ExprError('Тут не може стояти «' + tokenText(tok) + '»');
  }

  if (!tokens.length) throw new ExprError('Вираз порожній');
  const tree = orE();
  if (i < tokens.length) throw new ExprError('Зайве: «' + tokenText(tokens[i]) + '»');
  return tree;
}

export function evaluate(tokens, vars) {
  return evalNode(parse(tokens), vars);
}

function evalNode(n, vars) {
  if ('lit' in n) return n.lit;
  if ('name' in n) {
    if (!(n.name in vars)) throw new ExprError('Змінна «' + n.name + '» ще не має значення');
    return vars[n.name];
  }
  const L = () => evalNode(n.l, vars), R = () => evalNode(n.r, vars);
  const numOnly = (x) => { if (typeof x !== 'number') throw new ExprError('Тут потрібне число, а не «' + x + '»'); return x; };
  switch (n.op) {
    case 'neg': return -numOnly(evalNode(n.a, vars));
    case 'not': return !evalNode(n.a, vars);
    case 'and': return Boolean(L()) && Boolean(R());
    case 'or': return Boolean(L()) || Boolean(R());
    case '+': { const a = L(), b = R(); return (typeof a === 'string' || typeof b === 'string') ? formatValue(a) + formatValue(b) : numOnly(a) + numOnly(b); }
    case '-': return numOnly(L()) - numOnly(R());
    case '*': return numOnly(L()) * numOnly(R());
    case '/': { const b = numOnly(R()); if (b === 0) throw new ExprError('Ділити на нуль не можна'); return numOnly(L()) / b; }
    case 'mod': { const b = numOnly(R()); if (b === 0) throw new ExprError('Ділити на нуль не можна'); return numOnly(L()) % b; }
    case '==': return L() === R();
    case '!=': return L() !== R();
    case '<': return L() < R();
    case '<=': return L() <= R();
    case '>': return L() > R();
    case '>=': return L() >= R();
  }
  throw new ExprError('Невідома дія ' + n.op);
}

export function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}
