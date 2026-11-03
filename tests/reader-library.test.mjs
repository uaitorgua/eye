import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

class Element extends EventTarget {
  constructor(tag, attrs = {}, children = []) {
    super(); this.tag = tag; this.attrs = attrs; this.children = children.flat();
    this.classList = { add() {}, remove() {}, toggle() {}, contains: cls => (this.attrs.class || '').split(' ').includes(cls) };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  contains(node) { return this === node || descendants(this).includes(node); }
  querySelectorAll(selector) { return descendants(this).filter(node => node.classList.contains(selector.slice(1))); }
  querySelector(selector) {
    if (selector === '.rd-bar' || selector === '.tile-label') return new Element('span');
    const options = selector.split(',').map(value => value.trim());
    return descendants(this).find(node => options.some(option => {
      const cls = option.match(/^\.([\w-]+)/)?.[1];
      return cls && node.classList.contains(cls) && (!option.includes(':not(:disabled)') || !node.disabled);
    })) || null;
  }
  focus() { globalThis.document.activeElement = this; }
  get textContent() { return this.children.map(c => c instanceof Element ? c.textContent : c).join(''); }
  set textContent(value) { this.children = [value]; }
}

const elements = new Map();
globalThis.document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, new Element('div')); return elements.get(id); },
  querySelector() { return null; },
};
globalThis.location = { hash: '' };
globalThis.history = { replaceState() {} };
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.requestAnimationFrame = () => {};

const allBooks = Array.from({ length: 11 }, (_, i) => ({ id: `b${i}`, name: `Книга ${i}`, pages: 12, data: { arrayBuffer: async () => new ArrayBuffer(0) } }));
let modal, closes = 0, lastToast;
globalThis.readerTest = {
  books: {
    listBooks: async () => allBooks,
    getBook: async id => allBooks.find(b => b.id === id),
    getProgress: async () => ({ page: 2, zoom: 1 }),
    setBookPages: async () => {}, saveProgress: async () => {},
    addBook: async file => {
      if (file.name === 'bad.pdf') throw new Error('storage full');
      allBooks.unshift({ id: 'new', name: 'Нова книга', pages: 0, data: { arrayBuffer: async () => new ArrayBuffer(0) } });
      return 'new';
    },
    deleteBook: async id => { const i = allBooks.findIndex(b => b.id === id); if (i >= 0) allBooks.splice(i, 1); },
  },
  dom: {
    h: (tag, attrs, ...children) => new Element(tag, attrs, children),
    toast: text => { lastToast = text; },
    openModal() { return modal = { el: new Element('modal'), body: new Element('body'), close() { closes++; } }; },
    tile(label, fn, options = {}) { const e = new Element('button', { class: options.cls || '' }, [label]); e.addEventListener('dwell', fn); return e; },
    choose: async () => true,
  },
};
const stubs = {
  '../ui/dom.js': 'export const {h,toast}=globalThis.readerTest.dom;',
  '../ui/modal.js': 'export const {openModal,tile,choose}=globalThis.readerTest.dom;',
  '../core/store.js': 'export const store={settings:{readerAutoScroll:true},paused:false}; export function updateSettings(){}',
  '../core/bus.js': 'export function emit(){} export function on(){}',
  '../gaze/pointer.js': 'export function onPointer(){}',
  '../gaze/blink.js': 'export const eyes={closed:false};',
  './edge-scroll.js': 'export function createEdgeScroller(){return {reset(){}}}',
  './pdf-view.js': 'export class PdfView { constructor(){this.doc=null;this.zoom=1} async open(){this.doc={};return 12} position(){return {page:1,frac:0}} applyZoom(){} setPosition(){} close(){this.doc=null} }',
  './book-store.js': 'export const {listBooks,addBook,getBook,getProgress,setBookPages,saveProgress,deleteBook}=globalThis.readerTest.books;',
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/site/js/reader/reader.js') && stubs[specifier])
    return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return nextResolve(specifier, context);
} });

function descendants(node) {
  return node.children.filter(c => c instanceof Element).flatMap(c => [c, ...descendants(c)]);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const button = label => descendants(modal.body).find(e => e.tag === 'button' && e.textContent === label);

test('library pages reach older books, delete safely, and open through the modal close lifecycle', async () => {
  const { initReader, openReader } = await import('../site/js/reader/reader.js');
  initReader();
  await openReader(); await tick();
  assert.ok(button('Книга 0'));
  assert.equal(button('Назад').disabled, true);
  button('Далі').focus();
  button('Далі').dispatchEvent(new Event('dwell'));
  assert.ok(button('Книга 4'));
  assert.equal(document.activeElement, button('Далі'));
  button('Далі').dispatchEvent(new Event('dwell'));
  assert.ok(button('Книга 10'));
  assert.equal(button('Далі').disabled, true);
  assert.equal(document.activeElement, button('Книга 8'));
  button('Видалити книгу').dispatchEvent(new Event('dwell'));
  button('Книга 10').focus();
  button('Книга 10').dispatchEvent(new Event('dwell'));
  await tick(); await tick();
  assert.equal(allBooks.length, 10);
  assert.equal(button('Книга 10'), undefined);
  assert.equal(document.activeElement, button('Книга 8'));
  const oldModal = modal;
  const drop = new Event('drop', { cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: { files: [{ name: 'good.pdf', type: 'application/pdf' }, { name: 'bad.pdf', type: 'application/pdf' }] } });
  const oldError = console.error; console.error = () => {};
  try { elements.get('reader-section').dispatchEvent(drop); await tick(); await tick(); }
  finally { console.error = oldError; }
  assert.notEqual(modal, oldModal);
  assert.equal(closes, 1);
  assert.ok(button('Нова книга'));
  assert.match(lastToast, /Не вдалося додати всі книги/);
  button('Далі').dispatchEvent(new Event('dwell'));
  button('Далі').dispatchEvent(new Event('dwell'));
  button('Книга 9').dispatchEvent(new Event('dwell'));
  await tick(); await tick();
  assert.equal(closes, 2);
  assert.equal(storage.get('eyeflow.lastBook'), 'b9');
});
