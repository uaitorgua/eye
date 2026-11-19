// Відблиск екрана на рогівці («glint») — прототип ознаки для точнішого погляду. [pure] — без DOM, тестується в Node.
//
// Ідея (PCCR — pupil centre / corneal reflection): рогівка — опукле дзеркало. Яскраве джерело
// (світла рамка довкола екрана, settings.lightFrame) дає на ній маленьку світлу пляму. Коли око
// повертається, центр райдужки рухається, а відблиск майже ні, тож вектор «відблиск → центр райдужки»,
// поділений на радіус райдужки, залежить від напрямку погляду і мало — від відстані до камери.
//
// Обмеження звичайної вебкамери (720p, 50–70 см): райдужка ≈ 17 px у діаметрі, відблиск рамки 2–5 px,
// а сам вектор змінюється лише на ±1–3 px по всьому екрану. Тому це ДОДАТКОВА ознака для регресії
// WebGazer, а не окремий трекер. Маленький хрестик на екрані відблиску не дасть — потрібна велика яскрава рамка.
//
//   IRIS                                     — індекси точок райдужки FaceLandmarker (478 точок; у WebGazer їх нема)
//   irisCircle(landmarks, side)               → { x, y, r } | null
//   findGlint(gray, w, h, iris, opts)         → { x, y, vx, vy, contrast, area } | null

// Центр і 4 точки краю райдужки. 'left' — ліве око ЛЮДИНИ.
export const IRIS = { left: [468, 469, 470, 471, 472], right: [473, 474, 475, 476, 477] };

export function irisCircle(lm, side = 'left') {
  const ids = IRIS[side];
  if (!lm || lm.length <= ids[4]) return null;
  const pt = (i) => { const q = lm[i]; return q && (Array.isArray(q) ? q : [q.x, q.y]); };
  const c = pt(ids[0]);
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  let r = 0;
  for (const i of ids.slice(1)) { const q = pt(i); if (!q) return null; r += Math.hypot(q[0] - c[0], q[1] - c[1]); }
  r /= 4;
  return r > 0.5 ? { x: c[0], y: c[1], r } : null;
}

export const GLINT = {
  // Лише всередині райдужки. Раніше шукали в 1.25 r, але туди потрапляє білок ока — він такий самий
  // яскравий, як відблиск, і «перемагав» його (справжня камера 1080p, 17.11.2026). Відблиск на самому
  // краю райдужки (погляд далеко вбік) тепер пропускаємо — це рідше, ніж білок поруч.
  search: 1.0,
  minContrast: 40,  // наскільки найяскравіша точка має бути світлішою за медіану райдужки (0..255)
  level: 0.6,       // поріг плями: med + level · (max − med)
  minArea: 1,
  maxAreaFrac: 0.2, // більша пляма — відблиск окулярів; вікно при 1080p займає до ~15% райдужки
  maxAspect: 2.2,
  tries: 3,         // скільки найяскравіших плям перебрати, якщо перша не схожа на відблиск
  maxLeaks: 1,      // скільки яскравих сусідів за межею райдужки дозволено (шум); більше — пляма «витікає» на білок
};

