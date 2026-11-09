// Чи зупинився погляд (фіксація). [pure]
// Працює ДО калібрування: дивимось не на екранні координати, а на положення зіниці всередині ока
// (частка ширини ока), тож рух голови майже не впливає.
//
//   const f = createFixationDetector();
//   f.update(offsetX, offsetY, nowMs) → { stable, stableFor }   stableFor — скільки мс погляд нерухомий

export const WINDOW_MS = 350;      // вікно, в якому оцінюємо розкид
export const MAX_SPREAD = 0.05;    // допустимий розкид положення зіниці (частка ширини ока)

export function createFixationDetector({ windowMs = WINDOW_MS, maxSpread = MAX_SPREAD } = {}) {
  let samples = [], stableSince = null;
  return {
    reset() { samples = []; stableSince = null; },
    update(x, y, now) {
      samples.push([x, y, now]);
      while (samples.length && now - samples[0][2] > windowMs) samples.shift();
      const full = samples.length >= 3 && now - samples[0][2] >= windowMs * 0.8;
      let spread = Infinity;
      if (full) {
        const xs = samples.map(s => s[0]), ys = samples.map(s => s[1]);
        spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      }
      const stable = spread <= maxSpread;
      if (!stable) stableSince = null;
      else if (stableSince == null) stableSince = samples[0][2];
      return { stable, stableFor: stable ? now - stableSince : 0 };
    },
  };
}

export function createTargetMotion(from, to, duration) {
  let elapsed = 0, previous = null;
  return (now, hasSignal) => {
    if (hasSignal && previous?.hasSignal) elapsed += Math.min(50, now - previous.now);
    previous = { now, hasSignal };
    const progress = Math.min(1, elapsed / duration);
    const eased = progress * progress * (3 - 2 * progress);
    return { x: from[0] + (to[0] - from[0]) * eased, y: from[1] + (to[1] - from[1]) * eased, done: progress === 1 };
  };
}

export function createValidationHold(previousOffset) {
  const fixation = createFixationDetector();
  return (offset, now) => {
    const onPrevious = offset && previousOffset
      && Math.hypot(offset[0] - previousOffset[0], offset[1] - previousOffset[1]) < 0.025;
    if (!offset || onPrevious) { fixation.reset(); return false; }
    return fixation.update(offset[0], offset[1], now).stableFor >= 450;
  };
}

// Положення зіниць відносно кутів очей з точок facemesh (з iris-моделлю: 478 точок).
// Повертає [x, y] у частках ширини ока або null, якщо зіниць немає.
const IRIS = { left: 468, right: 473 };
const CORNERS = { left: [33, 133], right: [362, 263] };
export function irisOffset(p) {
  if (!p || p.length < 478) return null;
  let sx = 0, sy = 0;
  for (const side of ['left', 'right']) {
    const [a, b] = CORNERS[side].map(i => p[i]);
    const w = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    sx += (p[IRIS[side]][0] - mx) / w;
    sy += (p[IRIS[side]][1] - my) / w;
  }
  return [sx / 2, sy / 2];
}

// Порядок точок «змійкою»: сусідні точки поруч, без стрибків через увесь екран.
export function snakeOrder(xs, ys) {
  const out = [];
  ys.forEach((y, row) => {
    const cols = row % 2 ? [...xs].reverse() : xs;
    for (const x of cols) out.push([x, y]);
  });
  return out;
}
