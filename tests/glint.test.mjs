import assert from 'node:assert/strict';
import test from 'node:test';
import { findGlint, irisCircle, toGray, IRIS, jitterStats } from '../site/js/gaze/glint.js';

// Synthetic eye: skin 150, sclera 210, dark iris (r px) 60, pupil 25, plus an optional glint blob.
function eye({ w = 80, h = 60, cx = 40, cy = 30, r = 9, glint = null, glasses = null, noise = 0 } = {}) {
  const g = new Uint8ClampedArray(w * h);
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    let v = Math.abs(y - cy) < r * 1.2 && Math.abs(x - cx) < r * 2.6 ? 210 : 150;
    if (d <= r) v = d <= r * 0.4 ? 25 : 60;
    if (glint) { const dg = Math.hypot(x - glint.x, y - glint.y); if (dg <= glint.s) v = 255 - 40 * dg / glint.s; }
    if (glasses && x >= glasses.x && x < glasses.x + glasses.w && y >= glasses.y && y < glasses.y + glasses.h) v = 250;
    g[y * w + x] = v + noise * rnd();
  }
  return { g, w, h, iris: { x: cx, y: cy, r } };
}
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('finds a small bright glint inside the iris with sub-pixel accuracy', () => {
  const e = eye({ glint: { x: 37.4, y: 28.6, s: 1.6 }, noise: 6 });
  const r = findGlint(e.g, e.w, e.h, e.iris);
  assert.ok(r, 'glint found');
  near(r.x, 37.4, 0.5); near(r.y, 28.6, 0.5);
  near(r.vx, (40 - 37.4) / 9, 0.06); near(r.vy, (30 - 28.6) / 9, 0.06);
});

test('the glint→iris vector follows the eye and is independent of iris size', () => {
  // Eye looks right: iris moves right, the reflection stays (almost) put.
  const run = (e) => findGlint(e.g, e.w, e.h, e.iris);
  const a = run(eye({ cx: 40, glint: { x: 40, y: 28, s: 1.5 } }));
  const b = run(eye({ cx: 44, glint: { x: 40.5, y: 28, s: 1.5 } }));
  assert.ok(b.vx > a.vx + 0.3, `${a.vx} → ${b.vx}`);
  const big = eye({ w: 160, h: 120, cx: 80, cy: 60, r: 18, glint: { x: 74, y: 56, s: 3 } });
  const small = eye({ cx: 40, cy: 30, r: 9, glint: { x: 37, y: 28, s: 1.5 } });
  const vb = findGlint(big.g, big.w, big.h, big.iris), vs = findGlint(small.g, small.w, small.h, small.iris);
  near(vb.vx, vs.vx, 0.08); near(vb.vy, vs.vy, 0.08);
});

test('rejects frames without a glint and big glasses reflections', () => {
  const none = eye({ noise: 6 });
  assert.equal(findGlint(none.g, none.w, none.h, none.iris), null, 'no glint → null');
  const glare = eye({ glasses: { x: 30, y: 22, w: 14, h: 12 } });
  assert.equal(findGlint(glare.g, glare.w, glare.h, glare.iris), null, 'large glare → null');
  const streak = eye({ glasses: { x: 32, y: 29, w: 12, h: 2 } });
  assert.equal(findGlint(streak.g, streak.w, streak.h, streak.iris), null, 'elongated streak → null');
  assert.equal(findGlint(none.g, none.w, none.h, null), null);
});

test('iris circle from FaceLandmarker points and RGBA → gray', () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const [c, ...ring] = IRIS.left;
  lm[c] = { x: 100, y: 50 };
  ring.forEach((i, k) => { const a = k * Math.PI / 2; lm[i] = { x: 100 + 8 * Math.cos(a), y: 50 + 8 * Math.sin(a) }; });
  const ic = irisCircle(lm, 'left');
  near(ic.x, 100, 1e-9); near(ic.r, 8, 1e-9);
  assert.equal(irisCircle(lm.slice(0, 468)), null, 'WebGazer mesh without iris points');
  const gray = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
  assert.ok(gray[0] >= 254 && gray[1] === 0);
});

test('jitter statistic is the measurement criterion: below 0.3 px passes', () => {
  const steady = Array.from({ length: 50 }, (_, i) => ({ dx: 2 + 0.1 * Math.sin(i), dy: -1 + 0.1 * Math.cos(i) }));
  const shaky = Array.from({ length: 50 }, (_, i) => ({ dx: 2 + (i % 2 ? 0.6 : -0.6), dy: -1 }));
  assert.ok(jitterStats(steady).pass && jitterStats(steady).sd < 0.15);
  const j = jitterStats(shaky);
  assert.ok(!j.pass && Math.abs(j.sdX - 0.606) < 0.01, String(j.sdX));
  assert.equal(jitterStats([{ dx: 1, dy: 1 }]).pass, false, 'one sample is not a measurement');
});

