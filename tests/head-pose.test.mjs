import assert from 'node:assert/strict';
import test from 'node:test';
import { headOffset, oneEuro, createHeadPointer, LM, RANGE } from '../site/js/gaze/head-pose.js';

// Synthetic face: a rigid head rotated by yaw/pitch (radians), then rolled, scaled and moved in the image.
function face({ yaw = 0, pitch = 0, roll = 0, scale = 1, dx = 320, dy = 240 } = {}) {
  const model = { [LM.nose]: [0, 10, 95], [LM.left]: [-70, 0, 0], [LM.right]: [70, 0, 0], [LM.top]: [0, -90, 20], [LM.chin]: [0, 90, 20] };
  const p = Array.from({ length: 468 }, () => [0, 0, 0]);
  for (const [i, [x, y, z]] of Object.entries(model)) {
    // The camera faces the person: turning to their right moves the nose towards image-left.
    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw), z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
    const y1 = y * Math.cos(pitch) + z1 * Math.sin(pitch);
    const xr = x1 * Math.cos(roll) - y1 * Math.sin(roll), yr = x1 * Math.sin(roll) + y1 * Math.cos(roll);
    p[i] = [xr * scale + dx, yr * scale + dy, 0];
  }
  return p;
}
const deg = (d) => d * Math.PI / 180;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('head offset ignores where the face is, how close it is and head tilt', () => {
  const base = headOffset(face({ yaw: deg(8), pitch: deg(5) }));
  for (const change of [{ dx: 100, dy: 400 }, { scale: 0.5 }, { scale: 1.8 }, { roll: deg(15) }]) {
    const o = headOffset(face({ yaw: deg(8), pitch: deg(5), ...change }));
    near(o.yaw, base.yaw); near(o.pitch, base.pitch);
  }
  assert.equal(headOffset(null), null);
  assert.equal(headOffset([[0, 0]]), null);
  const broken = face(); broken[LM.nose] = [NaN, 0, 0];
  assert.equal(headOffset(broken), null);
});

test('turning the head moves the pointer the same way, with comfortable angles reaching the edges', () => {
  const hp = createHeadPointer();
  const opts = { w: 1000, h: 600 };
  hp.setNeutral(headOffset(face()));
  const settle = (pose) => { let pt; for (let t = 0; t <= 3000; t += 33) pt = hp.update(headOffset(face(pose)), t, opts); return pt; };
  const centre = settle({});
  near(centre.x, 500, 1); near(centre.y, 300, 1);
  const right = createHeadPointer(); right.setNeutral(headOffset(face()));
  let pt; for (let t = 0; t <= 3000; t += 33) pt = right.update(headOffset(face({ yaw: deg(6) })), t, opts);
  assert.ok(pt.x > 600 && pt.x < 950, 'person turns right → pointer goes right, not yet at the edge: ' + pt.x);
  for (let t = 3033; t <= 6000; t += 33) pt = right.update(headOffset(face({ yaw: deg(14) })), t, opts);
  assert.ok(pt.x > 990, '14° reaches the right edge: ' + pt.x);
  const down = createHeadPointer(); down.setNeutral(headOffset(face()));
  for (let t = 0; t <= 3000; t += 33) pt = down.update(headOffset(face({ pitch: deg(9) })), t, opts);
  assert.ok(pt.y > 590, 'nodding down reaches the bottom edge: ' + pt.y);
  assert.equal(createHeadPointer().update(headOffset(face()), 0, opts), null, 'no pointer before centring');
});

test('turning past the edge re-anchors the centre so coming back is immediate', () => {
  const hp = createHeadPointer();
  const opts = { w: 1000, h: 600 };
  hp.setNeutral(headOffset(face()));
  let pt, t = 0;
  for (; t <= 4000; t += 33) pt = hp.update(headOffset(face({ yaw: deg(30) })), t, opts);
  assert.ok(pt.x > 990);
  for (; t <= 7000; t += 33) pt = hp.update(headOffset(face({ yaw: deg(22) })), t, opts);
  assert.ok(pt.x < 700, 'returning 8° from a 30° turn already leaves the edge: ' + pt.x);
  // A single-frame tracker glitch must not move the centre noticeably.
  const calm = createHeadPointer(); calm.setNeutral(headOffset(face()));
  calm.update(headOffset(face()), 0, opts);
  calm.update(headOffset(face({ yaw: deg(60) })), 33, opts);
  assert.ok(Math.abs(calm.neutral.yaw - headOffset(face()).yaw) < RANGE.yaw * 0.06);
});

test('one euro filter calms jitter at rest and keeps up with fast movement', () => {
  const f = oneEuro({ minCutoff: 0.5, beta: 2.5 });
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const out = [];
  for (let i = 0; i < 300; i++) out.push(f.filter(0.2 + rnd() * 0.04, i * 33));
  const tail = out.slice(100);
  const spread = Math.max(...tail) - Math.min(...tail);
  assert.ok(spread < 0.02, 'jitter of ±0.02 shrinks at least in half: ' + spread);
  let v; for (let i = 300; i < 312; i++) v = f.filter(1, i * 33);
  assert.ok(v > 0.9, 'a large move arrives within ~0.4 s: ' + v);
});
