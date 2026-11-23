// Збережені калібрування погляду («профілі»).
//
// WebGazer сам записує модель у сховище лише у власному обробнику кліків миші, а ми його вимикаємо
// (кліки помічника не мають псувати модель). Тож без цього модуля калібрування зникало після
// кожного перезавантаження сторінки. Тут ми зберігаємо зразки моделі самі, в IndexedDB:
//   'last'           — останнє вдале калібрування, відновлюється автоматично при запуску;
//   'slot1'…'slot4'  — іменовані профілі: інше місце, освітлення, окуляри, інша людина.
//
// Запис складається з двох частин, щоб список профілів не тягнув мегабайти зразків:
//   meta    { key, name, savedAt, count, screen:{w,h}, snap, report }
//   samples [{ pos:[x,y], type, eyes:{ left, right } }]  — латки очей, з яких ridge-регресія вчиться.
const DB = 'eyeflow-calibration';
const META = 'meta', SAMPLES = 'samples';
export const SLOTS = [1, 2, 3, 4];
export const slotKey = (n) => 'slot' + n;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'key' });
      req.result.createObjectStore(SAMPLES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Одна транзакція над обома сховищами: профіль або записаний повністю, або ніяк.
async function run(mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([META, SAMPLES], mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Сховище недоступне'));
      work(tx.objectStore(META), tx.objectStore(SAMPLES), (v) => { result = v; });
    });
  } finally { db.close(); }
}

const regression = () => window.webgazer?.getRegression?.()?.[0];

// З ока беремо пікселі латки та прості числові поля (розміри, положення); решту WebGazer не читає.
function packEye(eye) {
  const out = { patch: { data: new Uint8ClampedArray(eye.patch.data) } };
  for (const [k, v] of Object.entries(eye)) if (typeof v === 'number') out[k] = v;
  return out;
}

export function snapshot() {
  const data = regression()?.getData?.() || [];
  return data.filter(d => d?.eyes?.left?.patch && d.eyes.right?.patch).map(d => ({
    pos: [d.screenPos[0], d.screenPos[1]], type: d.type,
    eyes: { left: packEye(d.eyes.left), right: packEye(d.eyes.right) },
  }));
}

// Короткий звіт для списку профілів (без масиву точок він не потрібен дрейфу й «магніту»).
const slimReport = (r) => r ? {
  accuracyDeg: r.accuracyDeg, accuracyPx: r.accuracyPx, worstPx: r.worstPx, worstDeg: r.worstDeg,
  precisionPx: r.precisionPx, precisionDeg: r.precisionDeg, validPct: r.validPct,
  pxPerDeg: r.pxPerDeg, distanceCm: r.distanceCm, grade: r.grade, ts: r.ts, ok: true,
} : null;

// Зберегти поточну модель погляду під ключем key. Повертає meta або null, якщо зберігати нічого.
export async function saveProfile(key, { name = '', report = null, snap = null } = {}) {
  const samples = snapshot();
  if (!samples.length) return null;
  const meta = {
    key, name, savedAt: Date.now(), count: samples.length,
    screen: { w: innerWidth, h: innerHeight }, snap, report: slimReport(report),
  };
  await run('readwrite', (m, s) => { m.put(meta); s.put(samples, key); });
  return meta;
}

// { last: meta, slot1: meta, … } — лише наявні записи.
export async function listProfiles() {
  const all = await run('readonly', (m, _s, done) => { const r = m.getAll(); r.onsuccess = () => done(r.result); });
  return Object.fromEntries((all || []).map(meta => [meta.key, meta]));
}

export async function deleteProfile(key) {
  await run('readwrite', (m, s) => { m.delete(key); s.delete(key); });
}

// Чи збігається вікно з тим, у якому калібрували (координати цілей збережено в пікселях вікна).
export const sameScreen = (meta) => !!meta?.screen
  && Math.abs(meta.screen.w - innerWidth) <= innerWidth * 0.02
  && Math.abs(meta.screen.h - innerHeight) <= innerHeight * 0.02;

// Завантажити профіль у WebGazer замість поточної моделі. Повертає meta або null.
// Якщо вікно тепер іншого розміру, цілі пропорційно переносимо: це наближення, тож точність буде гіршою.
export async function loadProfile(key) {
  const reg = regression();
  if (!reg) return null;
  const rec = await run('readonly', (m, s, done) => {
    const out = {};
    m.get(key).onsuccess = (e) => { out.meta = e.target.result; };
    s.get(key).onsuccess = (e) => { out.samples = e.target.result; done(out); };
  });
  if (!rec?.meta || !rec.samples?.length) return null;
  const kx = rec.meta.screen?.w ? innerWidth / rec.meta.screen.w : 1;
  const ky = rec.meta.screen?.h ? innerHeight / rec.meta.screen.h : 1;
  const fresh = new reg.constructor();
  fresh.setData(rec.samples.map(d => ({
    eyes: { left: { ...d.eyes.left, patch: { data: d.eyes.left.patch.data } }, right: { ...d.eyes.right, patch: { data: d.eyes.right.patch.data } } },
    screenPos: [d.pos[0] * kx, d.pos[1] * ky], type: d.type,
  })));
  window.webgazer.getRegression()[0] = fresh;
  return rec.meta;
}

// Підпис профілю для списків: «добра · 1.4° · 12.11, 14:20».
export function describeProfile(meta) {
  if (!meta) return 'порожньо';
  const parts = [];
  const r = meta.report;
  if (r?.grade?.label) parts.push(r.grade.label);
  if (r?.accuracyDeg != null) parts.push(r.accuracyDeg.toFixed(1) + '°');
  else if (r?.accuracyPx != null) parts.push('≈ ' + Math.round(r.accuracyPx) + ' px');
  parts.push(new Date(meta.savedAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
  if (!sameScreen(meta)) parts.push('інший розмір вікна');
  return parts.join(' · ');
}