test('iris offset pairs each iris with the nearest eye, whatever order the model uses', async () => {
  const { irisOffset } = await import('../site/js/gaze/fixation.js');
  const p = Array.from({ length: 478 }, () => [0, 0, 0]);
  // Eye A (image left) corners 33/133, eye B (image right) corners 362/263; both irises shifted +2 px right.
  p[33] = [100, 100]; p[133] = [130, 100]; p[362] = [170, 100]; p[263] = [200, 100];
  p[468] = [117, 100]; p[473] = [187, 100];
  const a = irisOffset(p);
  p[468] = [187, 100]; p[473] = [117, 100];      // swapped order
  const b = irisOffset(p);
  assert.ok(Math.abs(a[0] - 2 / 30) < 1e-9 && Math.abs(b[0] - a[0]) < 1e-9, `${a} vs ${b}`);
  assert.equal(irisOffset(p.slice(0, 468)), null);
});

// The real case from a 1080p camera (screenshot 17.11.2026): iris ≈ 94 px across, very bright sclera
// right next to the iris, and a window-shaped reflection (≈ 26×14 px) in the upper part of the pupil.
function hdEye({ sclera = 245, win = { x: 98, y: 88, w: 26, h: 14 }, noise = 8 } = {}) {
  const w = 200, h = 160, cx = 100, cy = 95, r = 47;
  const g = new Uint8ClampedArray(w * h);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    let v = Math.abs(y - cy) < r * 1.15 && Math.abs(x - cx) < r * 2.4 ? sclera : 160;
    if (d <= r) v = d <= r * 0.35 ? 20 : 70;
    // A specular highlight on the sclera just outside the iris, as bright as the glint.
    if (Math.hypot(x - (cx + r + 5), y - (cy - 25)) < 4) v = 255;   // scanned before the reflection
    if (win && x >= win.x - win.w / 2 && x < win.x + win.w / 2 && y >= win.y - win.h / 2 && y < win.y + win.h / 2) v = 240;   // dimmer than the sclera highlight
    g[y * w + x] = v + noise * rnd();
  }
  return { g, w, h, iris: { x: cx, y: cy, r } };
}

test('1080p eye: finds the window reflection despite a bright sclera right next to the iris', () => {
  const e = hdEye();
  const r = findGlint(e.g, e.w, e.h, e.iris);
  assert.ok(r, 'reflection found');
  near(r.x, 97.5, 1); near(r.y, 87.5, 1);
});

test('1080p eye: tries the next candidate when the brightest blob is rejected', () => {
  // A long streak (rejected for shape) is brighter than the real reflection.
  const e = hdEye();
  for (let x = 72; x < 92; x++) for (let y = 78; y < 80; y++) e.g[y * e.w + x] = 255;
  const r = findGlint(e.g, e.w, e.h, e.iris);
  assert.ok(r, 'reflection found after skipping the streak');
  near(r.x, 97.5, 1.5); near(r.y, 87.5, 1.5);
  assert.equal(findGlint(hdEye({ win: null }).g, 200, 160, { x: 100, y: 95, r: 47 }), null, 'no reflection → null, the sclera highlight is not taken');
});

// The real case at 640×480 (screenshot 17.11.2026): the landmark circle sits ~3 px left of the real iris,
// so bright sclera falls inside it; the true reflection is a small dot next to the pupil.
test('640×480 eye: ignores sclera inside a misaligned iris circle and finds the small reflection', () => {
  const w = 60, h = 40, cx = 30, cy = 20, r = 7;
  const g = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    let v = Math.abs(y - cy) < 6 && Math.abs(x - cx) < 18 ? 170 : 150;     // sclera (dimmer than the highlight on it)
    if (d <= r) v = d <= 2.5 ? 25 : 65;
    if (Math.hypot(x - 21, y - 18) < 2.6) v = 255;                        // sclera highlight across the shifted circle's edge
    if (Math.hypot(x - 32.5, y - 18.5) <= 1.2) v = 235;                   // the reflection next to the pupil
    g[y * w + x] = v;
  }
  const shifted = { x: cx - 3.5, y: cy, r };                               // where the landmarks put the iris
  const res = findGlint(g, w, h, shifted);
  assert.ok(res, 'reflection found');
  near(res.x, 32.5, 0.8); near(res.y, 18.5, 0.8);
});

test('with two reflection-like spots, keeps following the one from the previous frame', () => {
  const e = eye({ w: 120, h: 90, cx: 60, cy: 45, r: 20 });
  const dot = (x, y, v) => { for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) e.g[yy * e.w + xx] = v; };
  dot(52, 40, 255);       // brighter spot
  dot(66, 48, 235);       // dimmer spot, the one we were tracking
  const first = findGlint(e.g, e.w, e.h, e.iris);
  near(first.x, 52, 0.3);
  const tracked = findGlint(e.g, e.w, e.h, e.iris, { prefer: { vx: (60 - 66) / 20, vy: (45 - 48) / 20 } });
  near(tracked.x, 66, 0.3); near(tracked.y, 48, 0.3);
});

