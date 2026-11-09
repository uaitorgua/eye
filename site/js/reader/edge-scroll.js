// Прокрутка поглядом біля країв (як «gaze scroll» у Tobii / Windows Eye Control). [pure]
// Дивишся в нижню смугу тексту — сторінка плавно їде вгору (читаєш далі); у верхню — назад.
// Ліва/права смуги працюють лише коли сторінка ширша за екран (збільшений масштаб).
// Щоб текст не «тікав» під час читання: рух починається лише після onsetMs у зоні,
// а швидкість росте квадратично з глибиною погляду в зоні.
//
//   const s = createEdgeScroller();
//   s.update(x, y, rect, nowMs, { canX, canY, maxSpeed }) → { vx, vy, zone }  (px/с, zone: 'top'|'bottom'|'left'|'right'|null)

export const ZONES = { top: 0.16, bottom: 0.24, side: 0.12 };
export const ONSET_MS = 450;
const MIN_FACTOR = 0.15;

export function projectScrollBand(x, y, view, top, bottom) {
  const contains = band => x >= band.left && x < band.right && y >= band.top && y < band.bottom;
  const inTop = contains(top);
  const inBottom = contains(bottom);
  return {
    x: inTop || inBottom ? Math.max(view.left, Math.min(view.right - 1, x)) : x,
    y: inTop ? view.top + 1 : inBottom ? view.bottom - 1 : y,
    inBand: inTop || inBottom,
  };
}

export function createEdgeScroller({ zones = ZONES, onsetMs = ONSET_MS } = {}) {
  let zone = null, since = 0;

  return {
    reset() { zone = null; },
    update(x, y, rect, now, { canX = false, canY = true, maxSpeed = 350 } = {}) {
      const none = { vx: 0, vy: 0, zone: null, ready: 0 };
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) { zone = null; return none; }
      const fx = (x - rect.left) / rect.width, fy = (y - rect.top) / rect.height;

      // Глибина в кожній зоні (0 — на межі, 1 — біля краю).
      const depth = {
        top: canY && fy < zones.top ? 1 - fy / zones.top : 0,
        bottom: canY && fy > 1 - zones.bottom ? (fy - (1 - zones.bottom)) / zones.bottom : 0,
        left: canX && fx < zones.side ? 1 - fx / zones.side : 0,
        right: canX && fx > 1 - zones.side ? (fx - (1 - zones.side)) / zones.side : 0,
      };
      let z = null, d = 0;
      for (const [k, v] of Object.entries(depth)) if (v > d) { z = k; d = v; }

      if (z !== zone) { zone = z; since = now; }
      if (!z) return none;
      const ready = Math.min(1, (now - since) / onsetMs);
      if (ready < 1) return { ...none, zone: z, ready };

      const speed = maxSpeed * (MIN_FACTOR + (1 - MIN_FACTOR) * d * d);
      return {
        vx: z === 'left' ? -speed : z === 'right' ? speed : 0,
        vy: z === 'top' ? -speed : z === 'bottom' ? speed : 0,
        zone: z, ready: 1,
      };
    },
  };
}
