// ─────────────────────────────────────────────────────────────────────────────
// UAIT Gaze Calibration — спільна система калібрування й вимірювання якості
// для ВСІХ додатків eye. Самодостатній модуль: власні стилі й оверлей,
// залежить лише від window.webgazer і facemesh-точок.
//
// НАУКОВА ОСНОВА (мінімальні метрики якості за Holmqvist et al.):
//   • accuracy  — середня евклідова відстань погляд↔ціль, у ГРАДУСАХ зорового кута;
//   • precision — RMS між сусідніми семплами (RMS-S2S), у градусах;
//   • valid %   — частка валідних семплів (втрата даних через кліпання чи втрату обличчя).
// Валідація виконується на ОКРЕМИХ точках, яких НЕ було в калібруванні: інакше ми
// міряємо підгонку моделі під саму себе, а не реальну точність.
//
// ГЕОМЕТРІЯ (px → градуси): відстань до ока оцінюємо за горизонтальним діаметром
// райдужки (HVID ≈ 11.7 мм — анатомічно стала величина, норма 11.3–12.3 мм):
//   distance_mm = HVID_mm × focal_px / iris_px,   focal_px ≈ (videoW/2) / tan(FOV/2)
// Далі мм екрана на піксель — з діагоналі екрана. Обидва припущення (поле зору камери
// й діагональ) задаються ззовні. Пікселі завжди точні, градуси — обґрунтована оцінка.
//
// Орієнтир: вебкамерний трекінг (WebGazer) реально дає близько 1–4° залежно від умов.
// ─────────────────────────────────────────────────────────────────────────────
import { createFixationDetector, irisOffset, crossOrder } from './fixation.js';

export const GEO = { irisMm: 11.7, camFovDeg: 60, screenDiagIn: 15.6 };

// Пороги якості (градуси) з огляду на реальні можливості вебкамерного трекінгу.
export const GRADES = [
  { max: 1.5, key: 'good', label: 'добра' },
  { max: 3.0, key: 'ok', label: 'прийнятна' },
  { max: Infinity, key: 'poor', label: 'слабка' },
];
export const gradeOf = (deg) => GRADES.find(g => deg <= g.max);

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const wg = () => window.webgazer;
const positions = () => wg()?.getTracker?.()?.getPositions?.();

// ── Геометрія ───────────────────────────────────────────────────────────────
function videoWidthPx() {
  const v = document.getElementById('webgazerVideoFeed');
  return v?.videoWidth || v?.width || 640;
}

// Горизонтальний діаметр райдужки в пікселях відео (iris-модель: точки 468–477).
export function irisDiameterPx(pos) {
  if (!pos || pos.length < 478) return null;
  const d = (a, b) => Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]);
  const left = Math.max(d(469, 471), d(470, 472));
  const right = Math.max(d(474, 476), d(475, 477));
  const both = [left, right].filter(v => v > 0);
  return both.length ? both.reduce((a, b) => a + b, 0) / both.length : null;
}

// Скільки екранних пікселів припадає на 1° зорового кута.
export function geometry(pos, geo = GEO) {
  const irisPx = irisDiameterPx(pos);
  if (!irisPx) return null;
  const focalPx = (videoWidthPx() / 2) / Math.tan((geo.camFovDeg * Math.PI) / 360);
  const distanceMm = (geo.irisMm * focalPx) / irisPx;
  const diagPx = Math.hypot(screen.width, screen.height);
  const mmPerPx = (geo.screenDiagIn * 25.4) / diagPx;
  const distancePx = distanceMm / mmPerPx;
  return { distanceMm, mmPerPx, pxPerDeg: distancePx * Math.tan(Math.PI / 180) };
}