// gray — яскравість кадру (Uint8Array/Uint8ClampedArray, w×h), координати iris — у пікселях цього кадру.
export function findGlint(gray, w, h, iris, opts = {}) {
  const o = { ...GLINT, ...opts };
  if (!gray || !iris || !(iris.r > 0)) return null;
  const R = iris.r * o.search, R2 = R * R;
  const x0 = Math.max(0, Math.floor(iris.x - R)), x1 = Math.min(w - 1, Math.ceil(iris.x + R));
  const y0 = Math.max(0, Math.floor(iris.y - R)), y1 = Math.min(h - 1, Math.ceil(iris.y + R));
  if (x1 <= x0 || y1 <= y0) return null;

  const bw0 = x1 - x0 + 1;
  const inside = (x, y) => { const dx = x - iris.x, dy = y - iris.y; return dx * dx + dy * dy <= R2; };

  // 1) Медіана яскравості всередині райдужки (гістограмою, без сортування) — це «фон».
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) { hist[gray[y * w + x]]++; n++; }
  if (!n) return null;
  let med = 0;
  for (let acc = 0; med < 256; med++) { acc += hist[med]; if (acc * 2 >= n) break; }

  // 2) Беремо найяскравішу ще не перевірену точку, заливаємо її пляму (4-зв'язно, лише всередині кола)
  //    і перевіряємо форму. Не схожа на відблиск (завелика, видовжена) — виключаємо й пробуємо наступну.
  const done = new Uint8Array(bw0 * (y1 - y0 + 1));    // 1 — піксель уже в якійсь перевіреній плямі
  const at = (x, y) => (y - y0) * bw0 + (x - x0);
  const maxArea = Math.max(o.minArea, Math.PI * iris.r * iris.r * o.maxAreaFrac);
  // Кілька плям можуть бути схожими на відблиск (вікно, лампа, рамка). Без «пам'яті» детектор
  // перестрибував між ними з кадру в кадр (σ ≈ 20 px на 1080p, 17.11.2026). Тому з придатних плям
  // беремо найближчу до вектора з попереднього кадру (o.prefer = { vx, vy }), а без нього — найяскравішу.
  const found = [];
  for (let attempt = 0; attempt < o.tries; attempt++) {
    let max = -1, mx = 0, my = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (done[at(x, y)] || !inside(x, y)) continue;
      const v = gray[y * w + x];
      if (v > max) { max = v; mx = x; my = y; }
    }
    if (max - med < o.minContrast) break;          // яскравіших плям більше немає
    const thr = med + o.level * (max - med);
    const stack = [[mx, my]], pix = [];
    let area = 0, leaks = 0, sw = 0, sx = 0, sy = 0, bx0 = mx, bx1 = mx, by0 = my, by1 = my;
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      // Пляма тягнеться за межу райдужки — це білок ока чи відблиск окулярів, а не відблиск на рогівці:
      // справжній відблиск — маленька цятка, оточена темнішою райдужкою/зіницею. Рахуємо такі «витоки».
      if (!inside(x, y)) { if (gray[y * w + x] >= thr) leaks++; continue; }
      const k = at(x, y);
      if (done[k]) continue;
      const v = gray[y * w + x];
      if (v < thr) continue;
      done[k] = 1;                       // і для відхиленої плями: наступна спроба її вже не візьме
      pix.push(x, y);
      area++;
      // 3) Субпіксельний центр: зважуємо яскравістю понад поріг.
      const wgt = v - thr + 1;
      sw += wgt; sx += wgt * x; sy += wgt * y;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    // Відхилена пляма: виключаємо ще й кільце 1 px довкола неї. Інакше її тьмяніший край (нижче порогу
    // цієї плями, але вище порогу наступної) на наступній спробі виглядав би як окрема маленька «цятка».
    const reject = () => {
      for (let i = 0; i < pix.length; i += 2) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = pix[i] + dx, y = pix[i + 1] + dy;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) done[at(x, y)] = 1;
      }
    };
    if (area < o.minArea || area > maxArea || leaks > o.maxLeaks || Math.max(bw, bh) / Math.min(bw, bh) > o.maxAspect) { reject(); continue; }
    const gx = sx / sw, gy = sy / sw;
    // 4) Ознака для регресії: вектор відблиск → центр райдужки в радіусах райдужки.
    //    fill — яку частку рамки займає пляма: кругла цятка ≈ 0,8, вікно ≈ 1, відбитий хрест ≈ 0,3–0,5.
    const cand = { x: gx, y: gy, vx: (iris.x - gx) / iris.r, vy: (iris.y - gy) / iris.r, contrast: max - med, area,
      fill: area / (bw * bh), box: { x0: bx0, y0: by0, x1: bx1, y1: by1 } };
    if (o.accept && !o.accept(cand)) { reject(); continue; }
    found.push(cand);
    if (!o.prefer) break;                  // без попереднього кадру — перша (найяскравіша) придатна
  }
  if (!found.length) return null;
  if (!o.prefer) return found[0];
  const dist = (g) => Math.hypot(g.vx - o.prefer.vx, g.vy - o.prefer.vy);
  return found.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}

