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
  append(...els) { this.children.push(...els); }
  setAttribute() {}
  set innerHTML(html) {
    this.children = [];
    if (html.includes('gz-bar')) this.bar = new Element();
    if (html.includes('gz-stage')) this.stage = new Element();
    this.pips = Array.from({ length: (html.match(/<i[ >]/g) || []).length }, () => new Element());
  }
  querySelector(selector) { return selector === '.gz-bar' ? this.bar : selector === '.gz-stage' ? this.stage : null; }
  querySelectorAll(selector) { return selector === '.gz-pips i' ? this.pips || [] : []; }
  remove() { this.isConnected = false; }
}

async function simulateCalibration({ cancelAtCheck = false, prediction = 'follow' } = {}) {
  let now = 0, faceTime, face, phaseStart = null, tick = 0;
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
      if (prediction === 'none') return null;
      const dot = target();
      // 'jitter': webcam gaze is never still. It swings ±150 px around a point 90/40 px off the target.
      const swing = prediction === 'jitter' ? (tick++ % 2 ? 150 : -150) : 0;
      return { x: parseFloat(dot.style.left) + 90 + swing, y: parseFloat(dot.style.top) + 40 };
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

test('blue points give the eyes time to arrive, then measure an off-target prediction honestly', async () => {
  const { report, checks, model, previousModel } = await simulateCalibration();
  assert.equal(report.ok, true);
  assert.equal(report.points.length, 5);
  assert.equal(checks.length, 4);
  assert.ok(checks.every(duration => duration >= 2200 && duration < 4000), checks.join());
  assert.ok(Math.abs(report.accuracyPx - Math.hypot(90, 40)) < 0.01);
  assert.equal(report.validPct, 100);
  assert.notEqual(model, previousModel);
});

test('a jittery prediction still completes validation instead of waiting for a stable gaze forever', async () => {
  const { report, checks, model, previousModel } = await simulateCalibration({ prediction: 'jitter' });
  assert.equal(report.ok, true);
  assert.equal(report.points.length, 5);
  assert.ok(checks.every(duration => duration < 4000), checks.join());
  assert.ok(report.accuracyPx > 60 && report.accuracyPx < 260, String(report.accuracyPx));
  assert.ok(report.precisionPx > 250, 'jitter shows up as poor precision, not as a failed calibration');
  assert.notEqual(model, previousModel);
});

test('no gaze predictions at all rejects the calibration and keeps the previous model', async () => {
  const { report, model, previousModel, overlay } = await simulateCalibration({ prediction: 'none' });
  assert.equal(report.ok, false);
  assert.match(report.error, /синіх точках/);
  assert.equal(model, previousModel);
  assert.equal(overlay.isConnected, false);
});

test('Escape during validation restores the previous calibration and removes the overlay', async () => {
  const { report, model, previousModel, overlay } = await simulateCalibration({ cancelAtCheck: true });
  assert.equal(report.cancelled, true);
  assert.equal(model, previousModel);
  assert.equal(overlay.isConnected, false);
});