// ── Оверлей ─────────────────────────────────────────────────────────────────
// Шари узгоджено з базовим CSS застосунку: модалка 5000, відео камери 10005, текст 10010.
// Якщо поставити оверлей вище за відео — людина не побачить свого обличчя під час наведення.
const CSS = `
.gz-cal{position:fixed;inset:0;z-index:5000;background:#0b1526;color:#eaf2ff;
  font:16px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
.gz-cal.gz-clear{background:rgba(11,21,38,.97)}
.gz-msg{max-width:720px;text-align:center;padding:24px;position:relative;z-index:10010}
.gz-msg h2{font-size:1.6rem;margin:0 0 10px}
.gz-msg p{color:#aebfd8;margin:6px 0}
.gz-dot{position:absolute;width:42px;height:42px;border-radius:50%;transform:translate(-50%,-50%);z-index:10006;
  background:radial-gradient(circle at 35% 32%,#ffd6d6,#ff6b6b 60%,#c33 100%);
  box-shadow:0 0 22px 8px rgba(255,107,107,.45)}
.gz-dot.gz-settled{background:radial-gradient(circle at 35% 32%,#c8ffe8,#20c997 60%,#0b7a5a 100%);
  box-shadow:0 0 22px 8px rgba(32,201,151,.5)}
.gz-dot.gz-val{background:radial-gradient(circle at 35% 32%,#cfe0ff,#5aa9ff 60%,#1e6bff 100%);
  box-shadow:0 0 22px 8px rgba(30,107,255,.45)}
.gz-bar{position:absolute;left:0;right:0;bottom:28px;text-align:center;color:#8fa6c8;font-size:.95rem}
`;
function overlay() {
  if (!document.getElementById('gz-cal-style')) {
    const st = document.createElement('style');
    st.id = 'gz-cal-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'gz-cal';
  document.body.appendChild(el);
  return el;
}
const say = (el, html) => { el.innerHTML = '<div class="gz-msg">' + html + '</div>'; };

// ── 1. Гейт «обличчя в кадрі» ───────────────────────────────────────────────
// Не починаємо калібрування, доки модель реально не бачить обличчя й зіниці:
// інакше вся процедура марна, а людина дізнається про це аж наприкінці.
export async function faceGate(ov, { timeoutMs = 25000, needMs = 1200 } = {}) {
  const t0 = performance.now();
  let okSince = null;
  document.body.classList.add('calibrating');
  try { wg().showVideoPreview(true); } catch { /* ok */ }
  while (performance.now() - t0 < timeoutMs) {
    const pos = positions();
    // Достатньо, щоб модель бачила ОБЛИЧЧЯ (468 точок). Зіниці (478, iris-модель) бажані,
    // але не обов'язкові: без них калібрування працює за запасним таймером,
    // а градуси в звіті просто не рахуються. Інакше на частині машин гейт ніколи не пройде.
    const ok = !!pos && pos.length >= 468;
    if (ok) {
      if (okSince == null) okSince = performance.now();
      const held = performance.now() - okSince;
      say(ov, '<h2>Бачу обличчя</h2><p>Сиди рівно, дивись у камеру.</p><p>Починаємо за '
        + Math.max(0, Math.ceil((needMs - held) / 1000)) + '…</p>');
      if (held >= needMs) { document.body.classList.remove('calibrating'); return true; }
    } else {
      okSince = null;
      say(ov, '<h2>Шукаю обличчя…</h2><p>Сядь навпроти камери, щоб обличчя було в кадрі.</p>'
        + '<p>Світло має падати на обличчя, а не бути позаду.</p>');
    }
    await wait(150);
  }
  document.body.classList.remove('calibrating');
  return false;
}

// ── 2. Збір однієї калібрувальної точки ─────────────────────────────────────
const MIN_SHOW_MS = 700, SETTLE_MS = 450, SAMPLES = 40, SAMPLE_MS = 50, MAX_POINT_MS = 12000;
const SACCADE_MIN = 0.025, SACCADE_WAIT_MS = 3000;
// Точка вважається проблемною, якщо зібрала мало зразків або зіниця «плавала».
const SUSPECT_SAMPLES = SAMPLES * 0.6, SUSPECT_SPREAD = 0.02, MAX_RETRY = 4;

async function collectPoint(ov, x, y, prevOff, skipped) {
  const dot = document.createElement('div');
  dot.className = 'gz-dot';
  dot.style.left = x + 'px';
  dot.style.top = y + 'px';
  ov.appendChild(dot);
  const fix = createFixationDetector();
  const start = performance.now();
  let got = 0, moved = !prevOff, sx = 0, sy = 0, sxx = 0, syy = 0, n = 0;
  while (got < SAMPLES) {
    const now = performance.now();
    if ((skipped && skipped()) || now - start > MAX_POINT_MS) break;
    const off = irisOffset(positions());
    let ok;
    if (off) {
      if (!moved) {
        moved = Math.hypot(off[0] - prevOff[0], off[1] - prevOff[1]) >= SACCADE_MIN
          || now - start > SACCADE_WAIT_MS;
      }
      if (!moved) fix.reset();
      const r = fix.update(off[0], off[1], now);
      ok = moved && now - start > MIN_SHOW_MS && r.stableFor >= SETTLE_MS;
      if (ok) { sx += off[0]; sy += off[1]; sxx += off[0] * off[0]; syy += off[1] * off[1]; n++; }
    } else {
      ok = now - start > 2500;               // запасний режим, якщо зіниць не видно
    }
    dot.classList.toggle('gz-settled', !!ok);
    if (ok) {
      wg().recordScreenPosition(x, y, 'click');
      got++;
      dot.style.transform = 'translate(-50%,-50%) scale(' + (1 - 0.6 * got / SAMPLES).toFixed(3) + ')';
    }
    await wait(SAMPLE_MS);
  }
  dot.remove();
  const vx = n > 1 ? Math.max(0, sxx / n - Math.pow(sx / n, 2)) : 0;
  const vy = n > 1 ? Math.max(0, syy / n - Math.pow(sy / n, 2)) : 0;
  return { off: n ? [sx / n, sy / n] : null, samples: got, spread: n > 1 ? Math.sqrt(vx + vy) : null };
}

// ── 3. Вимірювання якості в одній точці ─────────────────────────────────────
// accuracy — середнє відхилення від цілі; precision — RMS між сусідніми семплами.
async function measurePoint(ov, x, y, { ms = 2200, sampleMs = 50 } = {}) {
  const dot = document.createElement('div');
  dot.className = 'gz-dot gz-val';
  dot.style.left = x + 'px';
  dot.style.top = y + 'px';
  ov.appendChild(dot);
  await wait(700);                            // час перевести й зафіксувати погляд
  const pts = [];
  let expected = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    expected++;
    const p = await wg().getCurrentPrediction();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push([p.x, p.y]);
    await wait(sampleMs);
  }
  dot.remove();
  if (pts.length < 5) return { x, y, valid: 0, accuracyPx: null, precisionPx: null, n: pts.length, expected };
  const errs = pts.map(p => Math.hypot(p[0] - x, p[1] - y));
  const accuracyPx = errs.reduce((a, b) => a + b, 0) / errs.length;
  let s2s = 0;
  for (let i = 1; i < pts.length; i++) {
    s2s += Math.pow(pts[i][0] - pts[i - 1][0], 2) + Math.pow(pts[i][1] - pts[i - 1][1], 2);
  }
  const precisionPx = Math.sqrt(s2s / (pts.length - 1));
  return { x, y, valid: pts.length / expected, accuracyPx, precisionPx, n: pts.length, expected };
}