// ── Білий хрест, що блимає (експеримент) ─────────────────────────────────────────────────────────
// Звичайний детектор не відрізняє відблиск екрана від відблиску вікна чи лампи — вони однаково яскраві.
// Тому на екрані показуємо великий білий хрест на чорному і раз на секунду його вимикаємо. Віднімаємо
// кадр «хрест вимкнено» від кадру «хрест увімкнено»: усе, що світить постійно (вікно, лампа), зникає,
// лишається лише відблиск хреста. Голова між кадрами трохи рухається, тож кадр-фон спершу суміщаємо з
// кадром on (з точністю до 1/8 пікселя, alignCross).
//
//   frame = { gray, x0, y0, w, h, iris: { x, y, r } }   — виріз довкола ока; iris — у пікселях ПОВНОГО кадру
//   alignCross(on, off)              → { sx, sy }   зсув: точка (x, y) вирізу on = точка (x+sx, y+sy) вирізу off
//   crossDiff(on, off, shift)        → { pos, neg } яскравість, що з'явилась / зникла (у координатах вирізу on)
//   findCrossGlint(on, off, opts)    → як findGlint (координати вирізу on) + ghost, shift | null

function sample(f, x, y) {               // білінійно; -1 — поза вирізом
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix + 1 >= f.w || iy + 1 >= f.h) return -1;
  const ax = x - ix, ay = y - iy, k = iy * f.w + ix, g = f.gray;
  return (g[k] * (1 - ax) + g[k + 1] * ax) * (1 - ay) + (g[k + f.w] * (1 - ax) + g[k + f.w + 1] * ax) * ay;
}

// Починаємо з різниці центрів райдужок (точки трекера), далі уточнюємо за самою картинкою: точки райдужки
// тремтять на піксель-два, а цього досить, щоб краї зіниці й райдужки дали в різниці яскраві смужки.
// Міра — сума ОБРІЗАНИХ відхилень різниці від її середнього в колі 1,3 r: краї зіниці, райдужки й повік
// дають сильний сигнал; загальне посвітлішання від екрана знімає середнє, а сам відблиск хреста (він є
// лише в on) обрізання робить нешкідливим.
export function alignCross(on, off, range = 2) {
  const base = { sx: on.x0 - off.x0 - (on.iris.x - off.iris.x), sy: on.y0 - off.y0 - (on.iris.y - off.iris.y) };
  const cx = on.iris.x - on.x0, cy = on.iris.y - on.y0, R = on.iris.r * 1.3, R2 = R * R;
  const pts = (step) => {
    const out = [];
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(on.h - 1, cy + R); y += step)
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(on.w - 1, cx + R); x += step)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= R2) out.push(x, y);
    return out;
  };
  const cost = (p, sx, sy) => {
    const d = [];
    for (let i = 0; i < p.length; i += 2) {
      const b = sample(off, p[i] + sx, p[i + 1] + sy);
      if (b >= 0) d.push(on.gray[p[i + 1] * on.w + p[i]] - b);
    }
    if (d.length < p.length / 4) return Infinity;      // виріз-фон майже не перекривається
    const mean = d.reduce((a, v) => a + v, 0) / d.length;
    let c = 0;
    for (const v of d) c += Math.min(Math.abs(v - mean), 40);
    return c / d.length;
  };
  // Грубо (сітка 0,5 px, рідкі точки), потім двічі точніше довкола найкращого (усі точки).
  let best = base, bestC = Infinity;
  const coarse = pts(Math.max(1, Math.round(on.iris.r / 12))), fine = pts(1);
  for (let dy = -range; dy <= range; dy += 0.5) for (let dx = -range; dx <= range; dx += 0.5) {
    const c = cost(coarse, base.sx + dx, base.sy + dy);
    if (c < bestC) { bestC = c; best = { sx: base.sx + dx, sy: base.sy + dy }; }
  }
  for (const st of [0.25, 0.125]) {
    const c0 = best;
    bestC = cost(fine, c0.sx, c0.sy);
    for (let dy = -st; dy <= st; dy += st) for (let dx = -st; dx <= st; dx += st) {
      if (!dx && !dy) continue;
      const c = cost(fine, c0.sx + dx, c0.sy + dy);
      if (c < bestC) { bestC = c; best = { sx: c0.sx + dx, sy: c0.sy + dy }; }
    }
  }
  return best;
}

