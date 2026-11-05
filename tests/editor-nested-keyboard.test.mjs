import assert from 'node:assert/strict';
import test from 'node:test';

class Element extends EventTarget {
  constructor(tag) { super(); this.tag = tag; this.attrs = {}; this.children = []; this.hidden = false; this.inert = false; this.classList = { toggle() {} }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  append(...children) { for (const child of children) { if (child instanceof Element) child.parent = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  get lastElementChild() { return this.children.filter(c => c instanceof Element).at(-1); }
  get isConnected() { return this === document.body || !!this.parent?.isConnected; }
  get textContent() { return this.children.map(c => c instanceof Element ? c.textContent : c).join(''); }
  set textContent(value) { this.children = [value]; }
  contains(target) { return this === target || this.children.some(c => c instanceof Element && c.contains(target)); }
  closest() { return this.inert ? this : this.parent?.closest() || null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  focus() { document.activeElement = this; }
  querySelectorAll() { return descendants(this).filter(n => n.tag === 'button'); }
}
function descendants(node) { return node.children.filter(c => c instanceof Element).flatMap(c => [c, ...descendants(c)]); }
class Document extends EventTarget {
  constructor() { super(); this.body = new Element('body'); }
  createElement(tag) { return new Element(tag); }
  getElementById(id) { return id === 'modal-layer' ? layer : null; }
}
globalThis.Node = Element;
globalThis.document = new Document();
const layer = new Element('div');
document.body.append(layer);
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { numpad } = await import('../site/js/ui/editors.js');
function key(value) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value });
  document.dispatchEvent(event);
}

test('nested text keyboard receives keys without submitting or altering its number-input parent', async () => {
  const result = numpad('Input');
  const parent = layer.lastElementChild;
  const text = descendants(parent).find(n => n.tag === 'button' && n.textContent === 'Текст');
  text.dispatchEvent(new Event('dwell'));
  const keyboard = layer.lastElementChild;
  assert.equal(parent.inert, true);
  key('1'); key('a'); key('Enter');
  assert.equal(await result, '1a');
  assert.equal(keyboard.isConnected, false);
  assert.equal(parent.isConnected, false);
});
