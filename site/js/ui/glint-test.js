// «Відблиск в оці (експеримент)»: живий показ очей з камери, знайденого відблиску і вимірювання
// за критерієм з docs/man-notes.md 5.2 — тремтіння вектора «відблиск → центр райдужки» < 0,3 px.
// Для дорослого / дослідника. На керування погляд поки НЕ впливає.
import { h, toast } from './dom.js';
import { openModal, tile } from './modal.js';
import { store, updateSettings } from '../core/store.js';
import { sampleGlints, requestHd, exposureLockSupported, setExposureLocked } from '../gaze/glint-live.js';
import { jitterStats, JITTER_LIMIT_PX } from '../gaze/glint.js';

const KEY_RUNS = 'eyeflow.glintRuns';
const KEY_BLINK = 'eyeflow.glintCrossBlink';
const MEASURE_MS = 10000;
// Хрест, що блимає: 0,5 с увімкнено / 0,5 с вимкнено — один спалах на секунду, утричі нижче межі WCAG 2.3.1.
// Кадри камери перші SETTLE_MS після перемикання не рахуємо: камера показує світло із запізненням.
const BLINK_MS = 500, SETTLE_MS = 230;
const STAGE_ZOOM = 112;
const BLINK_WARN = 'Хрест блимає раз на секунду. Якщо мерехтіння неприємне — вимкніть блимання або закрийте.';
const ZOOM = 160;            // розмір збільшеного вікна ока, px
const SIDE = { left: 'ліве', right: 'праве' };

const loadRuns = () => { try { return JSON.parse(localStorage.getItem(KEY_RUNS)) || []; } catch { return []; } };
const saveRuns = (r) => { try { localStorage.setItem(KEY_RUNS, JSON.stringify(r.slice(-20))); } catch { /* ok */ } };
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const loadBlink = () => { try { return localStorage.getItem(KEY_BLINK) !== '0'; } catch { return true; } };
const saveBlink = (on) => { try { localStorage.setItem(KEY_BLINK, on ? '1' : '0'); } catch { /* ok */ } };

const REASONS = {
  camera: 'Камера ще не працює. Увімкніть режим «погляд» або «голова».',
  face: 'Не бачу обличчя або очей.',
  'no-iris': 'Трекер не віддає точки райдужки (468–477). Потрібен FaceLandmarker — див. man-notes 5.2.',
};