// ── Flickering white cross (screen reflection vs window reflection) ──────────────────────────────
// A 1080p-like eye rendered with 4×4 supersampling so sub-pixel head motion looks like a real camera.
// The window reflection is always there; the cross reflection only in "on" frames, where the screen
// light also brightens the whole eye a little. `shift` moves the whole eye (head motion between frames).
function crossFrame({ on, shift = [0, 0], cross = { x: 104, y: 92 }, noise = 4, seed = 5 } = {}) {
  const w = 120, h = 100, cx = 60 + shift[0], cy = 50 + shift[1], r = 30;
  const g = new Uint8ClampedArray(w * h);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const val = (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    let v = Math.abs(y - cy) < r * 1.1 && Math.abs(x - cx) < r * 2.2 ? 220 : 150;
    if (d <= r) v = d <= r * 0.35 ? 22 : 66;
    // Window: a bright 9×6 rectangle up-left of the pupil — brighter than the cross reflection.
    const wx = x - (cx - 8), wy = y - (cy - 9);
    if (Math.abs(wx) < 4.5 && Math.abs(wy) < 3) v = 250;
    if (on) {
      // Cross reflection: arms 11×2.4 px centred at cross (given relative to the eye at shift 0).
      const qx = x - (cross.x - 60 + cx - 44), qy = y - (cross.y - 50 + cy - 42);
      if ((Math.abs(qx) < 5.5 && Math.abs(qy) < 1.2) || (Math.abs(qy) < 5.5 && Math.abs(qx) < 1.2)) v = 225;
      v += 12;   // the screen lights the eye
    }
    return v;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) acc += val(x + (i + 0.5) / 4 - 0.5, y + (j + 0.5) / 4 - 0.5);
    g[y * w + x] = acc / 16 + noise * rnd();
  }
  // Crop = whole image at x0 = y0 = 100 in a bigger frame; iris in full-frame coordinates.
  return { gray: g, x0: 100, y0: 100, w, h, iris: { x: cx + 100, y: cy + 100, r } };
}
// Where the cross centre lands for a given shift, in crop coordinates.
const crossAt = (shift, cross = { x: 104, y: 92 }) => [cross.x - 60 + 60 + shift[0] - 44, cross.y - 50 + 50 + shift[1] - 42];

test('cross: the plain detector takes the brighter window, the on−off difference finds the cross', async () => {
  const { findCrossGlint } = await import('../site/js/gaze/glint.js');
  const on = crossFrame({ on: true }), off = crossFrame({ on: false, seed: 9 });
  const local = { x: on.iris.x - on.x0, y: on.iris.y - on.y0, r: on.iris.r };
  const plain = findGlint(on.gray, on.w, on.h, local);
  near(plain.x, 52, 1.5); near(plain.y, 41, 1.5);              // the window, not what we want
  const c = findCrossGlint(on, off);
  assert.ok(c, 'cross reflection found');
  const [ex, ey] = crossAt([0, 0]);
  near(c.x, ex, 0.4); near(c.y, ey, 0.4);
  assert.ok(c.fill < 0.6, 'cross-shaped blob: fill ' + c.fill.toFixed(2));
});

test('cross: head moves 1.4 px between frames — background is re-aligned by the iris centre', async () => {
  const { findCrossGlint } = await import('../site/js/gaze/glint.js');
  const shift = [1.4, -0.7];
  const on = crossFrame({ on: true, shift }), off = crossFrame({ on: false, seed: 9 });
  const c = findCrossGlint(on, off);
  assert.ok(c, 'found despite motion');
  const [ex, ey] = crossAt(shift);
  near(c.x, ex, 0.5); near(c.y, ey, 0.5);
  assert.ok(c.ghost < 0.5 * c.contrast);
});

test('cross: no cross in either frame → null; a shifted window alone is rejected as a ghost', async () => {
  const { findCrossGlint } = await import('../site/js/gaze/glint.js');
  const a = crossFrame({ on: false }), b = crossFrame({ on: false, seed: 9 });
  assert.equal(findCrossGlint(a, b), null, 'nothing new');
  // Iris landmarks report no motion, but the image moved 1.5 px: the window turns into a ± crescent pair.
  const moved = crossFrame({ on: false, shift: [1.5, 0], seed: 13 });
  moved.iris = { ...b.iris };
  assert.equal(findCrossGlint(moved, b), null, 'crescent with a dark twin is not a reflection');
  assert.equal(findCrossGlint(null, b), null);
});

test('cross: landmarks miss a 1.5 px head move — image alignment still isolates the cross, fast enough per frame', async () => {
  const { findCrossGlint } = await import('../site/js/gaze/glint.js');
  const shift = [1.5, 1];
  const on = crossFrame({ on: true, shift }), off = crossFrame({ on: false, seed: 9 });
  on.iris = { ...off.iris };                         // the tracker says "no motion"
  const t0 = performance.now();
  const c = findCrossGlint(on, off);
  const ms = performance.now() - t0;
  assert.ok(c, 'found');
  const [ex, ey] = crossAt(shift);
  near(c.x, ex, 0.5); near(c.y, ey, 0.5);
  near(c.shift.sx, -1.5, 0.2); near(c.shift.sy, -1, 0.2);
  assert.ok(ms < 40, `${ms.toFixed(1)} ms for a 120×100 crop`);
});
