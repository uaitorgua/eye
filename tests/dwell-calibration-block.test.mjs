import assert from 'node:assert/strict';
import test from 'node:test';

class Target extends EventTarget {
  constructor() {
    super(); this.disabled = false; this.isConnected = true;
    this.classList = { add() {}, remove() {} };
    this.style = { setProperty() {}, removeProperty() {} };
  }
  closest(selector) { return selector === '[data-dwell]' ? this : null; }
  hasAttribute(name) { return name === 'data-dwell'; }
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 }; }
}
// Calibration overlay: owns the screen and contains no gaze targets.
const overlay = { contains: () => false, querySelectorAll: () => [] };
class FakeDocument {
  constructor() { this.listeners = new Map(); this.target = null; this.blocked = false; this.dot = { style: {}, querySelector: () => ({ style: { setProperty() {} } }) }; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatch(type, event) { for (const fn of this.listeners.get(type) || []) fn(event); }
  getElementById(id) { return id === 'gaze-dot' ? this.dot : null; }
  querySelectorAll(selector) { return selector === '[data-gaze-block]' && this.blocked ? [overlay] : []; }
  elementFromPoint() { return this.target; }
  contains() { return true; }
}
globalThis.document = new FakeDocument();
globalThis.window = {};
globalThis.innerWidth = 500;
globalThis.innerHeight = 500;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
let now = 0, frame;
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = fn => { frame = fn; };
const tick = t => { now = t; frame(t); };

const { store } = await import('../site/js/core/store.js');
const { initDwell } = await import('../site/js/gaze/dwell.js');

test('buttons under the calibration overlay cannot be activated by gaze or click', () => {
  Object.assign(store.settings, { mode: 'webcam', sound: false, clickMode: 'dwell', dwellMs: 1000 });
  const button = new Target();
  let fired = 0;
  button.addEventListener('dwell', () => fired++);
  initDwell();

  document.blocked = true;
  document.target = button;
  document.dispatch('mousemove', { clientX: 10, clientY: 10 });
  tick(0); tick(600); tick(1200); tick(3000);
  document.dispatch('click', { target: button, preventDefault() {} });
  assert.equal(fired, 0, 'nothing below the overlay may fire while calibrating');

  document.blocked = false;
  tick(3100); tick(3400); tick(4500);
  assert.equal(fired, 1, 'the page works again once calibration ends');
});
