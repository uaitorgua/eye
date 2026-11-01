// Проста подієва шина. Модулі спілкуються через неї, а не імпортують UI один одного.
// Події: 'program-changed', 'settings-changed', 'run-state', 'toast' (text), 'pause-changed'.
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => handlers.get(name).delete(fn);
}

export function emit(name, data) {
  for (const fn of handlers.get(name) || []) fn(data);
}
