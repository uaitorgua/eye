import assert from 'node:assert/strict';
import test from 'node:test';

class Target extends EventTarget {
  constructor(repeat = false) {
    super(); this.repeat = repeat; this.disabled = false; this.isConnected = true;
    this.classList = { add() {}, remove() {} };
    this.style = { setProperty() {}, removeProperty() {} };
  }
  closest(selector) { return selector === '[data-dwell]' ? this : null; }
  hasAttribute(name) { return name === 'data-dwell' || (name === 'data-dwell-repeat' && this.repeat); }
  getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 }; }
}
class FakeDocument {
  constructor() { this.listeners = new Map(); this.target = null; this.dot = { style: {}, querySelector: () => ({ style: { setProperty() {} } }) }; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatch(type, event) { for (const fn of this.listeners.get(type) || []) fn(event); }
  getElementById(id) { return id === 'gaze-dot' ? this.dot : null; }
  querySelectorAll() { return []; }
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
function tick(t) { now = t; frame(t); }
function move(target, x) { document.target = target; document.dispatch('mousemove', { clientX: x, clientY: 10 }); }

const { store } = await import('../site/js/core/store.js');
const { initDwell } = await import('../site/js/gaze/dwell.js');

test('changing targets does not refire the old target and repeat targets still repeat', () => {
  store.settings.mode = 'mouse';
  store.settings.sound = false;
  store.settings.clickMode = 'dwell';
  store.settings.dwellMs = 1000;
  const first = new Target(), second = new Target(), repeat = new Target(true), last = new Target();
  const counts = [0, 0, 0, 0];
  [first, second, repeat, last].forEach((target, i) => target.addEventListener('dwell', () => counts[i]++));
  initDwell();

  move(first, 10); tick(0); tick(1000);
  assert.deepEqual(counts, [1, 0, 0, 0]);
  move(second, 20); tick(2200);
  assert.deepEqual(counts, [1, 0, 0, 0], 'the previous locked target must not fire while switching');
  tick(2500); tick(3500);
  assert.deepEqual(counts, [1, 1, 0, 0]);

  move(repeat, 30); tick(4600); tick(4900); tick(5900); tick(6350);
  assert.deepEqual(counts, [1, 1, 2, 0], 'repeat controls continue firing at their repeat interval');
  move(last, 40); tick(6400); tick(6700); tick(7700);
  assert.deepEqual(counts, [1, 1, 2, 1]);
  move(first, 50); tick(8800); tick(9100); tick(10100);
  assert.deepEqual(counts, [2, 1, 2, 1], 'a target can be activated again after a confirmed switch away');
});