export function crossDiff(on, off, shift = alignCross(on, off)) {
  const n = on.w * on.h, pos = new Uint8ClampedArray(n), neg = new Uint8ClampedArray(n);
  for (let y = 0; y < on.h; y++) for (let x = 0; x < on.w; x++) {
    const b = sample(off, x + shift.sx, y + shift.sy);
    if (b < 0) continue;                                     // поза кадром-фоном: 0
    const d = on.gray[y * on.w + x] - b;
    if (d > 0) pos[y * on.w + x] = d; else neg[y * on.w + x] = -d;
  }
  return { pos, neg };
}

export function findCrossGlint(on, off, opts = {}) {
  if (!on?.gray || !off?.gray || !on.iris || !off.iris) return null;
  const shift = alignCross(on, off);
  const { pos, neg } = crossDiff(on, off, shift);
  const iris = { x: on.iris.x - on.x0, y: on.iris.y - on.y0, r: on.iris.r };
  // «Привид»: якщо постійний відблиск лишився трохи не суміщеним, у різниці він дає світлий півмісяць з одного
  // боку і такий самий темний — з другого. Справжній новий відблиск темної пари не має. Тож поруч із
  // кандидатом «зникла» яскравість має бути щонайменше вдвічі слабша.
  const accept = (c) => {
    let ghost = 0;
    const m = 2;
    for (let y = Math.max(0, c.box.y0 - m); y <= Math.min(on.h - 1, c.box.y1 + m); y++)
      for (let x = Math.max(0, c.box.x0 - m); x <= Math.min(on.w - 1, c.box.x1 + m); x++)
        if (neg[y * on.w + x] > ghost) ghost = neg[y * on.w + x];
    c.ghost = ghost;
    return ghost < 0.5 * c.contrast;
  };
  // search 0.8: край райдужки межує з білком (різниця яскравості ≈150), і навіть мала похибка суміщення дає
  // там смужку. Відблиск хреста на самому краю райдужки пропускаємо.
  const g = findGlint(pos, on.w, on.h, iris, { minContrast: 25, search: 0.8, ...opts, accept });
  return g && { ...g, shift };
}

// Критерій з man-notes 5.2: наскільки «тремтить» вектор відблиск→райдужка, поки погляд нерухомий.
// samples — [{ dx, dy }] у ПІКСЕЛЯХ камери. Повертає стандартні відхилення і чи пройдено поріг.
export const JITTER_LIMIT_PX = 0.3;
export function jitterStats(samples, limit = JITTER_LIMIT_PX) {
  const n = samples.length;
  if (n < 2) return { n, sdX: NaN, sdY: NaN, sd: NaN, pass: false };
  const mean = (k) => samples.reduce((a, s) => a + s[k], 0) / n;
  const sd = (k, m) => Math.sqrt(samples.reduce((a, s) => a + (s[k] - m) ** 2, 0) / (n - 1));
  const sdX = sd('dx', mean('dx')), sdY = sd('dy', mean('dy'));
  const both = Math.hypot(sdX, sdY);
  return { n, sdX, sdY, sd: both, pass: both < limit };
}

// RGBA (ImageData.data) → яскравість. Окремо, щоб findGlint лишався простим і швидким.
export function toGray(rgba, w, h, out = new Uint8ClampedArray(w * h)) {
  for (let i = 0, j = 0; j < w * h; i += 4, j++) out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return out;
}
