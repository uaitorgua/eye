import assert from 'node:assert/strict';
import test from 'node:test';

class Element extends EventTarget {
  constructor(tag) { super(); this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  append(...children) {
    for (const child of children) {
      if (child instanceof Element) child.parent = this;
      this.children.push(child);
    }
  }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  get textContent() { return this.children.map(child => child instanceof Element ? child.textContent : child).join(''); }
}

const layer = new Element('div');
globalThis.Node = Element;
globalThis.document = { createElement: tag => new Element(tag), getElementById: id => id === 'modal-layer' ? layer : null };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { store } = await import('../site/js/core/store.js');
const { openSettings } = await import('../site/js/ui/settings.js');

function descendants(node) {
  return node.children.filter(child => child instanceof Element).flatMap(child => [child, ...descendants(child)]);
}

test('Settings Close remains gaze-enabled during pause and closes without resuming', () => {
  store.paused = true;
  openSettings();
  assert.equal(layer.children.length, 1);
  const buttons = descendants(layer).filter(node => node.tag === 'button');
  const close = buttons.find(node => node.textContent.includes('Закрити'));
  assert.ok(close?.hasAttribute('data-dwell'));
  assert.ok(close.hasAttribute('data-dwell-always'));
  assert.equal(buttons.filter(node => node.hasAttribute('data-dwell-always')).length, 1);
  close.dispatchEvent(new Event('dwell'));
  assert.equal(layer.children.length, 0);
  assert.equal(store.paused, true);
});
