// Керування вказівником рухами голови. [pure] — без DOM і камери, тестується в Node.
//
// Ідея: з точок FaceMesh беремо, наскільки кінчик носа зміщений від середини обличчя,
// у частках ширини/висоти обличчя. Коли голова повертається, ніс «виїжджає» вбік, а коли
// людина просто пересувається в кадрі чи сідає ближче — частка не змінюється. Тому сигнал
// залежить від ПОВОРОТУ голови, а не від її положення перед камерою.
//
//   headOffset(positions)                   → { yaw, pitch, size } | null
//   oneEuro({ minCutoff, beta })            → фільтр 1€ (Casiez та ін., CHI 2012)
//   createHeadPointer()                     → .setNeutral(offset), .update(offset, tMs, { w, h, sens, invertX }) → { x, y } | null

// Індекси точок MediaPipe FaceMesh: кінчик носа, краї обличчя на рівні вилиць, верх лоба, підборіддя.
export const LM = { nose: 1, left: 234, right: 454, top: 10, chin: 152 };

export function headOffset(p) {
  if (!p || p.length <= LM.right) return null;
  const n = p[LM.nose], l = p[LM.left], r = p[LM.right], t = p[LM.top], c = p[LM.chin];
  if (![n, l, r, t, c].every(q => q && Number.isFinite(q[0]) && Number.isFinite(q[1]))) return null;
  // Осі обличчя в кадрі: так нахил голови до плеча (roll) не плутається з поворотом.
  const ax = [r[0] - l[0], r[1] - l[1]], ay = [c[0] - t[0], c[1] - t[1]];
  const w2 = ax[0] * ax[0] + ax[1] * ax[1], h2 = ay[0] * ay[0] + ay[1] * ay[1];
  if (w2 < 1 || h2 < 1) return null;
  const yaw = ((n[0] - (l[0] + r[0]) / 2) * ax[0] + (n[1] - (l[1] + r[1]) / 2) * ax[1]) / w2;
  const pitch = ((n[0] - (t[0] + c[0]) / 2) * ay[0] + (n[1] - (t[1] + c[1]) / 2) * ay[1]) / h2;
  return { yaw, pitch, size: Math.sqrt(w2) };
}

// Фільтр 1€: коли голова нерухома — сильно згладжує тремтіння, коли рухається швидко — майже не затримує.
export function oneEuro({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
  let x = null, dx = 0, t0 = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return {
    reset() { x = null; },
    filter(v, tMs) {
      if (x == null) { x = v; dx = 0; t0 = tMs; return v; }
      const dt = Math.max(1e-3, (tMs - t0) / 1000); t0 = tMs;
      dx += alpha(dCutoff, dt) * ((v - x) / dt - dx);
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (v - x);
      return x;
    },
  };
}

// Який зсув носа (у частках обличчя) відповідає краю екрана при чутливості 100%.
// Орієнтир: поворот ≈12° убік і ≈8° вгору/вниз — зручно і не втомлює шию.
export const RANGE = { yaw: 0.14, pitch: 0.06 };
const LIMIT = 1.08;          // трохи далі за край екрана: за цією межею «нуль» починає їхати за головою
const REANCHOR_STEP = 0.05;  // не більше за кадр, щоб разовий збій трекера не збив центр

// Біля центру рух повільніший (точність для тексту й кнопок), до країв — швидший.
export const curve = (v) => v * (0.6 + 0.4 * Math.min(1, Math.abs(v)));

export function createHeadPointer({ range = RANGE, minCutoff = 0.5, beta = 2.5 } = {}) {
  const fx = oneEuro({ minCutoff, beta }), fy = oneEuro({ minCutoff, beta });
  let neutral = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    get neutral() { return neutral && { ...neutral }; },
    setNeutral(o) { neutral = o ? { yaw: o.yaw, pitch: o.pitch } : null; fx.reset(); fy.reset(); },
    update(o, tMs, { w, h, sens = 1, invertX = false } = {}) {
      if (!neutral || !o) return null;
      // Камера бачить людину «навпроти»: поворот праворуч зсуває ніс ліворуч у кадрі, тому знак мінус.
      const sx = invertX ? 1 : -1;
      let nx = sx * (o.yaw - neutral.yaw) / range.yaw * sens;
      let ny = (o.pitch - neutral.pitch) / range.pitch * sens;
      // Голова повернулась далі, ніж край екрана: зсуваємо «нуль» слідом. Тоді достатньо
      // повернути голову назад — і вказівник одразу відходить від краю (як миша біля краю екрана).
      const over = (v) => (Math.abs(v) > LIMIT ? clamp(v - Math.sign(v) * LIMIT, -REANCHOR_STEP, REANCHOR_STEP) : 0);
      const ox = over(nx), oy = over(ny);
      if (ox) neutral.yaw += sx * ox * range.yaw / sens;
      if (oy) neutral.pitch += oy * range.pitch / sens;
      nx = fx.filter(clamp(nx, -LIMIT, LIMIT), tMs);
      ny = fy.filter(clamp(ny, -LIMIT, LIMIT), tMs);
      return {
        x: clamp(w / 2 * (1 + curve(nx)), 0, w - 1),
        y: clamp(h / 2 * (1 + curve(ny)), 0, h - 1),
      };
    },
  };
}

export const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
