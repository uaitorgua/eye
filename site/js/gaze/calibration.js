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
import { eyes } from './blink.js';
import { createFixationDetector, createTargetMotion, irisOffset, snakeOrder } from './fixation.js';
import { watchEyesStop, EYES_STOP_MS } from './eyes-stop.js';

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
.gz-dot.gz-confirmed{outline:3px solid #cfe0ff;outline-offset:6px}
/* Жовте кільце: куди, за оцінкою камери, зараз спрямований погляд (лише під час перевірки). */
.gz-gaze{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:10007;
  border:4px solid #ffd43b;box-shadow:0 0 0 2px rgba(11,21,38,.7),0 0 18px rgba(255,212,59,.6);pointer-events:none;will-change:transform}
.gz-gaze::after{content:'';position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#ffd43b}
.gz-bar b{color:#ffd43b;font-weight:700}
body:has(.gz-cal) #gaze-dot{visibility:hidden}
.gz-bar{position:absolute;left:0;right:0;bottom:24px;padding:0 16px;text-align:center;color:#a9bcd9;font-size:.95rem}
/* Верхній лівий кут: етап і прогрес точками. Тримаємо нижче 56px — під ним проходять калібрувальні точки. */
.gz-top{position:absolute;left:18px;top:14px;z-index:10011;display:flex;align-items:center;gap:12px;max-width:calc(100% - 230px);
  height:38px;padding:0 16px;border-radius:999px;background:rgba(20,36,63,.92);border:1px solid #2c4470;color:#eaf2ff;
  font:600 15px/1 system-ui,sans-serif;white-space:nowrap}
.gz-stage{font-variant-numeric:tabular-nums}
.gz-pips{display:flex;gap:5px}
.gz-pips i{width:9px;height:9px;border-radius:50%;background:#33486e;transition:background .2s,transform .2s}
.gz-pips i.done{background:#20c997}
.gz-pips i.now{background:#ffd43b;transform:scale(1.35)}
.gz-pips i.miss{background:#ff8f8f}
.gz-pips i.gz-gap{margin-left:7px}
.gz-tip{color:#8fa6c8;font-weight:500;overflow:hidden;text-overflow:ellipsis}
.gz-msg .gz-note{display:inline-flex;align-items:center;gap:10px;margin-top:18px;padding:9px 16px;border-radius:999px;
  background:#14243f;border:1px solid #2c4470;color:#cfe0ff;font-size:.95rem}
.gz-msg .gz-note::before{content:'';width:22px;height:9px;border-bottom:3px solid #ffd43b;border-radius:0 0 50% 50%}
@media (max-width:760px){.gz-tip{display:none}.gz-top{max-width:calc(100% - 200px)}}
/* Гейт «обличчя в кадрі»: відео камери стоїть по центру (416×312), тож текст ставимо ПІД нього, а не поверх. */
.gz-cal.gz-gate{align-items:flex-start}
.gz-cal.gz-gate .gz-msg{margin-top:calc(50vh + 164px);padding-top:0}
@media (max-height:780px){
  .gz-cal.gz-gate{align-items:flex-end}
  .gz-cal.gz-gate .gz-msg{margin:0 12px 10px;padding:12px 22px;border-radius:18px;background:rgba(11,21,38,.86)}
  .gz-cal.gz-gate .gz-msg h2{font-size:1.25rem;margin-bottom:4px}
  .gz-cal.gz-gate .gz-msg .gz-note{margin-top:8px}
}
.gz-cancel{position:absolute;top:18px;right:18px;z-index:10011;padding:12px 20px;border-radius:14px;cursor:pointer;
  border:2px solid #3b5584;background:#14243f;color:#eaf2ff;font:600 16px/1.2 system-ui,sans-serif}
.gz-cancel:hover,.gz-cancel:focus-visible{border-color:#eaf2ff;outline:none}
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
  // While calibrating, nothing underneath may react to gaze (see scope() in dwell.js).
  el.setAttribute('data-gaze-block', '');
  document.body.appendChild(el);
  return el;
}

// Cancel for the adult helper: a mouse/keyboard button that survives overlay redraws, plus Esc.
// It is deliberately not a gaze target: during calibration the eyes are busy following dots.
function cancelButton(ov, onCancel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gz-cancel';
  btn.textContent = 'Скасувати (Esc)';
  btn.addEventListener('click', (e) => { e.stopPropagation(); onCancel(); });
  const keep = new MutationObserver(() => { if (!btn.isConnected && ov.isConnected) ov.appendChild(btn); });
  keep.observe(ov, { childList: true });
  ov.appendChild(btn);
  return () => keep.disconnect();
}
const STOP_SEC = Math.round(EYES_STOP_MS / 1000);
const STOP_NOTE = '<p class="gz-note">Щоб зупинити, заплющ очі на ' + STOP_SEC + ' секунди</p>';
let stopNote = STOP_NOTE;      // порожній, якщо «стоп очима» вимкнено в налаштуваннях
const say = (el, html) => { el.innerHTML = '<div class="gz-msg">' + html + stopNote + '</div>'; };

// ── 1. Гейт «обличчя в кадрі» ───────────────────────────────────────────────
// Не починаємо калібрування, доки модель реально не бачить обличчя й зіниці:
// інакше вся процедура марна, а людина дізнається про це аж наприкінці.
export async function faceGate(ov, { timeoutMs = 25000, needMs = 1200, cancelled = () => false, readFace = positions } = {}) {
  const t0 = performance.now();
  let okSince = null;
  document.body.classList.add('calibrating');
  ov.classList.add('gz-gate');
  const leave = (ok) => { document.body.classList.remove('calibrating'); ov.classList.remove('gz-gate'); return ok; };
  try { wg().showVideoPreview(true); } catch { /* ok */ }
  while (performance.now() - t0 < timeoutMs) {
    if (cancelled()) break;
    const pos = readFace();
    // Достатньо, щоб модель бачила ОБЛИЧЧЯ (468 точок). Зіниці (478, iris-модель) бажані,
    // але не обов'язкові: без них калібрування працює за запасним таймером,
    // а градуси в звіті просто не рахуються. Інакше на частині машин гейт ніколи не пройде.
    const ok = !!pos && pos.length >= 468;
    if (ok) {
      if (okSince == null) okSince = performance.now();
      const held = performance.now() - okSince;
      say(ov, '<h2>Бачу обличчя</h2><p>Сиди рівно, дивись у камеру.</p><p>Починаємо за '
        + Math.max(0, Math.ceil((needMs - held) / 1000)) + '…</p>');
      if (held >= needMs) return leave(true);
    } else {
      okSince = null;
      say(ov, '<h2>Шукаю обличчя…</h2><p>Сядь навпроти камери, щоб обличчя було в кадрі.</p>'
        + '<p>Світло має падати на обличчя, а не бути позаду.</p>');
    }
    await wait(150);
  }
  return leave(false);
}

// ── 2. Переміщення цілі й збір зразків ───────────────────────────────────────
const MIN_SHOW_MS = 700, SETTLE_MS = 450, SAMPLES = 20, SAMPLE_MS = 50, MAX_POINT_MS = 12000;
const SACCADE_MIN = 0.025, SACCADE_WAIT_MS = 3000;
// Точка вважається проблемною, якщо зібрала мало зразків або зіниця «плавала».
const SUSPECT_SAMPLES = SAMPLES * 0.6, SUSPECT_SPREAD = 0.02, MAX_RETRY = 4;

function placeDot(dot, x, y) {
  dot.style.left = x + 'px';
  dot.style.top = y + 'px';
}

async function moveDot(dot, from, to, readFace, cancelled) {
  if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    placeDot(dot, ...to);
    return true;
  }
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const duration = Math.min(1700, Math.max(550, distance * 2.3));
  const step = createTargetMotion(from, to, duration);
  const start = performance.now();
  while (!cancelled() && performance.now() - start < MAX_POINT_MS) {
    // shortcut: без надійної моделі координат перевіряємо сигнал камери; підтвердження стеження потребує окремої моделі.
    const { x, y, done } = step(performance.now(), !!readFace());
    placeDot(dot, x, y);
    if (done) return true;
    await wait(16);
  }
  return false;
}

async function collectPoint(dot, x, y, prevOff, readFace, cancelled) {
  const fix = createFixationDetector();
  const start = performance.now();
  let faceSince = null, recorded = null;
  let got = 0, moved = !prevOff, sx = 0, sy = 0, sxx = 0, syy = 0, n = 0;
  while (got < SAMPLES) {
    const now = performance.now();
    if (cancelled() || now - start > MAX_POINT_MS) break;
    const face = readFace();
    const off = irisOffset(face);
    let ok = false;
    if (!face) { faceSince = null; fix.reset(); }
    else if (off) {
      if (!moved) {
        moved = Math.hypot(off[0] - prevOff[0], off[1] - prevOff[1]) >= SACCADE_MIN
          || now - start > SACCADE_WAIT_MS;
      }
      if (!moved) fix.reset();
      const r = fix.update(off[0], off[1], now);
      ok = moved && now - start > MIN_SHOW_MS && r.stableFor >= SETTLE_MS;
    } else {
      faceSince ??= now;
      ok = now - faceSince >= MIN_SHOW_MS;
    }
    dot.classList.toggle('gz-settled', !!ok);
    if (ok && face !== recorded) {
      recorded = face;
      if (off) { sx += off[0]; sy += off[1]; sxx += off[0] * off[0]; syy += off[1] * off[1]; n++; }
      wg().recordScreenPosition(x, y, 'click');
      got++;
      dot.style.transform = 'translate(-50%,-50%) scale(' + (1 - 0.6 * got / SAMPLES).toFixed(3) + ')';
    }
    await wait(SAMPLE_MS);
  }
  dot.classList.remove('gz-settled');
  dot.style.transform = '';
  const vx = n > 1 ? Math.max(0, sxx / n - Math.pow(sx / n, 2)) : 0;
  const vy = n > 1 ? Math.max(0, syy / n - Math.pow(sy / n, 2)) : 0;
  return { off: n ? [sx / n, sy / n] : null, samples: got, spread: n > 1 ? Math.sqrt(vx + vy) : null };
}

// ── 3. Вимірювання якості в одній точці ─────────────────────────────────────
// accuracy — середнє відхилення від цілі; precision — RMS між сусідніми семплами.
// Відбір за ЧАСОМ, а не за «стабільністю» прогнозу: погляд з вебкамери тремтить на десятки
// й сотні пікселів, тож умова «прогноз нерухомий» не виконується ніколи, і перевірка зависала.
// Лічильник часу йде лише поки камера бачить обличчя з розплющеними очима.
const VAL_SETTLE_MS = 900, VAL_SAMPLE_MS = 1300, VAL_MIN_SAMPLES = 6;
async function measurePoint(dot, x, y, readFace, cancelled, onGaze) {
  const pts = [];
  let expected = 0, faceMs = 0, prevT = performance.now();
  const start = prevT;
  while (!cancelled() && performance.now() - start < MAX_POINT_MS) {
    const face = readFace();
    const p = face ? await wg().getCurrentPrediction() : null;
    const now = performance.now();
    const valid = !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (face) faceMs += Math.min(100, now - prevT);
    prevT = now;
    if (valid && onGaze) onGaze(p.x, p.y);
    const sampling = faceMs >= VAL_SETTLE_MS;      // перші 0,9 с — час перевести погляд на точку
    dot.classList.toggle('gz-confirmed', sampling);
    if (sampling) {
      expected++;
      if (valid) pts.push([p.x, p.y]);
    }
    if (faceMs >= VAL_SETTLE_MS + VAL_SAMPLE_MS) break;
    await wait(SAMPLE_MS);
  }
  dot.classList.remove('gz-confirmed');
  if (pts.length < VAL_MIN_SAMPLES) return null;
  const errs = pts.map(q => Math.hypot(q[0] - x, q[1] - y));
  const accuracyPx = errs.reduce((m, v) => m + v, 0) / errs.length;
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
  let cancel = false, byEyes = false, lastFace = null, lastFrameAt = -Infinity;
  let regression, previousRegression, accepted = false;
  const cancelled = () => cancel;
  // reason: 'eyes' — людина сама зупинила калібрування, заплющивши очі на 3 с; 'manual' — Esc або кнопка.
  const CANCELLED = { ok: false, cancelled: true, get reason() { return byEyes ? 'eyes' : 'manual'; }, error: 'Калібрування скасовано' };
  const NO_SIGNAL = { ok: false, error: 'Камера втратила погляд. Перевірте кадр і освітлення та спробуйте ще раз.' };
  const readFace = () => {
    const face = positions();
    const now = performance.now();
    if (face !== lastFace) { lastFace = face; lastFrameAt = now; }
    return face?.length >= 468 && now - lastFrameAt < 500 && !eyes.closed && !document.hidden ? face : null;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { cancel = true; e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey, true);
  const stopCancel = cancelButton(ov, () => { cancel = true; });
  const eyesStop = o.eyesStop !== false;
  stopNote = eyesStop ? STOP_NOTE : '';
  const stopEyes = eyesStop
    ? watchEyesStop(ov, () => { byEyes = true; cancel = true; }, { ms: o.eyesStopMs, sound: o.sound !== false })
    : () => {};

  try {
    status('Шукаю обличчя…');
    const faceOk = await faceGate(ov, { cancelled, readFace });
    if (cancel) return CANCELLED;
    if (!faceOk) {
      return { ok: false, error: 'Не бачу обличчя в кадрі. Перевірте камеру та освітлення.' };
    }
    try { g.showVideoPreview(false); } catch { /* ok */ }
    // Keep the previous model available if the new calibration is cancelled or fails.
    regression = g.getRegression();
    previousRegression = regression[0];
    regression[0] = new previousRegression.constructor();

    const W = innerWidth, H = innerHeight;
    const top = Math.min(H * 0.27, Math.max(80, H * 0.13));
    const calPoints = snakeOrder([W * 0.08, W * 0.5, W * 0.92], [top, H * 0.5, H - top]);
    const resized = () => innerWidth !== W || innerHeight !== H;
    const stopped = () => cancel || resized();
    const interrupted = () => cancel ? CANCELLED : resized()
      ? { ok: false, error: 'Розмір екрана змінився. Запустіть калібрування ще раз.' }
      : NO_SIGNAL;
    ov.classList.add('gz-clear');
    const valCount = 5;
    ov.innerHTML = '<div class="gz-top"><span class="gz-stage"></span><span class="gz-pips">'
      + '<i></i>'.repeat(calPoints.length) + '<i class="gz-gap"></i>' + '<i></i>'.repeat(valCount - 1)
      + '</span>' + (eyesStop ? '<span class="gz-tip">Стоп: заплющ очі на ' + STOP_SEC + ' с</span>' : '') + '</div><div class="gz-bar"></div>';
    const bar = ov.querySelector('.gz-bar');
    const stage = ov.querySelector('.gz-stage');
    const pips = [...ov.querySelectorAll('.gz-pips i')];
    const pip = (i, cls) => { pips[i].className = cls + (i === calPoints.length ? ' gz-gap' : ''); };
    const dot = document.createElement('div');
    dot.className = 'gz-dot';
    dot.setAttribute('aria-hidden', 'true');
    ov.appendChild(dot);
    let prevOff = null, current = null;
    const moveTo = async (target) => {
      if (!await moveDot(dot, current, target, readFace, stopped)) return false;
      current = target;
      return !stopped();
    };
    const collectAt = async (target) => {
      if (!await moveTo(target)) return null;
      const r = await collectPoint(dot, ...target, prevOff, readFace, stopped);
      if (r.off) prevOff = r.off;
      return stopped() ? null : r;
    };
    const stats = [];
    for (let i = 0; i < calPoints.length; i++) {
      stage.textContent = 'Калібрування ' + (i + 1) + ' / ' + calPoints.length;
      bar.textContent = 'Стеж за кружечком і затримай погляд, коли він зупиниться';
      status('Калібрування ' + (i + 1) + '/' + calPoints.length);
      pip(i, 'now');
      const r = await collectAt(calPoints[i]);
      if (!r) return interrupted();
      pip(i, r.samples < SAMPLES * 0.5 ? 'miss' : 'done');
      stats.push({ target: calPoints[i], ...r });
    }
    const thin = stats.filter(s => s.samples < SAMPLES * 0.5).length;

    // Перезнімаємо ПРОБЛЕМНІ точки: мало зразків (кліпнув, відвів погляд) або
    // великий розкид зіниці (погляд «плавав»). WebGazer не вміє видалити старі
    // зразки, тож нові додаються в тій самій ділянці екрана й розбавляють шум.
    const suspects = stats
      .filter(s => s.samples < SUSPECT_SAMPLES || (s.spread != null && s.spread > SUSPECT_SPREAD))
      .slice(0, MAX_RETRY);
    for (let i = 0; i < suspects.length; i++) {
      stage.textContent = 'Уточнення ' + (i + 1) + ' / ' + suspects.length;
      bar.textContent = 'Ще раз подивись на кружечок — уточнюємо цю точку';
      status('Уточнення ' + (i + 1) + '/' + suspects.length);
      const at = stats.indexOf(suspects[i]);
      pip(at, 'now');
      const r = await collectAt(suspects[i].target);
      if (!r) return interrupted();
      suspects[i].samples += r.samples;
      pip(at, suspects[i].samples < SAMPLES * 0.5 ? 'miss' : 'done');
    }
    if (stats.some(s => s.samples < SAMPLES * 0.5)) return NO_SIGNAL;

    // Валідація на ОКРЕМИХ точках (їх не було серед калібрувальних).
    const vpFrac = [[0.78, 0.73], [0.22, 0.73], [0.48, 0.6], [0.22, 0.3], [0.78, 0.3]];
    dot.classList.add('gz-val');
    // Під час перевірки показуємо, куди модель «бачить» погляд: і людині, і помічнику
    // одразу видно, чи калібрування вдалося, а не лише число наприкінці.
    const gaze = document.createElement('div');
    gaze.className = 'gz-gaze';
    gaze.setAttribute('aria-hidden', 'true');
    gaze.hidden = true;
    ov.appendChild(gaze);
    let mx = null, my = null;
    const onGaze = (px, py) => {
      mx = mx == null ? px : mx * 0.7 + px * 0.3;
      my = my == null ? py : my * 0.7 + py * 0.3;
      gaze.hidden = false;
      gaze.style.transform = 'translate(' + Math.max(0, Math.min(W, mx)).toFixed(1) + 'px,' + Math.max(0, Math.min(H, my)).toFixed(1) + 'px)';
    };
    const points = [];
    let feedback = '';
    for (let i = 0; i < vpFrac.length; i++) {
      status('Перевірка ' + (i + 1) + '/' + vpFrac.length);
      stage.textContent = 'Перевірка ' + (i + 1) + ' / ' + vpFrac.length;
      bar.innerHTML = 'Дивись на синій кружечок. <b>Жовте кільце</b> показує, куди, за оцінкою камери, ти дивишся' + feedback;
      pip(calPoints.length + i, 'now');
      const target = [vpFrac[i][0] * W, vpFrac[i][1] * H];
      if (!await moveTo(target)) return interrupted();
      const point = await measurePoint(dot, ...target, readFace, stopped, onGaze);
      if (stopped()) return interrupted();
      // Одна невдала точка (кліпання, відвів погляд) не скасовує все калібрування.
      if (point) points.push(point);
      pip(calPoints.length + i, point ? 'done' : 'miss');
      feedback = point ? ' · попередня точка: промах ≈ ' + Math.round(point.accuracyPx) + ' px' : ' · попередню точку не вдалося виміряти';
    }
    if (!points.length) {
      return { ok: false, error: 'Не вдалося виміряти точність: камера не бачила очей на синіх точках. Додайте світла на обличчя і спробуйте ще раз.' };
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
    accepted = report.ok;
    return report;
  } finally {
    if (!accepted && previousRegression) regression[0] = previousRegression;
    document.removeEventListener('keydown', onKey, true);
    stopCancel();
    stopEyes();
    document.body.classList.remove('calibrating');
    ov.remove();
    try { wg().showVideoPreview(true); } catch { /* ok */ }
  }
}

export const lastReport = () => {
  try { return JSON.parse(localStorage.getItem('eyeflow.calibration') || 'null'); } catch { return null; }
};
