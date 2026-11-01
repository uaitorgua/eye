// AST програми: створення, пошук, вставка, видалення, обхід. [pure]
// Позиція в програмі адресується як { listId, index }, де listId — `${stmtId}.${гілка}`
// або 'main' для основного списку.

let seq = 0;
export const newId = () => 's' + Date.now().toString(36) + (seq++).toString(36);

export const BLOCK_INFO = {
  output: { title: 'Вивід', icon: '💬', hint: 'показати на екрані' },
  input:  { title: 'Ввід', icon: '⌨️', hint: 'запитати число' },
  assign: { title: 'Змінна', icon: '📦', hint: 'покласти значення' },
  if:     { title: 'Якщо', icon: '❓', hint: 'вибір так / ні' },
  while:  { title: 'Поки', icon: '🔁', hint: 'повторювати, поки…' },
  for:    { title: 'Рахувати', icon: '🔢', hint: 'від … до …' },
};

export const BRANCHES = { if: ['yes', 'no'], while: ['body'], for: ['body'] };

export function createStmt(kind) {
  const id = newId();
  switch (kind) {
    case 'output': return { id, kind, expr: [] };
    case 'input': return { id, kind, name: '' };
    case 'assign': return { id, kind, name: '', expr: [] };
    case 'if': return { id, kind, cond: [], yes: [], no: [] };
    case 'while': return { id, kind, cond: [], body: [] };
    case 'for': return { id, kind, name: 'i', from: [{ t: 'num', v: '1' }], to: [{ t: 'num', v: '10' }], body: [] };
  }
  throw new Error('unknown kind ' + kind);
}

export function emptyProgram() { return { main: [] }; }

// Повертає масив за listId (живе посилання, щоб змінювати на місці).
export function getList(program, listId) {
  if (listId === 'main') return program.main;
  const [stmtId, branch] = listId.split('.');
  const st = findStmt(program, stmtId);
  return st ? st[branch] : null;
}

export function* walk(list) {
  for (const st of list) {
    yield st;
    for (const b of BRANCHES[st.kind] || []) yield* walk(st[b]);
  }
}

export function findStmt(program, id) {
  for (const st of walk(program.main)) if (st.id === id) return st;
  return null;
}

// Знайти список і індекс, де лежить блок.
export function locate(program, id) {
  const search = (list, listId) => {
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.id === id) return { listId, index: i };
      for (const b of BRANCHES[st.kind] || []) {
        const r = search(st[b], st.id + '.' + b);
        if (r) return r;
      }
    }
    return null;
  };
  return search(program.main, 'main');
}

export function insertStmt(program, listId, index, stmt) {
  getList(program, listId).splice(index, 0, stmt);
}

export function removeStmt(program, id) {
  const loc = locate(program, id);
  if (!loc) return false;
  getList(program, loc.listId).splice(loc.index, 1);
  return true;
}

// Усі імена змінних, що зустрічаються в програмі (для швидкого вибору).
export function collectVars(program) {
  const names = new Set();
  for (const st of walk(program.main)) {
    if (st.name) names.add(st.name);
    for (const key of ['expr', 'cond', 'from', 'to']) {
      for (const tok of st[key] || []) if (tok.t === 'var') names.add(tok.v);
    }
  }
  return [...names];
}