export function openGlintTest() {
  const m = openModal({ title: '✨ Відблиск в оці (експеримент)', cls: 'glint-test' });
  let exposureLocked = false, measuring = null, runs = loadRuns(), stage = null;
  const recent = [];        // [{ t, irisSeen, glintSeen }] за 2 с — частка кадрів з відблиском

  const views = {};
  const eyesRow = h('div', { class: 'glint-eyes' }, ['right', 'left'].map((side) => {
    const c = h('canvas', { width: ZOOM, height: ZOOM, class: 'glint-eye', 'aria-hidden': 'true' });
    const cap = h('div', { class: 'glint-cap' }, '—');
    views[side] = { c, ctx: c.getContext('2d'), cap };
    return h('figure', {}, c, h('figcaption', {}, 'Око ' + SIDE[side] + ' людини', h('br'), cap));
  }));
  const status = h('p', { class: 'glint-status', role: 'status' }, 'Шукаю очі…');
  const log = h('div', { class: 'glint-log' });

  const frameTile = tile(frameLabel(), () => { updateSettings({ lightFrame: !store.settings.lightFrame }); frameTile.querySelector('.tile-label').textContent = frameLabel(); }, { icon: '💡' });
  const measureTile = tile('Виміряти 10 с', () => startMeasure(), { icon: '⏱' });
  const closeTile = tile('Закрити', () => m.close(), { icon: '✓', cls: 'ok' });
  closeTile.setAttribute('data-esc', '');        // Esc закриває панель
  const crossTile = tile('Білий хрест', () => openStage(), { icon: '✚', sub: 'відблиск екрана, а не вікна' });
  // Зберігається в налаштуваннях: після перезавантаження камера знову стартує в HD.
  const hdLabel = () => store.settings.cameraHd ? 'Камера HD: так' : 'Камера HD: ні';
  const hdTile = tile(hdLabel(), async () => {
    const on = !store.settings.cameraHd;
    updateSettings({ cameraHd: on });
    hdTile.querySelector('.tile-label').textContent = hdLabel();
    const ok = await requestHd(on);
    toast(!ok ? 'Камера не змінила роздільність' : on
      ? 'Камера 1920×1080 (запам’ятовано). Після зміни роздільності варто заново відкалібрувати погляд'
      : 'Камера 640×480. Після зміни роздільності варто заново відкалібрувати погляд', 6000);
  }, { icon: '📷' });
  const expTile = exposureLockSupported() ? tile('Експозиція: авто', async () => {
    if (await setExposureLocked(!exposureLocked)) exposureLocked = !exposureLocked;
    else toast('Камера не дозволила змінити експозицію');
    expTile.querySelector('.tile-label').textContent = exposureLocked ? 'Експозиція: фіксована' : 'Експозиція: авто';
  }, { icon: '☀' }) : null;

  m.body.append(
    h('p', { class: 'muted glint-help' }, 'Яскраве джерело (світла рамка, білий екран) дає маленьку світлу пляму на оці. ',
      'Тут видно, чи знаходить її програма і наскільки вона стабільна. На керування це поки не впливає.'),
    eyesRow, status,
    h('div', { class: 'glint-actions' }, measureTile, crossTile, frameTile, hdTile, expTile,
      closeTile),
    log);
  renderLog();

  let lastKey = '';
  const loop = () => {
    if (!m.el.isConnected) { if (measuring) stopMeasure(); if (stage) closeStage(); return; }
    requestAnimationFrame(loop);
    // Відлік іде за годинником, а не за кадрами: якщо трекер завис, вимірювання все одно закінчиться.
    if (measuring) {
      const left = Math.max(0, MEASURE_MS - (performance.now() - measuring.t0));
      measuring.count.textContent = Math.ceil(left / 1000);
      if (!left) return finishMeasure();
    }
    // Хрест, що блимає: фаза — за годинником; той самий цикл вмикає й вимикає хрест на екрані.
    let cross = null;
    if (stage?.blink) {
      const t = performance.now() - stage.t0;
      cross = { phase: Math.floor(t / BLINK_MS) % 2 ? 'off' : 'on', settled: t % BLINK_MS > SETTLE_MS };
      stage.el.classList.toggle('dark', cross.phase === 'off');
    }
    const s = sampleGlints(cross);
    const out = stage ? stage.status : status;
    if (!s.ok) { out.textContent = REASONS[s.reason] || REASONS.face; for (const v of Object.values(views)) v.cap.textContent = '—'; return; }
    // У режимі блимання рахуються лише кадри «хрест увімкнено» після затримки камери.
    if (s.phase && s.phase !== 'on') return;
    // Той самий кадр камери двічі не рахуємо (rAF частіший за камеру).
    const key = s.eyes.map(e => e.iris.x + ',' + e.iris.y).join('|');
    const fresh = key !== lastKey; lastKey = key;
    const now = performance.now();
    if (fresh) {
      recent.push({ t: now, n: s.eyes.length, g: s.eyes.filter(e => e.glint).length });
      while (recent.length && now - recent[0].t > 2000) recent.shift();
    }
    for (const e of s.eyes) { draw(views[e.side], e); if (stage) draw(stage.views[e.side], e); }
    const seen = recent.reduce((a, r) => a + r.n, 0), found = recent.reduce((a, r) => a + r.g, 0);
    const d = s.eyes[0] ? (2 * s.eyes[0].iris.r).toFixed(1) : '—';
    const pct = seen ? Math.round(100 * found / seen) : 0;
    status.textContent = `Камера ${s.w}×${s.h} · райдужка ≈${d} px · відблиск знайдено в ${pct}% кадрів`;
    if (stage) {
      const g = s.eyes.find(e => e.glint)?.glint;
      // fill: відбитий хрест займає меншу частку своєї рамки (≈0,3–0,5), ніж кругла цятка чи вікно (0,8–1).
      stage.status.textContent = `${stage.blink ? 'Новий відблиск (хрест мінус фон)' : 'Відблиск'}: ${pct}% кадрів` +
        (g ? ` · форма ${g.fill < 0.6 ? 'схожа на хрест' : 'кругла / суцільна'} (${fmt(g.fill)})` : '') +
        ` · райдужка ≈${d} px`;
    }
    if (measuring && fresh) {
      measuring.last = { w: s.w, h: s.h, irisPx: +(2 * s.eyes[0].iris.r).toFixed(1) };
      for (const e of s.eyes) {
        const b = measuring.eyes[e.side];
        b.frames++;
        if (e.glint) b.samples.push({ dx: e.glint.dx, dy: e.glint.dy });
      }
    }
  };
  requestAnimationFrame(loop);

  function draw(v, e) {
    const { ctx } = v, { crop, iris, glint } = e;
    const Z = v.c.width;
    const k = Z / Math.max(crop.w, crop.h);
    const tmp = draw.tmp ||= document.createElement('canvas');
    tmp.width = crop.w; tmp.height = crop.h;
    tmp.getContext('2d').putImageData(crop.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, Z, Z);
    ctx.drawImage(tmp, 0, 0, crop.w * k, crop.h * k);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(90,169,255,.9)';
    ctx.beginPath(); ctx.arc((iris.x - crop.x0) * k, (iris.y - crop.y0) * k, iris.r * k, 0, 2 * Math.PI); ctx.stroke();
    if (glint) {
      const gx = (glint.x - crop.x0) * k, gy = (glint.y - crop.y0) * k;
      ctx.strokeStyle = '#ffcc00';
      ctx.beginPath(); ctx.moveTo(gx - 8, gy); ctx.lineTo(gx + 8, gy); ctx.moveTo(gx, gy - 8); ctx.lineTo(gx, gy + 8); ctx.stroke();
      v.cap.textContent = `вектор ${fmt(glint.dx)}, ${fmt(glint.dy)} px · контраст ${glint.contrast}`;
    } else v.cap.textContent = 'відблиску немає';
  }

  function startMeasure() {
    if (measuring) return;
    if (stage) {
      // На сцені з хрестом: дивитися в центр хреста, відлік — у рядку під станом.
      const count = h('span', { class: 'glint-count' }, '10');
      stage.count.replaceChildren('Дивіться в центр хреста, не рухайте головою · ', count, ' с');
      stage.measureBtn.disabled = true;
      measuring = { t0: performance.now(), overlay: null, count, onKey: null, last: null, eyes: { left: { frames: 0, samples: [] }, right: { frames: 0, samples: [] } } };
      return;
    }
    // Нерухома точка в центрі екрана: дивитися на неї 10 с, не рухаючи головою.
    const count = h('span', { class: 'glint-count' }, '10');
    const overlay = h('div', { class: 'glint-measure', 'data-gaze-block': '', role: 'dialog', 'aria-label': 'Вимірювання відблиску' },
      h('div', { class: 'glint-target' }), h('p', {}, 'Дивіться на точку і не рухайте головою · ', count),
      h('p', { class: 'muted' }, 'Скасувати — Esc'));
    document.body.appendChild(overlay);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopMeasure(); } };
    document.addEventListener('keydown', onKey, true);
    measuring = { t0: performance.now(), overlay, count, onKey, last: null, eyes: { left: { frames: 0, samples: [] }, right: { frames: 0, samples: [] } } };
  }

  function stopMeasure() {
    measuring.overlay?.remove();
    if (measuring.onKey) document.removeEventListener('keydown', measuring.onKey, true);
    if (stage) { stage.count.textContent = ''; stage.measureBtn.disabled = false; }
    const done = measuring; measuring = null;
    return done;
  }

  function finishMeasure() {
    const done = stopMeasure();
    const run = {
      at: new Date().toISOString(), w: done.last?.w ?? null, h: done.last?.h ?? null,
      lightFrame: !!store.settings.lightFrame && !stage, cross: stage ? (stage.blink ? 'blink' : 'steady') : null,
      exposureLocked, irisPx: done.last?.irisPx ?? null,
      eyes: Object.fromEntries(Object.entries(done.eyes).map(([side, b]) => {
        const j = jitterStats(b.samples);
        return [side, { frames: b.frames, found: b.samples.length, sd: Number.isFinite(j.sd) ? +j.sd.toFixed(3) : null, pass: j.pass }];
      })),
    };
    runs.push(run); saveRuns(runs); renderLog();
    const ok = Object.values(run.eyes).some(e => e.pass);
    toast(ok ? 'Тремтіння менше за ' + JITTER_LIMIT_PX + ' px — ознаку варто пробувати в регресії' : 'Тремтіння більше за поріг або відблиск не знайдено', 7000);
  }

  // ── Сцена «Білий хрест» ──────────────────────────────────────────────────────────────────────────
  // Чорний екран, великий білий хрест; людина дивиться в його центр. Кнопки й підписи тьмяні, щоб світив
  // лише хрест. Сцена перекриває панель (data-gaze-block: погляд натискає лише її кнопки).
  function openStage() {
    if (stage) return;
    if (measuring) stopMeasure();
    const blink = loadBlink();
    const sviews = {};
    const eyes = h('div', { class: 'glint-stage-eyes' }, ['right', 'left'].map((side) => {
      const c = h('canvas', { width: STAGE_ZOOM, height: STAGE_ZOOM, 'aria-hidden': 'true' });
      sviews[side] = { c, ctx: c.getContext('2d'), cap: h('span') };
      return c;
    }));
    const statusEl = h('p', { class: 'glint-stage-status', role: 'status' }, 'Шукаю очі…');
    const count = h('p', { class: 'glint-stage-count', 'aria-live': 'polite' });
    const blinkBtn = h('button', { class: 'glint-stage-btn', 'data-dwell': '', 'aria-pressed': String(blink) }, blinkLabel(blink));
    const measureBtn = h('button', { class: 'glint-stage-btn', 'data-dwell': '' }, 'Виміряти 10 с');
    const closeBtn = h('button', { class: 'glint-stage-btn', 'data-dwell': '' }, 'Закрити · Esc');
    const warn = h('p', { class: 'glint-stage-warn' }, blink ? BLINK_WARN : '');
    const el = h('div', { class: 'glint-stage' + (blink ? ' blink' : ''), 'data-gaze-block': '', role: 'dialog', 'aria-modal': 'true',
      'aria-label': 'Білий хрест: відблиск екрана в оці' },
      h('div', { class: 'glint-cross', 'aria-hidden': 'true' }, h('i', { class: 'arm-h' }), h('i', { class: 'arm-v' }), h('b', { class: 'glint-cross-dot' })),
      h('div', { class: 'glint-stage-hud' }, eyes, statusEl, count),
      h('div', { class: 'glint-stage-bar' }, warn, blinkBtn, measureBtn, closeBtn));
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      if (measuring) stopMeasure(); else closeStage();
    };
    blinkBtn.addEventListener('dwell', () => setBlink(!stage.blink));
    measureBtn.addEventListener('dwell', () => startMeasure());
    closeBtn.addEventListener('dwell', () => closeStage());
    document.addEventListener('keydown', onKey, true);
    m.el.inert = true;                     // інакше пастка фокусу модалки забирала б фокус зі сцени
    document.body.appendChild(el);
    stage = { el, blink, t0: performance.now(), views: sviews, status: statusEl, count, warn, blinkBtn, measureBtn, onKey };
    recent.length = 0;
    measureBtn.focus();
  }

  function setBlink(on) {
    if (measuring) stopMeasure();
    stage.blink = on; saveBlink(on);
    stage.t0 = performance.now(); recent.length = 0;
    stage.el.classList.toggle('blink', on);
    stage.el.classList.remove('dark');
    stage.blinkBtn.textContent = blinkLabel(on);
    stage.blinkBtn.setAttribute('aria-pressed', String(on));
    stage.warn.textContent = on ? BLINK_WARN : '';
  }

  function closeStage() {
    if (!stage) return;
    if (measuring) stopMeasure();
    document.removeEventListener('keydown', stage.onKey, true);
    stage.el.remove();
    stage = null; recent.length = 0;
    m.el.inert = false;
    if (crossTile.isConnected) crossTile.focus();
  }

  function renderLog() {
    if (!runs.length) { log.replaceChildren(h('p', { class: 'muted' }, 'Вимірювань ще немає. Результати зберігаються в цьому браузері.')); return; }
    log.replaceChildren(h('table', {},
      h('thead', {}, h('tr', {}, ['Коли', 'Камера', 'Світло', 'Експоз.', 'Праве: знайдено / σ', 'Ліве: знайдено / σ'].map(t => h('th', {}, t)))),
      h('tbody', {}, runs.slice(-6).reverse().map(r => h('tr', {},
        h('td', {}, new Date(r.at).toLocaleTimeString()), h('td', {}, r.w + '×' + r.h),
        h('td', {}, r.cross === 'blink' ? 'хрест, блимає' : r.cross === 'steady' ? 'хрест' : r.lightFrame ? 'рамка' : '—'),
        h('td', {}, r.exposureLocked ? 'фікс.' : 'авто'),
        ['right', 'left'].map(side => { const e = r.eyes[side]; return h('td', { class: e?.pass ? 'pass' : '' },
          e ? `${e.frames ? Math.round(100 * e.found / e.frames) : 0}% / ${fmt(e.sd, 2)} px` : '—'); }))))));
  }
}

function blinkLabel(on) { return on ? 'Блимає: так' : 'Блимає: ні'; }
function frameLabel() { return store.settings.lightFrame ? 'Світла рамка: так' : 'Світла рамка: ні'; }
