// Збереження/відкриття програми у файлі JSON: серіалізація та сувора перевірка. [pure]
//   serializeProgram(program, name) → текст JSON
//   parseProgramFile(text) → { program, name }  (кидає Error з поясненням українською)
import { newId, BRANCHES } from './program.js';

export const FORMAT = 'eyeflow-program';
export const VERSION = 1;

const OPS = new Set(['+', '-', '*', '/', 'mod', '==', '!=', '<', '<=', '>', '>=', 'and', 'or', 'not', '(', ')']);
const EXPR_KEYS = { output: ['expr'], input: [], assign: ['expr'], if: ['cond'], while: ['cond'], for: ['from', 'to'] };

export function serializeProgram(program, name = 'програма') {
  return JSON.stringify({ format: FORMAT, version: VERSION, name, savedAt: new Date().toISOString(), program }, null, 2);
}

function fail(msg) { throw new Error('Файл пошкоджений: ' + msg); }

function checkTokens(tokens, where) {
  if (!Array.isArray(tokens)) fail(`${where} має бути списком`);
  return tokens.map((t) => {
    if (!t || typeof t !== 'object') fail(`неправильний елемент у ${where}`);
    switch (t.t) {
      case 'num': if (!/^-?\d+(\.\d*)?$/.test(String(t.v))) fail(`«${t.v}» не число`); return { t: 'num', v: String(t.v) };
      case 'var': case 'str': if (typeof t.v !== 'string') fail(`неправильний текст у ${where}`); return { t: t.t, v: t.v };
      case 'bool': return { t: 'bool', v: Boolean(t.v) };
      case 'op': if (!OPS.has(t.v)) fail(`невідома дія «${t.v}»`); return { t: 'op', v: t.v };
    }
    return fail(`невідомий тип «${t.t}» у ${where}`);
  });
}

function checkList(list, seen) {
  if (!Array.isArray(list)) fail('список блоків має бути масивом');
  return list.map((st) => {
    if (!st || !(st.kind in EXPR_KEYS)) fail(`невідомий блок «${st?.kind}»`);
    let id = typeof st.id === 'string' && st.id ? st.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const out = { id, kind: st.kind };
    if (['input', 'assign', 'for'].includes(st.kind)) {
      if (typeof st.name !== 'string') fail(`у блоці «${st.kind}» немає імені змінної`);
      out.name = st.name;
    }
    for (const k of EXPR_KEYS[st.kind]) out[k] = checkTokens(st[k] ?? [], k);
    for (const b of BRANCHES[st.kind] || []) out[b] = checkList(st[b] ?? [], seen);
    return out;
  });
}

export function parseProgramFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { fail('це не JSON'); }
  // Приймаємо і повний файл, і «голу» програму { main: [...] }.
  const program = data?.format === FORMAT ? data.program : data;
  if (data?.format === FORMAT && data.version > VERSION) fail('файл з новішої версії програми');
  if (!program || !Array.isArray(program.main)) fail('немає списку блоків main');
  return { program: { main: checkList(program.main, new Set()) }, name: data?.name || '' };
}