// ── 4. Повний цикл ──────────────────────────────────────────────────────────
// Звіт: { ok, accuracyDeg, worstDeg, precisionDeg, accuracyPx, validPct,
//         pxPerDeg, distanceCm, grade, points, ts }
export async function runCalibration(opts) {
  const o = opts || {};
  const geo = o.geo || GEO;
  const onStatus = o.onStatus;
  const g = wg();
  if (!g) return { ok: false, error: 'WebGazer не завантажено' };
  const ov = overlay();
  const status = (t) => { if (onStatus) onStatus(t); };
  let skip = false;
  const onKey = (e) => { if ([' ', 'Enter'].includes(e.key)) { skip = true; e.preventDefault(); } };
  const onClick = () => { skip = true; };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('click', onClick);

  try {
    status('Шукаю обличчя…');
    if (!(await faceGate(ov))) {
      return { ok: false, error: 'Не бачу обличчя в кадрі. Перевірте камеру та освітлення.' };
    }
    try { g.showVideoPreview(false); } catch { /* ok */ }
    g.clearData();

    const W = innerWidth, H = innerHeight;
    const calPoints = crossOrder(W, H);        // навхрест: сусідні точки далеко одна від одної
    ov.classList.add('gz-clear');
    ov.innerHTML = '<div class="gz-bar">Дивись на кружечок. Червоний — шукай очима, зелений — тримай погляд</div>';
    const bar = ov.querySelector('.gz-bar');
    let prevOff = null;
    const stats = [];
    for (let i = 0; i < calPoints.length; i++) {
      const x = calPoints[i][0], y = calPoints[i][1];
      bar.textContent = 'Точка ' + (i + 1) + ' з ' + calPoints.length;
      status('Калібрування ' + (i + 1) + '/' + calPoints.length);
      skip = false;
      const r = await collectPoint(ov, x, y, prevOff, () => skip);
      if (r.off) prevOff = r.off;
      stats.push({ x, y, samples: r.samples, spread: r.spread });
      await wait(250);
    }
    const thin = stats.filter(s => s.samples < SAMPLES * 0.5).length;

    // Перезнімаємо ПРОБЛЕМНІ точки: мало зразків (кліпнув, відвів погляд) або
    // великий розкид зіниці (погляд «плавав»). WebGazer не вміє видалити старі
    // зразки, тож нові додаються в тій самій ділянці екрана й розбавляють шум.
    const suspects = stats
      .filter(s => s.samples < SUSPECT_SAMPLES || (s.spread != null && s.spread > SUSPECT_SPREAD))
      .slice(0, MAX_RETRY);
    for (let i = 0; i < suspects.length; i++) {
      bar.textContent = 'Уточнюємо точку ' + (i + 1) + ' з ' + suspects.length;
      status('Уточнення ' + (i + 1) + '/' + suspects.length);
      skip = false;
      await collectPoint(ov, suspects[i].x, suspects[i].y, prevOff, () => skip);
      await wait(200);
    }

    // Валідація на ОКРЕМИХ точках (їх не було серед калібрувальних).
    const vpFrac = [[0.5, 0.5], [0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]];
    bar.textContent = 'Перевірка точності: дивись на синій кружечок';
    const points = [];
    for (let i = 0; i < vpFrac.length; i++) {
      status('Перевірка ' + (i + 1) + '/' + vpFrac.length);
      points.push(await measurePoint(ov, vpFrac[i][0] * W, vpFrac[i][1] * H));
    }

    const geoNow = geometry(positions(), geo);
    const pxPerDeg = geoNow ? geoNow.pxPerDeg : null;
    const usable = points.filter(p => p.accuracyPx != null);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const accuracyPx = usable.length ? mean(usable.map(p => p.accuracyPx)) : null;
    const worstPx = usable.length ? Math.max.apply(null, usable.map(p => p.accuracyPx)) : null;
    const precisionPx = usable.length ? mean(usable.map(p => p.precisionPx)) : null;
    const validPct = Math.round(100 * mean(points.map(p => p.valid)));
    const toDeg = (px) => (px != null && pxPerDeg) ? px / pxPerDeg : null;

    const report = {
      ok: accuracyPx != null,
      accuracyPx, worstPx, precisionPx, validPct,
      accuracyDeg: toDeg(accuracyPx), worstDeg: toDeg(worstPx), precisionDeg: toDeg(precisionPx),
      pxPerDeg, distanceCm: geoNow ? Math.round(geoNow.distanceMm / 10) : null,
      thinPoints: thin, retried: suspects.length, points, ts: Date.now(),
    };
    report.grade = report.accuracyDeg != null
      ? gradeOf(report.accuracyDeg)
      : (accuracyPx != null ? gradeOf(accuracyPx / 40) : GRADES[2]);
    try { localStorage.setItem('eyeflow.calibration', JSON.stringify(report)); } catch { /* нема сховища */ }
    return report;
  } finally {
    document.removeEventListener('keydown', onKey, true);
    ov.remove();
    try { wg().showVideoPreview(true); } catch { /* ok */ }
  }
}

export const lastReport = () => {
  try { return JSON.parse(localStorage.getItem('eyeflow.calibration') || 'null'); } catch { return null; }
};
