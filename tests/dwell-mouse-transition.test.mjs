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
  getBoundingClientRect() { return {left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100}; }
}
class FakeDocument {
  constructor() { this.listeners = new Map(); this.target = null; this.ring = {style:{setProperty(){}}}; this.dot = {style:{}, querySelector:() => this.ring}; }
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
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
let now = 0, frame;
globalThis.performance = {now: () => now};
globalThis.requestAnimationFrame = fn => { frame = fn; };
function tick(t) { now = t; frame(t); }
function move(x, y) { document.dispatch('mousemove', {clientX:x, clientY:y}); }
function click(target) { document.dispatch('click', {target, preventDefault(){}}); }

const {store} = await import('../site/js/core/store.js');
const {initDwell, fire} = await import('../site/js/gaze/dwell.js');
const {bias, resetDrift} = await import('../site/js/gaze/drift.js');

test('mouse click waits for real movement before another dwell, webcam remains active', () => {
  store.settings.mode = 'mouse';
  store.settings.sound = false;
  store.settings.clickMode = 'dwell';
  store.settings.dwellMs = 1000;
  const opener = new Target(), next = new Target();
  let count = 0;
  opener.addEventListener('dwell', () => { document.target = next; });
  next.addEventListener('dwell', () => { count++; });
  document.target = opener;
  initDwell();
  move(10, 10); tick(0);
  click(opener);
  tick(1500); tick(3000);
  move(10, 10); tick(4500);
  assert.equal(count, 0, 'same-position events must not restart dwell');
  move(11, 10); tick(5000); tick(6100);
  assert.equal(count, 1, 'movement re-enables intentional dwell');
  document.target = opener;
  store.settings.mode = 'webcam';
  tick(8000); tick(8300);
  click(opener);
  tick(8400); tick(8700); tick(9700);
  assert.equal(count, 2, 'webcam-mode gaze remains enabled after an assistant click');
  resetDrift();
  for (let i = 0; i < 8; i++) click(opener);
  assert.equal(bias(), null, 'caregiver clicks cannot become gaze drift samples');
  for (let i = 0; i < 8; i++) fire(opener);
  assert.notEqual(bias(), null, 'gaze activations still contribute drift samples');
  const initialChoice = new Target(), underneath = new Target();
  let accidental = 0;
  initialChoice.addEventListener('dwell', () => { document.target = underneath; });
  underneath.addEventListener('dwell', () => { accidental++; });
  document.target = initialChoice;
  store.settings.mode = null;
  click(initialChoice);
  // The initial choice updates the mode after the click handler returns.
  store.settings.mode = 'mouse';
  tick(12000); tick(13500); tick(15000);
  assert.equal(accidental, 0, 'initial mode selection cannot activate the screen beneath it');
});
