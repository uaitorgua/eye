import assert from 'node:assert/strict';
import test from 'node:test';
import { createTargetMotion } from '../site/js/gaze/fixation.js';
import { runCalibration } from '../site/js/gaze/calibration.js';

test('a moving calibration target holds during signal loss and resumes from the same position', () => {
  const step = createTargetMotion([0, 0], [100, 50], 100);
  step(0, true);
  const partial = step(50, true);
  assert.deepEqual(partial, { x: 50, y: 25, done: false });
  assert.deepEqual(step(100, false), partial);
  assert.deepEqual(step(2000, false), partial);
  assert.deepEqual(step(2050, true), partial);
  assert.deepEqual(step(2100, true), { x: 100, y: 50, done: true });
});

class Element extends EventTarget {
  style = {};
  classList = { add() {}, remove() {}, toggle() {} };
  children = [];
  isConnected = true;
  appendChild(el) { this.children.push(el); }
  setAttribute() {}
  set innerHTML(html) {
    this.children = [];
    if (html.includes('gz-bar')) this.bar = new Element();
  }
  querySelector(selector) { return selector === '.gz-bar' ? this.bar : null; }
  remove() { this.isConnected = false; }
}

async function simulateCalibration({ cancelAtCheck = false, neverFollow = false } = {}) {
  let now = 0, faceTime, face, phaseStart = null, previousPrediction;
  const checks = [];
  class Regression {
    samples = [];
  }
  const previousModel = new Regression();
  const regressions = [previousModel];
  const document = new EventTarget();
  Object.assign(document, { body: new Element(), head: new Element(), getElementById: () => null, createElement: () => new Element() });
  const tracker = {
    getPositions() {
      if (faceTime !== now) { faceTime = now; face = Array(468); }
      return face;
    },
  };
  const target = () => document.body.children[0].children.find(el => el.className === 'gz-dot');
  const webgazer = {
    getTracker: () => tracker,
    getRegression: () => regressions,
    showVideoPreview() {},
    recordScreenPosition(x, y) { regressions[0].samples.push([x, y]); },
    async getCurrentPrediction() {
      if (phaseStart !== null && (neverFollow || now - phaseStart < 4000)) return previousPrediction;
      const dot = target();
      return previousPrediction = { x: parseFloat(dot.style.left) + 90, y: parseFloat(dot.style.top) + 40 };
    },
  };
  const globals = {
    window: { webgazer }, document, innerWidth: 1000, innerHeight: 700,
    performance: { now: () => now }, localStorage: { setItem() {} },
    matchMedia: () => ({ matches: true }),
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (fn, ms) => { now += ms; queueMicrotask(fn); },
  };
  const previousGlobals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    const report = await runCalibration({
      onStatus(status) {
        if (!status.startsWith('Перевірка ')) return;
        if (phaseStart !== null) checks.push(now - phaseStart);
        phaseStart = now;
        if (cancelAtCheck) {
          const event = new Event('keydown', { cancelable: true });
          Object.defineProperty(event, 'key', { value: 'Escape' });
          document.dispatchEvent(event);
        }
      },
    });
    return { report, checks, model: regressions[0], previousModel, overlay: document.body.children[0] };
  } finally {
    for (const [key, descriptor] of Object.entries(previousGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('blue points wait for a new fixation and measure a stable off-target prediction honestly', async () => {
  const { report, checks, model, previousModel } = await simulateCalibration();
  assert.equal(report.ok, true);
  assert.equal(report.points.length, 5);
  assert.equal(checks.length, 4);
  assert.ok(checks.every(duration => duration >= 4000));
  assert.ok(Math.abs(report.accuracyPx - Math.hypot(90, 40)) < 0.01);
  assert.notEqual(model, previousModel);
});

test('a stationary prediction times out without accepting calibration or replacing the previous model', async () => {
  const { report, model, previousModel, overlay } = await simulateCalibration({ neverFollow: true });
  assert.equal(report.ok, false);
  assert.match(report.error, /синій точці/);
  assert.equal(model, previousModel);
  assert.equal(overlay.isConnected, false);
});

test('Escape during validation restores the previous calibration and removes the overlay', async () => {
  const { report, model, previousModel, overlay } = await simulateCalibration({ cancelAtCheck: true });
  assert.equal(report.cancelled, true);
  assert.equal(model, previousModel);
  assert.equal(overlay.isConnected, false);
});
