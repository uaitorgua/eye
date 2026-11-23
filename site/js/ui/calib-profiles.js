// Діалоги профілів калібрування: вибрати, зберегти, оновити, видалити.
// Сховище — gaze/calib-store.js. Що означає «увімкнути профіль» (магніт, статус, дрейф), вирішує сеанс:
//   openProfiles({ hasCalibration, current, apply })   — apply(key) → Promise<meta|null>
//   saveToSlot({ current })                            — current() → { report, snap } → Promise<meta|null>
import { choose } from './modal.js';
import { toast } from './dom.js';
import { SLOTS, slotKey, listProfiles, saveProfile, deleteProfile, describeProfile } from '../gaze/calib-store.js';

const NAMES = ['Вдома', 'У школі', 'Вранці', 'Увечері', 'В окулярах', 'Без окулярів', 'Інше місце'];
const title = (meta, n) => meta?.name || 'Профіль ' + n;

async function metas() {
  try { return await listProfiles(); }
  catch { toast('Сховище браузера недоступне — профілі не працюють у приватному вікні', 6000); return null; }
}

async function pickSlot(heading, subtitle, all, emptySub) {
  return choose(heading, SLOTS.map(n => {
    const meta = all[slotKey(n)];
    return { label: title(meta, n), sub: meta ? describeProfile(meta) : emptySub, icon: meta ? '🎯' : '➕', value: n };
  }), { cols: 3, subtitle });
}

async function writeSlot(n, existing, current) {
  const name = await choose('Як назвати профіль?', [
    { label: existing?.name || 'Профіль ' + n, icon: '🔖', value: existing?.name || 'Профіль ' + n },
    ...NAMES.filter(v => v !== existing?.name).map(v => ({ label: v, value: v })),
  ], { cols: 2, subtitle: 'Назва допоможе згадати, для якого місця чи умов це калібрування.' });
  if (!name) return null;
  try {
    const meta = await saveProfile(slotKey(n), { name, ...current() });
    if (!meta) { toast('Немає калібрування, яке можна зберегти'); return null; }
    toast('Збережено: «' + name + '»', 3500);
    return meta;
  } catch { toast('Не вдалося зберегти профіль: у браузері бракує місця', 6000); return null; }
}

// Зберегти поточне калібрування в обраний слот (кнопка у звіті калібрування).
export async function saveToSlot({ current }) {
  const all = await metas();
  if (!all) return null;
  const n = await pickSlot('Куди зберегти?', 'Зайнятий профіль буде замінено.', all, 'вільно');
  if (!n) return null;
  return writeSlot(n, all[slotKey(n)], current);
}

// Керування профілями. Повертає meta, якщо профіль увімкнено, інакше null.
export async function openProfiles({ hasCalibration, current, apply }) {
  for (;;) {
    const all = await metas();
    if (!all) return null;
    const n = await pickSlot('Профілі погляду', 'Окреме калібрування для кожного місця, освітлення чи людини.', all,
      hasCalibration() ? 'зберегти сюди поточне' : 'порожньо');
    if (!n) return null;
    const meta = all[slotKey(n)];
    if (!meta) {
      if (!hasCalibration()) toast('Спершу відкалібруйте погляд — тоді його можна зберегти сюди', 5000);
      else await writeSlot(n, null, current);
      continue;
    }
    const action = await choose(title(meta, n), [
      { label: 'Увімкнути', icon: '✓', value: 'use', cls: 'primary', sub: 'Працювати з цим калібруванням' },
      ...(hasCalibration() ? [{ label: 'Оновити', icon: '💾', value: 'save', sub: 'Записати сюди поточне' }] : []),
      { label: 'Видалити', icon: '🗑', value: 'del', cls: 'danger' },
    ], { cols: 2, subtitle: describeProfile(meta) });
    if (action === 'use') {
      const used = await apply(slotKey(n));
      if (used) return used;
      toast('Не вдалося відкрити цей профіль', 4000);
    } else if (action === 'save') {
      await writeSlot(n, meta, current);
    } else if (action === 'del') {
      const sure = await choose('Видалити «' + title(meta, n) + '»?', [{ label: 'Так, видалити', icon: '🗑', value: true, cls: 'danger' }], { cols: 2 });
      if (sure) { try { await deleteProfile(slotKey(n)); toast('Профіль видалено'); } catch { toast('Не вдалося видалити профіль'); } }
    }
  }
}
