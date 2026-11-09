// Бібліотека PDF у браузері (IndexedDB): файли книг і місце, де дитина зупинилась.
// Все лежить локально в профілі браузера на цьому ПК.
const DB = 'eyeflow-books', VERSION = 1;

let dbPromise;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('books', { keyPath: 'id' });
      req.result.createObjectStore('progress', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

// Метадані без самого файлу: { id, name, size, addedAt, pages }
export async function listBooks() {
  const all = (await tx('books', 'readonly', s => s.getAll())) || [];
  return all.map(({ data, ...meta }) => meta).sort((a, b) => b.addedAt - a.addedAt);
}

export async function addBook(file) {
  const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const name = file.name.replace(/\.pdf$/i, '');
  await tx('books', 'readwrite', s => s.put({ id, name, size: file.size, addedAt: Date.now(), pages: 0, data: file }));
  return id;
}

export const getBook = (id) => tx('books', 'readonly', s => s.get(id));

export async function setBookPages(id, pages) {
  const b = await getBook(id);
  if (b && b.pages !== pages) await tx('books', 'readwrite', s => s.put({ ...b, pages }));
}

export async function deleteBook(id) {
  await tx('books', 'readwrite', s => s.delete(id));
  await tx('progress', 'readwrite', s => s.delete(id));
}

// { id, page, frac, zoom, at }
export const getProgress = (id) => tx('progress', 'readonly', s => s.get(id));
export const saveProgress = (p) => tx('progress', 'readwrite', s => s.put({ ...p, at: Date.now() }));
