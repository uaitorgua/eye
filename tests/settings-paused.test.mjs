import assert from 'node:assert/strict';
import test from 'node:test';

class Element extends EventTarget {
  constructor(tag) { super(); this.tag = tag; this.attrs = {}; this.children = []; this.hidden = false; this.inert = false; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  append(...children) { for (const child of children) { if (child instanceof Element) child.parent = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { for (const c of this.children) if (c instanceof Element) c.parent = null; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  get lastElementChild() { return [...this.children].reverse().find(c => c instanceof Element) || null; }
  get isConnected() { return this === document.body || !!this.parent?.isConnected; }
  get textContent() { return this.children.map(child => child instanceof Element ? child.textContent : child).join(''); }
  contains(target) { return this === target || this.children.some(c => c instanceof Element && c.contains(target)); }
  closest(selector) { return selector === '[inert]' && this.inert ? this : this.parent?.closest(selector) || null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  focus() { document.activeElement = this; }
  querySelectorAll() { return descendants(this).filter(n => n.tag === 'button' && !n.hasAttribute('disabled')); }
  querySelector(selector) { const match = selector.match(/data-settings-focus="([^"]+)"/); return match ? descendants(this).find(n => n.getAttribute('data-settings-focus') === match[1]) || null : null; }
}
function descendants(node) { return node.children.filter(child => child instanceof Element).flatMap(child => [child, ...descendants(child)]); }
class Document extends EventTarget {
  constructor() { super(); this.body = new Element('body'); this.activeElement = null; }
  createElement(tag) { return new Element(tag); }
  getElementById(id) { return id === 'modal-layer' ? layer : null; }
}
globalThis.Node = Element;
globalThis.document = new Document();
const background = new Element('main');
const opener = new Element('button');
background.appendChild(opener);
const layer = new Element('div');
document.body.append(background, layer);
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { store } = await import('../site/js/core/store.js');
const { openModal, tile } = await import('../site/js/ui/modal.js');
const { openSettings } = await import('../site/js/ui/settings.js');
const { on, emit } = await import('../site/js/core/bus.js');

function buttons(node) { return descendants(node).filter(n => n.tag === 'button'); }

test('modal names itself, traps keyboard focus, restores nested and background focus', async () => {
  store.paused = false;
  opener.focus();
  const first = openModal({title: 'First'});
  const firstButton = tile('First button', () => {});
  first.body.appendChild(firstButton);
  await Promise.resolve();
  assert.equal(first.el.getAttribute('role'), 'dialog');
  assert.ok(first.el.getAttribute('aria-labelledby'));
  assert.equal(background.inert, true);
  assert.equal(document.activeElement, firstButton);
  const second = openModal({title: 'Second'});
  const secondButton = tile('Second button', () => {});
  second.body.appendChild(secondButton);
  await Promise.resolve();
  assert.equal(first.el.inert, true);
  assert.equal(document.activeElement, secondButton);
  const tab = new Event('keydown', {cancelable:true});
  Object.defineProperties(tab, {key:{value:'Tab'}, shiftKey:{value:true}});
  document.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(document.activeElement, secondButton);
  second.close();
  assert.equal(first.el.inert, false);
  assert.equal(document.activeElement, firstButton);
  first.close();
  assert.equal(background.inert, false);
  assert.equal(document.activeElement, opener);
});

test('paused Settings exposes gaze-enabled recovery and Close keeps pause state', () => {
  store.paused = true;
  openSettings();
  const controls = buttons(layer);
  const close = controls.find(node => node.textContent.includes('Закрити'));
  const resume = controls.find(node => node.textContent.includes('Продовжити'));
  assert.ok(close?.hasAttribute('data-dwell-always'));
  assert.ok(resume?.hasAttribute('data-dwell-always'));
  assert.equal(resume.hidden, false);
  close.dispatchEvent(new Event('dwell'));
  assert.equal(layer.children.length, 0);
  assert.equal(store.paused, true);
});

test('a paused shared dialog can resume through its own gaze target', () => {
  store.paused = true;
  const off = on('toggle-pause', () => { store.paused = false; emit('pause-changed', false); });
  const modal = openModal({title: 'Library'});
  const resume = buttons(modal.el).find(node => node.textContent.includes('Продовжити'));
  assert.ok(resume.hasAttribute('data-dwell-always'));
  resume.dispatchEvent(new Event('dwell'));
  assert.equal(store.paused, false);
  assert.equal(resume.hidden, true);
  modal.close();
  off();
});

test('Settings pagination exposes all stepper controls and retains focus after updates', () => {
  store.paused = false;
  openSettings();
  const modal = layer.lastElementChild;
  const find = key => descendants(modal).find(n => n.getAttribute('data-settings-focus') === key);
  const plus = find('dwellMs-plus');
  assert.ok(plus);
  plus.focus();
  const before = store.settings.dwellMs;
  plus.dispatchEvent(new Event('dwell'));
  assert.equal(store.settings.dwellMs, Math.min(4000, before + 200));
  assert.equal(document.activeElement.getAttribute('data-settings-focus'), 'dwellMs-plus');
  find('next').dispatchEvent(new Event('dwell'));
  assert.ok(find('snap-plus'));
  find('next').dispatchEvent(new Event('dwell'));
  assert.ok(find('mode'), 'control mode is the first switch');
  assert.ok(find('autoCalibrate'));
  if (store.settings.mode !== 'mouse') assert.ok(find('eyesStop'), 'eyes-stop switch sits next to calibration');
  find('next').dispatchEvent(new Event('dwell'));
  assert.ok(find('lang'));
  for (let i = 0; i < 5 && !find('exit'); i++) find('next').dispatchEvent(new Event('dwell'));
  assert.ok(find('exit'), 'the last page ends with Exit');
  find('close').dispatchEvent(new Event('dwell'));
  assert.equal(layer.children.length, 0);
});
