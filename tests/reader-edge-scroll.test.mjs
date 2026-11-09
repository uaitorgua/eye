import assert from 'node:assert/strict';
import test from 'node:test';
import { createEdgeScroller, projectScrollBand } from '../site/js/reader/edge-scroll.js';

test('dedicated full-width bands project to reader edges and cannot trigger horizontal scroll', () => {
  const view = { left: 0, right: 900, top: 50, bottom: 450 };
  const top = { left: 0, right: 1000, top: 0, bottom: 30 };
  const bottom = { left: 0, right: 1000, top: 470, bottom: 500 };
  assert.deepEqual(projectScrollBand(980, 10, view, top, bottom), { x: 899, y: 51, inBand: true });
  assert.deepEqual(projectScrollBand(0, 490, view, top, bottom), { x: 0, y: 449, inBand: true });
  assert.deepEqual(projectScrollBand(-20, 490, view, top, bottom), { x: -20, y: 490, inBand: false });
  assert.deepEqual(projectScrollBand(120, 200, view, top, bottom), { x: 120, y: 200, inBand: false });
});

test('scroll bands use existing onset and speed, and short/non-scrollable readers stay still', () => {
  const view = { left: 0, right: 400, top: 30, bottom: 170, width: 400, height: 140 };
  const top = { left: 0, right: 500, top: 0, bottom: 20 };
  const bottom = { left: 0, right: 500, top: 180, bottom: 200 };
  const point = projectScrollBand(460, 195, view, top, bottom);
  const scroller = createEdgeScroller();
  assert.equal(scroller.update(point.x, point.y, view, 0, { canY: true }).vy, 0);
  const speed = scroller.update(point.x, point.y, view, 450, { canY: true }).vy;
  assert.ok(speed > 0 && speed <= 350);
  const text = projectScrollBand(200, 165, view, top, bottom);
  assert.equal(scroller.update(text.x, text.y, view, 700, { canY: text.inBand }).vy, 0);
  assert.equal(scroller.update(point.x, point.y, view, 900, { canY: false }).vy, 0);
});
